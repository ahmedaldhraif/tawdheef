import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { openStore } from '../server/store.mjs';

const profiles = { applyMatchingJobs: false, createProfiles: true, sendCvEmails: false };
const mixed = { applyMatchingJobs: true, createProfiles: true, sendCvEmails: false };
async function fixture(t) {
  const prefix = join(tmpdir(), 'tawdheef-preview-query-'), dataDir = await mkdtemp(prefix);
  const store = openStore({ dataDir, seed: false, clock: () => new Date('2026-11-14T08:00:00Z') });
  const clients = [];
  store.createDirectory({ id: 'preview', name: 'Preview fixture', country: 'AE' });
  store.updateSettings({ timezone: 'UTC' });
  t.after(async () => { for (const client of clients) client.close(); store.close(); assert.ok(resolve(dataDir).startsWith(resolve(prefix))); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); });
  return { store, client: () => { const client = openStore({ dataDir, seed: false }); clients.push(client); return client; } };
}
function profile(store, companyId) { store.logApplication({ companyId, status: 'profile_created', role: 'Future opportunities', url: `https://example.test/${companyId}/profile`, evidence: 'Synthetic confirmed career profile.' }); }
function applied(store, directoryId, companyId) {
  const run = store.startRun({ directoryId, companyIds: [companyId], mode: 'send_and_submit', explicit: true });
  store.logApplication({ companyId, runId: run.id, status: 'applied', role: 'Synthetic engineer', evidence: 'Synthetic confirmed submission.' });
  store.updateRun(run.id, { status: 'completed' });
}
function install(store, id, records) {
  return store.installDirectoryPack({ pack: { id, name: id, formatVersion: 1, snapshotDate: '2026-11-14', sourceSha256: createHash('sha256').update(JSON.stringify(records)).digest('hex') }, records });
}
async function companies(t) {
  const result = await fixture(t), { store } = result;
  store.addCompanies('preview', [
    { id: 'a', name: 'Company 2', type: 'Private company', location: 'Dubai' },
    { id: 'b', name: 'Company 10', type: 'Private company', location: 'Abu Dhabi' },
    { id: 'c', name: 'Applied company', type: 'Federal government entity', location: 'Dubai' },
    { id: 'd', name: 'Ready company', type: 'Emirate government entity', location: 'Sharjah' },
    { id: 'e', name: 'Closed company' }, { id: 'f', name: 'Archived company' },
    { id: 'g', name: 'وظائف 2', arabicName: 'وظائف تقنية', sourceRole: 'Unresolved source lead', location: 'Dubai / Abu Dhabi' },
  ]);
  profile(store, 'b'); applied(store, 'preview', 'c');
  store.updateCompany('a', { attention: 'needs_you' });
  store.updateCompany('d', { status: 'ready', followUpAt: '2026-11-14' });
  store.updateCompany('e', { status: 'closed' }); store.updateCompany('f', { archived: true });
  store.updateCompany('g', { notes: 'Résumé specialist — 100%_literal' });
  store.createDirectory({ id: 'foreign', name: 'Foreign' }); store.addCompanies('foreign', [{ id: 'foreign-company', name: 'Foreign company' }]);
  return result;
}

test('preview intersects filters while facets retain the entire action-eligible selection', async t => {
  const { store } = await companies(t), base = store.previewRun({ directoryId: 'preview' });
  assert.equal(base.count, 4); assert.equal(base.listScopeVersion, 1); assert.equal(base.runActionsVersion, 1);
  assert.equal(base.companyTypes.find(type => type.id === 'private').count, 2);
  assert.equal(base.companyTypes.find(type => type.id === 'federal_government').count, 0);
  for (const [filters, count] of [
    [{ search: 'RÉSUMÉ' }, 1], [{ search: '%_literal' }, 1], [{ search: 'وظائف تقنية' }, 1],
    [{ status: 'ready' }, 1], [{ attention: 'needs_you' }, 1], [{ attention: 'follow_up_due' }, 1],
    [{ companyTypes: ['private'] }, 2], [{ locations: ['location:dubai', 'location:abu dhabi'] }, 3],
    [{ companyTypes: ['private'], locations: ['location:dubai'] }, 1], [{ locations: ['location:unavailable'] }, 0],
    [{ companyTypes: [], locations: [] }, 4],
  ]) {
    const result = store.previewRun({ directoryId: 'preview', ...filters });
    assert.equal(result.count, count, JSON.stringify(filters));
    assert.deepEqual(result.companyTypes, base.companyTypes); assert.deepEqual(result.locations, base.locations);
  }
  assert.equal(store.previewRun({ directoryId: 'preview', actions: profiles }).count, 4);
  assert.equal(store.previewRun({ directoryId: 'preview', actions: mixed }).count, 5);
  const selected = store.previewRun({ directoryId: 'preview', companyIds: ['a', 'a', 'c'], actions: mixed, companyTypes: ['private'] });
  assert.equal(selected.count, 1); assert.equal(selected.companyTypes.find(type => type.id === 'federal_government').count, 1);
  const empty = store.previewRun({ directoryId: 'preview', companyIds: [] });
  assert.equal(empty.count, 0); assert.ok(empty.companyTypes.every(type => type.count === 0)); assert.deepEqual(empty.locations, []);
});

test('warm previews avoid full source exports and keep explicit ID validation boundaries', async t => {
  const { store } = await companies(t);
  store.listCompanies({ directoryId: 'preview', limit: 1 });
  store.exportCompanies = () => { throw new Error('Preview must not decode a full source export.'); };
  assert.equal(store.previewRun({ directoryId: 'preview' }).count, 4);
  assert.equal(store.previewRun({ directoryId: 'preview', companyIds: ['a', 'c'], actions: profiles }).count, 2);
  assert.throws(() => store.previewRun({ directoryId: 'preview', companyIds: ['missing'] }), error => error.status === 404 && /Company not found/.test(error.message));
  for (const id of ['foreign-company', 'f']) assert.throws(() => store.previewRun({ directoryId: 'preview', companyIds: [id], search: 'no matches' }), /belong to this active directory/);
  for (const companyIds of [null, 'a', [1]]) assert.throws(() => store.previewRun({ directoryId: 'preview', companyIds }), /list of text/);
  assert.throws(() => store.previewRun({ directoryId: 'missing' }), /active directory/);
  assert.equal(store.previewRun({ directoryId: 'preview', search: 'Résumé' }).count, 1, 'Validation rollback must not leave a stale projection.');
});

test('preview retains shared profile and application progress across verified pack identities', async t => {
  const { store } = await fixture(t);
  const record = id => ({ id, name: 'Synthetic employer', sourceRole: 'Commercial employer', careersUrl: 'https://example.test/employer/careers', type: 'Private company', location: 'Dubai' });
  const original = install(store, 'original', [record('original-company')]);
  const alias = install(store, 'alias', [record('alias-company')]);
  profile(store, 'original-company');
  store.listCompanies({ directoryId: alias.directoryId });
  assert.equal(store.previewRun({ directoryId: alias.directoryId, actions: profiles }).count, 0);
  assert.equal(store.previewRun({ directoryId: alias.directoryId }).count, 1);
  applied(store, original.directoryId, 'original-company');
  const result = store.previewRun({ directoryId: alias.directoryId, actions: mixed });
  assert.equal(result.count, 0); assert.ok(result.companyTypes.every(type => type.count === 0)); assert.deepEqual(result.locations, []);
});

test('preview caches observe separate-client history and company edits', async t => {
  const { store, client } = await fixture(t);
  store.addCompanies('preview', [{ id: 'one', name: 'One', type: 'Private company', location: 'Dubai' }, { id: 'two', name: 'Two', type: 'Private company', location: 'Dubai' }]);
  assert.equal(store.previewRun({ directoryId: 'preview', actions: profiles }).count, 2);
  const other = client(); profile(other, 'one');
  assert.equal(store.previewRun({ directoryId: 'preview', actions: profiles }).count, 1);
  other.updateCompany('two', { status: 'closed' });
  assert.equal(store.previewRun({ directoryId: 'preview', actions: profiles }).count, 0);
  store.updateCompany('two', { status: 'ready' });
  assert.equal(store.previewRun({ directoryId: 'preview', actions: profiles }).count, 1);
});

for (const verifiedIdentities of [false, true]) test(`synthetic preview measurement with verified identities ${verifiedIdentities}`, async t => {
  const { store } = await fixture(t), companyCount = 4256, historyCount = 80;
  const sourceText = 'Synthetic public source research detail. '.repeat(200);
  const records = Array.from({ length: companyCount }, (_, index) => ({ id: `synthetic-${index}`, name: `Company ${index}`, type: index % 2 ? 'Private company' : 'Federal government entity', sourceRole: 'Commercial employer', location: index % 3 ? 'Dubai' : 'Abu Dhabi', careersUrl: `https://example.test/company-${index}/careers`, sourceFields: { notes: sourceText } }));
  const directoryId = verifiedIdentities ? install(store, 'benchmark', records).directoryId : 'preview';
  if (!verifiedIdentities) store.addCompanies(directoryId, records);
  for (let index = companyCount - historyCount; index < companyCount; index++) profile(store, records[index].id);
  store.listCompanies({ directoryId, limit: 1 });
  const input = { directoryId, actions: profiles, companyTypes: ['private'], locations: ['location:dubai'] };
  const expected = records.slice(0, companyCount - historyCount).filter((_, index) => index % 2 && index % 3).length;
  const samples = [];
  for (let index = 0; index < 6; index++) { const started = performance.now(), result = store.previewRun(input); const elapsed = performance.now() - started; assert.equal(result.count, expected); if (index) samples.push(elapsed); }
  samples.sort((a, b) => a - b);
  t.diagnostic(JSON.stringify({ scope: 'isolated_synthetic_preview', node: process.version, platform: process.platform, arch: process.arch, companyCount, historyCount, verifiedIdentities, sourceTextBytesPerCompany: Buffer.byteLength(sourceText), samples: samples.length, p50Ms: Number(samples[2].toFixed(2)), p95Ms: Number(samples.at(-1).toFixed(2)), note: 'Five warm samples; concurrent machine load can affect timing. No hard latency assertion or production guarantee.' }));
});
