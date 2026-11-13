import test from 'node:test';
import assert from 'node:assert/strict';
import { createSofteriaProvider } from '../server/providers/softeria.mjs';
import { confirmedEmailReceipt } from '../server/email-send.mjs';

const profile = { id: 'fixture-user', mail: 'me@example.test', userPrincipalName: 'me@example.test' };
const email = { to: 'careers@example.test', subject: 'Fixture application', body: 'Local test only', idempotencyKey: 'fixture-softeria-send' };

function fixture(options = {}) {
  const calls = [], saves = [];
  let launches = 0, recipe, closed = false;
  const client = {
    async connect() { launches++; },
    async listTools() { return { tools: options.noBatch ? [{ name: 'get-current-user' }] : [{ name: 'graph-batch' }, { name: 'get-current-user' }] }; },
    async callTool(call) {
      calls.push(call);
      assert.equal(call.name, 'graph-batch');
      assert.equal(call.arguments.confirm, true);
      const request = call.arguments.body.requests[0];
      assert.match(request.headers.Prefer, /IdType="ImmutableId"/);
      const body = request.url.startsWith('/me?') ? profile : request.url.startsWith('/me/mailFolders/sentitems') ? { id: 'fixture-sent-folder' } : undefined;
      if (body) return { content: [{ type: 'text', text: JSON.stringify({ responses: [{ id: 'tracker', status: 200, body }] }) }] };
      return options.call ? options.call(request, call) : { isError: true, content: [{ type: 'text', text: '{"error":"private provider failure"}' }] };
    },
    async close() { closed = true; },
  };
  const auth = options.auth || {};
  const provider = createSofteriaProvider({
    dataDir: 'fixture-data', auth, config: { adapter: 'outlook-mcp' },
    presets: async () => [{ id: 'outlook-mcp', ready: options.ready !== false, command: 'fixture-node', args: ['fixture-server'], env: { MS365_MCP_TOKEN_CACHE_PATH: 'fixture-private-cache' } }],
    clientFactory: () => client,
    transportFactory: value => { recipe = value; return {}; },
    saveAuth: async next => saves.push(structuredClone(next)),
    delay: async () => {}, receiptAttempts: 1,
  });
  return { provider, auth, calls, saves, launches: () => launches, recipe: () => recipe, closed: () => closed };
}

test('Softeria local bridge connects without login and pins its verified mailbox', async () => {
  const f = fixture();
  const connected = await f.provider.connect();
  assert.equal(connected.status, 'connected');
  assert.equal(connected.account.email, profile.mail);
  assert.equal(f.auth.outlookMcpEmail, profile.mail);
  assert.equal(f.recipe().env.MS365_MCP_REQUIRE_CONFIRM, 'true');
  assert.equal(f.recipe().env.MS365_MCP_GRAPH_MAX_RETRIES, '0');
  assert.equal(f.calls.some(call => call.name === 'login'), false);
  await f.provider.call('outlook_profile');
  assert.equal(f.calls.at(-1).arguments.account, profile.mail);
  assert.equal(f.launches(), 1);
  await f.provider.close();
  assert.equal(f.closed(), true);
});

test('Softeria requires the pinned installation and graph-batch capability', async () => {
  const missing = fixture({ ready: false });
  await assert.rejects(missing.provider.connect(), /npm run setup/);
  assert.equal(missing.launches(), 0);
  const incompatible = fixture({ noBatch: true });
  await assert.rejects(incompatible.provider.connect(), /graph-batch enabled/);
  assert.equal(incompatible.closed(), true);
});

test('Softeria normalizes real-shaped batch draft/send/sent-copy without duplicate writes', async () => {
  const f = fixture({ call(request) {
    let status = 200, body;
    if (request.method === 'POST' && request.url === '/me/messages') {
      status = 201; body = { id: 'fixture-immutable' };
      assert.equal(request.headers['Content-Type'], 'application/json');
      assert.equal(request.body.toRecipients[0].emailAddress.address, email.to);
    } else if (request.method === 'POST') { status = 202; }
    else body = { id: 'fixture-immutable', conversationId: 'fixture-thread', isDraft: false, sentDateTime: '2026-11-13T09:00:00Z', toRecipients: [{ emailAddress: { address: email.to } }] };
    return { structuredContent: { responses: [{ id: 'tracker', status, ...(body ? { body } : {}) }] }, content: [] };
  } });
  await f.provider.connect();
  const sent = await f.provider.call('outlook_send_email', email);
  assert.equal(confirmedEmailReceipt(sent).providerMessageId, 'fixture-immutable');
  await f.provider.call('outlook_send_email', email);
  assert.equal(f.calls.filter(call => call.arguments.body.requests[0].method === 'POST').length, 2);
});

test('Softeria preserves unknown send results and exposes read-only reconciliation', async () => {
  let found = false;
  const f = fixture({ call(request) {
    if (request.method === 'POST' && request.url === '/me/messages') return { structuredContent: { responses: [{ id: 'tracker', status: 201, body: { id: 'fixture-immutable' } }] } };
    if (request.method === 'POST') return { structuredContent: { responses: [{ id: 'tracker', status: 202 }] } };
    return { structuredContent: { responses: [{ id: 'tracker', status: found ? 200 : 404, body: found ? { id: 'fixture-immutable', conversationId: 'fixture-thread', isDraft: false, sentDateTime: '2026-11-13T09:00:00Z', toRecipients: [{ emailAddress: { address: email.to } }] } : { error: { code: 'ErrorItemNotFound' } } }] } };
  } });
  await f.provider.connect();
  const pending = await f.provider.call('outlook_send_email', email);
  assert.equal(confirmedEmailReceipt(pending), null);
  found = true;
  assert.ok(confirmedEmailReceipt(await f.provider.call('outlook_reconcile_email', { idempotencyKey: email.idempotencyKey })));
  assert.equal(f.calls.filter(call => call.arguments.body.requests[0].method === 'POST').length, 2);
});

test('Softeria surfaces sign-in instructions rather than provider credentials', async () => {
  const f = fixture({ call: () => ({ isError: true, content: [{ type: 'text', text: '{"error":"Bearer private-secret"}' }] }) });
  await f.provider.connect();
  await assert.rejects(f.provider.call('outlook_read_thread', { threadId: 'fixture-thread' }), error => !error.message.includes('private-secret'));
});
