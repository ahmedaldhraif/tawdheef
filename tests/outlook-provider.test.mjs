import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createOutlookProvider, OUTLOOK_MAPPINGS } from '../server/providers/outlook.mjs';
import { confirmedEmailReceipt } from '../server/email-send.mjs';

const ACCOUNT = { homeAccountId: 'fixture-account', username: 'me@example.test' };
const SEND = { to: 'careers@example.test', subject: 'Application — مهندس', body: 'My application\nمرحبا', idempotencyKey: 'application-fixture-001' };
const PROFILE = { id: 'user-fixture', mail: 'me@example.test', userPrincipalName: 'me@example.test', displayName: 'Fixture User' };
const SENT = { id: 'immutable-fixture', conversationId: 'conversation-fixture', isDraft: false, sentDateTime: '2026-11-13T08:00:00Z', toRecipients: [{ emailAddress: { address: SEND.to } }] };
const json = (data, status = 200) => new Response(status === 202 || status === 204 ? null : JSON.stringify(data), { status, headers: status === 202 || status === 204 ? {} : { 'content-type': 'application/json' } });

function fixture(options = {}) {
  let now = Date.parse('2026-11-13T07:00:00Z');
  const auth = options.auth || { accountId: ACCOUNT.homeAccountId, msalCache: JSON.stringify({ accounts: [ACCOUNT], tokenGeneration: 0 }) };
  const saves = [], calls = [], msalCalls = [];
  let state = { accounts: [], tokenGeneration: 0 }, msalOptions;
  const cache = {
    deserialize(value) { state = JSON.parse(value); },
    serialize() { return JSON.stringify(state); },
    async getAllAccounts() { return state.accounts; },
  };
  const msal = {
    getTokenCache: () => cache,
    async getAuthCodeUrl(args) { msalCalls.push({ method: 'getAuthCodeUrl', args }); const url = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize'); for (const key of ['state', 'codeChallenge', 'codeChallengeMethod', 'redirectUri']) url.searchParams.set(key, args[key]); return url.href; },
    async acquireTokenByCode(args) {
      msalCalls.push({ method: 'acquireTokenByCode', args });
      if (options.codeError) throw options.codeError;
      state.accounts = [ACCOUNT]; state.tokenGeneration++;
      return { account: ACCOUNT, accessToken: 'fixture-only-private-access' };
    },
    async acquireTokenSilent(args) {
      msalCalls.push({ method: 'acquireTokenSilent', args });
      if (options.silentError) throw options.silentError;
      state.tokenGeneration++;
      await msalOptions.cache.cachePlugin.afterCacheAccess({ cacheHasChanged: true, tokenCache: cache });
      return { account: ACCOUNT, accessToken: 'fixture-only-private-access' };
    },
  };
  const provider = createOutlookProvider({
    config: { adapter: 'outlook', oauth: { clientId: 'fixture-client', tenant: 'common' } },
    auth,
    redirectUrl: 'http://127.0.0.1:4000/api/connections/email/oauth/callback',
    saveAuth: async saved => { saves.push(structuredClone(saved)); if (options.onSave) await options.onSave(saved); },
    msalFactory: config => { msalOptions = config; return msal; },
    fetchImpl: async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      const call = { url, method: init.method || 'GET', headers: new Headers(init.headers), body: init.body ? JSON.parse(init.body) : undefined };
      calls.push(call);
      assert.equal(url.origin, 'https://graph.microsoft.com');
      assert.equal(call.headers.get('authorization'), 'Bearer fixture-only-private-access');
      assert.match(call.headers.get('prefer'), /IdType="ImmutableId"/);
      if (url.pathname === '/v1.0/me') return json(PROFILE);
      if (url.pathname === '/v1.0/me/mailFolders/sentitems') return json({ id: 'sent-folder' });
      return options.fetch ? options.fetch(call) : json({ error: { code: 'ErrorItemNotFound', message: 'Fixture only' } }, 404);
    },
    clock: () => now,
    delay: async () => {},
    receiptAttempts: options.receiptAttempts || 3,
  });
  return { provider, auth, saves, calls, msalCalls, clock: value => { now = value; }, options: () => msalOptions };
}

test('Outlook PKCE callback validates one-time state and persists silent-refresh cache', async () => {
  const f = fixture({ auth: {} });
  const begin = await f.provider.connect();
  assert.equal(begin.status, 'auth_required');
  const request = f.msalCalls.find(call => call.method === 'getAuthCodeUrl').args;
  assert.equal(request.codeChallengeMethod, 'S256');
  assert.equal(request.codeChallenge, createHash('sha256').update(f.auth.pendingOAuth.verifier).digest('base64url'));
  assert.equal(request.prompt, 'select_account');
  assert.ok(request.scopes.includes('offline_access'));
  assert.ok(request.scopes.includes('Mail.Send'));
  await assert.rejects(f.provider.oauthCallback({ code: 'fixture-code', state: 'wrong' }), /did not match/);
  assert.equal(f.msalCalls.filter(call => call.method === 'acquireTokenByCode').length, 0);
  const verifier = f.auth.pendingOAuth.verifier;
  const connected = await f.provider.oauthCallback({ code: 'fixture-code', state: request.state });
  assert.equal(connected.status, 'connected');
  assert.equal(connected.account.email, PROFILE.mail);
  assert.equal(f.msalCalls.find(call => call.method === 'acquireTokenByCode').args.codeVerifier, verifier);
  assert.equal(f.auth.pendingOAuth, undefined);
  assert.equal(f.auth.accountId, ACCOUNT.homeAccountId);
  assert.ok(JSON.parse(f.saves.at(-1).msalCache).tokenGeneration > 0);
  assert.ok(!JSON.stringify(connected).includes('fixture-only-private-access'));
  await assert.rejects(f.provider.oauthCallback({ code: 'fixture-code', state: request.state }), /expired/);
  await f.provider.close();
});

test('Outlook expires stale OAuth attempts and sanitizes provider sign-in errors', async () => {
  const expired = fixture({ auth: {} });
  await expired.provider.connect();
  const pending = structuredClone(expired.auth.pendingOAuth);
  expired.clock(pending.createdAt + 10 * 60_000 + 1);
  await assert.rejects(expired.provider.oauthCallback({ code: 'fixture-code', state: pending.state }), /expired/);
  assert.equal(expired.msalCalls.filter(call => call.method === 'acquireTokenByCode').length, 0);
  const failed = fixture({ auth: {}, codeError: new Error('Bearer fixture-secret-code-and-token') });
  await failed.provider.connect();
  await assert.rejects(failed.provider.oauthCallback({ code: 'fixture-code', state: failed.auth.pendingOAuth.state }), error => /sign-in could not/.test(error.message) && !error.message.includes('fixture-secret'));
  assert.equal(failed.auth.pendingOAuth, undefined);
});

test('Outlook connects existing accounts silently and offers sign-in for revoked consent', async () => {
  const f = fixture();
  const connected = await f.provider.connect();
  assert.equal(connected.status, 'connected');
  assert.equal(f.msalCalls.filter(call => call.method === 'getAuthCodeUrl').length, 0);
  assert.ok(f.saves.length);
  assert.equal(f.options().system.loggerOptions.piiLoggingEnabled, false);
  const revoked = fixture({ silentError: Object.assign(new Error('fixture-secret'), { errorCode: 'invalid_grant' }) });
  const signIn = await revoked.provider.connect();
  assert.equal(signIn.status, 'auth_required');
  assert.ok(!JSON.stringify(signIn).includes('fixture-secret'));
});

test('Outlook requires configured desktop OAuth and a loopback callback', async () => {
  const missing = createOutlookProvider({ config: { oauth: { clientId: '' } }, redirectUrl: 'http://127.0.0.1:4000/callback' });
  await assert.rejects(missing.connect(), /client ID/);
  const remote = createOutlookProvider({ config: { oauth: { clientId: 'fixture-client' } }, redirectUrl: 'https://outside.example.test/callback' });
  await assert.rejects(remote.connect(), /on this computer/);
});

test('Outlook reads only exact conversation incoming messages across safe pages', async () => {
  const threadId = "conversation'&$top=999";
  const message = (id, extra = {}) => ({ id, conversationId: threadId, isDraft: false, parentFolderId: 'inbox-folder', from: { emailAddress: { address: 'careers@example.test' } }, receivedDateTime: '2026-11-13T09:00:00Z', body: { contentType: 'text', content: 'Interview invitation' }, ...extra });
  let pages = 0;
  const f = fixture({ fetch(call) {
    assert.equal(call.method, 'GET');
    if (!pages++) {
      assert.equal(call.url.searchParams.get('$filter'), `conversationId eq '${threadId.replaceAll("'", "''")}'`);
      assert.equal(call.url.searchParams.get('$top'), '50');
      return json({ value: [message('reply-1'), message('own', { from: { emailAddress: { address: PROFILE.mail } } }), message('draft', { isDraft: true }), message('wrong', { conversationId: 'other' }), message('sent-alias', { parentFolderId: 'sent-folder' }), message('no-date', { receivedDateTime: null })], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/messages?$skiptoken=fixture-page' });
    }
    return json({ value: [message('reply-1'), message('reply-2', { receivedDateTime: '2026-11-13T10:00:00Z', body: { contentType: 'html', content: '<p>Hello &amp; welcome</p><script>bad()</script>' } })] });
  } });
  const data = (await f.provider.call('outlook_read_thread', { threadId })).structuredContent;
  assert.deepEqual(data.replies.map(reply => reply.id), ['reply-1', 'reply-2']);
  assert.equal(data.replies[1].body.trim(), 'Hello & welcome');
  assert.ok(data.replies.every(reply => reply.threadId === threadId && reply.isReply && reply.from === SEND.to));
});

test('Outlook rejects a foreign pagination URL before it can receive credentials', async () => {
  const f = fixture({ fetch: () => json({ value: [], '@odata.nextLink': 'https://other.example.test/v1.0/me/messages' }) });
  await assert.rejects(f.provider.call('outlook_read_thread', { threadId: 'fixture-thread' }), /unsupported message page/);
  assert.equal(f.calls.filter(call => call.url.pathname === '/v1.0/me/messages').length, 1);
});

test('Outlook confirms a real sent copy and reuses the receipt without another write', async () => {
  let durableBeforeSend = false;
  const f = fixture({
    onSave(saved) { if (Object.values(saved.outlookOutbox || {}).some(entry => entry.messageId === SENT.id && entry.stage === 'sending')) durableBeforeSend = true; },
    fetch(call) {
      if (call.method === 'POST' && call.url.pathname === '/v1.0/me/messages') {
        assert.equal(call.body.subject, SEND.subject);
        assert.equal(call.body.body.content, SEND.body);
        return json({ id: SENT.id, conversationId: SENT.conversationId, isDraft: true }, 201);
      }
      if (call.method === 'POST') { assert.ok(durableBeforeSend); return json(null, 202); }
      return json(SENT);
    },
  });
  const response = await f.provider.call('outlook_send_email', SEND);
  const receipt = confirmedEmailReceipt(response);
  assert.equal(receipt.providerMessageId, SENT.id);
  assert.equal(receipt.threadId, SENT.conversationId);
  assert.equal(response.structuredContent.evidence, 'outlook_sent_copy');
  assert.ok(!JSON.stringify(response).includes('delivered'));
  const repeated = await f.provider.call('outlook_send_email', SEND);
  assert.deepEqual(repeated, response);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 2);
  await assert.rejects(f.provider.call('outlook_send_email', { ...SEND, body: 'Different content' }), /already used/);
});

test('Outlook 202 alone stays unknown and reconciliation never sends again', async () => {
  let copyAvailable = false;
  const f = fixture({ fetch(call) {
    if (call.method === 'POST' && call.url.pathname === '/v1.0/me/messages') return json({ id: SENT.id, isDraft: true }, 201);
    if (call.method === 'POST') return json(null, 202);
    return copyAvailable ? json(SENT) : json({ error: { code: 'ErrorItemNotFound' } }, 404);
  } });
  const unknown = await f.provider.call('outlook_send_email', SEND);
  assert.equal(unknown.structuredContent.status, 'unknown');
  assert.equal(unknown.structuredContent.messageId, SENT.id);
  assert.equal(confirmedEmailReceipt(unknown), null);
  assert.equal(Object.values(f.auth.outlookOutbox)[0].stage, 'pending');
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 2);
  copyAvailable = true;
  const receipt = await f.provider.call('outlook_reconcile_email', { idempotencyKey: SEND.idempotencyKey });
  assert.ok(confirmedEmailReceipt(receipt));
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 2);
  await assert.rejects(f.provider.call('outlook_reconcile_email', { messageId: 'unrelated-message' }), /not created by this tracker/);
});

test('Outlook ambiguous transport failure is inspected by ID without an SDK retry', async () => {
  let sends = 0;
  const f = fixture({ fetch(call) {
    if (call.method === 'POST' && call.url.pathname === '/v1.0/me/messages') return json({ id: SENT.id }, 201);
    if (call.method === 'POST') { sends++; throw new Error('fixture-only timeout Bearer private-secret'); }
    return json(SENT);
  } });
  const response = await f.provider.call('outlook_send_email', SEND);
  assert.ok(confirmedEmailReceipt(response));
  assert.equal(sends, 1);
  assert.ok(!JSON.stringify(response).includes('private-secret'));
});

test('Outlook retains draft evidence after failed send and validates input before any write', async () => {
  const f = fixture({ fetch(call) {
    if (call.method === 'POST' && call.url.pathname === '/v1.0/me/messages') return json({ id: SENT.id }, 201);
    if (call.method === 'POST') return json({ error: { code: 'ServiceUnavailable', message: 'fixture only' } }, 503);
    return json({ ...SENT, isDraft: true });
  } });
  await assert.rejects(f.provider.call('outlook_send_email', { ...SEND, subject: 'Subject\r\nBcc: other@example.test' }), /one-line/);
  await assert.rejects(f.provider.call('outlook_send_email', { ...SEND, idempotencyKey: undefined }), /idempotency key/);
  assert.equal(f.calls.length, 0);
  const pending = await f.provider.call('outlook_send_email', SEND);
  assert.equal(confirmedEmailReceipt(pending), null);
  await f.provider.call('outlook_send_email', SEND);
  assert.equal(f.calls.filter(call => call.method === 'POST' && call.url.pathname.endsWith('/send')).length, 1);
  const saved = structuredClone(f.auth);
  const reopened = fixture({ auth: saved, fetch: () => json(SENT) });
  assert.ok(confirmedEmailReceipt(await reopened.provider.call('outlook_reconcile_email', { messageId: SENT.id })));
  assert.equal(reopened.calls.filter(call => call.method === 'POST').length, 0);
});

test('Outlook mapping and tool discovery expose the normalized shared contract', () => {
  const f = fixture();
  assert.deepEqual(f.provider.mappings, OUTLOOK_MAPPINGS);
  const tools = f.provider.tools();
  assert.equal(tools.find(tool => tool.name === 'outlook_reconcile_email').annotations.readOnlyHint, true);
  assert.ok(tools.find(tool => tool.name === 'outlook_send_email').inputSchema.required.includes('idempotencyKey'));
  assert.ok(!JSON.stringify(tools).includes('fixture-only-private-access'));
});
