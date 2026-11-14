import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSetupStatus, SETUP_PROMPT } from '../server/setup-status.mjs';
import { buildTools } from '../server/mcp.mjs';
import { openStore } from '../server/store.mjs';
import { doctor } from '../scripts/doctor.mjs';
import { readConnectedCv } from '../server/cv-read.mjs';

function fixture(overrides = {}) {
  const calls = { auth: 0, cv: 0 };
  const records = [{ kind: 'tabbio', status: 'connected', mappings: { readCV: { tool: 'read_cv' } } }];
  const defaults = {
    store: { dataDir: 'fixture-private', listDirectories: () => [{ id: 'uae', count: 772 }], getSettings: () => ({ refreshFrequency: 'daily', reportFrequency: 'weekly' }) },
    connections: { list: () => records },
    discover: async () => [{ id: 'codex', name: 'Codex', installed: true }, { id: 'claude-code', name: 'Claude Code', installed: true }],
    presets: async () => [{ id: 'playwright', ready: true, browserInstalled: true }],
    checkAuthentication: async () => { calls.auth++; },
    checkTracker: async () => {},
    checkBrowser: async () => {},
    readCv: async () => { calls.cv++; return { secretFixtureCv: 'This must never appear in the public checklist' }; },
    clock: () => new Date('2026-11-13T00:00:00.000Z'),
  };
  return { calls, records, check: createSetupStatus({ ...defaults, ...overrides }) };
}
const row = (report, id) => report.steps.find(item => item.id === id);

test('passive setup reports installation without claiming sign-in or reading CV', async () => {
  const f = fixture(); const report = await f.check({ assistant: 'codex' });
  assert.equal(report.ready, false); assert.equal(report.verified, false);
  assert.equal(row(report, 'assistant').status, 'not_checked');
  assert.equal(row(report, 'cv').status, 'not_checked');
  assert.equal(report.nextStep.action, 'check');
  assert.deepEqual(f.calls, { auth: 0, cv: 0 });
  assert.equal(report.assistants[1].status, 'not_checked');
  assert.match(SETUP_PROMPT, /Do not change the app's code or design/);
  assert.match(SETUP_PROMPT, /or enable schedules during setup/);
});

test('verified setup requires a real local tool check and an opened browser rather than installation alone', async () => {
  let tools = 0, browser = 0;
  const f = fixture({ checkTracker: async () => { tools++; }, checkBrowser: async () => { browser++; throw new Error('private browser diagnostic'); } });
  const passive = await f.check({ assistant: 'codex' });
  assert.equal(tools, 0); assert.equal(browser, 0);
  assert.equal(row(passive, 'tools').status, 'not_checked');
  assert.equal(row(passive, 'browser').status, 'not_checked');
  const failed = await f.check({ assistant: 'codex', verify: true });
  assert.equal(failed.ready, false); assert.equal(row(failed, 'tools').status, 'ready');
  assert.equal(row(failed, 'browser').status, 'needs_action');
  assert.doesNotMatch(JSON.stringify(failed), /private browser diagnostic/);
  const noTools = fixture({ checkTracker: async () => { throw new Error('private path'); } });
  const blocked = await noTools.check({ verify: true });
  assert.equal(blocked.ready, false); assert.equal(blocked.nextStep.id, 'tools');
  const version = fixture({ checkAuthentication: async () => ({ version: '1.2.3' }) });
  assert.match(row(await version.check({ verify: true }), 'assistant').detail, /1\.2\.3/);
});

test('verified setup checks only chosen assistant and connected CV, never mailbox or calendar actions', async () => {
  const f = fixture(); f.records.push({ kind: 'calendar', status: 'connected' });
  const report = await f.check({ assistant: 'claude-code', verify: true });
  assert.equal(report.ready, true); assert.equal(report.assistant, 'claude-code');
  assert.equal(report.modelAccessVerified, false);
  assert.equal(report.nextStep.action, 'run');
  assert.deepEqual(f.calls, { auth: 1, cv: 1 });
  assert.equal(report.assistants[0].status, 'not_checked');
  assert.equal(row(report, 'email').status, 'optional');
  assert.equal(row(report, 'calendar').required, false);
  assert.ok(!JSON.stringify(report).includes('secretFixtureCv'));
});

test('fresh setup prioritizes the missing assistant and never silently signs into a configured CV', async () => {
  const f = fixture({ discover: async () => [{ id: 'codex', name: 'Codex', installed: false }], presets: async () => [] });
  f.records[0].status = 'auth_required';
  const report = await f.check({ verify: true });
  assert.equal(report.ready, false); assert.equal(report.nextStep.action, 'assistant');
  assert.equal(row(report, 'browser').status, 'needs_action');
  assert.equal(row(report, 'cv').status, 'needs_action');
  assert.deepEqual(f.calls, { auth: 0, cv: 0 });
});

test('email route needs an active send mapping; installed browser package alone is insufficient', async () => {
  const f = fixture({ presets: async () => [{ id: 'playwright', ready: true, browserInstalled: false }] });
  f.records.push({ kind: 'email', status: 'connected', mappings: {} });
  assert.equal((await f.check({ verify: true })).ready, false);
  f.records[1].mappings.sendEmail = { tool: 'send_mail' };
  const ready = await f.check({ verify: true });
  assert.equal(ready.ready, true); assert.equal(row(ready, 'browser').status, 'optional');
  f.records[1].status = 'auth_required';
  assert.equal((await f.check({ verify: true })).ready, false);
});

test('failed and timed-out probes stay actionable without exposing provider errors or secret values', async () => {
  const f = fixture({ checkAuthentication: async () => { throw new Error('token=secretFixtureValue private/path'); }, readCv: async () => { throw new Error('CV=privateFixtureContent'); } });
  const report = await f.check({ verify: true });
  assert.equal(report.ready, false); assert.equal(report.verified, true);
  assert.equal(row(report, 'assistant').status, 'needs_action'); assert.equal(row(report, 'cv').status, 'needs_action');
  assert.doesNotMatch(JSON.stringify(report), /secretFixtureValue|privateFixtureContent|private\/path/);
  const timed = fixture({ timeoutMs: 5, checkAuthentication: () => new Promise(() => {}), readCv: () => new Promise(() => {}) });
  assert.equal((await timed.check({ verify: true })).ready, false);
});

test('directory and CV are real prerequisites; duplicate checks share one in-flight read', async () => {
  let reads = 0;
  const f = fixture({ readCv: async () => { reads++; await new Promise(resolve => setTimeout(resolve, 10)); } });
  const [a, b] = await Promise.all([f.check({ verify: true }), f.check({ verify: true })]);
  assert.equal(reads, 1); assert.deepEqual(a, b);
  const empty = fixture({ store: { dataDir: 'fixture', listDirectories: () => [{ count: 0 }], getSettings: () => ({}) } });
  assert.equal((await empty.check({ verify: true })).nextStep.action, 'directory');
  f.records[0].mappings = {};
  assert.equal((await f.check({ verify: true })).ready, false);
  await assert.rejects(f.check({ assistant: 'chatgpt' }), /Choose Codex/);
  await assert.rejects(f.check({ verify: 'true' }), /verify/);
  await assert.rejects(f.check({ sendEmail: true }), /Only assistant/);
});

test('a timed-out CV probe holds one provider read across assistants and cannot replace cache late', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'tawdheef-setup-cv-'));
  let store = openStore({ dataDir, seed: false });
  store.createDirectory({ id: 'fixture', name: 'Fixture' });
  store.addCompanies('fixture', [{ name: 'Fixture company' }]);
  let reads = 0, finishRead;
  const providerResult = { content: [{ type: 'text', text: 'Fixture CV response' }] };
  const originalCache = JSON.stringify({ fetchedAt: '2026-01-01', result: 'Earlier good CV' });
  await writeFile(join(dataDir, 'cv-cache.json'), originalCache);
  const f = fixture({
    store, timeoutMs: 5, readCv: readConnectedCv,
    connections: {
      list: () => [{ kind: 'tabbio', status: 'connected', mappings: { readCV: { tool: 'read_cv' } } }],
      callMapped: async () => { reads++; return reads === 1 ? new Promise(resolve => { finishRead = resolve; }) : providerResult; },
    },
  });
  try {
    assert.equal((await f.check({ assistant: 'codex', verify: true })).ready, false);
    assert.equal((await f.check({ assistant: 'claude-code', verify: true })).ready, false);
    assert.equal(reads, 1);
    finishRead(providerResult);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(await readFile(join(dataDir, 'cv-cache.json'), 'utf8'), originalCache);
    assert.equal((await f.check({ assistant: 'claude-code', verify: true })).ready, true);
    assert.equal(reads, 2);
    assert.deepEqual(JSON.parse(await readFile(join(dataDir, 'cv-cache.json'), 'utf8')).result, providerResult);
  } finally { finishRead?.(providerResult); store.close(); await rm(dataDir, { recursive: true, force: true }); }
});

test('new installs leave schedules off while reopening preserves explicitly chosen schedules', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'tawdheef-setup-schedules-'));
  let store = openStore({ dataDir, seed: false });
  try {
    assert.equal(store.getSettings().refreshFrequency, 'manual');
    assert.equal(store.getSettings().reportFrequency, 'off');
    store.updateSettings({ refreshFrequency: 'daily', reportFrequency: 'weekly' });
    store.close(); store = openStore({ dataDir, seed: false });
    assert.equal(store.getSettings().refreshFrequency, 'daily');
    assert.equal(store.getSettings().reportFrequency, 'weekly');
  } finally { store.close(); await rm(dataDir, { recursive: true, force: true }); }
});

test('MCP setup uses the matching app owner and doctor offers one next step without both OAuth registrations', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'tawdheef-setup-'));
  const store = openStore({ dataDir, seed: false });
  const previousPort = process.env.APPLY_TRACKER_PORT;
  const calls = [];
  const example = await fixture().check();
  let wrongDirectory = false;
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/health') return res.end(JSON.stringify({ ok: true, app: 'apply-tracker' }));
    if (req.url === '/api/agent-config') return res.end(JSON.stringify({ mcpServers: { 'apply-tracker': { env: { APPLY_TRACKER_DATA: wrongDirectory ? join(dataDir, 'different') : dataDir } } } }));
    calls.push([req.method, req.url]);
    if (req.method === 'POST') { let body = ''; for await (const part of req) body += part; calls.push(JSON.parse(body)); }
    res.end(JSON.stringify(example));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; process.env.APPLY_TRACKER_PORT = String(port);
  try {
    const tool = buildTools(store, { mode: 'local-adapters' }).find(item => item.name === 'get_setup_status');
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal((await tool.handler({})).ready, false);
    await tool.handler({ verify: true, assistant: 'claude-code' });
    assert.deepEqual(calls.slice(0, 3), [['GET', '/api/setup-status'], ['POST', '/api/setup-status/check'], { assistant: 'claude-code' }]);
    const report = await doctor({ dataDir, port });
    assert.equal(report.setup.ready, false);
    assert.equal(report.nextSteps.length, 1);
    assert.doesNotMatch(report.nextSteps.join(' '), /Google Desktop OAuth|Microsoft public desktop/);
    wrongDirectory = true;
    await assert.rejects(tool.handler({ verify: true }), /different data directory/);
    await assert.rejects(tool.handler({ assistant: 'chatgpt' }), /assistant/);
  } finally {
    if (previousPort === undefined) delete process.env.APPLY_TRACKER_PORT; else process.env.APPLY_TRACKER_PORT = previousPort;
    await new Promise(resolve => server.close(resolve)); store.close(); await rm(dataDir, { recursive: true, force: true });
  }
});
