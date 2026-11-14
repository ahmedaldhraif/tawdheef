import { spawn } from 'node:child_process';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { constants } from 'node:os';
import { runtimeEnvironment } from './runtime-env.mjs';

const ENTRIES = new Set(['scripts/start.mjs', 'scripts/background.mjs', 'scripts/agent-setup.mjs', 'bin/apply-tracker.mjs', 'server/mcp.mjs']);
const controls = /[\u0000-\u001f\u007f]/;
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fail = message => { throw new Error(`Active Tawdheef installation: ${message} The source checkout and private data were not changed.`); };
const absolute = (value, label) => {
  if (typeof value !== 'string' || !value || controls.test(value) || !isAbsolute(value)) fail(`${label} must be an absolute path without control characters.`);
  return resolve(value);
};
const samePath = (a, b, platform) => platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

/** Pure launch specification. Explicit alternate data/workspace/port requests
 * remain in the source checkout; they must never redirect to installed data. */
export function installedAppLaunchSpec({ sourceRoot, pointer, manifest, entry, args = [], env = process.env, platform = process.platform, arch = process.arch, cwd = process.cwd() }) {
  sourceRoot = absolute(sourceRoot, 'Source root');
  if (!ENTRIES.has(entry)) fail('Use a supported start, background, agent setup, CLI or MCP entry point.');
  if (!plain(pointer) || Object.keys(pointer).some(key => !['format', 'appRoot', 'dataDir', 'workspace', 'port'].includes(key)) || pointer.format !== 1) fail('The private active-install.json pointer is invalid; review or remove it before starting.');
  const appRoot = absolute(pointer.appRoot, 'Installed app root'), dataDir = absolute(pointer.dataDir, 'Private data directory'), workspace = absolute(pointer.workspace, 'Workspace');
  if (samePath(appRoot, sourceRoot, platform)) fail('The installed app must be separate from this source checkout.');
  if (!samePath(workspace, sourceRoot, platform)) fail('The pointer belongs to a different source workspace.');
  if (!Number.isInteger(pointer.port) || pointer.port < 1024 || pointer.port > 65535) fail('The local port must be a whole number from 1024 to 65535.');
  if (!plain(manifest) || manifest.format !== 1 || manifest.name !== 'Tawdheef' || manifest.prebuilt !== true || manifest.platform !== platform || manifest.arch !== arch) fail('Choose a prebuilt Tawdheef package for this operating system and architecture.');
  if (!Array.isArray(args) || args.some(value => typeof value !== 'string' || value.includes('\0'))) fail('Entry arguments must be strings without null characters.');
  for (const [key, expected] of [['APPLY_TRACKER_DATA', dataDir], ['TAWDHEEF_WORKSPACE', workspace]]) {
    if (env[key] && !samePath(resolve(env[key]), expected, platform)) return null;
  }
  if (env.APPLY_TRACKER_PORT && String(env.APPLY_TRACKER_PORT) !== String(pointer.port)) return null;
  const executable = join(appRoot, 'runtime', ...(platform === 'win32' ? ['node.exe'] : ['bin', 'node']));
  return { command: executable, args: [join(appRoot, entry), ...args], options: {
    cwd: entry === 'bin/apply-tracker.mjs' ? absolute(cwd, 'CLI working directory') : workspace, stdio: 'inherit', windowsHide: true,
    env: runtimeEnvironment({ ...env, APPLY_TRACKER_DATA: dataDir, TAWDHEEF_WORKSPACE: workspace, APPLY_TRACKER_PORT: String(pointer.port) }, executable, platform),
  } };
}

async function jsonFile(path, maximum, label) {
  const info = await lstat(path);
  if (!info.isFile() || info.size > maximum) fail(`${label} must be a small regular JSON file.`);
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch { fail(`${label} is not valid JSON; review the installation before starting.`); }
}

export async function getInstalledAppLaunch({ sourceRoot, entry, args = process.argv.slice(2), env = process.env, platform = process.platform, arch = process.arch, cwd = process.cwd() } = {}) {
  sourceRoot = absolute(sourceRoot, 'Source root');
  // Packaged applications always run their own entry, never another pointer.
  try { await lstat(join(sourceRoot, 'tawdheef-app.json')); return null; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const path = join(sourceRoot, '.tawdheef-setup', 'active-install.json');
  let pointer;
  try { pointer = await jsonFile(path, 16 * 1024, 'active-install.json'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const appRoot = absolute(pointer?.appRoot, 'Installed app root');
  let manifest;
  try { manifest = await jsonFile(join(appRoot, 'tawdheef-app.json'), 64 * 1024, 'Installed app manifest'); }
  catch (error) { if (error.code === 'ENOENT') fail('The pointed-to app manifest is missing; restore the reviewed app before starting.'); throw error; }
  const spec = installedAppLaunchSpec({ sourceRoot, pointer, manifest, entry, args, env, platform, arch, cwd });
  if (!spec) return null;
  if (samePath(await realpath(appRoot), await realpath(sourceRoot), platform)) fail('The installed app resolves to this source checkout.');
  try { if (!(await lstat(pointer.dataDir)).isDirectory()) fail('The existing private data path is not a directory.'); }
  catch (error) { if (error.code === 'ENOENT') fail('The existing private data directory is missing; review its original location before starting.'); throw error; }
  for (const [path, label] of [[spec.command, 'Bundled Node runtime'], [spec.args[0], 'Installed entry point']]) {
    try { if (!(await lstat(path)).isFile()) fail(`${label} is missing or is not a regular file.`); }
    catch (error) { if (error.code === 'ENOENT') fail(`${label} is missing; restore the reviewed app before starting.`); throw error; }
  }
  return spec;
}

/** Forward just this invocation. No install, build, provider or fallback runs. */
export async function forwardInstalledApp(options) {
  const spec = await getInstalledAppLaunch(options);
  if (!spec) return false;
  const child = spawn(spec.command, spec.args, spec.options);
  const signals = ['SIGINT', 'SIGTERM'];
  const forwardSignal = signal => { if (child.exitCode === null && child.signalCode === null) child.kill(signal); };
  const handlers = new Map(signals.map(signal => [signal, () => forwardSignal(signal)]));
  for (const [signal, handler] of handlers) process.on(signal, handler);
  let result;
  try {
    result = await new Promise((accept, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => accept({ code, signal }));
    });
  } finally { for (const [signal, handler] of handlers) process.off(signal, handler); }
  if (result.signal) {
    process.exitCode = 128 + (constants.signals[result.signal] || 1);
    process.kill(process.pid, result.signal);
  } else process.exitCode = result.code ?? 1;
  return true;
}
