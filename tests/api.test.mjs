import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
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
      if (response.ok && result.instanceId === 'http-fixture-instance') return;
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
  assert.equal(background.startupSupported, process.platform === 'win32');
  assert.equal(typeof background.startupInstalled, 'boolean');
  assert.deepEqual(await startupSnapshot(), startupBefore);
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
