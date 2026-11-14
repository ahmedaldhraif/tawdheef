import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openStore } from '../server/store.mjs';
import { createNativeClient } from '../server/native-client.mjs';

async function fixture(t, count = 3) {
  const prefix = join(tmpdir(), 'tawdheef-native-client-'), dataDir = await mkdtemp(prefix);
  let date = new Date('2026-11-14T08:00:00Z'); const clock = () => date;
  const store = openStore({ dataDir, seed: false, clock });
  store.createDirectory({ id: 'fixture', name: 'Fixture' });
  const ids = store.addCompanies('fixture', Array.from({ length: count }, (_, index) => ({ id: `company-${index}`, name: `Company ${index}`, email: 'careers@example.test', careersUrl: `https://careers.example.com/${index}` }))).ids;
  const client = createNativeClient({ store });
  t.after(async () => { store.close(); assert.ok(resolve(dataDir).startsWith(resolve(prefix))); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); });
  const start = patch => store.startNativeRun({ directoryId: 'fixture', assistant: 'codex', explicit: true, mode: 'send_and_submit', ...patch });
  const report = (kind, patch = {}) => store.reportNativeConnection({ assistant: 'codex', kind, status: 'available', provider: kind === 'email' ? 'gmail' : kind === 'calendar' ? 'google-calendar' : 'native-client', observedAt: clock().toISOString(), ...(['email', 'calendar'].includes(kind) ? { accountEmail: 'person@example.test' } : {}), ...patch });
  const claim = runId => store.claimNativeTarget({ runId, assistant: 'codex' });
  const identity = lease => ({ runId: lease.run.id, companyId: lease.target.companyId, assistant: 'codex', claimToken: lease.claimToken });
  return { store, client, ids, dataDir, clock, start, report, claim, identity, advance: ms => { date = new Date(+date + ms); } };
}

test('native capability reports are dated metadata only, preserve client ownership and derive primary email only from mail', async t => {
  const { store, report, advance, clock } = await fixture(t);
  assert.equal(store.getSettings().connectionMode, 'native');
  const initial = store.getNativeClientStatus(); assert.equal(initial.capabilities.email.status, 'unknown'); assert.equal(initial.primaryEmail, null);
  report('cv', { provider: 'tabbio', cv: { id: 'actual-cv-id', url: 'https://tabbio.com/cv/fixture', updatedAt: clock().toISOString(), primaryEmail: 'cv-only@example.test' } });
  assert.equal(store.getNativeClientStatus().primaryEmail, null);
  report('email'); const state = store.getNativeClientStatus();
  assert.equal(state.primaryEmail, 'person@example.test'); assert.equal(state.capabilities.email.status, 'reported');
  assert.match(state.capabilities.email.accountId, /^sha256:/); assert.equal(state.independentlyVerified, false);
  assert.equal(store.getNativeClientStatus({ assistant: 'claude-code' }).capabilities.email.status, 'unknown');
  for (const extra of [{ password: 'secret' }, { cv: { text: 'Raw private CV' } }, { accessToken: 'secret' }]) assert.throws(() => report('cv', extra));
  assert.throws(() => report('email', { evidence: 'password=secret' }));
  report('browser', { status: 'needs_you', nextStep: 'Open the browser tool in Codex and approve its requested site access.' });
  assert.equal(store.getNativeClientStatus().capabilities.browser.nextStep, 'Open the browser tool in Codex and approve its requested site access.');
  assert.throws(() => report('browser', { status: 'needs_you', nextStep: 'x'.repeat(1001) }));
  assert.throws(() => report('browser', { status: 'unknown', nextStep: 'access_token=must-not-save' }));
  store.touchNativeClient({ assistant: 'codex', tool: 'get_agent_context' });
  assert.equal(store.getNativeClientStatus().capabilities.assistant.localToolUseObserved, true);
  assert.equal(store.getNativeClientStatus().capabilities.assistant.clientReported, false);
  advance(24 * 60 * 60_000 + 1);
  assert.equal(store.getNativeClientStatus().capabilities.email.status, 'unknown'); assert.equal(store.getNativeClientStatus().primaryEmail, null);
});

test('native Run needs explicit authority but no CLI/model connection and exposes only compact paged targets', async t => {
  const { store, client, start, claim, identity } = await fixture(t, 125);
  assert.throws(() => start({ explicit: false }));
  assert.throws(() => start({ companyIds: [] }), /No unfinished/);
  const result = client.start({ directoryId: 'fixture', assistant: 'codex', explicit: true, mode: 'send_and_submit', actions: { applyMatchingJobs: false, createProfiles: true, sendCvEmails: false } });
  assert.equal(result.run.total, 125); assert.equal(result.run.mode, 'send_and_submit'); assert.equal(result.run.executionOwner, 'native-client');
  assert.equal(result.run.native, true); assert.equal(Object.hasOwn(result.run, 'companyIds'), false); assert.equal(Object.hasOwn(result.run, 'targets'), false);
  assert.match(result.handoff.prompt, /own authorized tools/); assert.ok(JSON.stringify(result).length < 5000);
  const first = store.listNativeTargets({ runId: result.run.id }); assert.equal(first.total, 125); assert.equal(first.items.length, 20);
  const lease = claim(result.run.id), key = identity(lease);
  assert.equal(store.runSummaries()[0].currentName, lease.target.name);
  assert.equal(claim(result.run.id).reused, true); assert.equal(claim(result.run.id).claimToken, null);
  assert.throws(() => store.getNativeClaim({ ...key, claimToken: 'wrong' }), /token/);
  assert.throws(() => store.checkSubmission({ runId: result.run.id, companyId: 'company-1', purpose: 'profile' }), /explicit run/);
  assert.throws(() => store.prepareFormSubmission({ runId: result.run.id, companyId: lease.target.companyId, purpose: 'application', role: 'Role', url: 'https://careers.example.com/form' }), /does not allow job applications/i);
  assert.throws(() => store.finishNativeTarget({ ...key, status: 'applied' }), /receipt/);
  const done = store.finishNativeTarget({ ...key, status: 'checked', reason: 'Profile route checked; no account was created.' });
  assert.equal(done.run.completed, 1); assert.equal(done.run.targetCounts.checked, 1); assert.equal(done.run.outcomes.applicationsSent, 0);
  assert.throws(() => store.finishNativeTarget({ ...key, status: 'checked' }), /expired|stopped/);
  assert.throws(() => start(), /Stop the current/);
});

test('Stop, expiry, app-owner restart recovery and mode changes revoke native authority without resuming work', async t => {
  const { store, start, claim, identity, dataDir, advance, clock } = await fixture(t);
  let run = start().run, lease = claim(run.id);
  assert.throws(() => store.updateSettings({ connectionMode: 'local-adapters' }), /Stop the active Run/);
  const reader = openStore({ dataDir, seed: false, clock });
  try { assert.equal(reader.getNativeRun({ runId: run.id }).status, 'running', 'ordinary MCP opens cannot cancel another native worker'); }
  finally { reader.close(); }
  store.stopNativeRun({ runId: run.id });
  assert.throws(() => store.getNativeClaim(identity(lease)), /stopped/);
  run = start().run; lease = claim(run.id); advance(3600_001);
  assert.throws(() => store.finishNativeTarget({ ...identity(lease), status: 'checked' }), /expired/);
  assert.equal(store.recoverNativeRuns().cancelled, 1);
  run = start().run; claim(run.id); assert.equal(store.recoverNativeRuns().cancelled, 1);
  assert.equal(store.getNativeRun({ runId: run.id }).status, 'cancelled');
  store.updateSettings({ connectionMode: 'local-adapters' }); assert.throws(() => start(), /native connection mode/);
});

test('native email reserves one exact send plan, preserves unknown intents and accepts only original-account late receipts', async t => {
  const { store, start, report, claim, identity, clock } = await fixture(t);
  report('email'); const run = start().run, lease = claim(run.id), key = identity(lease);
  const input = { ...key, role: 'Engineer', to: 'careers@example.test', subject: 'Application', body: 'Actual client-composed application text.', attachments: [{ name: 'CV.pdf', source: 'native_cv', reference: 'actual-tabbio-cv-id' }] };
  const prepared = store.prepareNativeEmail(input);
  assert.equal(prepared.maySend, true); assert.equal(prepared.application.deliveryStatus, 'sending'); assert.equal(prepared.sendPlan.attachments[0].reference, 'actual-tabbio-cv-id');
  const repeat = store.prepareNativeEmail({ ...input, subject: 'Changed subject', body: 'Changed body.' });
  assert.equal(repeat.reused, true); assert.equal(repeat.maySend, false); assert.equal(repeat.sendPlan.subject, 'Application');
  store.resolveNativeEmail({ assistant: 'codex', id: prepared.application.id, outcome: 'unknown' });
  assert.throws(() => store.logApplication({ id: prepared.application.id, companyId: key.companyId, status: 'applied', evidence: { receipt: 'Cannot bypass original mailbox identity' } }), /native email receipt identity/);
  assert.throws(() => store.logApplication({ id: prepared.application.id, companyId: key.companyId, status: 'prepared', threadId: 'rewritten-thread' }), /native email receipt identity/);
  assert.throws(() => store.prepareNativeEmail({ ...input, role: 'Different role' }), /unresolved send/);
  store.stopNativeRun({ runId: run.id });
  const receipt = { providerMessageId: 'actual-client-receipt', threadId: 'actual-thread', provider: prepared.sendPlan.provider, accountId: prepared.sendPlan.accountId, accountEmail: 'person@example.test', to: input.to, subject: input.subject, sentAt: clock().toISOString() };
  assert.throws(() => store.resolveNativeEmail({ assistant: 'claude-code', id: prepared.application.id, outcome: 'confirmed', receipt }), /original native assistant/);
  assert.throws(() => store.resolveNativeEmail({ assistant: 'codex', id: prepared.application.id, outcome: 'confirmed', receipt: { ...receipt, accountId: 'other-account' } }), /original provider/);
  const resolved = store.resolveNativeEmail({ assistant: 'codex', id: prepared.application.id, outcome: 'confirmed', receipt });
  assert.equal(resolved.application.status, 'applied'); assert.equal(resolved.application.evidence.clientReported, true);
  assert.equal(resolved.application.runId, run.id); assert.deepEqual(resolved.application.nativePlan, prepared.sendPlan);
  assert.equal(store.getNativeRun({ runId: run.id }).outcomes.applicationsSent, 1); assert.equal(store.getNativeRun({ runId: run.id }).outcomes.emailsSent, 1);
  assert.equal(store.runSummaries()[0].appliedCount, 1, 'reload summaries count saved native receipts rather than a legacy target array');
});

test('CV-only email and profile outcomes stay distinct from job applications and verified non-delivery needs explicit evidence', async t => {
  const { store, start, report, claim, identity, clock } = await fixture(t);
  report('email');
  const run = start({ actions: { applyMatchingJobs: false, createProfiles: true, sendCvEmails: true } }).run, lease = claim(run.id), key = identity(lease);
  const input = { ...key, purpose: 'cv_share', to: 'careers@example.test', subject: 'Future opportunities', body: 'Actual authorized CV link supplied by the native client.' };
  const plan = store.prepareNativeEmail(input);
  assert.throws(() => store.resolveNativeEmail({ assistant: 'codex', id: plan.application.id, outcome: 'not_sent', evidence: 'Inspected Sent and verified no message.' }), /explicitly/);
  const done = store.resolveNativeEmail({ assistant: 'codex', id: plan.application.id, outcome: 'confirmed', receipt: { providerMessageId: 'cv-receipt', provider: plan.sendPlan.provider, accountId: plan.sendPlan.accountId, sentAt: clock().toISOString() } });
  assert.equal(done.application.status, 'cv_sent'); assert.equal(done.application.appliedAt, undefined);
  store.logApplication({ companyId: key.companyId, runId: run.id, status: 'profile_created', method: 'form', url: 'https://careers.example.com/profile', evidence: 'Actual client-reported profile confirmation' });
  const finished = store.finishNativeTarget({ ...key, status: 'checked' });
  assert.deepEqual(finished.run.outcomes, { applicationsSent: 0, careerProfiles: 1, emailsSent: 1 });
});

test('native monitoring returns precise client read requests and requires fresh client evidence without external app reads', async t => {
  const { store, client, report, clock } = await fixture(t);
  report('calendar', { calendarIds: ['selected-calendar'] });
  store.configureMonitoring({ expectedRevision: 1, explicit: true, patch: { enabled: true, channels: { jobs: true, calendar: true }, scope: { directoryIds: ['fixture'], calendarIds: ['selected-calendar'] } } });
  const input = source => ({ assistant: 'codex', configurationRevision: store.getMonitoring().config.revision, source });
  const web = client.check(input({ kind: 'jobs', id: 'company-0' }));
  assert.equal(web.readRequest.url, 'https://careers.example.com/0'); assert.equal(web.readRequest.readOnly, true); assert.equal(web.readRequest.executionOwner, 'native-client');
  const partial = client.record({ id: web.check.id, token: web.check.token, status: 'checked', complete: true, observations: [] });
  assert.equal(partial.check.status, 'partial'); assert.equal(partial.check.cursor, null);
  const calendar = client.check(input({ kind: 'calendar', id: 'selected-calendar' }));
  assert.equal(calendar.readRequest.limit, 100); assert.equal(Date.parse(calendar.readRequest.timeMax) - Date.parse(calendar.readRequest.timeMin), 14 * 86400000);
  const sourceRead = { method: 'native_calendar', sourceId: 'selected-calendar', provider: calendar.check.provider, accountId: calendar.check.accountId, observedAt: clock().toISOString(), evidence: 'Actual client calendar tool returned this selected calendar and bounded time window.' };
  const result = client.record({ id: calendar.check.id, token: calendar.check.token, status: 'checked', complete: true, sourceRead, observations: [{ externalId: 'event-1', title: 'Interview', data: { calendarId: 'selected-calendar', start: '2026-11-15T08:00:00Z', end: '2026-11-15T09:00:00Z' }, evidence: { eventId: 'event-1' } }] });
  assert.equal(result.check.status, 'checked'); assert.equal(result.check.cursor, null); assert.equal(result.check.sourceRead.clientReported, true);
  assert.equal(store.getCompany('company-0').status, 'not_started'); assert.equal(store.listRuns().length, 0);
});

test('native monitoring rejects account switches, out-of-scope messages and schedule sending authority', async t => {
  const { store, start, claim, identity, report, clock } = await fixture(t);
  report('email'); const run = start().run, lease = claim(run.id);
  const mail = store.prepareNativeEmail({ ...identity(lease), role: 'Engineer', to: 'careers@example.test', subject: 'Application', body: 'Authorized client-owned message.' });
  store.resolveNativeEmail({ assistant: 'codex', id: mail.application.id, outcome: 'confirmed', receipt: { providerMessageId: 'receipt', threadId: 'tracked-thread', provider: mail.sendPlan.provider, accountId: mail.sendPlan.accountId, sentAt: clock().toISOString() } });
  store.finishNativeTarget({ ...identity(lease), status: 'applied' }); store.stopNativeRun({ runId: run.id });
  store.configureMonitoring({ expectedRevision: 1, explicit: true, patch: { enabled: true, channels: { email: true }, scope: { directoryIds: ['fixture'] } } });
  const input = { assistant: 'codex', configurationRevision: store.getMonitoring().config.revision, source: { kind: 'email', id: mail.application.id } };
  const read = store.beginNativeMonitoringCheck(input);
  assert.equal(read.readRequest.threadId, 'tracked-thread'); assert.equal(read.readRequest.trackedThreadOnly, true);
  const proof = { method: 'native_email', sourceId: mail.application.id, provider: read.check.provider, accountId: read.check.accountId, observedAt: clock().toISOString(), evidence: 'Native client read the original tracked thread only.' };
  assert.throws(() => store.recordNativeMonitoringCheck({ id: read.check.id, token: read.check.token, status: 'checked', complete: true, sourceRead: proof, observations: [{ externalId: 'wrong-message', title: 'Reply', data: { threadId: 'unrelated-thread' } }] }), /exact tracked thread/);
  report('email', { accountEmail: 'changed@example.test' });
  const changed = store.recordNativeMonitoringCheck({ id: read.check.id, token: read.check.token, status: 'checked', complete: true, sourceRead: proof, observations: [] });
  assert.equal(changed.check.status, 'unknown'); assert.equal(store.listMonitoringUpdates().total, 0);
  assert.throws(() => store.checkSubmission({ companyId: 'company-0', runId: run.id }), /explicit run/);
});

test('native calendar reads require the actual selected ID in the fresh client report', async t => {
  const { store, report } = await fixture(t); report('calendar');
  store.configureMonitoring({ expectedRevision: 1, explicit: true, patch: { enabled: true, channels: { calendar: true }, scope: { calendarIds: ['selected-calendar'] } } });
  const input = { assistant: 'codex', configurationRevision: store.getMonitoring().config.revision, source: { kind: 'calendar', id: 'selected-calendar' } };
  const missing = store.beginNativeMonitoringCheck(input);
  assert.equal(missing.status, 'needs_you'); assert.equal(missing.readRequest, null);
  report('calendar', { calendarIds: [] }); assert.equal(store.beginNativeMonitoringCheck(input).readRequest, null);
  report('calendar', { calendarIds: ['different-calendar'] }); assert.equal(store.beginNativeMonitoringCheck(input).readRequest, null);
  report('calendar', { calendarIds: ['selected-calendar'] });
  assert.equal(store.beginNativeMonitoringCheck(input).readRequest.calendarId, 'selected-calendar');
});
