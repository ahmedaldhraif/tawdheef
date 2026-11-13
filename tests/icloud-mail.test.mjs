import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createICloudMailProvider } from '../server/providers/icloud-mail.mjs';
import { confirmedEmailReceipt } from '../server/email-send.mjs';

function fixture(options = {}) {
  const state = { sends: 0, appends: 0, searches: [], imaps: [], smtp: null, auth: options.auth || {}, sent: [], incoming: [], source: Buffer.from('fixture'), raw: null };
  class Imap extends EventEmitter {
    async connect() {} close() {} async list() { return [{ path: 'Sent Messages', specialUse: '\\Sent' }, { path: 'INBOX' }]; }
    async getMailboxLock(path, config) { this.folder = path; assert.equal(config.readOnly, true); return { release() {} }; }
    async search(query) { state.searches.push(query); return (this.folder === 'INBOX' ? state.incoming : state.sent).map(m => m.uid); }
    async fetchAll() { return this.folder === 'INBOX' ? state.incoming : state.sent; }
    async fetchOne() { return { source: state.source }; }
    async append() { state.appends++; if (options.appendError) throw new Error('append failed'); }
  }
  const create = auth => createICloudMailProvider({ dataDir: options.dataDir, operationMs: options.operationMs, config: { credentials: { username: 'user@icloud.com', password: 'fixture-app-password' } }, auth: auth || state.auth, saveAuth: async value => { if (options.saveError) throw new Error('disk failed'); state.auth = value; }, createTransport: config => {
    state.smtp = config; return { verify: async () => {}, close() {}, sendMail: async mail => { state.sends++; state.raw = mail.raw.toString(); if (options.stall) return new Promise((_, reject) => mail.signal.addEventListener('abort', () => { state.aborted = true; reject(new Error('aborted')); })); if (options.sendError) throw new Error('SMTP disconnected'); return { accepted: ['jobs@example.test'], rejected: [], response: options.response || '250 2.0.0 queued 123' }; } };
  }, createImap: config => { state.imaps.push(config); return new Imap(); }, parse: async () => ({ text: 'Thanks for your application' }) });
  return { state, provider: create(), create, args: { to: 'jobs@example.test', subject: 'Application', body: 'Fixture text', idempotencyKey: 'fixture-send-intent' } };
}

test('iCloud sign-in verifies TLS endpoints without sending; accepted SMTP receipt and exact Message-ID are durable', async () => {
  const { state, provider, args } = fixture({ appendError: true });
  assert.equal((await provider.connect()).account, 'user@icloud.com'); assert.equal(state.sends, 0);
  assert.equal(state.smtp.host, 'smtp.mail.me.com'); assert.equal(state.smtp.requireTLS, true); assert.equal(state.smtp.tls.rejectUnauthorized, true);
  assert.equal(state.imaps[0].host, 'imap.mail.me.com'); assert.equal(state.imaps[0].port, 993); assert.equal(state.imaps[0].secure, true);
  const result = await provider.call('icloud_mail_send', args);
  const receipt = confirmedEmailReceipt(result); assert.ok(receipt.providerMessageId); assert.match(state.raw, /Message-ID: <apply-tracker\./);
  assert.equal(state.auth.icloudMailOutbox[args.idempotencyKey].receipt.messageId, receipt.providerMessageId);
  await provider.call('icloud_mail_send', args); assert.equal(state.sends, 1);
  await assert.rejects(provider.call('icloud_mail_send', { ...args, body: 'changed' }), /different/);
});

test('uncertain SMTP is never resent, including after restart; reconciliation inspects exact Sent evidence only', async () => {
  const { state, provider, args, create } = fixture({ sendError: true });
  const first = await provider.call('icloud_mail_send', args); assert.equal(first.structuredContent.status, 'unknown');
  const restarted = create(state.auth); await restarted.call('icloud_mail_send', args); assert.equal(state.sends, 1);
  assert.equal((await restarted.call('icloud_mail_reconcile', { idempotencyKey: args.idempotencyKey })).structuredContent.status, 'unknown');
  const original = state.auth.icloudMailOutbox[args.idempotencyKey];
  state.sent = [{ uid: 55, envelope: { messageId: original.messageId, from: [{ address: 'user@icloud.com' }], to: [{ address: 'wrong@example.test' }] }, flags: new Set() }];
  assert.equal((await restarted.call('icloud_mail_reconcile', { idempotencyKey: args.idempotencyKey })).structuredContent.status, 'unknown');
  state.sent[0].envelope.to[0].address = args.to;
  assert.ok(confirmedEmailReceipt(await restarted.call('icloud_mail_reconcile', { idempotencyKey: args.idempotencyKey })));
  assert.equal(state.sends, 1); assert.equal(state.appends, 0);
});

test('missing durable intent, invalid headers and ambiguous SMTP responses cannot become sends or successes', async () => {
  const { state, provider, args } = fixture({ saveError: true });
  await assert.rejects(provider.call('icloud_mail_send', args), /disk/); assert.equal(state.sends, 0);
  const other = fixture({ response: 'queued' });
  await assert.rejects(other.provider.call('icloud_mail_send', { ...args, subject: 'bad\r\nheader' }), /one line/);
  assert.equal(other.state.sends, 0); assert.equal(confirmedEmailReceipt(await other.provider.call('icloud_mail_send', args)), null);
});

test('thread reads match original reference, sender and recipient, with bounded downloads', async () => {
  const { state, provider, args } = fixture();
  const sent = (await provider.call('icloud_mail_send', args)).structuredContent;
  const envelope = { from: [{ address: args.to }], to: [{ address: 'user@icloud.com' }] };
  state.incoming = [{ uid: 1, envelope, size: state.source.length, internalDate: new Date(Date.now()+10), headers: Buffer.from(`In-Reply-To: ${sent.messageId}\r\n`) }, { uid: 2, envelope, size: state.source.length, internalDate: new Date(), headers: Buffer.from(`References: <wrong>\r\n`) }];
  assert.equal((await provider.call('icloud_mail_thread', { threadId: sent.threadId })).structuredContent.replies.length, 1);
  state.incoming[0].size = 300000;
  await assert.rejects(provider.call('icloud_mail_thread', { threadId: sent.threadId }), /large attachment/);
  await assert.rejects(provider.call('icloud_mail_thread', { threadId: 'not-recorded' }), /recorded/);
  await provider.close(); await assert.rejects(provider.call('icloud_mail_send', { ...args, idempotencyKey: 'another' }), /closed/);
});

test('disconnecting credentials preserves the account-bound iCloud tracking ledger', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'icloud-ledger-')); t.after(() => rm(dataDir, { recursive: true, force: true, maxRetries: 5 }));
  const { provider, args, create, state } = fixture({ dataDir });
  const sent = (await provider.call('icloud_mail_send', args)).structuredContent;
  await provider.close();
  const reconnected = create({});
  assert.deepEqual((await reconnected.call('icloud_mail_thread', { threadId: sent.threadId })).structuredContent.replies, []);
  await reconnected.call('icloud_mail_send', args); assert.equal(state.sends, 1);
  await reconnected.close();
});

test('a total deadline aborts the SMTP operation and retains an uncertain intent', async () => {
  const { provider, args, state } = fixture({ stall: true, operationMs: 10 });
  await assert.rejects(provider.call('icloud_mail_send', args), /timed out/);
  assert.equal(state.aborted, true); assert.equal(state.sends, 1);
  assert.equal(state.auth.icloudMailOutbox[args.idempotencyKey].status, 'pending');
  await assert.rejects(provider.call('icloud_mail_send', args), /closed/);
});
