import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openStore } from '../server/store.mjs';

async function fixture(t) {
  const prefix = join(tmpdir(), 'tawdheef-monitor-domain-'), dataDir = await mkdtemp(prefix);
  let current = new Date('2026-11-14T08:00:00Z');
  const store = openStore({ dataDir, seed: false, clock: () => current });
  store.createDirectory({ id: 'selected', name: 'Selected' });
  store.createDirectory({ id: 'other', name: 'Other' });
  store.addCompanies('selected', [{ id: 'alpha', name: 'Alpha', careersUrl: 'https://example.test/alpha/careers', email: 'careers@example.test' }, { id: 'beta', name: 'Beta' }]);
  store.addCompanies('other', [{ id: 'foreign', name: 'Foreign', careersUrl: 'https://example.test/foreign' }]);
  t.after(async () => { store.close(); assert.ok(resolve(dataDir).startsWith(resolve(prefix))); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); });
  return { store, dataDir, advance: ms => { current = new Date(+current + ms); } };
}
const enable = (store, patch = {}) => store.configureMonitoring({ expectedRevision: store.getMonitoring().config.revision, explicit: true, patch: { enabled: true, channels: { jobs: true }, scope: { directoryIds: ['selected'] }, ...patch } });
const begin = (store, extra = {}) => store.beginMonitoringCheck({ configurationRevision: store.getMonitoring().config.revision, assistant: store.getMonitoring().config.assistant, source: { kind: 'jobs', id: 'alpha' }, ...extra });
const finish = (store, lease, extra = {}) => store.finishMonitoringCheck({ id: lease.check.id, token: lease.token, status: 'checked', observations: [{ externalId: 'job-1', title: 'Engineer', url: 'https://example.test/job/1', data: { location: 'Dubai', state: 'open' }, evidence: 'Synthetic source listing' }], ...extra });

test('monitoring defaults and native schedule metadata never imply a running external automation', async t => {
  const { store } = await fixture(t);
  const initial = store.getMonitoring();
  assert.equal(initial.config.enabled, false);
  assert.deepEqual(initial.config.channels, { jobs: false, profiles: false, email: false, calendar: false });
  assert.equal(initial.status.lastCheckAt, null); assert.equal(initial.status.lastSuccessAt, null);
  assert.equal(initial.status.externalScheduleStatus, 'unknown'); assert.equal(initial.status.nextRunAt, null);
  assert.equal(store.getSettings().preferredAssistant, 'codex');
  store.updateSettings({ preferredAssistant: 'claude-code' });
  assert.equal(store.getMonitoring().config.assistant, 'claude-code');
  assert.throws(() => store.updateSettings({ preferredAssistant: 'other' }), /Codex/);
  const configured = enable(store);
  store.updateSettings({ preferredAssistant: 'codex' });
  assert.equal(store.getMonitoring().config.assistant, 'claude-code', 'changing app preference must not silently switch an existing native recipe');
  assert.deepEqual(store.reportMonitoringSchedule({ configurationRevision: configured.config.revision, assistant: 'claude-code', externalId: 'synthetic-native-task' }), { externalScheduleStatus: 'reported', verified: false, nextRunAt: null });
  assert.equal(store.getMonitoring().status.externalScheduleStatus, 'reported');
  assert.equal(store.getMonitoring().status.nextRunAt, null);
  store.configureMonitoring({ expectedRevision: configured.config.revision, patch: { enabled: false } });
  assert.equal(store.getMonitoring().status.externalScheduleStatus, 'unknown');
});

test('explicit configuration, revisions, source intersections and channel-specific bounds fail closed', async t => {
  const { store } = await fixture(t);
  const revision = store.getMonitoring().config.revision;
  assert.throws(() => store.configureMonitoring({ expectedRevision: revision, patch: { enabled: true } }), /Explicitly/);
  assert.throws(() => enable(store, { scope: { directoryIds: [], companyIds: [] } }), /company or directory/);
  assert.throws(() => enable(store, { channels: { jobs: false, calendar: true } }), /calendar IDs/);
  assert.throws(() => enable(store, { frequency: 'every-second' }), /frequency|recipe/);
  assert.throws(() => enable(store, { instructions: 'x'.repeat(2001) }), /2,000/);
  const selected = enable(store, { scope: { directoryIds: ['selected'], companyIds: ['alpha', 'foreign'] } });
  assert.deepEqual(store.listMonitoringSources({ kind: 'jobs' }).items.map(item => item.id), ['alpha']);
  assert.throws(() => begin(store, { source: { kind: 'jobs', id: 'foreign' } }), /scope/);
  assert.throws(() => begin(store, { assistant: 'claude-code' }), /selected/);
  assert.throws(() => store.configureMonitoring({ expectedRevision: revision, explicit: true, patch: { enabled: false } }), /changed/);
  assert.equal(store.getMonitoring().config.revision, selected.config.revision);
});

test('leases are bounded, deduplicate overlapping work and are revoked by configuration changes', async t => {
  const { store, advance } = await fixture(t);
  enable(store);
  assert.throws(() => begin(store, { leaseMs: 1200001 }), /twenty/);
  const lease = begin(store, { leaseMs: 1000 });
  assert.equal(lease.reused, false);
  assert.equal(begin(store).reused, true);
  assert.equal(begin(store).token, null);
  assert.equal(store.getMonitoring().status.activeChecks, 1);
  assert.ok(!JSON.stringify(lease.check).includes('tokenHash'));
  assert.equal(store.getMonitoringCheck({ id: lease.check.id, token: lease.token }).source.companyId, 'alpha');
  assert.throws(() => store.getMonitoringCheck({ id: lease.check.id, token: 'wrong' }), /invalid/);
  advance(1001);
  assert.throws(() => finish(store, lease), /expired/);
  const next = begin(store);
  store.configureMonitoring({ expectedRevision: store.getMonitoring().config.revision, explicit: true, patch: { instructions: 'Dubai roles' } });
  assert.throws(() => finish(store, next), /revoked/);
  assert.throws(() => begin(store, { configurationRevision: next.check.configurationRevision }), /revision/);
  const active = begin(store);
  assert.deepEqual(store.revokeMonitoringChecks({ reason: 'Synthetic revocation' }), { revoked: 1 });
  assert.throws(() => finish(store, active), /revoked/);
  assert.equal(store.getMonitoring().status.activeChecks, 0);
});

test('observations deduplicate meaningful facts, preserve acknowledgements and never mutate application records', async t => {
  const { store, advance } = await fixture(t);
  enable(store);
  const companyBefore = store.getCompany('alpha');
  finish(store, begin(store));
  let update = store.listMonitoringUpdates({ unread: true }).items[0];
  assert.equal(update.status, 'new');
  store.acknowledgeMonitoringUpdate({ id: update.id, expectedRevision: update.revision });
  advance(1000);
  const repeated = finish(store, begin(store), { observations: [{ externalId: 'job-1', title: 'Engineer', url: 'https://example.test/job/1', summary: 'Different model wording', data: { state: 'open', location: 'Dubai' }, evidence: 'Another timestamped view' }] });
  assert.equal(repeated.unchanged, 1);
  assert.equal(store.listMonitoringUpdates({ unread: true }).total, 0);
  const changed = finish(store, begin(store), { observations: [{ externalId: 'job-1', title: 'Engineer', url: 'https://example.test/job/1', data: { state: 'open', location: 'Abu Dhabi' }, evidence: 'Synthetic updated location' }] });
  assert.equal(changed.changed, 1);
  update = store.listMonitoringUpdates({ unread: true }).items[0];
  assert.equal(update.status, 'changed');
  assert.throws(() => store.acknowledgeMonitoringUpdate({ id: update.id, expectedRevision: 1 }), /changed/);
  assert.deepEqual(store.getCompany('alpha'), companyBefore);
  assert.equal(store.listApplications().length, 0); assert.equal(store.listRuns().length, 0);
});

test('partial, missing and failed reads preserve source state and do not advance successful cursors', async t => {
  const { store } = await fixture(t);
  enable(store);
  const partial = finish(store, begin(store), { complete: false, cursor: 'partial-page' });
  assert.equal(partial.check.status, 'partial'); assert.equal(partial.check.cursor, null);
  assert.equal(store.getMonitoring().status.lastSuccessAt, null);
  const checked = finish(store, begin(store), { cursor: 'confirmed-watermark' });
  assert.equal(checked.check.cursor, 'confirmed-watermark');
  const lease = begin(store);
  assert.equal(lease.check.cursor, 'confirmed-watermark');
  finish(store, lease, { observations: [] });
  assert.equal(store.listMonitoringUpdates().total, 1, 'absence must not erase a job');
  finish(store, begin(store), { status: 'unknown', observations: [{ externalId: 'job-1', title: 'Engineer', status: 'unknown', summary: 'Login required' }] });
  const unknown = store.listMonitoringUpdates({ compact: false }).items[0];
  assert.equal(unknown.status, 'unknown'); assert.equal(unknown.lastObserved.data.state, 'open');
  const bad = begin(store);
  assert.throws(() => finish(store, bad, { observations: [{ externalId: 'job-1', title: 'Engineer', data: { removed: true } }] }), /Absence/);
  assert.throws(() => finish(store, bad, { observations: [{ externalId: 'job-1', title: 'Engineer', data: { access_token: 'fake-secret' } }] }), /credentials/);
  assert.equal(store.getMonitoringCheck({ id: bad.check.id, token: bad.token }).status, 'running', 'invalid output must roll back atomically');
});

test('tracked email and calendar checks need account provenance and retain separate account histories', async t => {
  const { store } = await fixture(t);
  const run = store.startRun({ directoryId: 'selected', companyIds: ['alpha'], explicit: true, mode: 'send_and_submit' });
  const application = store.logApplication({ companyId: 'alpha', runId: run.id, role: 'Engineer', method: 'email', status: 'applied', threadId: 'tracked-thread', to: 'careers@example.test', evidence: { providerMessageId: 'synthetic-sent-receipt' } });
  store.updateRun(run.id, { status: 'completed' });
  enable(store, { channels: { jobs: false, email: true, calendar: true }, scope: { directoryIds: [], calendarIds: ['selected-calendar'] } });
  assert.deepEqual(store.listMonitoringSources({ kind: 'email' }).items.map(item => item.id), [application.id]);
  assert.throws(() => begin(store, { source: { kind: 'email', id: 'untracked-thread' } }), /scope/);
  const source = { kind: 'calendar', id: 'selected-calendar' };
  const lease = begin(store, { source });
  assert.equal(lease.check.source.forecastDays, 14); assert.equal(lease.check.source.limit, 100);
  assert.throws(() => finish(store, lease, { observations: [] }), /provider and account/);
  finish(store, lease, { provider: 'fixture-calendar', accountId: 'account-a', observations: [{ externalId: 'event-1', title: 'Synthetic interview', data: { start: '2026-11-15T08:00:00Z' } }] });
  const second = begin(store, { source, provider: 'fixture-calendar', accountId: 'account-b' });
  finish(store, second, { observations: [{ externalId: 'event-1', title: 'Synthetic interview', data: { start: '2026-11-15T08:00:00Z' } }] });
  assert.equal(store.listMonitoringUpdates().total, 2);
  assert.equal(store.getCompany('alpha').status, 'applied', 'an interview-like event title must not advance an application');
});

test('profile sources require an actual saved profile URL and paginated feeds retain every item', async t => {
  const { store } = await fixture(t);
  store.logApplication({ companyId: 'alpha', status: 'profile_created', method: 'form', url: 'https://example.test/profile/alpha', evidence: 'Synthetic profile confirmation' });
  store.logApplication({ companyId: 'beta', status: 'account_created', method: 'form', url: 'https://example.test/account/beta' });
  enable(store, { channels: { jobs: false, profiles: true } });
  const profiles = store.listMonitoringSources({ kind: 'profiles' });
  assert.equal(profiles.total, 1); assert.equal(profiles.items[0].companyId, 'alpha');
  const lease = begin(store, { source: { kind: 'profiles', id: profiles.items[0].id } });
  finish(store, lease, { observations: Array.from({ length: 25 }, (_, index) => ({ externalId: `field-${index}`, title: `Synthetic field ${index}`, data: { state: 'observed' } })) });
  const first = store.listMonitoringUpdates({ limit: 20 }), second = store.listMonitoringUpdates({ limit: 20, offset: first.nextOffset });
  assert.equal(first.total, 25); assert.equal(second.items.length, 5); assert.equal(second.nextOffset, null);
  assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 25);
  assert.throws(() => store.listMonitoringUpdates({ limit: 101 }), /limit/);
});

test('explicit native email monitoring pauses only the legacy reply timer and never resumes it', async t => {
  const { store } = await fixture(t);
  store.updateSettings({ refreshFrequency: 'hourly', reportFrequency: 'weekly', reportTime: '11:30', emailReports: true, reportEmail: 'reports@example.test', lastRefreshAt: '2026-11-13T08:00:00Z', lastReportAt: '2026-11-12T08:00:00Z' });
  const original = store.getSettings();
  const monitoring = enable(store, { channels: { jobs: false, email: true }, scope: { directoryIds: [] } });
  assert.deepEqual(store.getSettings(), { ...original, refreshFrequency: 'manual' });
  assert.throws(() => store.updateSettings({ refreshFrequency: 'hourly', reportFrequency: 'off' }), /Turn off native email monitoring/);
  assert.deepEqual(store.getSettings(), { ...original, refreshFrequency: 'manual' });
  store.configureMonitoring({ expectedRevision: monitoring.config.revision, patch: { enabled: false } });
  assert.deepEqual(store.getSettings(), { ...original, refreshFrequency: 'manual' });
  assert.equal(store.getMonitoring().status.externalScheduleStatus, 'unknown');
  assert.equal(store.getMonitoring().status.nextRunAt, null);
});

test('attention counts distinct unresolved sources and compact feeds disclose no bulk evidence', async t => {
  const { store } = await fixture(t);
  enable(store);
  finish(store, begin(store), { status: 'unknown', summary: 'Sign in to inspect this source.', observations: [] });
  assert.equal(store.getMonitoring().status.needsYouCount, 1);
  assert.equal(store.getMonitoring().status.latestSummary, 'Sign in to inspect this source.');
  finish(store, begin(store), { status: 'error', summary: 'Source unavailable.', observations: [{ externalId: 'source-access', title: 'Source unavailable', status: 'error', summary: 'Try again after sign-in.', data: { error: 'unavailable' }, evidence: { url: 'https://example.test/alpha/careers' } }] });
  assert.equal(store.getMonitoring().status.needsYouCount, 1, 'the failed check and its update describe one source');
  const compact = store.listMonitoringUpdates().items[0];
  assert.equal(compact.detailsAvailable, true);
  assert.equal(compact.data, undefined); assert.equal(compact.evidence, undefined); assert.equal(compact.fingerprint, undefined);
  finish(store, begin(store), { summary: 'Source checked successfully.', observations: [] });
  assert.equal(store.getMonitoring().status.needsYouCount, 1, 'unread source attention is retained until acknowledged');
  store.acknowledgeMonitoringUpdate({ id: compact.id, expectedRevision: compact.revision });
  assert.equal(store.getMonitoring().status.needsYouCount, 0);
  assert.equal(store.getMonitoring().status.latestSummary, 'Source checked successfully.');
});

test('invalid observation batches roll back every item and another client can revoke a lease', async t => {
  const { store, dataDir } = await fixture(t);
  enable(store);
  const lease = begin(store);
  assert.throws(() => finish(store, lease, { observations: [
    { externalId: 'valid-first', title: 'First observation', data: { state: 'open' } },
    { externalId: 'invalid-second', title: 'Second observation', data: { refresh_token: 'must-not-persist' } },
  ] }), /credentials/);
  assert.equal(store.listMonitoringUpdates().total, 0);
  const other = openStore({ dataDir, seed: false });
  try { other.configureMonitoring({ expectedRevision: other.getMonitoring().config.revision, patch: { enabled: false } }); }
  finally { other.close(); }
  assert.throws(() => finish(store, lease), /revoked/);
  assert.equal(store.listMonitoringUpdates().total, 0);
  assert.equal(store.getMonitoring().status.lastSuccessAt, null);
});

test('a changed native configuration starts with unknown check status while its historical feed remains', async t => {
  const { store, advance } = await fixture(t);
  enable(store);
  finish(store, begin(store), { summary: 'Old scope checked.' });
  advance(1000);
  finish(store, begin(store), { status: 'unknown', summary: 'Old scope needs sign-in.', observations: [{ externalId: 'source-access', title: 'Source access', status: 'unknown', summary: 'Sign in.' }] });
  const oldActive = begin(store, { source: { kind: 'jobs', id: 'beta' } });
  const previous = store.getMonitoring();
  assert.notEqual(previous.status.lastSuccessAt, null); assert.equal(previous.status.activeChecks, 1); assert.equal(previous.status.needsYouCount, 1);
  store.configureMonitoring({ expectedRevision: previous.config.revision, explicit: true, patch: { scope: { directoryIds: [], companyIds: ['beta'] } } });
  const fresh = store.getMonitoring().status;
  assert.equal(fresh.lastCheckAt, null); assert.equal(fresh.lastSuccessAt, null); assert.equal(fresh.latestSummary, null);
  assert.equal(fresh.activeChecks, 0); assert.equal(fresh.needsYouCount, 0);
  assert.equal(fresh.unreadCount, previous.status.unreadCount, 'unread count describes the retained historical updates feed');
  assert.equal(store.listMonitoringUpdates().total, 2);
  assert.throws(() => store.getMonitoringCheck({ id: oldActive.check.id, token: oldActive.token }), /revoked/);
  advance(1000);
  finish(store, begin(store, { source: { kind: 'jobs', id: 'beta' } }), { status: 'error', summary: 'New scope source unavailable.', observations: [] });
  const current = store.getMonitoring().status;
  assert.notEqual(current.lastCheckAt, null); assert.equal(current.lastSuccessAt, null);
  assert.equal(current.needsYouCount, 1); assert.equal(current.latestSummary, 'New scope source unavailable.');
});

test('monitoring scope snapshots use list filters and selection intersections including completed companies', async t => {
  const { store } = await fixture(t);
  store.addCompanies('selected', [
    { id: 'alpha', name: 'Alpha', type: 'Private company', location: 'Dubai' },
    { id: 'beta', name: 'Beta', type: 'Federal government entity', location: 'Abu Dhabi' },
    { id: 'gamma', name: 'Gamma', type: 'Private company', location: 'Dubai' },
  ]);
  const run = store.startRun({ directoryId: 'selected', companyIds: ['alpha'], explicit: true, mode: 'send_and_submit' });
  store.logApplication({ companyId: 'alpha', runId: run.id, status: 'applied', role: 'Synthetic role', evidence: 'Synthetic receipt' });
  store.updateRun(run.id, { status: 'completed' });
  store.updateCompany('beta', { status: 'closed' });
  store.logApplication({ companyId: 'gamma', status: 'needs_user', method: 'form', notes: 'Synthetic user handoff.' });
  store.updateCompany('gamma', { followUpAt: '2026-11-13' });
  const before = { companies: store.exportCompanies(), applications: store.listApplications(), runs: store.listRuns(), monitoring: store.getMonitoring(), events: store.listActivity() };
  for (const filters of [{}, { search: 'ALPHA' }, { status: 'applied' }, { attention: 'needs_you' }, { attention: 'follow_up_due' }, { companyTypes: ['private'] }, { locations: ['location:dubai'] }, { search: 'alpha', companyTypes: ['private'], locations: ['location:dubai'] }]) {
    const input = { directoryId: 'selected', ...filters }, expected = store.listCompanies(input).items.map(company => company.id);
    const result = store.snapshotMonitoringScope(input);
    assert.deepEqual(result.scope, { directoryIds: ['selected'], companyIds: expected, calendarIds: [] });
    assert.equal(result.count, expected.length); assert.equal(result.directoryName, 'Selected'); assert.match(result.summary, /Selected/);
  }
  assert.deepEqual(store.snapshotMonitoringScope({ directoryId: 'selected', companyIds: ['gamma', 'alpha', 'alpha', 'beta'], search: 'alpha' }).scope.companyIds, ['alpha']);
  assert.equal(store.snapshotMonitoringScope({ directoryId: 'selected' }).count, 3);
  assert.equal(store.listCompanies({ directoryId: 'selected' }).remainingCount, 1, 'monitoring includes submitted and completed companies beyond Run remaining scope');
  for (const input of [{ companyIds: [] }, { companyIds: ['foreign'] }, { companyIds: ['missing'] }, { companyIds: ['alpha'], search: 'beta' }, { locations: ['location:unavailable'] }, { companyTypes: ['invalid'] }, { status: 'invalid' }, { attention: 'invalid' }, { search: 12 }, { companyIds: 'alpha' }]) assert.throws(() => store.snapshotMonitoringScope({ directoryId: 'selected', ...input }));
  assert.throws(() => store.snapshotMonitoringScope({}), /active directory/);
  assert.throws(() => store.snapshotMonitoringScope({ directoryId: 'selected', limit: 1 }), /only the current directory/);
  assert.deepEqual({ companies: store.exportCompanies(), applications: store.listApplications(), runs: store.listRuns(), monitoring: store.getMonitoring(), events: store.listActivity() }, before, 'snapshot is a read operation without monitoring or Run authority');
});

test('monitoring scope snapshots contain only IDs for every matching company beyond list page limits', async t => {
  const { store } = await fixture(t);
  store.createDirectory({ id: 'large', name: 'Large synthetic scope' });
  store.addCompanies('large', Array.from({ length: 5107 }, (_, index) => ({ id: `large-${index}`, name: `Company ${index}`, notes: 'Synthetic original source payload must not enter the snapshot.' })));
  const snapshot = store.snapshotMonitoringScope({ directoryId: 'large' });
  assert.equal(snapshot.count, 5107); assert.equal(snapshot.scope.companyIds.length, 5107);
  assert.equal(new Set(snapshot.scope.companyIds).size, 5107);
  assert.equal(snapshot.scope.companyIds[0], 'large-0'); assert.equal(snapshot.scope.companyIds.at(-1), 'large-5106');
  assert.deepEqual(Object.keys(snapshot).sort(), ['count', 'directoryName', 'scope', 'summary']);
  assert.ok(!JSON.stringify(snapshot).includes('original source payload'));
  const other = store.createDirectory({ id: 'archive', name: 'Archive' });
  store.updateDirectory(other.id, { archived: true });
  assert.throws(() => store.snapshotMonitoringScope({ directoryId: other.id }), /active directory/);
});

test('the domain validates client-reported browser source evidence and never saves its HTML cursor', async t => {
  const { store } = await fixture(t); enable(store);
  const lease = begin(store), key = { id: lease.check.id, token: lease.token };
  const proof = { method: 'native_browser', url: 'https://example.test/alpha/careers#roles', observedAt: lease.check.startedAt, evidence: 'Injected browser source fixture: current roles were visible on the saved careers page.' };
  assert.throws(() => store.finishMonitoringCheck({ ...key, status: 'checked', complete: true, sourceRead: { ...proof, url: 'https://unrelated.example.com/jobs' } }), /exact saved source/);
  assert.throws(() => store.finishMonitoringCheck({ ...key, status: 'checked', sourceRead: proof }), /complete:true/);
  const result = store.finishMonitoringCheck({ ...key, status: 'checked', complete: true, cursor: 'must-not-cache-browser-html', sourceRead: proof, observations: [] });
  assert.equal(result.check.cursor, null); assert.equal(result.check.sourceRead.clientReported, true);
  assert.equal(result.check.sourceRead.url, 'https://example.test/alpha/careers');
  const next = begin(store); assert.equal(next.check.cursor, null);
});
