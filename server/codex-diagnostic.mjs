import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { AppError } from './store.mjs';

function configurationError(error) {
  // CLI stderr can contain private configuration. Keep only a known field category.
  const reasoning = /model_reasoning_effort/.test(String(error?.stderr || ''));
  return Object.assign(new AppError('The Codex diagnostic could not inspect its MCP configuration safely. Check the CLI settings, then test again.'), { configurationError: true, ...(reasoning ? { configurationField: 'model_reasoning_effort' } : {}) });
}
function readMetadata({ executable, args, cwd, env, timeoutMs, maxBuffer }) {
  return new Promise((accept, reject) => execFile(executable, args, { cwd, env, timeout: timeoutMs, maxBuffer, windowsHide: true, shell: false }, (error, stdout, stderr) => error ? reject(configurationError({ stderr })) : accept(stdout)));
}

/** Read-only CLI metadata, then stricter invocation-only overrides; never edit CODEX_HOME. */
export async function prepareCodexDiagnostic({ executable, cwd, env, runMetadata = readMetadata }) {
  let raw;
  try { raw = await runMetadata({ executable: executable.command, args: [...(executable.args || []), '--sandbox', 'read-only', '--cd', cwd, 'mcp', 'list', '--json'], cwd, env, timeoutMs: 15000, maxBuffer: 256000 }); }
  catch (error) { throw error?.configurationError ? error : configurationError(error); }
  let servers;
  try { if (typeof raw !== 'string' || Buffer.byteLength(raw) > 256000) throw new Error(); servers = JSON.parse(raw); }
  catch { throw configurationError(); }
  if (!Array.isArray(servers) || servers.length > 256 || servers.some(server => !server || typeof server.name !== 'string' || !/^[\x20-\x7e]{1,128}$/.test(server.name))) throw configurationError();
  const names = [...new Set(servers.map(server => server.name))];
  let serverName;
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = 'tawdheef-check-' + randomUUID().replaceAll('-', '');
    if (!names.includes(candidate)) { serverName = candidate; break; }
  }
  if (!serverName) throw configurationError();
  // An empty/whole mcp_servers table DEEP-MERGES with existing tables in Codex.
  // Disable every inherited name explicitly, then use a fresh name with no inherited fields.
  // Codex's dotted CLI key parser does not unquote path segments. Quote names
  // inside a TOML value instead, including names that themselves contain dots.
  const disabled = 'mcp_servers={' + names.map(name => `${JSON.stringify(name)}={enabled=false}`).join(',') + '}';
  if (disabled.length > 16000) throw configurationError();
  return { serverName, args: names.length ? ['-c', disabled] : [] };
}
