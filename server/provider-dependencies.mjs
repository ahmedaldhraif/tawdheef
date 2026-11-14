import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { access, lstat, mkdir, realpath } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { appPaths, defaultDataDir } from '../scripts/app-paths.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const PROVIDER_DEPENDENCIES = Object.freeze({ '@azure/msal-node': '7.2.2', '@googleapis/calendar': '20.2.0', '@googleapis/gmail': '22.1.0', '@microsoft/microsoft-graph-client': '3.0.7', 'google-auth-library': '11.3.4', 'ical.js': '2.2.1', imapflow: '2.11.0', nodemailer: '10.5.0', 'postal-mime': '4.2.1', tsdav: '2.5.0' });
export const providerAddonDirectory = dataDir => join(resolve(dataDir || defaultDataDir(ROOT)), 'integrations', 'local-adapters');

function dependencyPath(name, { dataDir, root = ROOT } = {}) {
  if (!Object.hasOwn(PROVIDER_DEPENDENCIES, name)) throw new Error('Choose a supported optional local-adapter dependency.');
  for (const anchor of [join(resolve(root), 'package.json'), join(providerAddonDirectory(dataDir), 'package.json')]) {
    try {
      const entry = createRequire(anchor).resolve(name);
      let directory = dirname(entry), match = false;
      for (let depth = 0; depth < 16; depth++) {
        try { const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')); if (manifest.name === name) { match = manifest.version === PROVIDER_DEPENDENCIES[name]; break; } } catch { /* Walk to the package root. */ }
        const parent = dirname(directory); if (parent === directory) break; directory = parent;
      }
      if (match) return entry;
    } catch { /* Development or explicitly installed private add-on. */ }
  }
  throw new Error('This optional local adapter is not installed. Use the native client connection, or explicitly run npm run setup -- --local-adapters.');
}
export function requireProviderDependency(name, options) { return createRequire(import.meta.url)(dependencyPath(name, options)); }
export async function importProviderDependency(name, options) { return import(pathToFileURL(dependencyPath(name, options)).href); }

export async function providerDependenciesStatus({ dataDir, root = ROOT } = {}) {
  const packages = await Promise.all(Object.entries(PROVIDER_DEPENDENCIES).map(async ([name, version]) => {
    try { await access(dependencyPath(name, { dataDir, root })); return { name, version, installed: true }; }
    catch { return { name, version, installed: false }; }
  }));
  return { ready: packages.every(item => item.installed), directory: providerAddonDirectory(dataDir), packages };
}

/** Only explicit installation uses this writer; runtime provider loading stays read-only. */
export async function ensureProviderAddonDirectory({ dataDir, root = ROOT } = {}) {
  const target = resolve(dataDir || defaultDataDir(root)), missing = []; let existing = target, info;
  while (true) { try { info = await lstat(existing); break; } catch (error) { if (error.code !== 'ENOENT') throw error; missing.unshift(basename(existing)); existing = dirname(existing); } }
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('The private add-on folder must be a regular local directory.');
  let canonical = resolve(await realpath(existing), ...missing);
  if (/(?:^|[\\/])[^\\/]+\.app(?:[\\/]|$)/i.test(canonical)) throw new Error('Install optional adapters outside the app bundle.');
  appPaths({ root, env: { APPLY_TRACKER_DATA: canonical } });
  await mkdir(canonical, { recursive: true, mode: 0o700 });
  for (const part of ['integrations', 'local-adapters']) {
    const path = join(canonical, part);
    try { await mkdir(path, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = await lstat(path); if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(path) !== path) throw new Error('Optional adapter folders must not be links.');
    canonical = path;
  }
  return canonical;
}
