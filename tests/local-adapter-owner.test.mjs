import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalAdapterOwner } from '../server/local-adapter-owner.mjs';
const gate = () => { let release; const promise = new Promise(done => { release = done; }); return { promise, release }; };

test('Native startup never loads an adapter and switching during import never constructs legacy sessions', async () => {
  let native = true, loads = 0, constructed = 0;
  const imported = gate(), entered = gate();
  const owner = createLocalAdapterOwner({ isNative: () => native, loadFactory: async () => { loads++; entered.release(); await imported.promise; return () => { constructed++; return { start() {}, async close() {} }; }; } });
  await assert.rejects(owner.get(), /selected Codex/); assert.equal(loads, 0);
  native = false; const pending = owner.modeChanged(true); const rejected = assert.rejects(pending, /selected Codex/);
  await entered.promise; native = true; const retiring = owner.modeChanged(false);
  imported.release(); await rejected; await retiring;
  assert.equal(constructed, 0); await owner.close();
});

test('a replacement owner waits for the previous close and never overlaps provider owners', async () => {
  let native = false, active = 0, maximum = 0, instances = 0;
  const closing = gate(), closeEntered = gate();
  const owner = createLocalAdapterOwner({ isNative: () => native, loadFactory: async () => () => {
    const id = ++instances;
    return { start() { active++; maximum = Math.max(maximum, active); }, async close() { if (id === 1) { closeEntered.release(); await closing.promise; } active--; } };
  } });
  assert.equal(await owner.get(), await owner.get()); assert.equal(instances, 1);
  native = true; const firstSwitch = owner.modeChanged(false); await closeEntered.promise;
  native = false; const secondSwitch = owner.modeChanged(true);
  await Promise.resolve(); assert.equal(instances, 1); assert.equal(active, 1);
  closing.release(); await firstSwitch; await secondSwitch;
  assert.equal(instances, 2); assert.equal(maximum, 1);
  await owner.close(); assert.equal(active, 0); await assert.rejects(owner.get());
});
