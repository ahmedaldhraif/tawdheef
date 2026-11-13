import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { integrationPresets } from '../integrations.mjs';
import { createOutlookProvider } from './outlook.mjs';

function parsed(result) {
  if (result?.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
  for (const block of result?.content || []) if (block.type === 'text') {
    try { const value = JSON.parse(block.text); if (value && typeof value === 'object') return value; } catch { /* Never interpret prose as a Graph response. */ }
  }
  return null;
}

/**
 * Optional, locally installed Microsoft 365 MCP bridge. The same normalized
 * Outlook mailbox logic handles threads, outbox persistence and sent receipts.
 * Authentication remains in Softeria's own private cache; connecting this
 * adapter never invokes login or starts a browser in the background.
 */
export function createSofteriaProvider(options = {}) {
  const { auth = {}, config = {}, dataDir, saveAuth = async () => {}, clientFactory = () => new Client({ name: 'apply-tracker-outlook', version: '0.1.0' }, { capabilities: {} }), transportFactory = recipe => new StdioClientTransport(recipe), presets = integrationPresets } = options;
  let client, starting, account = auth.outlookMcpEmail || null;

  async function ensureReady() {
    if (client) return;
    if (starting) return starting;
    starting = (async () => {
      const integration = (await presets({ dataDir })).find(item => item.id === 'outlook-mcp');
      if (!integration?.ready) throw new Error('Install the pinned Outlook MCP bridge with npm run setup, then sign in using npm run connect -- outlook-mcp.');
      const candidate = clientFactory();
      const transport = transportFactory({ command: integration.command, args: integration.args, env: { ...getDefaultEnvironment(), ...integration.env, MS365_MCP_GRAPH_MAX_RETRIES: '0', MS365_MCP_GRAPH_TIMEOUT_MS: '30000', MS365_MCP_REQUIRE_CONFIRM: 'true' }, stderr: 'pipe' });
      if (transport.stderr) transport.stderr.on('data', () => {});
      try {
        await candidate.connect(transport, { timeout: 20_000 });
        const names = new Set(), cursors = new Set();
        let cursor;
        do {
          const page = await candidate.listTools(cursor ? { cursor } : {}, { timeout: 20_000 });
          for (const tool of page.tools || []) names.add(tool.name);
          cursor = page.nextCursor;
          if (cursor && cursors.has(cursor)) throw new Error('The Outlook MCP bridge repeated its tool page.');
          if (cursor) cursors.add(cursor);
          if (cursors.size > 100) throw new Error('The Outlook MCP bridge returned too many tool pages.');
        } while (cursor);
        if (!names.has('graph-batch')) throw new Error('The Outlook MCP bridge needs graph-batch enabled. Restore the pinned mail bridge settings with npm run setup.');
        client = candidate;
        candidate.onclose = () => { if (client === candidate) client = null; };
      } catch (error) { await candidate.close().catch(() => {}); throw error; }
    })().finally(() => { starting = null; });
    return starting;
  }

  async function graphCall(method, path, headers, body) {
    await ensureReady();
    let relative = path;
    if (/^https:/i.test(path)) {
      const url = new URL(path);
      if (url.origin !== 'https://graph.microsoft.com' || !url.pathname.startsWith('/v1.0/me/') || url.username || url.password || url.hash) throw new Error('The Outlook MCP bridge returned an unsupported page.');
      relative = url.pathname.slice('/v1.0'.length) + url.search;
    }
    if (!/^\/me(?:\?|$)|^\/me\/(?:messages(?:\/|\?|$)|mailFolders\/sentitems(?:\?|$))/.test(relative)) throw new Error('Choose a supported tracker mailbox operation.');
    const response = await client.callTool({ name: 'graph-batch', arguments: { body: { requests: [{ id: 'tracker', method, url: relative, headers: { ...headers, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body }) }] }, confirm: true, ...(account ? { account } : {}) } }, undefined, { timeout: 35_000, maxTotalTimeout: 35_000 });
    const value = parsed(response);
    if (response?.isError || !value || value.error || value.approvalRequired || value.requiresApproval) throw new Error('Outlook MCP needs a signed-in mail account with the required permissions. Run npm run connect -- outlook-mcp, then choose Check setup.');
    const batch = Array.isArray(value.responses) ? value : value.data;
    const item = batch?.responses?.find(item => item.id === 'tracker');
    if (!item || !Number.isInteger(item.status)) throw new Error('Outlook MCP did not return a usable Graph response. Restore the pinned bridge with npm run setup.');
    if (item.status < 200 || item.status >= 300 || item.body?.error) throw Object.assign(new Error('Outlook MCP Graph operation failed.'), { statusCode: item.status });
    return item.body;
  }

  const session = {
    ensureReady,
    async close() { const existing = client; client = null; if (existing) await existing.close(); },
  };
  const graphFactory = () => ({ api(path) {
    const headers = {};
    return {
      header(name, value) { headers[name] = value; return this; },
      get() { return graphCall('GET', path, headers); },
      post(body) { return graphCall('POST', path, headers, body); },
    };
  } });
  const mailbox = createOutlookProvider({ ...options, config, auth, saveAuth, externalSession: session, graphFactory });
  return {
    ...mailbox,
    async connect() {
      try {
        const connected = await mailbox.connect();
        if (account && account.toLowerCase() !== connected.account.email.toLowerCase()) throw new Error('The Outlook MCP mailbox changed. Disconnect before choosing another account.');
        account = connected.account.email;
        auth.outlookMcpEmail = account;
        await mailbox.persistAuth();
        return connected;
      } catch (error) {
        if (Number(error?.statusCode) === 401 || Number(error?.statusCode) === 403) throw new Error('Sign in to Outlook MCP with npm run connect -- outlook-mcp, then choose Check setup.');
        throw error;
      }
    },
  };
}
