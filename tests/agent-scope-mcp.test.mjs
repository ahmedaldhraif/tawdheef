import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openStore } from '../server/store.mjs';
import { createMcpServer } from '../server/mcp.mjs';
import { OPERATOR_TOOLS } from '../server/operator-contract.mjs';
import { MONITOR_TOOLS } from '../server/monitoring.mjs';

const execute = promisify(execFile);
const unpack = result => result.structuredContent || JSON.parse(result.content[0].text);
const environmentKeys = ['APPLY_TRACKER_CONNECTION_MODE', 'APPLY_TRACKER_CLIENT', 'APPLY_TRACKER_DATA', 'APPLY_TRACKER_PORT', 'APPLY_TRACKER_OPERATOR_RUN', 'APPLY_TRACKER_OPERATOR_COMPANY', 'APPLY_TRACKER_MONITOR', 'APPLY_TRACKER_MONITOR_ASSISTANT', 'APPLY_TRACKER_DIAGNOSTIC', 'APPLY_TRACKER_DIAGNOSTIC_RECEIPT'];

async function fixture(t) {
  const prefix = join(tmpdir(), 'tawdheef-mcp-roles-'), root = await mkdtemp(prefix), dataDir = join(root, 'data');
  const originalEnv = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]])), originalFetch = globalThis.fetch;
  for (const key of environmentKeys) delete process.env[key];
  process.env.APPLY_TRACKER_DATA = dataDir; process.env.APPLY_TRACKER_PORT = '65532';
  const store = openStore({ dataDir, seed: false }), clients = [], requests = [];
  // Actual MCP transport and domain methods; HTTP is replaced with a fixture, never a live owner/provider.
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input)); requests.push(url.pathname);
    assert.equal(url.origin, 'http://127.0.0.1:65532', 'No external or unrelated local request is permitted.');
    const response = data => ({ ok: true, status: 200, json: async () => data });
    if (url.pathname === '/api/health') return response({ app: 'apply-tracker' });
    if (url.pathname === '/api/agent-config') return response({ mcpServers: { 'apply-tracker': { env: { APPLY_TRACKER_DATA: dataDir } } } });
    if (url.pathname === '/api/monitoring/check') return response(store.beginMonitoringCheck(JSON.parse(options.body)));
    if (url.pathname === '/api/monitoring/observations') return response(store.finishMonitoringCheck(JSON.parse(options.body)));
    throw new Error('Unexpected fixture HTTP operation.');
  };
  async function connect(role = {}) {
    for (const key of environmentKeys.filter(key => !['APPLY_TRACKER_DATA', 'APPLY_TRACKER_PORT'].includes(key))) delete process.env[key];
    Object.assign(process.env, { APPLY_TRACKER_CONNECTION_MODE: 'local-adapters', ...role });
    const server = createMcpServer(store), client = new Client({ name: 'isolated-role-fixture', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport); await client.connect(clientTransport); clients.push(client);
    return client;
  }
  t.after(async () => {
    for (const client of clients) await client.close();
    store.close(); globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(originalEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    assert.ok(resolve(root).startsWith(resolve(prefix))); await rm(root, { recursive: true, force: true, maxRetries: 5 });
  });
  return { root, dataDir, store, connect, requests };
}
const call = async (client, name, args = {}) => {
  const result = await client.callTool({ name, arguments: args });
  assert.ok(!result.isError, `${name}: ${result.content?.[0]?.text}`);
  return unpack(result).data;
};

test('actual operator MCP bounds a 13,714-target run and shares exact CV provenance without changing normal-client responses', async t => {
  const { store, dataDir, connect } = await fixture(t);
  store.createDirectory({ id: 'bulk', name: 'Synthetic queue' });
  const ids = [];
  for (let offset = 0; offset < 13714; offset += 1000) ids.push(...store.addCompanies('bulk', Array.from({ length: Math.min(1000, 13714 - offset) }, (_, i) => ({ name: offset + i ? `UNRELATED TARGET ${offset + i}` : 'Assigned fixture company' }))).ids);
  const run = store.startManagedRun({ directoryId: 'bulk', assistant: 'codex', explicit: true, mode: 'send_and_submit', actions: { applyMatchingJobs: false, createProfiles: true, sendCvEmails: false } });
  store.beginRunTarget(run.id, ids[0]);
  const cached = { fetchedAt: '2026-11-14T00:00:00Z', result: { content: [{ type: 'text', text: 'Exact synthetic candidate source. '.repeat(1000) }] } }, cvJson = JSON.stringify(cached.result);
  await writeFile(join(dataDir, 'cv-cache.json'), JSON.stringify(cached));
  const scoped = await connect({ APPLY_TRACKER_OPERATOR_RUN: run.id, APPLY_TRACKER_OPERATOR_COMPANY: ids[0] });
  const names = (await scoped.listTools()).tools.map(tool => tool.name);
  assert.equal(names.length, 18); assert.deepEqual([...names].sort(), [...OPERATOR_TOOLS].sort());
  const capabilities = await call(scoped, 'get_capabilities'); assert.deepEqual(capabilities.toolNames, names);
  const context = await call(scoped, 'get_agent_context'), view = await call(scoped, 'get_run', { id: run.id });
  assert.equal(view.totalTargets, 13714); assert.deepEqual(view.companyIds, [ids[0]]); assert.equal(view.targets.length, 1);
  assert.deepEqual(view.actions, run.actions); assert.deepEqual(view.filters, run.filters); assert.equal(view.expiresAt, store.getRun(run.id).expiresAt);
  assert.ok(Buffer.byteLength(JSON.stringify(view)) < 4000); assert.ok(Buffer.byteLength(JSON.stringify(context)) < 10000);
  assert.ok(!JSON.stringify(view).includes('UNRELATED TARGET')); assert.ok(!JSON.stringify(context).includes('UNRELATED TARGET'));
  const assignedList = await call(scoped, 'list_companies', { limit: 200 });
  assert.equal(assignedList.total, 1); assert.deepEqual(assignedList.items.map(item => item.id), [ids[0]]);
  assert.ok(!JSON.stringify(assignedList).includes('UNRELATED TARGET'));
  assert.equal(context.attempt.run.totalTargets, 13714); assert.equal(context.attempt.company.id, ids[0]); assert.equal(context.attempt.candidate.complete, false);
  const fullCv = await call(scoped, 'get_cv', { offset: context.attempt.candidate.nextOffset, maxChars: 700 });
  assert.equal(fullCv.sha256, context.attempt.candidate.source.sha256); assert.equal(fullCv.sha256, createHash('sha256').update(cvJson).digest('hex'));
  assert.equal(fullCv.text, cvJson.slice(context.attempt.candidate.nextOffset, context.attempt.candidate.nextOffset + 700));
  assert.equal((await scoped.callTool({ name: 'get_company', arguments: { id: ids[1] } })).isError, true);
  const normal = await connect(); assert.equal((await normal.listTools()).tools.length, 56);
  const fullRun = await call(normal, 'get_run', { id: run.id }); assert.equal(fullRun.companyIds.length, 13714); assert.equal(fullRun.targets.length, 13714);
  t.diagnostic(JSON.stringify({ syntheticTargets: 13714, operatorGetRunTextBytes: Buffer.byteLength(JSON.stringify({ ok: true, data: view })), operatorContextTextBytes: Buffer.byteLength(JSON.stringify({ ok: true, data: context })), normalGetRunTextBytes: Buffer.byteLength(JSON.stringify({ ok: true, data: fullRun })), candidateExcerptCharacters: context.attempt.candidate.text.length }));
  store.updateRun(run.id, { status: 'cancelled' });
  assert.equal((await scoped.callTool({ name: 'get_run', arguments: { id: run.id } })).isError, true);
});

test('monitor MCP exposes exactly eight source-reading/evidence tools and cannot apply, send, upload or change configuration', async t => {
  const { store, connect, requests } = await fixture(t);
  store.createDirectory({ id: 'selected', name: 'Selected' }); store.createDirectory({ id: 'foreign', name: 'Foreign' });
  store.addCompanies('selected', [{ id: 'alpha', name: 'Alpha fixture', careersUrl: 'https://example.test/careers' }]);
  store.addCompanies('foreign', [{ id: 'other', name: 'Out-of-scope fixture', careersUrl: 'https://example.test/other' }]);
  const monitor = await connect({ APPLY_TRACKER_MONITOR: '1', APPLY_TRACKER_MONITOR_ASSISTANT: 'codex' }), names = (await monitor.listTools()).tools.map(tool => tool.name);
  assert.equal(names.length, 8); assert.deepEqual([...names].sort(), [...MONITOR_TOOLS].sort());
  const capabilities = await call(monitor, 'get_capabilities'); assert.deepEqual(capabilities.toolNames, names); assert.equal(capabilities.mode, 'monitoring'); assert.equal(capabilities.setupTool, undefined);
  const forbidden = ['start_run', 'prepare_form_submission', 'send_application_email', 'create_calendar_event', 'configure_connection', 'connect_connection', 'update_settings', 'configure_monitoring', 'get_monitoring_recipe', 'prepare_cv_attachment', 'get_registration_context', 'log_application'];
  const before = requests.length;
  for (const name of forbidden) assert.equal((await monitor.callTool({ name, arguments: {} })).isError, true, name);
  assert.equal(requests.length, before); assert.equal((await monitor.callTool({ name: 'get_cv', arguments: { refresh: true } })).isError, true); assert.equal(requests.length, before);
  const config = store.configureMonitoring({ expectedRevision: store.getMonitoring().config.revision, explicit: true, patch: { enabled: true, channels: { jobs: true }, scope: { directoryIds: ['selected'] } } }).config;
  const sources = await call(monitor, 'list_monitoring_sources', { kind: 'jobs', limit: 1 }); assert.equal(sources.items.length, 1); assert.equal(sources.items[0].id, 'alpha'); assert.ok(!JSON.stringify(sources).includes('Out-of-scope'));
  const lease = await call(monitor, 'check_updates', { configurationRevision: config.revision, assistant: config.assistant, source: { kind: 'jobs', id: 'alpha' } });
  await call(monitor, 'record_monitoring_observations', { id: lease.check.id, token: lease.token, status: 'checked', complete: true, observations: [{ externalId: 'fixture-job', title: 'Synthetic source observation', url: 'https://example.test/job', evidence: 'Deliberate local fixture, never a live vacancy claim.' }] });
  const updates = await call(monitor, 'list_updates'); assert.equal(updates.items.length, 1);
  const context = await call(monitor, 'get_agent_context'); assert.equal(context.mode, 'monitoring'); assert.equal(context.status.externalScheduleStatus, 'unknown'); assert.equal(context.candidate.status, 'unavailable');
  assert.equal(store.listRuns().length, 0); assert.equal(store.listApplications('alpha').length, 0);
});

test('MCP scopes are mutually exclusive and incomplete operator scope is rejected', async t => {
  const { store } = await fixture(t);
  process.env.APPLY_TRACKER_OPERATOR_RUN = 'run'; assert.throws(() => createMcpServer(store), /Both operator/);
  process.env.APPLY_TRACKER_OPERATOR_COMPANY = 'company'; process.env.APPLY_TRACKER_MONITOR = '1'; assert.throws(() => createMcpServer(store), /one agent operating scope/);
  delete process.env.APPLY_TRACKER_OPERATOR_RUN; delete process.env.APPLY_TRACKER_OPERATOR_COMPANY; process.env.APPLY_TRACKER_DIAGNOSTIC = '1'; assert.throws(() => createMcpServer(store), /one agent operating scope/);
  delete process.env.APPLY_TRACKER_DIAGNOSTIC; assert.throws(() => createMcpServer(store), /selected monitoring assistant/);
});

test('disabled and replaced native tasks cannot read candidate facts or monitored source content', async t => {
  const { store, dataDir, connect } = await fixture(t);
  store.createDirectory({ id: 'private', name: 'Fixture only' });
  store.addCompanies('private', [{ id: 'private-company', name: 'Private source' }]);
  await writeFile(join(dataDir, 'cv-cache.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), result: { content: [{ type: 'text', text: 'PRIVATE CANDIDATE FACT' }] } }));
  const codex = await connect({ APPLY_TRACKER_MONITOR: '1', APPLY_TRACKER_MONITOR_ASSISTANT: 'codex' });
  assert.equal((await call(codex, 'get_agent_context')).candidate, undefined);
  assert.equal((await codex.callTool({ name: 'get_cv', arguments: {} })).isError, true);
  store.configureMonitoring({ expectedRevision: store.getMonitoring().config.revision, explicit: true, patch: { enabled: true, assistant: 'codex', channels: { jobs: true }, scope: { directoryIds: ['private'] } } });
  assert.ok(JSON.stringify(await call(codex, 'get_agent_context')).includes('PRIVATE CANDIDATE FACT'));
  store.configureMonitoring({ expectedRevision: store.getMonitoring().config.revision, explicit: true, patch: { assistant: 'claude-code' } });
  const claude = await connect({ APPLY_TRACKER_MONITOR: '1', APPLY_TRACKER_MONITOR_ASSISTANT: 'claude-code' });
  assert.equal((await call(codex, 'get_agent_context')).candidate, undefined);
  for (const name of ['get_cv', 'list_monitoring_sources', 'list_updates']) {
    const denied = await codex.callTool({ name, arguments: name === 'list_monitoring_sources' ? { kind: 'jobs' } : {} });
    assert.equal(denied.isError, true, name); assert.match(denied.content[0].text, /another selected assistant/);
  }
  assert.equal((await call(claude, 'list_monitoring_sources', { kind: 'jobs' })).items.length, 1);
  store.configureMonitoring({ expectedRevision: store.getMonitoring().config.revision, patch: { enabled: false } });
  assert.equal((await call(claude, 'get_agent_context')).candidate, undefined);
  assert.equal((await claude.callTool({ name: 'list_monitoring_sources', arguments: {} })).isError, true);
});

test('diagnostic MCP exposes only two tools and writes a canonical metadata-only proof', async t => {
  const { store, dataDir, connect } = await fixture(t), receipt = join(await realpath(dataDir), 'agent-model-proof.json');
  await writeFile(receipt, JSON.stringify({ tools: ['get_agent_context', 'send_application_email'], privateText: 'must not survive' }));
  const diagnostic = await connect({ APPLY_TRACKER_DIAGNOSTIC: '1', APPLY_TRACKER_DIAGNOSTIC_RECEIPT: receipt });
  const names = (await diagnostic.listTools()).tools.map(tool => tool.name); assert.deepEqual([...names].sort(), ['get_agent_context', 'get_capabilities']);
  const results = await Promise.allSettled([call(diagnostic, 'get_agent_context'), call(diagnostic, 'get_capabilities')]);
  for (const result of results) if (result.status === 'rejected') throw result.reason;
  const proof = JSON.parse(await readFile(receipt, 'utf8')); assert.deepEqual([...proof.tools].sort(), ['get_agent_context', 'get_capabilities']); assert.ok(Number.isFinite(Date.parse(proof.checkedAt)));
  assert.deepEqual(Object.keys(proof).sort(), ['checkedAt', 'tools']); assert.ok(!JSON.stringify(proof).includes('must not survive'));
  const capabilities = await call(diagnostic, 'get_capabilities'); assert.equal(capabilities.setupTool, undefined); assert.equal(capabilities.mode, 'diagnostic');
  assert.equal((await diagnostic.callTool({ name: 'get_cv', arguments: {} })).isError, true); assert.equal(store.listRuns().length, 0);
});

test('diagnostic proof accepts a canonical data-directory alias and rejects a different receipt path', async t => {
  const { root, dataDir, store, connect } = await fixture(t), canonical = await realpath(dataDir), alias = join(root, 'data-alias');
  try { await symlink(canonical, alias, 'junction'); } catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('Directory aliases unavailable.'); return; } throw error; }
  const diagnostic = await connect({ APPLY_TRACKER_DIAGNOSTIC: '1', APPLY_TRACKER_DIAGNOSTIC_RECEIPT: join(alias, 'agent-model-proof.json') });
  await call(diagnostic, 'get_capabilities'); assert.ok((await readFile(join(canonical, 'agent-model-proof.json'), 'utf8')).includes('get_capabilities'));
  const outside = join(root, 'outside-proof.json'); await writeFile(outside, 'unchanged');
  const invalid = await connect({ APPLY_TRACKER_DIAGNOSTIC: '1', APPLY_TRACKER_DIAGNOSTIC_RECEIPT: outside });
  assert.equal((await invalid.callTool({ name: 'get_capabilities', arguments: {} })).isError, true); assert.equal(await readFile(outside, 'utf8'), 'unchanged'); assert.equal(store.listRuns().length, 0);
});

test('diagnostic proof never follows an existing receipt-file symlink', async t => {
  const { root, dataDir, connect } = await fixture(t), outside = join(root, 'outside.txt'), receipt = join(dataDir, 'agent-model-proof.json');
  await writeFile(outside, 'unrelated fixture file remains unchanged');
  try { await symlink(outside, receipt, 'file'); } catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('File symlinks unavailable without additional privileges.'); return; } throw error; }
  const diagnostic = await connect({ APPLY_TRACKER_DIAGNOSTIC: '1', APPLY_TRACKER_DIAGNOSTIC_RECEIPT: receipt });
  assert.equal((await diagnostic.callTool({ name: 'get_capabilities', arguments: {} })).isError, true); assert.equal(await readFile(outside, 'utf8'), 'unrelated fixture file remains unchanged');
});

test('native --monitor setup creates only a dedicated scoped fixture workspace and no native schedule', async t => {
  const { root, dataDir } = await fixture(t), project = join(root, 'installed-code'), ordinary = join(root, 'ordinary-workspace');
  const files = ['scripts/agent-setup.mjs', 'scripts/agent-config-merge.mjs', 'scripts/app-paths.mjs', 'scripts/native-start.mjs', 'scripts/runtime-env.mjs', 'scripts/is-direct.mjs', 'server/integrations.mjs'];
  for (const name of files) { const target = join(project, name); await mkdir(dirname(target), { recursive: true }); await copyFile(new URL('../' + name, import.meta.url), target); }
  await mkdir(ordinary); await writeFile(join(ordinary, '.mcp.json'), '{"custom":"preserve ordinary configuration"}');
  const env = { ...process.env, APPLY_TRACKER_DATA: dataDir, TAWDHEEF_WORKSPACE: ordinary };
  const result = await execute(process.execPath, [join(project, 'scripts/agent-setup.mjs'), 'both', '--monitor', '--json'], { cwd: project, env, windowsHide: true });
  const setup = JSON.parse(result.stdout), workspace = join(dataDir, 'monitoring-workspace'); assert.equal(setup.workspace, workspace); assert.equal(setup.accountConnected, false); assert.match(setup.nextStep, /did not create a schedule/);
  assert.ok((await readFile(join(workspace, '.codex/config.toml'), 'utf8')).includes('APPLY_TRACKER_MONITOR_ASSISTANT = "codex"'));
  const config = JSON.parse(await readFile(join(workspace, '.mcp.json'), 'utf8')); assert.deepEqual(Object.keys(config.mcpServers), ['apply-tracker']); assert.equal(config.mcpServers['apply-tracker'].env.APPLY_TRACKER_MONITOR, '1'); assert.equal(config.mcpServers['apply-tracker'].env.APPLY_TRACKER_MONITOR_ASSISTANT, 'claude-code'); assert.equal(config.mcpServers['apply-tracker'].env.APPLY_TRACKER_DATA, dataDir);
  assert.match(await readFile(join(workspace, 'AGENTS.md'), 'utf8'), /Never apply/); assert.equal(await readFile(join(workspace, 'CLAUDE.md'), 'utf8'), '@AGENTS.md\n');
  assert.equal(await readFile(join(ordinary, '.mcp.json'), 'utf8'), '{"custom":"preserve ordinary configuration"}');
  assert.ok(!(await readdir(project)).includes('.mcp.json')); assert.ok(!(await readdir(workspace)).includes('schedules'));
  await assert.rejects(execute(process.execPath, [join(project, 'scripts/agent-setup.mjs'), 'codex', '--monitor', '--browser', '--check'], { cwd: project, env, windowsHide: true }), /application browser servers belong/);
});
