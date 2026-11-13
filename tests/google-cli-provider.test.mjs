import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleCliProvider } from '../server/providers/google-cli.mjs';
import { gmailMessageIdForIntent } from '../server/providers/gmail.mjs';

const unpack = result => result.structuredContent;
const send = { to: 'careers@example.test', subject: 'Application — أحمد', body: 'Hello\nMy experience is in operations.', idempotencyKey: 'run-company-role' };

function fixture(options = {}) {
  const calls = [], saves = [], auth = options.auth || {};
  let email = 'owner@example.test';
  const provider = createGoogleCliProvider({ dataDir: 'fixture-private-directory', auth,
    saveAuth: async value => { saves.push(structuredClone(value)); },
    execute: async (args, execution) => {
      const method = args.slice(0, args.indexOf('--params')).join(' ');
      const params = JSON.parse(args[args.indexOf('--params') + 1]);
      const body = args.includes('--json') ? JSON.parse(args[args.indexOf('--json') + 1]) : undefined;
      calls.push({ method, params, body, execution });
      if (method === 'gmail users getProfile') return { emailAddress: email };
      if (method === 'gmail users messages send') {
        options.beforeSend?.(saves.at(-1));
        if (options.sendError) throw options.sendError;
        return options.sendData ?? { id: 'provider-message', threadId: 'provider-thread' };
      }
      if (method === 'gmail users threads get') return options.thread || { id: params.id, messages: [] };
      if (method === 'gmail users messages list') return options.list || { messages: [] };
      if (method === 'gmail users messages get') return typeof options.message === 'function' ? options.message(auth) : options.message;
      throw new Error('Unexpected fixture action');
    },
  });
  return { provider, calls, saves, auth, setEmail: value => { email = value; } };
}

test('Google CLI send persists the exact MIME intent before writing and never repeats a successful key', async () => {
  const f = fixture({ beforeSend: saved => assert.equal(saved.googleCliOutbox[send.idempotencyKey].status, 'pending') });
  assert.deepEqual(await f.provider.connect(), { status: 'connected', account: 'owner@example.test' });
  const first = unpack(await f.provider.call('google_cli_send_email', send));
  assert.deepEqual(first, { status: 'accepted', messageId: 'provider-message', threadId: 'provider-thread', provider: 'google-cli' });
  const write = f.calls.find(call => call.body);
  assert.equal(write.method, 'gmail users messages send');
  assert.equal(write.params.userId, 'me');
  assert.equal(write.execution.allowWrite, true);
  assert.equal(write.execution.dataDir, 'fixture-private-directory');
  const mime = Buffer.from(write.body.raw, 'base64url').toString('utf8');
  assert.ok(mime.includes(`Message-ID: ${gmailMessageIdForIntent(send.idempotencyKey, 'owner@example.test')}`));
  assert.match(mime, /From: owner@example\.test\r\nTo: careers@example\.test\r\n/);
  assert.match(mime, /Content-Transfer-Encoding: base64/);
  assert.ok(!mime.includes(send.subject)); // UTF-8 subject is encoded, not lost.
  assert.deepEqual(unpack(await f.provider.call('google_cli_send_email', send)), first);
  assert.equal(f.calls.filter(call => call.body).length, 1);
  await assert.rejects(f.provider.call('google_cli_send_email', { ...send, body: 'A different message' }), /different/);
  assert.equal(f.calls.filter(call => call.body).length, 1);
});

test('Google CLI preserves unknown writes across restart and reconciles only one exact SENT message', async () => {
  const f = fixture({ sendError: new Error('connection ended after request') });
  await f.provider.connect();
  await assert.rejects(f.provider.call('google_cli_send_email', send));
  assert.equal(f.saves.at(-1).googleCliOutbox[send.idempotencyKey].status, 'pending');
  const restored = fixture({ auth: structuredClone(f.saves.at(-1)),
    list: { messages: [{ id: 'actual-sent-id' }] },
    message: auth => ({ id: 'actual-sent-id', threadId: 'actual-thread', labelIds: ['SENT'], payload: { headers: [
      { name: 'Message-ID', value: auth.googleCliOutbox[send.idempotencyKey].messageHeaderId },
      { name: 'From', value: 'Owner <owner@example.test>' }, { name: 'To', value: send.to },
    ] } }),
  });
  assert.equal(unpack(await restored.provider.call('google_cli_send_email', send)).status, 'unknown');
  const receipt = unpack(await restored.provider.call('google_cli_reconcile_send', { idempotencyKey: send.idempotencyKey }));
  assert.equal(receipt.messageId, 'actual-sent-id');
  assert.equal(receipt.threadId, 'actual-thread');
  assert.equal(receipt.status, 'sent');
  assert.equal(receipt.reconciled, true);
  assert.equal(receipt.provider, 'google-cli');
  assert.equal(restored.calls.filter(call => call.body).length, 0);
  const query = restored.calls.find(call => call.method.endsWith('messages list'));
  assert.equal(query.params.q, `in:sent rfc822msgid:${f.saves.at(-1).googleCliOutbox[send.idempotencyKey].messageHeaderId}`);
  assert.ok(restored.calls.every(call => call.execution.allowWrite === false));
});

test('Google CLI rejects draft/approval/malformed receipts and ambiguous reconciliation without resending', async () => {
  for (const sendData of [{ id: 'draft', threadId: 'thread', labelIds: ['DRAFT'] }, { id: 'approval', threadId: 'thread', requiresApproval: true }, { id: {}, threadId: 'thread' }, { id: 'message', threadId: 'thread', status: 'pending' }]) {
    const f = fixture({ sendData });
    assert.notEqual(unpack(await f.provider.call('google_cli_send_email', send)).status, 'accepted');
    assert.equal(unpack(await f.provider.call('google_cli_send_email', send)).status, 'unknown');
    assert.equal(f.calls.filter(call => call.body).length, 1);
  }
  for (const list of [{ messages: [] }, { messages: [{ id: 'one' }, { id: 'two' }] }, { messages: [{ id: 'one' }], nextPageToken: 'more' }]) {
    const f = fixture({ auth: { googleCliOutbox: { [send.idempotencyKey]: { account: 'owner@example.test', to: send.to, messageHeaderId: '<reserved@localhost>' } } }, list });
    assert.equal(unpack(await f.provider.call('google_cli_reconcile_send', { idempotencyKey: send.idempotencyKey })).status, 'unknown');
    assert.equal(f.calls.filter(call => call.method.endsWith('messages get') || call.body).length, 0);
  }
  const wrong = fixture({ auth: { googleCliOutbox: { [send.idempotencyKey]: { account: 'owner@example.test', to: send.to, messageHeaderId: '<reserved@localhost>' } } }, list: { messages: [{ id: 'wrong' }] }, message: { id: 'wrong', threadId: 'thread', labelIds: ['SENT'], payload: { headers: [{ name: 'Message-ID', value: '<unrelated@localhost>' }] } } });
  assert.equal(unpack(await wrong.provider.call('google_cli_reconcile_send', { idempotencyKey: send.idempotencyKey })).status, 'unknown');
});

test('Google CLI pins the selected account and refuses changed credentials before a write', async () => {
  const f = fixture();
  await f.provider.connect();
  f.setEmail('someone-else@example.test');
  await assert.rejects(f.provider.call('google_cli_send_email', send), /account changed/);
  assert.equal(f.calls.filter(call => call.body).length, 0);
  assert.equal(f.saves.length, 0);
  assert.ok(f.provider.tools().filter(tool => tool.name.includes('profile') || tool.name.includes('read_thread')).every(tool => tool.annotations.readOnlyHint));
});

test('Google CLI reads only the recorded thread and keeps incoming sender/time evidence', async () => {
  const f = fixture({ thread: { id: 'thread-1', messages: [
    { id: 'outgoing', threadId: 'thread-1', labelIds: ['SENT'], internalDate: '1800000000000', payload: { headers: [{ name: 'From', value: 'owner@example.test' }] } },
    { id: 'incoming', threadId: 'thread-1', internalDate: '1800000001000', payload: { mimeType: 'text/plain', headers: [{ name: 'From', value: 'Recruiter <careers@example.test>' }], body: { data: Buffer.from('Interview invitation').toString('base64url') } } },
  ] } });
  const value = unpack(await f.provider.call('google_cli_read_thread', { threadId: 'thread-1' }));
  assert.equal(value.provider, 'google-cli');
  assert.deepEqual(value.replies, [{ id: 'incoming', threadId: 'thread-1', from: 'careers@example.test', receivedAt: new Date(1800000001000).toISOString(), body: 'Interview invitation' }]);
  assert.equal(f.calls.find(call => call.method.endsWith('threads get')).params.id, 'thread-1');
  await assert.rejects(f.provider.call('google_cli_read_thread', { threadId: 'another-thread' }), /requested thread/);
  await assert.rejects(f.provider.call('google_cli_read_thread', { threadId: '../other' }), /recorded Gmail thread/);
  await assert.rejects(f.provider.call('google_cli_send_email', { ...send, subject: 'Hello\r\nBcc: other@example.test' }), /one line/);
  assert.equal(f.calls.filter(call => call.body).length, 0);
});
