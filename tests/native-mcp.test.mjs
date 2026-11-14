import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openStore } from '../server/store.mjs';
import { createMcpServer } from '../server/mcp.mjs';
import { NATIVE_MONITOR_TOOLS } from '../server/native-mcp-tools.mjs';

const keys = ['APPLY_TRACKER_CLIENT', 'APPLY_TRACKER_CONNECTION_MODE', 'APPLY_TRACKER_DATA', 'APPLY_TRACKER_PORT', 'APPLY_TRACKER_MONITOR', 'APPLY_TRACKER_MONITOR_ASSISTANT', 'APPLY_TRACKER_OPERATOR_RUN', 'APPLY_TRACKER_OPERATOR_COMPANY', 'APPLY_TRACKER_DIAGNOSTIC', 'APPLY_TRACKER_DIAGNOSTIC_RECEIPT'];
const unpack = result => result.structuredContent || JSON.parse(result.content[0].text);
const call = async (client, name, args = {}) => { const result = await client.callTool({ name, arguments: args }); assert.ok(!result.isError, `${name}: ${result.content?.[0]?.text}`); return unpack(result).data; };
async function fixture(t) {
  const prefix = join(tmpdir(), 'tawdheef-native-mcp-'), dataDir = await mkdtemp(prefix);
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]])), originalFetch = globalThis.fetch;
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, { APPLY_TRACKER_CONNECTION_MODE: 'native', APPLY_TRACKER_DATA: dataDir, APPLY_TRACKER_PORT: '65531' });
  const store = openStore({ dataDir, seed: false }), clients = [], requests = [];
  store.createDirectory({ id: 'fixture', name: 'Fixture' });
  store.addCompanies('fixture', [{ id: 'alpha', name: 'Alpha', email: 'careers@example.test', careersUrl: 'https://careers.example.com/jobs' }, { id: 'beta', name: 'Beta' }]);
  await writeFile(join(dataDir, 'cv-cache.json'), JSON.stringify({ result: { text: 'PRIVATE_LEGACY_CV_MUST_NOT_ENTER_NATIVE_CONTEXT' } }));
  await writeFile(join(dataDir, 'connections.json'), '{"email":{"config":{"provider":"fixture","token":"PRIVATE_LEGACY_TOKEN"}}}');
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input)); assert.equal(url.origin, 'http://127.0.0.1:65531', 'Native can contact only its isolated local coordinator, never external services.');
    const body = options.body ? JSON.parse(options.body) : {}; requests.push({ path: url.pathname, method: options.method || 'GET', body });
    const response = data => ({ ok: true, status: 200, json: async () => data });
    try {
      if (url.pathname === '/api/health') return response({ app: 'apply-tracker' });
      if (url.pathname === '/api/agent-config') return response({ mcpServers: { 'apply-tracker': { env: { APPLY_TRACKER_DATA: dataDir } } } });
      if (url.pathname === '/api/native/runs') return response(store.startNativeRun(body));
      const run = url.pathname.match(/^\/api\/native\/runs\/([^/]+)\/(claim|finish)$/);
      if (run) return response(run[2] === 'claim' ? store.claimNativeTarget({ runId: decodeURIComponent(run[1]), ...body }) : store.finishNativeTarget({ runId: decodeURIComponent(run[1]), ...body }));
      const stop = url.pathname.match(/^\/api\/runs\/([^/]+)\/stop$/);
      if (stop) return response(store.stopNativeRun({ runId: decodeURIComponent(stop[1]) }));
      if (url.pathname === '/api/native/email/prepare') return response(store.prepareNativeEmail(body));
      if (url.pathname === '/api/native/email/resolve') return response(store.resolveNativeEmail(body));
      if (url.pathname === '/api/monitoring/check') return response(store.beginNativeMonitoringCheck(body));
      if (url.pathname === '/api/monitoring/observations') return response(store.recordNativeMonitoringCheck(body));
      throw new Error(`Unexpected coordinator request: ${url.pathname}`);
    } catch (error) { return { ok: false, status: error.status || 400, json: async () => ({ error: error.message }) }; }
  };
  async function connect(actor = 'codex', monitor = false) {
    for (const key of ['APPLY_TRACKER_CLIENT', 'APPLY_TRACKER_MONITOR', 'APPLY_TRACKER_MONITOR_ASSISTANT']) delete process.env[key];
    if (actor) process.env.APPLY_TRACKER_CLIENT = actor;
    if (monitor) { process.env.APPLY_TRACKER_MONITOR = '1'; process.env.APPLY_TRACKER_MONITOR_ASSISTANT = actor; }
    const server = createMcpServer(store), client = new Client({ name: 'native-isolated-fixture', version: '1' });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair(); await server.connect(serverSide); await client.connect(clientSide); clients.push(client); return client;
  }
  t.after(async () => { for (const client of clients) await client.close(); store.close(); globalThis.fetch = originalFetch; for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } assert.ok(resolve(dataDir).startsWith(resolve(prefix))); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); });
  return { store, connect, requests };
}
const startInput = { directoryId: 'fixture', companyIds: ['alpha'], explicit: true, mode: 'send_and_submit', actions: { applyMatchingJobs: true, createProfiles: true, sendCvEmails: false } };
const ownership = lease => ({ runId: lease.run.id, companyId: lease.target.companyId, claimToken: lease.claimToken });

test('actual Native MCP defaults to local guidance and dated actor-bound metadata without inspecting legacy providers or CVs', async t => {
  const { store, connect, requests } = await fixture(t), client = await connect();
  const names = (await client.listTools()).tools.map(tool => tool.name);
  assert.equal(names.length, 52); assert.ok(names.includes('start_native_run')); assert.ok(names.includes('prepare_native_email'));
  for (const name of ['get_cv', 'configure_connection', 'connect_connection', 'get_connection_tools', 'refresh_replies', 'send_application_email', 'list_calendars', 'create_calendar_event']) assert.ok(!names.includes(name), name);
  const context = await call(client, 'get_agent_context'), capabilities = await call(client, 'get_capabilities');
  assert.equal(context.connectionOwner, 'native-client'); assert.equal(capabilities.mode, 'native');
  assert.equal(context.client.capabilities.assistant.localToolUseObserved, true); assert.equal(context.client.capabilities.email.status, 'unknown');
  assert.ok(!JSON.stringify(context).includes('PRIVATE_LEGACY')); assert.equal(requests.length, 0);
  await call(client, 'report_native_connection', { kind: 'email', status: 'available', observedAt: new Date().toISOString(), provider: 'gmail', accountEmail: 'person@example.test' });
  assert.equal((await call(client, 'get_native_client_status')).primaryEmail, 'person@example.test');
  await call(client, 'report_native_connection', { kind: 'calendar', status: 'needs_you', observedAt: new Date().toISOString(), nextStep: 'Open Calendar in Codex and approve its read permission for your selected calendar.' });
  assert.equal((await call(client, 'get_native_client_status')).capabilities.calendar.nextStep, 'Open Calendar in Codex and approve its read permission for your selected calendar.');
  assert.equal((await client.callTool({ name: 'report_native_connection', arguments: { assistant: 'claude-code', kind: 'browser', status: 'available', observedAt: new Date().toISOString() } })).isError, true);
  const unbound = await connect(null);
  assert.equal((await unbound.callTool({ name: 'report_native_connection', arguments: { assistant: 'codex', kind: 'browser', status: 'available', observedAt: new Date().toISOString() } })).isError, true);
  assert.equal(store.getNativeClientStatus({ assistant: 'claude-code' }).capabilities.browser.status, 'unknown');
});

test('Native MCP proxies new Run authority, enforces active form claims and permits only original-actor late reconciliation', async t => {
  const { store, connect, requests } = await fixture(t), client = await connect();
  const started = await call(client, 'start_native_run', startInput), runId = started.run.id;
  assert.ok(requests.some(request => request.path === '/api/native/runs'));
  const compact = await call(client, 'get_native_run', { runId }); assert.equal(compact.native, true); assert.equal(Object.hasOwn(compact, 'companyIds'), false);
  const lease = await call(client, 'claim_native_target', { runId }), key = ownership(lease);
  assert.equal((await client.callTool({ name: 'prepare_form_submission', arguments: { runId, companyId: 'alpha', role: 'Engineer', purpose: 'application', url: 'https://careers.example.com/form' } })).isError, true);
  assert.equal((await client.callTool({ name: 'prepare_form_submission', arguments: { ...key, claimToken: 'wrong', role: 'Engineer', purpose: 'application', url: 'https://careers.example.com/form' } })).isError, true);
  const form = await call(client, 'prepare_form_submission', { ...key, role: 'Engineer', purpose: 'application', url: 'https://careers.example.com/form' });
  await call(client, 'stop_run', { id: runId });
  const claude = await connect('claude-code');
  const receipt = { id: form.application.id, runId, companyId: 'alpha', outcome: 'confirmed', evidence: 'Actual client-reported confirmation receipt fixture' };
  assert.equal((await claude.callTool({ name: 'resolve_form_submission', arguments: receipt })).isError, true);
  const resolved = await call(client, 'resolve_form_submission', receipt); assert.equal(resolved.appliedAt !== undefined, true);
  const reply = await call(client, 'log_application', { id: resolved.id, runId, companyId: 'alpha', status: 'interview', notes: 'Actual client-reported later interview update' });
  assert.equal(reply.status, 'interview');
  assert.equal((await client.callTool({ name: 'log_application', arguments: { id: resolved.id, runId, companyId: 'alpha', status: 'replied', role: 'Changed immutable role' } })).isError, true);
  assert.equal((await client.callTool({ name: 'check_submission', arguments: { ...key, role: 'Another role' } })).isError, true);
  assert.equal(store.getNativeRun({ runId }).outcomes.applicationsSent, 1);
});

test('Native MCP email never sends, preserves one exact plan and records a same-actor original-account late receipt', async t => {
  const { store, connect, requests } = await fixture(t), client = await connect();
  await call(client, 'report_native_connection', { kind: 'email', status: 'available', observedAt: new Date().toISOString(), provider: 'gmail', accountEmail: 'person@example.test' });
  const started = await call(client, 'start_native_run', startInput), lease = await call(client, 'claim_native_target', { runId: started.run.id });
  const input = { ...ownership(lease), role: 'Engineer', to: 'careers@example.test', subject: 'Application', body: 'Client-owned message fixture' };
  const plan = await call(client, 'prepare_native_email', input); assert.equal(plan.maySend, true);
  const again = await call(client, 'prepare_native_email', { ...input, subject: 'Do not replace original' }); assert.equal(again.maySend, false); assert.equal(again.sendPlan.subject, 'Application');
  await call(client, 'resolve_native_email', { id: plan.application.id, outcome: 'unknown' });
  await call(client, 'stop_run', { id: started.run.id });
  const receipt = { provider: plan.sendPlan.provider, accountId: plan.sendPlan.accountId, providerMessageId: 'actual-sent-receipt-fixture', threadId: 'tracked-thread', sentAt: new Date().toISOString() };
  const claude = await connect('claude-code');
  assert.equal((await claude.callTool({ name: 'resolve_native_email', arguments: { id: plan.application.id, outcome: 'confirmed', receipt } })).isError, true);
  const resolved = await call(client, 'resolve_native_email', { id: plan.application.id, outcome: 'confirmed', receipt });
  assert.equal(resolved.application.evidence.clientReported, true); assert.equal(store.getNativeRun({ runId: started.run.id }).outcomes.emailsSent, 1);
  assert.ok(requests.filter(request => !['/api/health', '/api/agent-config'].includes(request.path)).every(request => /^\/api\/(?:native\/(?:runs|email)|runs\/)/.test(request.path)), 'No provider send endpoint may be called.');
});

test('Native monitor has nine tools, returns client-owned reads and cannot write external state or another actor evidence', async t => {
  const { store, connect, requests } = await fixture(t), monitor = await connect('codex', true);
  const names = (await monitor.listTools()).tools.map(tool => tool.name); assert.equal(names.length, 9); assert.deepEqual([...names].sort(), [...NATIVE_MONITOR_TOOLS].sort());
  for (const name of ['start_native_run', 'start_run', 'prepare_native_email', 'resolve_native_email', 'prepare_form_submission', 'prepare_cv_attachment', 'configure_monitoring', 'get_cv', 'create_calendar_event']) assert.equal((await monitor.callTool({ name, arguments: {} })).isError, true);
  await call(monitor, 'report_native_connection', { kind: 'browser', status: 'available', observedAt: new Date().toISOString(), provider: 'actual-client-browser' });
  const config = store.configureMonitoring({ expectedRevision: 1, explicit: true, patch: { enabled: true, channels: { jobs: true }, scope: { companyIds: ['alpha'] } } }).config;
  const pending = await call(monitor, 'check_updates', { configurationRevision: config.revision, assistant: 'codex', source: { kind: 'jobs', id: 'alpha' } });
  assert.equal(pending.readRequest.executionOwner, 'native-client'); assert.equal(pending.readRequest.url, 'https://careers.example.com/jobs'); assert.equal(pending.page, undefined);
  const proof = { id: pending.check.id, token: pending.check.token, status: 'checked', complete: true, sourceRead: { method: 'native_browser', url: pending.readRequest.url, observedAt: new Date().toISOString(), evidence: 'Native client read this exact source in the isolated fixture.' }, observations: [{ externalId: 'observed-job', title: 'Engineer', evidence: { url: 'https://careers.example.com/job/1' } }] };
  const claude = await connect('claude-code'); assert.equal((await claude.callTool({ name: 'record_monitoring_observations', arguments: proof })).isError, true);
  const result = await call(monitor, 'record_monitoring_observations', proof); assert.equal(result.check.status, 'checked'); assert.equal(result.check.cursor, null);
  assert.equal((await call(monitor, 'list_updates')).total, 1); assert.equal(store.listRuns().length, 0); assert.equal(store.listApplications().length, 0);
  assert.ok(requests.every(request => ['/api/health', '/api/agent-config', '/api/monitoring/check', '/api/monitoring/observations'].includes(request.path)));
});
