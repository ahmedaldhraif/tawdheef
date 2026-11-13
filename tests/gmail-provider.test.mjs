import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { createGmailProvider, GMAIL_MAPPINGS, normalizeGmailThread, buildGmailRawMessage, gmailMessageIdForIntent } from '../server/providers/gmail.mjs';

const SCOPES = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send';
const REDIRECT = 'http://127.0.0.1:4000/api/connections/email/oauth/callback';
const encode = value => Buffer.from(value, 'utf8').toString('base64url');

function fixture(options = {}) {
  const calls = [], saves = [];
  let current = 1_800_000_000_000;
  let profileEmail = options.profileEmail || 'owner@example.test';
  class OAuth extends EventEmitter {
    setCredentials(credentials) { this.credentials = structuredClone(credentials); }
    generateAuthUrl(values) {
      this.authValues = values;
      return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ ...values, scope: values.scope.join(' ') })}`;
    }
    async getToken(values) {
      calls.push({ operation: 'exchange', values });
      if (options.tokenError) throw options.tokenError;
      return { tokens: options.tokens || { access_token: 'fixture-access', refresh_token: 'fixture-refresh', scope: SCOPES, expiry_date: current + 3600_000 } };
    }
  }
  const oauth = new OAuth();
  const gmail = { users: {
    getProfile: async (args, requestOptions) => {
      calls.push({ operation: 'profile', args, requestOptions });
      if (options.profileError) throw options.profileError;
      return { data: { emailAddress: profileEmail } };
    },
    threads: { get: async (args, requestOptions) => {
      calls.push({ operation: 'thread', args, requestOptions });
      return { data: options.thread || { id: args.id, messages: [] } };
    } },
    messages: { send: async (args, requestOptions) => {
      calls.push({ operation: 'send', args, requestOptions });
      options.beforeSend?.(saves.at(-1));
      if (options.sendError) throw options.sendError;
      return { data: Object.hasOwn(options, 'sendData') ? options.sendData : { id: 'actual-provider-message', threadId: 'actual-provider-thread' } };
    }, list: async (args, requestOptions) => {
      calls.push({ operation: 'list', args, requestOptions });
      return { data: options.listData || { messages: [] } };
    }, get: async (args, requestOptions) => {
      calls.push({ operation: 'get', args, requestOptions });
      return { data: typeof options.messageData === 'function' ? options.messageData(args) : options.messageData };
    } },
  } };
  const provider = createGmailProvider({
    config: options.config || { adapter: 'gmail', oauth: { clientId: 'fixture-client', clientSecret: 'fixture-client-secret' } },
    auth: options.auth || {}, redirectUrl: options.redirectUrl || REDIRECT,
    saveAuth: async value => { saves.push(structuredClone(value)); },
    createOAuthClient: async credentials => { calls.push({ operation: 'createOAuth', credentials }); return oauth; },
    createGmailClient: async auth => { assert.equal(auth, oauth); return gmail; }, now: () => current,
  });
  return { provider, oauth, calls, saves, setNow: value => { current = value; }, setProfile: value => { profileEmail = value; } };
}

const signedIn = { tokens: { access_token: 'fixture-access', refresh_token: 'fixture-refresh', scope: SCOPES }, account: 'owner@example.test' };

test('Gmail starts scoped desktop OAuth with PKCE and persists private pending state', async () => {
  const { provider, oauth, calls, saves } = fixture();
  const state = await provider.connect();
  assert.equal(state.status, 'auth_required');
  assert.equal(new URL(state.authUrl).origin, 'https://accounts.google.com');
  assert.deepEqual(oauth.authValues.scope, SCOPES.split(' '));
  assert.equal(oauth.authValues.access_type, 'offline');
  assert.equal(oauth.authValues.code_challenge_method, 'S256');
  assert.equal(oauth.authValues.code_challenge, createHash('sha256').update(saves.at(-1).pending.verifier).digest('base64url'));
  assert.equal(oauth.authValues.state, saves.at(-1).pending.state);
  assert.ok(!JSON.stringify(state).includes('fixture-client-secret'));
  assert.ok(!JSON.stringify(state).includes(saves.at(-1).pending.verifier));
  assert.equal(calls.filter(call => call.operation === 'profile').length, 0);
  assert.deepEqual(provider.mappings, GMAIL_MAPPINGS);
  assert.deepEqual(provider.tools().map(tool => tool.name), ['gmail_send_email', 'gmail_read_thread', 'gmail_reconcile_send', 'gmail_profile']);
});

test('Gmail callback rejects mismatched, missing, expired and replayed state before exchanging codes', async () => {
  const f = fixture();
  await f.provider.connect();
  const pending = f.saves.at(-1).pending;
  await assert.rejects(f.provider.oauthCallback({ code: 'secret-code', state: 'wrong-state' }), /did not match/);
  await assert.rejects(f.provider.oauthCallback({ code: 'secret-code' }), /did not match/);
  assert.equal(f.calls.filter(call => call.operation === 'exchange').length, 0);
  f.setNow(pending.createdAt + 10 * 60_000 + 1);
  await assert.rejects(f.provider.oauthCallback({ code: 'secret-code', state: pending.state }), /expired/);
  assert.equal(f.saves.at(-1).pending, undefined);
  await assert.rejects(f.provider.oauthCallback({ code: 'secret-code', state: pending.state }), /did not match/);
});

test('Gmail callback exchanges its verifier and stores actual account credentials for background restart', async () => {
  const f = fixture();
  await f.provider.connect();
  const pending = f.saves.at(-1).pending;
  const state = await f.provider.oauthCallback(new URLSearchParams({ code: 'fixture-auth-code', state: pending.state }));
  assert.deepEqual(state, { status: 'connected', account: 'owner@example.test' });
  assert.deepEqual(f.calls.find(call => call.operation === 'exchange').values, { code: 'fixture-auth-code', codeVerifier: pending.verifier, redirect_uri: REDIRECT });
  assert.equal(f.saves.at(-1).tokens.refresh_token, 'fixture-refresh');
  assert.equal(f.saves.at(-1).pending, undefined);
  assert.ok(!JSON.stringify(state).includes('fixture-access'));
  await assert.rejects(f.provider.oauthCallback({ code: 'fixture-auth-code', state: pending.state }), /did not match/);
  const reopened = fixture({ auth: f.saves.at(-1) });
  assert.equal((await reopened.provider.connect()).status, 'connected');
  assert.equal(reopened.oauth.authValues, undefined);
});

test('denied Gmail consent and provider errors cannot leak authorization codes or tokens', async () => {
  const f = fixture();
  await f.provider.connect();
  await assert.rejects(f.provider.oauthCallback({ error: 'access_denied secret-token', state: f.saves.at(-1).pending.state }), error => {
    assert.match(error.message, /not completed/);
    return !error.message.includes('secret-token');
  });
  const bad = fixture({ tokenError: new Error('request client_secret=leak code=secret-code') });
  await bad.provider.connect();
  await assert.rejects(bad.provider.oauthCallback({ code: 'secret-code', state: bad.saves.at(-1).pending.state }), error => {
    assert.match(error.message, /could not complete/);
    return !/leak|secret-code/.test(error.message);
  });
});

test('Gmail keeps existing same-account refresh tokens during authorization and access-token refresh', async () => {
  const f = fixture({ auth: { ...signedIn, tokens: { refresh_token: 'existing-refresh', scope: SCOPES } }, tokens: { access_token: 'new-access', scope: SCOPES } });
  // Simulate an OAuth reconnect from a partial grant, then a successful fresh grant without a replacement refresh token.
  const pendingAuth = fixture({ auth: { tokens: { refresh_token: 'existing-refresh', scope: 'partial' }, account: signedIn.account }, tokens: { access_token: 'new-access', scope: SCOPES } });
  await pendingAuth.provider.connect();
  await pendingAuth.provider.oauthCallback({ code: 'code', state: pendingAuth.saves.at(-1).pending.state });
  assert.equal(pendingAuth.saves.at(-1).tokens.refresh_token, 'existing-refresh');
  assert.equal((await f.provider.connect()).status, 'connected');
  f.oauth.emit('tokens', { access_token: 'rotated-access', refresh_token: undefined, expiry_date: 1_900_000_000_000 });
  await f.provider.close();
  assert.equal(f.saves.at(-1).tokens.refresh_token, 'existing-refresh');
  assert.equal(f.saves.at(-1).tokens.access_token, 'rotated-access');
});

test('Gmail never reuses a different account refresh token after account selection changes', async () => {
  const f = fixture({
    auth: { tokens: { refresh_token: 'old-account-refresh', scope: 'partial' }, account: 'old@example.test' },
    tokens: { access_token: 'new-account-access', scope: SCOPES }, profileEmail: 'new@example.test',
  });
  await f.provider.connect();
  await assert.rejects(f.provider.oauthCallback({ code: 'code', state: f.saves.at(-1).pending.state }), /own background access/);
  assert.equal(f.saves.at(-1).tokens, undefined);
});

test('Gmail refuses missing background access and known partial permissions', async () => {
  const f = fixture({ tokens: { access_token: 'access-only', scope: SCOPES } });
  await f.provider.connect();
  await assert.rejects(f.provider.oauthCallback({ code: 'code', state: f.saves.at(-1).pending.state }), /background access/);
  assert.equal((await f.provider.connect()).status, 'auth_required');
  const partial = fixture({ auth: { tokens: { refresh_token: 'refresh', scope: 'https://www.googleapis.com/auth/gmail.send' } } });
  assert.equal((await partial.provider.connect()).status, 'auth_required');
  assert.equal(partial.calls.filter(call => call.operation === 'profile').length, 0);
});

test('Gmail normalizes only incoming messages in the requested thread, decoding nested MIME and HTML safely', () => {
  const make = (id, options = {}) => ({
    id, threadId: 'thread-1', internalDate: '1800000000000', labelIds: ['INBOX'],
    payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: 'Hiring Team <Careers@example.test>' }], body: { data: encode('Hello مرحبا') } },
    ...options,
  });
  const thread = { id: 'thread-1', messages: [
    make('incoming'),
    make('sent', { labelIds: ['SENT'] }), make('draft', { labelIds: ['DRAFT'] }),
    make('other-thread', { threadId: 'other-thread' }), make('bad-date', { internalDate: 'invalid' }),
    make('own', { payload: { headers: [{ name: 'From', value: 'Owner <owner@example.test>' }] } }),
    make('nested', { internalDate: '1800000001000', payload: { mimeType: 'multipart/mixed', headers: [{ name: 'from', value: 'careers@example.test' }], parts: [
      { mimeType: 'text/plain', filename: 'attachment.txt', body: { data: encode('Do not treat attachment as a reply') } },
      { mimeType: 'multipart/alternative', parts: [
        { mimeType: 'text/html', body: { data: encode('<p>Duplicate HTML</p>') } },
        { mimeType: 'text/plain', body: { data: encode('Plain body café') } },
      ] },
    ] } }),
    make('html', { internalDate: '1800000002000', payload: { mimeType: 'text/html', headers: [{ name: 'From', value: 'careers@example.test' }], body: { data: encode('<style>hidden</style><p>Interview &amp; coffee</p><script>evil()</script><p>Tomorrow &#x1F44B;</p>') } } }),
  ] };
  const normalized = normalizeGmailThread(thread, { account: 'owner@example.test', threadId: 'thread-1' });
  assert.deepEqual(normalized.replies.map(item => item.id), ['incoming', 'nested', 'html']);
  assert.equal(normalized.replies[0].from, 'Careers@example.test');
  assert.equal(normalized.replies[0].body, 'Hello مرحبا');
  assert.equal(normalized.replies[1].body, 'Plain body café');
  assert.equal(normalized.replies[2].body, 'Interview & coffee\nTomorrow 👋');
  assert.equal(normalized.replies[0].receivedAt, '2027-01-15T08:00:00.000Z');
  assert.throws(() => normalizeGmailThread(thread, { account: 'owner@example.test', threadId: 'unrelated' }), /requested thread/);
});

test('Gmail sends one UTF-8 MIME email and returns the actual accepted receipt without claiming delivery', async () => {
  const f = fixture({ auth: signedIn });
  const response = await f.provider.call('gmail_send_email', {
    to: 'careers@example.test', subject: 'طلب وظيفة — Application', body: 'Hello café\nمرحبا', idempotencyKey: 'application-fixture',
  });
  const sends = f.calls.filter(call => call.operation === 'send');
  assert.equal(sends.length, 1);
  assert.equal(sends[0].requestOptions.retry, false);
  const raw = Buffer.from(sends[0].args.requestBody.raw, 'base64url').toString('utf8');
  assert.match(raw, /From: owner@example.test\r\nTo: careers@example.test/);
  const subject = raw.match(/Subject: =\?UTF-8\?B\?(.+)\?=/)[1];
  assert.equal(Buffer.from(subject, 'base64').toString('utf8'), 'طلب وظيفة — Application');
  const body64 = raw.split('\r\n\r\n')[1];
  assert.equal(Buffer.from(body64, 'base64').toString('utf8'), 'Hello café\r\nمرحبا');
  assert.deepEqual(response.structuredContent, { provider: 'gmail', status: 'accepted', messageId: 'actual-provider-message', threadId: 'actual-provider-thread' });
  assert.ok(!JSON.stringify(response).includes('delivered'));
});

test('Gmail rejects header injection before sending and cannot return a fabricated receipt', async () => {
  const f = fixture({ auth: signedIn, sendData: { labelIds: ['SENT'] } });
  await assert.rejects(f.provider.call('gmail_send_email', { to: 'careers@example.test\r\nBcc: bad@example.test', subject: 'Hello', body: 'Body' }), /valid recipient/);
  await assert.rejects(f.provider.call('gmail_send_email', { to: 'careers@example.test', subject: 'Hello\r\nBcc: bad@example.test', body: 'Body' }), /one line/);
  assert.equal(f.calls.filter(call => call.operation === 'send').length, 0);
  await assert.rejects(f.provider.call('gmail_send_email', { to: 'careers@example.test', subject: 'Hello', body: 'Body', idempotencyKey: 'unknown-receipt' }), /no message ID/);
  assert.equal(f.calls.filter(call => call.operation === 'send').length, 1);
  const longSubjectRaw = Buffer.from(buildGmailRawMessage({ to: 'to@example.test', from: 'from@example.test', subject: 'مرحبا'.repeat(100), body: 'Body' }), 'base64url').toString('utf8');
  assert.ok(longSubjectRaw.split('\r\n').filter(line => line.startsWith('Subject:') || line.startsWith(' ')).every(line => line.length <= 78));
});

test('Gmail preserves unknown send outcomes, redacts provider errors and never retries sends', async () => {
  const f = fixture({ auth: signedIn, sendError: new Error('request access_token=super-secret timed out') });
  await assert.rejects(f.provider.call('gmail_send_email', { to: 'careers@example.test', subject: 'Hello', body: 'Body', idempotencyKey: 'send-error' }), error => {
    assert.match(error.message, /Check Sent before retrying/);
    return !error.message.includes('super-secret');
  });
  assert.equal(f.calls.filter(call => call.operation === 'send').length, 1);
});

test('Gmail persists a body-free send intent before writing, reuses receipts and rejects changed content', async () => {
  let pendingAtSend;
  const f = fixture({ auth: signedIn, beforeSend: saved => { pendingAtSend = structuredClone(saved); } });
  const args = { to: 'careers@example.test', subject: 'Hello', body: 'PRIVATE APPLICATION BODY', idempotencyKey: 'safe-intent' };
  const receipt = await f.provider.call('gmail_send_email', args);
  const intent = Object.values(pendingAtSend.gmailOutbox)[0];
  assert.equal(intent.status, 'pending');
  assert.equal(intent.messageHeaderId, gmailMessageIdForIntent(args.idempotencyKey, signedIn.account));
  assert.ok(!JSON.stringify(pendingAtSend).includes('PRIVATE APPLICATION BODY'));
  const again = await f.provider.call('gmail_send_email', args);
  assert.deepEqual(again, receipt);
  assert.equal(f.calls.filter(call => call.operation === 'send').length, 1);
  await assert.rejects(f.provider.call('gmail_send_email', { ...args, body: 'Different body' }), /different email content/);
  assert.equal(f.calls.filter(call => call.operation === 'send').length, 1);
  await assert.rejects(f.provider.call('gmail_send_email', { ...args, idempotencyKey: '' }), /tracked send key/);
});

test('Gmail reconciles an unknown send by exact stable Message-ID and actual Sent metadata without resending', async () => {
  const args = { to: 'careers@example.test', subject: 'Hello', body: 'Body', idempotencyKey: 'lost-response' };
  const f = fixture({ auth: signedIn, sendError: new Error('lost response') });
  await assert.rejects(f.provider.call('gmail_send_email', args), /Check Sent/);
  const pending = await f.provider.call('gmail_send_email', args);
  assert.equal(pending.structuredContent.status, 'pending');
  assert.equal(f.calls.filter(call => call.operation === 'send').length, 1);
  const messageHeaderId = gmailMessageIdForIntent(args.idempotencyKey, signedIn.account);
  const reopened = fixture({
    auth: f.saves.at(-1),
    listData: { messages: [{ id: 'real-sent-message' }] },
    messageData: { id: 'real-sent-message', threadId: 'real-thread', labelIds: ['SENT'], payload: { headers: [
      { name: 'Message-ID', value: messageHeaderId }, { name: 'From', value: signedIn.account }, { name: 'To', value: args.to },
    ] } },
  });
  const confirmed = await reopened.provider.call('gmail_reconcile_send', { idempotencyKey: args.idempotencyKey });
  assert.deepEqual(confirmed.structuredContent, { provider: 'gmail', status: 'sent', messageId: 'real-sent-message', threadId: 'real-thread', reconciled: true });
  assert.equal(reopened.calls.filter(call => call.operation === 'send').length, 0);
  assert.equal(reopened.calls.find(call => call.operation === 'list').args.q, `in:sent rfc822msgid:${messageHeaderId}`);
  assert.deepEqual((await reopened.provider.call('gmail_send_email', args)).structuredContent, confirmed.structuredContent);
  assert.equal(reopened.calls.filter(call => call.operation === 'send').length, 0);
});

test('Gmail reconciliation refuses drafts, mismatched recipients, unknown keys and duplicate Sent matches', async () => {
  const args = { to: 'careers@example.test', subject: 'Hello', body: 'Body', idempotencyKey: 'verify-only' };
  const initial = fixture({ auth: signedIn, sendError: new Error('lost response') });
  await assert.rejects(initial.provider.call('gmail_send_email', args), /Check Sent/);
  const messageHeaderId = gmailMessageIdForIntent(args.idempotencyKey, signedIn.account);
  const message = { id: 'sent1', threadId: 'thread1', labelIds: ['SENT'], payload: { headers: [
    { name: 'Message-ID', value: messageHeaderId }, { name: 'From', value: signedIn.account }, { name: 'To', value: args.to },
  ] } };
  for (const changed of [
    { ...message, labelIds: ['DRAFT'] },
    { ...message, payload: { headers: [...message.payload.headers.filter(header => header.name !== 'To'), { name: 'To', value: 'different@example.test' }] } },
    { ...message, payload: { headers: [...message.payload.headers.filter(header => header.name !== 'Message-ID'), { name: 'Message-ID', value: '<different@localhost>' }] } },
  ]) {
    const f = fixture({ auth: initial.saves.at(-1), listData: { messages: [{ id: 'sent1' }] }, messageData: changed });
    assert.equal((await f.provider.call('gmail_reconcile_send', { idempotencyKey: args.idempotencyKey })).structuredContent.status, 'unconfirmed');
    assert.equal(f.calls.filter(call => call.operation === 'send').length, 0);
  }
  const duplicates = fixture({ auth: initial.saves.at(-1), listData: { messages: [{ id: 'sent1' }, { id: 'sent2' }] }, messageData: ({ id }) => ({ ...message, id }) });
  assert.equal((await duplicates.provider.call('gmail_reconcile_send', { idempotencyKey: args.idempotencyKey })).structuredContent.status, 'ambiguous');
  await assert.rejects(duplicates.provider.call('gmail_reconcile_send', { idempotencyKey: 'unknown-intent' }), /No Gmail send intent/);
});

test('Gmail configuration requires a local callback and does not expose private credentials through tools', async () => {
  const f = fixture({ redirectUrl: 'https://remote.example.test/callback' });
  await assert.rejects(f.provider.connect(), /on this computer/);
  const clean = fixture();
  assert.ok(!JSON.stringify(clean.provider.tools()).includes('fixture-client-secret'));
  await assert.rejects(clean.provider.call('invented', {}), /built-in Gmail tools/);
});
