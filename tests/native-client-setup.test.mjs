import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createClientConfig } from '../server/integrations.mjs';
import { configureAgent } from '../scripts/agent-setup.mjs';

async function fixture(t) { const prefix = join(tmpdir(), 'tawdheef-native-client-'), root = await mkdtemp(prefix); t.after(async () => { assert.ok(resolve(root).startsWith(resolve(prefix))); await rm(root, { recursive: true, force: true, maxRetries: 5 }); }); await mkdir(join(root, 'skills/tawdheef'), { recursive: true }); await writeFile(join(root, 'skills/tawdheef/SKILL.md'), 'Fixture instructions'); return { root, dataDir: join(root, 'private'), env: {} }; }

test('native configuration binds each actual client and adds direct Tabbio only when explicitly selected', async t => {
  const options = await fixture(t), config = await createClientConfig(options);
  assert.equal(config.mode, 'native'); assert.equal(config.accountConnected, false); assert.deepEqual(config.included, ['apply-tracker']);
  assert.match(config.codexToml, /APPLY_TRACKER_CLIENT = "codex"/); assert.equal(JSON.parse(config.claudeJson).mcpServers['apply-tracker'].env.APPLY_TRACKER_CLIENT, 'claude-code');
  assert.equal(config.mcpServers['apply-tracker'].env.APPLY_TRACKER_CONNECTION_MODE, 'native');
  const selected = await createClientConfig({ ...options, assistant: 'claude-code', include: ['tabbio'] });
  assert.deepEqual(selected.mcpServers.tabbio, { type: 'http', url: 'https://server.tabbio.com/api/mcp' }); assert.match(selected.codexToml, /\[mcp_servers.tabbio\]\nurl = "https:/);
  assert.equal(JSON.parse(selected.claudeJson).mcpServers.tabbio.type, 'http'); assert.ok(!JSON.stringify(selected).includes('@tabbio-technologies/cli'));
  await assert.rejects(createClientConfig({ ...options, include: ['playwright'] }), /native browser/);
});

test('both native clients and both monitoring configurations keep distinct bound identities without claiming sign-in', async t => {
  const options = await fixture(t); await mkdir(join(options.root, '.codex')); await writeFile(join(options.root, '.codex/config.toml'), 'model = "custom-model"\n'); await writeFile(join(options.root, '.mcp.json'), JSON.stringify({ custom: true, mcpServers: { unrelated: { command: 'preserve' } } }));
  const result = await configureAgent('both', { ...options, include: ['tabbio'] }); assert.equal(result.accountConnected, false); assert.equal(result.mode, 'native');
  const normal = JSON.parse(await readFile(join(options.root, '.mcp.json'), 'utf8')); assert.equal(normal.custom, true); assert.equal(normal.mcpServers.unrelated.command, 'preserve'); assert.equal(normal.mcpServers['apply-tracker'].env.APPLY_TRACKER_CLIENT, 'claude-code');
  assert.match(await readFile(join(options.root, '.codex/config.toml'), 'utf8'), /^model = "custom-model"/);
  const monitor = await configureAgent('both', { ...options, monitor: true }), json = JSON.parse(await readFile(join(monitor.workspace, '.mcp.json'), 'utf8')), toml = await readFile(join(monitor.workspace, '.codex/config.toml'), 'utf8');
  assert.equal(json.mcpServers['apply-tracker'].env.APPLY_TRACKER_MONITOR_ASSISTANT, 'claude-code'); assert.equal(json.mcpServers['apply-tracker'].env.APPLY_TRACKER_CLIENT, 'claude-code'); assert.match(toml, /APPLY_TRACKER_MONITOR_ASSISTANT = "codex"/); assert.match(toml, /APPLY_TRACKER_CLIENT = "codex"/);
  assert.deepEqual(Object.keys(json.mcpServers), ['apply-tracker']); assert.equal(monitor.accountConnected, false); assert.match(monitor.nextStep, /did not create a schedule/);
});

test('native upgrade retires only unchanged owned app bridges and upgrades an explicitly selected Tabbio server', async t => {
  const options = await fixture(t);
  for (const [name, version, entry] of [['@tabbio-technologies/cli', '1.3.1', 'dist/cli.js'], ['@playwright/mcp', '0.0.85', 'cli.js']]) {
    const directory = join(options.root, 'node_modules', ...name.split('/')); await mkdir(join(directory, 'dist'), { recursive: true });
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version })); await writeFile(join(directory, entry), '// Fixture metadata only, never executed');
  }
  await configureAgent('both', { ...options, mode: 'local-adapters', include: ['tabbio', 'playwright'] });
  const legacy = JSON.parse(await readFile(join(options.root, '.mcp.json'), 'utf8')); assert.ok(legacy.mcpServers.playwright.command); assert.ok(legacy.mcpServers.tabbio.command);
  const upgraded = await configureAgent('both', options), native = JSON.parse(await readFile(join(options.root, '.mcp.json'), 'utf8'));
  assert.equal(native.mcpServers.playwright, undefined); assert.deepEqual(native.mcpServers.tabbio, { type: 'http', url: 'https://server.tabbio.com/api/mcp' });
  assert.ok(upgraded.backup); assert.ok(JSON.parse(await readFile(join(upgraded.backup, '.mcp.json'), 'utf8')).mcpServers.playwright);
  await configureAgent('both', { ...options, mode: 'local-adapters', include: ['playwright'] });
  const modified = JSON.parse(await readFile(join(options.root, '.mcp.json'), 'utf8')); modified.mcpServers.playwright.command = 'custom bridge'; await writeFile(join(options.root, '.mcp.json'), JSON.stringify(modified));
  const before = await readFile(join(options.root, '.codex/config.toml'), 'utf8');
  await assert.rejects(configureAgent('both', options), /No setup files were changed/); assert.equal(await readFile(join(options.root, '.codex/config.toml'), 'utf8'), before);
});
