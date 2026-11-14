import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from '../server/store.mjs';

test('durable attempt usage rejects raw text and malformed counters before finishing a target', async t => {
  const prefix = join(tmpdir(), 'tawdheef-usage-store-'), dataDir = await mkdtemp(prefix);
  const store = openStore({ dataDir, seed: false });
  t.after(async () => { store.close(); assert.ok(resolve(dataDir).startsWith(resolve(prefix))); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); });
  store.createDirectory({ id: 'fixture', name: 'Fixture' });
  const companyId = store.addCompanies('fixture', [{ name: 'Synthetic company' }]).ids[0];
  const run = store.startManagedRun({ directoryId: 'fixture', assistant: 'codex', mode: 'send_and_submit', explicit: true });
  store.beginRunTarget(run.id, companyId);
  const base = { schemaVersion: 1, source: 'codex.turn.completed' };
  for (const usage of [
    { ...base, inputTokens: -1 }, { ...base, outputTokens: '100' },
    { ...base, cachedInputTokens: 1.5 }, { ...base, clientEstimatedCostUsd: Infinity },
    { ...base, reasoning: 'Private model text' }, { ...base, schemaVersion: 2 },
  ]) {
    assert.throws(() => store.finishRunTarget(run.id, companyId, { status: 'checked', usage }));
    assert.equal(store.getRun(run.id).targets[0].status, 'working');
  }
  assert.throws(() => store.finishRunTarget(run.id, companyId, { status: 'checked', durationMs: NaN }), /duration/);
  const usage = { ...base, inputTokens: 100, cachedInputTokens: null, outputTokens: 12, clientEstimatedCostUsd: null };
  store.finishRunTarget(run.id, companyId, { status: 'checked', usage, durationMs: 125.5 });
  const saved = store.getRun(run.id).targets[0];
  assert.deepEqual(saved.usage, usage);
  assert.equal(saved.durationMs, 125.5);
  assert.equal(Object.hasOwn(saved.usage, 'toolCalls'), false, 'unavailable usage must not become zero');
});
