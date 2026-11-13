import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, unlink, open } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = join(root, 'server', 'index.mjs');
const marker = 'Apply Tracker managed startup launcher';
const getDataDir = options => resolve(options?.dataDir || process.env.APPLY_TRACKER_DATA || join(root, '.local'));
const statePath = options => join(getDataDir(options), 'background.json');

async function readState(options) { try { return JSON.parse(await readFile(statePath(options), 'utf8')); } catch { return null; } }
function alive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
async function startupInfo() {
  const startupSupported = process.platform === 'win32';
  let startupInstalled = false;
  if (startupSupported && process.env.APPDATA) {
    const launcher = join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Apply Tracker.vbs');
    try { startupInstalled = (await readFile(launcher, 'utf8')).includes(marker); } catch { /* Not installed or unavailable to this user. */ }
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
    return { running: await identityMatches(state), pid: state?.pid ?? null, startedAt: state?.startedAt ?? null, logFile: join(dataDir, 'background.log'), ...await startupInfo() };
  }
  if (command === 'start') {
    const state = await readState(options);
    if (await identityMatches(state)) return { running: true, pid: state.pid, alreadyRunning: true };
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    const nonce = `apply-tracker-${randomUUID()}`;
    const output = await open(join(dataDir, 'background.log'), 'a', 0o600);
    const child = spawn(process.execPath, [serverPath], { cwd: root, env: { ...process.env, APPLY_TRACKER_DATA: dataDir, APPLY_TRACKER_PORT: String(port), APPLY_TRACKER_INSTANCE: nonce }, detached: true, windowsHide: true, stdio: ['ignore', output.fd, output.fd] });
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
    if (process.platform !== 'win32') return { installed: false, supported: false, nextStep: 'Configure your user login manager to run: node scripts/background.mjs start. Keep the working directory as this checkout and APPLY_TRACKER_DATA consistent.' };
    if (!process.env.APPDATA) throw new Error('Windows APPDATA is unavailable. Startup installation was not changed.');
    const startup = join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
    const launcher = join(startup, 'Apply Tracker.vbs');
    if (command === 'uninstall') {
      const contents = await readFile(launcher, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
      if (contents && !contents.includes(marker)) throw new Error('The startup file was changed by another program. It was not removed.');
      if (contents) await unlink(launcher);
      return { installed: false, nextStep: 'Start-at-login removed. An already running tracker remains running until you stop it.' };
    }
    const previous = await readFile(launcher, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
    if (previous && !previous.includes(marker)) throw new Error('A different Apply Tracker startup launcher already exists. It was not overwritten.');
    const vbs = value => value.replaceAll('"', '""');
    const commandLine = `"${process.execPath}" "${fileURLToPath(import.meta.url)}" start`;
    const script = `' ${marker}\r\nSet shell = CreateObject("WScript.Shell")\r\nshell.CurrentDirectory = "${vbs(root)}"\r\nshell.Environment("PROCESS")("APPLY_TRACKER_DATA") = "${vbs(dataDir)}"\r\nshell.Environment("PROCESS")("APPLY_TRACKER_PORT") = "${port}"\r\nshell.Run "${vbs(commandLine)}", 0, False\r\n`;
    await mkdir(startup, { recursive: true });
    await writeFile(launcher, script, 'utf8');
    return { installed: true, launcher, nextStep: 'The tracker starts hidden at your next Windows sign-in. Use background start to start it now.' };
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
