import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server/store.mjs';
import { sendEmailForRun, reconcileApplicationEmail } from '../server/email-send.mjs';
import { expandMapping } from '../server/connections.mjs';

async function fixture(t, options = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'apply-reconcile-'));
  let current = new Date('2026-11-13T08:00:00Z');
  const store = openStore({ dataDir, seed: false, clock: () => current });
  store.createDirectory({ id: 'fixture', name: 'Fixture' });
  const companyId = store.addCompanies('fixture', [{ name: 'Fixture employer', email: 'careers@example.test' }]).ids[0];
  const run = store.startRun({ directoryId: 'fixture', companyIds: [companyId], mode: 'send_and_submit', explicit: true });
  const calls = [], reads = [];
  const mappings = {
    sendEmail: { tool: 'fixture.send', arguments: { to: '{{to}}', subject: '{{subject}}', body: '{{body}}', idempotencyKey: '{{idempotencyKey}}' } },
    reconcileSend: { tool: 'fixture.reconcile', arguments: { idempotencyKey: '{{idempotencyKey}}' } },
  };
  const connections = {
    getMappings: () => mappings,
    tools: async () => [{ name: 'fixture.send', annotations: { readOnlyHint: false } }, { name: 'fixture.reconcile', annotations: { readOnlyHint: true } }],
    async call(kind, name, args) {
      if (name === 'fixture.reconcile') {
        reads.push({ kind, tool: name, args });
        if (options.reconcileThrows) throw new Error('Fixture read temporarily unavailable.');
        return options.receipt || { structuredContent: { status: 'sent', sent: true, messageId: 'fixture-sent-message', threadId: 'fixture-thread' } };
      }
      calls.push({ kind, name, args });
      if (name !== 'fixture.send') throw new Error('Fixture write path is only for the initial send.');
      if (options.sendThrows) throw new Error('Fixture send response was lost.');
      return { structuredContent: { status: 'unknown', messageId: 'fixture-draft', needsUser: true } };
    },
    async callMapped(kind, action, context) {
      const mapping = mappings[action];
      const args = expandMapping(mapping.arguments || {}, context);
      return this.call(kind, mapping.tool, args);
    },
  };
  const input = { companyId, role: 'Engineer', to: 'careers@example.test', subject: 'Fixture application', body: 'Local test only.' };
  const sent = await sendEmailForRun({ store, connections, runId: run.id, input });
  assert.equal(sent.application.deliveryStatus, 'unknown');
  t.after(async () => { store.close(); await rm(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  return { store, connections, mappings, input, run, companyId, applicationId: sent.application.id, calls, reads, setTime: value => { current = new Date(value); }, reconcile: () => reconcileApplicationEmail({ store, connections, applicationId: sent.application.id }) };
}

for (const status of ['running', 'completed', 'cancelled', 'failed', 'expired']) {
  test(`email reconciliation confirms the existing intent after a ${status} run without another send`, async t => {
    const f = await fixture(t, { sendThrows: status === 'failed' });
    if (status === 'expired') f.setTime('2026-11-13T10:00:00Z');
    else if (status !== 'running') f.store.updateRun(f.run.id, { status });
    assert.equal(f.store.getRun(f.run.id).status, status);
    const original = f.store.listApplications()[0];
    const response = await f.reconcile();
    assert.equal(response.application.id, original.id);
    assert.equal(response.application.idempotencyKey, original.idempotencyKey);
    assert.equal(response.application.runId, f.run.id);
    assert.equal(response.application.status, 'applied');
    assert.equal(response.application.deliveryStatus, 'confirmed');
    assert.equal(response.application.providerMessageId, 'fixture-sent-message');
    assert.equal(response.application.threadId, 'fixture-thread');
    assert.equal(f.store.listApplications().length, 1);
    assert.equal(f.calls.length, 1);
    assert.equal(f.reads.length, 1);
    assert.deepEqual(f.reads[0].args, { idempotencyKey: original.idempotencyKey });
    assert.equal(f.store.getRun(f.run.id).status, status);
    assert.match(response.application.notes, /No new email was sent/);
    const repeated = await f.reconcile();
    assert.equal(repeated.reused, true);
    assert.equal(f.calls.length, 1);
    assert.equal(f.reads.length, 1);
  });
}

test('concurrent email reconciliation keeps one application and one confirmation activity', async t => {
  const f = await fixture(t);
  const results = await Promise.all([f.reconcile(), f.reconcile()]);
  assert.equal(results[0].application.id, results[1].application.id);
  assert.equal(f.store.listApplications().length, 1);
  assert.equal(f.calls.length, 1);
  assert.equal(f.store.listActivity({ companyId: f.companyId }).filter(item => item.action === 'applied').length, 1);
});

test('draft and approval results stay uncertain without changing the stored send intent', async t => {
  const f = await fixture(t, { receipt: { structuredContent: { messageId: 'fixture-draft', status: 'draft', approvalRequired: true } } });
  const original = f.store.listApplications()[0];
  const checked = await f.reconcile();
  assert.equal(checked.status, 'needs_user');
  assert.deepEqual(f.store.listApplications()[0], original);
  assert.equal(f.calls.length, 1);
  assert.equal(f.reads.length, 1);
});

test('failed reconciliation reads leave the durable unknown outcome intact', async t => {
  const f = await fixture(t, { reconcileThrows: true });
  const original = f.store.listApplications()[0];
  await assert.rejects(f.reconcile(), /read temporarily unavailable/);
  assert.deepEqual(f.store.listApplications()[0], original);
  assert.equal(f.calls.length, 1);
});

test('reconciliation rejects a missing or writable mapping without invoking the provider', async t => {
  const f = await fixture(t);
  delete f.mappings.reconcileSend;
  await assert.rejects(f.reconcile(), /cannot reconcile automatically/);
  assert.equal(f.reads.length, 0);
  f.mappings.reconcileSend = { tool: 'fixture.send', arguments: { idempotencyKey: '{{idempotencyKey}}' } };
  await assert.rejects(f.reconcile(), /read.only|read only|inspect/i);
  assert.equal(f.calls.length, 1);
  assert.equal(f.reads.length, 0);
  f.mappings.reconcileSend = { tool: 'fixture.reconcile', arguments: { idempotencyKey: '{{idempotencyKey}}' } };
  f.connections.tools = async () => [{ name: 'fixture.reconcile' }];
  await assert.rejects(f.reconcile(), /read.only|read only|inspect/i);
  assert.equal(f.reads.length, 0);
});

for (const status of ['replied', 'interview', 'offer', 'closed']) {
  test(`late email reconciliation preserves the ${status} stage already recorded by the user`, async t => {
    const f = await fixture(t);
    f.store.logApplication({ id: f.applicationId, companyId: f.companyId, method: 'email', status, notes: 'Progress recorded manually' });
    assert.equal(f.store.getCompany(f.companyId).status, status);
    const beforeCompany = f.store.getCompany(f.companyId);
    const checked = await f.reconcile();
    assert.equal(checked.application.deliveryStatus, 'confirmed');
    assert.equal(checked.application.status, status);
    assert.match(checked.application.notes, /Progress recorded manually/);
    assert.equal(f.store.getCompany(f.companyId).status, status);
    assert.equal(f.store.getCompany(f.companyId).nextAction, beforeCompany.nextAction);
    assert.equal(f.store.getCompany(f.companyId).attention, beforeCompany.attention);
    assert.equal(f.calls.length, 1);
  });
}

test('reconciliation pins the read-only tool discovered before a concurrent mapping edit', async t => {
  const f = await fixture(t);
  f.connections.tools = async () => {
    f.mappings.reconcileSend = { tool: 'fixture.send', arguments: { idempotencyKey: '{{idempotencyKey}}' } };
    return [{ name: 'fixture.reconcile', annotations: { readOnlyHint: true } }];
  };
  const checked = await f.reconcile();
  assert.equal(checked.application.deliveryStatus, 'confirmed');
  assert.equal(f.reads[0].tool, 'fixture.reconcile');
  assert.equal(f.calls.length, 1);
});
