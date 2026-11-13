import { mkdirSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';

const KINDS = ['email', 'tabbio', 'calendar'];
const DEFAULTS = {
  email: { label: 'Email', provider: 'gmail' },
  tabbio: { label: 'Tabbio CV', provider: 'tabbio', url: 'https://server.tabbio.com/api/mcp' },
  calendar: { label: 'Calendar', provider: 'google-calendar' },
};
const CONNECT_TIMEOUT = 20_000;
const CALL_TIMEOUT = 60_000;
const OAUTH_LIFETIME = 10 * 60_000;
const EMAIL_ADAPTERS = ['gmail', 'outlook', 'icloud-mail', 'google-cli', 'outlook-mcp'];
const CALENDAR_ADAPTERS = ['google-calendar', 'outlook-calendar', 'icloud-calendar'];
const NATIVE_ADAPTERS = [...EMAIL_ADAPTERS, ...CALENDAR_ADAPTERS];
const providerFactories = {
  'icloud-mail': async options => (await import('./providers/icloud-mail.mjs')).createICloudMailProvider(options),
  gmail: async options => (await import('./providers/gmail.mjs')).createGmailProvider(options),
  outlook: async options => (await import('./providers/outlook.mjs')).createOutlookProvider(options),
  'google-cli': async options => (await import('./providers/google-cli.mjs')).createGoogleCliProvider(options),
  'outlook-mcp': async options => (await import('./providers/softeria.mjs')).createSofteriaProvider(options),
  'google-calendar': async options => (await import('./providers/google-calendar.mjs')).createGoogleCalendarProvider(options),
  'outlook-calendar': async options => (await import('./providers/outlook-calendar.mjs')).createOutlookCalendarProvider(options),
  'icloud-calendar': async options => (await import('./providers/icloud-calendar.mjs')).createICloudCalendarProvider(options),
};

function assertKind(kind) {
  if (!KINDS.includes(kind)) throw new Error('Choose an email, Tabbio or calendar connection.');
}

function clone(value) { return value === undefined ? undefined : structuredClone(value); }

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function configured(config) { return Boolean(config && (NATIVE_ADAPTERS.includes(config.adapter) || config.command || config.url)); }

function targetIdentity(config) {
  if (NATIVE_ADAPTERS.includes(config?.adapter)) return JSON.stringify([config.adapter, config.oauth?.clientId || '', config.oauth?.tenant || '', config.credentials?.username || '']);
  if (config?.command) return JSON.stringify(['stdio', config.command, config.args || []]);
  if (config?.url) return JSON.stringify(['http', new URL(config.url).href]);
  return null;
}

function sameConnectionIdentity(left, right) {
  return targetIdentity(left) === targetIdentity(right)
    && ['env', 'token', 'oauth', 'credentials'].every(key => JSON.stringify(left?.[key]) === JSON.stringify(right?.[key]));
}

function validateConfig(kind, input) {
  if (!plainObject(input)) throw new Error('Connection settings must be an object.');
  const config = clone(input);
  if (config.adapter !== undefined && !['mcp', ...NATIVE_ADAPTERS].includes(config.adapter)) throw new Error('Choose a listed email or calendar adapter, or an MCP connection.');
  if (EMAIL_ADAPTERS.includes(config.adapter) && kind !== 'email') throw new Error('This adapter is for email.');
  if (CALENDAR_ADAPTERS.includes(config.adapter) && kind !== 'calendar') throw new Error('This adapter is for calendar.');
  if (NATIVE_ADAPTERS.includes(config.adapter) && (config.command || config.url)) throw new Error('Built-in connections do not need a server address or command.');
  if (config.command && config.url) throw new Error('Choose a server address or a local command, not both.');
  if (config.url) {
    const url = new URL(config.url);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Use an HTTP or HTTPS MCP server address without credentials in the URL.');
    }
    if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('Remote MCP servers need HTTPS. HTTP is supported only on this computer.');
    }
    if (url.search || url.hash) throw new Error('Use a server address without a query string or fragment.');
    config.url = url.href;
  }
  if (config.command && (typeof config.command !== 'string' || /[\r\n\0]/.test(config.command))) {
    throw new Error('Enter one executable path as the local command. Put its arguments in the arguments list.');
  }
  if (config.args !== undefined && (!Array.isArray(config.args) || config.args.some(x => typeof x !== 'string'))) {
    throw new Error('Command arguments must be a list of strings.');
  }
  if (config.env !== undefined && (!plainObject(config.env) || Object.values(config.env).some(x => typeof x !== 'string'))) {
    throw new Error('Environment variables must be an object of string values.');
  }
  if (config.mappings !== undefined && !plainObject(config.mappings)) throw new Error('Tool mappings must be an object.');
  if (config.token !== undefined && typeof config.token !== 'string') throw new Error('The access token must be text.');
  if (config.oauth !== undefined && !plainObject(config.oauth)) throw new Error('OAuth settings must be an object.');
  if (config.credentials !== undefined && (!plainObject(config.credentials) || Object.values(config.credentials).some(value => typeof value !== 'string' || value.length > 4000 || /[\r\n\0]/.test(value)))) throw new Error('Use a valid iCloud account and app-specific password.');
  for (const key of ['clientId', 'clientSecret', 'tenant']) if (config.oauth?.[key] !== undefined && (typeof config.oauth[key] !== 'string' || config.oauth[key].length > 4000 || /[\r\n\0]/.test(config.oauth[key]))) throw new Error('OAuth client fields must be single-line text.');
  return {
    label: String(config.label || DEFAULTS[kind].label).slice(0, 100),
    provider: String(config.provider || DEFAULTS[kind].provider).slice(0, 100),
    ...(config.adapter ? { adapter: config.adapter } : {}),
    ...(config.url ? { url: config.url } : {}),
    ...(config.command ? { command: config.command, args: config.args || [] } : {}),
    ...(config.env ? { env: config.env } : {}),
    ...(config.token ? { token: config.token } : {}),
    ...(config.oauth ? { oauth: config.oauth } : {}),
    ...(config.credentials ? { credentials: config.credentials } : {}),
    mappings: config.mappings || {},
  };
}

function privateStrings(record) {
  const secrets = [];
  if (record?.config?.token) secrets.push(record.config.token);
  for (const value of Object.values(record?.config?.env || {})) if (value.length >= 4) secrets.push(value);
  for (const value of record?.config?.args || []) if (value.length >= 4) secrets.push(value);
  const collect = (obj) => {
    if (!plainObject(obj)) return;
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && /token|secret|password|verifier/i.test(key) && value.length >= 4) secrets.push(value);
      else if (plainObject(value)) collect(value);
    }
  };
  collect(record?.auth);
  collect(record?.config?.oauth);
  collect(record?.config?.credentials);
  return secrets;
}

function cleanError(error, record) {
  let message = error?.message || String(error || 'Connection failed.');
  for (const value of privateStrings(record).sort((a, b) => b.length - a.length)) message = message.split(value).join('[redacted]');
  return message
    .replace(/Bearer\s+[^\s"',}]+/gi, 'Bearer [redacted]')
    .replace(/((?:access_token|refresh_token|client_secret|password|code_verifier|token)["']?\s*[:=]\s*["']?)[^\s"'&,}]+/gi, '$1[redacted]')
    .replace(/([?&](?:code|state)=)[^&\s]+/g, '$1[redacted]')
    .slice(0, 600);
}

function equalState(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function expandMapping(value, context) {
  if (Array.isArray(value)) return value.map(x => expandMapping(x, context));
  if (plainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expandMapping(v, context)]));
  if (typeof value !== 'string') return value;
  const lookup = (path) => {
    const keys = path.split('.');
    if (keys.some(k => ['__proto__', 'prototype', 'constructor'].includes(k))) throw new Error('This mapping contains an unsupported field.');
    let found = context;
    for (const key of keys) found = found?.[key];
    if (found === undefined || found === null) throw new Error(`Missing mapping value: ${path}.`);
    return found;
  };
  const exact = value.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
  if (exact) return clone(lookup(exact[1]));
  return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => String(lookup(path)));
}

/** Local-only connector registry. Persistence is outside the served frontend. */
export class ConnectionManager {
  constructor({ dataDir, baseUrl = 'http://127.0.0.1:4000', connectTimeout = CONNECT_TIMEOUT, callTimeout = CALL_TIMEOUT, providers = providerFactories }) {
    this.dataDir = resolve(dataDir);
    this.baseUrl = new URL(baseUrl).origin;
    if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(this.baseUrl).hostname)) {
      throw new Error('The connection callback must be on this computer.');
    }
    this.file = join(this.dataDir, 'connections.private.json');
    this.connectTimeout = connectTimeout;
    this.callTimeout = callTimeout;
    this.providers = providers;
    this.records = {};
    this.clients = new Map();
    this.pending = new Map();
    this.connecting = new Map();
    this.generations = new Map();
    mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    try {
      const stored = JSON.parse(readFileSync(this.file, 'utf8'));
      for (const kind of KINDS) if (stored[kind]) {
        this.records[kind] = { ...stored[kind], status: configured(stored[kind].config) ? 'disconnected' : 'not_configured', authUrl: undefined };
      }
      this.#protect();
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Saved connection settings could not be read. Restore connections.private.json from your local backup.');
    }
  }

  #protect() {
    if (process.platform !== 'win32') {
      chmodSync(this.dataDir, 0o700);
      chmodSync(this.file, 0o600);
    }
  }

  #reload(exceptKind) {
    let data;
    try { data = JSON.parse(readFileSync(this.file, 'utf8')); }
    catch (error) {
      if (error.code === 'ENOENT') return {};
      throw new Error('Saved connection settings could not be read. Restore connections.private.json from your local backup.');
    }
    for (const kind of KINDS) {
      if (kind === exceptKind || !data[kind]) continue;
      const incoming = data[kind], current = this.records[kind];
      const changed = !current || !sameConnectionIdentity(current.config, incoming.config) || Boolean(current.disabled) !== Boolean(incoming.disabled);
      if (changed) {
        this.generations.set(kind, (this.generations.get(kind) || 0) + 1);
        this.connecting.delete(kind);
        const entry = this.clients.get(kind);
        this.clients.delete(kind);
        if (entry) void entry.client.close().catch(() => {});
        this.pending.delete(kind);
        this.records[kind] = { ...incoming, status: configured(incoming.config) ? 'disconnected' : 'not_configured' };
      } else {
        // Preserve this process's transport state, but use freshly persisted credentials.
        Object.assign(current, incoming);
      }
    }
    return data;
  }

  #persist(kind) {
    const data = this.#reload(kind);
    const { config, auth, disabled, lastConnectedAt, lastError } = this.#record(kind);
    data[kind] = { config, auth, disabled, lastConnectedAt, lastError };
    const temporary = `${this.file}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
    renameSync(temporary, this.file);
    this.#protect();
  }

  #record(kind) {
    assertKind(kind);
    return this.records[kind] ||= { config: null, status: 'not_configured', auth: {} };
  }

  #public(kind) {
    const record = this.#record(kind);
    const config = record.config || DEFAULTS[kind];
    return {
      kind,
      label: config.label || DEFAULTS[kind].label,
      provider: config.provider || DEFAULTS[kind].provider,
      adapter: config.adapter || 'mcp',
      ...(NATIVE_ADAPTERS.includes(config.adapter) ? {
        oauthClientId: config.oauth?.clientId || '',
        oauthTenant: config.oauth?.tenant || 'common',
        hasClientSecret: Boolean(config.oauth?.clientSecret),
        oauthConfigured: ['google-cli', 'outlook-mcp', 'icloud-calendar', 'icloud-mail'].includes(config.adapter) || Boolean(config.oauth?.clientId || process.env[['gmail', 'google-calendar'].includes(config.adapter) ? 'APPLY_TRACKER_GOOGLE_CLIENT_ID' : 'APPLY_TRACKER_MICROSOFT_CLIENT_ID']),
        hasCredentials: Boolean(config.credentials?.password),
        credentialUsername: config.credentials?.username || '',
      } : {}),
      ...(record.account ? { account: record.account } : {}),
      configured: configured(record.config),
      canAutoConnect: configured(record.config) && !record.disabled,
      transport: NATIVE_ADAPTERS.includes(config.adapter) ? (config.adapter === 'google-cli' ? 'cli' : 'native') : config.command ? 'stdio' : config.url ? 'http' : null,
      status: record.status || (configured(record.config) ? 'disconnected' : 'not_configured'),
      ...(config.url ? { url: config.url } : {}),
      ...(config.command ? { command: config.command } : {}),
      hasArgs: Boolean(config.args?.length),
      argCount: config.args?.length || 0,
      hasToken: Boolean(config.token),
      envKeys: Object.keys(config.env || {}),
      mappings: clone(config.mappings || {}),
      toolCount: record.status === 'connected' ? this.clients.get(kind)?.tools?.length || 0 : 0,
      lastConnectedAt: record.lastConnectedAt || null,
      lastError: record.lastError || null,
      ...(record.authUrl ? { authUrl: record.authUrl } : {}),
    };
  }

  list() { this.#reload(); return KINDS.map(kind => this.#public(kind)); }

  getMappings(kind) { this.#reload(); return clone(this.#record(kind).config?.mappings || {}); }

  async save(kind, input) {
    if (!plainObject(input)) throw new Error('Connection settings must be an object.');
    this.#reload();
    const record = this.#record(kind);
    const previous = record.config || DEFAULTS[kind];
    // Omitted credentials belong only to the same normalized server target.
    const merged = { ...previous, ...input };
    if ((input.url || input.command) && !Object.hasOwn(input, 'adapter')) merged.adapter = 'mcp';
    if (input.adapter && input.adapter !== previous.adapter) {
      for (const key of ['url', 'command', 'args', 'env', 'token', 'oauth', 'credentials', 'mappings']) if (!Object.hasOwn(input, key)) delete merged[key];
    }
    if (input.command && !Object.hasOwn(input, 'url')) delete merged.url;
    if (input.url && !Object.hasOwn(input, 'command')) { delete merged.command; delete merged.args; }
    if (merged.command !== previous.command && !Object.hasOwn(input, 'args')) delete merged.args;
    const config = validateConfig(kind, merged);
    const changedTarget = targetIdentity(previous) !== targetIdentity(config);
    if (changedTarget) {
      for (const key of ['token', 'env', 'oauth', 'credentials']) if (!Object.hasOwn(input, key)) delete config[key];
    }
    const changedIdentity = !record.config || !sameConnectionIdentity(previous, config);
    if (changedIdentity) await this.#close(kind);
    record.config = config;
    record.disabled = false;
    if (changedIdentity) {
      record.auth = {};
      delete record.account;
      record.status = configured(config) ? 'disconnected' : 'not_configured';
      delete record.authUrl;
      record.lastError = null;
    }
    this.#persist(kind);
    return this.#public(kind);
  }

  #oauthProvider(kind) {
    const record = this.#record(kind);
    const manager = this;
    const generation = this.generations.get(kind) || 0;
    const identity = clone(record.config);
    record.auth ||= {};
    const ensureCurrent = () => { if ((manager.generations.get(kind) || 0) !== generation || !sameConnectionIdentity(record.config, identity) || record.disabled) throw new Error('The connection changed. Connect again.'); };
    const update = (key, value) => { ensureCurrent(); record.auth[key] = clone(value); manager.#persist(kind); };
    const redirectUrl = `${this.baseUrl}/api/connections/${kind}/oauth/callback`;
    return {
      get redirectUrl() { return redirectUrl; },
      get clientMetadata() {
        return {
          client_name: 'Apply Tracker on this computer',
          redirect_uris: [redirectUrl],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
          ...(record.config?.oauth?.scope ? { scope: record.config.oauth.scope } : {}),
        };
      },
      state() {
        const state = randomBytes(32).toString('base64url');
        update('pendingState', { value: state, createdAt: Date.now() });
        return state;
      },
      clientInformation() { return clone(record.auth.clientInformation || record.config?.oauth?.clientInformation); },
      saveClientInformation(info) { update('clientInformation', info); },
      tokens() { return clone(record.auth.tokens); },
      saveTokens(tokens) { update('tokens', tokens); },
      redirectToAuthorization(url) { ensureCurrent(); record.authUrl = url.href; record.status = 'auth_required'; },
      saveCodeVerifier(verifier) { update('codeVerifier', verifier); },
      codeVerifier() {
        if (!record.auth.codeVerifier) throw new Error('Sign-in expired. Connect again to start a new sign-in.');
        return record.auth.codeVerifier;
      },
      saveDiscoveryState(state) { update('discovery', state); },
      discoveryState() { return clone(record.auth.discovery); },
      invalidateCredentials(scope) {
        ensureCurrent();
        if (scope === 'all') record.auth = {};
        else if (scope === 'client') delete record.auth.clientInformation;
        else if (scope === 'tokens') delete record.auth.tokens;
        else if (scope === 'verifier') delete record.auth.codeVerifier;
        else if (scope === 'discovery') delete record.auth.discovery;
        manager.#persist(kind);
      },
    };
  }

  async #newTransport(kind) {
    const record = this.#record(kind), config = record.config;
    if (config.command) return new StdioClientTransport({
      command: config.command,
      args: config.args || [],
      env: { ...getDefaultEnvironment(), ...(config.env || {}) },
      stderr: 'pipe',
    });
    return new StreamableHTTPClientTransport(new URL(config.url), config.token ? {
      requestInit: { headers: { Authorization: `Bearer ${config.token}` } },
    } : { authProvider: this.#oauthProvider(kind) });
  }

  async connect(kind) {
    assertKind(kind);
    this.#reload();
    if (this.connecting.has(kind)) return this.connecting.get(kind);
    const job = this.#connect(kind).finally(() => { if (this.connecting.get(kind) === job) this.connecting.delete(kind); });
    this.connecting.set(kind, job);
    return job;
  }

  async #connect(kind) {
    const record = this.#record(kind);
    record.disabled = false;
    if (!configured(record.config)) {
      if (kind === 'tabbio') { record.config = validateConfig(kind, DEFAULTS[kind]); this.#persist(kind); }
      else throw new Error(kind === 'calendar' ? 'Choose a calendar provider in Connections first.' : 'Choose Gmail or Outlook in Connections first.');
    }
    await this.#close(kind);
    const generation = this.generations.get(kind) || 0;
    const identity = clone(record.config);
    record.status = 'connecting';
    record.lastError = null;
    delete record.authUrl;
    if (NATIVE_ADAPTERS.includes(record.config.adapter)) return this.#connectNative(kind);
    const transport = await this.#newTransport(kind);
    const client = new Client({ name: 'apply-tracker', version: '0.1.0' }, { capabilities: {} });
    // Drain child stderr without retaining/printing potentially sensitive provider output.
    if (transport.stderr) transport.stderr.on('data', () => {});
    let timer;
    try {
      await Promise.race([
        client.connect(transport, { timeout: this.connectTimeout }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Connection timed out. Check the MCP server and try again.')), this.connectTimeout); }),
      ]);
      clearTimeout(timer);
      const tools = [];
      const cursors = new Set();
      let cursor;
      do {
        const page = await client.listTools(cursor ? { cursor } : {}, { timeout: this.connectTimeout });
        tools.push(...page.tools);
        cursor = page.nextCursor;
        if (cursor && cursors.has(cursor)) throw new Error('The MCP server repeated a tool-list page. Check the server and connect again.');
        if (cursor) cursors.add(cursor);
        if (tools.length > 5000) throw new Error('The MCP server returned too many tools.');
      } while (cursor);
      if ((this.generations.get(kind) || 0) !== generation || !sameConnectionIdentity(record.config, identity) || record.disabled) throw new Error('The connection changed. Connect again.');
      const entry = { client, transport, tools };
      // Auto-map only an unambiguous simple read tool, using the actual discovered schema.
      if (kind === 'tabbio' && !record.config.mappings?.readCV) {
        const candidates = tools.filter(tool => /^(?:cv[_ .-]?(?:list|get|read)|(?:list|read|get)[_ .-]?(?:my[_ .-]?)?cvs?)$/i.test(tool.name) && tool.annotations?.readOnlyHint !== false && !(tool.inputSchema?.required?.length));
        if (candidates.length === 1) record.config.mappings = { ...record.config.mappings, readCV: { tool: candidates[0].name, arguments: {} } };
      }
      this.clients.set(kind, entry);
      client.onclose = () => {
        if (this.clients.get(kind) === entry) {
          this.clients.delete(kind);
          record.status = 'disconnected';
        }
      };
      record.status = 'connected';
      record.lastConnectedAt = new Date().toISOString();
      delete record.authUrl;
      this.#persist(kind);
      return this.#public(kind);
    } catch (error) {
      clearTimeout(timer);
      if ((this.generations.get(kind) || 0) !== generation || !sameConnectionIdentity(record.config, identity) || record.disabled) { await client.close().catch(() => {}); throw new Error('The connection changed. Connect again.'); }
      if ((error instanceof UnauthorizedError || error?.name === 'UnauthorizedError') && record.authUrl) {
        record.status = 'auth_required';
        this.pending.set(kind, { transport, createdAt: Date.now() });
        // close the failed connection; finishAuth runs with a fresh transport below.
        await client.close().catch(() => {});
        return this.#public(kind);
      }
      await client.close().catch(() => {});
      record.status = 'error';
      record.lastError = cleanError(error, record);
      this.#persist(kind);
      return this.#public(kind);
    }
  }

  async #nativeEntry(kind) {
    const existing = this.clients.get(kind);
    if (existing?.adapter) return existing;
    const record = this.#record(kind);
    const identity = clone(record.config);
    const generation = this.generations.get(kind) || 0;
    const factory = this.providers[record.config.adapter];
    if (!factory) throw new Error('This email adapter is unavailable. Run npm run setup, then try again.');
    const adapter = await factory({
      config: clone(record.config), auth: clone(record.auth || {}), dataDir: this.dataDir,
      redirectUrl: `${this.baseUrl}/api/connections/${kind}/oauth/callback`,
      saveAuth: async auth => {
        if ((this.generations.get(kind) || 0) !== generation || !sameConnectionIdentity(record.config, identity) || record.disabled) throw new Error('The connection changed. Connect again.');
        record.auth = clone(auth);
        this.#persist(kind);
      },
    });
    const entry = { adapter, tools: await adapter.tools(), client: { close: () => adapter.close?.() || Promise.resolve() } };
    if ((this.generations.get(kind) || 0) !== generation || !sameConnectionIdentity(record.config, identity) || record.disabled) { await Promise.resolve(adapter.close?.()).catch(() => {}); throw new Error('The connection changed. Connect again.'); }
    this.clients.set(kind, entry);
    return entry;
  }

  async #connectNative(kind, query) {
    const record = this.#record(kind);
    const identity = clone(record.config);
    const generation = this.generations.get(kind) || 0;
    try {
      const entry = await this.#nativeEntry(kind);
      const result = query ? await entry.adapter.oauthCallback(query) : await entry.adapter.connect();
      if ((this.generations.get(kind) || 0) !== generation || !sameConnectionIdentity(record.config, identity) || record.disabled) throw new Error('The connection changed. Connect again.');
      record.status = result.status;
      record.lastError = null;
      if (result.authUrl) record.authUrl = result.authUrl;
      else delete record.authUrl;
      if (result.account) record.account = result.account;
      if (result.status === 'connected') record.lastConnectedAt = new Date().toISOString();
      if (entry.adapter.mappings) record.config.mappings = { ...clone(entry.adapter.mappings), ...record.config.mappings };
      this.#persist(kind);
      return this.#public(kind);
    } catch (error) {
      if ((this.generations.get(kind) || 0) !== generation || !sameConnectionIdentity(record.config, identity) || record.disabled) throw new Error('The connection changed. Connect again.');
      record.status = 'error';
      record.lastError = cleanError(error, record);
      delete record.authUrl;
      this.#persist(kind);
      if (query) throw new Error(record.lastError);
      return this.#public(kind);
    }
  }

  async #close(kind) {
    this.generations.set(kind, (this.generations.get(kind) || 0) + 1);
    this.connecting.delete(kind);
    const entry = this.clients.get(kind);
    this.clients.delete(kind);
    this.pending.delete(kind);
    if (entry) await entry.client.close().catch(() => {});
  }

  async disconnect(kind) {
    this.#reload();
    const record = this.#record(kind);
    await this.#close(kind);
    // A disconnect must prevent unattended reconnecting with stored credentials.
    record.auth = {};
    delete record.account;
    if (record.config) delete record.config.token;
    if (record.config) delete record.config.credentials;
    record.disabled = true;
    record.status = configured(record.config) ? 'disconnected' : 'not_configured';
    record.lastError = null;
    delete record.authUrl;
    this.#persist(kind);
    return this.#public(kind);
  }

  async tools(kind) {
    assertKind(kind);
    this.#reload();
    if (this.#record(kind).disabled) throw new Error('This connection is disconnected. Choose Connect to enable it again.');
    if (!this.clients.has(kind) || this.#record(kind).status !== 'connected') {
      const status = await this.connect(kind);
      if (status.status !== 'connected') throw new Error(status.lastError || 'Finish signing in to this connection first.');
    }
    return clone(this.clients.get(kind).tools);
  }

  async call(kind, name, args = {}) {
    if (typeof name !== 'string' || !name) throw new Error('Choose a discovered MCP tool.');
    const tools = await this.tools(kind);
    if (!tools.some(tool => tool.name === name)) throw new Error(`The connected server does not expose the tool: ${name}.`);
    if (!plainObject(args)) throw new Error('Tool arguments must be an object.');
    try {
      const entry = this.clients.get(kind);
      if (entry.adapter) return await entry.adapter.call(name, args);
      return await this.clients.get(kind).client.callTool({ name, arguments: args }, undefined, {
        timeout: this.callTimeout,
        maxTotalTimeout: this.callTimeout,
      });
    } catch (error) {
      // Do not retry writes after an uncertain result. The caller must reconcile first.
      throw new Error(cleanError(error, this.#record(kind)), { cause: error });
    }
  }

  async callMapped(kind, action, context = {}) {
    const mapping = this.getMappings(kind)[action];
    if (!mapping?.tool) throw new Error(`Choose the ${action} tool in connection settings first.`);
    return this.call(kind, mapping.tool, expandMapping(mapping.arguments || {}, context));
  }

  async oauthCallback(kind, query) {
    this.#reload();
    const record = this.#record(kind);
    if (NATIVE_ADAPTERS.includes(record.config?.adapter)) {
      if (record.disabled) throw new Error('This connection was disconnected. Connect again.');
      return this.#connectNative(kind, query);
    }
    const get = (key) => query instanceof URLSearchParams ? query.get(key) : query?.[key];
    const saved = record.auth?.pendingState;
    if (!saved || Date.now() - saved.createdAt > OAUTH_LIFETIME || !equalState(get('state'), saved.value)) {
      throw new Error('Sign-in expired or did not match this connection. Connect again.');
    }
    if (get('error')) {
      delete record.auth.pendingState;
      delete record.auth.codeVerifier;
      delete record.authUrl;
      record.status = 'error';
      record.lastError = 'Sign-in was not completed. Connect again when you are ready.';
      this.#persist(kind);
      throw new Error(record.lastError);
    }
    const code = get('code');
    if (typeof code !== 'string' || !code) throw new Error('No sign-in code was returned. Connect again.');
    // Consume state before exchanging: duplicate callbacks cannot replay it.
    delete record.auth.pendingState;
    this.#persist(kind);
    const transport = new StreamableHTTPClientTransport(new URL(record.config.url), { authProvider: this.#oauthProvider(kind) });
    try {
      await transport.finishAuth(code);
      delete record.auth.codeVerifier;
      this.#persist(kind);
    } catch (error) {
      record.status = 'error';
      record.lastError = cleanError(error, record);
      this.#persist(kind);
      throw new Error(record.lastError);
    } finally {
      await transport.close().catch(() => {});
    }
    return this.connect(kind);
  }

  /** Close transports during server shutdown without deleting saved sign-in. */
  async close() { await Promise.all(KINDS.map(kind => this.#close(kind))); }
}
