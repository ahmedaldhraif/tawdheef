import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { benchmarkBrowser, resolveAppRoot, observeVisibleIdle } from '../scripts/browser-benchmark.mjs';

const idleState = { hidden: false, visibilityState: 'visible', activeElement: 'BODY', editableFocused: false, rafCalls: 0 };

test('visible idle observer allows a late real GET without forcing or inventing a refresh', async () => {
  let elapsed = 0; const requests = [], waits = [];
  const result = await observeVisibleIdle({
    page: { evaluate: async () => idleState }, requests, now: () => elapsed,
    wait: async ms => { waits.push(ms); elapsed += ms; if (elapsed >= 18300 && !requests.length) requests.push({ method: 'GET', url: 'http://127.0.0.1:4001/api/companies?directoryId=fixture' }); },
  });
  assert.equal(waits[0], 16100); assert.equal(result.observedMs, 18300);
  assert.deepEqual(result.requests, ['/api/companies']); assert.equal(result.requestAnimationFrameCalls, 0);
  assert.equal(result.before.activeElement, 'BODY'); assert.equal(result.after.visibilityState, 'visible');
});

test('visible idle watchdog still fails when no actual company GET arrives', async () => {
  for (const request of [null, { method: 'GET', url: 'http://127.0.0.1:4001/api/bootstrap' }, { method: 'POST', url: 'http://127.0.0.1:4001/api/companies' }]) {
    let elapsed = 0; const requests = [];
    await assert.rejects(observeVisibleIdle({
      page: { evaluate: async () => idleState }, requests, now: () => elapsed,
      wait: async ms => { elapsed += ms; if (request && !requests.length) requests.push(request); },
    }), error => error.message.includes('Visible idle app refresh must remain active') && error.message.includes('"observedMs":30000'));
    assert.equal(elapsed, 30000);
  }
});

test('browser benchmark resolves extracted native Mac packages without requiring a writable app bundle', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'tawdheef-browser-benchmark-layout-'));
  t.after(() => rm(directory, { recursive: true, force: true, maxRetries: 5 }));
  const codeRoot = join(directory, 'tawdheef/Tawdheef.app/Contents/Resources/app');
  for (const file of ['server/index.mjs', 'server/store.mjs', 'dist/index.html']) {
    await mkdir(join(codeRoot, file, '..'), { recursive: true }); await writeFile(join(codeRoot, file), 'Fixture only');
  }
  assert.equal(await resolveAppRoot(directory), codeRoot);
  assert.equal(await resolveAppRoot(join(directory, 'tawdheef/Tawdheef.app')), codeRoot);
  assert.equal(await resolveAppRoot(codeRoot), codeRoot);
  await assert.rejects(resolveAppRoot(join(directory, 'missing')), /complete built app directory/);
});

test('browser benchmark refuses existing outputs before starting an app or creating fixture records', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'tawdheef-browser-benchmark-output-'));
  t.after(() => rm(directory, { recursive: true, force: true, maxRetries: 5 }));
  const output = join(directory, 'keep.json'); await writeFile(output, 'Existing result');
  await assert.rejects(benchmarkBrowser({ app: join(directory, 'missing'), output }), /Output already exists/);
  assert.equal(await readFile(output, 'utf8'), 'Existing result');
});
