/** Local tracker configuration; external tools and authentication belong to the actual client. */
import { readFile, access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultDataDir } from '../scripts/app-paths.mjs';
export const INTEGRATIONS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function locations(options = {}) {
  const root = resolve(options.root || INTEGRATIONS_ROOT);
  const dataDir = resolve(options.dataDir || defaultDataDir(root));
  const port = Number(options.port || process.env.APPLY_TRACKER_PORT || 4000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a port from 1024 to 65535.');
  return { root, dataDir, port };
}

async function runningApp({ dataDir, port }) {
  const url = `http://127.0.0.1:${port}`;
  try {
    const health = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(1500) });
    const body = await health.json();
    if (!health.ok || body.app !== 'apply-tracker' || body.ok !== true) return { running: false, sameDataDirectory: false, url };
    const configResponse = await fetch(`${url}/api/agent-config`, { signal: AbortSignal.timeout(1500) });
    const config = await configResponse.json();
    const actualData = config.mcpServers?.['apply-tracker']?.env?.APPLY_TRACKER_DATA;
    return { running: true, sameDataDirectory: Boolean(actualData && resolve(actualData) === dataDir), url };
  } catch { return { running: false, sameDataDirectory: false, url }; }
}


export async function integrationStatus(options = {}) {
  const paths = locations(options);
  return { mode: 'native', owner: 'selected_ai_client',
    runtime: { node: process.version, supported: Number(process.versions.node.split('.')[0]) >= 24, platform: process.platform, architecture: process.arch },
    app: await runningApp(paths), integrations: [], accountConnected: false,
    nextStep: 'Check the connections actually available in your Codex or Claude Code client. Tawdheef keeps local guidance, scope and recorded outcomes.' };
}
/** Config generation is read-only. Optional servers are included only by name. */
export async function createClientConfig(options = {}) {
  if (options.localAdapters || (options.mode && options.mode !== 'native')) throw new Error('App-managed adapters have been retired. Use your actual Codex or Claude Code client.');
  const mode = 'native';
  if (options.assistant !== undefined && !['codex', 'claude-code'].includes(options.assistant)) throw new Error('Choose Codex or Claude Code for the client configuration.');
  if (options.monitor !== undefined && typeof options.monitor !== 'boolean') throw new Error('monitor must be true or false.');
  if (options.monitorAssistant !== undefined && !['codex', 'claude-code'].includes(options.monitorAssistant)) throw new Error('Choose a supported monitoring assistant.');
  if (options.monitor && !options.monitorAssistant) throw new Error('Choose the selected monitoring assistant for this dedicated workspace.');
  if (options.monitor && options.include?.length) throw new Error('The monitoring workspace uses native read tools; application browser servers belong in the ordinary workspace.');
  const { root, dataDir, port } = locations(options);
  const include = options.include || [];
  if (!Array.isArray(include) || include.some(id => id !== 'tabbio')) throw new Error('Use your actual client’s native browser, email and calendar tools. Only direct Tabbio MCP can be selected here.');
  const assistant = options.assistant || options.monitorAssistant || 'codex';
  const mcpServers = {
    'apply-tracker': { command: process.execPath, args: [join(root, 'server', 'mcp.mjs')], env: { APPLY_TRACKER_DATA: dataDir, APPLY_TRACKER_PORT: String(port), APPLY_TRACKER_CONNECTION_MODE: mode, APPLY_TRACKER_CLIENT: assistant } },
  };
  for (const id of new Set(include)) mcpServers[id] = { url: 'https://server.tabbio.com/api/mcp' };
  if (options.monitor) mcpServers['apply-tracker'].env.APPLY_TRACKER_MONITOR = '1';
  if (options.monitor && options.monitorAssistant) mcpServers['apply-tracker'].env.APPLY_TRACKER_MONITOR_ASSISTANT = options.monitorAssistant;
  const forClient = client => Object.fromEntries(Object.entries(mcpServers).map(([name, server]) => [name, server.env ? { ...server, env: { ...server.env, APPLY_TRACKER_CLIENT: client, ...(options.monitor ? { APPLY_TRACKER_MONITOR_ASSISTANT: client } : {}) } } : { ...server }]));
  const tomlString = value => JSON.stringify(String(value));
  const codexToml = Object.entries(forClient('codex')).map(([name, server]) => [
    `[mcp_servers.${name}]`, ...(server.url ? [`url = ${tomlString(server.url)}`] : [`command = ${tomlString(server.command)}`, `args = ${JSON.stringify(server.args)}`]),
    ...(server.env ? ['', `[mcp_servers.${name}.env]`, ...Object.entries(server.env).map(([key, value]) => `${key} = ${tomlString(value)}`)] : []),
  ].join('\n')).join('\n\n') + '\n';
  const claudeJson = JSON.stringify({ mcpServers: Object.fromEntries(Object.entries(forClient('claude-code')).map(([name, entry]) => [name, { type: entry.url ? 'http' : 'stdio', ...entry }])) }, null, 2) + '\n';
  const selectedServers = assistant === 'claude-code' ? Object.fromEntries(Object.entries(forClient(assistant)).map(([name, server]) => [name, server.url ? { type: 'http', ...server } : server])) : mcpServers;
  return { mode, assistant, mcpServers: selectedServers, codexToml, claudeJson, included: Object.keys(mcpServers), accountConnected: false };
}

export async function exportClientConfig(directory, options = {}) {
  if (typeof directory !== 'string' || !directory.trim()) throw new Error('Choose an output directory for the generated client configuration.');
  const output = resolve(directory);
  const config = await createClientConfig(options);
  await mkdir(output, { recursive: true });
  // Exclusive writes never replace a user's existing AI-client configuration.
  const files = [join(output, 'codex-mcp.toml'), join(output, 'claude-mcp.json')];
  for (const path of files) {
    try { await access(path); throw new Error(`The output file already exists: ${path}. Choose another folder.`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await writeFile(files[0], config.codexToml, { flag: 'wx', mode: 0o600 });
  await writeFile(files[1], config.claudeJson, { flag: 'wx', mode: 0o600 });
  return { files, included: config.included, nextStep: 'Review and merge the generated entries into your client settings. No AI-client settings were changed.' };
}
