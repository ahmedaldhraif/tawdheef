import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
const execute = promisify(execFile);
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'tawdheef-native-monitor-setup-')), dataDir = join(root, 'data');
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }));
  return { root, dataDir };
}

test('native --monitor setup creates only a dedicated scoped fixture workspace and no native schedule', async t => {
  const { root, dataDir } = await fixture(t), project = join(root, 'installed-code'), ordinary = join(root, 'ordinary-workspace');
  const files = ['scripts/agent-setup.mjs', 'scripts/installed-app.mjs', 'scripts/agent-config-merge.mjs', 'scripts/app-paths.mjs', 'scripts/native-start.mjs', 'scripts/runtime-env.mjs', 'scripts/is-direct.mjs', 'server/integrations.mjs'];
  for (const name of files) { const target = join(project, name); await mkdir(dirname(target), { recursive: true }); await copyFile(new URL('../' + name, import.meta.url), target); }
  await mkdir(ordinary); await writeFile(join(ordinary, '.mcp.json'), '{"custom":"preserve ordinary configuration"}');
  const env = { ...process.env, APPLY_TRACKER_DATA: dataDir, TAWDHEEF_WORKSPACE: ordinary };
  const result = await execute(process.execPath, [join(project, 'scripts/agent-setup.mjs'), 'both', '--monitor', '--json'], { cwd: project, env, windowsHide: true });
  const setup = JSON.parse(result.stdout), workspace = join(dataDir, 'monitoring-workspace'); assert.equal(setup.workspace, workspace); assert.equal(setup.accountConnected, false); assert.match(setup.nextStep, /did not create a schedule/);
  assert.ok((await readFile(join(workspace, '.codex/config.toml'), 'utf8')).includes('APPLY_TRACKER_MONITOR_ASSISTANT = "codex"'));
  const config = JSON.parse(await readFile(join(workspace, '.mcp.json'), 'utf8')); assert.deepEqual(Object.keys(config.mcpServers), ['apply-tracker']); assert.equal(config.mcpServers['apply-tracker'].env.APPLY_TRACKER_MONITOR, '1'); assert.equal(config.mcpServers['apply-tracker'].env.APPLY_TRACKER_MONITOR_ASSISTANT, 'claude-code'); assert.equal(config.mcpServers['apply-tracker'].env.APPLY_TRACKER_DATA, dataDir);
  assert.match(await readFile(join(workspace, 'AGENTS.md'), 'utf8'), /Never apply/); assert.equal(await readFile(join(workspace, 'CLAUDE.md'), 'utf8'), '@AGENTS.md\n');
  assert.equal(await readFile(join(ordinary, '.mcp.json'), 'utf8'), '{"custom":"preserve ordinary configuration"}');
  assert.ok(!(await readdir(project)).includes('.mcp.json')); assert.ok(!(await readdir(workspace)).includes('schedules'));
  await assert.rejects(execute(process.execPath, [join(project, 'scripts/agent-setup.mjs'), 'codex', '--monitor', '--browser', '--check'], { cwd: project, env, windowsHide: true }), /connections belong to your actual client/);
});
