import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { probeStdioTools, checkTrackerMcp, checkBrowserMcp } from '../server/setup-probes.mjs';

test('local probe performs a real stdio handshake and tool call against an isolated fixture', async t => {
  const root = await mkdtemp(join(tmpdir(), 'tawdheef-probe-fixture-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }));
  const require = createRequire(import.meta.url);
  const source = [
    `import { Server } from ${JSON.stringify(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/server/index.js')).href)};`,
    `import { StdioServerTransport } from ${JSON.stringify(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/server/stdio.js')).href)};`,
    `import { ListToolsRequestSchema, CallToolRequestSchema } from ${JSON.stringify(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/types.js')).href)};`,
    'const server = new Server({name:"fixture",version:"1.0.0"},{capabilities:{tools:{}}});',
    'server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[{name:"fixture_read",inputSchema:{type:"object"}}]}));',
    'server.setRequestHandler(CallToolRequestSchema,async()=>({content:[{type:"text",text:"read-only fixture"}]}));',
    'await server.connect(new StdioServerTransport());',
  ].join('\n');
  const entry = join(root, 'fixture.mjs'); await writeFile(entry, source);
  assert.deepEqual(await probeStdioTools({ command: process.execPath, args: [entry], env: {}, expectedTools: ['fixture_read'], calls: [{ name: 'fixture_read', arguments: {} }], timeoutMs: 10000 }), { transportChecked: true, toolsChecked: true });
  await assert.rejects(probeStdioTools({ command: process.execPath, args: [entry], env: {}, expectedTools: ['missing'], timeoutMs: 10000 }), /Required local tools/);
});

test('browser readiness uses a temporary profile and only about:blank, and cleans it afterwards', async () => {
  let seen;
  const browser = { ready: true, browserInstalled: true, command: 'fixture-node', args: ['fixture-browser.mjs', '--user-data-dir', 'person-private-profile', '--output-dir=person-private-output', '--browser', 'chromium'] };
  await checkBrowserMcp({ browser, probe: async options => { seen = options; return {}; } });
  assert.ok(!seen.args.join(' ').includes('person-private'));
  assert.ok(seen.args.includes('--headless')); assert.ok(!seen.args.includes('--no-sandbox'));
  assert.deepEqual(seen.calls, [{ name: 'browser_navigate', arguments: { url: 'about:blank' } }, { name: 'browser_close', arguments: {} }]);
  const profile = seen.args[seen.args.indexOf('--user-data-dir') + 1];
  await assert.rejects(stat(profile), { code: 'ENOENT' });
  await assert.rejects(checkBrowserMcp({ browser: { ...browser, browserInstalled: false } }), /Install browser tools/);
});

test('tracker readiness uses isolated data and does not inherit operator authority or provider secrets', async () => {
  let seen;
  await checkTrackerMcp({ root: 'fixture-root', probe: async options => { seen = options; } });
  assert.deepEqual(Object.keys(seen.env).sort(), ['APPLY_TRACKER_DATA', 'APPLY_TRACKER_PORT', 'PATH', ...(process.env.SystemRoot ? ['SystemRoot'] : [])].sort());
  assert.ok(seen.env.APPLY_TRACKER_DATA.includes('tawdheef-mcp-check-'));
  assert.ok(seen.expectedTools.includes('prepare_form_submission'));
  assert.equal(seen.calls, undefined);
  await assert.rejects(stat(seen.env.APPLY_TRACKER_DATA), { code: 'ENOENT' });
});

test('a stalled local probe times out and closes the client and transport', async () => {
  let clientsClosed = 0, transportsClosed = 0;
  await assert.rejects(probeStdioTools({ command: 'fixture', args: [], timeoutMs: 5,
    clientFactory: () => ({ connect: () => new Promise(() => {}), close: async () => { clientsClosed++; } }),
    transportFactory: () => ({ close: async () => { transportsClosed++; } }),
  }), /timed out/);
  assert.equal(clientsClosed, 1); assert.equal(transportsClosed, 1);
});
