/** Production-browser measurements with synthetic records; no model or provider calls. */
import { access, mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve, dirname, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { runtimeEnvironment } from './runtime-env.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMPANY_COUNT = 13714;
const PAGE_ROWS = 100;
const IDLE_WINDOW_MS = 16100;
const HELP = 'Usage: node scripts/browser-benchmark.mjs [--app APP_OR_PACKAGE_DIRECTORY] [--output NEW_FILE] [--screenshot NEW_PNG]\nRun from the source edition with its Playwright Chromium installed. By default measures this checkout; --app can select an extracted user package or Tawdheef.app.\nUses synthetic records, a disposable database, a reserved loopback port and 4x CPU throttling. Observes visible and simulated-hidden idle activity for 16.1 seconds each. No model, sign-in, CV, mail or application actions.\n';

export function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') return { help: true };
    const key = { '--app': 'app', '--output': 'output', '--screenshot': 'screenshot' }[flag];
    if (!key || result[key] || !argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error(HELP.trim());
    result[key] = resolve(argv[++index]);
  }
  if (result.output && result.output === result.screenshot) throw new Error('Choose different files for JSON and PNG output.');
  return result;
}

export async function resolveAppRoot(directory = ROOT) {
  const candidates = [directory, join(directory, 'tawdheef'), join(directory, 'Contents/Resources/app'), join(directory, 'Tawdheef.app/Contents/Resources/app'), join(directory, 'tawdheef/Tawdheef.app/Contents/Resources/app')];
  for (const candidate of candidates) {
    try {
      await Promise.all(['server/index.mjs', 'server/store.mjs', 'dist/index.html'].map(file => access(join(candidate, file), constants.R_OK)));
      return resolve(candidate);
    } catch { /* Try an extracted package or Mac bundle layout. */ }
  }
  throw new Error('Choose a complete built app directory. Run npm run build for the source edition, or extract the complete user package.');
}

async function requireNewFile(path) {
  if (!path) return;
  try { await access(path); throw new Error('Output already exists. Choose a new filename.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

const localEnvironment = () => Object.fromEntries(['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'PLAYWRIGHT_BROWSERS_PATH'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));

async function reservePort() {
  const reservation = createServer();
  await new Promise((accept, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', accept); });
  const port = reservation.address().port;
  await new Promise((accept, reject) => reservation.close(error => error ? reject(error) : accept()));
  return port;
}

async function nodeVersion(executable) {
  const version = await new Promise((accept, reject) => {
    execFile(executable, ['--version'], { env: runtimeEnvironment(localEnvironment(), executable), shell: false, windowsHide: true, timeout: 10000, maxBuffer: 4096 }, (error, stdout) => error ? reject(new Error('The selected app runtime could not run. Check the package and its operating-system approval.')) : accept(stdout.trim()));
  });
  if (!/^v\d+\.\d+\.\d+$/.test(version)) throw new Error('The selected app runtime did not report a Node.js version.');
  return version.slice(1);
}

async function stopServer(server) {
  if (!server?.pid || server.exitCode !== null || server.signalCode !== null) return;
  const exited = new Promise(accept => server.once('exit', accept));
  server.kill('SIGTERM');
  let timer;
  await Promise.race([exited, new Promise(accept => { timer = setTimeout(accept, 3000); })]); clearTimeout(timer);
  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGKILL');
    await Promise.race([exited, new Promise(accept => { timer = setTimeout(accept, 3000); })]); clearTimeout(timer);
    if (server.exitCode === null && server.signalCode === null) throw new Error('The isolated benchmark process did not stop. Inspect that process before deleting its temporary folder.');
  }
}

export async function benchmarkBrowser({ app, output, screenshot } = {}) {
  await Promise.all([requireNewFile(output), requireNewFile(screenshot)]);
  const appRoot = await resolveAppRoot(app);
  const packageInfo = JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8'));
  let manifest;
  try { manifest = JSON.parse(await readFile(join(appRoot, 'tawdheef-app.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (manifest && (manifest.platform !== process.platform || manifest.arch !== process.arch)) throw new Error('Measure this package on its target operating system and architecture.');
  const executable = manifest ? join(appRoot, 'runtime', process.platform === 'win32' ? 'node.exe' : 'bin/node') : process.execPath;
  await access(executable, constants.R_OK);
  const appNodeVersion = await nodeVersion(executable);
  if (manifest?.runtime?.version) assert.equal(appNodeVersion, manifest.runtime.version, 'The actual app runtime must match its package manifest.');
  const temporary = await mkdtemp(join(tmpdir(), 'tawdheef-browser-benchmark-'));
  let server, browser, spawnError;
  try {
    const dataDir = join(temporary, 'data');
    const { openStore } = await import(pathToFileURL(join(appRoot, 'server/store.mjs')).href);
    const store = openStore({ dataDir, seed: false });
    try {
      store.createDirectory({ id: 'performance-fixture', name: 'Performance fixture' });
      const companies = Array.from({ length: COMPANY_COUNT }, (_, index) => ({ id: `synthetic-${index}`, name: `Synthetic Company ${String(index).padStart(5, '0')}`, nextAction: 'Synthetic next step for local browser measurement.', notes: 'Synthetic fixture notes. No real person, CV, application or provider is connected.' }));
      for (let index = 0; index < companies.length; index += 10000) store.addCompanies('performance-fixture', companies.slice(index, index + 10000));
      assert.equal(store.listDirectories().find(directory => directory.id === 'performance-fixture').count, COMPANY_COUNT);
    } finally { store.close(); }
    const port = await reservePort(), base = `http://127.0.0.1:${port}`, instance = `browser-benchmark-${randomUUID()}`;
    const env = runtimeEnvironment({ ...localEnvironment(), APPLY_TRACKER_DATA: dataDir, APPLY_TRACKER_PORT: String(port), APPLY_TRACKER_INSTANCE: instance }, executable);
    server = spawn(executable, [join(appRoot, 'server/index.mjs')], { cwd: appRoot, env, shell: false, windowsHide: true, stdio: 'ignore' });
    server.once('error', error => { spawnError = error; });
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      if (spawnError || server.exitCode !== null) throw new Error('The isolated app could not start. Check its runtime dependencies and built interface.');
      try {
        const response = await fetch(base + '/api/health', { signal: AbortSignal.timeout(1000) });
        if (response.ok && (await response.json()).instanceId === instance) { ready = true; break; }
      } catch { /* Wait for this owned server, not another app on the port. */ }
      await new Promise(accept => setTimeout(accept, 100));
    }
    if (!ready) throw new Error('The isolated app did not become ready.');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage(), session = await context.newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const requests = [], errors = [], pendingApi = new Set();
    let lastApiActivity = performance.now();
    page.on('request', request => {
      requests.push({ url: request.url(), method: request.method(), type: request.resourceType() });
      if (new URL(request.url()).pathname.startsWith('/api/')) { pendingApi.add(request); lastApiActivity = performance.now(); }
    });
    const finishRequest = request => { if (pendingApi.delete(request)) lastApiActivity = performance.now(); };
    page.on('requestfinished', finishRequest); page.on('requestfailed', finishRequest);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === base ? route.continue() : route.abort();
    });
    await page.addInitScript(() => {
      localStorage.setItem('apply-directory', 'performance-fixture');
      window.__benchmarkHidden = false;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__benchmarkHidden });
      window.__benchmark = { events: [], longTasks: [], rafCalls: 0 };
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => { window.__benchmark.rafCalls++; return raf(callback); };
      new PerformanceObserver(list => window.__benchmark.longTasks.push(...list.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration })))).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver(list => window.__benchmark.events.push(...list.getEntries().filter(entry => entry.interactionId).map(entry => ({ name: entry.name, duration: entry.duration, interactionId: entry.interactionId })))).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    });
    const navigationStarted = performance.now();
    await page.goto(base);
    await page.waitForFunction(count => document.querySelectorAll('tbody tr').length === count, PAGE_ROWS);
    const initialRowsMs = performance.now() - navigationStarted;
    const initialMetrics = await page.evaluate(() => ({ navigation: performance.getEntriesByType('navigation').map(entry => ({ domContentLoadedMs: entry.domContentLoadedEventEnd, loadMs: entry.loadEventEnd }))[0], paint: performance.getEntriesByType('paint').map(entry => ({ name: entry.name, startMs: entry.startTime })), domNodes: document.getElementsByTagName('*').length }));
    const boot = await (await fetch(base + '/api/bootstrap')).json();
    assert.equal(boot.directories.find(directory => directory.id === 'performance-fixture')?.count, COMPANY_COUNT);
    assert.equal(boot.runs.length, 0);
    const search = page.getByRole('textbox', { name: 'Search companies', exact: true }), searches = [];
    for (const text of ['Synthetic Company 13713', 'Synthetic Company 08000', 'Synthetic Company 00100']) {
      const start = performance.now(); await search.fill(text);
      await page.waitForFunction(value => document.querySelectorAll('tbody tr').length === 1 && document.querySelector('.company-name strong')?.textContent === value, text);
      searches.push({ query: text, resultPaintMs: performance.now() - start });
    }
    await search.fill(''); await page.waitForFunction(count => document.querySelectorAll('tbody tr').length === count, PAGE_ROWS);
    const beforeTypingRequests = requests.length, typingStarted = performance.now();
    await search.pressSequentially('13713', { delay: 10 });
    await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1 && document.querySelector('.company-name strong')?.textContent === 'Synthetic Company 13713');
    const typingMs = performance.now() - typingStarted;
    const typingRequests = requests.slice(beforeTypingRequests).filter(request => new URL(request.url).pathname === '/api/companies').length;
    assert.ok(typingRequests >= 1, 'Typing must request the current search scope.');
    await search.fill(''); await page.waitForFunction(count => document.querySelectorAll('tbody tr').length === count, PAGE_ROWS);
    const row = page.locator('tbody tr').first();
    await row.getByRole('button', { name: 'Edit Notes for Synthetic Company 00000', exact: true }).click();
    const editor = row.getByRole('textbox', { name: 'Notes for Synthetic Company 00000', exact: true }), editStarted = performance.now();
    await editor.fill('Synthetic browser performance edit'); await editor.press('Enter');
    await row.getByRole('button', { name: 'Edit Notes for Synthetic Company 00000', exact: true }).filter({ hasText: 'Synthetic browser performance edit' }).waitFor();
    const savePaintMs = performance.now() - editStarted;
    const saved = await (await fetch(base + '/api/companies/synthetic-0')).json();
    assert.equal(saved.company.notes, 'Synthetic browser performance edit');
    assert.deepEqual(saved.applications, []);
    // A visible row response can schedule the summary after networkidle was
    // observed. Settle both React consumers and their follow-up read before
    // measuring idle; do not count a visibility transition as an idle interval.
    const settleWork = async () => {
      const deadline = performance.now() + 10000;
      await page.evaluate(() => new Promise(accept => requestAnimationFrame(() => requestAnimationFrame(accept))));
      while (performance.now() < deadline) {
        const settled = await page.evaluate(() => document.querySelector('.table-scroll')?.getAttribute('aria-busy') === 'false' && document.querySelector('.directory-snapshot')?.getAttribute('aria-busy') === 'false');
        if (settled && pendingApi.size === 0 && performance.now() - lastApiActivity >= 1000) return;
        await page.waitForTimeout(50);
      }
      throw new Error('The table and summary did not finish their pending reads before idle measurement.');
    };
    await page.locator('h1').click(); await settleWork();
    const visibleStart = requests.length, visibleRafStart = await page.evaluate(() => window.__benchmark.rafCalls);
    await page.waitForTimeout(IDLE_WINDOW_MS);
    const visibleRequests = requests.slice(visibleStart).map(request => new URL(request.url).pathname);
    const visibleIdleRafCalls = await page.evaluate(start => window.__benchmark.rafCalls - start, visibleRafStart);
    await settleWork();
    const transitionStart = requests.length;
    await page.evaluate(() => { window.__benchmarkHidden = true; document.dispatchEvent(new Event('visibilitychange')); });
    await settleWork();
    const transitionRequests = requests.slice(transitionStart).map(request => new URL(request.url).pathname);
    assert.ok(transitionRequests.length <= 1 && transitionRequests.every(path => path === '/api/snapshot'), 'Only a pending visible summary may settle during the visibility transition.');
    const hiddenStart = requests.length, hiddenRafStart = await page.evaluate(() => window.__benchmark.rafCalls);
    await page.waitForTimeout(IDLE_WINDOW_MS);
    const hiddenRequests = requests.slice(hiddenStart).map(request => new URL(request.url).pathname);
    const hiddenIdleRafCalls = await page.evaluate(start => window.__benchmark.rafCalls - start, hiddenRafStart);
    await page.evaluate(() => { window.__benchmarkHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
    const measurements = await page.evaluate(() => ({ ...window.__benchmark, resources: performance.getEntriesByType('resource').map(entry => ({ name: entry.name, transferBytes: entry.transferSize, durationMs: entry.duration })) }));
    const externalRequests = requests.filter(request => new URL(request.url).origin !== base);
    assert.equal(externalRequests.length, 0, 'The isolated working app must not request external resources.');
    assert.deepEqual(errors, [], 'The benchmark must not have browser runtime errors.');
    assert.deepEqual(hiddenRequests, [], 'Hidden app polling must pause.');
    assert.equal(hiddenIdleRafCalls, 0, 'A hidden idle app must not run an animation-frame loop.');
    assert.ok(visibleRequests.includes('/api/companies'), 'Visible idle app refresh must remain active.');
    for (const request of requests) {
      const url = new URL(request.url);
      if (['/api/companies', '/api/snapshot'].includes(url.pathname)) assert.equal(url.searchParams.get('directoryId'), 'performance-fixture', 'Directory requests must retain the synthetic fixture scope.');
      if (request.method !== 'GET') assert.ok(request.method === 'PATCH' && url.pathname === '/api/companies/synthetic-0', 'Only the isolated fixture note edit is allowed.');
    }
    const durations = measurements.events.map(entry => entry.duration).sort((a, b) => a - b), percentile = percent => durations[Math.max(0, Math.ceil(durations.length * percent) - 1)] ?? 0;
    const report = { benchmark: 'tawdheef-browser', version: 1, scope: 'isolated_synthetic_production_browser', app: { version: packageInfo.version, edition: manifest ? 'prebuilt' : 'source' }, environment: { platform: process.platform, architecture: process.arch, measurementNode: process.version, appNode: appNodeVersion, browser: await browser.version() }, companyCount: COMPANY_COUNT, pageRows: PAGE_ROWS, cpuThrottleRate: 4, viewport: { width: 1440, height: 960 }, initialRowsMs: Math.round(initialRowsMs), initialMetrics,
      searchResults: searches.map(item => ({ ...item, resultPaintMs: Math.round(item.resultPaintMs) })), sequentialTyping: { characters: 5, resultPaintMs: Math.round(typingMs), companyRequests: typingRequests }, inlineEditSavePaintMs: Math.round(savePaintMs),
      inputEventDurationMs: { observedEntries: durations.length, p50: percentile(.5), p95: percentile(.95), max: durations.at(-1) ?? 0 }, longTasks: { count: measurements.longTasks.length, totalMs: Math.round(measurements.longTasks.reduce((sum, entry) => sum + entry.duration, 0)), maximumMs: Math.round(Math.max(0, ...measurements.longTasks.map(entry => entry.duration))) },
      visibleIdle: { observedMs: IDLE_WINDOW_MS, requests: visibleRequests, requestAnimationFrameCalls: visibleIdleRafCalls }, visibilityTransition: { requests: transitionRequests }, simulatedHidden: { observedMs: IDLE_WINDOW_MS, requests: hiddenRequests, requestAnimationFrameCalls: hiddenIdleRafCalls }, network: { totalRequests: requests.length, externalRequests: externalRequests.length, initialResources: measurements.resources.filter(entry => !new URL(entry.name).pathname.startsWith('/api/')).map(entry => ({ path: new URL(entry.name).pathname, transferBytes: entry.transferBytes, durationMs: Math.round(entry.durationMs) })) }, runtimeErrors: errors,
      checks: ['synthetic directory scope and counts', 'search results match the requested company', 'fixture edit persisted without applications', 'visible idle refresh', 'hidden polling and animation-frame pause', 'no external resource requests or browser runtime errors'],
      limitations: ['Headless Chromium measurement, not Safari or physical-device verification.', 'The server starts directly; native launcher and signature checks are separate release smoke tests.', 'CPU throttling approximates CPU load, not GPU or memory limits.', 'Input event timings are browser event entries, not a field INP percentile.', 'Hidden state is simulated through document.hidden and visibilitychange, not an OS minimize test.', 'Absolute latency thresholds are observational and do not fail shared CI runners.', 'No model, CV, mailbox, application, profile or calendar action occurred.'] };
    if (output) { await mkdir(dirname(output), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); }
    if (screenshot) { await mkdir(dirname(screenshot), { recursive: true }); await writeFile(screenshot, await page.screenshot(), { flag: 'wx' }); }
    return report;
  } finally {
    await browser?.close().catch(() => {});
    await stopServer(server);
    const tempRoot = resolve(tmpdir()), target = resolve(temporary), suffix = relative(tempRoot, target);
    if (!suffix || isAbsolute(suffix) || suffix === '..' || suffix.startsWith('..' + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('Refusing cleanup outside the benchmark temporary directory.');
    await rm(target, { recursive: true, force: true, maxRetries: 5 });
  }
}

const invoked = process.argv[1] ? await realpath(resolve(process.argv[1])).catch(() => null) : null;
if (invoked === await realpath(fileURLToPath(import.meta.url))) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) process.stdout.write(HELP);
    else process.stdout.write(JSON.stringify(await benchmarkBrowser(options), null, 2) + '\n');
  } catch (error) { process.stderr.write(String(error.message || error) + '\n'); process.exitCode = 1; }
}
