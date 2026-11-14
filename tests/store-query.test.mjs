import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { openStore } from '../server/store.mjs';

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'tawdheef-query-'));
  const store = openStore({ dataDir, seed: false, clock: () => new Date('2026-11-13T21:00:00Z') });
  const clients = [];
  const cleanup = [];
  store.createDirectory({ id: 'query', name: 'Query fixture', country: 'AE' });
  store.updateSettings({ timezone: 'Asia/Dubai' });
  t.after(async () => { for (const stop of cleanup) await stop(); for (const client of clients) client.close(); store.close(); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); });
  return { store, dataDir, beforeCleanup: stop => cleanup.push(stop), otherClient: () => { const client = openStore({ dataDir, seed: false }); clients.push(client); return client; } };
}

test('SQL pages preserve Unicode literal search and stable natural ordering in both directions', async t => {
  const { store } = await fixture(t);
  const ids = store.addCompanies('query', [
    { id: 'ten', name: 'Company 10', sector: 'Sector 10', location: 'Dubai' },
    { id: 'two', name: 'Company 2', sector: 'Sector 2', location: 'Abu Dhabi' },
    { id: 'zero-two', name: 'Company 02', sector: 'Sector 2', location: 'Dubai' },
    { id: 'unicode', name: 'İŞ Company', arabicName: 'وظائف تقنية', location: 'Dubai' },
    { id: 'literal', name: '100%_literal', sector: 'Sector 20', sourceRole: 'PORTAL' },
    { id: 'arabic', name: 'وظائف 2', sector: 'Sector 3' },
  ]).ids;
  store.updateCompany('two', { notes: 'Résumé specialist', nextAction: 'Step 2' });
  store.updateCompany('ten', { nextAction: 'Step 10' });
  const original = ids.map(id => store.getCompany(id));
  for (const sort of ['name', 'sector', 'location', 'status', 'lastUpdate', 'nextAction', 'unsupported']) {
    for (const direction of ['asc', 'desc']) {
      const field = sort === 'unsupported' ? 'name' : sort;
      const expected = [...original].sort((a, b) => String(a[field] || '').localeCompare(String(b[field] || ''), undefined, { numeric: true }) * (direction === 'desc' ? -1 : 1));
      const result = store.listCompanies({ directoryId: 'query', sort, direction, offset: 1, limit: 3 });
      assert.deepEqual(result.items.map(row => row.id), expected.slice(1, 4).map(row => row.id), `${sort}/${direction}`);
      assert.equal(result.total, ids.length);
    }
  }
  for (const [search, expected] of [['İŞ', ['unicode']], ['وظائف تقنية', ['unicode']], ['RÉSUMÉ', ['two']], ['%_', ['literal']], ['portal', ['literal']], ['%', ['literal']]]) {
    assert.deepEqual(store.listCompanies({ directoryId: 'query', search }).items.map(row => row.id), expected, search);
  }
  const all = store.listCompanies({ directoryId: 'query' }).items.map(row => row.id);
  assert.deepEqual(store.listCompanies({ directoryId: 'query', offset: 1.8, limit: 1.4 }).items.map(row => row.id), all.slice(1.8, 3.2));
  assert.deepEqual(store.listCompanies({ directoryId: 'query', offset: Infinity }).items, []);
});

test('cached projections refresh after local and separate-client writes without narrowing full-directory facets', async t => {
  const { store, otherClient } = await fixture(t);
  store.addCompanies('query', [
    { id: 'alpha', name: 'Alpha', type: 'Private company', location: 'Dubai / Abu Dhabi' },
    { id: 'beta', name: 'Beta', type: 'Federal government entity', location: 'Dubai' },
  ]);
  const base = store.listCompanies({ directoryId: 'query' });
  const other = otherClient();
  other.updateCompany('beta', { notes: 'Fresh external notes', attention: 'needs_you', followUpAt: '2026-11-14' });
  other.addCompanies('query', [{ id: 'beta', name: 'Company 1', type: 'Private employer', location: 'Sharjah' }]);
  const external = store.listCompanies({ directoryId: 'query', search: 'external', companyTypes: ['private'], locations: ['location:sharjah'], attention: 'follow_up_due', limit: 1 });
  assert.deepEqual(external.items.map(row => row.id), ['beta']);
  assert.equal(external.total, 1);
  assert.equal(external.facets.companyTypes.find(type => type.id === 'private').count, 2);
  assert.deepEqual(external.facets.locations.map(place => place.id), ['location:abu dhabi', 'location:dubai', 'location:sharjah']);
  assert.deepEqual(external.attentionCounts, { needsYou: 1, followUpDue: 1 });
  assert.equal(base.facets.companyTypes.find(type => type.id === 'private').count, 1);
  external.facets.locations[0].label = 'Caller-owned mutation';
  assert.equal(store.listCompanies({ directoryId: 'query' }).facets.locations[0].label, 'Abu Dhabi');
  store.updateCompany('alpha', { archived: true });
  assert.equal(store.listCompanies({ directoryId: 'query' }).total, 1);
  other.addCompanies('query', [{ id: 'gamma', name: 'Company 2', location: 'Unknown' }]);
  const latest = store.listCompanies({ directoryId: 'query' });
  assert.deepEqual(latest.items.map(row => row.id), ['beta', 'gamma']);
  assert.equal(latest.statusCounts.not_started, 2);
});

test('paged progress is derived only from each company history while remaining counts retain submitted evidence', async t => {
  const { store } = await fixture(t);
  store.createDirectory({ id: 'other', name: 'Other directory' });
  store.addCompanies('query', [{ id: 'first', name: 'Company 1' }, { id: 'second', name: 'Company 2' }, { id: 'third', name: 'Company 3' }]);
  store.addCompanies('other', [{ id: 'foreign', name: 'Foreign company' }]);
  const profile = companyId => store.logApplication({ companyId, role: 'Future opportunities', status: 'profile_created', method: 'form', url: `https://example.test/${companyId}/profile`, evidence: 'Synthetic confirmed profile' });
  profile('first'); profile('third'); profile('foreign');
  const run = store.startRun({ directoryId: 'query', companyIds: ['first'], mode: 'send_and_submit', explicit: true });
  store.logApplication({ companyId: 'first', runId: run.id, role: 'Fixture job', method: 'form', status: 'applied', evidence: 'Synthetic submission receipt' });
  store.updateCompany('first', { status: 'ready' });
  const firstPage = store.listCompanies({ directoryId: 'query', limit: 2 });
  assert.equal(firstPage.total, 3);
  assert.equal(firstPage.remainingCount, 2);
  assert.equal(firstPage.items[0].progress.profile_created, 1);
  assert.equal(firstPage.items[0].progress.applied, 1);
  assert.equal(firstPage.items[1].progress.profile_created, 0);
  const nextPage = store.listCompanies({ directoryId: 'query', offset: 2, limit: 2 });
  assert.equal(nextPage.items[0].id, 'third');
  assert.equal(nextPage.items[0].progress.profile_created, 1);
  assert.equal(nextPage.remainingCount, 2);
  assert.equal(store.previewRun({ directoryId: 'query' }).count, 2);
});

test('local edits refresh only affected query facts while ranks, facets and rolled-back source stay correct', async t => {
  const { store } = await fixture(t);
  store.addCompanies('query', [
    { id: 'alpha', name: 'Company 10', type: 'Private company', location: 'Dubai' },
    { id: 'beta', name: 'Company 2', type: 'Federal government', location: 'Abu Dhabi' },
  ]);
  for (const sort of ['name', 'status', 'lastUpdate', 'nextAction', 'sector', 'location']) store.listCompanies({ directoryId: 'query', sort });
  store.updateCompany('alpha', { name: 'Company 1', notes: 'Fresh résumé note', status: 'ready', nextAction: 'Step 1', location: 'Sharjah' });
  store.updateSettings({ timezone: 'Asia/Dubai' });
  const edited = store.listCompanies({ directoryId: 'query', search: 'RÉSUMÉ' });
  assert.deepEqual(edited.items.map(row => row.id), ['alpha']);
  assert.equal(edited.items[0].nextAction, 'Step 1');
  assert.deepEqual(store.listCompanies({ directoryId: 'query' }).items.map(row => row.id), ['alpha', 'beta']);
  assert.deepEqual(store.listCompanies({ directoryId: 'query', sort: 'status' }).items.map(row => row.id), ['beta', 'alpha']);
  assert.deepEqual(edited.facets.locations.map(place => place.id), ['location:abu dhabi', 'location:sharjah']);
  assert.throws(() => store.addCompanies('query', [
    { id: 'alpha', name: 'Uncommitted name', type: 'Federal government', location: 'Never committed' },
    { id: 'invalid', name: '' },
  ]), /name/);
  const restored = store.listCompanies({ directoryId: 'query', companyTypes: ['private'] });
  assert.equal(restored.total, 1);
  assert.equal(restored.items[0].name, 'Company 1');
  assert.deepEqual(restored.facets.locations, edited.facets.locations);
  store.addCompanies('query', [{ id: 'gamma', name: 'Company 02', type: 'Private employer', location: 'Dubai' }]);
  assert.deepEqual(store.listCompanies({ directoryId: 'query' }).items.map(row => row.id), ['alpha', 'beta', 'gamma']);
});

test('list counts, facets and source rows share a snapshot during another client commits', async t => {
  const { store, dataDir, beforeCleanup } = await fixture(t);
  const records = [{ id: 'alpha', name: 'Alpha' }, { id: 'beta', name: 'Beta' }];
  store.addCompanies('query', records.map(record => ({ ...record, type: 'Federal government' })));
  store.listCompanies({ directoryId: 'query' });
  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      const { openStore } = await import(workerData.moduleUrl);
      const store = openStore({ dataDir: workerData.dataDir, seed: false });
      try {
        parentPort.postMessage('ready');
        await new Promise(resolve => parentPort.once('message', resolve));
        for (let index = 0; index < 200; index++) store.addCompanies('query', workerData.records.map(record => ({ ...record, type: index % 2 ? 'Federal government' : 'Private company' })));
      } finally { store.close(); parentPort.close(); }
    })().catch(error => { throw error; });
  `, { eval: true, workerData: { dataDir, records, moduleUrl: new URL('../server/store.mjs', import.meta.url).href } });
  beforeCleanup(() => worker.terminate());
  const finished = once(worker, 'exit');
  assert.deepEqual(await once(worker, 'message'), ['ready']);
  worker.postMessage('start');
  for (let index = 0; index < 300; index++) {
    const result = store.listCompanies({ directoryId: 'query', companyTypes: ['private'] });
    assert.ok(result.total === 0 || result.total === 2, 'atomic import must never expose one changed company');
    assert.equal(result.items.length, result.total);
    assert.equal(result.facets.companyTypes.find(type => type.id === 'private').count, result.total);
    assert.ok(result.items.every(company => company.type === 'Private company'), 'returned source must match its projected classification');
    if (index % 10 === 0) await setImmediate();
  }
  assert.deepEqual(await finished, [0]);
  assert.equal(store.listCompanies({ directoryId: 'query', companyTypes: ['private'] }).total, 0);
});
