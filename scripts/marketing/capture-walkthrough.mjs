// Captures the released app with disposable example data. Never starts a Run.
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const root = process.cwd();
const flags=process.argv.slice(2);
const appFlag=flags.indexOf('--app-root');
if(appFlag>=0&&!flags[appFlag+1])throw new Error('--app-root needs a built Tawdheef checkout.');
const appRoot = appFlag>=0?resolve(flags[appFlag+1]):root;
const output = resolve(root, 'public/site-assets/walkthrough');
const auditOutput = resolve(root, 'outputs/tawdheef-walkthrough-20261113');
const dataDir = await mkdtemp(join(tmpdir(), 'tawdheef-public-demo-'));
const port = 4031;
const base = `http://127.0.0.1:${port}`;
const instanceId = 'isolated-public-walkthrough';
await stat(join(appRoot, 'dist/index.html'));
try {
  await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(500) });
  throw new Error(`Port ${port} is occupied; do not reuse another app instance.`);
} catch (error) {
  if (error.message.includes('occupied')) throw error;
}
await mkdir(output, { recursive: true });
await mkdir(auditOutput, { recursive: true });
const server = spawn(process.execPath, ['server/index.mjs'], {
  cwd: appRoot, windowsHide: true,
  env: { ...process.env, APPLY_TRACKER_DATA: dataDir, APPLY_TRACKER_PORT: String(port), APPLY_TRACKER_INSTANCE: instanceId },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', text => serverLog += text);
server.stderr.on('data', text => serverLog += text);
let browser;
const api = async (path, method = 'GET', data) => {
  const response = await fetch(base + path, {
    method,
    ...(data ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${JSON.stringify(result)}`);
  return result;
};
try {
  let healthy = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    try { healthy = (await api('/api/health')).instanceId === instanceId; } catch {}
    if (healthy) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!healthy) throw new Error(`Isolated server did not start: ${serverLog}`);
  const directory = await api('/api/directories', 'POST', { name: 'Example job search', country: 'AE', flag: 'AE' });
  const names = ['Example employer', 'Example studio', 'Example technology', 'Example services', 'Example group', 'Example organisation'];
  await api(`/api/directories/${directory.id}/companies`, 'POST', {
    records: names.map((name, index) => ({
      id: `walkthrough-example-${index + 1}`, name,
      sourceRole: 'Example employer',
      website: 'https://example.org', careersUrl: 'https://example.org',
      sourceFields: { description: 'Fictional public walkthrough fixture. No real vacancies, accounts or applications.' },
    })),
  });
  browser = await chromium.launch({ headless: true });
  const errors = [];
  const shots = [];
  for (const mobile of [false, true]) {
    // Restore the initial example state through the same validated API.
    const companies = (await api(`/api/companies?directoryId=${directory.id}`)).items;
    const employer = companies.find(company => company.name === 'Example employer');
    await api(`/api/companies/${employer.id}`, 'PATCH', {
      expectedRevision: employer.revision, status: 'not_started',
      nextAction: 'Find a suitable role', notes: '',
    });
    const context = await browser.newContext({
      viewport: mobile ? { width: 390, height: 820 } : { width: 1100, height: 760 },
      deviceScaleFactor: 1, reducedMotion: 'reduce',
      ...(mobile ? { isMobile: true, hasTouch: true } : {}),
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.origin === base ? route.continue() : route.abort();
    });
    await context.addInitScript(id => localStorage.setItem('apply-directory', id), directory.id);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.getByRole('heading', { level: 1, name: /Example job search/ }).waitFor();
    await page.getByRole('checkbox', { name: 'Select Example employer', exact: true }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const capture = async name => {
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        for (const element of document.querySelectorAll('.table-scroll, .table-wrap')) element.scrollTop = 0;
      });
      if (name === 'tracking') await page.locator('.toast').waitFor({ state: 'hidden', timeout: 15000 });
      await page.mouse.move(1, 1);
      await page.waitForTimeout(180);
      const file = `${name}${mobile ? '-mobile' : ''}.png`;
      await page.screenshot({ path: join(output, file), animations: 'disabled' });
      const bytes = await readFile(join(output, file));
      shots.push({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), width: mobile ? 390 : 1100, height: mobile ? 820 : 760 });
    };
    await capture('directory');
    await page.getByRole('checkbox', { name: 'Select Example employer', exact: true }).check();
    await page.getByRole('checkbox', { name: 'Select Example group', exact: true }).check();
    await capture('targets');
    await page.locator('.company-name').filter({ hasText: /^Example employer/ }).click();
    let details = page.getByRole('dialog', { name: 'Example employer', exact: true });
    await details.getByRole('combobox').first().selectOption('ready');
    await details.getByLabel('Next action', { exact: true }).fill('Review role requirements before applying');
    await details.getByLabel('Notes', { exact: true }).fill('Example only. Compare role requirements with your actual CV. No applications sent.');
    await details.getByRole('button', { name: 'Save changes', exact: true }).click();
    await details.getByRole('button', { name: 'Close', exact: true }).click();
    await details.waitFor({ state: 'hidden' });
    await page.locator('.company-name').filter({ hasText: /^Example employer/ }).click();
    details = page.getByRole('dialog', { name: 'Example employer', exact: true });
    await details.getByLabel('Next action', { exact: true }).waitFor();
    await capture('tracking');
    await context.close();
  }
  const bootstrap = await api('/api/bootstrap');
  const companies = (await api(`/api/companies?directoryId=${directory.id}`)).items;
  const applications = await Promise.all(companies.map(company => api(`/api/companies/${company.id}`)));
  if (bootstrap.runs.length || applications.some(detail => detail.applications.length)) throw new Error('Walkthrough must have no Runs or application events.');
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  await writeFile(join(auditOutput, 'provenance.json'), JSON.stringify({
    capturedAt: new Date().toISOString(), appVersion: JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8')).version,
    appRoot, dataDir, port, directoryName: directory.name,
    description: 'Actual released app UI. Fictional example.org records created through validated HTTP domain operations. Selected rows, then a manually saved Ready status, next action and note. No Run opened or started; no account connections, provider actions, applications, messages or receipts.',
    runCount: bootstrap.runs.length, applicationEventCount: 0,
    caption: 'Illustrated with example data. No applications sent.', shots,
  }, null, 2) + '\n');
  console.log(JSON.stringify({ appVersion: '0.1.1', totalImageBytes: shots.reduce((sum, shot) => sum + shot.bytes, 0), shots }, null, 2));
} catch (error) {
  const activePage = browser?.contexts().at(-1)?.pages().at(-1);
  if (activePage) {
    await activePage.screenshot({ path: join(auditOutput, 'capture-error.png') });
    await writeFile(join(auditOutput, 'capture-error.txt'), await activePage.locator('body').innerText());
  }
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
