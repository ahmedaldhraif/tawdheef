/** Native wrappers delegate to the existing browser app, with writable state outside the app. */
import { realpathSync, statSync } from 'node:fs';
import { join, resolve, dirname, basename, relative, isAbsolute, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { runtimeEnvironment } from './runtime-env.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = path => { try { return statSync(path).isDirectory(); } catch { return false; } };
const canonical = path => {
  const tail = []; let current = resolve(path);
  while (true) {
    try { return join(realpathSync(current), ...tail); } catch { /* Resolve the nearest existing parent before appending missing segments. */ }
    const parent = dirname(current);
    if (parent === current) return resolve(path);
    tail.unshift(basename(current)); current = parent;
  }
};
const inside = (parent, child) => { const path = relative(canonical(parent), canonical(child)); return !isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep); };
export function nativePaths({ root = ROOT, platform = process.platform, home = homedir(), env = process.env, isDirectory = directory } = {}) {
  const bundle = platform === 'darwin' ? resolve(root, '../../..') : null;
  const portable = bundle ? dirname(bundle) : root;
  const legacy = join(portable, '.local');
  let dataDir;
  if (env.APPLY_TRACKER_DATA) dataDir = resolve(root, env.APPLY_TRACKER_DATA);
  else if (isDirectory(legacy)) dataDir = legacy;
  else if (platform === 'darwin') dataDir = join(home, 'Library', 'Application Support', 'Tawdheef');
  else if (platform === 'win32') dataDir = join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'Tawdheef');
  else dataDir = join(env.XDG_DATA_HOME && isAbsolute(env.XDG_DATA_HOME) ? env.XDG_DATA_HOME : join(home, '.local', 'share'), 'tawdheef');
  dataDir = resolve(dataDir);
  if (bundle) {
    if (inside(bundle, dataDir)) throw new Error('Choose APPLY_TRACKER_DATA outside Tawdheef.app. Private data cannot be stored in the signed app bundle.');
  }
  const workspace = env.TAWDHEEF_WORKSPACE ? resolve(root, env.TAWDHEEF_WORKSPACE) : join(dataDir, 'workspace');
  if (bundle) {
    if (inside(bundle, workspace)) throw new Error('Choose TAWDHEEF_WORKSPACE outside Tawdheef.app. Assistant settings cannot change the signed bundle.');
  }
  return { root, bundle, dataDir, workspace, legacy: dataDir === legacy };
}

export async function startNative({ root = ROOT, args = process.argv.slice(2), env = process.env } = {}) {
  if (args.some(argument => argument !== '--no-open')) throw new Error('Only --no-open is supported.');
  const paths = nativePaths({ root, env });
  const next = runtimeEnvironment({ ...env, APPLY_TRACKER_DATA: paths.dataDir, TAWDHEEF_WORKSPACE: paths.workspace, TAWDHEEF_NATIVE_APP: '1' });
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [join(root, 'scripts', 'start.mjs'), ...args], { cwd: root, env: next, shell: false, windowsHide: true, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? accept(paths) : reject(new Error('Tawdheef could not start. Open its local background log or run the diagnostic command.')));
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) startNative().catch(error => { console.error(error.message); process.exitCode = 1; });
