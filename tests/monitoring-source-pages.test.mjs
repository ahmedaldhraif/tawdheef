import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openStore } from '../server/store.mjs';

async function fixture(t) {
  const prefix = join(tmpdir(), 'tawdheef-monitor-pages-'), dataDir = await mkdtemp(prefix);
  const store = openStore({ dataDir, seed: false });
  store.createDirectory({ id: 'selected', name: 'Selected' });
  store.createDirectory({ id: 'other', name: 'Other' });
  t.after(async () => { store.close(); assert.ok(resolve(dataDir).startsWith(resolve(prefix))); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); });
  return store;
}
const enable = (store, patch = {}) => store.configureMonitoring({ expectedRevision: store.getMonitoring().config.revision, explicit: true, patch: { enabled: true, channels: { jobs: true }, scope: { directoryIds: ['selected'] }, ...patch } });

test('10000-company source pages retain every stable ID without decoding every source payload for each page', async t => {
  const store = await fixture(t);
  const ids = store.addCompanies('selected', Array.from({ length: 10000 }, (_, index) => ({ id: `source-${index}`, name: `Company ${index}`, careersUrl: `https://careers.example.com/${index}`, notes: 'Synthetic large-source marker. '.repeat(40) }))).ids;
  store.updateCompany(ids[0], { status: 'closed' });
  store.updateCompany(ids[1], { status: 'applied' });
  enable(store);
  const original = JSON.parse, seen = [], metadata = store.getMonitoring().config;
  let sourcePayloadParses = 0;
  JSON.parse = (value, ...args) => {
    if (typeof value === 'string' && value.includes('"notes":"Synthetic large-source marker.')) sourcePayloadParses++;
    return original(value, ...args);
  };
  try {
    let offset = 0;
    do {
      const page = store.listMonitoringSources({ kind: 'jobs', limit: 100, offset });
      assert.equal(page.total, 10000); assert.equal(page.items.length, 100); assert.equal(page.configurationRevision, metadata.revision);
      for (const source of page.items) {
        assert.deepEqual(Object.keys(source).sort(), ['companyId', 'id', 'kind', 'name', 'url']);
        assert.equal(source.kind, 'jobs'); assert.equal(source.companyId, source.id); seen.push(source.id);
      }
      offset = page.nextOffset;
    } while (offset !== null);
  } finally { JSON.parse = original; }
  assert.deepEqual(seen, ids); assert.equal(new Set(seen).size, 10000);
  assert.equal(sourcePayloadParses, 0, 'paging should project compact SQL fields rather than repeatedly decode all original source records');
  assert.equal(store.listMonitoringSources({ kind: 'jobs', limit: 100, offset: 10000 }).items.length, 0);
  assert.throws(() => store.listMonitoringSources({ kind: 'jobs', limit: 101 }), /limit/);
  assert.equal(store.listRuns().length, 0); assert.equal(store.listApplications().length, 0);
});

test('SQL source pages intersect saved directories and IDs, exclude archives and never widen an emptied scope', async t => {
  const store = await fixture(t);
  store.addCompanies('selected', [{ id: 'alpha', name: 'Alpha', careersUrl: 'https://careers.example.com/alpha' }, { id: 'beta', name: 'Beta' }]);
  store.addCompanies('other', [{ id: 'foreign', name: 'Foreign' }]);
  enable(store, { scope: { directoryIds: ['selected'], companyIds: ['alpha', 'foreign'] } });
  assert.deepEqual(store.listMonitoringSources({ kind: 'jobs' }).items.map(source => source.id), ['alpha']);
  store.updateCompany('alpha', { archived: true });
  assert.equal(store.listMonitoringSources({ kind: 'jobs' }).total, 0);
  store.updateCompany('alpha', { archived: false });
  assert.equal(store.listMonitoringSources({ kind: 'jobs' }).total, 1);
  store.updateDirectory('selected', { archived: true });
  assert.equal(store.listMonitoringSources({ kind: 'jobs' }).total, 0);
  assert.equal(store.getMonitoring().config.scope.companyIds.length, 2, 'listing must not rewrite saved selections');
});

test('mail and profile queries restrict scope and relevant progress while preserving destination dedupe and source identity', async t => {
  const store = await fixture(t);
  store.addCompanies('selected', [{ id: 'alpha', name: 'Alpha', email: 'careers@example.test' }, { id: 'beta', name: 'Beta' }]);
  store.addCompanies('other', [{ id: 'foreign', name: 'Foreign', email: 'careers@example.test' }]);
  const profile = store.logApplication({ companyId: 'alpha', status: 'profile_created', method: 'form', url: 'https://careers.example.com/profile/alpha', evidence: 'Synthetic profile receipt' });
  store.logApplication({ id: profile.id, companyId: 'alpha', status: 'cv_uploaded' });
  store.logApplication({ companyId: 'alpha', status: 'profile_created', method: 'form', url: 'https://careers.example.com/profile/alpha', evidence: 'Same destination receipt' });
  store.logApplication({ companyId: 'beta', status: 'account_created', method: 'form', url: 'https://careers.example.com/account/beta', notes: 'Synthetic excluded application marker.' });
  store.logApplication({ companyId: 'foreign', status: 'profile_created', method: 'form', url: 'https://careers.example.com/profile/foreign', evidence: 'Synthetic unrelated receipt', notes: 'Synthetic excluded application marker.' });
  const run = store.startRun({ directoryId: 'selected', companyIds: ['alpha'], mode: 'send_and_submit', explicit: true });
  const email = store.logApplication({ companyId: 'alpha', runId: run.id, method: 'email', status: 'applied', role: 'Synthetic role', threadId: 'tracked-thread', to: 'careers@example.test', evidence: { providerMessageId: 'receipt' } });
  store.updateRun(run.id, { status: 'completed' });
  enable(store, { channels: { jobs: false, profiles: true, email: true } });
  const original = JSON.parse;
  let excludedPayloadParses = 0, profiles, emails;
  JSON.parse = (value, ...args) => {
    if (typeof value === 'string' && value.includes('"notes":"Synthetic excluded application marker.')) excludedPayloadParses++;
    return original(value, ...args);
  };
  try { profiles = store.listMonitoringSources({ kind: 'profiles' }); emails = store.listMonitoringSources({ kind: 'email' }); }
  finally { JSON.parse = original; }
  assert.equal(excludedPayloadParses, 0);
  assert.equal(profiles.total, 1); assert.equal(profiles.items[0].companyId, 'alpha'); assert.equal(profiles.items[0].applicationId, profile.id);
  assert.equal(emails.total, 1); assert.equal(emails.items[0].id, email.id); assert.equal(emails.items[0].threadId, 'tracked-thread');
  const lease = store.beginMonitoringCheck({ configurationRevision: profiles.configurationRevision, assistant: profiles.assistant, source: { kind: 'profiles', id: profiles.items[0].id } });
  assert.equal(lease.check.source.id, profiles.items[0].id); assert.equal(lease.check.source.url, profiles.items[0].url);
});
