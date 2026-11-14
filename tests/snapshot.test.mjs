import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { directorySnapshot, snapshotWeekStart } from '../server/snapshot.mjs';
import { openStore } from '../server/store.mjs';
import { buildTools } from '../server/mcp.mjs';
import { OPERATOR_TOOLS } from '../server/operator-contract.mjs';

const current = '2026-11-13T12:00:00.000Z';
const companies = [
  { id: 'one', directoryId: 'fixture', name: 'One' },
  { id: 'two', directoryId: 'fixture', name: 'Two', archived: true },
  { id: 'outside', directoryId: 'other', name: 'Outside' },
];
function outcome(id, event, at, extra = {}) {
  const { evidence = { receipt: `receipt-${id}` }, url = `https://careers.example.test/${id}`, ...fields } = extra;
  return { id, companyId: 'one', method: 'career_page', role: 'Engineer', status: event,
    createdAt: at, updatedAt: at, evidence, url, ...(event === 'applied' ? { appliedAt: at } : {}),
    ...(event === 'cv_sent' ? { cvSentAt: at } : {}),
    milestones: [{ event, at, evidence, url, destination: url }], ...fields };
}
const snapshot = (applications, extra = {}) => directorySnapshot({ directory: { id: 'fixture', name: 'Fixture' }, companies, applications, until: current, timeZone: 'Asia/Dubai', ...extra });

test('snapshot separates confirmed applications, profile companies and email receipts, preserving archived work', () => {
  const applications = [
    outcome('form', 'applied', current, { companyId: 'two', status: 'interview' }),
    outcome('mail', 'applied', current, { method: 'email', evidence: { providerMessageId: 'message-1' } }),
    outcome('cv', 'cv_sent', current, { method: 'email', purpose: 'cv_share', evidence: { providerMessageId: 'message-2' } }),
    outcome('profile-1', 'profile_created', current),
    outcome('profile-2', 'profile_created', current),
    outcome('account', 'account_created', current, { companyId: 'two' }),
    outcome('outside', 'applied', current, { companyId: 'outside' }),
    outcome('future', 'applied', '2026-11-14T00:00:00Z'),
  ];
  const result = snapshot(applications);
  assert.deepEqual(result.counts, { applications: 2, profiles: 1, emails: 2 });
  assert.equal(result.since, null);
  assert.equal(result.metric, null);
  assert.deepEqual(result.items, []);
  assert.equal(snapshot(applications, { metric: 'applications' }).items.some(item => item.companyId === 'two'), true);
});

test('receipt deduplication prevents double email counts and retains different provider or mailbox identities', () => {
  const applications = [
    outcome('first', 'applied', '2026-11-06T12:00:00Z', { method: 'email', evidence: { providerMessageId: 'same', provider: 'gmail', accountId: 'account-1' } }),
    outcome('duplicate', 'applied', current, { companyId: 'two', method: 'email', evidence: { providerMessageId: 'same', provider: 'gmail', accountId: 'account-1' } }),
    outcome('another-account', 'applied', current, { method: 'email', evidence: { providerMessageId: 'same', provider: 'gmail', accountId: 'account-2' } }),
    outcome('another-provider', 'cv_sent', current, { method: 'email', evidence: { providerMessageId: 'same', provider: 'outlook', accountId: 'account-1' } }),
  ];
  assert.deepEqual(snapshot(applications).counts, { applications: 2, profiles: 0, emails: 3 });
  assert.deepEqual(snapshot(applications, { period: 'this_week' }).counts, { applications: 1, profiles: 0, emails: 2 });
});

test('drafts, unknown sends, account-only progress and mutable company statuses do not create totals', () => {
  const applications = [
    outcome('draft', 'prepared', current, { method: 'email', evidence: { providerMessageId: 'draft-id' } }),
    outcome('unknown', 'applied', current, { method: 'email', deliveryStatus: 'unknown', evidence: { providerMessageId: 'unconfirmed' } }),
    outcome('failed', 'applied', current, { method: 'email', deliveryStatus: 'failed' }),
    outcome('profile-unknown', 'profile_created', current, { method: 'form', purpose: 'profile', deliveryStatus: 'unknown' }),
    outcome('account-only', 'account_created', current),
  ];
  assert.deepEqual(snapshot(applications, { companies: companies.map(item => ({ ...item, status: 'applied' })) }).counts, { applications: 0, profiles: 0, emails: 0 });
});

test('older generic email evidence is disclosed instead of invented as a message receipt', () => {
  const apps = [outcome('legacy', 'applied', current, { method: 'email', evidence: 'Submitted email confirmed by the operator' })];
  const result = snapshot(apps);
  assert.deepEqual(result.counts, { applications: 1, profiles: 0, emails: 0 });
  assert.equal(result.unverifiedEmails, 1);
  assert.equal(snapshot([...apps, outcome('uncertain', 'applied', current, { method: 'email', deliveryStatus: 'unknown' })]).unverifiedEmails, 1);
});

test('profiles dedupe by destination before window and by company after window', () => {
  const old = outcome('old-profile', 'profile_created', '2026-11-06T12:00:00Z', { url: 'https://careers.example.test/profile?session=old' });
  const duplicate = outcome('relogged-profile', 'profile_created', current, { url: 'https://careers.example.test/profile/?session=new#saved' });
  assert.equal(snapshot([old, duplicate], { period: 'this_week' }).counts.profiles, 0);
  const newPortal = outcome('new-portal', 'profile_created', current, { url: 'https://other.example.test/profile' });
  assert.equal(snapshot([old, duplicate, newPortal], { period: 'this_week' }).counts.profiles, 1);
  assert.equal(snapshot([old, duplicate, newPortal]).counts.profiles, 1);
});

test('legacy explicit profile history stays visible without counting duplicate activity', () => {
  const activity = [
    { id: 'old', companyId: 'two', action: 'profile_created', createdAt: '2026-11-06T12:00:00Z', detail: 'Profile saved' },
    { id: 'again', companyId: 'two', action: 'profile_created', createdAt: current, detail: 'Profile saved again' },
    { id: 'account', companyId: 'one', action: 'account_created', createdAt: current, detail: 'Account created' },
  ];
  assert.equal(snapshot([], { activity }).counts.profiles, 1);
  assert.equal(snapshot([], { activity, period: 'this_week' }).counts.profiles, 0);
});

test('This week uses calendar Monday in local time through DST and fractional offsets', () => {
  assert.equal(snapshotWeekStart('2026-03-09T12:00:00Z', 'America/New_York'), '2026-03-09T04:00:00.000Z');
  assert.equal(snapshotWeekStart('2026-11-02T12:00:00Z', 'America/New_York'), '2026-11-02T05:00:00.000Z');
  assert.equal(snapshotWeekStart('2026-11-08T23:30:00Z', 'Asia/Dubai'), '2026-11-08T20:00:00.000Z');
  assert.equal(snapshotWeekStart('2026-11-09T03:30:00Z', 'America/New_York'), '2026-11-02T05:00:00.000Z');
  assert.equal(snapshotWeekStart(current, 'Asia/Kathmandu'), '2026-11-08T18:15:00.000Z');
  assert.equal(snapshotWeekStart('2026-01-02T12:00:00Z', 'UTC'), '2025-12-29T00:00:00.000Z');
  const boundary = '2026-11-08T20:00:00.000Z';
  const result = snapshot([
    outcome('before', 'applied', '2026-11-08T19:59:59.999Z'),
    outcome('exactly', 'applied', boundary),
    outcome('now', 'applied', current),
    outcome('future', 'applied', '2026-11-13T12:00:00.001Z'),
  ], { period: 'this_week', metric: 'applications' });
  assert.equal(result.since, boundary);
  assert.deepEqual(result.items.map(item => item.id), ['now', 'exactly']);
});

test('detail pagination covers the full directory and only returns compact safe fields', () => {
  const apps = Array.from({ length: 43 }, (_, index) => outcome('app-' + index, 'applied', current, {
    role: `Role ${index}`, body: 'PRIVATE EMAIL BODY', notes: 'PRIVATE NOTE', evidence: { receipt: 'PRIVATE RECEIPT' },
    url: 'https://careers.example.test/application?token=PRIVATE_TOKEN#session',
  }));
  const result = snapshot(apps, { metric: 'applications', offset: 40, limit: 20 });
  assert.equal(result.counts.applications, 43);
  assert.equal(result.total, 43);
  assert.equal(result.items.length, 3);
  assert.equal(result.offset, 40);
  assert.equal(result.limit, 20);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.ok(result.items.every(row => row.url === 'https://careers.example.test/application'));
  assert.deepEqual(snapshot(apps, { metric: 'applications', offset: 60 }).items, []);
});

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'tawdheef-snapshot-'));
  let at = new Date(current);
  const store = openStore({ dataDir, seed: false, clock: () => at });
  store.createDirectory({ id: 'fixture', name: 'Snapshot fixture' });
  const [companyId, otherId] = store.addCompanies('fixture', [{ name: 'One', email: 'jobs@example.test' }, { name: 'Two' }]).ids;
  t.after(async () => { store.close(); assert.ok(resolve(dataDir).startsWith(resolve(tmpdir(), 'tawdheef-snapshot-'))); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); });
  return { store, companyId, otherId, setTime(value) { at = new Date(value); } };
}

test('store snapshots survive later outcomes and archiving, and never include report sends', async t => {
  const { store, companyId, otherId } = await fixture(t);
  store.updateSettings({ timezone: 'Asia/Dubai' });
  const profile = store.logApplication({ companyId, event: 'profile_created', url: 'https://careers.example.test/profile' });
  store.logApplication({ id: profile.id, companyId, event: 'cv_uploaded' });
  const run = store.startRun({ directoryId: 'fixture', companyIds: [companyId], explicit: true, mode: 'send_and_submit' });
  const pending = store.beginEmailSend({ runId: run.id, companyId, role: 'Engineer', to: 'jobs@example.test', subject: 'Fixture', body: 'PRIVATE BODY' });
  store.finishEmailSend(pending.application.id, { deliveryStatus: 'confirmed', receipt: { providerMessageId: 'sent-1' } });
  store.logApplication({ id: pending.application.id, companyId, event: 'interview' });
  store.updateCompany(companyId, { archived: true });
  store.updateCompany(otherId, { status: 'applied' });
  store.saveReport({ generatedAt: current, delivery: { status: 'sent', providerMessageId: 'report-1' } });
  const result = store.snapshot({ directoryId: 'fixture' });
  assert.deepEqual(result.counts, { applications: 1, profiles: 1, emails: 1 });
  assert.equal(result.directoryName, 'Snapshot fixture');
  assert.equal(result.timeZone, 'Asia/Dubai');
  assert.equal(result.unverifiedEmails, 0);
});

test('snapshot scope and pagination validation fail closed through store and read-only machine tool', async t => {
  const { store } = await fixture(t);
  for (const input of [{}, { directoryId: [] }, { directoryId: 'missing' }, { directoryId: 'fixture', period: 'seven_days' }, { directoryId: 'fixture', metric: 'replies' }, { directoryId: 'fixture', metric: null }, { directoryId: 'fixture', limit: 101 }, { directoryId: 'fixture', offset: -1 }, { directoryId: 'fixture', offset: '1e2' }, { directoryId: 'fixture', limit: '' }, { directoryId: 'fixture', search: 'ignored?' }]) assert.throws(() => store.snapshot(input));
  const tools = buildTools(store);
  const tool = tools.find(item => item.name === 'get_snapshot');
  assert.deepEqual(tool.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
  assert.equal(OPERATOR_TOOLS.includes('get_snapshot'), false);
  assert.deepEqual(await tool.handler({ directoryId: 'fixture' }), store.snapshot({ directoryId: 'fixture' }));
  await assert.rejects(tool.handler({ directoryId: 'fixture', limit: '20' }));
  assert.equal(store.snapshot({ directoryId: 'fixture', offset: '0', limit: '20' }).limit, 20);
});
