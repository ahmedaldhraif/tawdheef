import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appAssets, copyAppAssets } from '../scripts/app-assets.mjs';
import { ensureBuild } from '../scripts/build.mjs';
import { appSourceFile, APP_TARGETS } from '../scripts/package-app.mjs';
import { selectedIntegrations } from '../scripts/setup.mjs';
import { integrationPresets } from '../server/integrations.mjs';
import { runtimeEnvironment } from '../scripts/runtime-env.mjs';
import { coreInstalled } from '../scripts/runtime-check.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'tawdheef-app-package-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 })); return root;
}
test('bundled Node leads child PATH even when Windows inherits mixed-case Path', () => {
  const env = runtimeEnvironment({ Path: 'C:\\Windows\\System32;C:\\old node', PATH: 'C:\\ignored', KEEP: 'yes' }, 'C:\\Tawdheef space\\runtime\\node.exe', 'win32');
  assert.equal(env.PATH, 'C:\\Tawdheef space\\runtime;C:\\Windows\\System32;C:\\old node');
  assert.equal(env.Path, undefined); assert.equal(env.KEEP, 'yes');
  assert.equal(runtimeEnvironment({ PATH: '/usr/bin:/bin' }, '/Applications/Tawdheef/runtime/bin/node', 'darwin').PATH, '/Applications/Tawdheef/runtime/bin:/usr/bin:/bin:/usr/sbin:/sbin');
  const clean = runtimeEnvironment({ SystemRoot: 'C:\\Windows' }, 'C:\\app\\runtime\\node.exe', 'win32');
  assert.equal(clean.PATH, 'C:\\app\\runtime;C:\\Windows\\System32;C:\\Windows\\System32\\WindowsPowerShell\\v1.0;C:\\Windows');
});
test('app build includes working icons and flags without website pages, downloads or branding ZIPs', async t => {
  const root = await fixture(t);
  const names = ['favicon.svg', 'site.webmanifest', 'brand/app-icon-192.png', 'brand/wordmark-latin-ink.svg', 'brands/claude-code.png', 'flags/AE.svg', 'downloads/source.zip', 'site-assets/photo.png', 'brand/kit.zip', 'brand/index.html', '.env'];
  for (const file of names) { await mkdir(join(root, 'public', file, '..'), { recursive: true }); await writeFile(join(root, 'public', file), file); }
  const expected = names.slice(0, 6).sort(); assert.deepEqual(await appAssets(root), expected);
  await copyAppAssets(root, join(root, 'dist'));
  for (const file of expected) assert.equal(await readFile(join(root, 'dist', file), 'utf8'), file);
  await assert.rejects(readFile(join(root, 'dist/downloads/source.zip')), { code: 'ENOENT' });
});
test('prebuilt launch never requires Vite and fails clearly for incomplete or mismatched packages', async t => {
  const root = await fixture(t); await mkdir(join(root, 'dist'));
  await writeFile(join(root, 'package.json'), JSON.stringify({ version: '1.0.0' }));
  const marker = { format: 1, name: 'Tawdheef', version: '1.0.0' };
  await writeFile(join(root, 'tawdheef-app.json'), JSON.stringify(marker));
  await assert.rejects(ensureBuild({ directory: root }), /prebuilt interface is missing/);
  await writeFile(join(root, 'dist/index.html'), 'prebuilt');
  assert.deepEqual(await ensureBuild({ directory: root }), { built: false, prebuilt: true });
  await assert.rejects(ensureBuild({ directory: root, force: true }), /prebuilt app/);
  await writeFile(join(root, 'tawdheef-app.json'), JSON.stringify({ ...marker, version: '2.0.0' }));
  await assert.rejects(ensureBuild({ directory: root }), /Invalid app package/);
});
test('basic setup selects no optional integrations and unsupported bridges are nonblocking', async t => {
  assert.deepEqual(selectedIntegrations({}), []);
  assert.deepEqual(selectedIntegrations({ browser: true }), ['playwright']);
  assert.deepEqual(selectedIntegrations({ integration: 'outlook-mcp' }), ['outlook-mcp']);
  assert.deepEqual(selectedIntegrations({ login: 'tabbio', tabbio: true }), ['tabbio']);
  const root = await fixture(t);
  const presets = await integrationPresets({ root, dataDir: join(root, 'private'), platform: 'win32', arch: 'arm64' });
  assert.equal(presets.find(item => item.id === 'google-cli').supported, false);
  assert.equal(presets.find(item => item.id === 'playwright').supported, true);
});
test('user distribution keeps domain tools and setup guidance separate from development and marketing', () => {
  for (const file of ['server/store.mjs', 'src/company-types.js', 'scripts/agent-setup.mjs', 'skills/tawdheef/SKILL.md', 'docs/FIRST-RUN.md', 'data/uae-directory.json']) assert.equal(appSourceFile(file), true, file);
  for (const file of ['tests/api.test.mjs', '.agents/skills/emil-design-eng/SKILL.md', 'website/build.mjs', 'public/downloads/source.zip', 'src/main.jsx', 'directories/uae/source.json', '.local/tracker.sqlite']) assert.equal(appSourceFile(file), false, file);
  assert.ok(APP_TARGETS.includes('win32-arm64') && APP_TARGETS.includes('darwin-x64') && APP_TARGETS.includes('darwin-arm64'));
});
test('partial installs require repair even when Vite is already present; prebuilt apps need no frontend tooling', async t => {
  const root = await fixture(t);
  for (const file of ['vite/bin/vite.js', 'react/package.json']) { await mkdir(join(root, 'node_modules', file, '..'), { recursive: true }); await writeFile(join(root, 'node_modules', file), '{}'); }
  assert.equal(await coreInstalled(root), false);
  for (const file of ['express/package.json', '@modelcontextprotocol/sdk/package.json']) { await mkdir(join(root, 'node_modules', file, '..'), { recursive: true }); await writeFile(join(root, 'node_modules', file), '{}'); }
  assert.equal(await coreInstalled(root), true);
  await rm(join(root, 'node_modules/vite'), { recursive: true }); await rm(join(root, 'node_modules/react'), { recursive: true });
  assert.equal(await coreInstalled(root), false); assert.equal(await coreInstalled(root, true), true);
});
