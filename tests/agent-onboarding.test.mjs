import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { discoverAssistants, checkAssistantCompatibility } from '../server/agent-runner.mjs';
import { configureAgent } from '../scripts/agent-setup.mjs';
import { createClientConfig } from '../server/integrations.mjs';

async function project(t) {
  const root = await mkdtemp(join(tmpdir(), 'tawdheef-onboarding-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }));
  await mkdir(join(root, 'skills/tawdheef'), { recursive: true });
  await writeFile(join(root, 'skills/tawdheef/SKILL.md'), 'Original fixture guidance');
  return { root, dataDir: join(root, 'private data'), port: 4018, env: {} };
}

test('project setup merges unrelated settings and upgrades only owned entries and skill files with backups', async t => {
  const options = await project(t), { root } = options;
  await mkdir(join(root, '.codex'));
  const customToml = 'model = "chosen-model"\n\n[mcp_servers.other]\ncommand = "custom-tool"\n';
  await writeFile(join(root, '.codex/config.toml'), customToml);
  await writeFile(join(root, '.mcp.json'), JSON.stringify({ custom: { keep: true }, mcpServers: { other: { command: 'custom-tool' } } }));
  const preview = await configureAgent('both', { ...options, check: true });
  assert.equal(preview.files.filter(file => file.status === 'would update').length, 2);
  assert.equal(await readFile(join(root, '.codex/config.toml'), 'utf8'), customToml);
  await assert.rejects(readFile(join(root, '.tawdheef-setup/manifest.json')), { code: 'ENOENT' });
  await configureAgent('both', options);
  const before = await readFile(join(root, '.mcp.json'), 'utf8');
  await writeFile(join(root, 'skills/tawdheef/SKILL.md'), 'Updated fixture guidance');
  const config = JSON.parse(before); config.custom.addedLater = true;
  await writeFile(join(root, '.mcp.json'), JSON.stringify(config));
  const updated = await configureAgent('both', { ...options, port: 4019 });
  const current = JSON.parse(await readFile(join(root, '.mcp.json'), 'utf8'));
  assert.deepEqual(current.custom, { keep: true, addedLater: true });
  assert.deepEqual(current.mcpServers.other, { command: 'custom-tool' });
  assert.equal(current.mcpServers['apply-tracker'].env.APPLY_TRACKER_PORT, '4019');
  assert.ok((await readFile(join(root, '.codex/config.toml'), 'utf8')).startsWith(customToml.trimEnd()));
  assert.equal(await readFile(join(root, '.agents/skills/tawdheef/SKILL.md'), 'utf8'), 'Updated fixture guidance');
  assert.equal(JSON.parse(await readFile(join(updated.backup, '.mcp.json'), 'utf8')).mcpServers['apply-tracker'].env.APPLY_TRACKER_PORT, '4018');
  assert.equal(await readFile(join(updated.backup, '.agents/skills/tawdheef/SKILL.md'), 'utf8'), 'Original fixture guidance');
  assert.ok((await configureAgent('both', { ...options, port: 4019 })).files.every(file => file.status === 'already configured'));
});

test('an edited owned entry or unowned conflicting entry blocks the entire setup before writing', async t => {
  const options = await project(t), { root } = options;
  await configureAgent('both', options);
  const originalToml = await readFile(join(root, '.codex/config.toml'), 'utf8');
  const edited = JSON.parse(await readFile(join(root, '.mcp.json'), 'utf8'));
  edited.mcpServers['apply-tracker'].command = 'custom replacement';
  const source = JSON.stringify(edited);
  await writeFile(join(root, '.mcp.json'), source);
  await assert.rejects(configureAgent('both', { ...options, port: 4019 }), /No setup files were changed/);
  assert.equal(await readFile(join(root, '.mcp.json'), 'utf8'), source);
  assert.equal(await readFile(join(root, '.codex/config.toml'), 'utf8'), originalToml);
  const other = await project(t);
  await mkdir(join(other.root, '.codex'));
  await writeFile(join(other.root, '.codex/config.toml'), '[mcp_servers."apply-tracker"]\ncommand="custom"\n');
  await assert.rejects(configureAgent('codex', other), /unowned or was edited/);
  await assert.rejects(readFile(join(other.root, '.agents/skills/tawdheef/SKILL.md')), { code: 'ENOENT' });
});

test('custom skill changes require review and malformed ownership cannot authorize an overwrite', async t => {
  const options = await project(t), { root } = options;
  await configureAgent('codex', options);
  await writeFile(join(root, '.agents/skills/tawdheef/SKILL.md'), 'My custom additions');
  await assert.rejects(configureAgent('codex', options), /unowned or was edited/);
  assert.equal(await readFile(join(root, '.agents/skills/tawdheef/SKILL.md'), 'utf8'), 'My custom additions');
  await writeFile(join(root, '.tawdheef-setup/manifest.json'), '{bad ownership');
  await assert.rejects(configureAgent('codex', options), /ownership could not be verified/);
});

test('legacy exact generated TOML can be adopted, while stale paths and malformed or duplicate entries require review', async t => {
  const options = await project(t), { root } = options;
  const config = await createClientConfig(options);
  await mkdir(join(root, '.codex'));
  await writeFile(join(root, '.codex/config.toml'), config.codexToml);
  await configureAgent('codex', options);
  const adopted = await readFile(join(root, '.codex/config.toml'), 'utf8');
  assert.match(adopted, /Tawdheef managed MCP/);
  await writeFile(join(root, '.codex/config.toml'), adopted + '\n[mcp_servers.apply-tracker]\ncommand="duplicate"\n');
  await assert.rejects(configureAgent('codex', options), /No setup files were changed/);
  for (const content of ['[mcp_servers.apply-tracker\ncommand="broken"\n', '[mcp_servers.apply-tracker]\ncommand="old-node-path"\n', '[mcp_servers.apply-tracker]\ncommand="first"\n[mcp_servers.apply-tracker]\ncommand="second"\n']) {
    const other = await project(t);
    await mkdir(join(other.root, '.codex'));
    await writeFile(join(other.root, '.codex/config.toml'), content);
    await assert.rejects(configureAgent('codex', other), /No setup files were changed/);
    assert.equal(await readFile(join(other.root, '.codex/config.toml'), 'utf8'), content);
  }
});

test('assistant discovery uses explicit native/script paths and rejects shell wrappers', async t => {
  const { root } = await project(t), script = join(root, 'codex.mjs');
  await writeFile(script, '// metadata fixture; never executed');
  const found = await discoverAssistants({ env: { TAWDHEEF_CODEX_PATH: script, TAWDHEEF_CLAUDE_PATH: join(root, 'missing.exe') }, home: root });
  assert.equal(found[0].installed, true); assert.equal(found[0].command, process.execPath); assert.deepEqual(found[0].args, [script]);
  const blocked = await discoverAssistants({ env: { TAWDHEEF_CODEX_PATH: join(root, 'codex.cmd'), TAWDHEEF_CLAUDE_PATH: 'relative-command' }, home: root });
  assert.ok(blocked.every(item => !item.installed));
  const nvm = join(root, '.nvm/versions/node/v26.1.0/bin');
  await mkdir(nvm, { recursive: true }); await writeFile(join(nvm, 'codex'), '#!/bin/sh\nexit 0\n'); await chmod(join(nvm, 'codex'), 0o755);
  const gui = await discoverAssistants({ env: { PATH: '', TAWDHEEF_CLAUDE_PATH: join(root, 'missing') }, platform: 'darwin', home: root });
  assert.equal(gui[0].command, join(nvm, 'codex'));
});

test('an external workspace gets owned settings and guidance while server paths stay inside the installed app', async t => {
  const options = await project(t), { root } = options, workspace = join(root, 'writable workspace');
  await mkdir(join(root, 'docs'), { recursive: true });
  await writeFile(join(root, 'AGENTS.md'), 'Canonical fixture operating rules');
  await writeFile(join(root, 'CLAUDE.md'), '@AGENTS.md\n');
  await writeFile(join(root, 'docs/FIRST-RUN.md'), 'Canonical fixture setup guide');
  const preview = await configureAgent('both', { ...options, workspace, check: true });
  assert.equal(preview.workspace, workspace); assert.equal(preview.appRoot, root);
  assert.ok(preview.files.every(file => file.path.startsWith(workspace)));
  await assert.rejects(readFile(join(workspace, '.mcp.json')), { code: 'ENOENT' });
  await configureAgent('both', { ...options, workspace });
  const config = JSON.parse(await readFile(join(workspace, '.mcp.json'), 'utf8'));
  assert.equal(config.mcpServers['apply-tracker'].command, process.execPath);
  assert.deepEqual(config.mcpServers['apply-tracker'].args, [join(root, 'server/mcp.mjs')]);
  assert.equal(config.mcpServers['apply-tracker'].env.APPLY_TRACKER_DATA, options.dataDir);
  assert.match(await readFile(join(workspace, 'AGENTS.md'), 'utf8'), /Canonical fixture operating rules/);
  assert.equal(await readFile(join(workspace, 'docs/FIRST-RUN.md'), 'utf8'), 'Canonical fixture setup guide');
  assert.equal(await readFile(join(root, 'AGENTS.md'), 'utf8'), 'Canonical fixture operating rules');
  await assert.rejects(readFile(join(root, '.mcp.json')), { code: 'ENOENT' });
  await writeFile(join(root, 'docs/FIRST-RUN.md'), 'Updated canonical fixture guide');
  const updated = await configureAgent('both', { ...options, workspace });
  assert.equal(await readFile(join(workspace, 'docs/FIRST-RUN.md'), 'utf8'), 'Updated canonical fixture guide');
  assert.equal(await readFile(join(updated.backup, 'docs/FIRST-RUN.md'), 'utf8'), 'Canonical fixture setup guide');
  await writeFile(join(workspace, 'AGENTS.md'), 'Custom workspace operating rules');
  const before = await readFile(join(workspace, '.mcp.json'), 'utf8');
  await assert.rejects(configureAgent('both', { ...options, workspace, port: 4019 }), /No setup files were changed/);
  assert.equal(await readFile(join(workspace, 'AGENTS.md'), 'utf8'), 'Custom workspace operating rules');
  assert.equal(await readFile(join(workspace, '.mcp.json'), 'utf8'), before);
});

test('direct setup in a native Mac bundle chooses external defaults and refuses bundle writes without launcher environment', async t => {
  const base = await project(t), root = join(base.root, 'Tawdheef.app/Contents/Resources/app'), home = join(base.root, 'fixture-home');
  for (const name of ['skills/tawdheef', 'docs']) await mkdir(join(root, name), { recursive: true });
  for (const [name, content] of Object.entries({ 'AGENTS.md': 'Fixture rules', 'CLAUDE.md': '@AGENTS.md', 'docs/FIRST-RUN.md': 'Fixture guide', 'skills/tawdheef/SKILL.md': 'Fixture skill', 'tawdheef-app.json': JSON.stringify({ format: 1, name: 'Tawdheef', layout: { bundle: 'Tawdheef.app' } }) })) await writeFile(join(root, name), content);
  const result = await configureAgent('both', { root, platform: 'darwin', home, env: {} });
  const expectedData = join(home, 'Library/Application Support/Tawdheef');
  assert.equal(result.workspace, join(expectedData, 'workspace'));
  const config = JSON.parse(await readFile(join(result.workspace, '.mcp.json'), 'utf8'));
  assert.equal(config.mcpServers['apply-tracker'].env.APPLY_TRACKER_DATA, expectedData);
  assert.deepEqual(config.mcpServers['apply-tracker'].args, [join(root, 'server/mcp.mjs')]);
  await assert.rejects(readFile(join(root, '.mcp.json')), { code: 'ENOENT' });
  await assert.rejects(configureAgent('codex', { root, platform: 'darwin', home, env: {}, workspace: join(root, 'unsafe-workspace') }), /outside Tawdheef\.app/);
  await assert.rejects(configureAgent('codex', { root, platform: 'darwin', home, env: {}, dataDir: join(root, '.local') }), /outside Tawdheef\.app/);
});

test('the setup CLI honors external workspace environment without placing configuration in the app directory', async t => {
  const { root } = await project(t), workspace = join(root, 'external-workspace');
  for (const name of ['scripts', 'server', 'docs']) await mkdir(join(root, name), { recursive: true });
  for (const file of ['scripts/agent-setup.mjs', 'scripts/agent-config-merge.mjs', 'scripts/app-paths.mjs', 'scripts/native-start.mjs', 'scripts/runtime-env.mjs', 'server/integrations.mjs']) await writeFile(join(root, file), await readFile(new URL('../' + file, import.meta.url)));
  for (const [name, content] of Object.entries({ 'AGENTS.md': 'Fixture rules', 'CLAUDE.md': '@AGENTS.md', 'docs/FIRST-RUN.md': 'Fixture guide' })) await writeFile(join(root, name), content);
  const env = { ...process.env, TAWDHEEF_WORKSPACE: workspace, APPLY_TRACKER_DATA: join(root, 'private-data') };
  const configured = spawnSync(process.execPath, [join(root, 'scripts/agent-setup.mjs'), 'both', '--json'], { cwd: root, env, shell: false, windowsHide: true, encoding: 'utf8' });
  assert.equal(configured.status, 0, configured.stderr);
  assert.equal(JSON.parse(configured.stdout).workspace, workspace);
  const config = JSON.parse(await readFile(join(workspace, '.mcp.json'), 'utf8'));
  assert.equal(config.mcpServers['apply-tracker'].command, process.execPath);
  assert.deepEqual(config.mcpServers['apply-tracker'].args, [join(root, 'server/mcp.mjs')]);
  await assert.rejects(readFile(join(root, '.mcp.json')), { code: 'ENOENT' });
});

test('assistant compatibility uses only version/help and requires the actual safe run flags', async () => {
  const calls = [];
  const executable = { id: 'codex', command: 'fixture', args: [] };
  const run = async ({ args }) => { calls.push(args); return args[0] === '--version' ? 'codex-cli 1.2.3' : '--json --sandbox --skip-git-repo-check --cd'; };
  assert.deepEqual(await checkAssistantCompatibility(executable, { run }), { version: '1.2.3', capabilitiesChecked: true });
  assert.deepEqual(calls[0], ['--version']); assert.ok(calls[1].includes('--help')); assert.ok(calls[1].includes('read-only'));
  assert.ok(calls.every(args => !args.includes('login') && !args.includes('-p')));
  await assert.rejects(checkAssistantCompatibility(executable, { run: async ({ args }) => args[0] === '--version' ? '1.2.3' : '--json' }), /missing required/);
  const claudeCalls = [];
  await checkAssistantCompatibility({ id: 'claude-code', command: 'fixture', args: [] }, { run: async ({ args }) => { claudeCalls.push(args); return args[0] === '--version' ? '2.1.4 (Claude Code)' : '--mcp-config --output-format --permission-mode'; } });
  assert.ok(claudeCalls[1].includes('--strict-mcp-config')); assert.ok(claudeCalls[1].includes('default')); assert.ok(!claudeCalls[1].includes('-p'));
});
