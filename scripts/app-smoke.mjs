/** Verify the exact extracted user download; no accounts or model calls. */
import { readFile, writeFile, mkdtemp, mkdir, chmod, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export async function smokeApp(archive, { output } = {}) {
  const checkout = await mkdtemp(join(tmpdir(), 'Tawdheef space-تجربة-'));
  const zip = await JSZip.loadAsync(await readFile(archive));
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    assert.ok(entry.name.startsWith('tawdheef/') && !entry.name.split('/').some(part => part === '..'), 'Invalid archive path');
    const target = join(checkout, entry.name); await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await entry.async('nodebuffer'));
    if (entry.unixPermissions && (entry.unixPermissions & 0o111)) await chmod(target, 0o755);
  }
  const root = join(checkout, 'tawdheef'); const manifest = JSON.parse(await readFile(join(root, 'tawdheef-app.json'), 'utf8'));
  assert.equal(manifest.platform, process.platform); assert.equal(manifest.arch, process.arch);
  const node = join(root, 'runtime', process.platform === 'win32' ? 'node.exe' : 'bin/node');
  const reservation = createServer(); await new Promise(accept => reservation.listen(0, '127.0.0.1', accept));
  const port = reservation.address().port; await new Promise(accept => reservation.close(accept));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(APPLY_TRACKER_|GOOGLE_WORKSPACE_CLI_|MS365_MCP_|TAWDHEEF_)/i.test(key)));
  Object.assign(env, { APPLY_TRACKER_DATA: join(root, '.local'), APPLY_TRACKER_PORT: String(port) });
  async function run(args, { launcher = false } = {}) {
    let executable = node, commandArgs = args;
    if (launcher) {
      if (process.platform === 'win32') { executable = process.env.ComSpec || 'cmd.exe'; commandArgs = ['/d', '/s', '/c', '""Start Tawdheef.cmd" --no-open"']; }
      else { executable = join(root, process.platform === 'darwin' ? 'Start Tawdheef.command' : 'start-tawdheef.sh'); commandArgs = ['--no-open']; }
    }
    return new Promise((accept, reject) => {
      const child = spawn(executable, commandArgs, { cwd: root, env, shell: false, windowsHide: true, windowsVerbatimArguments: launcher && process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
      let log = ''; const timer = setTimeout(() => { child.kill(); reject(new Error('Package smoke command timed out.')); }, 60_000);
      child.stdout.on('data', chunk => { log += chunk; }); child.stderr.on('data', chunk => { log += chunk; });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); code === 0 ? accept(log) : reject(new Error(`Package command failed (${code}): ${log.slice(-4000)}`)); });
    });
  }
  let client;
  try {
    const version = (await run(['--version'])).trim(); assert.equal(version, 'v' + manifest.runtime.version);
    const started = performance.now(); await run([], { launcher: true }); const firstLaunchMs = performance.now() - started;
    const base = `http://127.0.0.1:${port}`;
    for (const path of ['/', '/api/health', '/favicon.svg', '/site.webmanifest', '/brand/app-icon-192.png', '/brands/claude-code.png']) assert.equal((await fetch(base + path)).status, 200, path);
    const boot = await (await fetch(base + '/api/bootstrap')).json(); assert.equal(boot.directories.find(item => item.id === 'uae').count, 772);
    const before = await (await fetch(base + '/api/background')).json();
    await run([], { launcher: true }); const after = await (await fetch(base + '/api/background')).json(); assert.equal(before.pid, after.pid);
    for (let pass = 0; pass < 2; pass++) await run(['scripts/agent-setup.mjs', 'both']);
    const claude = JSON.parse(await readFile(join(root, '.mcp.json'), 'utf8')); assert.equal(claude.mcpServers['apply-tracker'].command, node);
    client = new Client({ name: 'isolated-app-smoke', version: manifest.version });
    await client.connect(new StdioClientTransport({ command: node, args: [join(root, 'server/mcp.mjs')], cwd: root, env, stderr: 'pipe' }));
    const tools = await client.listTools(); assert.ok(tools.tools.some(tool => tool.name === 'get_agent_context'));
    const context = await client.callTool({ name: 'get_agent_context', arguments: {} }); assert.equal(JSON.parse(context.content.find(item => item.type === 'text').text).ok, true);
    const report = { ok: true, platform: process.platform, arch: process.arch, node: version, version: manifest.version, firstLaunchMs: Math.round(firstLaunchMs), tools: tools.tools.length,
      checks: ['exact ZIP extracted to a Unicode path with spaces', 'bundled runtime', 'platform launcher', 'prebuilt offline startup', 'one background process', 'repeat setup for both clients', 'real stdio MCP discovery and context'],
      liveAssistantCalls: false, liveAccountActions: false, osSigningVerified: false };
    if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    return report;
  } finally { await client?.close(); await run(['scripts/background.mjs', 'stop']); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), index = args.indexOf('--archive'), dirIndex = args.indexOf('--directory'), outIndex = args.indexOf('--output');
  let archive = index >= 0 ? args[index + 1] : null;
  if (dirIndex >= 0 && args[dirIndex + 1]) {
    const directory = resolve(args[dirIndex + 1]), files = (await readdir(directory)).filter(file => file.endsWith('.zip'));
    if (files.length === 1) archive = join(directory, files[0]);
  }
  if (!archive) { console.error('Use --archive APP.zip or --directory PACKAGE_FOLDER [--output NEW_REPORT.json].'); process.exitCode = 1; }
  else smokeApp(resolve(archive), { ...(outIndex >= 0 ? { output: resolve(args[outIndex + 1]) } : {}) }).then(report => console.log(JSON.stringify(report, null, 2))).catch(error => { console.error(error.stack); process.exitCode = 1; });
}
