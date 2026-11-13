import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { ConnectionManager, expandMapping } from '../server/connections.mjs';

const TOOL_A = { name: 'fixture.read', description: 'Read fixture data', inputSchema: { type: 'object', properties: {} } };
const TOOL_B = { name: 'fixture.send', description: 'Return fixture arguments only', inputSchema: { type: 'object', properties: {} } };

async function fixture({ oauth = false, secret = null } = {}) {
  const calls = [];
  const requests = [];
  let root;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, root);
    requests.push({ path: url.pathname, authorization: req.headers.authorization || null });
    const json = (status, value, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(JSON.stringify(value)); };
    if (url.pathname === '/.well-known/oauth-protected-resource') return json(200, {
      resource: `${root}/mcp`, authorization_servers: [root], scopes_supported: ['read'],
    });
    if (url.pathname === '/.well-known/oauth-authorization-server') return json(200, {
      issuer: root, authorization_endpoint: `${root}/authorize`, token_endpoint: `${root}/token`,
      registration_endpoint: `${root}/register`, response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'], token_endpoint_auth_methods_supported: ['none'],
      code_challenge_methods_supported: ['S256'],
    });
    let body = '';
    for await (const part of req) body += part;
    if (url.pathname === '/register') return json(201, { client_id: 'fixture-client', ...JSON.parse(body) });
    if (url.pathname === '/token') {
      const params = new URLSearchParams(body);
      calls.push({ type: 'token', verifier: params.get('code_verifier') });
      return json(200, { access_token: 'fixture-oauth-access', token_type: 'Bearer', expires_in: 3600, refresh_token: 'fixture-refresh' });
    }
    if (url.pathname !== '/mcp') return json(404, { error: 'not_found' });
    if ((oauth && req.headers.authorization !== 'Bearer fixture-oauth-access') || (secret && req.headers.authorization !== `Bearer ${secret}`)) {
      return json(401, { error: 'unauthorized' }, { 'www-authenticate': `Bearer resource_metadata="${root}/.well-known/oauth-protected-resource"` });
    }
    if (req.method === 'GET' || req.method === 'DELETE') { res.writeHead(405); return res.end(); }
    const message = JSON.parse(body);
    if (message.id === undefined) { res.writeHead(202); return res.end(); }
    let result;
    if (message.method === 'initialize') result = {
      protocolVersion: '2025-03-26', serverInfo: { name: 'fixture', version: '1' }, capabilities: { tools: {} },
    };
    else if (message.method === 'tools/list') result = message.params?.cursor ? { tools: [TOOL_B] } : { tools: [TOOL_A], nextCursor: 'second' };
    else if (message.method === 'tools/call') {
      calls.push({ type: 'call', ...message.params });
      result = { content: [{ type: 'text', text: JSON.stringify(message.params.arguments) }], structuredContent: message.params.arguments };
    } else return json(200, { jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'not found' } });
    json(200, { jsonrpc: '2.0', id: message.id, result });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  root = `http://127.0.0.1:${server.address().port}`;
  return { root, calls, requests, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}

async function setup(t, options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'apply-connectors-'));
  const remote = await fixture(options);
  const manager = new ConnectionManager({ dataDir, baseUrl: 'http://127.0.0.1:4000', connectTimeout: 3000, callTimeout: 3000 });
  t.after(async () => { await manager.close(); await remote.close(); await rm(dataDir, { recursive: true, force: true }); });
  return { dataDir, remote, manager };
}

test('discovers paginated real HTTP MCP tools and returns real call results', async t => {
  const { manager, remote } = await setup(t);
  const initial = manager.list().find(x => x.kind === 'email');
  assert.equal(initial.status, 'not_configured');
  await manager.save('email', { url: `${remote.root}/mcp`, provider: 'outlook' });
  assert.equal(manager.list()[0].status, 'disconnected');
  const connected = await manager.connect('email');
  assert.equal(connected.status, 'connected');
  assert.equal(connected.toolCount, 2);
  const result = await manager.call('email', 'fixture.send', { to: 'fixture@example.test', body: 'local test only' });
  assert.deepEqual(result.structuredContent, { to: 'fixture@example.test', body: 'local test only' });
  assert.equal(remote.calls.filter(x => x.type === 'call').length, 1);
  await assert.rejects(manager.call('email', 'invented.tool', {}), /does not expose/);
});

test('credentials persist privately, never appear in public state, reconnect after restart', async t => {
  const { manager, remote, dataDir } = await setup(t, { secret: 'fixture-private-secret' });
  await manager.save('email', {
    url: `${remote.root}/mcp`, token: 'fixture-private-secret', env: { TEST_SECRET: 'fixture-env-secret' },
  });
  assert.equal((await manager.connect('email')).status, 'connected');
  assert.ok(!JSON.stringify(manager.list()).includes('fixture-private-secret'));
  assert.ok(!JSON.stringify(manager.list()).includes('fixture-env-secret'));
  assert.equal(JSON.parse(await readFile(join(dataDir, 'connections.private.json'), 'utf8')).email.config.token, 'fixture-private-secret');
  await manager.save('email', { label: 'My mailbox' });
  assert.equal(manager.list()[0].hasToken, true);
  await manager.close();
  const reopened = new ConnectionManager({ dataDir });
  t.after(() => reopened.close());
  assert.equal(reopened.list()[0].status, 'disconnected');
  assert.equal((await reopened.connect('email')).status, 'connected');
  await reopened.disconnect('email');
  assert.equal(reopened.list()[0].hasToken, false);
  await assert.rejects(reopened.call('email', 'fixture.read', {}), /disconnected/);
});

test('OAuth sign-in uses state, PKCE, persists full tokens, and discovers only after callback', async t => {
  const { manager, remote, dataDir } = await setup(t, { oauth: true });
  await manager.save('tabbio', { url: `${remote.root}/mcp` });
  const pending = await manager.connect('tabbio');
  assert.equal(pending.status, 'auth_required', pending.lastError);
  assert.equal(pending.toolCount, 0);
  const authorization = new URL(pending.authUrl);
  const state = authorization.searchParams.get('state');
  assert.ok(state && state.length > 30);
  assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
  await assert.rejects(manager.oauthCallback('tabbio', { code: 'fixture-code', state: 'wrong' }), /did not match/);
  const connected = await manager.oauthCallback('tabbio', { code: 'fixture-code', state });
  assert.equal(connected.status, 'connected', connected.lastError);
  const tokenCall = remote.calls.find(x => x.type === 'token');
  assert.equal(createHash('sha256').update(tokenCall.verifier).digest('base64url'), authorization.searchParams.get('code_challenge'));
  const stored = JSON.parse(await readFile(join(dataDir, 'connections.private.json'), 'utf8'));
  assert.equal(stored.tabbio.auth.tokens.access_token, 'fixture-oauth-access');
  assert.ok(stored.tabbio.auth.tokens.issuer);
  assert.ok(stored.tabbio.auth.clientInformation.issuer);
  assert.ok(!JSON.stringify(manager.list()).includes('fixture-oauth-access'));
  await assert.rejects(manager.oauthCallback('tabbio', { code: 'fixture-code', state }), /expired/);
});

test('supports local stdio MCP with no shell and drains private stderr', async t => {
  const { manager, dataDir } = await setup(t);
  const fixturePath = join(dataDir, 'stdio-fixture.mjs');
  await writeFile(fixturePath, `
    import { createInterface } from 'node:readline';
    console.error('provider credentials must not be logged');
    createInterface({input:process.stdin}).on('line', line => {
      const q=JSON.parse(line); if(q.id===undefined)return;
      let result;
      if(q.method==='initialize')result={protocolVersion:'2025-03-26',serverInfo:{name:'stdio-fixture',version:'1'},capabilities:{tools:{}}};
      else if(q.method==='tools/list')result={tools:[${JSON.stringify(TOOL_A)}]};
      else if(q.method==='tools/call')result={content:[{type:'text',text:'stdio fixture response'}]};
      else result={};
      process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result})+'\\n');
    });
  `);
  await manager.save('email', { command: process.execPath, args: [fixturePath] });
  const publicState = manager.list().find(x => x.kind === 'email');
  assert.equal(publicState.hasArgs, true);
  assert.equal(publicState.argCount, 1);
  assert.equal(publicState.args, undefined);
  // Reopening a saved command must not require exposing private argument values.
  await manager.save('email', { command: process.execPath, label: 'Saved local mailbox' });
  assert.equal((await manager.connect('email')).status, 'connected');
  assert.equal((await manager.call('email', 'fixture.read')).content[0].text, 'stdio fixture response');
});

test('mapping substitutions retain types and fail before calling when input is missing', async t => {
  assert.deepEqual(expandMapping({ id: '{{application.threadId}}', count: '{{count}}', title: 'For {{company.name}}' }, {
    application: { threadId: 'thread-1' }, count: 3, company: { name: 'Fixture' },
  }), { id: 'thread-1', count: 3, title: 'For Fixture' });
  assert.throws(() => expandMapping('{{missing.value}}', {}), /Missing mapping value/);
  assert.throws(() => expandMapping('{{constructor.name}}', {}), /unsupported/);
  const { manager, remote } = await setup(t);
  await manager.save('email', { url: `${remote.root}/mcp`, mappings: { sendEmail: { tool: 'fixture.send', arguments: { to: '{{recipient}}' } } } });
  const result = await manager.callMapped('email', 'sendEmail', { recipient: 'fixture@example.test' });
  assert.equal(result.structuredContent.to, 'fixture@example.test');
  await assert.rejects(manager.callMapped('email', 'sendEmail', {}), /Missing mapping value/);
});

test('rejects unsafe addresses and reports a failed connection honestly', async t => {
  const { manager } = await setup(t);
  await assert.rejects(manager.save('email', { url: 'http://example.com/mcp' }), /need HTTPS/);
  await assert.rejects(manager.save('email', { url: 'https://secret@example.com/mcp' }), /without credentials/);
  await assert.rejects(manager.save('email', { url: 'https://example.com/mcp?token=secret' }), /query string/);
  await assert.rejects(manager.save('email', { command: 'node', args: 'one argument' }), /list of strings/);
  await manager.save('email', { command: 'apply-tracker-executable-that-does-not-exist' });
  const failed = await manager.connect('email');
  assert.equal(failed.status, 'error');
  assert.equal(failed.toolCount, 0);
  assert.ok(failed.lastError);
});

test('separate app and CLI managers observe saved settings without overwriting the other connection', async t => {
  const { manager, remote, dataDir } = await setup(t);
  const cli = new ConnectionManager({ dataDir });
  t.after(() => cli.close());
  await cli.save('email', { url: `${remote.root}/mcp`, label: 'CLI mailbox' });
  assert.equal(manager.list().find(x => x.kind === 'email').label, 'CLI mailbox');
  await manager.save('tabbio', { url: `${remote.root}/mcp`, label: 'App CV' });
  assert.equal(cli.list().find(x => x.kind === 'tabbio').label, 'App CV');
  assert.equal(cli.list().find(x => x.kind === 'email').label, 'CLI mailbox');
  assert.equal((await manager.connect('email')).status, 'connected');
  await cli.disconnect('email');
  assert.equal(manager.list().find(x => x.kind === 'email').canAutoConnect, false);
  await assert.rejects(manager.tools('email'), /disconnected/);
});

test('server target changes drop omitted credentials while normalized same-target edits retain them', async t => {
  const { manager, dataDir } = await setup(t);
  const stored = async () => JSON.parse(await readFile(join(dataDir, 'connections.private.json'), 'utf8')).email;
  const secrets = { token: 'old-private-token', env: { OLD_SECRET: 'old-environment-secret' }, oauth: { scope: 'read', clientInformation: { client_id: 'old-client', client_secret: 'old-client-secret', issuer: 'https://old.example' } } };
  await manager.save('email', { url: 'https://old.example:443/mcp', ...secrets });
  await manager.save('email', { url: 'https://old.example/mcp', label: 'Same server', mappings: { readThread: { tool: 'same.read' } } });
  const same = await stored();
  for (const key of ['token', 'env', 'oauth']) assert.deepEqual(same.config[key], secrets[key]);
  await manager.save('email', { url: 'https://new.example/mcp' });
  const changed = await stored();
  assert.equal(changed.config.url, 'https://new.example/mcp');
  for (const key of ['token', 'env', 'oauth']) assert.equal(Object.hasOwn(changed.config, key), false);
  assert.deepEqual(changed.auth, {});
  await manager.save('email', { url: 'https://explicit.example/mcp', token: 'new-explicit-token', env: { NEW_SECRET: 'new-secret' }, oauth: { scope: 'new-scope' } });
  const explicit = await stored();
  assert.equal(explicit.config.token, 'new-explicit-token');
  assert.deepEqual(explicit.config.env, { NEW_SECRET: 'new-secret' });
  assert.deepEqual(explicit.config.oauth, { scope: 'new-scope' });
});

test('stdio identity includes arguments and never carries old secret arguments to a new executable', async t => {
  const { manager, dataDir } = await setup(t);
  const stored = async () => JSON.parse(await readFile(join(dataDir, 'connections.private.json'), 'utf8')).email.config;
  const secrets = { token: 'old-token', env: { OLD_SECRET: 'old-env' }, oauth: { scope: 'read' } };
  await manager.save('email', { command: 'old-command', args: ['--secret', 'old-argument'], ...secrets });
  await manager.save('email', { command: 'old-command', label: 'Same command' });
  assert.deepEqual((await stored()).args, ['--secret', 'old-argument']);
  assert.equal((await stored()).token, 'old-token');
  await manager.save('email', { command: 'old-command', args: ['new-target'] });
  for (const key of ['token', 'env', 'oauth']) assert.equal(Object.hasOwn(await stored(), key), false);
  await manager.save('email', { command: 'old-command', args: ['--secret', 'another-old-argument'], ...secrets });
  await manager.save('email', { command: 'new-command' });
  const next = await stored();
  assert.equal(next.command, 'new-command');
  assert.deepEqual(next.args, []);
  for (const key of ['token', 'env', 'oauth', 'url']) assert.equal(Object.hasOwn(next, key), false);
  await manager.save('email', { command: 'old-command', args: ['secret-argument'], ...secrets });
  await manager.save('email', { url: 'https://http-target.example/mcp' });
  for (const key of ['token', 'env', 'oauth', 'command', 'args']) assert.equal(Object.hasOwn(await stored(), key), false);
});

test('same-target metadata edits preserve an authenticated OAuth session and changed servers never receive its token', async t => {
  const { manager, remote, dataDir } = await setup(t, { oauth: true });
  await manager.save('tabbio', { url: `${remote.root}/mcp` });
  const pending = await manager.connect('tabbio');
  const state = new URL(pending.authUrl).searchParams.get('state');
  assert.equal((await manager.oauthCallback('tabbio', { code: 'fixture-code', state })).status, 'connected');
  const before = JSON.parse(await readFile(join(dataDir, 'connections.private.json'), 'utf8')).tabbio.auth;
  const saved = await manager.save('tabbio', { label: 'Renamed CV', mappings: { readCV: { tool: 'fixture.read' } } });
  assert.equal(saved.status, 'connected');
  assert.equal(saved.toolCount, 2);
  assert.deepEqual(JSON.parse(await readFile(join(dataDir, 'connections.private.json'), 'utf8')).tabbio.auth, before);
  assert.equal(remote.calls.filter(call => call.type === 'token').length, 1);
  const cli = new ConnectionManager({ dataDir });
  t.after(() => cli.close());
  await cli.save('tabbio', { label: 'CLI CV name', mappings: { readCV: { tool: 'fixture.read', arguments: {} } } });
  const reloaded = manager.list().find(connection => connection.kind === 'tabbio');
  assert.equal(reloaded.label, 'CLI CV name');
  assert.equal(reloaded.status, 'connected');
  assert.equal(reloaded.toolCount, 2);
  assert.equal(remote.calls.filter(call => call.type === 'token').length, 1);
  const replacement = await fixture();
  t.after(() => replacement.close());
  await manager.save('tabbio', { url: `${replacement.root}/mcp` });
  assert.equal((await manager.connect('tabbio')).status, 'connected');
  assert.ok(replacement.requests.length > 0);
  assert.equal(replacement.requests.every(request => request.authorization === null), true);
  const updated = JSON.parse(await readFile(join(dataDir, 'connections.private.json'), 'utf8')).tabbio;
  assert.deepEqual(updated.auth, {});
});

test('switching a live bearer server never forwards its bearer token to the replacement server', async t => {
  const { manager, remote } = await setup(t, { secret: 'old-bearer-secret' });
  await manager.save('email', { url: `${remote.root}/mcp`, token: 'old-bearer-secret' });
  assert.equal((await manager.connect('email')).status, 'connected');
  const replacement = await fixture();
  t.after(() => replacement.close());
  await manager.save('email', { url: `${replacement.root}/mcp` });
  assert.equal((await manager.connect('email')).status, 'connected');
  assert.ok(replacement.requests.length > 0);
  assert.equal(replacement.requests.every(request => request.authorization === null), true);
});

test('saving the built-in Tabbio target for the first time records a configured disconnected state', async t => {
  const { manager } = await setup(t);
  const saved = await manager.save('tabbio', { label: 'My CV' });
  assert.equal(saved.configured, true);
  assert.equal(saved.status, 'disconnected');
  assert.equal(saved.hasToken, false);
});
