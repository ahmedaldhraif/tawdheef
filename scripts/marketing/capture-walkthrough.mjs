// Capture the actual built app using complete public GCC packs in a temp store.
// Never reads the person's .local data or connects providers/starts a Run.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, stat, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const root = process.cwd();
const flags = process.argv.slice(2), index = flags.indexOf('--app-root');
if (index >= 0 && !flags[index + 1]) throw new Error('--app-root needs a built checkout.');
// Keep the README's separate, release-compatible image unless explicitly asked.
const copyDesktopPreview = flags.includes('--copy-tracker-desktop');
const appRoot = index >= 0 ? resolve(flags[index + 1]) : root;
const output = resolve(root, 'public/site-assets/walkthrough');
const dataDir = await mkdtemp(join(tmpdir(), 'tawdheef-public-demo-'));
const port = 4031, base = `http://127.0.0.1:${port}`, instanceId = 'isolated-public-walkthrough';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
await stat(join(appRoot, 'dist/index.html'));
try {
  await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(500) });
  throw new Error(`Port ${port} is occupied; do not reuse another app instance.`);
} catch (error) { if (error.message.includes('occupied')) throw error; }
await mkdir(output, { recursive: true });

const catalog = JSON.parse(await readFile(join(root, 'directories/catalog.json'), 'utf8'));
const countryOrder = ['AE', 'SA', 'QA', 'OM', 'KW', 'BH'];
const names = { AE: 'UAE', SA: 'Saudi Arabia', QA: 'Qatar', OM: 'Oman', KW: 'Kuwait', BH: 'Bahrain' };
const packs = countryOrder.map(country => {
  const matches = catalog.packs.filter(pack => pack.country === country && pack.featured !== false && !pack.historical);
  assert.equal(matches.length, 1, `Expected one current ${country} pack.`);
  return matches[0];
});
const { openStore } = await import(pathToFileURL(join(appRoot, 'server/store.mjs')).href);
const fixture = openStore({ dataDir, seed: false });
const snapshotApiAvailable = typeof fixture.snapshot === 'function';
const sources = [];
try {
  for (const pack of packs) {
    const bytes = await readFile(join(root, pack.source));
    assert.equal(sha(bytes), pack.sourceSha256, `Public source checksum: ${pack.id}`);
    const { records } = JSON.parse(bytes);
    assert.equal(records.length, pack.recordCount, `Public source count: ${pack.id}`);
    const directory = fixture.createDirectory({ id: pack.id, name: names[pack.country], country: pack.country, flag: pack.country });
    // Use the validated domain import, not SQL or invented tab counts.
    for (let offset = 0; offset < records.length; offset += 500) fixture.addCompanies(directory.id, records.slice(offset, offset + 500));
    sources.push({ id: pack.id, name: names[pack.country], country: pack.country, recordCount: records.length, snapshotDate: pack.snapshotDate, source: pack.source, sourceSha256: pack.sourceSha256 });
  }
  assert.deepEqual(fixture.listDirectories().map(item => item.count), packs.map(pack => pack.recordCount));
  assert.equal(fixture.listApplications().length, 0, 'Imported research must have no application events.');
  assert.equal(fixture.listRuns().length, 0, 'Imported research must have no Runs.');
} finally { fixture.close(); }

const server = spawn(process.execPath, ['server/index.mjs'], {
  cwd: appRoot, windowsHide: true,
  env: { ...process.env, APPLY_TRACKER_DATA: dataDir, APPLY_TRACKER_PORT: String(port), APPLY_TRACKER_INSTANCE: instanceId },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '', browser;
server.stdout.on('data', text => { serverLog += text; });
server.stderr.on('data', text => { serverLog += text; });
const api = async path => {
  const response = await fetch(base + path);
  if (!response.ok) throw new Error(`GET ${path}: ${response.status}`);
  return response.json();
};
try {
  let healthy = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { healthy = (await api('/api/health')).instanceId === instanceId; } catch {}
    if (healthy) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!healthy) throw new Error(`Isolated server did not start: ${serverLog}`);
  const bootstrap = await api('/api/bootstrap');
  assert.equal(bootstrap.runs.length, 0);
  assert.equal(bootstrap.directories.length, 6);
  const snapshots = [];
  for (const pack of snapshotApiAvailable ? packs : []) {
    const snapshot = await api(`/api/snapshot?directoryId=${pack.id}&period=all_time`);
    assert.deepEqual(snapshot.counts, { applications: 0, profiles: 0, emails: 0 });
    assert.equal(snapshot.unverifiedEmails ?? 0, 0);
    snapshots.push({ directoryId: pack.id, period: snapshot.period, counts: snapshot.counts });
  }
  browser = await chromium.launch({ headless: true });
  const errors = [], externalRequests = [], shots = [];
  for (const mobile of [false, true]) {
    const viewport = mobile ? { width: 390, height: 820 } : { width: 1100, height: 760 };
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== base) { externalRequests.push(url.origin); return route.abort(); }
      // An accidental click cannot submit, send, connect or alter tracking.
      const readOnlyPreview = request.method() === 'POST' && url.pathname === '/api/run-preview';
      if (!['GET', 'HEAD'].includes(request.method()) && !readOnlyPreview) return route.abort();
      return route.continue();
    });
    await context.addInitScript(id => localStorage.setItem('apply-directory', id), packs[0].id);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.getByRole('heading', { level: 1, name: /^UAE\b/ }).waitFor();
    // Published v0.1.2 has a plain Run button and no snapshot. Modern builds
    // must show truthful zero totals; legacy builds must not synthesize them.
    const snapshotVisible = await page.locator('.directory-snapshot').count() > 0;
    if (snapshotVisible) {
      assert.ok(snapshotApiAvailable, 'This built UI needs the snapshot API from its matching app source.');
      for (const label of ['Applications sent: 0', 'Profiles created: 0', 'Emails sent: 0']) {
        await page.getByRole('button', { name: label, exact: true }).waitFor();
      }
    }
    const runButton = page.locator('.heading-actions button.primary');
    await page.locator('.heading-actions button.primary:not([disabled])').waitFor();
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.getByRole('tab').count(), 6);
    const tabVisibility = await page.getByRole('tab').evaluateAll(tabs => tabs.map(tab => {
      const rect = tab.getBoundingClientRect(), clip = tab.closest('.directory-tabs').getBoundingClientRect();
      const flag = tab.querySelector('img');
      return { text: tab.textContent.trim(), flag: flag?.getAttribute('src'), fullyVisible: rect.left >= clip.left && rect.right <= Math.min(clip.right, innerWidth) };
    }));
    if (!mobile) assert.equal(tabVisibility.filter(tab => tab.fullyVisible).length, 6, 'All six country tabs must fit the desktop image.');
    assert.ok(await page.locator('.company-name').count() > 1);
    const capture = async (name, state) => {
      await page.mouse.move(1, 1);
      await page.evaluate(() => window.scrollTo(0, 0));
      const file = `${name}${mobile ? '-mobile' : ''}.png`;
      await page.screenshot({ path: join(output, file), animations: 'disabled' });
      const bytes = await readFile(join(output, file));
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
      assert.deepEqual({ width, height }, viewport, 'PNG intrinsic dimensions must match its viewport.');
      shots.push({ file, bytes: bytes.length, sha256: sha(bytes), width, height, state, snapshotVisible, tabs: tabVisibility });
    };
    await capture('directory', 'Real public research records; no selections, runs or submission activity.');
    const selections = page.locator('tbody input[type="checkbox"]');
    await selections.nth(0).check();
    await selections.nth(1).check();
    if ((await runButton.textContent()).trim().startsWith('Run on')) {
      await page.getByRole('button', { name: 'Run on 2 selected', exact: true }).waitFor();
    } else {
      await page.waitForFunction(() => document.querySelector('.heading-actions .button-count')?.textContent.trim() === '2');
    }
    await capture('targets', 'Two public source rows selected locally; Run was not opened or started.');
    await page.locator('.company-name').first().click();
    const details = page.getByRole('dialog');
    await details.waitFor();
    await capture('tracking', 'Actual public company detail opened read-only; no status, note or progress edits.');
    await context.close();
  }
  assert.deepEqual(errors, [], 'Browser runtime errors');
  assert.deepEqual(externalRequests, [], 'Capture must request no external resources');
  assert.equal((await api('/api/bootstrap')).runs.length, 0);
  if (copyDesktopPreview) await copyFile(join(output, 'directory.png'), join(root, 'public/site-assets/tracker-desktop.png'));
  const report = {
    capturedAt: new Date().toISOString(), appVersion: JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8')).version,
    versionMeaning: 'Package version only. The supplied local build may contain newer development UI than the public release with that version.',
    appBuildSha256: sha(await readFile(join(appRoot, 'dist/index.html'))), temporaryFixture: true, port,
    description: 'Actual supplied built React interface with complete public research packs imported through the validated domain store. Directory counts are real. All tracking starts empty; no fictional applications, profiles, emails or provider states were added. Legacy builds retain their actual UI without fabricated snapshot controls.',
    caption: 'Public research data in an isolated preview. No applications sent.',
    recordCount: sources.reduce((count, source) => count + source.recordCount, 0), sources, snapshotApiAvailable, snapshots,
    runCount: 0, applicationEventCount: 0, providerConnections: 0, externalRequestCount: 0,
    limitations: ['The screenshot reflects the supplied local build and may show newer development UI than the current public release.', 'Mobile country tabs scroll horizontally; the screenshot shows the initial viewport.', 'Emulated mobile viewport, not a physical-device test.', 'Public research dates do not establish current vacancies or tested recruitment routes.'], shots,
  };
  await writeFile(join(output, 'provenance.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ appVersion: report.appVersion, records: report.recordCount, countries: sources.map(({ name, recordCount }) => ({ name, recordCount })), images: shots.map(({ file, width, height, bytes }) => ({ file, width, height, bytes })), runCount: 0, applicationEventCount: 0 }, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
