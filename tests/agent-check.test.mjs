import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, access, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { openStore } from '../server/store.mjs';
import { createAgentCheck } from '../server/agent-check.mjs';

async function fixture(t, execute, overrides = {}) {
  const prefix = join(tmpdir(), 'tawdheef-agent-proof-test-'), dataDir = await mkdtemp(prefix);
  let current = new Date('2026-11-14T08:00:00Z');
  const clock = () => current;
  const store = openStore({ dataDir, seed: false, clock });
  store.updateSettings({ cvText: 'Private fixture CV must never enter the probe.' });
  const service = createAgentCheck({ store, port: 4000, clock, discover: async () => ['codex', 'claude-code'].map(id => ({ id, installed: true, command: 'fixture-not-a-real-model', args: [], version: '1.2.3' })), makeConfig: async ({ dataDir }) => ({ mcpServers: { 'apply-tracker': { command: process.execPath, args: ['fixture-mcp'], env: { APPLY_TRACKER_DATA: dataDir, APPLY_TRACKER_OPERATOR_RUN: 'old-run', APPLY_TRACKER_MONITOR: '1' } }, playwright: { command: 'must-not-launch' } } }), isolateCodex: async () => ({ serverName: 'tawdheef-check-fixture', args: ['-c', 'mcp_servers."fixture-global".enabled=false'] }), execute, ...overrides });
  t.after(async () => { await service.close(); store.close(); assert.ok(resolve(dataDir).startsWith(resolve(prefix))); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); });
  return { store, service, dataDir, advance: ms => { current = new Date(+current + ms); }, clock };
}

const proof = async (args, tools = ['get_agent_context', 'get_capabilities']) => writeFile(args.env.APPLY_TRACKER_DIAGNOSTIC_RECEIPT, JSON.stringify({ tools, checkedAt: '2026-11-14T08:00:00Z' }));

test('only an explicit request starts a probe; missing CLI does not claim native desktop is missing', async t => {
  let discoveries = 0, executions = 0;
  const { service, store } = await fixture(t, async () => { executions++; }, { discover: async () => { discoveries++; return []; } });
  assert.equal(service.get().status, 'not_checked');
  assert.equal(service.get().modelAccessVerified, false);
  await assert.rejects(service.verify({ assistant: 'codex' }), /explicitly/);
  await assert.rejects(service.verify({ assistant: 'other', explicit: true }), /Codex/);
  assert.equal(discoveries, 0); assert.equal(executions, 0);
  store.updateSettings({ preferredAssistant: 'claude-code' });
  const check = await service.verify({ explicit: true });
  assert.equal(check.assistant, 'claude-code'); assert.equal(check.category, 'assistant_missing');
  assert.equal(check.modelAccessVerified, false); assert.equal(executions, 0);
  assert.match(check.nextStep, /optional test.*CLI/); assert.match(check.nextStep, /desktop automation readiness is separate/);
});

test('finished process plus two actual fixture calls verifies only a fresh observed check and keeps real data out', async t => {
  let launch;
  const usage = { schemaVersion: 1, source: 'codex.turn.completed', inputTokens: 32, cachedInputTokens: 16, outputTokens: 4, rawText: 'Private model output', sessionId: 'private-session' };
  const { service, store, dataDir, clock, advance } = await fixture(t, async args => {
    launch = args;
    assert.notEqual(args.env.APPLY_TRACKER_DATA, dataDir);
    assert.equal(args.env.APPLY_TRACKER_DIAGNOSTIC, '1');
    assert.equal(args.env.APPLY_TRACKER_MONITOR, '0'); assert.equal(args.env.APPLY_TRACKER_OPERATOR_RUN, '');
    assert.equal(args.timeoutMs, 120_000); assert.equal(args.args[args.args.indexOf('--sandbox') + 1], 'read-only');
    assert.ok(!args.args.some(value => /must-not-launch|bypass/.test(value)));
    assert.ok(args.args.some(value => value.includes('enabled_tools=') && value.includes('get_capabilities')));
    assert.equal(args.args[args.args.indexOf('-c') + 1], 'mcp_servers."fixture-global".enabled=false');
    assert.match(args.prompt, /Call ONLY/); assert.ok(!args.prompt.includes('Private fixture CV'));
    const empty = openStore({ dataDir: args.env.APPLY_TRACKER_DATA, seed: false });
    try { assert.equal(empty.listDirectories().length, 0); assert.equal(empty.getSettings().cvText, ''); assert.equal(empty.listRuns().length, 0); }
    finally { empty.close(); }
    await proof(args);
    return { status: 'finished', durationMs: 125, usage, clientVersion: '2.3.4', sessionId: 'private-session', reason: 'Private error details' };
  });
  const check = await service.verify({ assistant: 'codex', explicit: true });
  assert.equal(check.status, 'ready'); assert.equal(check.modelAccessVerified, true);
  assert.equal(check.clientVersion, '2.3.4'); assert.equal(check.durationMs, 125);
  assert.equal(check.usage.inputTokens, 32); assert.equal(check.usage.reasoningOutputTokens, null);
  assert.equal(check.lastSuccessAt, check.checkedAt); assert.match(check.nextStep, /does not guarantee future/);
  assert.equal(JSON.stringify(check).includes('Private'), false); assert.equal(JSON.stringify(check).includes('private-session'), false);
  await assert.rejects(access(dirname(launch.cwd)), { code: 'ENOENT' });
  const reloaded = openStore({ dataDir, seed: false, clock });
  try { assert.deepEqual(reloaded.getAssistantCheck({ assistant: 'codex' }), store.getAssistantCheck({ assistant: 'codex' })); }
  finally { reloaded.close(); }
  advance(24 * 60 * 60_000 + 1);
  const expired = service.get({ assistant: 'codex' });
  assert.equal(expired.status, 'needs_you'); assert.equal(expired.modelAccessVerified, false);
  assert.equal(expired.category, 'check_expired'); assert.equal(expired.lastSuccessAt, check.checkedAt);
  assert.equal(service.get({ assistant: 'claude-code' }).status, 'not_checked');
});

test('success text, missing/partial/foreign proofs and failed processes cannot establish model access', async t => {
  for (const scenario of ['missing', 'one-tool', 'foreign-tool', 'malformed', 'failed-with-proof']) {
    let cwd;
    const { service } = await fixture(t, async args => {
      cwd = args.cwd;
      if (scenario === 'one-tool') await proof(args, ['get_agent_context']);
      if (scenario === 'foreign-tool') await proof(args, ['get_agent_context', 'get_capabilities', 'get_cv']);
      if (scenario === 'malformed') await writeFile(args.env.APPLY_TRACKER_DIAGNOSTIC_RECEIPT, 'not-json');
      if (scenario === 'failed-with-proof') await proof(args);
      return { status: scenario === 'failed-with-proof' ? 'failed' : 'finished', reason: 'Ready; private provider text', stdout: 'Ready' };
    });
    const check = await service.verify({ assistant: 'codex', explicit: true });
    assert.equal(check.modelAccessVerified, false, scenario); assert.equal(check.status, 'needs_you', scenario);
    assert.equal(check.category, scenario === 'failed-with-proof' ? 'probe_failed' : 'tool_proof_missing');
    assert.equal(JSON.stringify(check).includes('private provider text'), false);
    await assert.rejects(access(dirname(cwd)), { code: 'ENOENT' });
  }
});

test('polling and concurrent requests share one explicit test; Claude keeps default permissions and just two tool permissions', async t => {
  let release, started, executions = 0;
  const begun = new Promise(resolve => { started = resolve; });
  const { service } = await fixture(t, async args => {
    executions++;
    assert.equal(args.args[args.args.indexOf('--permission-mode') + 1], 'default');
    assert.equal(args.args[args.args.indexOf('--tools') + 1], '');
    assert.equal(args.args[args.args.indexOf('--allowedTools') + 1], 'mcp__apply-tracker__get_agent_context,mcp__apply-tracker__get_capabilities');
    assert.equal(Object.keys(JSON.parse(args.args[args.args.indexOf('--mcp-config') + 1]).mcpServers).join(','), 'apply-tracker');
    started(); await new Promise(resolve => { release = resolve; }); await proof(args); return { status: 'finished' };
  });
  const first = service.verify({ assistant: 'claude-code', explicit: true }); await begun;
  assert.equal(service.get({ assistant: 'claude-code' }).status, 'checking');
  assert.equal(service.get({ assistant: 'claude-code' }).modelAccessVerified, false);
  const second = service.verify({ assistant: 'claude-code', explicit: true });
  release(); const results = await Promise.all([first, second]);
  assert.equal(executions, 1); assert.deepEqual(results[0], results[1]); assert.equal(results[0].status, 'ready');
});

test('probe errors and shutdown expose only generic categories and clean isolated fixtures', async t => {
  for (const [result, category] of [[{ status: 'needs_you', configurationError: true }, 'configuration'], [{ status: 'needs_you', configurationError: true, configurationField: 'model_reasoning_effort' }, 'reasoning_setting'], [{ status: 'needs_you' }, 'model_access'], [{ status: 'failed', terminationUnconfirmed: true }, 'probe_interrupted']]) {
    const { service } = await fixture(t, async () => ({ ...result, reason: 'Private account details' }));
    const check = await service.verify({ assistant: 'codex', explicit: true });
    assert.equal(check.category, category); assert.equal(check.modelAccessVerified, false);
    assert.equal(JSON.stringify(check).includes('Private account'), false);
  }
  let started, cwd;
  const begun = new Promise(resolve => { started = resolve; });
  const { service } = await fixture(t, async args => {
    cwd = args.cwd; started();
    return new Promise(resolve => args.signal.addEventListener('abort', () => resolve({ status: 'stopped' }), { once: true }));
  });
  const pending = service.verify({ assistant: 'codex', explicit: true }); await begun; await service.close();
  assert.equal((await pending).category, 'probe_interrupted');
  await assert.rejects(access(dirname(cwd)), { code: 'ENOENT' });
});

test('durable check metadata rejects raw output, malformed usage and caller timestamps; interrupted state expires', async t => {
  const { store, advance } = await fixture(t, async () => { throw new Error('Must not execute'); });
  const base = { assistant: 'codex', status: 'ready' };
  for (const extra of [{ stdout: 'private' }, { checkedAt: '2026-11-14T08:00:00Z' }, { category: 'private-error' }, { clientVersion: 'private account' }, { durationMs: -1 }, { usage: { schemaVersion: 1, source: 'codex.turn.completed', inputTokens: -1 } }, { usage: { schemaVersion: 1, source: 'codex.turn.completed', sessionId: 'private' } }]) assert.throws(() => store.recordAssistantCheck({ ...base, ...extra }));
  assert.equal(store.getAssistantCheck({ assistant: 'codex' }).status, 'not_checked');
  store.recordAssistantCheck({ assistant: 'codex', status: 'checking' });
  advance(150_001);
  const stale = store.getAssistantCheck({ assistant: 'codex' });
  assert.equal(stale.status, 'needs_you'); assert.equal(stale.modelAccessVerified, false); assert.equal(stale.category, 'probe_interrupted');
});

test('unconfirmed process termination blocks later model probes across service restart without exposing process details', async t => {
  let executions = 0;
  const { service, store, dataDir, clock } = await fixture(t, async args => {
    executions++; await args.onSpawn(process.pid);
    return { status: 'needs_you', terminationUnconfirmed: true, pid: process.pid, reason: 'Private details' };
  });
  const first = await service.verify({ assistant: 'codex', explicit: true });
  assert.equal(first.category, 'probe_interrupted');
  const ownership = JSON.parse(await readFile(join(dataDir, 'agent-check-process-codex.json'), 'utf8'));
  assert.equal(ownership.pid, process.pid); assert.deepEqual(Object.keys(ownership).sort(), ['assistant', 'pid', 'startedAt']);
  assert.equal(Object.hasOwn(first, 'pid'), false);
  await service.verify({ assistant: 'codex', explicit: true });
  const restarted = createAgentCheck({ store, clock, execute: async () => { throw new Error('Must not launch while old process is live'); } });
  const blocked = await restarted.verify({ assistant: 'codex', explicit: true });
  assert.equal(blocked.category, 'probe_interrupted'); assert.equal(executions, 1);
});
