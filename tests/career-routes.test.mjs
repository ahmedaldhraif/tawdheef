import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as sqlite from 'node:sqlite';
import { openStore } from '../server/store.mjs';
import { guardOperatorCall, operatorPrompt } from '../server/operator-contract.mjs';
import { nativeRunRequest } from '../server/native-guidance.mjs';

const profiles = { applyMatchingJobs: false, createProfiles: true, sendCvEmails: false };
async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'tawdheef-career-routes-'));
  let date = '2026-11-15T08:00:00.000Z';
  const store = openStore({ dataDir, seed: false, clock: () => new Date(date) });
  t.after(async () => { store.close(); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); });
  store.createDirectory({ id: 'routes', name: 'Routes' });
  store.addCompanies('routes', [{ id: 'employer', name: 'Employer', careersUrl: 'https://example.test/careers' }]);
  const patch = values => store.updateCompany('employer', { expectedRevision: store.getCompany('employer').revision, ...values });
  const preview = actions => store.previewRun({ directoryId: 'routes', actions }).count;
  const start = actions => store.startNativeRun({ directoryId: 'routes', assistant: 'codex', mode: 'send_and_submit', explicit: true, actions }).run;
  return { store, dataDir, patch, preview, start, advance: () => { date = '2026-11-15T09:00:00.000Z'; } };
}

test('legacy route defaults are normalized; evidence and revision checks protect findings, URLs and timestamps', async t => {
  const { store, patch, advance } = await fixture(t);
  const original = store.getCompany('employer');
  for (const company of [original, store.listCompanies({ directoryId: 'routes' }).items[0], store.exportCompanies('routes')[0]]) {
    assert.equal(company.careersPageStatus, 'unknown'); assert.equal(company.profileSupport, 'unknown');
    assert.equal(company.routeEvidence, ''); assert.equal(company.routesCheckedAt, null);
  }
  assert.throws(() => patch({ profileSupport: 'not_offered' }), /source or reason/);
  assert.throws(() => patch({ careersPageStatus: 'not_offered', routeEvidence: 'Synthetic finding' }), /supported career route/);
  assert.throws(() => patch({ routeEvidence: null }), /must be text/);
  const found = patch({ careersPageStatus: 'not_found', profileSupport: 'not_offered', routeEvidence: '  Official public page inspected; no separate career profile offered.  ' });
  assert.equal(found.status, 'not_started'); assert.equal(found.progress.profile_created, 0);
  assert.equal(found.careersUrl, original.careersUrl); assert.equal(found.routesCheckedAt, '2026-11-15T08:00:00.000Z');
  assert.equal(found.routeEvidence, 'Official public page inspected; no separate career profile offered.');
  advance();
  assert.equal(patch({ notes: 'Unrelated local note' }).routesCheckedAt, found.routesCheckedAt);
  assert.equal(patch({ profileSupport: 'not_offered', routeEvidence: `  ${found.routeEvidence}  ` }).routesCheckedAt, found.routesCheckedAt);
  assert.throws(() => patch({ profileSupport: 'available' }), /source or reason/, 'old evidence cannot authorize a new finding');
  assert.throws(() => patch({ routeEvidence: '' }), /source or reason/);
  assert.throws(() => store.updateCompany('employer', { expectedRevision: original.revision, profileSupport: 'available', routeEvidence: 'Synthetic newer source' }), /changed/);
  const reset = patch({ careersPageStatus: 'unknown', profileSupport: 'unknown', routeEvidence: '' });
  assert.equal(reset.routesCheckedAt, null); assert.equal(reset.careersUrl, original.careersUrl);
});

test('profile-route eligibility is independent of applications and CV emails across preview, start and claim', async t => {
  const { store, patch, preview, start } = await fixture(t);
  // Warm the projection, then change route eligibility without decoding full records in preview.
  assert.equal(preview(profiles), 1);
  patch({ profileSupport: 'not_offered', routeEvidence: 'Official route offers job applications only.' });
  assert.equal(preview(profiles), 0);
  assert.equal(store.remainingCompanies({ directoryId: 'routes', actions: profiles }).length, 0);
  assert.throws(() => start(profiles), /No unfinished/);
  for (const actions of [{ ...profiles, applyMatchingJobs: true }, { ...profiles, sendCvEmails: true }]) {
    assert.equal(preview(actions), 1);
    const run = start(actions), claim = store.claimNativeTarget({ runId: run.id, assistant: 'codex' });
    assert.equal(claim.target.companyId, 'employer'); store.stopNativeRun({ runId: run.id });
  }
  patch({ profileSupport: 'needs_check', routeEvidence: 'Sign-in blocked inspection; support is not known.' });
  const run = start(profiles);
  assert.match(nativeRunRequest({ store, runId: run.id }).prompt, /blocked page is needs_check, never absence/);
  patch({ profileSupport: 'not_offered', routeEvidence: 'Public source now confirms no standalone profile.' });
  const skipped = store.claimNativeTarget({ runId: run.id, assistant: 'codex' });
  assert.equal(skipped.target, null); assert.equal(skipped.run.targetCounts.skipped, 1);
});

test('one-time Career profile column migration preserves later hide, directory metadata and historical IDs', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'tawdheef-route-migration-'));
  let store;
  t.after(async () => { store?.close(); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); });
  store = openStore({ dataDir, seed: false });
  store.createDirectory({ id: 'historical-directory', name: 'Historical', columns: ['name', 'status', 'notes'] });
  store.addCompanies('historical-directory', [{ id: 'historical-company', name: 'Historical company' }]);
  store.updateSettings({ language: 'ar' }); store.close(); store = null;
  const Database = sqlite.Database || sqlite.DatabaseSync, db = new Database(join(dataDir, 'tracker.sqlite'));
  const savedSettingsPayload = db.prepare("SELECT payload FROM settings WHERE id='main'").get().payload;
  db.prepare('DELETE FROM app_migrations WHERE id=?').run('career-profile-column-v1'); db.close();
  store = openStore({ dataDir, seed: false });
  const migrated = new Database(join(dataDir, 'tracker.sqlite'));
  try { assert.equal(migrated.prepare("SELECT payload FROM settings WHERE id='main'").get().payload, savedSettingsPayload, 'upgrade must preserve main settings bytes and not manufacture a contact hint'); }
  finally { migrated.close(); }
  assert.deepEqual(store.listDirectories()[0].columns, ['name', 'status', 'progress', 'notes']);
  assert.equal(store.getCompany('historical-company').directoryId, 'historical-directory'); assert.equal(store.getSettings().language, 'ar');
  store.updateDirectory('historical-directory', { columns: ['name', 'status'] }); store.close(); store = null;
  store = openStore({ dataDir, seed: false });
  assert.deepEqual(store.listDirectories()[0].columns, ['name', 'status']);
  assert.ok(store.createDirectory({ id: 'new-directory', name: 'New directory' }).columns.includes('progress'));
});

test('compatibility operator allows evidenced route edits but cannot change milestones or another company', () => {
  const run = { id: 'run', managed: true, status: 'running', activeCompanyId: 'employer', companyIds: ['employer'], actions: profiles };
  const store = { getRun: () => run }, scope = { runId: 'run', companyId: 'employer' };
  const input = { id: 'employer', patch: { expectedRevision: 1, careersPageStatus: 'needs_check', profileSupport: 'unknown', routeEvidence: 'Synthetic blocked public page.' } };
  assert.equal(guardOperatorCall(store, 'update_company', input, scope), input);
  assert.throws(() => guardOperatorCall(store, 'update_company', { id: 'other', patch: input.patch }, scope), /assigned company/);
  assert.throws(() => guardOperatorCall(store, 'update_company', { id: 'employer', patch: { profile_created: true } }, scope), /log_application/);
  assert.match(operatorPrompt(run, 'employer'), /blocked page is needs_check, never proof of absence/);
});

test('optional contact hint persists only explicit edits and never becomes a Native account identity', async t => {
  const { store, dataDir } = await fixture(t);
  assert.equal(Object.hasOwn(store.getSettings(), 'applicationEmail'), false);
  store.updateSettings({ language: 'ar' });
  assert.equal(Object.hasOwn(store.getSettings(), 'applicationEmail'), false);
  assert.equal(store.getNativeClientStatus({ assistant: 'codex' }).primaryEmail, null);
  assert.equal(store.updateSettings({ applicationEmail: '  chosen@example.test  ' }).applicationEmail, 'chosen@example.test');
  const passive = store.getNativeClientStatus({ assistant: 'codex' });
  assert.equal(passive.primaryEmail, null); assert.equal(passive.capabilities.email.status, 'unknown');
  for (const applicationEmail of ['Name <private@example.test>', 'x@example.test\r\nsecret', 'not-email', `${'x'.repeat(255)}@example.test`])
    assert.throws(() => store.updateSettings({ applicationEmail }), /valid optional contact email/);
  const before = store.getSettings();
  const other = openStore({ dataDir, seed: false });
  try { assert.deepEqual(other.getSettings(), before); }
  finally { other.close(); }
  store.reportNativeConnection({ assistant: 'codex', kind: 'email', status: 'available', observedAt: '2026-11-15T08:00:00.000Z', provider: 'gmail', accountEmail: 'actual-mailbox@example.test' });
  assert.equal(store.getNativeClientStatus({ assistant: 'codex' }).primaryEmail, 'actual-mailbox@example.test');
  assert.equal(store.updateSettings({ applicationEmail: '' }).applicationEmail, '');
  assert.equal(store.getNativeClientStatus({ assistant: 'codex' }).primaryEmail, 'actual-mailbox@example.test');
});
