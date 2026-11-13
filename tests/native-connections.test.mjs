import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConnectionManager } from '../server/connections.mjs';

const defer = () => { let resolve; const promise = new Promise(accept => { resolve = accept; }); return { promise, resolve }; };
const tool = { name: 'fixture_read', inputSchema: { type: 'object', properties: { id: { type: 'string' } } }, annotations: { readOnlyHint: true } };
const mappings = { profile: { tool: 'fixture_read', arguments: { id: '{{id}}' } } };
const readPrivate = manager => readFile(manager.file, 'utf8').then(JSON.parse);

async function fixture(providers) {
  const dataDir = await mkdtemp(join(tmpdir(), 'apply-tracker-native-'));
  const manager = new ConnectionManager({ dataDir, providers });
  return { manager, dataDir, close: async () => { await manager.close(); await rm(dataDir, { recursive: true, force: true }); } };
}

test('native connection OAuth, default mappings and saved sign-in share the manager contract without public secrets', async () => {
  const captured = [], calls = [];
  const factory = async options => {
    captured.push(options);
    return {
      tools: () => [tool], mappings,
      connect: async () => options.auth.tokens
        ? { status: 'connected', account: 'owner@example.test' }
        : (await options.saveAuth({ pending: { state: 'fixture-state', verifier: 'NEVER-PRINT-VERIFIER' } }), { status: 'auth_required', authUrl: 'https://provider.example/authorize?state=fixture-state' }),
      oauthCallback: async query => {
        assert.equal(query.code, 'fixture-code');
        await options.saveAuth({ tokens: { access_token: 'NEVER-PRINT-ACCESS', refresh_token: 'NEVER-PRINT-REFRESH' } });
        return { status: 'connected', account: 'owner@example.test' };
      },
      call: async (name, args) => { calls.push({ name, args }); return { structuredContent: { id: args.id } }; },
      close: async () => {},
    };
  };
  const f = await fixture({ gmail: factory });
  try {
    await f.manager.save('email', { adapter: 'gmail', oauth: { clientId: 'desktop-client', clientSecret: 'NEVER-PRINT-CLIENT' } });
    const pending = await f.manager.connect('email');
    assert.equal(pending.status, 'auth_required');
    assert.equal(pending.toolCount, 0);
    assert.equal(captured[0].redirectUrl, 'http://127.0.0.1:4000/api/connections/email/oauth/callback');
    const ready = await f.manager.oauthCallback('email', { code: 'fixture-code' });
    assert.equal(ready.status, 'connected');
    assert.equal(ready.toolCount, 1);
    assert.equal(ready.hasClientSecret, true);
    assert.ok(!JSON.stringify(ready).includes('NEVER-PRINT'));
    assert.deepEqual(f.manager.getMappings('email'), mappings);
    assert.deepEqual(await f.manager.callMapped('email', 'profile', { id: 'recorded-id' }), { structuredContent: { id: 'recorded-id' } });
    assert.deepEqual(calls, [{ name: 'fixture_read', args: { id: 'recorded-id' } }]);
    await f.manager.close();
    const reopened = new ConnectionManager({ dataDir: f.dataDir, providers: { gmail: factory } });
    try {
      assert.equal(reopened.list().find(item => item.kind === 'email').status, 'disconnected');
      assert.equal((await reopened.connect('email')).status, 'connected');
      assert.equal(captured.at(-1).auth.tokens.refresh_token, 'NEVER-PRINT-REFRESH');
      assert.ok(!JSON.stringify(reopened.list()).includes('NEVER-PRINT'));
    } finally { await reopened.close(); }
  } finally { await f.close(); }
});

test('calendar credentials remain private, survive same-target edits and clear on provider change/disconnect', async () => {
  const captured = [];
  const factory = async options => {
    captured.push(options);
    return { tools: () => [tool], mappings, connect: async () => { await options.saveAuth({ privateToken: 'NEVER-PRINT-NATIVE' }); return { status: 'connected', account: options.config.credentials?.username || 'owner@example.test' }; }, call: async () => ({}), close: async () => {} };
  };
  const f = await fixture({ 'icloud-calendar': factory, 'google-calendar': factory });
  try {
    await assert.rejects(f.manager.save('email', { adapter: 'icloud-calendar', credentials: { username: 'owner@example.test', password: 'NEVER-PRINT-PASSWORD' } }), /for calendar/);
    await assert.rejects(f.manager.save('calendar', { adapter: 'gmail' }), /for email/);
    await f.manager.save('calendar', { adapter: 'icloud-calendar', credentials: { username: 'owner@example.test', password: 'NEVER-PRINT-PASSWORD' } });
    const ready = await f.manager.connect('calendar');
    assert.equal(ready.hasCredentials, true);
    assert.equal(ready.credentialUsername, 'owner@example.test');
    assert.ok(!JSON.stringify(ready).includes('NEVER-PRINT'));
    await f.manager.save('calendar', { label: 'My calendar' });
    const stored = await readPrivate(f.manager);
    assert.equal(stored.calendar.config.credentials.password, 'NEVER-PRINT-PASSWORD');
    assert.equal(stored.calendar.auth.privateToken, 'NEVER-PRINT-NATIVE');
    await f.manager.save('calendar', { adapter: 'google-calendar', oauth: { clientId: 'google-calendar-client' } });
    const switched = (await readPrivate(f.manager)).calendar;
    assert.equal(switched.config.credentials, undefined);
    assert.deepEqual(switched.auth, {});
    await f.manager.connect('calendar');
    const disconnected = await f.manager.disconnect('calendar');
    assert.equal(disconnected.status, 'disconnected');
    assert.equal(disconnected.canAutoConnect, false);
    assert.deepEqual((await readPrivate(f.manager)).calendar.auth, {});
    await assert.rejects(f.manager.tools('calendar'), /disconnected/);
  } finally { await f.close(); }
});

test('changing only a native client secret invalidates late saves and late connect success', async () => {
  const started = defer(), completion = defer();
  let oldOptions;
  const f = await fixture({ gmail: async options => {
    oldOptions = options;
    return { tools: () => [tool], mappings, connect: async () => { started.resolve(); return completion.promise; }, close: async () => {} };
  } });
  try {
    await f.manager.save('email', { adapter: 'gmail', oauth: { clientId: 'same-client', clientSecret: 'original-secret' } });
    const pending = f.manager.connect('email');
    await started.promise;
    await f.manager.save('email', { oauth: { clientId: 'same-client', clientSecret: 'replacement-secret' } });
    await assert.rejects(oldOptions.saveAuth({ tokens: { access_token: 'stale-token' } }), /changed/);
    completion.resolve({ status: 'connected', account: 'stale@example.test' });
    await assert.rejects(pending, /changed/);
    const state = f.manager.list().find(item => item.kind === 'email');
    assert.equal(state.status, 'disconnected');
    assert.equal(state.account, undefined);
    const stored = await readPrivate(f.manager);
    assert.equal(stored.email.config.oauth.clientSecret, 'replacement-secret');
    assert.deepEqual(stored.email.auth, {});
  } finally { completion.resolve({ status: 'connected' }); await f.close(); }
});

test('disconnect cannot be undone by an in-flight native OAuth callback', async () => {
  const started = defer(), completion = defer();
  let options;
  const f = await fixture({ gmail: async value => {
    options = value;
    return { tools: () => [tool], mappings,
      connect: async () => ({ status: 'auth_required', authUrl: 'https://provider.example/authorize' }),
      oauthCallback: async () => { started.resolve(); return completion.promise; }, close: async () => {},
    };
  } });
  try {
    await f.manager.save('email', { adapter: 'gmail', oauth: { clientId: 'desktop-client' } });
    await f.manager.connect('email');
    const callback = f.manager.oauthCallback('email', { code: 'original-code' });
    await started.promise;
    await f.manager.disconnect('email');
    await assert.rejects(options.saveAuth({ tokens: { refresh_token: 'late-refresh' } }), /changed/);
    completion.resolve({ status: 'connected', account: 'late@example.test' });
    await assert.rejects(callback, /changed/);
    const state = f.manager.list().find(item => item.kind === 'email');
    assert.equal(state.status, 'disconnected');
    assert.equal(state.account, undefined);
    assert.equal(state.authUrl, undefined);
    assert.equal(state.canAutoConnect, false);
    assert.deepEqual((await readPrivate(f.manager)).email.auth, {});
  } finally { completion.resolve({ status: 'connected' }); await f.close(); }
});

test('late native factory completion cannot replace a newer account connection', async () => {
  const started = defer(), completion = defer();
  let oldClosed = 0, created = 0;
  const f = await fixture({ gmail: async options => {
    const first = ++created === 1;
    if (first) { started.resolve(); await completion.promise; }
    return { tools: () => [tool], mappings, connect: async () => ({ status: 'connected', account: first ? 'old@example.test' : 'new@example.test' }), close: async () => { if (first) oldClosed++; } };
  } });
  try {
    await f.manager.save('email', { adapter: 'gmail', oauth: { clientId: 'first-client' } });
    const old = f.manager.connect('email');
    await started.promise;
    await f.manager.save('email', { oauth: { clientId: 'second-client' } });
    assert.equal((await f.manager.connect('email')).account, 'new@example.test');
    completion.resolve();
    await assert.rejects(old, /changed/);
    const state = f.manager.list().find(item => item.kind === 'email');
    assert.equal(state.account, 'new@example.test');
    assert.equal(state.status, 'connected');
    assert.equal(oldClosed, 1);
    assert.equal(state.oauthClientId, 'second-client');
  } finally { completion.resolve(); await f.close(); }
});
