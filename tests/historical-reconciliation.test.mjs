import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server/store.mjs';

async function fixture(t, method = 'form', knownMailbox = true, stopped = true) {
  const dataDir = await mkdtemp(join(tmpdir(), 'tawdheef-history-receipt-'));
  const clock = () => new Date('2026-11-15T12:00:00Z'), store = openStore({ dataDir, seed: false, clock });
  t.after(async () => { store.close(); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); });
  store.createDirectory({ id: 'fixture', name: 'Synthetic history' });
  store.addCompanies('fixture', [{ id: 'one', name: 'Synthetic employer', email: 'careers@example.test' }]);
  const run = store.startRun({ directoryId: 'fixture', explicit: true, mode: 'send_and_submit' });
  store.reportNativeConnection({ assistant: 'codex', kind: 'email', status: 'available', observedAt: clock().toISOString(), provider: 'gmail', accountEmail: 'candidate@example.test' });
  const mailbox = store.getNativeClientStatus({ assistant: 'codex' }).capabilities.email;
  let application = method === 'form'
    ? store.prepareFormSubmission({ companyId: 'one', runId: run.id, role: 'Engineer', url: 'https://employer.example.test/apply' }).application
    : store.beginEmailSend({ companyId: 'one', runId: run.id, role: 'Engineer', to: 'careers@example.test', subject: 'Synthetic original subject', body: 'Synthetic original body' }).application;
  if (method === 'email' && knownMailbox) application = store.logApplication({ id: application.id, companyId: 'one', status: 'prepared', evidence: { provider: mailbox.provider, accountId: mailbox.accountId } });
  if (stopped) store.updateRun(run.id, { status: 'cancelled' });
  const identity = Object.fromEntries(['companyId', 'runId', 'idempotencyKey', 'method', 'role', 'url', 'to', 'subject', 'createdAt'].filter(key => application[key] !== undefined).map(key => [key, application[key]]));
  identity.purpose = application.purpose || 'application';
  const sourceRead = { method: method === 'form' ? 'native_browser' : 'native_email', observedAt: clock().toISOString(), evidence: 'Synthetic actual original outcome inspected.', ...(method === 'form' ? { url: application.url } : { sourceId: application.id, provider: mailbox.provider, accountId: mailbox.accountId }) };
  const input = { id: application.id, assistant: 'codex', explicit: true, identity, outcome: 'confirmed', evidence: 'Synthetic exact receipt confirmed by inspection.', sourceRead };
  if (method === 'email') input.receipt = { providerMessageId: 'synthetic-historical-message', provider: mailbox.provider, accountId: mailbox.accountId, from: 'candidate@example.test', to: application.to, subject: application.subject, sentAt: clock().toISOString() };
  return { store, run, application, input, mailbox };
}

test('historical form recovery is explicit, fresh, original-identity scoped and never grants fresh authority', async t => {
  const { store, run, application, input } = await fixture(t);
  for (const patch of [{ explicit: false }, { identity: { ...input.identity, runId: 'other' } }, { identity: { ...input.identity, url: 'https://other.example.test' } }, { sourceRead: { ...input.sourceRead, observedAt: '2026-11-14T00:00:00Z' } }, { outcome: 'unknown' }, { claimToken: 'forbidden-authority' }]) assert.throws(() => store.reconcileHistoricalSubmission({ ...input, ...patch }));
  const result = store.reconcileHistoricalSubmission(input);
  assert.equal(result.application.deliveryStatus, 'confirmed'); assert.equal(result.actionsAuthorized, false); assert.equal(result.maySend, false);
  assert.equal(store.getRun(run.id).status, 'cancelled');
  for (const field of ['id', 'companyId', 'runId', 'idempotencyKey', 'method', 'purpose', 'role', 'url', 'createdAt']) assert.equal(result.application[field], application[field]);
  assert.throws(() => store.reconcileHistoricalSubmission({ ...input, outcome: 'not_sent' }), /Only unresolved/);
});

test('verified historical form non-delivery clears only the original unknown intent', async t => {
  const { store, input } = await fixture(t);
  assert.throws(() => store.reconcileHistoricalSubmission({ ...input, outcome: 'not_sent', explicit: false }), /explicit user request/);
  const result = store.reconcileHistoricalSubmission({ ...input, outcome: 'not_sent', evidence: 'Synthetic person requested clearing after verified non-submission.' });
  assert.equal(result.application.deliveryStatus, 'failed'); assert.equal(result.application.appliedAt, undefined);
  assert.equal(store.listApplications('one').length, 1); assert.equal(store.getNativeClientStatus({ assistant: 'codex' }).capabilities.email.status, 'reported');
});

test('historical email receipts require the saved original mailbox and exact inspected message', async t => {
  const { store, input, application } = await fixture(t, 'email');
  for (const receipt of [{ ...input.receipt, accountId: 'other' }, { ...input.receipt, to: 'other@example.test' }, { ...input.receipt, subject: 'Different subject' }, { ...input.receipt, sentAt: '2026-11-13T00:00:00Z' }]) assert.throws(() => store.reconcileHistoricalSubmission({ ...input, receipt }));
  store.reportNativeConnection({ assistant: 'codex', kind: 'email', status: 'available', observedAt: input.sourceRead.observedAt, provider: 'gmail', accountEmail: 'wrong@example.test' });
  assert.throws(() => store.reconcileHistoricalSubmission(input), /exact original historical mailbox/);
  store.reportNativeConnection({ assistant: 'codex', kind: 'email', status: 'available', observedAt: input.sourceRead.observedAt, provider: 'gmail', accountEmail: 'candidate@example.test' });
  const result = store.reconcileHistoricalSubmission(input);
  assert.equal(result.application.providerMessageId, input.receipt.providerMessageId);
  assert.equal(result.application.evidence.accountId, input.receipt.accountId); assert.equal(result.application.body, application.body);
  assert.equal(result.application.nativePlan, undefined); assert.equal(result.application.nativeAssistant, undefined);
});

test('missing historical email provenance remains unknown and cannot be reassigned or cleared', async t => {
  const { store, input } = await fixture(t, 'email', false);
  for (const outcome of ['confirmed', 'not_sent']) assert.throws(() => store.reconcileHistoricalSubmission({ ...input, outcome, ...(outcome === 'not_sent' ? { receipt: undefined } : {}) }), /no saved original mailbox identity/);
  assert.equal(store.listApplications('one')[0].deliveryStatus, 'sending');
});

test('historical recovery cannot replace Native actor guards or use an active old Run', async t => {
  const { store, input, run } = await fixture(t, 'form', true, false);
  assert.throws(() => store.reconcileHistoricalSubmission(input), /Stop the historical Run/);
  store.updateRun(run.id, { status: 'cancelled' });
  store.addCompanies('fixture', [{ id: 'native', name: 'Native employer' }]);
  const native = store.startNativeRun({ directoryId: 'fixture', companyIds: ['native'], assistant: 'codex', explicit: true, mode: 'send_and_submit' }).run;
  const claim = store.claimNativeTarget({ runId: native.id, assistant: 'codex' });
  const application = store.prepareFormSubmission({ runId: native.id, companyId: 'native', role: 'Engineer', url: 'https://native.example.test/apply' }).application;
  store.stopNativeRun({ runId: native.id });
  assert.throws(() => store.reconcileHistoricalSubmission({ ...input, id: application.id, identity: { ...input.identity, companyId: 'native' } }), /original Native assistant/);
  assert.equal(store.getNativeRun({ runId: native.id }).status, 'cancelled'); assert.ok(claim.claimToken);
});
