import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server/store.mjs';
import { sendEmailForRun, reconcileApplicationEmail } from '../server/email-send.mjs';
import { normalizeRunActions, DEFAULT_RUN_ACTIONS } from '../src/run-actions.js';
import { buildTools, closeToolConnections } from '../server/mcp.mjs';

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'tawdheef-actions-'));
  let time = new Date('2026-11-13T08:00:00Z');
  const store = openStore({ dataDir, seed: false, clock: () => time });
  store.createDirectory({ id: 'test', name: 'Test', country: 'AE' });
  const [companyId] = store.addCompanies('test', [{ name: 'Fixture employer', location: 'Dubai', type: 'Private company', email: 'careers@example.test' }]).ids;
  t.after(async () => { await closeToolConnections(store); store.close(); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); });
  const start = (actions, other = {}) => store.startRun({ directoryId: 'test', companyIds: [companyId], mode: 'send_and_submit', explicit: true, ...(actions ? { actions } : {}), ...other });
  return { store, companyId, start, setTime(value) { time = new Date(value); } };
}
const future = { applyMatchingJobs: false, createProfiles: true, sendCvEmails: true };
function mailbox(result) {
  const writes = [], reads = [];
  const mappings = {
    sendEmail: { tool: 'fixture.send', arguments: { to: '{{to}}', body: '{{body}}', idempotencyKey: '{{idempotencyKey}}' } },
    reconcileSend: { tool: 'fixture.inspect', arguments: { idempotencyKey: '{{idempotencyKey}}' } },
  };
  const connections = {
    getMappings: () => mappings,
    tools: async () => [{ name: 'fixture.send' }, { name: 'fixture.inspect', annotations: { readOnlyHint: true } }],
    async call(kind, name, args) {
      if (name === 'fixture.inspect') { reads.push(args); return { structuredContent: { sent: true, messageId: 'inspected-cv', threadId: 'cv-thread' } }; }
      writes.push(args);
      return result || { structuredContent: { sent: true, messageId: 'sent-cv', threadId: 'cv-thread' } };
    },
  };
  return { connections, writes, reads };
}
const email = companyId => ({ companyId, role: 'General CV', purpose: 'cv_share', to: 'careers@example.test', subject: 'Future opportunities', body: 'My authorized CV: https://cv.example.test/person' });

test('Run defaults and strict action validation are saved with labels and the actual brief', async t => {
  const { store, start } = await fixture(t);
  assert.deepEqual(normalizeRunActions(), DEFAULT_RUN_ACTIONS);
  for (const actions of [null, [], { sendCvEmails: 'yes' }, { applyToAnything: true }]) assert.throws(() => start(actions === null ? undefined : actions, { actions }), /actions|true or false/);
  assert.throws(() => start({ applyMatchingJobs: false, createProfiles: false, sendCvEmails: false }), /at least one/);
  assert.equal(store.listRuns().length, 0);
  const run = start(future, { locations: ['location:dubai'], companyTypes: ['private'], instructions: 'Prefer remote roles.' });
  assert.deepEqual(run.actions, future);
  assert.deepEqual(run.locationLabels, ['Dubai']); assert.deepEqual(run.companyTypeLabels, ['Private companies']);
  assert.match(run.brief, /Do not apply to advertised jobs/);
  assert.match(run.brief, /Dubai/); assert.match(run.brief, /Prefer remote roles/);
  assert.deepEqual(store.getRun(run.id).actions, future);
});

test('CV-only provider send needs opt-in, records CV sent once and leaves the company eligible for a job', async t => {
  const { store, companyId, start } = await fixture(t);
  const provider = mailbox(), input = email(companyId), defaultRun = start();
  await assert.rejects(sendEmailForRun({ store, ...provider, runId: defaultRun.id, input }), /does not allow CV emails/);
  assert.equal(provider.writes.length, 0);
  const run = start(future);
  const send = extra => sendEmailForRun({ store, ...provider, runId: run.id, input: { ...input, ...extra } });
  const sent = await send();
  assert.equal(sent.application.status, 'cv_sent'); assert.ok(sent.application.cvSentAt);
  assert.equal(sent.application.appliedAt, undefined); assert.equal(sent.application.purpose, 'cv_share');
  assert.equal(store.report().applied, 0); assert.equal(store.report().cvsSent, 1);
  assert.equal(store.remainingCompanies({ directoryId: 'test' }).length, 1);
  assert.equal((await send({ role: 'A differently worded future role' })).reused, true);
  assert.equal(provider.writes.length, 1);
  const next = start(future);
  await assert.rejects(sendEmailForRun({ store, ...provider, runId: next.id, input: { ...input, role: 'New title' } }), /submission or an unresolved/);
  await assert.rejects(send({ purpose: 'application', role: 'Actual job' }), /does not allow job applications/);
  assert.equal(provider.writes.length, 1);
});

test('uncertain CV emails block changed-purpose retries and reconcile to CV sent after the run stops', async t => {
  const { store, companyId, start } = await fixture(t);
  const provider = mailbox({ structuredContent: { status: 'pending', id: 'approval-only' } });
  const run = start({ createProfiles: true, sendCvEmails: true });
  const sent = await sendEmailForRun({ store, ...provider, runId: run.id, input: email(companyId) });
  assert.equal(sent.application.deliveryStatus, 'unknown'); assert.equal(store.report().cvsSent, 0);
  await assert.rejects(sendEmailForRun({ store, ...provider, runId: run.id, input: { ...email(companyId), purpose: 'application', role: 'Different job' } }), /unresolved/);
  assert.throws(() => store.prepareFormSubmission({ runId: run.id, companyId, role: 'Account', purpose: 'account', url: 'https://careers.example.test/register' }), /unresolved/);
  store.updateRun(run.id, { status: 'cancelled' });
  const recovered = await reconcileApplicationEmail({ store, ...provider, applicationId: sent.application.id });
  assert.equal(recovered.application.status, 'cv_sent'); assert.equal(recovered.application.appliedAt, undefined);
  assert.equal(provider.writes.length, 1); assert.equal(provider.reads.length, 1);
  assert.equal(store.report().cvsSent, 1); assert.equal(store.report().applied, 0);
});

test('form confirmations retain their exact profile purpose, milestones and duplicate protection', async t => {
  const { store, companyId, start } = await fixture(t);
  const run = start(future);
  for (const [purpose, event] of [['account', 'account_created'], ['profile', 'profile_created'], ['cv_upload', 'cv_uploaded'], ['talent_pool', 'talent_pool_joined']]) {
    const intent = store.prepareFormSubmission({ runId: run.id, companyId, role: 'Career profile', purpose, url: `https://careers.example.test/${purpose}` });
    const resolved = store.resolveFormSubmission({ id: intent.application.id, outcome: 'confirmed', evidence: `Fixture confirmed ${purpose}` });
    assert.equal(resolved.status, event); assert.equal(resolved.appliedAt, undefined);
    assert.ok(resolved.milestones.some(milestone => milestone.event === event));
    assert.throws(() => store.logApplication({ id: resolved.id, companyId, runId: run.id, status: 'applied', evidence: 'Reused profile receipt' }), /original submission purpose/);
    const repeat = store.prepareFormSubmission({ runId: run.id, companyId, role: 'Changed wording', purpose, url: `https://careers.example.test/${purpose}` });
    assert.equal(repeat.reused, true);
  }
  assert.equal(store.report().applied, 0); assert.equal(store.report().profilesCreated, 1);
  assert.equal(store.getCompany(companyId).progress.cv_uploaded, 1);
  assert.throws(() => store.prepareFormSubmission({ runId: run.id, companyId, purpose: 'application', role: 'Job', url: 'https://careers.example.test/apply' }), /does not allow job applications/);
});

test('unknown form intents block other purposes and late confirmation remains profile-only', async t => {
  const { store, companyId, start, setTime } = await fixture(t);
  const run = start({ createProfiles: true, sendCvEmails: true });
  const intent = store.prepareFormSubmission({ runId: run.id, companyId, purpose: 'profile', role: 'Profile', url: 'https://careers.example.test/profile' });
  assert.throws(() => store.prepareFormSubmission({ runId: run.id, companyId, purpose: 'application', role: 'Changed role', url: 'https://careers.example.test/apply' }), /unresolved/);
  const provider = mailbox();
  await assert.rejects(sendEmailForRun({ store, ...provider, runId: run.id, input: email(companyId) }), /unresolved/);
  assert.equal(provider.writes.length, 0);
  setTime('2026-11-13T10:00:00Z');
  assert.equal(store.getRun(run.id).status, 'expired');
  const resolved = store.resolveFormSubmission({ id: intent.application.id, outcome: 'confirmed', evidence: 'Existing profile inspected and confirmed' });
  assert.equal(resolved.status, 'profile_created'); assert.equal(resolved.appliedAt, undefined);
  assert.equal(store.report().applied, 0);
});

test('durable email and form identity cannot change through ordinary record updates', async t => {
  const { store, companyId, start } = await fixture(t);
  const run = start(future), provider = mailbox({ structuredContent: { status: 'pending' } });
  const sent = await sendEmailForRun({ store, ...provider, runId: run.id, input: email(companyId) });
  const original = sent.application;
  for (const status of ['prepared', 'replied', 'error']) {
    for (const patch of [{ role: 'A new job' }, { method: 'form' }, { runId: 'another-run' }, { to: 'other@example.test' }, { recipient: 'other@example.test' }, { url: 'https://other.example.test' }, { purpose: 'application' }, { idempotencyKey: 'new-key' }]) {
      assert.throws(() => store.logApplication({ id: original.id, companyId, status, ...patch }), /original submission identity/);
    }
  }
  store.updateRun(run.id, { status: 'cancelled' });
  const reply = store.logApplication({ id: original.id, companyId, status: 'replied', method: original.method, notes: 'Reply inspected', evidence: { messageId: 'reply-123' }, threadId: 'cv-thread' });
  assert.equal(reply.runId, run.id); assert.equal(reply.to, original.to); assert.equal(reply.role, original.role); assert.equal(reply.purpose, 'cv_share');
  const reconciled = await reconcileApplicationEmail({ store, ...provider, applicationId: original.id });
  assert.equal(reconciled.application.status, 'replied'); assert.equal(reconciled.application.purpose, 'cv_share');
  assert.ok(reconciled.application.cvSentAt); assert.equal(reconciled.application.appliedAt, undefined);
  assert.equal(provider.writes.length, 1); assert.equal(provider.reads.length, 1);

  const next = start(future);
  const form = store.prepareFormSubmission({ runId: next.id, companyId, purpose: 'profile', role: 'Profile', url: 'https://careers.example.test/profile' }).application;
  assert.throws(() => store.logApplication({ id: form.id, companyId, status: 'prepared', url: 'https://careers.example.test/apply' }), /original submission identity/);
  const noted = store.logApplication({ id: form.id, companyId, status: 'prepared', notes: 'Inspect the saved profile', role: form.role, url: form.url });
  assert.equal(noted.url, form.url); assert.equal(noted.deliveryStatus, 'unknown');
  const confirmed = store.resolveFormSubmission({ id: form.id, outcome: 'confirmed', evidence: 'Profile confirmation inspected' });
  assert.equal(confirmed.status, 'profile_created'); assert.equal(confirmed.appliedAt, undefined);
});

test('list, preview and start share all filters across pages and selection never widens scope', async t => {
  const { store } = await fixture(t);
  const ids = store.addCompanies('test', Array.from({ length: 150 }, (_, i) => ({ name: `Target ${i}`, type: 'Private company', location: i < 135 ? 'Dubai' : 'Abu Dhabi' }))).ids;
  store.updateCompany(ids[0], { status: 'closed' }); store.updateCompany(ids[1], { status: 'applied' });
  store.updateCompany(ids[5], { status: 'ready', attention: 'needs_you', followUpAt: '2026-11-12' });
  const filters = { directoryId: 'test', search: 'Target', companyTypes: ['private'], locations: ['location:dubai'] };
  const list = store.listCompanies({ ...filters, limit: 100 });
  assert.equal(list.items.length, 100); assert.equal(list.total, 135); assert.equal(list.remainingCount, 133); assert.equal(list.listScopeVersion, 1);
  assert.equal(list.facets.locations.find(place => place.label === 'Abu Dhabi').count, 15);
  assert.equal(store.previewRun(filters).count, 133);
  assert.equal(store.previewRun({ ...filters, companyIds: [ids[0], ids[1], ids[5]] }).count, 1);
  const run = store.startManagedRun({ ...filters, assistant: 'codex', explicit: true, mode: 'send_and_submit' });
  assert.equal(run.companyIds.length, 133); assert.deepEqual(run.filters, { search: 'Target', status: '', attention: '', companyTypes: ['private'], locations: ['location:dubai'] });
  store.updateRun(run.id, { status: 'cancelled' });
  const chosen = { ...filters, companyIds: [ids[5], ids[140]], status: 'ready', attention: 'needs_you' };
  assert.equal(store.previewRun(chosen).count, 1);
  const narrowed = store.startManagedRun({ ...chosen, assistant: 'codex', explicit: true, mode: 'send_and_submit' });
  assert.deepEqual(narrowed.companyIds, [ids[5]]);
  store.updateRun(narrowed.id, { status: 'cancelled' });
  store.updateCompany(ids[5], { attention: '' });
  assert.equal(store.previewRun(chosen).count, 0);
  assert.throws(() => store.startManagedRun({ ...chosen, assistant: 'codex', explicit: true, mode: 'send_and_submit' }), /No remaining/);
});

test('machine list and Run tools expose the same explicit scope, rejecting invalid filters', async t => {
  const { store, companyId } = await fixture(t);
  const tools = buildTools(store, { mode: 'local-adapters' }), call = (name, input) => tools.find(tool => tool.name === name).handler(input);
  const filters = { directoryId: 'test', search: 'Fixture', status: 'not_started', attention: '', companyTypes: ['private'], locations: ['location:dubai'] };
  const list = await call('list_companies', filters), preview = await call('preview_run', filters);
  assert.equal(list.remainingCount, preview.count); assert.equal(preview.listScopeVersion, 1); assert.equal(preview.runActionsVersion, 1);
  const run = await call('start_run', { ...filters, companyIds: [companyId], actions: future, explicit: true, mode: 'send_and_submit' });
  assert.deepEqual(run.companyIds, [companyId]); assert.equal(run.statusFilter, 'not_started');
  for (const patch of [{ status: 'unknown-status' }, { attention: 'unknown-attention' }, { search: {} }]) {
    assert.throws(() => store.listCompanies({ ...filters, ...patch }));
    assert.throws(() => store.previewRun({ ...filters, ...patch }));
    assert.throws(() => store.startRun({ ...filters, ...patch, companyIds: [companyId], explicit: true, mode: 'send_and_submit' }));
  }
});
