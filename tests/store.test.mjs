import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, ROOT } from '../server/store.mjs';

async function setup(t, { seed = false, at = '2026-11-13T08:00:00Z' } = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'apply-domain-'));
  let clock = new Date(at);
  const store = openStore({ dataDir, seed, clock: () => clock });
  t.after(async () => { store.close(); await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });
  if (!seed) store.createDirectory({ id: 'fixture', name: 'Fixture' });
  return { store, dataDir, setTime: value => { clock = new Date(value); } };
}

function company(store, name = 'Example', extra = {}) {
  return store.addCompanies('fixture', [{ name, email: 'careers@example.test', ...extra }]).ids[0];
}
function run(store, ids) { return store.startRun({ directoryId: 'fixture', companyIds: ids, mode: 'send_and_submit', explicit: true }); }
function applied(store, companyId, runId, extra = {}) { return store.logApplication({ companyId, runId, status: 'applied', role: 'Engineer', evidence: { receipt: 'fixture-confirmation' }, ...extra }); }
function sendInput(companyId, runId, extra = {}) { return { companyId, runId, role: 'Engineer', to: 'careers@example.test', subject: 'Fixture application', body: 'Fixture only', ...extra }; }

test('seed imports all 772 stable source identities and real hyperlink evidence without fabricated tracking', async t => {
  const { store } = await setup(t, { seed: true });
  const source = JSON.parse(await readFile(join(ROOT, 'data', 'uae-directory.json'), 'utf8'));
  const records = store.listCompanies({ directoryId: 'uae', limit: 1000 });
  assert.equal(records.total, 772);
  assert.deepEqual(new Set(records.items.map(item => item.id)), new Set(source.records.map(item => item.id)));
  const abb = records.items.find(item => item.name === 'ABB');
  assert.equal(abb.careersUrl, 'https://careers.abb/global/en/career-opportunities');
  assert.equal(abb.sourceFields['Record ID'], abb.id);
  assert.equal(abb.routeStatus, 'Published route, untested');
  assert.ok(records.items.some(item => item.sourceRole === 'Job board'));
  assert.equal(records.items.every(item => item.status === 'not_started' && item.lastUpdate === null), true);
  assert.deepEqual(store.listApplications(), []);
});

test('directory refresh updates source details while preserving local tracking and stable identity', async t => {
  const { store } = await setup(t);
  const companyId = company(store, 'Original name', { id: 'source-stable', sourceFields: { evidence: 'original' } });
  store.updateCompany(companyId, { status: 'interview', notes: 'User note', followUpAt: '2026-11-20' });
  const updated = store.addCompanies('fixture', [{ id: 'source-stable', name: 'Updated official name', careersUrl: 'https://example.test/jobs', sourceFields: { evidence: 'checked again' } }]);
  assert.deepEqual(updated.ids, [companyId]);
  assert.equal(updated.updated, 1);
  const current = store.getCompany(companyId);
  assert.equal(current.name, 'Updated official name');
  assert.equal(current.status, 'interview');
  assert.equal(current.notes, 'User note');
  assert.equal(current.followUpAt, '2026-11-20');
  assert.equal(current.sourceFields.evidence, 'checked again');
});

test('source identities remain separate across tabs and equal names with distinct IDs', async t => {
  const { store } = await setup(t);
  store.createDirectory({ id: 'second', name: 'Second' });
  const first = company(store, 'Shared name', { id: 'shared-source' });
  const second = store.addCompanies('second', [{ id: 'shared-source', name: 'Shared name' }]).ids[0];
  assert.notEqual(first, second);
  assert.equal(store.getCompany(second).sourceId, 'shared-source');
  store.addCompanies('fixture', [{ id: 'different-source', name: 'Shared name' }]);
  assert.equal(store.listCompanies({ directoryId: 'fixture' }).total, 2);
  assert.equal(store.listCompanies({ directoryId: 'second' }).total, 1);
  assert.throws(() => store.startRun({ companyIds: [first, second], explicit: true, mode: 'send_and_submit' }), /same directory|belong to this directory/);
});

test('optimistic edits reject stale revisions and malformed values without changing the record', async t => {
  const { store } = await setup(t);
  const companyId = company(store);
  const initial = store.getCompany(companyId);
  store.updateCompany(companyId, { notes: 'First edit', expectedRevision: initial.revision });
  assert.throws(() => store.updateCompany(companyId, { notes: 'Stale edit', expectedRevision: initial.revision }), /row changed/);
  for (const patch of [{ name: ['bad'] }, { notes: {} }, { status: 1 }, { archived: 'false' }, { followUpAt: '2026-02-31' }, { email: 'invented' }, { careersUrl: 'javascript:alert(1)' }, { website: 'https://name:secret@example.test' }]) {
    assert.throws(() => store.updateCompany(companyId, patch));
  }
  assert.equal(store.getCompany(companyId).notes, 'First edit');
  assert.equal(store.getCompany(companyId).revision, initial.revision + 1);
});

test('prepared, upload and talent-pool events never count as a submitted application', async t => {
  const { store } = await setup(t);
  const companyId = company(store);
  for (const event of ['prepared', 'account_created', 'cv_uploaded', 'talent_pool_joined']) store.logApplication({ companyId, event, role: 'Engineer' });
  assert.equal(store.getCompany(companyId).status, 'not_started');
  assert.equal(store.report().applied, 0);
  assert.equal(store.listApplications(companyId).length, 4);
  const active = run(store, [companyId]);
  for (const evidence of [undefined, '', {}, { receipt: '' }, { id: 'draft-only' }]) assert.throws(() => applied(store, companyId, active.id, { evidence }), /receipt|message ID/);
  assert.equal(store.report().applied, 0);
});

test('run expiry, cancellation and completion cannot be reopened into sending authority', async t => {
  const { store, setTime } = await setup(t);
  const companyId = company(store);
  const expired = run(store, [companyId]);
  setTime('2026-11-13T09:00:00Z');
  assert.equal(store.getRun(expired.id).status, 'expired');
  assert.throws(() => store.checkSubmission({ companyId, runId: expired.id }), /explicit run/);
  assert.throws(() => store.updateRun(expired.id, { status: 'running' }), /new run/);
  for (const status of ['cancelled', 'completed']) {
    const active = run(store, [companyId]);
    store.updateRun(active.id, { status });
    assert.throws(() => store.updateRun(active.id, { status: 'running' }), /new run/);
    assert.throws(() => applied(store, companyId, active.id), /explicit run/);
  }
});

test('role duplicates normalize whitespace and case for 60 days while distinct roles remain valid', async t => {
  const { store, setTime } = await setup(t);
  const companyId = company(store);
  const first = run(store, [companyId]);
  applied(store, companyId, first.id, { role: ' Senior   Engineer ' });
  const second = run(store, [companyId]);
  assert.throws(() => store.checkSubmission({ companyId, runId: second.id, role: 'senior engineer' }), /already submitted/);
  assert.throws(() => applied(store, companyId, second.id, { role: 'SENIOR ENGINEER' }), /already submitted/);
  applied(store, companyId, second.id, { role: 'Product designer' });
  assert.equal(store.listApplications(companyId).length, 2);
  setTime('2027-01-13T08:00:00Z');
  const later = run(store, [companyId]);
  assert.equal(store.checkSubmission({ companyId, runId: later.id, role: 'Senior Engineer' }).ok, true);
});

test('runs have no app count limit while duplicates and uncertain sends remain protected', async t => {
  const { store } = await setup(t);
  const ids = store.addCompanies('fixture', Array.from({ length: 125 }, (_, i) => ({ name: 'Company '+i, email: 'careers@example.test' }))).ids;
  const active = store.startRun({ directoryId: 'fixture', mode: 'send_and_submit', explicit: true });
  assert.equal(active.companyIds.length, 125);
  for (const id of ids.slice(0, 110)) applied(store, id, active.id);
  assert.equal(store.checkSubmission({ companyId: ids[110], runId: active.id, role: 'Engineer' }).remaining, null);
  const pending = store.beginEmailSend(sendInput(ids[110], active.id));
  store.finishEmailSend(pending.application.id, { deliveryStatus: 'unknown', notes: 'Check Sent' });
  assert.equal(store.checkSubmission({ companyId: ids[111], runId: active.id, role: 'Engineer' }).ok, true);
  assert.equal(store.beginEmailSend(sendInput(ids[110], active.id)).reused, true);
  const next = run(store, [ids[110]]);
  assert.throws(() => store.beginEmailSend(sendInput(ids[110], next.id)), /unresolved/);
});

test('follow-up reminders use local calendar date without prematurely including tomorrow', async t => {
  const { store } = await setup(t, { at: '2026-11-13T21:00:00Z' });
  store.updateSettings({ timezone: 'Asia/Dubai' });
  const due = company(store, 'Due today'), later = company(store, 'Tomorrow');
  store.updateCompany(due, { followUpAt: '2026-11-14' });
  store.updateCompany(later, { followUpAt: '2026-11-15' });
  assert.deepEqual(store.report().followUps.map(row => row.id), [due]);
});

test('follow-up list filter follows the selected local day and excludes completed or archived records', async t => {
  const { store, setTime } = await setup(t, { at: '2026-11-13T19:59:00Z' });
  store.updateSettings({ timezone: 'Asia/Dubai' });
  const overdue = company(store, 'Overdue'), today = company(store, 'Local tomorrow');
  const later = company(store, 'Later'), closed = company(store, 'Closed'), offer = company(store, 'Offer'), archived = company(store, 'Archived');
  store.updateCompany(overdue, { followUpAt: '2026-11-13' });
  store.updateCompany(today, { followUpAt: '2026-11-14', status: 'applied' });
  store.updateCompany(later, { followUpAt: '2026-11-15' });
  store.updateCompany(closed, { followUpAt: '2026-11-13', status: 'closed' });
  store.updateCompany(offer, { followUpAt: '2026-11-13', status: 'offer' });
  store.updateCompany(archived, { followUpAt: '2026-11-13', archived: true });
  assert.deepEqual(store.listCompanies({ directoryId: 'fixture', attention: 'follow_up_due' }).items.map(row => row.id), [overdue]);
  setTime('2026-11-13T20:01:00Z');
  const before = store.getCompany(today);
  const due = store.listCompanies({ directoryId: 'fixture', attention: 'follow_up_due' });
  assert.deepEqual(new Set(due.items.map(row => row.id)), new Set([overdue, today]));
  assert.equal(due.attentionCounts.followUpDue, 2);
  assert.equal(due.total, 2);
  assert.deepEqual(store.getCompany(today), before);
});

test('attention counts keep directory scope while search and status narrow the returned rows', async t => {
  const { store } = await setup(t);
  store.updateSettings({ timezone: 'Asia/Dubai' });
  store.createDirectory({ id: 'second', name: 'Second' });
  const alpha = company(store, 'Alpha employer'), beta = company(store, 'Beta employer'), later = company(store, 'Alpha later');
  const elsewhere = store.addCompanies('second', [{ name: 'Alpha elsewhere' }]).ids[0];
  store.updateCompany(alpha, { status: 'applied', attention: 'needs_you', followUpAt: '2026-11-13' });
  store.updateCompany(beta, { status: 'ready', attention: 'needs_you', followUpAt: '2026-11-12' });
  store.updateCompany(later, { followUpAt: '2026-11-14' });
  store.updateCompany(elsewhere, { status: 'applied', attention: 'needs_you', followUpAt: '2026-11-13' });
  const result = store.listCompanies({ directoryId: 'fixture', search: 'Alpha', status: 'applied', attention: 'needs_you' });
  assert.deepEqual(result.items.map(row => row.id), [alpha]);
  assert.equal(result.total, 1);
  assert.deepEqual(result.attentionCounts, { needsYou: 2, followUpDue: 2 });
  assert.deepEqual(result.statusCounts, { not_started: 1, ready: 1, applied: 1, replied: 0, interview: 0, offer: 0, closed: 0 });
  const followUps = store.listCompanies({ directoryId: 'fixture', search: 'Beta', attention: 'follow_up_due' });
  assert.deepEqual(followUps.items.map(row => row.id), [beta]);
  assert.deepEqual(followUps.attentionCounts, result.attentionCounts);
  assert.deepEqual(store.listCompanies({ directoryId: 'second' }).attentionCounts, { needsYou: 1, followUpDue: 1 });
});

test('archive and undo preserve company evidence, notes and application history', async t => {
  const { store } = await setup(t);
  const companyId = company(store, 'Preserved', { sourceFields: { original: 'keep' } });
  store.updateCompany(companyId, { notes: 'User note' });
  store.logApplication({ companyId, event: 'cv_uploaded', notes: 'Upload only' });
  store.updateCompany(companyId, { archived: true });
  assert.equal(store.listCompanies({ directoryId: 'fixture' }).total, 0);
  assert.throws(() => run(store, [companyId]), /archived/);
  store.updateCompany(companyId, { archived: false });
  store.updateDirectory('fixture', { archived: true });
  assert.equal(store.listDirectories().length, 0);
  assert.throws(() => run(store, [companyId]), /active directory/);
  store.updateDirectory('fixture', { archived: false });
  assert.equal(store.listDirectories()[0].count, 1);
  assert.equal(store.getCompany(companyId).notes, 'User note');
  assert.equal(store.getCompany(companyId).sourceFields.original, 'keep');
  assert.equal(store.listApplications(companyId)[0].status, 'cv_uploaded');
});

test('invalid directory/import/settings mutations fail atomically and keep the saved state', async t => {
  const { store } = await setup(t);
  for (const patch of [{ name: [] }, { archived: 'true' }, { columns: ['status'] }, { columns: ['name', 'madeUpField'] }]) assert.throws(() => store.updateDirectory('fixture', patch));
  assert.throws(() => store.addCompanies('fixture', [{ name: 'Valid first' }, { name: 'Unsafe second', careersUrl: 'javascript:alert(1)' }]));
  assert.equal(store.listCompanies({ directoryId: 'fixture' }).total, 0);
  for (const patch of [{ emailReports: 'false' }, { dailyCap: [10] }, { reportEveryDays: 1.5 }, { timezone: [] }, { language: 'made-up' }, { cvLink: 'file:///private.txt' }]) assert.throws(() => store.updateSettings(patch));
  assert.equal(store.getSettings().dailyCap, undefined);
  assert.equal(store.getSettings().emailReports, false);
});

test('reports and exports include every active record beyond the bounded query page', async t => {
  const { store } = await setup(t);
  store.addCompanies('fixture', Array.from({ length: 5002 }, (_, index) => ({ id: `bulk-${index}`, name: `Employer ${index}` })));
  assert.equal(store.listCompanies({ directoryId: 'fixture', limit: 10000 }).items.length, 5000);
  assert.equal(store.exportCompanies('fixture').length, 5002);
  assert.equal(store.report().totalCompanies, 5002);
  store.updateCompany('bulk-5001', { archived: true });
  assert.equal(store.exportCompanies('fixture').length, 5001);
  assert.equal(store.report().statusCounts.not_started, 5001);
});
