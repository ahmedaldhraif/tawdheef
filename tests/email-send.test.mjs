import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server/store.mjs';
import { sendEmailForRun, confirmedEmailReceipt } from '../server/email-send.mjs';

async function setup(t, response = { structuredContent: { messageId: 'message-1', threadId: 'thread-1', sent: true } }) {
  const dataDir = await mkdtemp(join(tmpdir(), 'apply-send-'));
  const store = openStore({ dataDir, seed: false });
  store.createDirectory({ id: 'fixture', name: 'Fixture directory' });
  const { ids } = store.addCompanies('fixture', [
    { name: 'Fixture One', email: 'careers-one@example.test' },
    { name: 'Fixture Two', email: 'careers-two@example.test' },
  ]);
  const run = store.startRun({ companyIds: ids, explicit: true, mode: 'send_and_submit' });
  const calls = [];
  const connections = {
    getMappings: () => ({ sendEmail: { tool: 'fixture.send', arguments: { to: '{{to}}', subject: '{{subject}}', body: '{{body}}', idempotencyKey: '{{idempotencyKey}}' } } }),
    tools: async () => [{ name: 'fixture.send' }],
    call: async (kind, name, args) => { calls.push({ kind, name, args }); return typeof response === 'function' ? response() : response; },
  };
  const input = { companyId: ids[0], role: 'Product designer', to: 'careers-one@example.test', subject: 'Fixture application', body: 'Fixture email only.' };
  t.after(async () => { store.close(); await rm(dataDir, { recursive: true, force: true }); });
  return { store, ids, run, calls, connections, input, send: (extra = {}) => sendEmailForRun({ store, connections, runId: run.id, input: { ...input, ...extra } }) };
}

test('records a confirmed mailbox receipt once, with idempotent concurrent repeats', async t => {
  const f = await setup(t);
  const [first, repeat] = await Promise.all([f.send(), f.send()]);
  assert.equal(f.calls.length, 1);
  assert.equal(first.application.status, 'applied');
  assert.equal(first.application.providerMessageId, 'message-1');
  assert.equal(first.application.threadId, 'thread-1');
  assert.equal(first.application.id, repeat.application.id);
  assert.equal(repeat.reused, true);
  const again = await f.send({ role: '  PRODUCT   DESIGNER  ' });
  assert.equal(again.application.id, first.application.id);
  assert.equal(f.calls.length, 1);
  assert.equal(f.store.getCompany(f.ids[0]).status, 'applied');
  assert.equal(f.store.listApplications().length, 1);
});

test('verified recipient is checked before writes and separate companies have no count cap', async t => {
  const f = await setup(t);
  await assert.rejects(f.send({ to: 'someone-else@example.test' }), /verified careers email/);
  assert.equal(f.calls.length, 0);
  await f.send();
  await f.send({ companyId: f.ids[1], to: 'careers-two@example.test' });
  assert.equal(f.calls.length, 2);
});

test('unconfirmed ID and provider approval never become applied or resend automatically', async t => {
  const f = await setup(t, { structuredContent: { id: 'approval-request-123', status: 'pending', approvalRequired: true } });
  const first = await f.send();
  assert.equal(first.application.deliveryStatus, 'unknown');
  assert.equal(first.application.status, 'needs_user');
  assert.equal(f.store.getCompany(f.ids[0]).status, 'ready');
  assert.equal((await f.send()).reused, true);
  assert.equal(f.calls.length, 1);
  const nextRun = f.store.startRun({ companyIds: [f.ids[0]], explicit: true, mode: 'send_and_submit' });
  await assert.rejects(sendEmailForRun({ store: f.store, connections: f.connections, runId: nextRun.id, input: f.input }), /unresolved send/);
  assert.equal(f.calls.length, 1);
});

test('timeout leaves durable ambiguous delivery and blocks later duplicate runs', async t => {
  const f = await setup(t, () => { throw new Error('Provider timed out'); });
  const result = await f.send();
  assert.equal(result.application.deliveryStatus, 'unknown');
  assert.match(result.application.notes, /Check Sent/);
  assert.equal(result.application.appliedAt, undefined);
  assert.equal(f.store.listApplications()[0].deliveryStatus, 'unknown');
  await f.send();
  assert.equal(f.calls.length, 1);
});

test('cancelled run cannot send, cancellation during provider call retains truthful receipt', async t => {
  const f = await setup(t);
  f.store.updateRun(f.run.id, { status: 'cancelled' });
  await assert.rejects(f.send(), /explicit run/);
  assert.equal(f.calls.length, 0);
  const run = f.store.startRun({ companyIds: [f.ids[0]], explicit: true, mode: 'send_and_submit' });
  f.connections.call = async () => {
    f.store.updateRun(run.id, { status: 'cancelled' });
    return { structuredContent: { id: 'sent-id', labelIds: ['SENT'], threadId: 'sent-thread' } };
  };
  const result = await sendEmailForRun({ store: f.store, connections: f.connections, runId: run.id, input: f.input });
  assert.equal(result.application.status, 'applied');
  assert.equal(result.application.providerMessageId, 'sent-id');
});

test('parallel duplicate intents perform only one provider write', async t => {
  const f = await setup(t);
  const attempts = await Promise.allSettled([f.send(), f.send()]);
  assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 2);
  assert.equal(attempts.filter(x => x.status === 'rejected').length, 0);
  assert.equal(f.calls.length, 1);
});

test('send receipt parsing rejects arbitrary IDs, drafts, errors and contradictory results', () => {
  for (const result of [
    { structuredContent: { id: 'arbitrary-id' } },
    { structuredContent: { id: 'draft-id', status: 'draft' } },
    { structuredContent: { id: 'generic-result', status: 'success' } },
    { structuredContent: { messageId: 'not-sent', sent: true, status: 'failed' } },
    { isError: true, structuredContent: { messageId: 'not-sent', sent: true } },
    { content: [{ type: 'text', text: 'Email sent successfully!' }] },
  ]) assert.equal(confirmedEmailReceipt(result), null);
  assert.equal(confirmedEmailReceipt({ structuredContent: { messageId: 'real-message', sent: true } }).providerMessageId, 'real-message');
  const mapped = confirmedEmailReceipt({ structuredContent: { delivery: { receipt: 'provider-123', outcome: 202 } } }, {
    receipt: { messageIdPath: 'delivery.receipt', statusPath: 'delivery.outcome', successValues: [202] },
  });
  assert.equal(mapped.providerMessageId, 'provider-123');
});
