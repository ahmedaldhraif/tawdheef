import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import JSZip from 'jszip';
import { checkPublicSource, sourceArchive, isPublicSource } from '../scripts/release-files.mjs';
import { configureAgent } from '../scripts/agent-setup.mjs';
import { buildFingerprint, ensureBuild } from '../scripts/build.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'tawdheef-release-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
test('source release excludes private files, generated archives and development outputs', async t => {
  const root = await fixture(t);
  for (const name of ['README.md', 'server/index.mjs', '.agents/skills/example/SKILL.md', '.local/secret.json', 'public/.env', 'public/nested/.local/secret.json', 'public/downloads/old.zip', 'outputs/screenshot.png', 'server/credentials.json']) {
    const path = join(root, name); await mkdir(join(path, '..'), { recursive: true }); await writeFile(path, 'fixture');
  }
  const report = await checkPublicSource(root, { git: false }); assert.equal(report.files, 3);
  const zip = await JSZip.loadAsync(await sourceArchive(root));
  assert.deepEqual(Object.values(zip.files).filter(entry => !entry.dir).map(entry => entry.name).sort(), ['tawdheef/.agents/skills/example/SKILL.md', 'tawdheef/README.md', 'tawdheef/server/index.mjs']);
  assert.equal(isPublicSource('public/../.local/private.json'), false);
  assert.equal(isPublicSource('.claude/settings.local.json'), false);
  assert.equal(isPublicSource('.codex/config.toml'), false);
  assert.equal(isPublicSource('data/private.sqlite3'), false);
  assert.equal(isPublicSource('public/session.db-wal'), false);
  assert.equal(isPublicSource('directories/qatar/source.json'), true);
  assert.equal(isPublicSource('directories/qatar/index.json'), true);
  assert.equal(isPublicSource('directories/qatar/qatar-directory.json'), false);
  assert.equal(isPublicSource('directories/qatar/qatar-directory-01.csv'), false);
  assert.equal(isPublicSource('public/downloads/qatar-source.json'), false);
});
test('release check rejects credential signatures without returning the value', async t => {
  const root = await fixture(t), secret = 'gh' + 'p_' + 'a'.repeat(36);
  await mkdir(join(root, 'server')); await writeFile(join(root, 'server/config.json'), JSON.stringify({ token: secret }));
  await assert.rejects(checkPublicSource(root, { git: false }), error => /possible embedded credential/.test(error.message) && !error.message.includes(secret));
});
test('agent setup is project-local, previewable, idempotent and preserves custom settings', async t => {
  const root = await fixture(t);
  await mkdir(join(root, 'skills/tawdheef/references'), { recursive: true });
  await writeFile(join(root, 'skills/tawdheef/SKILL.md'), 'skill fixture');
  await writeFile(join(root, 'skills/tawdheef/references/setup.md'), 'setup fixture');
  const options = { root, dataDir: join(root, 'private data'), port: 4018 };
  const preview = await configureAgent('both', { ...options, check: true });
  assert.ok(preview.files.every(file => file.status === 'would create'));
  await assert.rejects(readFile(join(root, '.mcp.json')), { code: 'ENOENT' });
  await configureAgent('both', options);
  const json = JSON.parse(await readFile(join(root, '.mcp.json'), 'utf8'));
  assert.equal(json.mcpServers['apply-tracker'].env.APPLY_TRACKER_DATA, options.dataDir);
  assert.equal(json.mcpServers['apply-tracker'].env.APPLY_TRACKER_PORT, '4018');
  assert.ok((await configureAgent('both', options)).files.every(file => file.status === 'already configured'));
  await writeFile(join(root, '.mcp.json'), '{"custom":"keep me"}');
  await assert.rejects(configureAgent('both', options), /No setup files were changed/);
  assert.equal(await readFile(join(root, '.mcp.json'), 'utf8'), '{"custom":"keep me"}');
});
test('retired browser setup cannot modify client settings', async t => {
  const root = await fixture(t);
  const before = '{"custom":"keep browser settings"}'; await writeFile(join(root, '.mcp.json'), before);
  await assert.rejects(configureAgent('both', { root, mode: 'local-adapters', include: ['playwright'] }), /retired/);
  assert.equal(await readFile(join(root, '.mcp.json'), 'utf8'), before);
});

test('agent setup CLI runs through a linked project path', async t => {
  const root = await fixture(t), project = join(root, 'project'), linked = join(root, 'linked-project');
  for (const folder of ['scripts', 'server', 'skills/tawdheef']) await mkdir(join(project, folder), { recursive: true });
  for (const file of ['scripts/agent-setup.mjs', 'scripts/installed-app.mjs', 'scripts/agent-config-merge.mjs', 'scripts/app-paths.mjs', 'scripts/native-start.mjs', 'scripts/runtime-env.mjs', 'scripts/is-direct.mjs', 'server/integrations.mjs']) await writeFile(join(project, file), await readFile(new URL('../' + file, import.meta.url)));
  await writeFile(join(project, 'skills/tawdheef/SKILL.md'), 'isolated skill fixture');
  await symlink(project, linked, process.platform === 'win32' ? 'junction' : 'dir');
  const result = spawnSync(process.execPath, [join(linked, 'scripts/agent-setup.mjs'), 'codex', '--check', '--json'], {
    cwd: linked, env: { ...process.env, APPLY_TRACKER_DATA: join(root, 'private data'), APPLY_TRACKER_PORT: '4018' }, encoding: 'utf8', windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.trim(), 'The CLI must return JSON through linked project paths');
  const preview = JSON.parse(result.stdout);
  assert.deepEqual(preview.clients, ['codex']);
  assert.ok(preview.files.every(file => file.status === 'would create'));
  await assert.rejects(readFile(join(project, '.codex/config.toml')), { code: 'ENOENT' });
});

test('launch reuses a matching build and detects edited or added source and asset files', async t => {
  const root = await fixture(t);
  for (const folder of ['src', 'public', 'dist']) await mkdir(join(root, folder));
  for (const file of ['index.html', 'vite.config.mjs', 'package.json', 'package-lock.json', 'src/main.jsx', 'public/icon.svg', 'dist/index.html']) await writeFile(join(root, file), file);
  const first = await buildFingerprint(root);
  await writeFile(join(root, 'dist/.tawdheef-build'), first);
  assert.deepEqual(await ensureBuild({ directory: root }), { built: false });
  await writeFile(join(root, 'src/main.jsx'), 'updated');
  assert.notEqual(await buildFingerprint(root), first);
  const second = await buildFingerprint(root);
  await writeFile(join(root, 'public/new.svg'), 'new');
  assert.notEqual(await buildFingerprint(root), second);
});
