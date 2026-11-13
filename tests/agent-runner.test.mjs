import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { openStore } from '../server/store.mjs';
import { createAgentRunner, launchArguments, executeAssistant } from '../server/agent-runner.mjs';
import { guardOperatorCall } from '../server/operator-contract.mjs';

async function fixture(t, execute, count = 3, overrides = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'tawdheef-queue-'));
  const store = openStore({ dataDir, seed: false });
  store.createDirectory({ id: 'test', name: 'Test' });
  const ids = store.addCompanies('test', Array.from({ length: count }, (_, i) => ({ name: `Company ${i}`, email: 'jobs@example.test' }))).ids;
  const runner = createAgentRunner({ store, port: 4000, discover: async () => [{ id: 'codex', installed: true, command: process.execPath, args: [] }], presets: async () => [], makeConfig: async () => ({ mcpServers: { 'apply-tracker': { command: process.execPath, args: [], env: {} } } }), execute: args => execute(args, store, ids), ...overrides });
  t.after(async () => { await runner.close(); store.close(); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); });
  const start = () => runner.start({ directoryId: 'test', assistant: 'codex', mode: 'send_and_submit', explicit: true });
  return { store, ids, runner, start };
}

test('queue attempts all 125 targets, continues on failure, skips evidenced submissions on the next Run', async t => {
  let attempts = 0;
  const { store, runner, start, ids } = await fixture(t, async (_, store, ids) => {
    attempts++;
    const run = store.listRuns().find(r => r.status === 'running'), companyId = run.activeCompanyId;
    if (companyId === ids[0]) throw new Error('one company failed');
    if (companyId === ids[1]) store.logApplication({ companyId, runId: run.id, status: 'applied', role: 'Engineer', evidence: { receipt: 'fixture-receipt' } });
    else store.logApplication({ companyId, runId: run.id, status: 'prepared', notes: 'No suitable opening.' });
    return { status: 'finished' };
  }, 125);
  const run = await start(); await runner.settled();
  const finished = store.getRun(run.id);
  assert.equal(attempts, 125); assert.equal(finished.completed, 125); assert.equal(finished.status, 'completed');
  assert.equal(finished.targets[0].status, 'failed'); assert.equal(finished.targets[1].status, 'applied');
  assert.equal(store.runSummaries()[0].appliedCount, 1);
  const next = await start(); await runner.settled();
  assert.equal(next.companyIds.length, 124); assert.ok(next.companyIds.includes(ids[0])); assert.ok(!next.companyIds.includes(ids[1]));
});

test('Stop revokes authority before abort, stops the queue, and restart requires an explicit new Run', async t => {
  let resolveStarted;
  const started = new Promise(resolve => { resolveStarted = resolve; });
  const { store, runner, start } = await fixture(t, async ({ signal }, store) => {
    resolveStarted();
    return new Promise(resolve => signal.addEventListener('abort', () => { assert.equal(store.listRuns()[0].status, 'cancelled'); resolve({ status: 'stopped' }); }, { once: true }));
  });
  const run = await start(); await started;
  await assert.rejects(start(), /already.*working/);
  await runner.stop(run.id);
  assert.equal(store.getRun(run.id).status, 'cancelled');
  assert.equal(store.getRun(run.id).targets[1].status, 'pending');
  const stale = store.startManagedRun({ directoryId: 'test', assistant: 'codex', mode: 'send_and_submit', explicit: true });
  const restarted = createAgentRunner({ store, port: 4000 });
  assert.equal(store.getRun(stale.id).status, 'cancelled'); await restarted.close();
});

test('operator tools cannot change UI/settings, another company or run, and cannot submit after Stop', async t => {
  const { store, ids } = await fixture(t, async () => ({ status: 'finished' }));
  const r = store.startManagedRun({ directoryId: 'test', assistant: 'codex', explicit: true, mode: 'send_and_submit' });
  store.beginRunTarget(r.id, ids[0]); const scope = { runId: r.id, companyId: ids[0] };
  assert.throws(() => guardOperatorCall(store, 'update_settings', {}, scope), /not available/);
  assert.throws(() => guardOperatorCall(store, 'update_company', { id: ids[1], patch: {} }, scope), /assigned/);
  assert.throws(() => guardOperatorCall(store, 'update_company', { id: ids[0], patch: { status: 'applied' } }, scope), /log_application/);
  assert.throws(() => store.checkSubmission({ runId: r.id, companyId: ids[1] }), /explicit run/);
  store.updateRun(r.id, { status: 'cancelled' });
  assert.throws(() => guardOperatorCall(store, 'get_company', { id: ids[0] }, scope), /stopped/);
});

test('assistant command keeps sandbox and permissions intact', () => {
  const codex = launchArguments('codex', { 'apply-tracker': { command: 'node', args: ['mcp.mjs'], env: {} } }, '/fixture');
  assert.ok(codex.includes('read-only')); assert.ok(!codex.some(a => /bypass|ignore-rules/.test(a)));
  const claude = launchArguments('claude-code', {}, '/fixture');
  assert.ok(claude.includes('default')); assert.ok(!claude.some(a => /bypass|acceptEdits/.test(a)));
});

test('real subprocess nonzero exits and a stalled company terminate without exposing output', async () => {
  const result = await executeAssistant({ executable: process.execPath, args: ['-e', 'process.stderr.write("private text");process.exit(1)'], cwd: process.cwd(), env: process.env });
  assert.equal(result.status, 'failed'); assert.ok(!JSON.stringify(result).includes('private text'));
  const timeout = await executeAssistant({ executable: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], cwd: process.cwd(), env: process.env, timeoutMs: 120 });
  assert.equal(timeout.status, 'failed'); assert.match(timeout.reason, /too long/);
});

test('a child that refuses to terminate returns a bounded blocker instead of hanging Stop', async () => {
  const fakeSpawn = () => { const child = new EventEmitter(); child.pid = 2147483647; child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => false; return child; };
  const result = await executeAssistant({ executable: 'fixture', args: [], prompt: '', cwd: process.cwd(), env: {}, timeoutMs: 5, terminationMs: 10, spawnProcess: fakeSpawn });
  assert.equal(result.terminationUnconfirmed, true); assert.equal(result.global, true); assert.equal(result.status, 'needs_you');
});

test('queue blockers appear in Needs you and compact bootstrap omits target arrays', async t => {
  const { store, runner, start } = await fixture(t, async () => ({ status: 'needs_you', global: true, reason: 'Sign in to the assistant.' }));
  const run = await start(); await runner.settled();
  assert.equal(store.getRun(run.id).status, 'failed');
  assert.equal(store.listCompanies({ directoryId: 'test', attention: 'needs_you' }).total, 1);
  assert.equal(store.report().needsYou.length, 1);
  const summary = store.runSummaries()[0]; assert.equal(summary.total, 3); assert.equal(summary.targets, undefined); assert.equal(summary.companyIds, undefined);
});

test('form intent survives a stopped run and only receipt inspection or explicit user resolution clears ambiguity', async t => {
  const { store, ids } = await fixture(t, async () => ({ status: 'finished' }));
  const first = store.startRun({ companyIds: [ids[0]], mode: 'send_and_submit', explicit: true });
  const input = { companyId: ids[0], runId: first.id, role: 'Engineer', url: 'https://example.test/application' };
  const reserved = store.prepareFormSubmission(input);
  assert.equal(reserved.application.deliveryStatus, 'unknown'); assert.equal(store.prepareFormSubmission(input).reused, true);
  store.updateRun(first.id, { status: 'cancelled' });
  const next = store.startRun({ companyIds: [ids[0]], mode: 'send_and_submit', explicit: true });
  assert.throws(() => store.checkSubmission({ ...input, runId: next.id }), /unresolved/);
  assert.throws(() => store.resolveFormSubmission({ id: reserved.application.id, outcome: 'not_submitted', evidence: 'No receipt' }), /explicitly/);
  const actual = store.resolveFormSubmission({ id: reserved.application.id, outcome: 'confirmed', evidence: 'https://example.test/confirmation/fixture-receipt' });
  assert.equal(actual.status, 'applied'); assert.equal(actual.deliveryStatus, 'confirmed');
  assert.ok(!store.remainingCompanies({ directoryId: 'test' }).some(c => c.id === ids[0]));
});

test('concurrent preflights cannot launch over a live assistant whose termination failed', async t => {
  let release, entered; const gate = new Promise(resolve => { release = resolve; }); const ready = new Promise(resolve => { entered = resolve; }); let executions = 0;
  const { runner, start } = await fixture(t, async ({ onSpawn }) => { executions++; await onSpawn(process.pid); return { status: 'needs_you', global: true, terminationUnconfirmed: true, pid: process.pid, reason: 'Fixture could not terminate.' }; }, 2, { checkReady: async () => { entered(); await gate; } });
  const first = start(); await ready;
  await assert.rejects(start(), /already.*starting/);
  release(); await first; await runner.settled();
  await assert.rejects(start(), /previous assistant process/);
  assert.equal(executions, 1);
});

test('reconciling a form receipt preserves an interview status and its next action', async t => {
  const { store, ids } = await fixture(t, async () => ({ status: 'finished' }));
  const run = store.startRun({ companyIds: [ids[0]], mode: 'send_and_submit', explicit: true });
  const intent = store.prepareFormSubmission({ companyId: ids[0], runId: run.id, role: 'Engineer', url: 'https://example.test/apply' }).application;
  store.logApplication({ id: intent.id, companyId: ids[0], status: 'interview', notes: 'Interview agreed for Tuesday.' });
  const before = store.getCompany(ids[0]);
  const resolved = store.resolveFormSubmission({ id: intent.id, outcome: 'confirmed', evidence: 'Application receipt fixture-42' });
  assert.equal(resolved.status, 'interview'); assert.match(resolved.notes, /Interview agreed/);
  assert.equal(store.getCompany(ids[0]).nextAction, before.nextAction); assert.equal(store.getCompany(ids[0]).status, 'interview');
});
