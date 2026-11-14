import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as sqlite from 'node:sqlite';
import { openStore } from '../server/store.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
test('Native-only HTTP preserves historical adapter data while using client handoffs without external access or another agent', async t => {
  const prefix = join(tmpdir(), 'tawdheef-native-http-'), dataDir = await mkdtemp(prefix);
  // Synthetic older installation: preserve opaque settings, credentials, cache,
  // uncertain intent and saved rule, but never reactivate their old executor.
  const previous = openStore({ dataDir, seed: false });
  previous.createDirectory({ id: 'history', name: 'Historical directory' });
  previous.addCompanies('history', [{ id: 'old-employer', name: 'Old employer', email: 'careers@example.test' }]);
  previous.updateSettings({ language: 'ar', timezone: 'Asia/Dubai', refreshFrequency: 'hourly', reportFrequency: 'weekly' });
  const initialRun = previous.startRun({ directoryId: 'history', explicit: true, mode: 'send_and_submit' });
  const oldRun = previous.updateRun(initialRun.id, { status: 'completed' });
  const oldRule = previous.saveMonitoringRule({ directoryId: 'history', companyIds: ['old-employer'], name: 'Preserved rule', mode: 'notify', enabled: true, explicit: true });
  const intentRun = previous.startRun({ directoryId: 'history', explicit: true, mode: 'send_and_submit' });
  const oldIntent = previous.beginEmailSend({ companyId: 'old-employer', runId: intentRun.id, role: 'Engineer', to: 'careers@example.test', subject: 'Synthetic old plan', body: 'Synthetic old body' }).application;
  previous.updateRun(intentRun.id, { status: 'cancelled' });
  const oldManualRun = previous.startRun({ directoryId: 'history', explicit: true, mode: 'send_and_submit' });
  previous.close();
  const Database = sqlite.Database || sqlite.DatabaseSync, db = new Database(join(dataDir, 'tracker.sqlite'));
  const stored = JSON.parse(db.prepare("SELECT payload FROM settings WHERE id='main'").get().payload);
  stored.connectionMode = 'local-adapters'; stored.privateObsoletePreference = 'preserve';
  const originalSettings = JSON.stringify(stored);
  db.prepare("UPDATE settings SET payload=? WHERE id='main'").run(originalSettings); db.close();
  const privateFiles = { 'connections.json': '{"synthetic":"old-private-credentials"}', 'cv-cache.json': '{"synthetic":"old-private-cache"}' };
  for (const [name, content] of Object.entries(privateFiles)) await writeFile(join(dataDir, name), content);
  const reservation = createServer(); await new Promise(done => reservation.listen(0, '127.0.0.1', done));
  const port = reservation.address().port; await new Promise(done => reservation.close(done));
  const guard = join(dataDir, 'no-external.mjs'), violations = join(dataDir, 'violations.txt');
  await writeFile(guard, `import cp from 'node:child_process'; import http from 'node:http'; import https from 'node:https'; import { appendFileSync } from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
const fail = kind => { appendFileSync(${JSON.stringify(violations)}, kind+'\\n'); throw new Error('Native fixture forbids '+kind); };
for (const key of ['spawn','spawnSync','exec','execSync','execFile','execFileSync']) cp[key] = () => fail('child process');
globalThis.fetch = () => fail('provider fetch');
for (const mod of [http,https]) { mod.request = () => fail('outbound HTTP'); mod.get = () => fail('outbound HTTP'); }
syncBuiltinESMExports();`);
  let output = '';
  const child = spawn(process.execPath, ['--import', pathToFileURL(guard).href, join(root, 'server/index.mjs')], { cwd: root, windowsHide: true,
    env: { ...process.env, APPLY_TRACKER_DATA: dataDir, APPLY_TRACKER_PORT: String(port), APPLY_TRACKER_CONNECTION_MODE: 'local-adapters' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', value => { output += value; }); child.stderr.on('data', value => { output += value; });
  t.after(async () => {
    if (child.exitCode === null) { const exited = new Promise(done => child.once('exit', done)); child.kill('SIGTERM'); await exited; }
    assert.ok(resolve(dataDir).startsWith(resolve(prefix))); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 });
  });
  const api = async (path, method = 'GET', body) => {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }), signal: AbortSignal.timeout(5000) });
    return { status: response.status, data: await response.json() };
  };
  for (let i = 0; i < 80; i++) { try { if ((await api('/health')).status === 200) break; } catch {} if (child.exitCode !== null) throw new Error(output); await new Promise(done => setTimeout(done, 75)); }
  const boot = (await api('/bootstrap')).data;
  assert.equal(boot.settings.connectionMode, 'native'); assert.deepEqual(boot.connections, []);
  assert.equal(boot.settings.language, 'ar'); assert.equal(boot.settings.timezone, 'Asia/Dubai');
  assert.equal(boot.settings.refreshFrequency, 'hourly'); assert.equal(boot.settings.privateObsoletePreference, 'preserve');
  assert.equal((await api(`/runs/${oldRun.id}`)).data.status, 'completed');
  const manualHistory = boot.runs.find(run => run.id === oldManualRun.id);
  assert.equal(manualHistory.status, 'running'); assert.equal(manualHistory.retired, true); assert.equal(manualHistory.runnable, false);
  const preservedRules = await api('/monitoring/rules');
  assert.equal(preservedRules.data[0].id, oldRule.id); assert.equal(preservedRules.data[0].runnable, false);
  assert.equal(preservedRules.data[0].enabled, true, 'saved history is preserved without an executor');
  assert.equal(preservedRules.data[0].retired, true); assert.equal(preservedRules.data[0].nextCheckAt, null);
  const historicalSummary = (await api('/monitoring/summary')).data;
  assert.equal(historicalSummary.enabledCount, 0); assert.equal(historicalSummary.nextCheckAt, null); assert.equal(historicalSummary.retired, true);
  assert.equal((await api('/companies/old-employer')).data.applications.find(item => item.id === oldIntent.id).body, 'Synthetic old body');
  assert.equal(boot.nativeClient.capabilities.email.status, 'unknown'); assert.equal(boot.nativeClient.primaryEmail, null);
  const setup = await api('/setup-status/check', 'POST', { assistant: 'codex', verify: true });
  assert.equal(setup.status, 200); assert.equal(setup.data.ready, false); assert.equal(setup.data.owner, 'selected_ai_client');
  for (const [path, method, body] of [['/assistant-check','POST',{assistant:'codex',explicit:true}], ['/assistant-check','GET'], ['/assistants','GET'], ['/cv/read','POST',{}], ['/cv','GET'], ['/calendar/calendars','GET'], ['/calendar/events','POST',{}], ['/calendar/event','POST',{}], ['/refresh','POST',{}], ['/connections','GET'], ['/connections/email','PUT',{}], ['/connections/email/connect','POST',{}], ['/connections/email/tools','GET'], ['/connections/email/oauth/callback?code=synthetic','GET'], [`/runs/${oldRun.id}/send-email`,'POST',{}], [`/applications/${oldIntent.id}/reconcile-email`,'POST',{}], ['/monitoring/rules','POST',{}], [`/monitoring/rules/${oldRule.id}/status`,'POST',{enabled:true}], [`/monitoring/rules/${oldRule.id}/check`,'POST',{}]]) {
    const blocked = await api(path, method, body); assert.equal(blocked.status, 404, path);
  }
  assert.equal((await api('/settings', 'PATCH', { connectionMode: 'local-adapters' })).status, 400);
  const unchanged = new Database(join(dataDir, 'tracker.sqlite'));
  try { assert.equal(unchanged.prepare("SELECT payload FROM settings WHERE id='main'").get().payload, originalSettings); }
  finally { unchanged.close(); }
  for (const [name, content] of Object.entries(privateFiles)) assert.equal(await readFile(join(dataDir, name), 'utf8'), content);
  const preferenceEdit = await api('/settings', 'PATCH', { language: 'en' });
  assert.equal(preferenceEdit.status, 200); assert.equal(preferenceEdit.data.connectionMode, 'native');
  const edited = new Database(join(dataDir, 'tracker.sqlite'));
  try {
    const raw = JSON.parse(edited.prepare("SELECT payload FROM settings WHERE id='main'").get().payload);
    assert.equal(raw.language, 'en'); assert.equal(raw.connectionMode, 'local-adapters'); assert.equal(raw.privateObsoletePreference, 'preserve');
    assert.equal(edited.prepare('SELECT payload FROM runs WHERE id=?').get(oldRun.id).payload, JSON.stringify(oldRun));
    assert.equal(edited.prepare('SELECT payload FROM runs WHERE id=?').get(oldManualRun.id).payload, JSON.stringify(oldManualRun));
    assert.equal(edited.prepare('SELECT payload FROM monitoring_rules WHERE id=?').get(oldRule.id).payload, JSON.stringify(oldRule));
    assert.equal(edited.prepare('SELECT payload FROM applications WHERE id=?').get(oldIntent.id).payload, JSON.stringify(oldIntent));
  } finally { edited.close(); }
  const request = (await api('/native/connection-request?kind=browser&assistant=codex')).data;
  assert.match(request.prompt, /another browser engine/); assert.equal(request.accountConnected, false);
  await api('/native/client/report', 'POST', { assistant: 'codex', kind: 'email', status: 'available', observedAt: new Date().toISOString(), provider: 'gmail', accountEmail: 'native@example.test' });
  assert.equal((await api('/registration-context')).data.primaryEmail, 'native@example.test');
  const directory = (await api('/directories', 'POST', { name: 'Native HTTP fixture' })).data;
  const added = (await api(`/directories/${directory.id}/companies`, 'POST', { records: [{ name: 'Native employer', careersUrl: 'https://example.org/careers' }, { name: 'Second employer' }] })).data;
  const routeId = added.ids[1], initialRoute = (await api(`/companies/${routeId}`)).data.company;
  assert.equal(initialRoute.profileSupport, 'unknown'); assert.equal(initialRoute.routesCheckedAt, null);
  assert.equal((await api(`/companies/${routeId}`, 'PATCH', { expectedRevision: initialRoute.revision, profileSupport: 'not_offered' })).status, 400);
  const route = await api(`/companies/${routeId}`, 'PATCH', { expectedRevision: initialRoute.revision, profileSupport: 'not_offered', routeEvidence: 'Synthetic official source confirms no standalone profile.' });
  assert.equal(route.status, 200); assert.ok(route.data.routesCheckedAt);
  const profilePreview = await api('/run-preview', 'POST', { directoryId: directory.id, companyIds: [routeId], actions: { applyMatchingJobs: false, createProfiles: true, sendCvEmails: false } });
  assert.equal(profilePreview.data.count, 0);
  assert.equal((await api(`/companies/${routeId}`, 'PATCH', { expectedRevision: initialRoute.revision, notes: 'Stale edit' })).status, 409);
  assert.equal((await api(`/companies/${routeId}`, 'PATCH', { expectedRevision: route.data.revision, profileSupport: 'unknown', routeEvidence: '' })).status, 200);
  const discoveryRequest = await api(`/discovery/request?directoryId=${directory.id}&assistant=codex`);
  assert.equal(discoveryRequest.status, 200); assert.equal(discoveryRequest.data.actionsAuthorized, false);
  assert.match(discoveryRequest.data.prompt, /read-only discovery/);
  const preferences = (await api('/discovery/preferences')).data;
  const lease = await api('/discovery/prepare', 'POST', { companyId: added.ids[0], assistant: 'codex' });
  assert.equal(lease.status, 200); assert.equal(lease.data.readRequest.executionOwner, 'native-client');
  const found = await api('/discovery/record', 'POST', { id: lease.data.id, token: lease.data.token, assistant: 'codex', complete: true, sourceRead: { method: 'native_browser', url: lease.data.readRequest.url, observedAt: new Date().toISOString(), evidence: 'Synthetic exact page inspected.' }, observations: [{ title: 'Engineer', url: 'https://example.org/jobs/1', description: 'JavaScript required.', evidence: 'Synthetic complete posting inspected.', contentComplete: true, status: 'open' }] });
  assert.equal(found.status, 200); assert.equal(found.data.added, 1);
  const discovery = await api(`/discovery/jobs?directoryId=${directory.id}&review=pending&assistant=codex`);
  assert.equal(discovery.data.total, 1);
  const job = discovery.data.items[0], detail = await api(`/discovery/jobs/${job.id}?companyIds=${encodeURIComponent(JSON.stringify(added.ids))}`);
  assert.equal(detail.status, 200); assert.equal(detail.data.job.description, 'JavaScript required.');
  assert.equal((await api(`/discovery/jobs/${job.id}?companyIds=%5B%5D`)).status, 404);
  const cvHash = 'c'.repeat(64);
  await api('/native/client/report', 'POST', { assistant: 'codex', kind: 'cv', status: 'available', observedAt: new Date().toISOString(), cv: { id: 'http-synthetic-cv', versionHash: cvHash } });
  const matched = await api('/discovery/match', 'POST', { assistant: 'codex', jobId: job.id, expectedContentHash: job.contentHash, expectedPreferencesRevision: preferences.revision, cvReference: { sourceId: 'http-synthetic-cv', versionHash: cvHash }, decision: 'needs_you', requirements: [{ kind: 'required', jobQuote: 'JavaScript required.', relation: 'unknown' }], reason: 'The client needs a verified experience fact.', nextStep: 'Confirm your JavaScript experience in your CV.' });
  assert.equal(matched.status, 200); assert.equal(matched.data.matchState, 'needs_you');
  assert.equal((await api(`/discovery/summary?directoryId=${directory.id}`)).data.needsYou, 1);
  const oversized = await api('/discovery/record', 'POST', { payload: 'x'.repeat(1024 * 1024 + 1) });
  assert.equal(oversized.status, 413);
  // Public pack operations and historical rule/results remain available, without
  // an app-owned rule executor, clock or send permission.
  assert.equal((await api('/directory-packs')).status, 200);
  const preview = await api('/run-preview?scope=' + encodeURIComponent(JSON.stringify({ directoryId: directory.id, actions: { applyMatchingJobs: false, createProfiles: true, sendCvEmails: false } })));
  assert.equal(preview.status, 200);
  assert.equal((await api('/monitoring/results')).status, 200);
  const started = await api('/native/runs', 'POST', { directoryId: directory.id, assistant: 'codex', explicit: true, mode: 'send_and_submit', actions: { applyMatchingJobs: false, createProfiles: true, sendCvEmails: false } });
  assert.equal(started.status, 200); const run = started.data.run;
  assert.equal(run.native, true); assert.equal(run.total, 2); assert.equal(Object.hasOwn(run, 'companyIds'), false);
  assert.match(started.data.handoff.prompt, /prepare_form_submission/);
  const claim = (await api(`/native/runs/${run.id}/claim`, 'POST', { assistant: 'codex' })).data;
  assert.equal(claim.target.companyId, added.ids[0]); assert.ok(claim.claimToken);
  const stopped = await api(`/runs/${run.id}/stop`, 'POST', {}); assert.equal(stopped.data.status, 'cancelled');
  const late = await api(`/native/runs/${run.id}/finish`, 'POST', { assistant: 'codex', companyId: claim.target.companyId, claimToken: claim.claimToken, status: 'checked' });
  assert.equal(late.status, 409);
  const report = await api('/reports', 'POST', {}); assert.equal(report.status, 200); assert.ok(report.data.id);
  // The older /runs entry point now creates Native authority too.
  const older = (await api('/runs', 'POST', { directoryId: directory.id, companyIds: [added.ids[0]], explicit: true, mode: 'send_and_submit' })).data;
  assert.ok(older.id); assert.equal(older.native, true);
  assert.equal((await api(`/runs/${older.id}/stop`, 'POST', {})).data.status, 'cancelled');
  const fresh = await api('/native/runs', 'POST', { directoryId: directory.id, assistant: 'codex', explicit: true, mode: 'send_and_submit' });
  assert.equal(fresh.status, 200); await api(`/runs/${fresh.data.run.id}/stop`, 'POST', {});
  await assert.rejects(readFile(violations), { code: 'ENOENT' });
});
