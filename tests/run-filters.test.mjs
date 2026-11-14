import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../server/store.mjs';
import { buildTools, closeToolConnections } from '../server/mcp.mjs';
import { createAgentRunner } from '../server/agent-runner.mjs';
import { COMPANY_TYPES, classifyCompanyType } from '../src/company-types.js';
import { companyLocations } from '../src/company-locations.js';

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'tawdheef-type-filter-'));
  const store = openStore({ dataDir, seed: false });
  store.createDirectory({ id: 'test', name: 'Test' });
  const ids = store.addCompanies('test', [
    { id: 'federal', name: 'Federal fixture', type: 'Federal government entity' },
    { id: 'local', name: 'Local fixture', type: 'Emirate government entity' },
    { id: 'linked', name: 'Linked fixture', type: 'Government-owned company', sourceFields: { 'Government level': 'Emirate UAE' } },
    { id: 'private', name: 'Private fixture', type: 'Private company' },
    { id: 'other', name: 'Other fixture', type: 'Non-profit organisation' },
    { id: 'unknown', name: 'Unknown fixture', type: 'Company, ownership unconfirmed' },
  ]).ids;
  t.after(async () => { await closeToolConnections(store); store.close(); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); });
  return { store, ids };
}

test('company types use explicit classifications, never a name, listing, sector or employer role', () => {
  const classify = (type, sourceFields = {}) => classifyCompanyType({ type, sourceFields });
  assert.equal(classify('Federal government entity'), 'federal_government');
  assert.equal(classify('Emirate government entity'), 'local_government');
  assert.equal(classify('Government programme / portal', { 'Government level': 'Federal UAE' }), 'federal_government');
  assert.equal(classify('Public education institution', { 'Government level': 'Emirate UAE' }), 'local_government');
  assert.equal(classify('Government-linked company', { 'Government level': 'Federal UAE' }), 'government_linked');
  assert.equal(classify('Semi-government entity'), 'government_linked');
  assert.equal(classify('Private school campus'), 'private');
  assert.equal(classify('Private employer'), 'private');
  assert.equal(classify('Nonprofit / philanthropic organisation'), 'other');
  assert.equal(classify('Government entity'), 'other'); // No federal/local evidence.
  for (const type of ['Company, ownership unconfirmed', 'Active DFM-listed issuer', 'Listed company', 'Commercial employer', 'Government tenant-directory listing', 'Private/international school directory institution', 'Government-linked company, ownership unconfirmed']) assert.equal(classify(type), 'unknown', type);
  assert.equal(classifyCompanyType({ name: 'Federal Government Private Holdings', sector: 'Private companies', sourceRole: 'International employer' }), 'unknown');
  assert.equal(classify('Private company', { 'Ownership / structure': 'Government-owned' }), 'unknown');
  assert.equal(classify('Federal government entity', { 'Ownership / structure': 'Privately owned' }), 'unknown');
});

test('preview facets and multi-select union count the same unfinished candidate scope', async t => {
  const { store, ids } = await fixture(t);
  const all = store.previewRun({ directoryId: 'test' });
  assert.equal(all.count, 6);
  assert.deepEqual(all.companyTypes, COMPANY_TYPES.map(type => ({ ...type, count: 1 })));
  const input = { directoryId: 'test', companyTypes: ['federal_government', 'private'] };
  assert.equal(store.previewRun(input).count, 2);
  assert.deepEqual(store.previewRun(input).companyTypes, all.companyTypes);
  assert.deepEqual(new Set(store.remainingCompanies(input).map(c => c.id)), new Set(['federal', 'private']));
  assert.equal(store.previewRun({ directoryId: 'test', companyTypes: [] }).count, ids.length);
  assert.equal(store.previewRun({ ...input, companyTypes: ['unknown'] }).count, 1);
});

test('selected IDs are a hard boundary, including empty selections and cross-directory input', async t => {
  const { store } = await fixture(t);
  const input = { directoryId: 'test', companyIds: ['local', 'private'], companyTypes: ['federal_government', 'private'] };
  const preview = store.previewRun(input);
  assert.equal(preview.count, 1);
  assert.equal(preview.companyTypes.find(type => type.id === 'federal_government').count, 0);
  assert.equal(preview.companyTypes.find(type => type.id === 'local_government').count, 1);
  const run = store.startManagedRun({ ...input, assistant: 'codex', mode: 'send_and_submit', explicit: true });
  assert.deepEqual(run.companyIds, ['private']); assert.deepEqual(run.companyTypes, input.companyTypes);
  store.updateRun(run.id, { status: 'cancelled' });
  assert.equal(store.previewRun({ directoryId: 'test', companyIds: [] }).count, 0);
  assert.throws(() => store.startRun({ directoryId: 'test', companyIds: [], mode: 'send_and_submit', explicit: true }), /No remaining companies/);
  store.createDirectory({ id: 'elsewhere', name: 'Elsewhere' });
  const foreign = store.addCompanies('elsewhere', [{ name: 'Foreign', type: 'Private company' }]).ids[0];
  assert.throws(() => store.previewRun({ directoryId: 'test', companyIds: [foreign], companyTypes: ['unknown'] }), /belong/);
});

test('start rechecks current records after preview, snapshots type scope, and never falls back on no matches', async t => {
  const { store } = await fixture(t);
  const input = { directoryId: 'test', companyTypes: ['federal_government', 'private'], assistant: 'codex', mode: 'send_and_submit', explicit: true };
  assert.equal(store.previewRun(input).count, 2);
  store.updateCompany('federal', { status: 'closed' });
  const run = store.startManagedRun(input);
  assert.deepEqual(run.companyIds, ['private']);
  assert.deepEqual(store.getRun(run.id).companyTypes, input.companyTypes);
  assert.deepEqual(store.runSummaries()[0].companyTypes, input.companyTypes);
  store.updateRun(run.id, { status: 'completed' });
  assert.throws(() => store.startManagedRun({ ...input, companyTypes: ['federal_government'] }), /No remaining companies/);
  assert.throws(() => store.startRun({ ...input, companyIds: ['local'], companyTypes: ['private'] }), /match/);
  assert.equal(store.listRuns().length, 1);
});

test('invalid type filters fail closed through store and machine tools', async t => {
  const { store } = await fixture(t);
  const tools = buildTools(store, { mode: 'local-adapters' });
  const preview = tools.find(tool => tool.name === 'preview_run');
  const start = tools.find(tool => tool.name === 'start_run');
  assert.deepEqual(preview.inputSchema.properties.companyTypes.items.enum, COMPANY_TYPES.map(type => type.id));
  assert.deepEqual(start.inputSchema.properties.companyTypes.items.enum, COMPANY_TYPES.map(type => type.id));
  for (const companyTypes of ['private', null, {}, ['misspelled'], [null]]) {
    const input = { directoryId: 'test', companyTypes };
    assert.throws(() => store.previewRun(input), /company types/);
    assert.throws(() => store.startRun({ ...input, mode: 'send_and_submit', explicit: true }), /company types/);
    await assert.rejects(preview.handler(input));
  }
  assert.equal(store.listRuns().length, 0);
});

test('MCP and runner previews agree; unassisted runs apply filters without changing deliberate target authority', async t => {
  const { store } = await fixture(t);
  const runner = createAgentRunner({ store, port: 4000 });
  t.after(() => runner.close());
  const tools = buildTools(store, { mode: 'local-adapters' }), call = (name, input) => tools.find(tool => tool.name === name).handler(input);
  const input = { directoryId: 'test', companyTypes: ['local_government', 'government_linked'] };
  assert.deepEqual(await call('preview_run', input), runner.preview(input));
  const run = await call('start_run', { ...input, companyIds: ['local', 'linked', 'private'], mode: 'send_and_submit', explicit: true });
  assert.deepEqual(run.companyIds, ['local', 'linked']);
  assert.deepEqual(run.companyTypes, input.companyTypes);
  store.logApplication({ companyId: 'local', runId: run.id, status: 'applied', role: 'Fixture role', evidence: 'Fixture receipt' });
  assert.equal(store.previewRun(input).count, 1);
  // Explicit external callers can intentionally choose a completed company for a new role.
  const deliberate = store.startRun({ directoryId: 'test', companyIds: ['local'], mode: 'send_and_submit', explicit: true });
  assert.deepEqual(deliberate.companyIds, ['local']);
});

test('location groups preserve countrywide, unknown and qualified evidence without guessing a city', () => {
  assert.deepEqual(companyLocations({ location: 'Dubai — Al Barsha' }), [{ id: 'location:dubai', label: 'Dubai' }]);
  assert.deepEqual(companyLocations({ location: 'Saudi Arabia — Riyadh — Al Malaz' }, { country: 'SA' }), [{ id: 'location:riyadh', label: 'Riyadh' }]);
  assert.deepEqual(companyLocations({ location: 'Dubai / Abu Dhabi' }).map(place => place.label), ['Dubai', 'Abu Dhabi']);
  assert.deepEqual(companyLocations({ location: 'Unknown' }), [{ id: 'unknown', label: 'Unknown location' }]);
  assert.deepEqual(companyLocations({ location: '' }), [{ id: 'unknown', label: 'Unknown location' }]);
  for (const location of ['UAE-wide', 'Federal', 'United Arab Emirates', 'Remote', 'Multiple locations', 'Dubai listing; issuer domicile not inferred', 'Road 10 - Building 20, Dubai']) {
    assert.deepEqual(companyLocations({ location }).map(place => place.label), [location]);
  }
});

test('location facets are directory-specific, union multi-city values and intersect company types', async t => {
  const { store } = await fixture(t);
  store.addCompanies('test', [
    { id: 'local', name: 'Local fixture', location: 'Dubai — District' },
    { id: 'private', name: 'Private fixture', location: 'Dubai / Abu Dhabi' },
    { id: 'federal', name: 'Federal fixture', location: 'Federal' },
    { id: 'linked', name: 'Linked fixture', location: 'UAE-wide' },
  ]);
  store.createDirectory({ id: 'saudi', name: 'Saudi Arabia', country: 'SA' });
  store.addCompanies('saudi', [{ name: 'Other directory', type: 'Private employer', location: 'Saudi Arabia — Riyadh — Centre' }]);
  const base = store.previewRun({ directoryId: 'test' });
  assert.deepEqual(base.locations.map(place => place.label), ['Abu Dhabi', 'Dubai', 'Federal', 'UAE-wide', 'Unknown location']);
  assert.equal(base.locations.find(place => place.label === 'Dubai').count, 2);
  assert.equal(base.locations.find(place => place.id === 'unknown').count, 2);
  const input = { directoryId: 'test', locations: ['location:dubai', 'location:abu dhabi'] };
  assert.equal(store.previewRun(input).count, 2); // The multi-city company counts once.
  assert.equal(store.previewRun({ ...input, companyTypes: ['private'] }).count, 1);
  assert.equal(store.previewRun({ ...input, companyTypes: ['federal_government'] }).count, 0);
  assert.deepEqual(store.previewRun(input).locations, base.locations);
  assert.equal(store.previewRun({ ...input, companyIds: ['local'] }).locations.length, 1);
  assert.equal(store.previewRun({ ...input, locations: ['location:riyadh'] }).count, 0);
  assert.equal(store.previewRun({ ...input, locations: ['unknown'] }).count, 2);
  assert.deepEqual(store.previewRun({ directoryId: 'saudi' }).locations, [{ id: 'location:riyadh', label: 'Riyadh', count: 1 }]);
  const run = store.startManagedRun({ ...input, companyTypes: ['private'], assistant: 'codex', mode: 'send_and_submit', explicit: true });
  assert.deepEqual(run.companyIds, ['private']); assert.deepEqual(run.locations, input.locations);
});

test('invalid or unavailable locations cannot expand a run scope', async t => {
  const { store } = await fixture(t);
  for (const locations of [null, 'Dubai', [42], [''], ['x'.repeat(1001)]]) {
    assert.throws(() => store.previewRun({ directoryId: 'test', locations }), /locations/);
    assert.throws(() => store.startRun({ directoryId: 'test', locations, explicit: true, mode: 'send_and_submit' }), /locations/);
  }
  const input = { directoryId: 'test', locations: ['location:does not exist'] };
  assert.equal(store.previewRun(input).count, 0);
  assert.throws(() => store.startRun({ ...input, companyIds: ['private'], explicit: true, mode: 'send_and_submit' }), /match/);
  assert.equal(store.listRuns().length, 0);
});
