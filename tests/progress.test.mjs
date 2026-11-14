import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openStore } from '../server/store.mjs';
import { createScheduler } from '../server/scheduler.mjs';

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'tawdheef-progress-'));
  let time = new Date('2026-11-13T08:00:00Z');
  const store = openStore({ dataDir, seed: false, clock: () => time });
  store.createDirectory({ id: 'fixture', name: 'Fixture' });
  const [companyId, otherId] = store.addCompanies('fixture', [{ name: 'Company', email: 'careers@example.test' }, { name: 'Other company' }]).ids;
  t.after(async () => {
    store.close();
    assert.ok(resolve(dataDir).startsWith(resolve(tmpdir(), 'tawdheef-progress-')));
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  });
  return { store, companyId, otherId, setTime(value) { time = new Date(value); }, clock: () => time };
}
const start = (store, companyIds, actions) => store.startRun({ directoryId: 'fixture', companyIds, explicit: true, mode: 'send_and_submit', ...(actions ? { actions } : {}) });

test('account, profile and upload milestones survive application and reply transitions', async t => {
  const { store, companyId, setTime } = await fixture(t);
  const initial = store.logApplication({ companyId, event: 'account_created', url: 'https://careers.example.test/profile', evidence: 'Account dashboard opened after registration' });
  setTime('2026-11-13T08:01:00Z');
  store.logApplication({ id: initial.id, companyId, event: 'profile_created', url: 'https://careers.example.test/profile', evidence: 'Saved profile confirmation' });
  setTime('2026-11-13T08:02:00Z');
  store.logApplication({ id: initial.id, companyId, event: 'cv_uploaded', evidence: 'CV file appears in profile' });
  const run = start(store, [companyId]);
  setTime('2026-11-13T08:03:00Z');
  store.logApplication({ id: initial.id, companyId, runId: run.id, role: 'Engineer', event: 'applied', evidence: { receipt: 'application-123' } });
  setTime('2026-11-13T09:00:00Z');
  store.logApplication({ id: initial.id, companyId, event: 'replied', lastReply: 'Interview requested' });
  const application = store.listApplications(companyId)[0];
  assert.deepEqual(application.milestones.map(item => item.event), ['account_created', 'profile_created', 'cv_uploaded', 'applied']);
  assert.equal(application.milestones[0].evidence, 'Account dashboard opened after registration');
  assert.equal(application.milestones[0].at, '2026-11-13T08:00:00.000Z');
  const progress = { account_created: 1, profile_created: 1, cv_uploaded: 1, cv_sent: 0, talent_pool_joined: 0, applied: 1 };
  assert.deepEqual(store.getCompany(companyId).progress, progress);
  assert.deepEqual(store.listCompanies({ directoryId: 'fixture', search: 'Company' }).items.find(item => item.id === companyId).progress, progress);
  assert.deepEqual(store.exportCompanies('fixture').find(item => item.id === companyId).progress, progress);
  assert.equal(store.report().accountsCreated, 1);
  assert.equal(store.report().profilesCreated, 1);
  assert.equal(store.report().cvsUploaded, 1);
  assert.equal(store.report().applied, 1);
  assert.equal(store.report({ since: '2026-11-13T08:01:30Z' }).accountsCreated, 0);
  assert.equal(store.report({ since: '2026-11-13T08:01:30Z' }).cvsUploaded, 1);
});

test('progress deduplicates destinations and reports distinct companies, not repeated log rows', async t => {
  const { store, companyId, otherId, setTime } = await fixture(t);
  const input = { companyId, event: 'account_created', url: 'https://careers.example.test/profile?session=one' };
  const first = store.logApplication(input);
  store.logApplication({ ...input, url: 'https://careers.example.test/profile?session=two#saved' });
  store.logApplication({ ...input, url: 'https://another.example.test/profile' });
  store.logApplication({ companyId: otherId, event: 'account_created' });
  assert.equal(store.getCompany(companyId).progress.account_created, 2);
  assert.equal(store.report().accountsCreated, 2);
  assert.equal(store.report().progressCountUnit, 'companies');
  setTime('2026-11-14T08:00:00Z');
  store.logApplication({ ...input, id: first.id, notes: 'Same saved account, updated notes' });
  store.logApplication({ ...input, notes: 'Same destination accidentally logged as a new record' });
  assert.equal(store.report({ since: '2026-11-14T00:00:00Z' }).accountsCreated, 0);
  store.logApplication({ ...input, url: 'https://third.example.test/profile', notes: 'A genuinely new careers account' });
  assert.equal(store.report({ since: '2026-11-14T00:00:00Z' }).accountsCreated, 1);
  store.updateCompany(otherId, { archived: true });
  assert.equal(store.report({ since: '2026-11-12T00:00:00Z' }).accountsCreated, 1);
});

test('confirmed CV-only sends stay separate from applications and block duplicate same-role sends', async t => {
  const { store, companyId, otherId } = await fixture(t);
  const input = { companyId, role: 'General CV', event: 'cv_sent', method: 'email', to: 'careers@example.test', evidence: { providerMessageId: 'cv-123' } };
  assert.throws(() => store.logApplication(input), /explicit run/);
  const wrongScope = start(store, [otherId]);
  assert.throws(() => store.logApplication({ ...input, runId: wrongScope.id }), /explicit run/);
  const run = start(store, [companyId], { sendCvEmails: true });
  assert.throws(() => store.logApplication({ ...input, runId: run.id, evidence: {} }), /receipt/);
  const sent = store.logApplication({ ...input, runId: run.id });
  assert.ok(sent.cvSentAt);
  assert.equal(sent.appliedAt, undefined);
  assert.equal(store.getCompany(companyId).status, 'ready');
  assert.ok(store.remainingCompanies({ directoryId: 'fixture' }).some(item => item.id === companyId));
  assert.equal(store.report().cvsSent, 1);
  assert.equal(store.report().applied, 0);
  assert.equal(store.getCompany(companyId).progress.cv_sent, 1);
  assert.equal(store.getCompany(companyId).progress.applied, 0);
  assert.throws(() => store.logApplication({ ...input, runId: run.id, role: ' general   cv ' }), /already submitted/);
  assert.throws(() => store.beginEmailSend({ companyId, runId: run.id, role: 'General CV', to: 'careers@example.test', subject: 'CV', body: 'CV' }), /submission or an unresolved send/);
  store.logApplication({ id: sent.id, companyId, event: 'replied', lastReply: 'Thanks for your CV' });
  assert.equal(store.getCompany(companyId).status, 'ready');
  assert.ok(store.remainingCompanies({ directoryId: 'fixture' }).some(item => item.id === companyId));
  assert.equal(store.report().applied, 0);
  assert.equal(store.report().cvsSent, 1);
  assert.deepEqual(store.listApplications(companyId)[0].milestones.map(item => item.event), ['cv_sent']);
});

test('CV-only send authorization expires and a new profile needs actual evidence', async t => {
  const { store, companyId, setTime } = await fixture(t);
  assert.throws(() => store.logApplication({ companyId, event: 'profile_created', evidence: {} }), /profile URL or evidence/);
  assert.throws(() => store.logApplication({ companyId, event: 'profile_created', url: 'javascript:alert(1)' }), /http or https/);
  store.logApplication({ companyId, event: 'profile_created', url: 'https://careers.example.test/profile' });
  const run = start(store, [companyId]);
  setTime('2026-11-13T10:00:00Z');
  assert.throws(() => store.logApplication({ companyId, runId: run.id, event: 'cv_sent', evidence: 'Sent receipt' }), /explicit run/);
  assert.equal(store.report().cvsSent, 0);
});

test('old explicit activity preserves lost milestones but ordinary status and imports never invent progress', async t => {
  const { store, companyId, otherId, setTime } = await fixture(t);
  store.addActivity('account_created', 'Legacy confirmed registration', companyId);
  store.addActivity('cv_uploaded', 'Legacy confirmed upload', companyId);
  setTime('2026-11-14T08:00:00Z');
  store.addActivity('account_created', 'Duplicate old account event', companyId);
  store.logApplication({ companyId, event: 'prepared', notes: 'No suitable role' });
  store.logApplication({ companyId, event: 'error', notes: 'Later page error' });
  store.updateCompany(otherId, { status: 'applied' });
  store.addCompanies('fixture', [{ name: 'Other company', progress: { account_created: 99 } }]);
  assert.equal(store.getCompany(companyId).progress.account_created, 1);
  assert.equal(store.getCompany(companyId).progress.cv_uploaded, 1);
  assert.equal(store.getCompany(companyId).progress.applied, 0);
  assert.equal(store.getCompany(otherId).progress.account_created, 0);
  assert.equal(store.getCompany(otherId).progress.applied, 0);
  assert.equal(store.report({ since: '2026-11-14T00:00:00Z' }).accountsCreated, 0);
  assert.equal(store.report({ since: '2026-11-12T00:00:00Z' }).accountsCreated, 1);
  assert.throws(() => store.report({ since: 'bad-date' }), /valid report start/);
  assert.deepEqual(store.updateDirectory('fixture', { columns: ['name', 'type', 'progress'] }).columns, ['name', 'type', 'progress']);
});

test('emailed reports include real progress counts even with zero job applications', async t => {
  const { store, companyId, clock } = await fixture(t);
  store.logApplication({ companyId, event: 'account_created' });
  store.logApplication({ companyId, event: 'profile_created', evidence: 'Profile saved' });
  store.logApplication({ companyId, event: 'cv_uploaded' });
  store.updateSettings({ emailReports: true, reportEmail: 'fixture@example.test', timezone: 'UTC' });
  let body;
  const scheduler = createScheduler({ store, clock, connections: { async callMapped(kind, action, input) { body = input.body; return { structuredContent: { sent: true, messageId: 'report-only-fixture' } }; } } });
  const report = await scheduler.generateReport();
  assert.equal(report.delivery.status, 'sent');
  assert.match(body, /Applications sent: 0/);
  assert.match(body, /Companies with accounts created: 1/);
  assert.match(body, /Companies with profiles created: 1/);
  assert.match(body, /Companies with CVs uploaded: 1/);
  assert.match(body, /Companies sent a CV: 0/);
});

test('scheduled refresh reads confirmed CV-only threads without marking a job application', async t => {
  const { store, companyId, setTime, clock } = await fixture(t);
  const run = start(store, [companyId], { sendCvEmails: true });
  store.logApplication({ companyId, runId: run.id, event: 'cv_sent', method: 'email', role: 'General CV', to: 'careers@example.test', threadId: 'cv-thread', evidence: { providerMessageId: 'cv-confirmation' } });
  setTime('2026-11-13T09:00:00Z');
  const scheduler = createScheduler({ store, clock, connections: { async callMapped(kind, action, input) {
    assert.equal(action, 'readThread'); assert.equal(input.threadId, 'cv-thread');
    return { structuredContent: { replies: [{ id: 'cv-reply', threadId: 'cv-thread', from: 'careers@example.test', body: 'Your profile is saved.', receivedAt: '2026-11-13T08:30:00Z' }] } };
  } } });
  assert.equal((await scheduler.refresh()).updated, 1);
  assert.equal((await scheduler.refresh()).updated, 0);
  assert.equal(store.listApplications(companyId)[0].status, 'replied');
  assert.equal(store.getCompany(companyId).status, 'ready');
  assert.equal(store.getCompany(companyId).progress.cv_sent, 1);
  assert.equal(store.getCompany(companyId).progress.applied, 0);
  assert.equal(store.report().applied, 0);
  assert.equal(store.report().replies, 1);
  assert.ok(store.remainingCompanies({ directoryId: 'fixture' }).some(item => item.id === companyId));
});
