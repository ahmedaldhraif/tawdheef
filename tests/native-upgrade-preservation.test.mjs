import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openStore } from '../server/store.mjs';
import { nativeRunRequest } from '../server/native-guidance.mjs';

async function fixture(t) {
  const prefix = join(tmpdir(), 'tawdheef-native-upgrade-'), dataDir = await mkdtemp(prefix);
  const clock = () => new Date('2026-11-14T08:00:00Z');
  const store = openStore({ dataDir, seed: false, clock });
  t.after(async () => { store.close(); assert.ok(resolve(dataDir).startsWith(resolve(prefix))); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); });
  const start = (directoryId, actions) => store.startNativeRun({ directoryId, assistant: 'codex', explicit: true, mode: 'send_and_submit', actions }).run;
  const claim = runId => {
    const result = store.claimNativeTarget({ runId, assistant: 'codex' });
    return { ...result, identity: result.target && { runId, companyId: result.target.companyId, assistant: 'codex', claimToken: result.claimToken } };
  };
  const reportEmail = () => store.reportNativeConnection({ assistant: 'codex', kind: 'email', status: 'available', provider: 'gmail', accountEmail: 'candidate@example.test', observedAt: clock().toISOString() });
  function pack(id, companyId) {
    const records = [{ id: companyId, name: 'Synthetic shared employer', sourceRole: 'Commercial employer', careersUrl: 'https://employer.example.test/careers', email: 'careers@employer.example.test', sourceFields: { evidenceUrls: ['https://employer.example.test/careers'] } }];
    return store.installDirectoryPack({ pack: { id, name: id, formatVersion: 1, snapshotDate: '2026-11-14', sourceSha256: createHash('sha256').update(JSON.stringify(records)).digest('hex') }, records });
  }
  return { store, dataDir, clock, start, claim, reportEmail, pack };
}
const profiles = { applyMatchingJobs: false, createProfiles: true, sendCvEmails: false };
const applications = { applyMatchingJobs: true, createProfiles: false, sendCvEmails: false };

test('an existing application never suppresses independently selected profile work in preview, Native start or claim', async t => {
  const { store, start, claim } = await fixture(t);
  store.createDirectory({ id: 'fixture', name: 'Fixture' });
  store.addCompanies('fixture', [{ id: 'employer', name: 'Employer', careersUrl: 'https://employer.example.test/careers' }]);
  const old = store.startRun({ directoryId: 'fixture', explicit: true, mode: 'send_and_submit' });
  store.logApplication({ companyId: 'employer', runId: old.id, role: 'Engineer', status: 'applied', evidence: 'Synthetic original application receipt' });
  store.updateRun(old.id, { status: 'completed' });
  assert.equal(store.previewRun({ directoryId: 'fixture', actions: applications }).count, 0);
  assert.equal(store.previewRun({ directoryId: 'fixture', actions: profiles }).count, 1);
  const run = start('fixture', { ...profiles, applyMatchingJobs: true });
  assert.match(nativeRunRequest({ store, runId: run.id }).prompt, /independently of whether a matching job exists/);
  const attempt = claim(run.id);
  assert.equal(attempt.target.companyId, 'employer');
  store.logApplication({ companyId: 'employer', runId: run.id, event: 'profile_created', url: 'https://employer.example.test/profile/me', evidence: 'Synthetic profile confirmation' });
  const finished = store.finishNativeTarget({ ...attempt.identity, status: 'checked' });
  assert.equal(finished.target.status, 'checked', 'a historical application must not relabel this profile-only outcome');
  assert.equal(finished.run.outcomes.applicationsSent, 0);
  assert.equal(finished.run.outcomes.careerProfiles, 1);
  assert.equal(store.previewRun({ directoryId: 'fixture', actions: profiles }).count, 0);
});

test('Native claims recheck the saved selected actions after another connection records profile completion', async t => {
  const { store, dataDir, clock, start, claim } = await fixture(t);
  store.createDirectory({ id: 'fixture', name: 'Fixture' });
  store.addCompanies('fixture', [{ id: 'employer', name: 'Employer' }]);
  const run = start('fixture', profiles);
  const other = openStore({ dataDir, seed: false, clock });
  try { other.logApplication({ companyId: 'employer', event: 'profile_created', url: 'https://employer.example.test/profile/me', evidence: 'Synthetic separately completed profile' }); }
  finally { other.close(); }
  const result = claim(run.id);
  assert.equal(result.target, null); assert.equal(result.claimToken, null);
  assert.equal(result.run.status, 'completed'); assert.equal(result.run.targetCounts.skipped, 1);
});

test('Native email and form attempts retain cross-pack unknown/confirmed history and immutable original identity', async t => {
  const { store, start, claim, reportEmail, pack, clock } = await fixture(t);
  pack('first-pack', 'first'); pack('second-pack', 'second'); reportEmail();
  assert.deepEqual(new Set(store.relatedCompanyIds('first')), new Set(['first', 'second']));
  const originalRun = start('first-pack', applications), originalClaim = claim(originalRun.id);
  const input = { ...originalClaim.identity, role: 'Engineer', to: 'careers@employer.example.test', subject: 'Synthetic application', body: 'Synthetic authorized application' };
  const original = store.prepareNativeEmail(input);
  store.resolveNativeEmail({ assistant: 'codex', id: original.application.id, outcome: 'unknown' });
  store.stopNativeRun({ runId: originalRun.id });
  const aliasRun = start('second-pack', applications), aliasClaim = claim(aliasRun.id);
  assert.throws(() => store.prepareNativeEmail({ ...input, ...aliasClaim.identity }), /unresolved send/);
  assert.throws(() => store.prepareFormSubmission({ ...aliasClaim.identity, role: 'Another role', url: 'https://employer.example.test/form' }), /already submitted|unresolved send/);
  assert.throws(() => store.logApplication({ id: original.application.id, companyId: 'second', notes: 'Do not move original intent' }), /cannot move/);
  store.stopNativeRun({ runId: aliasRun.id });
  store.resolveNativeEmail({ assistant: 'codex', id: original.application.id, outcome: 'confirmed', receipt: { providerMessageId: 'synthetic-message', provider: original.sendPlan.provider, accountId: original.sendPlan.accountId, accountEmail: 'candidate@example.test', to: input.to, subject: input.subject, sentAt: clock().toISOString() } });
  assert.equal(store.getCompany('second').progress.applied, 1);
  assert.equal(store.getRelatedCompanyHistory('second').applications[0].originalCompanyId, 'first');
  assert.throws(() => start('second-pack', applications), /No unfinished/);
  const profileRun = start('second-pack', profiles), profileClaim = claim(profileRun.id);
  assert.equal(profileClaim.target.companyId, 'second');
  assert.throws(() => store.prepareFormSubmission({ ...profileClaim.identity, role: 'Engineer', url: 'https://employer.example.test/form', purpose: 'application' }), /does not allow job applications/);
  const profile = store.prepareFormSubmission({ ...profileClaim.identity, role: 'Career profile', url: 'https://employer.example.test/profile', purpose: 'profile' });
  store.resolveFormSubmission({ id: profile.application.id, outcome: 'confirmed', evidence: 'Synthetic saved career profile' });
  store.finishNativeTarget({ ...profileClaim.identity, status: 'checked' });
  assert.equal(store.getCompany('first').progress.profile_created, 1);
  assert.equal(store.listInstalledDirectoryPacks().length, 2);
  assert.equal(store.listApplications('first')[0].runId, originalRun.id);
});

test('a cross-pack form intent is reused without changing its company, run or purpose', async t => {
  const { store, start, claim, pack } = await fixture(t);
  pack('first-pack', 'first'); pack('second-pack', 'second');
  const first = start('first-pack', profiles), firstClaim = claim(first.id);
  const input = { ...firstClaim.identity, role: 'Career profile', url: 'https://employer.example.test/profile', purpose: 'profile' };
  const original = store.prepareFormSubmission(input);
  store.stopNativeRun({ runId: first.id });
  const second = start('second-pack', profiles), secondClaim = claim(second.id);
  assert.throws(() => store.prepareFormSubmission({ ...input, ...secondClaim.identity }), /unresolved send|already submitted/);
  assert.throws(() => store.prepareFormSubmission({ ...input, ...secondClaim.identity, url: 'https://employer.example.test/another-profile' }), /unresolved send|already submitted/);
  store.resolveFormSubmission({ id: original.application.id, outcome: 'confirmed', evidence: 'Synthetic inspected original profile confirmation after Stop' });
  const repeated = store.prepareFormSubmission({ ...input, ...secondClaim.identity });
  assert.equal(repeated.reused, true); assert.equal(repeated.application.id, original.application.id);
  assert.equal(repeated.application.companyId, 'first'); assert.equal(repeated.application.runId, first.id);
  assert.throws(() => store.prepareFormSubmission({ ...input, ...secondClaim.identity, purpose: 'application' }), /does not allow job applications/);
});

test('store-only restart recovery cancels old managed and Native authority while preserving settings, rules and evidence', async t => {
  const { store, dataDir, clock, start, claim } = await fixture(t);
  store.createDirectory({ id: 'fixture', name: 'Fixture' });
  store.addCompanies('fixture', [{ id: 'employer', name: 'Employer', careersUrl: 'https://employer.example.test/careers' }]);
  store.updateSettings({ refreshFrequency: 'hourly', reportFrequency: 'weekly', reportTime: '09:30', language: 'ar', cvLink: 'https://cv.example.test/original' });
  const settings = store.getSettings();
  const applyRule = store.saveMonitoringRule({ directoryId: 'fixture', companyIds: ['employer'], mode: 'apply', enabled: true, explicit: true, expiresAt: '2026-12-01T00:00:00Z', criteria: { roles: ['Engineer'], locations: ['Dubai'], notes: 'Keep original preferences' } });
  const notifyRule = store.saveMonitoringRule({ directoryId: 'fixture', companyIds: ['employer'], mode: 'notify', enabled: true, explicit: true });
  const oldRun = store.startMonitoringRun(applyRule.id); store.beginRunTarget(oldRun.id, 'employer');
  store.recordMonitoredJobs({ runId: oldRun.id, companyId: 'employer', sourceUrl: 'https://employer.example.test/careers', status: 'checked', jobs: [{ title: 'Engineer', location: 'Dubai', url: 'https://employer.example.test/jobs/one', matchesCV: true, reason: 'Synthetic exact criteria match', evidence: 'Synthetic dated job evidence' }] });
  const before = store.getMonitoringResults({ matchedOnly: false });
  const reader = openStore({ dataDir, seed: false, clock });
  try { assert.equal(reader.getRun(oldRun.id).status, 'running', 'ordinary local tool opens cannot revoke the owner'); }
  finally { reader.close(); }
  assert.deepEqual(store.recoverInterruptedRuns(), { cancelled: 1, native: 0, managed: 1 });
  assert.equal(store.getRun(oldRun.id).status, 'cancelled'); assert.equal(store.getRun(oldRun.id).activeCompanyId, null);
  assert.equal(store.getRun(oldRun.id).targets[0].status, 'needs_you');
  const paused = store.getMonitoringRule(applyRule.id);
  assert.equal(paused.enabled, false); assert.deepEqual(paused.companyIds, applyRule.companyIds);
  assert.deepEqual(paused.criteria, applyRule.criteria); assert.equal(paused.expiresAt, applyRule.expiresAt);
  assert.equal(store.getMonitoringRule(notifyRule.id).enabled, true);
  assert.deepEqual(store.getMonitoringResults({ matchedOnly: false }), before);
  assert.deepEqual(store.getSettings(), settings);
  const native = start('fixture', profiles), active = claim(native.id);
  assert.deepEqual(store.recoverInterruptedRuns(), { cancelled: 1, native: 1, managed: 0 });
  assert.throws(() => store.getNativeClaim(active.identity), /expired|stopped/);
  assert.equal(store.getNativeRun({ runId: native.id }).status, 'cancelled');
  assert.deepEqual(store.recoverInterruptedRuns(), { cancelled: 0, native: 0, managed: 0 });
});
