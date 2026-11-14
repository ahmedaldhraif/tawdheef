/** Verify the exact extracted user download; no accounts or model calls. */
import { readFile, writeFile, mkdtemp, mkdir, chmod, readdir, access, realpath } from 'node:fs/promises';
import { join, dirname, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { nativeLayout, nativeCommand } from './native-package.mjs';
import { verifyDesktopSigning } from './sign-desktop.mjs';
import { isDirectInvocation } from './is-direct.mjs';

export async function smokeApp(archive, { output, requireSigned = process.env.TAWDHEEF_SIGN === 'required' } = {}) {
  const checkout = await mkdtemp(join(tmpdir(), 'Tawdheef space-تجربة-'));
  const archiveBytes = await readFile(archive);
  const archiveSha256 = createHash('sha256').update(archiveBytes).digest('hex');
  const zip = await JSZip.loadAsync(archiveBytes);
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    assert.ok((entry.name.startsWith('tawdheef/') || (process.platform === 'darwin' && entry.name.startsWith('__MACOSX/'))) && !entry.name.split('/').some(part => part === '..'), 'Invalid archive path');
    if (process.platform === 'darwin') continue;
    const target = join(checkout, entry.name); await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await entry.async('nodebuffer'));
    if (entry.unixPermissions && (entry.unixPermissions & 0o111)) await chmod(target, 0o755);
  }
  if (process.platform === 'darwin') await nativeCommand('ditto', ['-x', '-k', archive, checkout], { capture: true });
  const folder = join(checkout, 'tawdheef'), layout = nativeLayout(process.platform);
  const root = join(folder, layout.codeRoot); const manifest = JSON.parse(await readFile(join(root, 'tawdheef-app.json'), 'utf8'));
  assert.equal(manifest.platform, process.platform); assert.equal(manifest.arch, process.arch);
  const receipt = JSON.parse(await readFile(join(folder, 'signing-verification.json'), 'utf8'));
  if (requireSigned) assert.equal(receipt.signed, true, 'A required signed distribution was not produced');
  let signature = { signed: false, osSigningVerified: false };
  if (receipt.signed) signature = await verifyDesktopSigning({ folder, codeRoot: root, layout });
  const node = join(root, 'runtime', process.platform === 'win32' ? 'node.exe' : 'bin/node');
  const reservation = createServer(); await new Promise(accept => reservation.listen(0, '127.0.0.1', accept));
  const port = reservation.address().port; await new Promise(accept => reservation.close(accept));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(APPLY_TRACKER_|GOOGLE_WORKSPACE_CLI_|MS365_MCP_|TAWDHEEF_)/i.test(key)));
  const dataDir = join(checkout, 'private data'), workspace = join(dataDir, 'workspace');
  Object.assign(env, { APPLY_TRACKER_DATA: dataDir, APPLY_TRACKER_PORT: String(port), TAWDHEEF_WORKSPACE: workspace });
  const base = `http://127.0.0.1:${port}`;
  const http = async path => {
    try { return await fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(10_000) }); }
    catch (error) { throw new Error(`Exact package HTTP GET ${path} failed after launcher startup${error.cause?.code ? ` (${error.cause.code})` : ''}.`, { cause: error }); }
  };
  async function run(args, { launcher = false } = {}) {
    let executable = node, commandArgs = args;
    if (launcher) {
      executable = join(folder, layout.launcher); commandArgs = ['--no-open'];
    }
    return new Promise((accept, reject) => {
      const child = spawn(executable, commandArgs, { cwd: root, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let log = ''; const timer = setTimeout(() => { child.kill(); reject(new Error('Package smoke command timed out.')); }, 60_000);
      child.stdout.on('data', chunk => { log += chunk; }); child.stderr.on('data', chunk => { log += chunk; });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); code === 0 ? accept(log) : reject(new Error(`Package command failed (${code}): ${log.slice(-4000)}`)); });
    });
  }
  let client, failure;
  try {
    const version = (await run(['--version'])).trim(); assert.equal(version, 'v' + manifest.runtime.version);
    const started = performance.now(); await run([], { launcher: true }); const firstLaunchMs = performance.now() - started;
    for (const path of ['/', '/api/health', '/favicon.svg', '/site.webmanifest', '/brand/app-icon-192.png', '/brands/claude-code.png']) assert.equal((await http(path)).status, 200, path);
    const boot = await (await http('/api/bootstrap')).json(); assert.equal(boot.directories.find(item => item.id === 'uae').count, 772);
    assert.equal(boot.settings.connectionMode, 'native'); assert.deepEqual(boot.connections, []);
    assert.equal(boot.nativeClient.capabilities.email.status, 'unknown');
    for (const path of ['/examples/', '/ar/examples/job-search-brief/']) {
      const response = await http(path);
      assert.equal(response.status, 302); assert.equal(response.headers.get('location'), `https://www.tawdheef.com${path}`);
    }
    for (const optional of ['@azure/msal-node', '@googleapis/gmail', '@googleapis/calendar', '@microsoft/microsoft-graph-client', 'imapflow', 'nodemailer', 'tsdav']) await assert.rejects(access(join(root, 'node_modules', optional)), { code: 'ENOENT' }, `${optional} must remain outside the ordinary runtime`);
    const before = await (await http('/api/background')).json();
    await run([], { launcher: true }); const after = await (await http('/api/background')).json(); assert.equal(before.pid, after.pid);
    for (let pass = 0; pass < 2; pass++) await run(['scripts/agent-setup.mjs', 'both']);
    const claude = JSON.parse(await readFile(join(workspace, '.mcp.json'), 'utf8'));
    assert.equal(await realpath(claude.mcpServers['apply-tracker'].command), await realpath(node));
    for (const path of ['.local', '.codex', '.mcp.json', '.tawdheef-setup']) await assert.rejects(access(join(root, path)), { code: 'ENOENT' }, `${path} must remain outside the immutable app`);
    client = new Client({ name: 'isolated-app-smoke', version: manifest.version });
    await client.connect(new StdioClientTransport({ command: claude.mcpServers['apply-tracker'].command, args: claude.mcpServers['apply-tracker'].args, cwd: root, env: { ...env, ...claude.mcpServers['apply-tracker'].env }, stderr: 'pipe' }));
    const tools = await client.listTools(); assert.ok(tools.tools.some(tool => tool.name === 'get_native_client_status')); assert.ok(!tools.tools.some(tool => tool.name === 'send_application_email' || tool.name === 'get_cv'));
    const context = JSON.parse((await client.callTool({ name: 'get_agent_context', arguments: {} })).content.find(item => item.type === 'text').text); assert.equal(context.ok, true); assert.equal(context.data.mode, 'native'); assert.equal(context.data.connectionOwner, 'native-client');
    const dataPathChecks = ['explicit external private data and assistant workspace'];
    if (process.platform === 'win32') {
      await client.close(); client = null;
      await run(['scripts/background.mjs', 'stop']);
      delete env.APPLY_TRACKER_DATA; delete env.TAWDHEEF_WORKSPACE;
      env.LOCALAPPDATA = join(checkout, 'fixture local app data');
      await run([], { launcher: true });
      const defaults = await (await http('/api/agent-config')).json();
      const defaultData = join(env.LOCALAPPDATA, 'Tawdheef');
      assert.equal(await realpath(defaults.mcpServers['apply-tracker'].env.APPLY_TRACKER_DATA), await realpath(defaultData));
      const setupPreview = JSON.parse(await run(['scripts/agent-setup.mjs', 'both', '--check', '--json']));
      assert.equal(resolve(setupPreview.workspace), resolve(defaultData, 'workspace'));
      await assert.rejects(access(join(root, '.local')), { code: 'ENOENT' });
      await run(['scripts/background.mjs', 'stop']);
      dataPathChecks.push('native Windows launch and manual setup use fixture LOCALAPPDATA when no data override exists');
      const legacy = join(root, '.local'); await mkdir(legacy); await writeFile(join(legacy, 'fixture-preserved.txt'), 'existing portable data');
      await run([], { launcher: true });
      const reused = await (await http('/api/agent-config')).json();
      assert.equal(await realpath(reused.mcpServers['apply-tracker'].env.APPLY_TRACKER_DATA), await realpath(legacy));
      assert.equal(await readFile(join(legacy, 'fixture-preserved.txt'), 'utf8'), 'existing portable data');
      dataPathChecks.push('adjacent legacy portable data reused without migration');
    }
    const report = { ok: true, archive: basename(archive), sha256: archiveSha256, platform: process.platform, arch: process.arch, node: version, version: manifest.version, firstLaunchMs: Math.round(firstLaunchMs), tools: tools.tools.length,
      checks: ['exact ZIP extracted to a Unicode path with spaces', 'bundled runtime', 'native platform launcher or Linux script', 'prebuilt offline startup', 'native default without optional mail/cloud SDKs', 'one background process', 'external private data and assistant workspace', 'repeat setup for both clients', 'real stdio MCP discovery and context'],
      dataPathChecks, liveAssistantCalls: false, liveAccountActions: false, osSigningVerified: signature.osSigningVerified, signing: signature };
    if (signature.signed) await verifyDesktopSigning({ folder, codeRoot: root, layout });
    if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    return report;
  } catch (error) { failure = error; throw error; }
  finally {
    let cleanupError;
    try { await client?.close(); } catch (error) { cleanupError = error; }
    try { await run(['scripts/background.mjs', 'stop']); } catch (error) { cleanupError ||= error; }
    if (!failure && cleanupError) throw cleanupError;
  }
}
if (isDirectInvocation(import.meta.url)) {
  const args = process.argv.slice(2), index = args.indexOf('--archive'), dirIndex = args.indexOf('--directory'), outIndex = args.indexOf('--output');
  let archive = index >= 0 ? args[index + 1] : null;
  if (dirIndex >= 0 && args[dirIndex + 1]) {
    const directory = resolve(args[dirIndex + 1]), files = (await readdir(directory)).filter(file => file.endsWith('.zip'));
    if (files.length === 1) archive = join(directory, files[0]);
  }
  if (!archive) { console.error('Use --archive APP.zip or --directory PACKAGE_FOLDER [--output NEW_REPORT.json].'); process.exitCode = 1; }
  else smokeApp(resolve(archive), { ...(outIndex >= 0 ? { output: resolve(args[outIndex + 1]) } : {}) }).then(report => console.log(JSON.stringify(report, null, 2))).catch(error => { console.error(error.stack); process.exitCode = 1; });
}
