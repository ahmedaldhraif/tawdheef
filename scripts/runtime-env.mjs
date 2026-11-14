import { dirname } from 'node:path';

/** npm lifecycle commands must find the same Node even from Finder/Explorer. */
export function runtimeEnvironment(env = process.env, executable = process.execPath, platform = process.platform) {
  const next = { ...env }, keys = Object.keys(next).filter(key => platform === 'win32' ? key.toLowerCase() === 'path' : key === 'PATH');
  const current = keys.map(key => next[key]).find(Boolean) || '';
  for (const key of keys) delete next[key];
  const separator = platform === 'win32' ? ';' : ':';
  const directory = platform === 'win32' ? executable.replace(/[\\/][^\\/]+$/, '') : dirname(executable);
  const systemRoot = env.SystemRoot || env.WINDIR;
  const systemTools = platform === 'win32'
    ? systemRoot ? [systemRoot.replace(/[\\/]$/, '') + '\\System32', systemRoot.replace(/[\\/]$/, '') + '\\System32\\WindowsPowerShell\\v1.0', systemRoot] : []
    : ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  const seen = new Set();
  next.PATH = [directory, ...current.split(separator), ...systemTools].filter(value => {
    const key = platform === 'win32' ? value.toLowerCase() : value;
    if (!value || seen.has(key)) return false;
    seen.add(key); return true;
  }).join(separator);
  return next;
}
