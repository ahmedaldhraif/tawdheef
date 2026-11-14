import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appPaths } from '../scripts/app-paths.mjs';

async function fixture(t, native = false) {
  const base = await mkdtemp(join(tmpdir(), 'tawdheef-native-paths-'));
  t.after(() => rm(base, { recursive: true, force: true, maxRetries: 5 }));
  const root = native ? join(base, 'Tawdheef.app/Contents/Resources/app') : join(base, 'source');
  await mkdir(root, { recursive: true });
  if (native) await writeFile(join(root, 'tawdheef-app.json'), JSON.stringify({ format: 1, name: 'Tawdheef', layout: { bundle: 'Tawdheef.app' } }));
  return { base, root };
}
test('source and older portable defaults preserve existing data and project config paths', async t => {
  const { root } = await fixture(t);
  assert.equal(appPaths({ root, env: {} }).dataDir, join(root, '.local'));
  assert.equal(appPaths({ root, env: {} }).workspace, root);
  const external = join(root, '..', 'existing');
  assert.equal(appPaths({ root, env: { APPLY_TRACKER_DATA: external } }).dataDir, external);
});
test('direct Mac CLI defaults remain outside the sealed bundle without launcher environment', async t => {
  const { base, root } = await fixture(t, true), home = join(base, 'home');
  const paths = appPaths({ root, platform: 'darwin', home, env: {} });
  assert.equal(paths.dataDir, join(home, 'Library/Application Support/Tawdheef'));
  assert.equal(paths.workspace, join(paths.dataDir, 'workspace'));
  assert.throws(() => appPaths({ root, platform: 'darwin', home, env: { APPLY_TRACKER_DATA: join(root, '.local') } }), /outside Tawdheef.app/);
  assert.throws(() => appPaths({ root, platform: 'darwin', home, env: { TAWDHEEF_WORKSPACE: root } }), /outside Tawdheef.app/);
  await mkdir(join(base, '.local'));
  assert.equal(appPaths({ root, platform: 'darwin', home, env: {} }).dataDir, join(base, '.local'));
});
test('malformed package metadata never falls back to writing inside the app', async t => {
  const { root } = await fixture(t);
  await writeFile(join(root, 'tawdheef-app.json'), '{bad');
  assert.throws(() => appPaths({ root, env: {} }), /metadata is invalid/);
});
