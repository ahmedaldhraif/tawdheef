import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { openStore } from '../server/store.mjs';

const HELP = 'Usage: node scripts/benchmark.mjs [--output NEW_FILE]\nRuns synthetic local SQLite list benchmarks in disposable temporary directories.\nPrints JSON; --output also saves it without overwriting an existing file.\n';
const FIXTURE_SIZES = [8000, 13714];
const HISTORY_COUNT = 600;
const SAMPLES = 7;
const round = value => Number(value.toFixed(2));
function statistics(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const percentile = fraction => ordered[Math.max(0, Math.ceil(fraction * ordered.length) - 1)];
  return {
    samples: values.length,
    p50Ms: round(percentile(0.5)),
    p95Ms: round(percentile(0.95)),
    meanMs: round(values.reduce((sum, value) => sum + value, 0) / values.length),
    minMs: round(ordered[0]),
    maxMs: round(ordered.at(-1)),
  };
}

function argumentsFor(argv) {
  let output;
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--help' || argv[index] === '-h') return { help: true };
    if (argv[index] !== '--output' || output || !argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(HELP.trim());
    output = resolve(argv[++index]);
  }
  return { output };
}

async function measure(companyCount) {
  // Explicit dataDir and seed:false ignore APPLY_TRACKER_DATA and the user's
  // actual tracking, provider settings and public seed. All writes use the store.
  const dataDir = await mkdtemp(join(tmpdir(), 'tawdheef-benchmark-'));
  let store;
  try {
    store = openStore({ dataDir, seed: false, clock: () => new Date('2026-11-14T08:00:00Z') });
    store.createDirectory({ id: 'benchmark', name: 'Synthetic benchmark', country: 'AE' });
    store.updateSettings({ timezone: 'Asia/Dubai' });
    const records = Array.from({ length: companyCount }, (_, index) => ({
      id: `synthetic-${index}`, name: `Company ${index}`,
      type: index % 2 ? 'Private company' : 'Federal government',
      location: index % 3 ? 'Dubai' : 'Abu Dhabi',
    }));
    // The domain import limit is intentional; larger synthetic directories use
    // the same bounded imports available to ordinary users.
    for (let index = 0; index < records.length; index += 10000) store.addCompanies('benchmark', records.slice(index, index + 10000));
    for (let index = 0; index < HISTORY_COUNT; index++) {
      const companyId = records[companyCount - index - 1].id;
      store.logApplication({ companyId, role: 'Synthetic future opportunities', method: 'form', status: 'profile_created', url: `https://example.test/${companyId}/profile`, evidence: 'Synthetic fixture confirmation; no external action occurred.' });
    }
    const scenarios = [
      { name: 'first_page', input: {}, expected: companyCount },
      { name: 'literal_search', input: { search: 'Company 2' }, expected: records.filter(record => record.name.includes('Company 2')).length },
      { name: 'type_and_location', input: { companyTypes: ['private'], locations: ['location:dubai'] }, expected: records.filter((_, index) => index % 2 && index % 3).length },
      { name: 'page_with_history', input: { direction: 'desc' }, expected: companyCount },
    ];
    const samples = new Map(scenarios.map(scenario => [scenario.name, []]));
    const cold = [];
    function query(scenario) {
      const started = performance.now();
      const result = store.listCompanies({ directoryId: 'benchmark', limit: 20, ...scenario.input });
      const ms = performance.now() - started;
      if (result.total !== scenario.expected || result.items.length !== 20 || result.remainingCount !== scenario.expected) throw new Error(`Synthetic ${scenario.name} returned inconsistent counts.`);
      if (scenario.name === 'page_with_history' && result.items.some(company => company.progress.profile_created !== 1)) throw new Error('Synthetic history page lost a recorded profile.');
      return ms;
    }
    // Populate projections and sort ranks once, then interleave scenarios to
    // avoid attributing a single warm-cache run to every case.
    for (const scenario of scenarios) cold.push({ scenario: scenario.name, ms: round(query(scenario)) });
    for (let sample = 0; sample < SAMPLES; sample++) for (const scenario of scenarios) samples.get(scenario.name).push(query(scenario));
    const edits = [];
    for (let sample = 0; sample < SAMPLES; sample++) {
      const company = store.getCompany(records[0].id), notes = `Synthetic local edit ${sample}`;
      const started = performance.now();
      store.updateCompany(company.id, { expectedRevision: company.revision, notes });
      const page = store.listCompanies({ directoryId: 'benchmark', limit: 20 });
      if (page.items[0]?.notes !== notes) throw new Error('Synthetic edit was not reflected in the next list page.');
      edits.push(performance.now() - started);
    }
    return {
      companyCount, historyCount: HISTORY_COUNT, pageSize: 20,
      initialRequests: cold,
      scenarios: scenarios.map(scenario => ({ name: scenario.name, total: scenario.expected, ...statistics(samples.get(scenario.name)) })),
      combinedWarm: statistics([...samples.values()].flat()),
      localEditAndList: statistics(edits),
    };
  } finally {
    store?.close();
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5 });
  }
}

async function main() {
  const options = argumentsFor(process.argv.slice(2));
  if (options.help) { process.stdout.write(HELP); return; }
  if (options.output) {
    try { await stat(options.output); throw new Error('Output already exists. Choose a new filename.'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const started = performance.now();
  const fixtures = [];
  for (const count of FIXTURE_SIZES) fixtures.push(await measure(count));
  const result = {
    benchmark: 'tawdheef-local-list', version: 1, scope: 'isolated_synthetic',
    environment: { node: process.version, platform: process.platform, architecture: process.arch },
    percentileMethod: 'nearest_rank',
    note: 'Local synthetic list latency only. Not a browser, provider, application-run or production benchmark. Seven samples per scenario are a bounded probe, not a latency guarantee.',
    fixtures, elapsedMs: round(performance.now() - started),
  };
  const json = JSON.stringify(result, null, 2) + '\n';
  if (options.output) await writeFile(options.output, json, { flag: 'wx', mode: 0o600 });
  process.stdout.write(json);
}

main().catch(error => { process.stderr.write(String(error.message || error) + '\n'); process.exitCode = 1; });
