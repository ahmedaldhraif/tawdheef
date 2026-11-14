import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
test('default native HTTP uses local records and client handoffs without provider access, CLI probes or another agent', async t => {
  const prefix = join(tmpdir(), 'tawdheef-native-http-'), dataDir = await mkdtemp(prefix);
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
    env: { ...process.env, APPLY_TRACKER_DATA: dataDir, APPLY_TRACKER_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
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
  assert.equal(boot.nativeClient.capabilities.email.status, 'unknown'); assert.equal(boot.nativeClient.primaryEmail, null);
  const setup = await api('/setup-status/check', 'POST', { assistant: 'codex', verify: true });
  assert.equal(setup.status, 200); assert.equal(setup.data.ready, false); assert.equal(setup.data.owner, 'selected_ai_client');
  for (const [path, method, body] of [['/assistant-check','POST',{assistant:'codex',explicit:true}], ['/cv/read','POST',{}], ['/calendar/calendars','GET'], ['/refresh','POST',{}], ['/connections/email/connect','POST',{}]]) {
    const blocked = await api(path, method, body); assert.equal(blocked.status, 400); assert.match(blocked.data.error, /selected Codex or Claude Code client/);
  }
  const request = (await api('/native/connection-request?kind=browser&assistant=codex')).data;
  assert.match(request.prompt, /another browser engine/); assert.equal(request.accountConnected, false);
  await api('/native/client/report', 'POST', { assistant: 'codex', kind: 'email', status: 'available', observedAt: new Date().toISOString(), provider: 'gmail', accountEmail: 'native@example.test' });
  assert.equal((await api('/registration-context')).data.primaryEmail, 'native@example.test');
  const directory = (await api('/directories', 'POST', { name: 'Native HTTP fixture' })).data;
  const added = (await api(`/directories/${directory.id}/companies`, 'POST', { records: [{ name: 'Native employer', careersUrl: 'https://example.test/careers' }, { name: 'Second employer' }] })).data;
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
  // An older unassisted Run remains stoppable after selecting Native mode;
  // stopping local authority must not try to initialize optional adapters.
  assert.equal((await api('/settings', 'PATCH', { connectionMode: 'local-adapters' })).status, 200);
  const older = (await api('/runs', 'POST', { directoryId: directory.id, companyIds: [added.ids[0]], explicit: true, mode: 'send_and_submit' })).data;
  assert.ok(older.id); assert.equal(older.native, undefined);
  assert.equal((await api('/settings', 'PATCH', { connectionMode: 'native' })).status, 200);
  assert.equal((await api(`/runs/${older.id}/stop`, 'POST', {})).data.status, 'cancelled');
  const fresh = await api('/native/runs', 'POST', { directoryId: directory.id, assistant: 'codex', explicit: true, mode: 'send_and_submit' });
  assert.equal(fresh.status, 200); await api(`/runs/${fresh.data.run.id}/stop`, 'POST', {});
  await assert.rejects(readFile(violations), { code: 'ENOENT' });
});
