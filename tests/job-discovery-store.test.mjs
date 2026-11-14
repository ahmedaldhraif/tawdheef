import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openStore } from '../server/store.mjs';

async function fixture(t) {
  const prefix = join(tmpdir(), 'tawdheef-discovery-domain-'), dataDir = await mkdtemp(prefix);
  let date = new Date('2026-11-14T08:00:00Z'); const clock = () => date;
  const store = openStore({ dataDir, seed: false, clock });
  store.createDirectory({ id: 'one', name: 'One' }); store.createDirectory({ id: 'two', name: 'Two' });
  store.addCompanies('one', [{ id: 'employer', name: 'Synthetic employer', careersUrl: 'https://job-boards.greenhouse.io/fixture' }, { id: 'generic', name: 'Browser employer', careersUrl: 'https://example.org/careers' }]);
  store.addCompanies('two', [{ id: 'alias', name: 'Same sourced employer', careersUrl: 'https://boards.greenhouse.io/fixture' }]);
  t.after(async () => { store.close(); assert.ok(resolve(dataDir).startsWith(resolve(prefix))); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); });
  const prepare = (companyId = 'employer', patch = {}) => store.prepareJobDiscovery({ companyId, assistant: 'codex', ...patch });
  const sourceRead = (lease, patch = {}) => ({ method: lease.readRequest.plan.requests.length ? 'native_http' : 'native_browser', url: lease.readRequest.plan.requests[0]?.url || lease.readRequest.url, observedAt: clock().toISOString(), evidence: 'Synthetic actual client source receipt; no network call.', ...patch });
  const row = (id = 42, patch = {}) => ({ id, title: 'Software Engineer', location: { name: 'Dubai' }, absolute_url: `https://job-boards.greenhouse.io/fixture/jobs/${id}`, content: '<p>Required: JavaScript experience. Preferred: SQL experience.</p>', ...patch });
  const record = (lease, jobs = [row()], patch = {}) => store.recordJobDiscovery({ id: lease.id, token: lease.token, assistant: 'codex', sourceRead: sourceRead(lease), payload: { jobs }, complete: true, ...patch });
  const cv = (versionHash = 'a'.repeat(64), patch = {}) => store.reportNativeConnection({ assistant: 'codex', kind: 'cv', status: 'available', provider: 'tabbio', observedAt: clock().toISOString(), cv: { id: 'synthetic-cv', versionHash }, ...patch });
  const list = (patch = {}) => store.listDiscoveredJobs({ assistant: 'codex', ...patch });
  const match = (job, patch = {}) => store.recordJobMatch({ assistant: 'codex', jobId: job.id, expectedContentHash: job.contentHash, expectedPreferencesRevision: store.getDiscoveryPreferences().revision, cvReference: { sourceId: 'synthetic-cv', versionHash: 'a'.repeat(64) }, decision: 'suitable', requirements: [{ kind: 'required', jobQuote: 'JavaScript experience.', cvFactRef: 'experience:item-1:skills', relation: 'supports' }], reason: 'The client cited the actual requirement and a source-bound CV fact reference.', ...patch });
  return { store, dataDir, clock, prepare, sourceRead, row, record, cv, list, match, advance: ms => { date = new Date(+date + ms); } };
}

test('manual discovery is read-only without monitoring or Run and deduplicates one posting across source bindings', async t => {
  const { store, prepare, record, list } = await fixture(t);
  const before = { settings: store.getSettings(), monitoring: store.getMonitoring(), runs: store.listRuns(), applications: store.listApplications() };
  assert.equal(record(prepare()).added, 1); assert.equal(record(prepare('alias')).added, 0);
  const result = list(); assert.equal(result.total, 1); assert.deepEqual(new Set(result.items[0].companyIds), new Set(['employer', 'alias']));
  assert.equal(result.items[0].matchState, 'cv_unknown'); assert.equal(result.cv.status, 'unknown');
  assert.equal('description' in result.items[0], false); assert.equal('requirements' in result.items[0], false);
  const detail = store.getDiscoveredJob({ id: result.items[0].id, assistant: 'codex' }); assert.match(detail.job.description, /JavaScript experience/);
  assert.equal(list({ directoryId: 'two' }).total, 1); assert.equal(list({ companyId: 'generic' }).total, 0); assert.equal(list({ companyIds: [] }).total, 0);
  assert.deepEqual({ settings: store.getSettings(), monitoring: store.getMonitoring(), runs: store.listRuns(), applications: store.listApplications() }, before);
});

test('meaningful content changes invalidate a version-bound assessment while noise and repeated reads reuse it', async t => {
  const { store, prepare, record, row, list, cv, match } = await fixture(t); cv(); record(prepare());
  let job = list().items[0]; assert.equal(job.matchState, 'unscored');
  assert.equal(match(job).matchState, 'current'); assert.equal(list({ review: 'suitable' }).total, 1);
  const repeated = record(prepare(), [row(42, { content: '<p> Required:   JavaScript experience. Preferred: SQL experience. </p>', updated_at: 'different scrape timestamp' })]);
  assert.equal(repeated.unchanged, 1); assert.equal(list().items[0].matchState, 'current');
  const originalHash = job.contentHash; record(prepare(), [row(42, { content: '<p>Required: JavaScript experience and a new qualification.</p>' })]);
  job = list().items[0]; assert.notEqual(job.contentHash, originalHash); assert.equal(job.matchState, 'stale'); assert.equal(job.assessment.isCurrent, false); assert.ok(job.changedFields.includes('description'));
  assert.throws(() => match({ ...job, contentHash: originalHash }), /current complete posting/);
  assert.equal(store.getDiscoverySummary({ assistant: 'codex' }).changed, 1);
});

test('saved preferences and current fresh Native CV metadata are the only match context', async t => {
  const { store, prepare, record, list, cv, match, advance } = await fixture(t); record(prepare()); const job = list().items[0];
  assert.throws(() => match(job), /actual current CV/); cv(); assert.equal(match(job).assessment.clientReported, true);
  const initial = store.getDiscoveryPreferences(); assert.deepEqual(initial.roles, []); assert.deepEqual(initial.locations, []);
  assert.throws(() => store.updateDiscoveryPreferences({ expectedRevision: initial.revision, patch: { roles: ['Engineer'] } }), /Explicitly/);
  const prefs = store.updateDiscoveryPreferences({ expectedRevision: initial.revision, explicit: true, patch: { roles: ['Engineer'], locations: ['Dubai'], notes: 'Actual user preferences' } });
  assert.equal(list().items[0].matchState, 'stale'); assert.throws(() => match(job, { expectedPreferencesRevision: initial.revision }), /preferences changed/);
  assert.throws(() => store.updateDiscoveryPreferences({ expectedRevision: initial.revision, explicit: true, patch: {} }), /changed/);
  match(job, { expectedPreferencesRevision: prefs.revision }); cv('b'.repeat(64)); assert.equal(list().items[0].matchState, 'stale');
  assert.throws(() => match(job), /actual current CV/);
  advance(24 * 3600000 + 1); assert.equal(list().cv.status, 'unknown'); assert.notEqual(list().items[0].matchState, 'current'); assert.match(store.getDiscoverySummary({ assistant: 'codex' }).nextStep, /real CV/);
  assert.throws(() => store.recordJobMatch({ assistant: 'codex', rawCv: 'Must never be accepted' }), /supported/);
});

test('positive matches require real posting quotations, opaque fact references and supported mandatory requirements', async t => {
  const { store, prepare, record, list, cv, match } = await fixture(t); cv(); record(prepare()); const job = list().items[0];
  for (const requirements of [[], [{ kind: 'required', jobQuote: 'Invented requirement', cvFactRef: 'experience:item-1', relation: 'supports' }], [{ kind: 'required', jobQuote: 'JavaScript experience.', relation: 'supports' }], [{ kind: 'required', jobQuote: 'JavaScript experience.', cvFactRef: 'Copied CV paragraph instead of a fact reference', relation: 'supports' }], [{ kind: 'required', jobQuote: 'JavaScript experience.', relation: 'unknown' }]]) assert.throws(() => match(job, { requirements }));
  const requirements = [{ kind: 'required', jobQuote: 'JavaScript experience.', cvFactRef: 'experience:item-1', relation: 'supports' }, { kind: 'preferred', jobQuote: 'SQL experience.', relation: 'unknown' }];
  assert.equal(match(job, { requirements }).matchState, 'current');
  assert.throws(() => match(job, { decision: 'needs_you', nextStep: undefined }), /actionable next step/);
  const needs = match(job, { decision: 'needs_you', nextStep: 'Confirm the missing eligibility fact in your actual client.' });
  assert.equal(needs.matchState, 'needs_you'); assert.equal(list({ review: 'pending' }).total, 0, 'Needs you must not restart scoring on every list page');
  assert.equal(store.getDiscoverySummary({ assistant: 'codex' }).needsYou, 1);
});

test('partial and failed reads retain the prior complete description and never infer closure from absence', async t => {
  const { store, prepare, record, row, list, cv, match, sourceRead } = await fixture(t); cv(); record(prepare()); const first = list().items[0]; match(first);
  const partial = record(prepare(), [row(42, { content: undefined })], { complete: false }); assert.equal(partial.unchanged, 0); assert.equal(partial.needsDetail, 1);
  let detail = store.getDiscoveredJob({ id: first.id, assistant: 'codex' }); assert.equal(detail.job.contentHash, first.contentHash); assert.match(detail.job.description, /JavaScript experience/); assert.equal(detail.matchState, 'needs_detail');
  assert.throws(() => match(first), /current complete posting/);
  record(prepare(), []); assert.equal(list().total, 1); assert.notEqual(list().items[0].status, 'closed');
  const blocked = prepare(); store.recordJobDiscovery({ id: blocked.id, token: blocked.token, assistant: 'codex', sourceRead: sourceRead(blocked, { httpStatus: 403 }), status: 'unknown', nextStep: 'Open this saved source in your client and resolve the access prompt.' });
  const summary = store.getDiscoverySummary({ assistant: 'codex' }); assert.equal(summary.sourceProblems.length, 1); assert.match(summary.nextStep, /access prompt/);
  detail = store.getDiscoveredJob({ id: first.id, assistant: 'codex' }); assert.equal(detail.job.contentHash, first.contentHash); assert.notEqual(detail.job.status, 'closed');
});

test('304 requires the exact prior complete representation and validator, never listing-only or partial coverage', async t => {
  const { store, prepare, record, row, sourceRead, list } = await fixture(t);
  const first = prepare(); record(first, [row(), row(43)], { sourceRead: sourceRead(first, { etag: '"synthetic-v1"', httpStatus: 200 }) });
  let next = prepare(); assert.equal(next.readRequest.validators.etag, '"synthetic-v1"');
  const validated = store.recordJobDiscovery({ id: next.id, token: next.token, assistant: 'codex', sourceRead: sourceRead(next, { httpStatus: 304, etag: '"synthetic-v1"' }), complete: true }); assert.equal(validated.unchanged, 2);
  next = prepare(); assert.throws(() => store.recordJobDiscovery({ id: next.id, token: next.token, assistant: 'codex', sourceRead: sourceRead(next, { httpStatus: 304, etag: '"wrong"' }), complete: true }), /full source/);
  record(prepare(), [row(42, { content: undefined })], { complete: false });
  next = prepare(); assert.throws(() => store.recordJobDiscovery({ id: next.id, token: next.token, assistant: 'codex', sourceRead: sourceRead(next, { httpStatus: 304, etag: '"synthetic-v1"' }), complete: true }), /complete posting details/);
  assert.equal(list().total, 2);
});

test('discovery leases bind actor, actual route and freshness, but unrelated company edits do not revoke reads', async t => {
  const { store, prepare, record, sourceRead, advance } = await fixture(t);
  let lease = prepare(); assert.throws(() => record(lease, [], { assistant: 'claude-code' }), /selected/); assert.throws(() => record(lease, [], { token: 'wrong' }), /token/);
  store.updateCompany('employer', { expectedRevision: store.getCompany('employer').revision, name: 'Renamed locally', notes: 'Local tracking note' }); assert.equal(record(lease).added, 1);
  lease = prepare(); assert.throws(() => record(lease, [], { sourceRead: sourceRead(lease, { url: 'https://boards-api.greenhouse.io/v1/boards/another/jobs?content=true' }) }), /exact source/);
  store.updateCompany('employer', { expectedRevision: store.getCompany('employer').revision, careersUrl: 'https://job-boards.greenhouse.io/another' }); assert.throws(() => record(lease), /source changed/);
  lease = prepare(); advance(15 * 60000 + 1); assert.throws(() => record(lease), /expired/);
});

test('keyset review pagination does not skip pending jobs as earlier rows are assessed', async t => {
  const { prepare, record, row, cv, list, match } = await fixture(t); cv(); record(prepare(), [row(40), row(41), row(42)]);
  const first = list({ review: 'pending', limit: 1 }); match(first.items[0]); const second = list({ review: 'pending', limit: 1, cursor: first.nextCursor });
  assert.notEqual(second.items[0].id, first.items[0].id); match(second.items[0]); const third = list({ review: 'pending', limit: 1, cursor: second.nextCursor }); assert.equal(new Set([first.items[0].id, second.items[0].id, third.items[0].id]).size, 3);
});

test('linked Native monitoring leases retain scope revocation and expose only validated completion capabilities', async t => {
  const { store, row, sourceRead } = await fixture(t);
  const current = store.getMonitoring().config;
  const config = store.configureMonitoring({ expectedRevision: current.revision, explicit: true, patch: { enabled: true, assistant: 'codex', channels: { jobs: true }, scope: { directoryIds: ['one'], companyIds: ['employer'] } } }).config;
  let check = store.beginNativeMonitoringCheck({ assistant: 'codex', configurationRevision: config.revision, source: { kind: 'jobs', id: 'employer' } }).check;
  let nested = store.prepareMonitoredJobDiscovery({ id: check.id, token: check.token, assistant: 'codex' }); assert.equal(store.getDiscoveryLeaseScope({ id: nested.id, token: nested.token, assistant: 'codex' }).monitoringCheckId, check.id);
  store.recordJobDiscovery({ id: nested.id, token: nested.token, assistant: 'codex', sourceRead: sourceRead(nested), payload: { jobs: [row()] }, complete: true });
  const completed = store.getCompletedMonitoredDiscovery({ id: nested.id, token: nested.token, assistant: 'codex' }); assert.equal(completed.id, check.id); assert.equal(completed.sourceRead.method, 'native_http');
  assert.throws(() => store.beginNativeMonitoringCheck({ assistant: 'codex', configurationRevision: config.revision, source: { kind: 'jobs', id: 'generic' } }), /outside the saved monitoring scope/);
  nested = store.prepareMonitoredJobDiscovery({ id: check.id, token: check.token, assistant: 'codex' });
  store.configureMonitoring({ expectedRevision: config.revision, patch: { enabled: false } });
  assert.throws(() => store.getDiscoveryLeaseScope({ id: nested.id, token: nested.token, assistant: 'codex' }), /monitoring check stopped|saved scope changed/);
});

test('a complete listing omission becomes unknown and needs verification while last-known facts and fit evidence survive', async t => {
  const { store, prepare, record, row, list, cv, match } = await fixture(t); cv(); record(prepare(), [row(42), row(43)]);
  const previous = list().items; for (const job of previous) match(job);
  const missingId = previous.find(job => job.url.endsWith('/43')).id;
  record(prepare(), [row(42)]);
  const missing = store.getDiscoveredJob({ id: missingId, assistant: 'codex' });
  assert.equal(missing.job.status, 'unknown'); assert.equal(missing.job.lastKnownStatus, 'open'); assert.equal(missing.matchState, 'needs_detail'); assert.match(missing.job.description, /JavaScript experience/); assert.equal(missing.assessment.isCurrent, false);
  assert.equal(list({ review: 'suitable' }).total, 1);
  record(prepare(), []); assert.equal(list({ review: 'suitable' }).total, 0); assert.ok(list().items.every(job => job.status !== 'closed'));
});

test('out-of-order reads cannot revert a newer posting snapshot', async t => {
  const { prepare, record, row, sourceRead, list, advance, store } = await fixture(t);
  const older = prepare(), oldReceipt = sourceRead(older); advance(1000);
  record(prepare(), [row(42, { content: '<p>Newer actual public requirements.</p>' })]);
  assert.throws(() => record(older, [row()], { sourceRead: oldReceipt }), /newer source observation/);
  assert.match(store.getDiscoveredJob({ id: list().items[0].id, assistant: 'codex' }).job.description, /Newer actual/);
});

test('old details require an actual read while a qualified unchanged 304 reuses the same fit assessment', async t => {
  const { prepare, record, sourceRead, list, cv, match, advance, store } = await fixture(t); cv();
  const original = prepare(); record(original, undefined, { sourceRead: sourceRead(original, { httpStatus: 200, etag: '"complete-v1"' }) });
  const job = list().items[0], assessedAt = match(job).assessment.assessedAt;
  advance(24 * 3600000 + 1); cv(); assert.equal(list().items[0].matchState, 'needs_detail'); assert.throws(() => match(job), /current complete posting/);
  const fresh = prepare(); store.recordJobDiscovery({ id: fresh.id, token: fresh.token, assistant: 'codex', sourceRead: sourceRead(fresh, { httpStatus: 304, etag: '"complete-v1"' }), complete: true });
  assert.equal(list().items[0].matchState, 'current'); assert.equal(store.getDiscoveredJob({ id: job.id, assistant: 'codex' }).assessment.assessedAt, assessedAt);
});

test('tracking-only source URLs normalize consistently without losing real job identifiers', async t => {
  const { store, prepare, sourceRead, list } = await fixture(t);
  store.updateCompany('generic', { expectedRevision: store.getCompany('generic').revision, careersUrl: 'https://example.org/careers?utm_source=directory' });
  const lease = prepare('generic');
  store.recordJobDiscovery({ id: lease.id, token: lease.token, assistant: 'codex', sourceRead: sourceRead(lease, { url: 'https://example.org/careers?utm_source=directory' }), observations: [{ title: 'Engineer', url: 'https://example.org/jobs?jobId=42&utm_source=company', description: 'Actual public requirement.', contentComplete: true, status: 'open', evidence: 'Synthetic observed job and actual source link.' }], complete: true });
  assert.equal(list().items[0].url, 'https://example.org/jobs?jobId=42');
});

test('shared-board source fanout stays bounded in compact and detail projections', async t => {
  const { store, prepare, record, list } = await fixture(t); record(prepare());
  store.addCompanies('one', Array.from({ length: 25 }, (_, index) => ({ id: `shared-${index}`, name: `Alias ${index}`, careersUrl: 'https://job-boards.greenhouse.io/fixture' })));
  for (let index = 0; index < 25; index++) record(prepare(`shared-${index}`));
  const job = list().items[0]; assert.equal(job.sourceCount, 26); assert.equal(job.companyIds.length, 5); assert.equal(job.sourceBindingsTruncated, true);
  const detail = store.getDiscoveredJob({ id: job.id, assistant: 'codex' }); assert.equal(detail.job.companyIds.length, 20); assert.equal(detail.job.sourceCount, 26);
});

test('Needs you totals cover every source while the diagnostic page stays bounded', async t => {
  const { store, prepare } = await fixture(t);
  store.addCompanies('one', Array.from({ length: 105 }, (_, index) => ({ id: `blocked-${index}`, name: `Blocked source ${index}`, careersUrl: `https://example.org/careers/${index}` })));
  for (let index = 0; index < 105; index++) { const lease = prepare(`blocked-${index}`); store.recordJobDiscovery({ id: lease.id, token: lease.token, assistant: 'codex', status: 'unknown', nextStep: 'Use the actual client browser to resolve this source access problem.' }); }
  const summary = store.getDiscoverySummary({ assistant: 'codex' }); assert.equal(summary.needsYou, 105); assert.equal(summary.sourceProblemCount, 105); assert.equal(summary.sourceProblems.length, 100); assert.match(summary.nextStep, /actual client browser/);
});
