/** Locate npm's JS entrypoint without running shell shims or assuming GUI PATH. */
import { access, realpath } from 'node:fs/promises';
import { dirname, join, delimiter } from 'node:path';

export async function findNpmCli(root) {
  const candidates = [process.env.npm_execpath,
    join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    join(root, 'runtime/lib/node_modules/npm/bin/npm-cli.js'),
    join(root, 'runtime/node_modules/npm/bin/npm-cli.js')];
  for (const directory of (process.env.PATH || '').split(delimiter).filter(Boolean)) {
    candidates.push(join(directory, 'node_modules/npm/bin/npm-cli.js'));
    try { const path = await realpath(join(directory, 'npm')); if (path.endsWith('.js')) candidates.push(path); } catch { /* Try the next installation. */ }
  }
  for (const path of candidates.filter(Boolean)) try { await access(path); return path; } catch { /* Missing candidate. */ }
  throw new Error('npm is missing. Use the complete Tawdheef app download, or install Node.js 26 LTS and reopen your terminal.');
}
