/** Exercise the exact downloadable source in an isolated folder, no account actions. */
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import JSZip from 'jszip';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { isPublicSource } from './release-files.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const releaseFlag = process.argv.indexOf('--release-dir');
if (releaseFlag >= 0 && !process.argv[releaseFlag + 1]) throw new Error('--release-dir needs a prepared release folder.');
const release = releaseFlag >= 0 ? resolve(root, process.argv[releaseFlag + 1]) : join(root, 'release', `v${pkg.version}`);
const zip = await JSZip.loadAsync(await readFile(join(release, `tawdheef-${pkg.version}-source.zip`)));
await mkdir(join(root, '.local/release-smoke'), { recursive: true });
const checkout = await mkdtemp(join(root, '.local/release-smoke/checkout-'));
for (const entry of Object.values(zip.files)) {
  if (entry.dir) continue;
  assert.ok(entry.name.startsWith('tawdheef/'));
  const path = entry.name.slice('tawdheef/'.length);
  assert.ok(!path.startsWith('/') && isPublicSource(path), `Unexpected source path: ${path}`);
  await mkdir(dirname(join(checkout, path)), { recursive: true });
  await writeFile(join(checkout, path), await entry.async('nodebuffer'));
}
const socket = createServer(); await new Promise(accept => socket.listen(0, '127.0.0.1', accept));
const port = socket.address().port; await new Promise(accept => socket.close(accept));
const dataDir = join(checkout, '.local');
// Do not inherit provider keys or redirect this isolated test to a real mailbox.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(APPLY_TRACKER_|GOOGLE_WORKSPACE_CLI_|MS365_MCP_)/i.test(key)));
Object.assign(env, { APPLY_TRACKER_DATA: dataDir, APPLY_TRACKER_PORT: String(port) });
function run(file, args = []) {
  const result = spawnSync(process.execPath, [file, ...args], { cwd: checkout, env, stdio: 'inherit', windowsHide: true, timeout: 240_000 });
  if (result.error || result.status !== 0) throw new Error(`Fresh-download check failed at ${file}.`);
}
let client;
try {
  // The same first launch users run: no preinstalled node_modules or dist.
  run(join(checkout, 'scripts/start.mjs'), ['--no-open']);
  run(join(checkout, 'scripts/release-check.mjs'), ['--archive']);
  run(join(checkout, 'scripts/agent-setup.mjs'), ['both']);
  run(join(checkout, 'scripts/agent-setup.mjs'), ['both']);
  const base = `http://127.0.0.1:${port}`;
  for (const path of ['/', '/api/health', '/favicon.svg', '/brand/app-icon-192.png']) {
    const response = await fetch(base + path); assert.equal(response.status, 200, path);
  }
  client = new Client({ name: 'release-verifier', version: pkg.version });
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(checkout, 'server/mcp.mjs')], env, cwd: checkout, stderr: 'pipe' });
  await client.connect(transport);
  const tools = await client.listTools();
  const catalog = JSON.parse(await readFile(join(checkout, 'docs/tools.json'), 'utf8'));
  assert.deepEqual(tools.tools.map(tool => tool.name).sort(), catalog.tools.map(tool => tool.name).sort());
  const response = await client.callTool({ name: 'get_agent_context', arguments: {} });
  const context = JSON.parse(response.content.find(item => item.type === 'text').text);
  assert.equal(context.ok, true); assert.equal(context.data.app, 'running');
  assert.equal(context.data.directories.find(directory => directory.id === 'uae').count, 772);
  assert.equal(resolve(context.data.dataDir), resolve(dataDir));
  const before = Date.now(); run(join(checkout, 'scripts/start.mjs'), ['--no-open']);
  const result = { ok: true, version: pkg.version, platform: process.platform, tools: tools.tools.length, sourceRecords: 772, repeatedLaunchMs: Date.now() - before, checks: ['exact ZIP extracted', 'first launch installs and builds without optional bridges', 'project MCP setup for both clients', 'repeat setup preserves files', 'working app and icons', 'real stdio MCP discovery and context', 'one background process on repeated launch'], liveAccountActions: false };
  await writeFile(join(release, 'smoke-verification.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await client?.close();
  run(join(checkout, 'scripts/background.mjs'), ['stop']);
  console.log(`Isolated verification files remain in ${checkout}. The background test app was stopped.`);
}
