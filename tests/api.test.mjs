import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
let child, dataDir, port, baseUrl;
let serverOutput = '';

async function startupSnapshot() {
  if (process.platform !== 'win32' || !process.env.APPDATA) return null;
  const file = join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Apply Tracker.vbs');
  try { return { content: await readFile(file, 'utf8'), mtime: (await stat(file)).mtimeMs }; }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function json(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(baseUrl + path, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5000),
  });
  const result = await response.json();
  return { response, result };
}

before(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'apply-http-'));
  const reservation = createServer();
  await new Promise(accept => reservation.listen(0, '127.0.0.1', accept));
  port = reservation.address().port;
  await new Promise(accept => reservation.close(accept));
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, [join(root, 'server', 'index.mjs')], {
    cwd: root,
    env: { ...process.env, APPLY_TRACKER_DATA: dataDir, APPLY_TRACKER_PORT: String(port), APPLY_TRACKER_INSTANCE: 'http-fixture-instance' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let spawnError;
  child.on('error', error => { spawnError = error; });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-8000); });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error(`Fixture server exited: ${serverOutput}`);
    try {
      const { response, result } = await json('/api/health');
      if (response.ok && result.instanceId === 'http-fixture-instance') {
        // These fixtures exercise the explicitly selected compatibility contracts.
        // Default native ownership is covered separately in native-api.test.mjs.
        await json('/api/settings', { method: 'PATCH', body: { connectionMode: 'local-adapters' } });
        return;
      }
    } catch { /* Wait until the isolated local server is listening. */ }
    await new Promise(accept => setTimeout(accept, 100));
  }
  throw new Error(`Fixture server did not become ready: ${serverOutput}`);
});

after(async () => {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise(accept => child.once('exit', accept));
    child.kill('SIGTERM');
    await Promise.race([exited, new Promise(accept => setTimeout(accept, 3000))]);
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; }
  }
  if (dataDir) await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

test('HTTP starts from the actual 772-record seed and returns exact local agent/background configuration', async () => {
  const { result: bootstrap } = await json('/api/bootstrap');
  assert.equal(bootstrap.directories.length, 1);
  assert.equal(bootstrap.directories[0].id, 'uae');
  assert.equal(bootstrap.directories[0].count, 772);
  const { result: companies } = await json('/api/companies?directoryId=uae&limit=1000');
  assert.equal(companies.total, 772);
  assert.equal(new Set(companies.items.map(record => record.sourceId)).size, 772);
  assert.ok(companies.items.some(record => record.sourceRole === 'Job board'));
  const abb = companies.items.find(record => record.name === 'ABB');
  assert.equal(abb.careersUrl, 'https://careers.abb/global/en/career-opportunities');
  assert.equal(abb.status, 'not_started');
  assert.equal(abb.sourceFields['Record ID'], abb.id);
  const { result: config } = await json('/api/agent-config');
  const agent = config.mcpServers['apply-tracker'];
  assert.ok(isAbsolute(agent.command));
  assert.equal(agent.command, process.execPath);
  assert.deepEqual(agent.args, [join(root, 'server', 'mcp.mjs')]);
  assert.equal(agent.env.APPLY_TRACKER_DATA, resolve(dataDir));
  assert.equal(agent.env.APPLY_TRACKER_PORT, String(port));
  const startupBefore = await startupSnapshot();
  const { response, result: background } = await json('/api/background');
  assert.equal(response.status, 200);
  assert.equal(background.startupSupported, ['win32', 'darwin', 'linux'].includes(process.platform));
  assert.equal(typeof background.startupInstalled, 'boolean');
  assert.deepEqual(await startupSnapshot(), startupBefore);
});

test('HTTP directory snapshot counts confirmed work and opens compact paginated history', async () => {
  const { result: directory } = await json('/api/directories', { method: 'POST', body: { name: 'Snapshot HTTP fixture' } });
  const { result: imported } = await json(`/api/directories/${directory.id}/companies`, { method: 'POST', body: { records: [{ name: 'Snapshot employer', email: 'careers@example.test' }, { name: 'Form employer' }] } });
  const [companyId, formId] = imported.ids;
  await json('/api/applications', { method: 'POST', body: { companyId, event: 'profile_created', url: 'https://careers.example.test/profile?session=private-session' } });
  const { result: run } = await json('/api/runs', { method: 'POST', body: { directoryId: directory.id, companyIds: [companyId, formId], explicit: true, mode: 'send_and_submit' } });
  for (const [id, method] of [[companyId, 'email'], [formId, 'career_page']]) {
    const { response } = await json('/api/applications', { method: 'POST', body: { companyId: id, runId: run.id, event: 'applied', method, role: 'Snapshot role', evidence: method === 'email' ? { providerMessageId: 'snapshot-http-message' } : 'Fixture form receipt', notes: 'private note', url: 'https://careers.example.test/apply?session=private-session' } });
    assert.equal(response.status, 200);
  }
  await json(`/api/companies/${companyId}`, { method: 'PATCH', body: { archived: true } });
  const { response, result } = await json(`/api/snapshot?directoryId=${directory.id}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(result.counts, { applications: 2, profiles: 1, emails: 1 });
  assert.equal(result.period, 'all_time');
  assert.equal(result.metric, null);
  assert.equal(result.total, 0);
  assert.deepEqual(result.items, []);
  const { result: detail } = await json(`/api/snapshot?directoryId=${directory.id}&metric=applications&limit=1&offset=1`);
  assert.equal(detail.total, 2);
  assert.equal(detail.items.length, 1);
  assert.equal(JSON.stringify(detail).includes('private'), false);
  assert.deepEqual((await json('/api/snapshot?directoryId=uae')).result.counts, { applications: 0, profiles: 0, emails: 0 });
  assert.equal((await json('/api/snapshot?directoryId=missing')).response.status, 404);
  for (const query of ['', `directoryId=${directory.id}&period=month`, `directoryId=${directory.id}&limit=101`, `directoryId=${directory.id}&metric=other`, `directoryId=${directory.id}&search=anything`, `directoryId=${directory.id}&period=all_time&period=this_week`]) assert.equal((await json('/api/snapshot?' + query)).response.status, 400);
});

test('HTTP table summaries omit source bulk while full company evidence remains accessible', async () => {
  const full = (await json('/api/companies?directoryId=uae&limit=100')).result;
  const summary = (await json('/api/companies?directoryId=uae&limit=100&summary=true')).result;
  assert.equal(summary.total, full.total);
  assert.deepEqual(summary.items.map(item => item.id), full.items.map(item => item.id));
  for (let index = 0; index < full.items.length; index++) {
    const { sourceFields, ...expected } = full.items[index];
    assert.deepEqual(summary.items[index], expected);
    assert.equal(Object.hasOwn(summary.items[index], 'sourceFields'), false);
  }
  const detail = (await json('/api/companies/' + full.items[0].id)).result.company;
  assert.deepEqual(detail.sourceFields, full.items[0].sourceFields);
  assert.ok(Buffer.byteLength(JSON.stringify(summary)) < Buffer.byteLength(JSON.stringify(full)) / 2);
});

test('HTTP contact edits and CSV export preserve website, careers, LinkedIn, email and original source identity', async () => {
  const { result: directory } = await json('/api/directories', { method: 'POST', body: { name: 'HTTP fixture', flag: '🧪' } });
  const contacts = {
    website: 'https://example.test/',
    careersUrl: 'https://example.test/careers',
    linkedinUrl: 'https://www.linkedin.com/company/http-fixture/',
    email: 'careers@example.test',
  };
  const sourceFields = { 'Original source': 'HTTP fixture only', Evidence: 'https://example.test/source', 'Record ID': 'http-source-stable' };
  const { result: imported } = await json(`/api/directories/${directory.id}/companies`, { method: 'POST', body: { records: [{ id: 'http-source-stable', name: 'HTTP Company', sourceRole: 'Commercial employer', sourceFields, ...contacts }] } });
  const companyId = imported.ids[0];
  const { result: detail } = await json(`/api/companies/${companyId}`);
  for (const [field, value] of Object.entries(contacts)) assert.equal(detail.company[field], value);
  const { response: saved, result: updated } = await json(`/api/companies/${companyId}`, { method: 'PATCH', body: { expectedRevision: detail.company.revision, notes: 'Follow up after checking the published role', website: 'https://example.test/company', email: 'jobs@example.test' } });
  assert.equal(saved.status, 200);
  assert.equal(updated.careersUrl, contacts.careersUrl);
  assert.equal(updated.linkedinUrl, contacts.linkedinUrl);
  assert.deepEqual(updated.sourceFields, sourceFields);
  const exported = await fetch(`${baseUrl}/api/export/${directory.id}`);
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get('Content-Disposition'), /attachment/);
  const rows = parse(await exported.text(), { columns: true, bom: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].website, 'https://example.test/company');
  assert.equal(rows[0].careersUrl, contacts.careersUrl);
  assert.equal(rows[0].linkedinUrl, contacts.linkedinUrl);
  assert.equal(rows[0].email, 'jobs@example.test');
  assert.equal(rows[0].sourceId, 'http-source-stable');
  assert.equal(rows[0].sourceRole, 'Commercial employer');
  const { result: reread } = await json(`/api/companies/${companyId}`);
  assert.deepEqual(reread.company.sourceFields, sourceFields);
});

test('HTTP rejects hostile origins, cross-site mutations and hostile Host without changing records', async () => {
  const { result: beforeState } = await json('/api/bootstrap');
  const malicious = await json('/api/directories', { method: 'POST', body: { name: 'Must not be created' }, headers: { Origin: 'https://hostile.example' } });
  assert.equal(malicious.response.status, 403);
  const crossSite = await json('/api/directories', { method: 'POST', body: { name: 'Must not be created either' }, headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(crossSite.response.status, 403);
  const hostileHost = await new Promise((accept, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path: '/api/health', method: 'GET', headers: { Host: `hostile.example:${port}` } }, response => { response.resume(); response.once('end', () => accept(response.statusCode)); });
    req.once('error', reject);
    req.end();
  });
  assert.equal(hostileHost, 403);
  const { response: allowed } = await json('/api/health', { headers: { Origin: baseUrl } });
  assert.equal(allowed.status, 200);
  const { result: afterState } = await json('/api/bootstrap');
  assert.deepEqual(afterState.directories, beforeState.directories);
});

test('HTTP run filters preview and snapshot the same selected type and location scope', async () => {
  const { result: directory } = await json('/api/directories', { method: 'POST', body: { name: 'Run filter fixture', country: 'AE' } });
  const { result: added } = await json(`/api/directories/${directory.id}/companies`, { method: 'POST', body: { records: [
    { name: 'Private Dubai fixture', type: 'Private company', location: 'Dubai' },
    { name: 'Federal Dubai fixture', type: 'Federal government entity', location: 'Dubai' },
    { name: 'Private Sharjah fixture', type: 'Private company', location: 'Sharjah' },
  ] } });
  const input = { directoryId: directory.id, companyIds: added.ids, companyTypes: ['private'], locations: ['location:dubai'] };
  const preview = await json('/api/run-preview', { method: 'POST', body: input });
  assert.equal(preview.response.status, 200); assert.equal(preview.result.count, 1);
  assert.equal(preview.result.companyTypes.find(type => type.id === 'private').count, 2);
  assert.equal(preview.result.locations.find(place => place.id === 'location:dubai').count, 2);
  const started = await json('/api/runs', { method: 'POST', body: { ...input, mode: 'send_and_submit', explicit: true } });
  assert.equal(started.response.status, 200); assert.deepEqual(started.result.companyIds, [added.ids[0]]);
  assert.deepEqual(started.result.companyTypes, input.companyTypes); assert.deepEqual(started.result.locations, input.locations);
  const invalid = await json('/api/run-preview', { method: 'POST', body: { ...input, companyTypes: ['not-a-type'] } });
  assert.equal(invalid.response.status, 400);
  const empty = await json('/api/run-preview', { method: 'POST', body: { ...input, locations: ['location:absent'] } });
  assert.equal(empty.result.count, 0);
  await json(`/api/runs/${started.result.id}`, { method: 'PATCH', body: { status: 'cancelled' } });
});

test('HTTP list filters return full-list facets and match preview without silently accepting malformed arrays', async () => {
  const { result: directory } = await json('/api/directories', { method: 'POST', body: { name: 'List scope fixture', country: 'AE' } });
  const { result: added } = await json(`/api/directories/${directory.id}/companies`, { method: 'POST', body: { records: [
    { name: 'Scope target Dubai', type: 'Private company', location: 'Dubai' },
    { name: 'Scope target Sharjah', type: 'Private company', location: 'Sharjah' },
    { name: 'Scope other Dubai', type: 'Federal government entity', location: 'Dubai' },
  ] } });
  await json(`/api/companies/${added.ids[0]}`, { method: 'PATCH', body: { attention: 'needs_you', status: 'ready' } });
  const input = { directoryId: directory.id, search: 'target', status: 'ready', attention: 'needs_you', companyTypes: ['private'], locations: ['location:dubai'] };
  const query = new URLSearchParams({ ...input, companyTypes: JSON.stringify(input.companyTypes), locations: JSON.stringify(input.locations), limit: '1', summary: 'true' });
  const list = await json('/api/companies?' + query);
  const preview = await json('/api/run-preview', { method: 'POST', body: input });
  assert.equal(list.response.status, 200); assert.equal(list.result.total, 1);
  assert.equal(list.result.remainingCount, preview.result.count); assert.equal(preview.result.listScopeVersion, 1);
  assert.deepEqual(list.result.items.map(item => item.id), [added.ids[0]]);
  assert.equal(list.result.facets.companyTypes.find(type => type.id === 'federal_government').count, 1);
  assert.equal(list.result.facets.locations.find(place => place.label === 'Sharjah').count, 1);
  for (const value of ['private', 'null', '{}', '[42]']) {
    query.set('companyTypes', value);
    assert.equal((await json('/api/companies?' + query)).response.status, 400);
  }
  const started = await json('/api/runs', { method: 'POST', body: { ...input, actions: { applyMatchingJobs: false, createProfiles: true }, mode: 'send_and_submit', explicit: true } });
  assert.equal(started.response.status, 200);
  assert.deepEqual(started.result.companyIds, [added.ids[0]]);
  assert.equal(started.result.filters.search, 'target'); assert.equal(started.result.filters.attention, 'needs_you');
  assert.equal(started.result.actions.applyMatchingJobs, false);
  await json(`/api/runs/${started.result.id}`, { method: 'PATCH', body: { status: 'cancelled' } });
});

test('HTTP native monitoring saves explicit scope without creating a task, starting a run or reading providers', async () => {
  const { result: initial } = await json('/api/monitoring');
  assert.equal(initial.config.enabled, false); assert.equal(initial.status.nextRunAt, null);
  const { result: directory } = await json('/api/directories', { method: 'POST', body: { name: 'Native schedule HTTP fixture' } });
  const { result: added } = await json(`/api/directories/${directory.id}/companies`, { method: 'POST', body: { records: [{ name: 'Selected careers source' }, { name: 'Other careers source' }] } });
  const { result: scope } = await json('/api/monitoring/scope', { method: 'POST', body: { directoryId: directory.id, companyIds: [added.ids[0]] } });
  assert.deepEqual(scope.scope.companyIds, [added.ids[0]]); assert.equal(scope.count, 1);
  const patch = { enabled: true, assistant: 'claude-code', channels: { jobs: true }, scope: scope.scope };
  assert.equal((await json('/api/monitoring', { method: 'PATCH', body: { expectedRevision: initial.config.revision, patch } })).response.status, 400);
  const { response, result: saved } = await json('/api/monitoring', { method: 'PATCH', body: { expectedRevision: initial.config.revision, explicit: true, patch } });
  assert.equal(response.status, 200); assert.equal(saved.status.externalScheduleStatus, 'unknown');
  const { result: recipe } = await json('/api/monitoring/recipe', { method: 'POST', body: { assistant: 'claude-code', configurationRevision: saved.config.revision } });
  assert.equal(recipe.creation, 'requested_only'); assert.equal(recipe.nextRunAt, null);
  assert.ok(recipe.setup.args.includes('--monitor')); assert.match(recipe.taskPrompt, /No applications/);
  const { result: after } = await json('/api/monitoring'); assert.equal(after.status.externalScheduleStatus, 'unknown'); assert.equal(after.status.activeChecks, 0);
  assert.equal((await json('/api/monitoring/updates?unread=true&limit=1')).result.total, 0);
  await json('/api/monitoring', { method: 'PATCH', body: { expectedRevision: saved.config.revision, patch: { enabled: false } } });
});

test('HTTP original CV staging preserves bytes and requires an active authorized company and upload purpose', async () => {
  assert.equal((await json('/api/cv/file')).result.available, false);
  const original = Buffer.from('%PDF-1.7\nExact original HTTP fixture, never a real candidate.\n%%EOF\n');
  const saved = await json('/api/cv/file', { method: 'POST', body: { filename: 'Original fixture.pdf', contentBase64: original.toString('base64') } });
  assert.equal(saved.response.status, 200); assert.equal(saved.result.contentVerified, false);
  assert.ok(!JSON.stringify(saved.result).includes('Exact original')); assert.equal((await json('/api/cv/file')).result.sha256, saved.result.sha256);
  const { result: directory } = await json('/api/directories', { method: 'POST', body: { name: 'CV staging HTTP fixture' } });
  const { result: added } = await json(`/api/directories/${directory.id}/companies`, { method: 'POST', body: { records: [{ name: 'Authorized upload target' }, { name: 'Unrelated target' }] } });
  const { result: run } = await json('/api/runs', { method: 'POST', body: { directoryId: directory.id, companyIds: [added.ids[0]], explicit: true, mode: 'send_and_submit', actions: { applyMatchingJobs: false, createProfiles: true, sendCvEmails: false } } });
  const prepare = body => json('/api/cv/file/prepare', { method: 'POST', body: { runId: run.id, companyId: added.ids[0], purpose: 'cv_upload', ...body } });
  assert.equal((await prepare({ purpose: 'application' })).response.status, 400);
  assert.equal((await prepare({ companyId: added.ids[1] })).response.status, 400);
  const staged = await prepare({}); assert.equal(staged.response.status, 200); assert.deepEqual(await readFile(staged.result.path), original);
  const stagedRelative = relative(await realpath(dataDir), staged.result.path);
  assert.ok(!isAbsolute(stagedRelative) && !stagedRelative.startsWith('..'));
  await json(`/api/runs/${run.id}`, { method: 'PATCH', body: { status: 'cancelled' } });
  assert.equal((await prepare({})).response.status, 400);
});

test('HTTP capability requests report guidance only and never imply access or model verification', async () => {
  for (const kind of ['browser', 'passwords']) {
    const result = await json(`/api/agent-capabilities/recipe?assistant=codex&kind=${kind}`);
    assert.equal(result.response.status, 200); assert.equal(result.result.kind, kind); assert.match(result.result.prompt, /No applications/);
    assert.equal(result.result.connected, undefined);
  }
  const registration = (await json('/api/registration-context')).result;
  assert.equal(registration.primaryEmail, null); assert.equal(registration.credentials.storedByTracker, false);
  const passive = await json('/api/assistant-check?assistant=codex'); assert.equal(passive.result.modelAccessVerified, false);
  const implicit = await json('/api/assistant-check', { method: 'POST', body: { assistant: 'codex' } });
  assert.equal(implicit.response.status, 400); assert.match(implicit.result.error, /explicitly/);
  assert.equal((await json('/api/assistant-check?assistant=codex')).result.status, passive.result.status);
});
