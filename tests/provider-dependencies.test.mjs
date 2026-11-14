import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PROVIDER_DEPENDENCIES, providerAddonDirectory, requireProviderDependency, importProviderDependency, ensureProviderAddonDirectory } from '../server/provider-dependencies.mjs';
import { localAdapterInstallPlan } from '../scripts/setup.mjs';
async function fixture(t) { const prefix = join(tmpdir(), 'tawdheef-optional-sdk-'), root = await mkdtemp(prefix); t.after(async () => { assert.ok(resolve(root).startsWith(resolve(prefix))); await rm(root, { recursive: true, force: true, maxRetries: 5 }); }); return { root, dataDir: join(root, 'private') }; }

test('private optional dependency resolution is pinned and native setup has no provider SDK production dependencies', async t => {
  const options = await fixture(t); assert.throws(() => requireProviderDependency('nodemailer', options), /optional local adapter is not installed/);
  const prefix = await ensureProviderAddonDirectory(options), modulePath = join(prefix, 'node_modules/nodemailer'); await mkdir(modulePath, { recursive: true });
  await writeFile(join(modulePath, 'package.json'), JSON.stringify({ name: 'nodemailer', version: PROVIDER_DEPENDENCIES.nodemailer, main: 'index.cjs' })); await writeFile(join(modulePath, 'index.cjs'), 'module.exports={fixture:true};');
  assert.equal(requireProviderDependency('nodemailer', options).fixture, true); assert.equal((await importProviderDependency('nodemailer', options)).default.fixture, true);
  assert.throws(() => requireProviderDependency('not-approved', options), /supported optional/);
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  for (const [name, version] of Object.entries(PROVIDER_DEPENDENCIES)) { assert.equal(manifest.dependencies[name], undefined); assert.equal(manifest.devDependencies[name], version); }
  const plan = localAdapterInstallPlan(options.dataDir); assert.equal(plan.directory, providerAddonDirectory(options.dataDir)); assert.deepEqual(plan.packages, Object.entries(PROVIDER_DEPENDENCIES).map(([name, version]) => `${name}@${version}`));
});

test('optional SDK installation refuses a linked private integration directory and bundle paths', async t => {
  const { root, dataDir } = await fixture(t), outside = join(root, 'outside'); await mkdir(dataDir); await mkdir(outside);
  try { await symlink(outside, join(dataDir, 'integrations'), 'junction'); } catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('Directory links unavailable.'); return; } throw error; }
  await assert.rejects(ensureProviderAddonDirectory({ root, dataDir }), /must not be links/); assert.deepEqual(await readdir(outside), []);
  await assert.rejects(ensureProviderAddonDirectory({ root, dataDir: join(root, 'Tawdheef.app/private') }), /outside the app bundle/);
});
