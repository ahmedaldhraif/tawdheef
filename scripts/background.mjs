import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, unlink, open, lstat } from 'node:fs/promises';
import { join, resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { runtimeEnvironment } from './runtime-env.mjs';
import { homedir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = join(root, 'server', 'index.mjs');
const marker = 'Apply Tracker managed startup launcher';
const getDataDir = options => resolve(options?.dataDir || process.env.APPLY_TRACKER_DATA || join(root, '.local'));
const statePath = options => join(getDataDir(options), 'background.json');

async function readState(options) { try { return JSON.parse(await readFile(statePath(options), 'utf8')); } catch { return null; } }
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
const startupPlatforms = new Set(['win32', 'darwin', 'linux']);

/** Render only: no startup settings, process or schedules are changed here. */
export function renderStartupLauncher(options = {}) {
  const platform = options.platform || process.platform;
  if (!startupPlatforms.has(platform)) return null;
  const env = options.env || process.env;
  const home = options.home || homedir();
  const appRoot = options.root || root;
  const executable = options.executable || process.execPath;
  const scriptPath = options.scriptPath || fileURLToPath(import.meta.url);
  const dataDir = options.dataDir || getDataDir(options);
  const port = Number(options.port || env.APPLY_TRACKER_PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be a whole number from 1 to 65535.');
  if ([home, appRoot, executable, scriptPath, dataDir, env.APPDATA, env.XDG_CONFIG_HOME].filter(Boolean).some(value => /[\u0000-\u001f\u007f]/.test(value))) throw new Error('Startup paths cannot contain control characters.');
  if (platform === 'win32') {
    if (!env.APPDATA) throw new Error('Windows APPDATA is unavailable. Startup installation was not changed.');
    const launcher = join(env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Apply Tracker.vbs');
    const vbs = value => value.replaceAll('"', '""');
    const commandLine = `"${executable}" "${scriptPath}" start`;
    const content = `' ${marker}\r\nSet shell = CreateObject("WScript.Shell")\r\nshell.CurrentDirectory = "${vbs(appRoot)}"\r\nshell.Environment("PROCESS")("APPLY_TRACKER_DATA") = "${vbs(dataDir)}"\r\nshell.Environment("PROCESS")("APPLY_TRACKER_PORT") = "${port}"\r\nshell.Run "${vbs(commandLine)}", 0, False\r\n`;
    return { launcher, content };
  }
  if (platform === 'darwin') {
    const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
    const content = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<!-- ${marker} -->\n<plist version="1.0"><dict>\n<key>Label</key><string>com.tawdheef.tracker</string>\n<key>ProgramArguments</key><array>${[executable, scriptPath, 'start'].map(value => `<string>${xml(value)}</string>`).join('')}</array>\n<key>WorkingDirectory</key><string>${xml(appRoot)}</string>\n<key>EnvironmentVariables</key><dict><key>APPLY_TRACKER_DATA</key><string>${xml(dataDir)}</string><key>APPLY_TRACKER_PORT</key><string>${port}</string></dict>\n<key>RunAtLoad</key><true/>\n<key>AbandonProcessGroup</key><true/>\n</dict></plist>\n`;
    return { launcher: join(home, 'Library', 'LaunchAgents', 'com.tawdheef.tracker.plist'), content };
  }
  // Desktop Entry Exec is tokenized by the desktop, never by a shell. Its
  // string escaping is applied before argument quoting and %% field codes.
  const desktopString = value => value.replaceAll('\\', '\\\\');
  const argument = value => `"${desktopString(String(value).replace(/["`$\\]/g, '\\$&').replaceAll('%', '%%'))}"`;
  const configHome = env.XDG_CONFIG_HOME && isAbsolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : join(home, '.config');
  const args = ['/usr/bin/env', `APPLY_TRACKER_DATA=${dataDir}`, `APPLY_TRACKER_PORT=${port}`, executable, scriptPath, 'start'];
  const content = `[Desktop Entry]\nType=Application\nVersion=1.0\nName=Tawdheef\nComment=${marker}\nExec=${args.map(argument).join(' ')}\nPath=${desktopString(appRoot).replaceAll(' ', '\\s')}\nTerminal=false\n`;
  return { launcher: join(configHome, 'autostart', 'com.tawdheef.tracker.desktop'), content };
}

async function startupInfo(options = {}) {
  const startupSupported = startupPlatforms.has(options.platform || process.platform);
  let startupInstalled = false;
  if (startupSupported) {
    try {
      const launcher = renderStartupLauncher(options)?.launcher;
      startupInstalled = (await readFile(launcher, 'utf8')).includes(marker);
    } catch { /* Not installed or unavailable to this user. */ }
  }
  return { startupSupported, startupInstalled };
}

async function identityMatches(state) {
  if (!state || !Number.isSafeInteger(state.pid) || state.pid <= 0 || !state.nonce || state.root !== root || !alive(state.pid)) return false;
  try {
    const response = await fetch(`http://127.0.0.1:${state.port || 4000}/api/health`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return false;
    const health = await response.json();
    return health.ok === true && health.instanceId === state.nonce;
  } catch { return false; }
}

export async function backgroundCommand(command, options = {}) {
  const dataDir = getDataDir(options);
  const port = Number(options.port || process.env.APPLY_TRACKER_PORT || 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be a whole number from 1 to 65535.');
  if (command === 'status') {
    const state = await readState(options);
    return { running: await identityMatches(state), pid: state?.pid ?? null, startedAt: state?.startedAt ?? null, logFile: join(dataDir, 'background.log'), ...await startupInfo(options) };
  }
  if (command === 'start') {
    const state = await readState(options);
    if (await identityMatches(state)) return { running: true, pid: state.pid, alreadyRunning: true };
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    const nonce = `apply-tracker-${randomUUID()}`;
    const output = await open(join(dataDir, 'background.log'), 'a', 0o600);
    const child = spawn(process.execPath, [serverPath], { cwd: root, env: { ...runtimeEnvironment(), APPLY_TRACKER_DATA: dataDir, APPLY_TRACKER_PORT: String(port), APPLY_TRACKER_INSTANCE: nonce }, detached: true, windowsHide: true, stdio: ['ignore', output.fd, output.fd] });
    const pid = await new Promise((accept, reject) => { child.once('spawn', () => accept(child.pid)); child.once('error', reject); });
    child.unref();
    await output.close();
    const next = { pid, nonce, root, port, startedAt: new Date().toISOString() };
    await writeFile(statePath(options), JSON.stringify(next, null, 2), { mode: 0o600 });
    let ready = false;
    for (let attempt = 0; attempt < 20 && alive(pid); attempt++) {
      await new Promise(accept => setTimeout(accept, 300));
      if (await identityMatches(next)) { ready = true; break; }
    }
    if (!ready) throw new Error(`The background process did not become ready. Check ${join(dataDir, 'background.log')}.`);
    return { running: true, pid, logFile: join(dataDir, 'background.log'), nextStep: 'Open the local app. The computer must remain awake and online for scheduled updates.' };
  }
  if (command === 'stop') {
    const state = await readState(options);
    if (!state || !alive(state.pid)) { await unlink(statePath(options)).catch(() => {}); return { running: false }; }
    if (!(await identityMatches(state))) throw new Error('Saved PID belongs to an unverified process. It was not stopped. Check the local process and remove stale background.json if appropriate.');
    process.kill(state.pid, 'SIGTERM');
    for (let attempt = 0; attempt < 30 && alive(state.pid); attempt++) await new Promise(accept => setTimeout(accept, 100));
    if (alive(state.pid)) return { running: true, stopping: true, pid: state.pid, nextStep: 'Shutdown was requested. Check background status again shortly.' };
    await unlink(statePath(options)).catch(() => {});
    return { running: false, stoppedPid: state.pid };
  }
  if (command === 'install' || command === 'uninstall') {
    const definition = renderStartupLauncher({ ...options, dataDir, port });
    if (!definition) return { installed: false, supported: false, nextStep: 'Configure your user login manager to run: node scripts/background.mjs start. Keep the working directory as this checkout and APPLY_TRACKER_DATA consistent.' };
    const { launcher, content } = definition;
    try { if ((await lstat(launcher)).isSymbolicLink()) throw new Error('The startup file is a link. It was not changed.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (command === 'uninstall') {
      const contents = await readFile(launcher, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
      if (contents && !contents.includes(marker)) throw new Error('The startup file was changed by another program. It was not removed.');
      if (contents) await unlink(launcher);
      return { installed: false, nextStep: 'Start-at-login removed. An already running tracker remains running until you stop it.' };
    }
    const previous = await readFile(launcher, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
    if (previous && !previous.includes(marker)) throw new Error('A different Apply Tracker startup launcher already exists. It was not overwritten.');
    await mkdir(dirname(launcher), { recursive: true, mode: 0o700 });
    await writeFile(launcher, content, { encoding: 'utf8', mode: 0o600, flag: previous ? 'w' : 'wx' });
    return { installed: true, supported: true, launcher, nextStep: 'The tracker starts in the background at your next desktop sign-in. Keep this app folder in place. Use background start to start it now.' };
  }
  throw new Error('Expected background start, stop, status, install or uninstall.');
}

export const startBackground = options => backgroundCommand('start', options);
export const stopBackground = options => backgroundCommand('stop', options);
export const backgroundStatus = options => backgroundCommand('status', options);
export const installBackground = options => backgroundCommand('install', options);
export const uninstallBackground = options => backgroundCommand('uninstall', options);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  backgroundCommand(process.argv[2] || 'status').then(result => process.stdout.write(`${JSON.stringify({ ok: true, data: result }, null, 2)}\n`)).catch(error => { process.stderr.write(`${JSON.stringify({ ok: false, error: error.message })}\n`); process.exitCode = 1; });
}
