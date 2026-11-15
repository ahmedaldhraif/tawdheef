import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openStore } from '../server/store.mjs';
import { createMcpServer } from '../server/mcp.mjs';

const cvSourceId = 'synthetic-main-cv';
const cvVersionHash = 'a'.repeat(64);
const selectedActions = { applyMatchingJobs: true, createProfiles: true, sendCvEmails: false };

async function fixture(t) {
  const prefix = join(tmpdir(), 'tawdheef-native-workflow-');
  const dataDir = await mkdtemp(prefix);
  let date = new Date('2026-11-15T08:00:00Z');
  const clock = () => date;
  const store = openStore({ dataDir, seed: false, clock });
  store.createDirectory({ id: 'fixture', name: 'Synthetic government directory' });
  store.addCompanies('fixture', [
    { id: 'alpha', name: 'Alpha Ministry', type: 'Federal government entity', careersUrl: 'https://careers.example.com/jobs' },
    { id: 'beta', name: 'Beta Private', type: 'Private company', careersUrl: 'https://private.example.com/careers' },
  ]);
  store.updateSettings({ applicationEmail: 'intended@example.test' });
  const report = (kind, patch = {}) => store.reportNativeConnection({ assistant: 'codex', kind, status: 'available', observedAt: clock().toISOString(), provider: kind === 'cv' ? 'tabbio' : kind === 'email' ? 'gmail' : 'native-client', accessMethod: 'browser', ...patch });
  const uploadFile = patch => ({ name: 'Synthetic original.pdf', mimeType: 'application/pdf', sizeBytes: 1200, sha256: 'f'.repeat(64), reference: 'native-file:synthetic-original', cvSourceId, cvVersionHash, ...patch });
  function ready() {
    store.touchNativeClient({ assistant: 'codex', tool: 'get_agent_context' });
    report('email', { accountEmail: 'intended@example.test' });
    report('browser');
    report('cv', { cv: { id: cvSourceId, versionHash: cvVersionHash, uploadFile: uploadFile() } });
  }
  const start = (patch = {}) => store.startNativeRun({ directoryId: 'fixture', assistant: 'codex', explicit: true, mode: 'send_and_submit', companyIds: ['alpha'], companyTypes: ['federal_government'], actions: selectedActions, ...patch });
  const claim = runId => store.claimNativeTarget({ runId, assistant: 'codex' });
  const key = lease => ({ runId: lease.run.id, companyId: lease.target.companyId, assistant: 'codex', claimToken: lease.claimToken });
  t.after(async () => { store.close(); assert.ok(resolve(dataDir).startsWith(resolve(prefix))); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); });
  return { store, report, ready, start, claim, key, clock, uploadFile, advance: ms => { date = new Date(+date + ms); } };
}

test('one Native preflight supports CV-cited matching, an application receipt and an independent completed profile', async t => {
  const { store, ready, start, claim, key, clock } = await fixture(t);
  ready();
  const readiness = await store.getNativeReadiness({ assistant: 'codex', actions: selectedActions });
  assert.equal(readiness.ready, true);
  assert.equal(readiness.clientReported, true);
  assert.equal(readiness.independentlyVerified, false);
  assert.equal(store.getNativeClientStatus({ assistant: 'codex' }).capabilities.passwordManager.status, 'unknown', 'routine readiness must not require an unverified password manager');
  assert.equal(store.getNativeClientStatus({ assistant: 'codex' }).capabilities.calendar.status, 'unknown', 'job work must not require a calendar connection');

  const lease = store.prepareJobDiscovery({ assistant: 'codex', companyId: 'alpha' });
  store.recordJobDiscovery({ id: lease.id, token: lease.token, assistant: 'codex', complete: true,
    sourceRead: { method: 'native_browser', url: lease.readRequest.url, observedAt: clock().toISOString(), evidence: 'Synthetic full public vacancy page inspected.' },
    observations: [{ title: 'HR Officer', url: 'https://careers.example.com/jobs/hr-officer', description: 'Bachelor degree in Human Resources required.', evidence: 'Synthetic exact complete vacancy.', contentComplete: true, status: 'open' }] });
  const job = store.listDiscoveredJobs({ assistant: 'codex', companyIds: ['alpha'] }).items[0];
  const matched = store.recordJobMatch({ assistant: 'codex', jobId: job.id, expectedContentHash: job.contentHash,
    expectedPreferencesRevision: store.getDiscoveryPreferences().revision,
    cvReference: { sourceId: cvSourceId, versionHash: cvVersionHash }, decision: 'suitable',
    requirements: [{ kind: 'required', jobQuote: 'Bachelor degree in Human Resources required.', relation: 'supports', cvFactRef: 'education:synthetic-degree:field' }],
    reason: 'The actual client cites the exact requirement and the source-bound synthetic CV fact.' });
  assert.equal(matched.matchState, 'current');

  const run = start().run, owned = claim(run.id), active = key(owned);
  store.recordNativeCheckpoint({ ...active, expectedRevision: 0, stage: 'application', status: 'working', nextStep: 'Submit the matched HR Officer application once.', url: job.url });
  const application = store.prepareFormSubmission({ runId: run.id, companyId: 'alpha', purpose: 'application', role: 'HR Officer', url: job.url }).application;
  assert.equal(store.getNativeRun({ runId: run.id }).outcomes.applicationsSent, 0, 'a reserved form is never a confirmed submission');
  store.resolveFormSubmission({ id: application.id, outcome: 'confirmed', evidence: 'Synthetic employer confirmation APP-1001 inspected.' });

  store.recordNativeCheckpoint({ ...active, expectedRevision: 1, stage: 'profile', status: 'working', nextStep: 'Complete the separately selected career profile.', url: 'https://careers.example.com/account/profile', accountEmail: 'intended@example.test' });
  const profile = store.prepareFormSubmission({ runId: run.id, companyId: 'alpha', purpose: 'profile', role: 'Career profile', url: 'https://careers.example.com/account/profile' }).application;
  store.resolveFormSubmission({ id: profile.id, outcome: 'confirmed', evidence: 'Synthetic profile confirmation PROFILE-2001 inspected.' });
  store.recordNativeCheckpoint({ ...active, expectedRevision: 2, stage: 'complete', status: 'working', nextStep: 'Both selected outcomes have confirmation evidence.' });
  const finished = store.finishNativeTarget({ ...active, status: 'applied', reason: 'Matched job submitted and independent career profile completed with separate receipts.' });
  assert.equal(finished.run.status, 'completed');
  assert.equal(finished.run.outcomes.applicationsSent, 1);
  assert.equal(finished.run.outcomes.careerProfiles, 1);
  assert.equal(finished.run.outcomes.emailsSent, 0);
  assert.equal(store.getCompany('alpha').progress.applied, 1);
  assert.equal(store.getCompany('alpha').progress.profile_created, 1);
  assert.equal(store.listApplications('beta').length, 0, 'the private employer never enters the government-only run');
});

test('intended mailbox, CV facts and original-file metadata remain separate and invalidate when source context changes', async t => {
  const { store, ready, report, uploadFile, advance } = await fixture(t);
  ready();
  report('browser', { status: 'unknown' });
  report('computer', { accessMethod: 'computer' });
  assert.equal((await store.getNativeReadiness({ assistant: 'codex', actions: selectedActions })).ready, true, 'reported computer access can supply the permitted browser workflow without a second browser connection');
  report('email', { accountEmail: 'wrong-account@example.test' });
  let readiness = await store.getNativeReadiness({ assistant: 'codex', actions: selectedActions });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.intendedEmail, 'intended@example.test');
  assert.equal(readiness.observedEmail, 'wrong-account@example.test');
  assert.match(JSON.stringify(readiness.nextStep), /mail|account/i);
  report('email', { accountEmail: 'intended@example.test' });
  assert.throws(() => report('cv', { cv: { id: cvSourceId, versionHash: 'b'.repeat(64), uploadFile: uploadFile() } }), /CV|source|version|file/i);
  report('cv', { cv: { id: cvSourceId, versionHash: 'b'.repeat(64) } });
  readiness = await store.getNativeReadiness({ assistant: 'codex', actions: selectedActions });
  const fileCheck = readiness.checks.find(check => /upload|file/i.test(check.id));
  assert.notEqual(fileCheck?.status, 'ready', 'a file for an older CV must not remain upload-ready');
  assert.throws(() => report('cv', { cv: { id: cvSourceId, uploadFile: uploadFile() } }), /CV|source|version|file/i);
  report('cv', { cv: { id: cvSourceId } });
  readiness = await store.getNativeReadiness({ assistant: 'codex', actions: selectedActions });
  assert.equal(readiness.ready, false, 'upload metadata alone never supplies readable current CV facts');
  advance(24 * 60 * 60_000 + 1);
  readiness = await store.getNativeReadiness({ assistant: 'codex', actions: selectedActions });
  assert.equal(readiness.ready, false, 'expired native observations need an actual-client refresh');
});

test('temporary signed download URLs are not retained as Native upload references', async t => {
  const { report, uploadFile } = await fixture(t);
  for (const reference of ['https://files.example.com/cv.pdf?X-Amz-Signature=private-signature', 'https://files.example.com/cv.pdf?X-Goog-Signature=private-signature', 'https://files.example.com/cv.pdf?sig=private-sas-signature']) {
    assert.throws(() => report('cv', { cv: { id: cvSourceId, versionHash: cvVersionHash, uploadFile: uploadFile({ reference }) } }), /clean|secret|authentication|signature|parameters/i);
  }
});

test('a blocked account resumes in a fresh narrowly scoped Run and preserves its original uncertain intent', async t => {
  const { store, ready, start, claim, key } = await fixture(t);
  ready();
  const actions = { applyMatchingJobs: false, createProfiles: true, sendCvEmails: false };
  const original = start({ actions }).run, first = claim(original.id), active = key(first);
  const intent = store.prepareFormSubmission({ runId: original.id, companyId: 'alpha', purpose: 'account', role: 'Career account', url: 'https://careers.example.com/account/register' }).application;
  store.recordNativeCheckpoint({ ...active, expectedRevision: 0, stage: 'register', status: 'needs_you', reasonCode: 'credential', nextStep: 'Finish the one-time account sign-in in the original browser tab.', url: intent.url, accountEmail: 'intended@example.test', intentId: intent.id });
  assert.throws(() => store.resumeNativeRun({ runId: original.id, companyId: 'alpha', assistant: 'codex', explicit: true }), /current|active|running|finish|stop/i);
  store.finishNativeTarget({ ...active, status: 'needs_you', reason: 'Finish the one-time account sign-in in the original browser tab.' });
  assert.throws(() => store.recordNativeCheckpoint({ ...active, expectedRevision: 1, stage: 'profile', status: 'working', nextStep: 'Cannot use the old claim.' }), /expired|stopped|claim/i);
  assert.throws(() => store.resumeNativeRun({ runId: original.id, companyId: 'alpha', assistant: 'codex', explicit: false }), /explicit/i);
  assert.throws(() => store.resumeNativeRun({ runId: original.id, companyId: 'alpha', assistant: 'claude-code', explicit: true }), /assistant|original|client/i);
  assert.throws(() => store.resumeNativeRun({ runId: original.id, companyId: 'beta', assistant: 'codex', explicit: true }), /target|original|scope|company/i);

  const resumed = store.resumeNativeRun({ runId: original.id, companyId: 'alpha', assistant: 'codex', explicit: true }).run;
  assert.notEqual(resumed.id, original.id);
  assert.equal(resumed.total, 1);
  assert.deepEqual(resumed.actions, actions);
  assert.deepEqual(resumed.filters.companyTypes, ['federal_government']);
  const continued = claim(resumed.id), continuedKey = key(continued);
  assert.equal(continued.target.companyId, 'alpha');
  assert.equal(continued.journey.checkpoint.stage, 'register');
  assert.equal(continued.journey.requiresInspection, true);
  assert.equal(continued.journey.pendingIntents[0].id, intent.id);
  assert.equal(continued.journey.pendingIntents[0].runId, original.id);
  assert.match(JSON.stringify(continued.journey.nextStep), /inspect|confirm|receipt|original/i);
  assert.throws(() => store.prepareFormSubmission({ runId: resumed.id, companyId: 'alpha', purpose: 'profile', role: 'New profile key must not bypass uncertainty', url: 'https://careers.example.com/account/profile' }), /unresolved|uncertain|inspect|pending/i);
  assert.throws(() => store.recordNativeCheckpoint({ ...continuedKey, expectedRevision: 1, stage: 'profile', status: 'working', accountEmail: 'different@example.test', nextStep: 'Do not silently switch an existing account.' }), /account|original|email/i);
  store.stopNativeRun({ runId: resumed.id });
  const persisted = store.getNativeJourney({ companyId: 'alpha', assistant: 'codex' });
  assert.equal(persisted.pendingIntents[0].id, intent.id);
  assert.equal(persisted.checkpoint.accountEmail, 'intended@example.test');
});

test('Resume retains structural scope but does not strand a company whose progress status changed during the original Run', async t => {
  const { store, ready, start, claim, key } = await fixture(t);
  ready();
  const original = start({ status: 'not_started' }).run;
  const active = key(claim(original.id));
  const intent = store.prepareFormSubmission({ runId: original.id, companyId: 'alpha', purpose: 'account', role: 'Career account', url: 'https://careers.example.com/account/register' }).application;
  assert.equal(store.getCompany('alpha').status, 'ready', 'reserving the account legitimately changes progress status');
  store.recordNativeCheckpoint({ ...active, expectedRevision: 0, stage: 'register', status: 'needs_you', reasonCode: 'credential', intentId: intent.id, nextStep: 'Inspect the original registration in the browser before continuing.' });
  store.finishNativeTarget({ ...active, status: 'needs_you', reason: 'Inspect the original registration in the browser before continuing.' });
  const resumed = store.resumeNativeRun({ runId: original.id, companyId: 'alpha', assistant: 'codex', explicit: true }).run;
  assert.equal(resumed.total, 1);
  assert.equal(resumed.resumedFrom, original.id);
  assert.equal(resumed.originalFilters.status, 'not_started');
  assert.equal(resumed.filters.status, '');
  assert.deepEqual(resumed.filters.companyTypes, ['federal_government']);
  assert.equal(claim(resumed.id).target.companyId, 'alpha');
});

test('CV-only email authority cannot be converted into account/profile/application checkpoint authority', async t => {
  const { store, ready, start, claim, key } = await fixture(t);
  ready();
  const active = key(claim(start({ actions: { applyMatchingJobs: false, createProfiles: false, sendCvEmails: true } }).run.id));
  for (const stage of ['sign_in', 'register', 'profile', 'cv_upload', 'application']) assert.throws(() => store.recordNativeCheckpoint({ ...active, expectedRevision: 0, stage, status: 'working', nextStep: 'A checkpoint cannot expand the selected actions.' }), /allow|profile|application/i);
});

test('a stopped or resumed uncertain form displays inspection instead of its stale Submit checkpoint', async t => {
  const { store, ready, start, claim, key } = await fixture(t);
  ready();
  const original = start().run, active = key(claim(original.id));
  store.recordNativeCheckpoint({ ...active, expectedRevision: 0, stage: 'application', status: 'working', nextStep: 'Submit the original matched application once.', url: 'https://careers.example.com/jobs/one' });
  const intent = store.prepareFormSubmission({ runId: original.id, companyId: 'alpha', purpose: 'application', role: 'HR Officer', url: 'https://careers.example.com/jobs/one' }).application;
  assert.equal(Boolean(store.listNativeTargets({ runId: original.id }).items[0].requiresInspection), false, 'the first reservation still permits its original once-only submission');
  store.stopNativeRun({ runId: original.id });
  const stoppedTarget = store.listNativeTargets({ runId: original.id }).items[0];
  assert.equal(stoppedTarget.requiresInspection, true);
  assert.match(stoppedTarget.nextStep, /inspect.*original|original.*inspect/i);
  assert.notEqual(stoppedTarget.nextStep, stoppedTarget.checkpoint.nextStep);
  const resumed = store.resumeNativeRun({ runId: original.id, companyId: 'alpha', assistant: 'codex', explicit: true }).run;
  const next = claim(resumed.id);
  assert.equal(next.journey.pendingIntents[0].id, intent.id);
  assert.equal(store.listNativeTargets({ runId: resumed.id }).items[0].requiresInspection, true);
  assert.equal(store.getNativeRun({ runId: resumed.id }).currentCheckpoint.requiresInspection, true);
  assert.match(store.getNativeRun({ runId: resumed.id }).currentCheckpoint.nextStep, /inspect.*original|original.*inspect/i);
});

test('single-target Resume still applies original structural search and location constraints', async t => {
  for (const kind of ['search', 'location']) await t.test(kind, async child => {
    const { store, ready, start, claim, key } = await fixture(child);
    ready();
    store.updateCompany('alpha', { location: 'Abu Dhabi' });
    const location = store.previewRun({ directoryId: 'fixture' }).locations.find(item => item.label === 'Abu Dhabi');
    assert.ok(location);
    const original = start(kind === 'search' ? { search: 'Alpha Ministry' } : { locations: [location.id] }).run;
    const active = key(claim(original.id));
    store.recordNativeCheckpoint({ ...active, expectedRevision: 0, stage: 'sign_in', status: 'needs_you', reasonCode: 'sign_in', nextStep: 'Sign in to the original career account.' });
    store.finishNativeTarget({ ...active, status: 'needs_you', reason: 'Sign in to the original career account.' });
    store.updateCompany('alpha', kind === 'search' ? { name: 'Renamed Agency' } : { location: 'Dubai' });
    assert.throws(() => store.resumeNativeRun({ runId: original.id, companyId: 'alpha', assistant: 'codex', explicit: true }), /unfinished|match|scope/i);
    assert.equal(store.runSummaries().filter(run => run.status === 'running').length, 0);
  });
});

test('checkpoints reject false ownership, generic blockers, credentials and auth-token URLs', async t => {
  const { store, ready, start, claim, key, advance } = await fixture(t);
  ready();
  const run = start().run, active = key(claim(run.id));
  const input = { ...active, expectedRevision: 0, stage: 'sign_in', status: 'needs_you', reasonCode: 'sign_in', nextStep: 'Sign in to the existing account in the original browser tab.', url: 'https://careers.example.com/account/login?job=123&lang=en' };
  assert.throws(() => store.recordNativeCheckpoint({ ...input, assistant: 'claude-code' }), /assistant|client/i);
  assert.throws(() => store.recordNativeCheckpoint({ ...input, claimToken: 'invalid-claim' }), /claim|token/i);
  assert.throws(() => store.recordNativeCheckpoint({ ...input, companyId: 'beta' }), /claim|target|company/i);
  assert.throws(() => store.recordNativeCheckpoint({ ...input, reasonCode: undefined }), /reason|blocker/i);
  assert.throws(() => store.recordNativeCheckpoint({ ...input, nextStep: '' }), /next|step|bounded/i);
  const { expectedRevision: omitted, ...withoutRevision } = input;
  assert.throws(() => store.recordNativeCheckpoint(withoutRevision), /revision|changed|merge/i);
  for (const patch of [
    { nextStep: 'password=must-not-store' },
    { url: 'https://careers.example.com/verify?code=private-verification-code' },
    { url: 'https://careers.example.com/callback?state=private-state' },
    { url: 'https://careers.example.com/#/verify?code=private-verification-code' },
    { url: 'https://careers.example.com/#/verify?state=private-oauth-state' },
    { url: 'https://careers.example.com/account?SAMLResponse=private-saml-assertion' },
    { url: 'https://careers.example.com/account?jwt=private-jwt' },
    { password: 'must-not-store' },
  ]) assert.throws(() => store.recordNativeCheckpoint({ ...input, ...patch }));
  store.recordNativeCheckpoint(input);
  assert.throws(() => store.recordNativeCheckpoint({ ...input, nextStep: 'A stale same-claim retry must not overwrite the new step.' }), /changed|revision|merge/i);
  advance(3600_001);
  assert.throws(() => store.recordNativeCheckpoint({ ...input, status: 'working' }), /expired|stopped/i);
  store.recoverNativeRuns();
  assert.equal(store.getNativeJourney({ companyId: 'alpha', assistant: 'codex' }).checkpoint.stage, 'sign_in');
});

test('ordinary Native MCP exposes the workflow while monitoring cannot checkpoint or resume', async t => {
  const { store, ready, start, claim, key } = await fixture(t);
  const names = ['APPLY_TRACKER_CLIENT', 'APPLY_TRACKER_CONNECTION_MODE', 'APPLY_TRACKER_MONITOR', 'APPLY_TRACKER_MONITOR_ASSISTANT', 'APPLY_TRACKER_PORT'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const clients = [];
  process.env.APPLY_TRACKER_PORT = '65531';
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'http://127.0.0.1:65531', 'the SDK can only reach the isolated local coordinator');
    const body = options.body ? JSON.parse(options.body) : {};
    const response = data => ({ ok: true, status: 200, json: async () => data });
    try {
      if (url.pathname === '/api/health') return response({ app: 'apply-tracker' });
      if (url.pathname === '/api/agent-config') return response({ mcpServers: { 'apply-tracker': { env: { APPLY_TRACKER_DATA: store.dataDir } } } });
      if (url.pathname === '/api/native/readiness') return response(store.getNativeReadiness(body));
      const checkpoint = url.pathname.match(/^\/api\/native\/runs\/([^/]+)\/checkpoint$/);
      if (checkpoint) return response(store.recordNativeCheckpoint({ runId: checkpoint[1], ...body }));
      throw new Error(`Unexpected coordinator path ${url.pathname}`);
    } catch (error) { return { ok: false, status: error.status || 400, json: async () => ({ error: error.message }) }; }
  };
  async function connect(monitor) {
    Object.assign(process.env, { APPLY_TRACKER_CLIENT: 'codex', APPLY_TRACKER_CONNECTION_MODE: 'native' });
    delete process.env.APPLY_TRACKER_MONITOR; delete process.env.APPLY_TRACKER_MONITOR_ASSISTANT;
    if (monitor) Object.assign(process.env, { APPLY_TRACKER_MONITOR: '1', APPLY_TRACKER_MONITOR_ASSISTANT: 'codex' });
    const server = createMcpServer(store), client = new Client({ name: 'native-workflow-integration-fixture', version: '1' });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide); await client.connect(clientSide); clients.push(client); return client;
  }
  t.after(async () => { for (const client of clients) await client.close(); globalThis.fetch = originalFetch; for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } });
  const operator = await connect(false), catalog = (await operator.listTools()).tools;
  for (const name of ['get_native_readiness', 'get_native_journey', 'record_native_checkpoint', 'resume_native_run']) assert.ok(catalog.some(tool => tool.name === name), name);
  assert.equal((await operator.callTool({ name: 'get_native_readiness', arguments: { assistant: 'claude-code' } })).isError, true);
  ready();
  const readyResult = await operator.callTool({ name: 'get_native_readiness', arguments: { actions: selectedActions } });
  assert.ok(!readyResult.isError, readyResult.content?.[0]?.text);
  const active = key(claim(start().run.id));
  const checkpointInput = { ...active, expectedRevision: 0, stage: 'profile', status: 'needs_you', reasonCode: 'missing_fact', nextStep: 'Confirm the one required missing profile fact.' };
  const savedCheckpoint = await operator.callTool({ name: 'record_native_checkpoint', arguments: checkpointInput });
  assert.ok(!savedCheckpoint.isError, savedCheckpoint.content?.[0]?.text);
  store.recoverNativeRuns();
  assert.equal((await operator.callTool({ name: 'record_native_checkpoint', arguments: { ...checkpointInput, expectedRevision: 1, status: 'working' } })).isError, true, 'an actual SDK call must not revive a claim revoked by app restart');
  const journeyResult = await operator.callTool({ name: 'get_native_journey', arguments: { companyId: 'alpha' } });
  assert.ok(!journeyResult.isError);
  assert.equal((journeyResult.structuredContent || JSON.parse(journeyResult.content[0].text)).data.checkpoint.stage, 'profile');
  const monitor = await connect(true), monitorNames = (await monitor.listTools()).tools.map(tool => tool.name);
  for (const name of ['record_native_checkpoint', 'resume_native_run', 'start_native_run']) {
    assert.ok(!monitorNames.includes(name), name);
    assert.equal((await monitor.callTool({ name, arguments: {} })).isError, true);
  }
});
