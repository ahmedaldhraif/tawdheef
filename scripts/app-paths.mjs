/** Resolve native-package state independently of the launcher or working directory. */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { nativePaths } from './native-start.mjs';

export function appPaths({ root, env = process.env, ...options } = {}) {
  root = resolve(root);
  let manifest;
  try { manifest = JSON.parse(readFileSync(join(root, 'tawdheef-app.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('The app package metadata is invalid. Re-extract a verified download; private data was not changed.'); }
  if (manifest?.layout) {
    if (manifest.format !== 1 || manifest.name !== 'Tawdheef') throw new Error('The native app package metadata is invalid.');
    return nativePaths({ root, env, ...options });
  }
  // Existing source and older portable installations keep their original paths.
  return { root, bundle: null, dataDir: resolve(env.APPLY_TRACKER_DATA || join(root, '.local')),
    workspace: resolve(env.TAWDHEEF_WORKSPACE || root), legacy: true };
}
export const defaultDataDir = root => appPaths({ root }).dataDir;
