import { spawn } from 'node:child_process';
import { readFile, access, mkdir, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { defaultDataDir } from '../scripts/app-paths.mjs';

export const INTEGRATIONS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const INTEGRATIONS = Object.freeze([
  { id: 'google-cli', name: 'Google Workspace CLI', package: '@googleworkspace/cli', version: '0.22.5', bin: 'run.js', mode: 'cli', license: 'Apache-2.0', source: 'https://github.com/googleworkspace/cli' },
  { id: 'playwright', name: 'Browser tools', package: '@playwright/mcp', version: '0.0.85', bin: 'cli.js', mode: 'mcp', license: 'Apache-2.0', source: 'https://github.com/microsoft/playwright-mcp' },
  { id: 'outlook-mcp', name: 'Microsoft 365 mail MCP', package: '@softeria/ms-365-mcp-server', version: '0.184.1', bin: 'dist/index.js', mode: 'mcp', license: 'MIT', source: 'https://github.com/Softeria/ms-365-mcp-server' },
  { id: 'tabbio', name: 'Tabbio CLI', package: '@tabbio-technologies/cli', version: '1.3.1', bin: 'dist/cli.js', mode: 'mcp', license: 'UNLICENSED', source: 'https://www.tabbio.com/en/mcp' },
]);

function locations(options = {}) {
  const root = resolve(options.root || INTEGRATIONS_ROOT);
  const dataDir = resolve(options.dataDir || defaultDataDir(root));
  const port = Number(options.port || process.env.APPLY_TRACKER_PORT || 4000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Choose a port from 1024 to 65535.');
  return { root, dataDir, port };
}

async function packageLocation(item, options) {
  const { root, dataDir } = locations(options);
  for (const nodeModules of [join(root, 'node_modules'), join(dataDir, 'integrations', 'node_modules')]) {
    const directory = join(nodeModules, ...item.package.split('/'));
    try {
      const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      const entry = join(directory, item.bin);
      await access(entry, constants.R_OK);
      let executable;
      if (item.id === 'google-cli') {
        const { getPlatform } = createRequire(entry)('./platform.js');
        executable = join(directory, 'bin', getPlatform().binary);
        await access(executable, constants.R_OK);
      }
      return { entry, ...(executable ? { executable } : {}), installed: true, version: manifest.version, versionMatches: manifest.version === item.version };
    } catch { /* An optional integration can be installed later. */ }
  }
  return { installed: false, version: null, versionMatches: false };
}

/** Public recipes contain paths, versions and login instructions, never credentials. */
export async function integrationPresets(options = {}) {
  const { dataDir } = locations(options);
  return Promise.all(INTEGRATIONS.map(async item => {
    const supported = !(item.id === 'google-cli' && (options.platform || process.platform) === 'win32' && (options.arch || process.arch) !== 'x64');
    const installed = await packageLocation(item, options);
    let browserInstalled;
    if (item.id === 'playwright' && installed.installed) {
      try {
        const { chromium } = createRequire(installed.entry)('playwright');
        await access(chromium.executablePath(), constants.R_OK);
        browserInstalled = true;
      } catch { browserInstalled = false; }
    }
    const args = item.id === 'playwright'
      ? ['--browser', 'chromium', '--user-data-dir', join(dataDir, 'browser-profile'), '--output-dir', join(dataDir, 'browser-output')]
      : item.id === 'outlook-mcp'
        ? ['--enabled-tools', '^(graph-batch|get-current-user|list-mail-messages|get-mail-message|create-draft-email|send-draft-message|verify-login)$', '--allowed-scopes', 'User.Read Mail.ReadWrite Mail.Send']
        : item.id === 'tabbio' ? ['mcp', 'serve'] : [];
    const env = item.id === 'google-cli' ? { GOOGLE_WORKSPACE_CLI_CONFIG_DIR: join(dataDir, 'google-cli') }
      : item.id === 'outlook-mcp' ? {
        MS365_MCP_TOKEN_CACHE_PATH: join(dataDir, 'outlook-mcp', 'token-cache.json'),
        MS365_MCP_SELECTED_ACCOUNT_PATH: join(dataDir, 'outlook-mcp', 'selected-account.json'),
        MS365_MCP_GRAPH_MAX_RETRIES: '0',
        MS365_MCP_REQUIRE_CONFIRM: 'true',
      } : {};
    return {
      ...item, ...installed, supported, expectedVersion: item.version, ready: supported && installed.installed && installed.versionMatches,
      ...(browserInstalled !== undefined ? { browserInstalled } : {}),
      command: installed.executable || process.execPath,
      args: installed.entry ? [...(installed.executable ? [] : [installed.entry]), ...args] : [],
      env,
      ...(item.id === 'google-cli' ? { loginArgs: installed.executable ? ['auth', 'login', '--scopes', 'https://www.googleapis.com/auth/gmail.readonly,https://www.googleapis.com/auth/gmail.send'] : [], setupArgs: installed.executable ? ['auth', 'setup'] : [] } : {}),
      ...(item.id === 'tabbio' ? { loginArgs: installed.entry ? [installed.entry, 'login'] : [] } : {}),
      ...(item.id === 'outlook-mcp' ? { loginArgs: installed.entry ? [installed.entry, ...args, '--login'] : [] } : {}),
      nextStep: installed.installed
        ? installed.versionMatches ? (item.id === 'playwright' ? 'Install Chromium with npm run setup -- --local-adapters --browser, then add these browser tools to your AI client.' : 'Sign in before using this integration. Installation is not account access.') : `Run npm run setup -- --local-adapters --integration ${item.id} to restore the pinned integration version.`
        : !supported ? 'This optional bridge is unavailable on this platform. Choose a native provider in Connections.' : `Run npm run setup -- --local-adapters --integration ${item.id} to install only this integration.`,
    };
  }));
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
  if ((options.mode || (options.localAdapters ? 'local-adapters' : 'native')) === 'native') return {
    mode: 'native', owner: 'selected_ai_client',
    runtime: { node: process.version, supported: Number(process.versions.node.split('.')[0]) >= 24, platform: process.platform, architecture: process.arch },
    app: await runningApp(paths), integrations: [], accountConnected: false,
    nextStep: 'Check the connections actually available in your Codex or Claude Code client. Tawdheef keeps local guidance, scope and recorded outcomes.',
  };
  let config = {};
  try { config = JSON.parse(await readFile(join(paths.dataDir, 'connections.private.json'), 'utf8')); } catch { /* Status is useful before first setup. */ }
  const oauth = config.email?.config?.oauth || {};
  const provider = config.email?.config?.adapter;
  return {
    runtime: { node: process.version, supported: Number(process.versions.node.split('.')[0]) >= 24, platform: process.platform, architecture: process.arch },
    app: await runningApp(paths),
    oauth: {
      gmailConfigured: Boolean(process.env.APPLY_TRACKER_GOOGLE_CLIENT_ID || (provider === 'gmail' && oauth.clientId)),
      outlookConfigured: Boolean(process.env.APPLY_TRACKER_MICROSOFT_CLIENT_ID || (provider === 'outlook' && oauth.clientId)),
    },
    integrations: await integrationPresets(paths),
  };
}

/** Config generation is read-only. Optional servers are included only by name. */
export async function createClientConfig(options = {}) {
  const mode = options.mode || (options.localAdapters ? 'local-adapters' : 'native');
  if (!['native', 'local-adapters'].includes(mode)) throw new Error('Choose native or local-adapters connection mode.');
  if (options.assistant !== undefined && !['codex', 'claude-code'].includes(options.assistant)) throw new Error('Choose Codex or Claude Code for the client configuration.');
  if (options.monitor !== undefined && typeof options.monitor !== 'boolean') throw new Error('monitor must be true or false.');
  if (options.monitorAssistant !== undefined && !['codex', 'claude-code'].includes(options.monitorAssistant)) throw new Error('Choose a supported monitoring assistant.');
  if (options.monitor && !options.monitorAssistant) throw new Error('Choose the selected monitoring assistant for this dedicated workspace.');
  if (options.monitor && options.include?.length) throw new Error('The monitoring workspace uses native read tools; application browser servers belong in the ordinary workspace.');
  const { root, dataDir, port } = locations(options);
  const include = options.include || [];
  if (!Array.isArray(include) || include.some(id => !['playwright', 'tabbio', 'outlook-mcp'].includes(id))) throw new Error('Choose playwright, tabbio or outlook-mcp for optional MCP servers. Google CLI is a CLI, not an MCP server.');
  const assistant = options.assistant || options.monitorAssistant || 'codex';
  const mcpServers = {
    'apply-tracker': { command: process.execPath, args: [join(root, 'server', 'mcp.mjs')], env: { APPLY_TRACKER_DATA: dataDir, APPLY_TRACKER_PORT: String(port), APPLY_TRACKER_CONNECTION_MODE: mode, APPLY_TRACKER_CLIENT: assistant } },
  };
  const presets = mode === 'local-adapters' ? await integrationPresets({ root, dataDir, port }) : [];
  for (const id of new Set(include)) {
    if (mode === 'native') {
      if (id !== 'tabbio') throw new Error('Use the selected client’s native browser, email and calendar tools. Local bridge servers require explicit --local-adapters mode.');
      mcpServers.tabbio = { url: 'https://server.tabbio.com/api/mcp' };
      continue;
    }
    const item = presets.find(preset => preset.id === id);
    if (!item.ready) throw new Error(`${item.name} is not installed at the pinned version. ${item.nextStep}`);
    mcpServers[id] = { command: item.command, args: item.args, ...(Object.keys(item.env).length ? { env: item.env } : {}) };
  }
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

function commandKey(args) {
  if (args[0] === '--version' && args.length === 1) return { prefix: ['--version'], flags: [], text: true };
  if (args[0] === 'auth' && args[1] === 'status' && args.length === 2) return { prefix: ['auth', 'status'], flags: [] };
  const choices = [
    { prefix: ['gmail', 'users', 'getProfile'], flags: ['--params', '--format'] },
    { prefix: ['gmail', 'users', 'threads', 'get'], flags: ['--params', '--format'] },
    { prefix: ['gmail', 'users', 'messages', 'get'], flags: ['--params', '--format'] },
    { prefix: ['gmail', 'users', 'messages', 'list'], flags: ['--params', '--format'] },
    { prefix: ['gmail', 'users', 'messages', 'send'], flags: ['--params', '--json', '--format'], write: true },
    { prefix: ['gmail', '+send'], flags: ['--to', '--subject', '--body', '--format'], write: true },
  ];
  return choices.find(choice => choice.prefix.every((value, index) => args[index] === value));
}

export function validateGwsArgs(args, { allowWrite = false } = {}) {
  if (!Array.isArray(args) || args.length > 24 || args.some(value => typeof value !== 'string' || value.includes('\0') || value.length > 2_000_000)) throw new Error('Google CLI arguments must be a bounded list of strings.');
  const command = commandKey(args);
  if (!command) throw new Error('This Google CLI command is unavailable in the tracker. Use tracked Gmail profile, message or thread commands.');
  if (command.write && !allowWrite) throw new Error('Google CLI sending requires an authorized tracker send action.');
  const seen = new Set();
  for (let index = command.prefix.length; index < args.length; index += 2) {
    const flag = args[index], value = args[index + 1];
    if (!command.flags.includes(flag) || seen.has(flag) || value === undefined) throw new Error('This Google CLI option is not supported.');
    seen.add(flag);
    if (flag === '--format' && value !== 'json') throw new Error('Google CLI output must use JSON.');
    if (['--params', '--json'].includes(flag)) {
      let parsed;
      try { parsed = JSON.parse(value); } catch { throw new Error('Google CLI API arguments must be valid JSON.'); }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Google CLI API arguments must be JSON objects.');
      if (flag === '--params' && parsed.userId !== 'me') throw new Error('Google CLI access is limited to the signed-in mailbox.');
    }
    if (['--to', '--subject'].includes(flag) && /[\r\n]/.test(value)) throw new Error('Email headers must be one line.');
  }
  if (command.prefix[1] === '+send' && !['--to', '--subject', '--body'].every(flag => seen.has(flag))) throw new Error('Sending needs a recipient, subject and body.');
  if (command.prefix[1] === 'users' && !seen.has('--params')) throw new Error('Google CLI requests must identify the signed-in mailbox.');
  return { write: Boolean(command.write), text: Boolean(command.text) };
}

/** Runs only bounded Gmail commands. Never uses a shell or retries writes. */
export async function runGws(args, options = {}) {
  const command = validateGwsArgs(args, options);
  const { root, dataDir } = locations(options);
  const item = await packageLocation(INTEGRATIONS.find(entry => entry.id === 'google-cli'), { root, dataDir });
  if (!item.installed || !item.versionMatches) throw new Error('Google Workspace CLI is unavailable. Run npm run setup -- --local-adapters --integration google-cli to install the pinned version.');
  const timeout = options.timeout ?? 30_000;
  const maxOutput = options.maxOutput ?? 2 * 1024 * 1024;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 120_000 || !Number.isInteger(maxOutput) || maxOutput < 1 || maxOutput > 10 * 1024 * 1024) throw new Error('Choose bounded Google CLI timeout and output limits.');
  if (!['auth', '--version'].includes(args[0])) await mkdir(join(dataDir, 'google-cli'), { recursive: true, mode: 0o700 });
  const allowedEnvironment = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY'];
  const env = Object.fromEntries(allowedEnvironment.filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  const supplied = options.env || {};
  for (const [key, value] of Object.entries(supplied)) {
    if (!['GOOGLE_WORKSPACE_CLI_CLIENT_ID', 'GOOGLE_WORKSPACE_CLI_CLIENT_SECRET', 'GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE', 'GOOGLE_WORKSPACE_CLI_TOKEN', 'GOOGLE_WORKSPACE_PROJECT_ID'].includes(key) || typeof value !== 'string') throw new Error('Unsupported Google CLI environment variable.');
    env[key] = value;
  }
  env.GOOGLE_WORKSPACE_CLI_CONFIG_DIR = join(dataDir, 'google-cli');
  return new Promise((accept, reject) => {
    const child = spawn(item.executable, args, { cwd: root, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let bytes = 0, finished = false;
    const finish = (error, result) => { if (finished) return; finished = true; clearTimeout(timer); error ? reject(error) : accept(result); };
    const timer = setTimeout(() => { child.kill(); finish(new Error(command.write ? 'Google CLI send outcome is unknown. Inspect the mailbox before retrying.' : 'Google CLI timed out. Check the connection and try again.')); }, timeout);
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > maxOutput) { child.kill(); finish(new Error(command.write ? 'Google CLI send outcome is unknown because its response exceeded the limit. Inspect the mailbox before retrying.' : 'Google CLI response exceeded the limit. Request a smaller result.')); }
      else chunks.push(chunk);
    });
    // Provider stderr can contain private information; never return it to logs/UI.
    child.stderr.on('data', () => {});
    child.on('error', () => finish(new Error('Google CLI could not start. Run npm run doctor.')));
    child.on('close', code => {
      if (finished) return;
      const output = Buffer.concat(chunks).toString('utf8');
      if (code !== 0) return finish(new Error(code === 2 ? 'Google CLI sign-in is required. Run npm run setup -- --login google-cli, then reconnect Gmail.' : command.write ? 'Google CLI send was not confirmed. Inspect the mailbox before retrying.' : 'Google CLI request failed. Check Google CLI sign-in, Gmail API access and the requested thread.'));
      if (command.text) return finish(null, { version: output.trim().split(/\r?\n/)[0] });
      try {
        const parsed = JSON.parse(output);
        if (!parsed || typeof parsed !== 'object') throw new Error();
        if (parsed.error) throw new Error();
        finish(null, parsed);
      } catch { finish(new Error(command.write ? 'Google CLI send outcome is unknown. Inspect the mailbox before retrying.' : 'Google CLI did not return a usable JSON response.')); }
    });
  });
}
