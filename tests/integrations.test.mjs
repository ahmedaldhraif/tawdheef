import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INTEGRATIONS, integrationPresets, integrationStatus, createClientConfig, exportClientConfig, validateGwsArgs } from '../server/integrations.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'apply-tracker-integrations-'));
  const dataDir = join(root, 'private data');
  await mkdir(dataDir);
  return { root, dataDir, port: 4018 };
}

async function installFixture(item, options) {
  const directory = join(options.root, 'node_modules', ...item.package.split('/'));
  await mkdir(join(directory, 'dist'), { recursive: true });
  await writeFile(join(directory, 'package.json'), JSON.stringify({ name: item.package, version: item.version }));
  await writeFile(join(directory, item.bin), '// fixture only');
  if (item.id === 'google-cli') {
    await mkdir(join(directory, 'bin'));
    await writeFile(join(directory, 'platform.js'), 'exports.getPlatform = () => ({binary:"gws-fixture"});');
    await writeFile(join(directory, 'bin', 'gws-fixture'), 'fixture only');
  }
}

test('generated client settings use one private directory and explicitly selected installed servers', async () => {
  const options = await fixture();
  try {
    const baseline = await createClientConfig(options);
    assert.deepEqual(baseline.included, ['apply-tracker']);
    assert.equal(baseline.mcpServers['apply-tracker'].env.APPLY_TRACKER_DATA, options.dataDir);
    assert.equal(JSON.parse(baseline.claudeJson).mcpServers['apply-tracker'].type, 'stdio');
    assert.match(baseline.codexToml, /\[mcp_servers\.apply-tracker\]/);
    await assert.rejects(createClientConfig({ ...options, include: ['playwright'] }), /not installed/);
    await assert.rejects(createClientConfig({ ...options, include: ['google-cli'] }), /CLI, not an MCP/);
    await installFixture(INTEGRATIONS.find(item => item.id === 'playwright'), options);
    const browser = await createClientConfig({ ...options, include: ['playwright'] });
    assert.deepEqual(browser.included, ['apply-tracker', 'playwright']);
    assert.ok(browser.mcpServers.playwright.args.includes(join(options.dataDir, 'browser-profile')));
    assert.ok(!browser.codexToml.includes('@latest'));
    const output = join(options.root, 'exported');
    const exported = await exportClientConfig(output, options);
    assert.equal(exported.files.length, 2);
    const original = await readFile(exported.files[0], 'utf8');
    await assert.rejects(exportClientConfig(output, { ...options, include: ['playwright'] }), /already exists/);
    assert.equal(await readFile(exported.files[0], 'utf8'), original);
  } finally { await rm(options.root, { recursive: true, force: true }); }
});

test('optional tool recipes keep mailbox caches local and never expose other Microsoft services', async () => {
  const options = await fixture();
  try {
    for (const item of INTEGRATIONS) await installFixture(item, options);
    const presets = await integrationPresets(options);
    assert.ok(presets.every(item => item.ready));
    const google = presets.find(item => item.id === 'google-cli');
    assert.equal(google.env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR, join(options.dataDir, 'google-cli'));
    assert.deepEqual(google.args, []);
    assert.equal(google.command, join(options.root, 'node_modules', '@googleworkspace', 'cli', 'bin', 'gws-fixture'));
    const outlook = presets.find(item => item.id === 'outlook-mcp');
    assert.ok(outlook.args.includes('--enabled-tools'));
    assert.ok(!outlook.args.includes('--preset'));
    assert.ok(!outlook.args.some(value => value.includes('Calendar') || value.includes('Files')));
    assert.equal(outlook.env.MS365_MCP_TOKEN_CACHE_PATH, join(options.dataDir, 'outlook-mcp', 'token-cache.json'));
    assert.deepEqual(presets.find(item => item.id === 'tabbio').args.slice(-2), ['mcp', 'serve']);
  } finally { await rm(options.root, { recursive: true, force: true }); }
});

test('Google runner rejects unbounded actions and defaults to read only', () => {
  assert.doesNotThrow(() => validateGwsArgs(['gmail', 'users', 'getProfile', '--params', '{"userId":"me"}', '--format', 'json']));
  assert.doesNotThrow(() => validateGwsArgs(['gmail', 'users', 'threads', 'get', '--params', '{"userId":"me","id":"thread-1","format":"full"}']));
  assert.doesNotThrow(() => validateGwsArgs(['gmail', 'users', 'messages', 'list', '--params', '{"userId":"me","q":"in:sent rfc822msgid:receipt@example.test","maxResults":5}', '--format', 'json']));
  const send = ['gmail', 'users', 'messages', 'send', '--params', '{"userId":"me"}', '--json', '{"raw":"YWJj"}'];
  assert.throws(() => validateGwsArgs(send), /authorized tracker send/);
  assert.doesNotThrow(() => validateGwsArgs(send, { allowWrite: true }));
  assert.throws(() => validateGwsArgs(['auth', 'export', '--unmasked']), /unavailable/);
  assert.throws(() => validateGwsArgs(['drive', 'files', 'list']), /unavailable/);
  assert.throws(() => validateGwsArgs(['gmail', 'users', 'messages', 'delete', '--params', '{"userId":"me"}'], { allowWrite: true }), /unavailable/);
  assert.throws(() => validateGwsArgs(['gmail', 'users', 'getProfile', '--params', '{"userId":"other@example.test"}']), /signed-in mailbox/);
  assert.throws(() => validateGwsArgs(['gmail', 'users', 'getProfile', '--params', '{"userId":"me"}', '--output', 'private-file']), /not supported/);
  assert.throws(() => validateGwsArgs(['gmail', '+send', '--to', 'a@example.test\r\nBcc: b@example.test', '--subject', 'Hello', '--body', 'Text'], { allowWrite: true }), /one line/);
  assert.throws(() => validateGwsArgs(['gmail', 'users', 'getProfile', '--params', '{"userId":"me"}', '--format', 'table']), /JSON/);
});

test('status reports configuration readiness without leaking secrets and detects another data directory', async () => {
  const options = await fixture();
  const secret = 'NEVER-RETURN-THIS-SECRET';
  await writeFile(join(options.dataDir, 'connections.private.json'), JSON.stringify({ email: { config: { adapter: 'gmail', oauth: { clientId: 'desktop-client', clientSecret: secret } }, auth: { refreshToken: secret, cache: secret } } }));
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(req.url === '/api/health' ? { ok: true, app: 'apply-tracker' } : { mcpServers: { 'apply-tracker': { env: { APPLY_TRACKER_DATA: join(options.root, 'someone-else') } } } }));
  });
  await new Promise(accept => server.listen(0, '127.0.0.1', accept));
  try {
    const status = await integrationStatus({ ...options, port: server.address().port });
    assert.equal(status.oauth.gmailConfigured, true);
    assert.equal(status.app.running, true);
    assert.equal(status.app.sameDataDirectory, false);
    assert.ok(!JSON.stringify(status).includes(secret));
    assert.ok(!JSON.stringify(status).includes('desktop-client'));
  } finally { await new Promise(accept => server.close(accept)); await rm(options.root, { recursive: true, force: true }); }
});
