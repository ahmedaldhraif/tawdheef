/** Bounded local smoke checks. They use isolated records/profiles and never a model or provider. */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { INTEGRATIONS_ROOT } from './integrations.mjs';

const makeClient = () => new Client({ name: 'tawdheef-setup-check', version: '1.0.0' });
const makeTransport = options => new StdioClientTransport(options);
const localEnvironment = () => Object.fromEntries(['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'PLAYWRIGHT_BROWSERS_PATH'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));

export async function probeStdioTools({ command, args, env = {}, cwd, expectedTools = [], calls = [], timeoutMs = 20000, clientFactory = makeClient, transportFactory = makeTransport }) {
  const client = clientFactory();
  const transport = transportFactory({ command, args, env, cwd, stderr: 'pipe' });
  // Discard diagnostics: provider/tool output is not a public setup log.
  transport.stderr?.resume();
  let timer;
  try {
    const work = async () => {
      await client.connect(transport);
      const { tools } = await client.listTools();
      if (!expectedTools.every(name => tools.some(tool => tool.name === name))) throw new Error('Required local tools are unavailable.');
      for (const call of calls) {
        const result = await client.callTool(call, undefined, { timeout: timeoutMs });
        if (result.isError) throw new Error('The local smoke check failed.');
      }
      return { transportChecked: true, toolsChecked: true };
    };
    return await Promise.race([work(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Local tool check timed out.')), timeoutMs); })]);
  } finally {
    clearTimeout(timer);
    let closing;
    await Promise.race([Promise.allSettled([client.close(), transport.close()]), new Promise(resolve => { closing = setTimeout(resolve, 5000); })]);
    clearTimeout(closing);
  }
}

export async function checkTrackerMcp({ root = INTEGRATIONS_ROOT, timeoutMs, probe = probeStdioTools } = {}) {
  const temporary = await mkdtemp(join(tmpdir(), 'tawdheef-mcp-check-'));
  try {
    return await probe({ command: process.execPath, args: [join(root, 'server', 'mcp.mjs')], cwd: root,
      env: { PATH: process.env.PATH || process.env.Path || '', ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}), APPLY_TRACKER_DATA: join(temporary, 'records'), APPLY_TRACKER_PORT: '65532' },
      expectedTools: ['get_agent_context', 'get_capabilities', 'prepare_form_submission'], timeoutMs });
  } finally { await rm(temporary, { recursive: true, force: true, maxRetries: 5 }); }
}

export async function checkBrowserMcp({ browser, timeoutMs, probe = probeStdioTools } = {}) {
  if (!browser?.ready || !browser.browserInstalled || !browser.command) throw new Error('Install browser tools and Chromium first.');
  const temporary = await mkdtemp(join(tmpdir(), 'tawdheef-browser-check-'));
  // Never open the person's signed-in application profile during a setup check.
  const args = [];
  for (let index = 0; index < (browser.args || []).length; index++) {
    const arg = browser.args[index];
    if (['--user-data-dir', '--output-dir'].includes(arg)) { index++; continue; }
    if (/^--(?:user-data-dir|output-dir)=/.test(arg)) continue;
    args.push(arg);
  }
  args.push('--headless', '--user-data-dir', join(temporary, 'profile'), '--output-dir', join(temporary, 'output'));
  try {
    return await probe({ command: browser.command, args, env: localEnvironment(),
      expectedTools: ['browser_navigate', 'browser_close'], calls: [{ name: 'browser_navigate', arguments: { url: 'about:blank' } }, { name: 'browser_close', arguments: {} }], timeoutMs });
  } finally { await rm(temporary, { recursive: true, force: true, maxRetries: 5 }); }
}
