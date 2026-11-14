import { test, expect } from '@playwright/test';

const labels = { applications: 'Applications sent', profiles: 'Profiles created', emails: 'Emails sent' };
const snapshot = page => page.getByRole('region', { name: 'Directory snapshot', exact: true });
const metric = (page, key, value) => snapshot(page).getByRole('button', {
  name: value === undefined ? new RegExp(`^${labels[key]}:`) : `${labels[key]}: ${value}`, exact: value !== undefined,
});
const period = page => snapshot(page).getByRole('combobox', { name: 'Snapshot period', exact: true });
const records = dialog => dialog.getByRole('list', { name: 'Snapshot records', exact: true }).locator('li:not(.snapshot-empty)');

test.beforeEach(async ({ page, request }) => {
  page.__snapshotErrors = [];
  page.on('pageerror', error => page.__snapshotErrors.push(error.message));
  await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  // All records are synthetic and the server uses Playwright's isolated data folder.
  await request.patch('/api/settings', { data: { language: 'en' } });
  await page.route('**/api/run', route => route.fulfill({ status: 409, json: { error: 'Snapshot tests never start a run.' } }));
});
test.afterEach(async ({ page }) => expect(page.__snapshotErrors).toEqual([]));

async function directoryFixture(request, name, count = 2) {
  const response = await request.post('/api/directories', { data: { name, flag: '📁' } });
  expect(response.ok()).toBeTruthy();
  const directory = await response.json();
  const added = await request.post(`/api/directories/${directory.id}/companies`, { data: {
    records: Array.from({ length: count }, (_, index) => ({
      name: `${name} company ${String(index).padStart(3, '0')}`,
      type: 'Private company', location: 'Dubai',
      careersUrl: `https://careers.example.test/${index}/profile`,
    })),
  } });
  expect(added.ok()).toBeTruthy();
  const companies = await (await request.get(`/api/companies?directoryId=${directory.id}&limit=1000`)).json();
  return { ...directory, companies: companies.items };
}

async function profileFixture(request, company, event = 'profile_created') {
  const result = await request.post('/api/applications', { data: {
    companyId: company.id, event, method: 'career_page', url: company.careersUrl,
    evidence: 'Synthetic fixture confirms the career-page outcome.',
  } });
  expect(result.ok()).toBeTruthy();
  return result.json();
}

async function openDirectory(page, directory) {
  await page.addInitScript(id => localStorage.setItem('apply-directory', id), directory.id);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(directory.name);
  await expect(snapshot(page)).toBeVisible();
}

function responseFor(url, directory, counts, itemSets = {}) {
  const query = new URL(url).searchParams;
  const selected = query.get('metric');
  const offset = Number(query.get('offset') || 0);
  const limit = Number(query.get('limit') || 20);
  const items = itemSets[selected] || [];
  return {
    directoryId: directory.id, directoryName: directory.name,
    period: query.get('period') || 'all_time', timeZone: 'Asia/Dubai',
    since: query.get('period') === 'this_week' ? '2026-11-08T20:00:00.000Z' : null,
    until: '2026-11-13T12:00:00.000Z', counts,
    ...(selected ? { metric: selected } : {}),
    items: selected ? items.slice(offset, offset + limit) : [],
    total: selected ? items.length : 0, offset, limit,
  };
}

function fakeItems(directory, count, kind = 'emails') {
  return Array.from({ length: count }, (_, index) => ({
    id: `${kind}-${index}`, companyId: directory.companies[index % directory.companies.length].id,
    companyName: `Recorded company ${String(index + 1).padStart(2, '0')}`,
    role: kind === 'emails' ? 'Future opportunities' : `Role ${index + 1}`,
    at: '2026-11-13T10:00:00.000Z', method: kind === 'emails' ? 'email' : 'career_page',
    ...(kind === 'emails' ? { recipient: `careers${index}@example.test` } : {}),
  }));
}

test('directory snapshot counts completed profiles across table pages and ignores status-only applications and list filters', async ({ page, request }) => {
  const directory = await directoryFixture(request, 'Snapshot scope', 105);
  const other = await directoryFixture(request, 'Snapshot other');
  const first = directory.companies[0], last = directory.companies.at(-1);
  const profile = await profileFixture(request, first);
  await profileFixture(request, last);
  await profileFixture(request, directory.companies[1], 'account_created');
  await profileFixture(request, other.companies[0]);
  // A later state must retain the original completion without double-counting it.
  expect((await request.post('/api/applications', { data: {
    id: profile.id, companyId: first.id, event: 'prepared', method: 'career_page',
    url: first.careersUrl, evidence: 'Synthetic later update, no job application sent.',
  } })).ok()).toBeTruthy();
  const freshCompany = (await (await request.get(`/api/companies/${first.id}`)).json()).company;
  expect((await request.patch(`/api/companies/${first.id}`, { data: {
    status: 'applied', expectedRevision: freshCompany.revision,
  } })).ok()).toBeTruthy();
  await openDirectory(page, directory);
  await expect(page.locator('tbody tr')).toHaveCount(100);
  await expect(metric(page, 'applications', 0)).toBeEnabled();
  await expect(metric(page, 'profiles', 2)).toBeEnabled();
  await expect(metric(page, 'emails', 0)).toBeEnabled();
  await page.getByRole('textbox', { name: 'Search companies', exact: true }).fill('no such fixture company');
  await expect(page.locator('tbody tr')).toHaveCount(0);
  await expect(metric(page, 'profiles', 2)).toBeVisible();
  await metric(page, 'profiles', 2).click();
  const dialog = page.getByRole('dialog', { name: 'Profiles created', exact: true });
  await expect(records(dialog)).toHaveCount(2);
  await expect(dialog.getByRole('button', { name: first.name, exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: last.name, exact: true })).toBeVisible();
  await expect(dialog).not.toContainText(other.companies[0].name);
  await dialog.getByRole('button', { name: last.name, exact: true }).click();
  await expect(page.getByRole('dialog', { name: last.name, exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: last.name, exact: true }).locator('.application-list')).toContainText('Profile created');
  await expect(page.getByRole('dialog', { name: last.name, exact: true }).getByRole('link', { name: 'Career page', exact: true })).toHaveAttribute('href', last.careersUrl);
});

test('email snapshot opens every recorded message with pagination and a period-specific count', async ({ page, request }) => {
  const directory = await directoryFixture(request, 'Snapshot email pages');
  const allEmails = fakeItems(directory, 23);
  const calls = [];
  await page.route('**/api/snapshot?*', route => {
    const url = route.request().url(); calls.push(new URL(url));
    const week = new URL(url).searchParams.get('period') === 'this_week';
    return route.fulfill({ json: responseFor(url, directory,
      week ? { applications: 1, profiles: 0, emails: 2 } : { applications: 3, profiles: 1, emails: 23 },
      { emails: week ? allEmails.slice(0, 2) : allEmails }) });
  });
  await openDirectory(page, directory);
  await metric(page, 'emails', 23).click();
  let dialog = page.getByRole('dialog', { name: 'Emails sent', exact: true });
  await expect(records(dialog)).toHaveCount(20);
  await expect(dialog).toContainText('careers0@example.test');
  await expect(dialog.getByRole('button', { name: 'Previous records', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Next records', exact: true }).click();
  await expect(records(dialog)).toHaveCount(3);
  await expect(dialog).toContainText('Recorded company 23');
  await expect(dialog.getByRole('button', { name: 'Next records', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Previous records', exact: true }).click();
  await expect(records(dialog)).toHaveCount(20);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await period(page).selectOption('this_week');
  await expect(metric(page, 'emails', 2)).toBeEnabled();
  await expect(metric(page, 'applications', 1)).toBeEnabled();
  await metric(page, 'emails', 2).click();
  dialog = page.getByRole('dialog', { name: 'Emails sent', exact: true });
  await expect(records(dialog)).toHaveCount(2);
  expect(calls.some(url => url.searchParams.get('metric') === 'emails' && url.searchParams.get('offset') === '20')).toBe(true);
  expect(calls.every(url => url.searchParams.get('directoryId') === directory.id)).toBe(true);
});

test('zero confirmed outcomes stay clickable and open an honest empty result', async ({ page, request }) => {
  const directory = await directoryFixture(request, 'Snapshot empty');
  await openDirectory(page, directory);
  for (const key of Object.keys(labels)) await expect(metric(page, key, 0)).toBeEnabled();
  await metric(page, 'emails', 0).click();
  const dialog = page.getByRole('dialog', { name: 'Emails sent', exact: true });
  await expect(records(dialog)).toHaveCount(0);
  await expect(dialog).toContainText(/No .*emails/i);
  await expect(dialog.getByRole('button', { name: 'Next records', exact: true })).toHaveCount(0);
});

test('failed summaries and details remain unavailable until a successful retry', async ({ page, request }) => {
  const directory = await directoryFixture(request, 'Snapshot retry');
  await page.clock.install();
  await page.addInitScript(() => {
    const recovered = { summary: false, details: false }, fetch = window.fetch.bind(window);
    document.addEventListener('click', event => {
      const button = event.target instanceof Element ? event.target.closest('button') : null;
      if (button?.textContent.trim() !== 'Retry') return;
      if (button.closest('.directory-snapshot')) recovered.summary = true;
      if (button.closest('.snapshot-detail')) recovered.details = true;
    }, true);
    window.fetch = (input, options) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname !== '/api/snapshot') return fetch(input, options);
      const kind = url.searchParams.has('metric') ? 'details' : 'summary';
      const headers = new Headers(options?.headers || input?.headers);
      // Classify each request when it is made, not after a later Retry click.
      // Automatic reads keep failing until that kind's actual manual retry.
      headers.set('X-Snapshot-Fixture-Recovery', recovered[kind] ? kind : 'pending');
      return fetch(input, { ...options, headers });
    };
  });
  let failedSummaryReads = 0;
  await page.route('**/api/snapshot?*', route => {
    const url = route.request().url(), details = new URL(url).searchParams.has('metric');
    if (route.request().headers()['x-snapshot-fixture-recovery'] !== (details ? 'details' : 'summary')) {
      if (!details) failedSummaryReads++;
      return route.fulfill({ status: 503, json: { error: 'Snapshot fixture is temporarily unavailable.' } });
    }
    return route.fulfill({ json: responseFor(url, directory, { applications: 2, profiles: 0, emails: 1 }, { applications: fakeItems(directory, 2, 'applications') }) });
  });
  await openDirectory(page, directory);
  await expect(snapshot(page).getByRole('alert')).toContainText('Couldn’t load totals.');
  await expect(metric(page, 'applications')).toBeDisabled();
  await expect(metric(page, 'applications', 0)).toHaveCount(0);
  await expect(page.locator('.table-scroll')).toHaveAttribute('aria-busy', 'false');
  const beforeRefresh = failedSummaryReads;
  await page.clock.runFor(15100);
  await expect.poll(() => failedSummaryReads).toBeGreaterThan(beforeRefresh);
  await expect(snapshot(page).getByRole('alert')).toContainText('Couldn’t load totals.');
  await expect(metric(page, 'applications')).toBeDisabled();
  await expect(metric(page, 'applications', 0)).toHaveCount(0);
  await snapshot(page).getByRole('button', { name: /Retry/ }).click();
  await metric(page, 'applications', 2).click();
  const dialog = page.getByRole('dialog', { name: 'Applications sent', exact: true });
  await expect(dialog.getByRole('alert')).toContainText('Couldn’t load records.');
  await expect(dialog).not.toContainText(/No .*applications/i);
  await dialog.getByRole('button', { name: /Retry/ }).click();
  await expect(records(dialog)).toHaveCount(2);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('a late period response cannot replace the newly selected period', async ({ page, request }) => {
  const directory = await directoryFixture(request, 'Snapshot period race');
  let release, delivered;
  const held = new Promise(resolve => { release = resolve; });
  const settled = new Promise(resolve => { delivered = resolve; });
  await page.route('**/api/snapshot?*', async route => {
    const url = route.request().url(), week = new URL(url).searchParams.get('period') === 'this_week';
    if (week) await held;
    try { await route.fulfill({ json: responseFor(url, directory, { applications: week ? 99 : 4, profiles: 0, emails: 0 }) }); }
    catch (error) { if (!week) throw error; /* The obsolete request may be aborted. */ }
    finally { if (week) delivered(); }
  });
  await openDirectory(page, directory);
  await expect(metric(page, 'applications', 4)).toBeEnabled();
  const waiting = page.waitForRequest(request => new URL(request.url()).pathname === '/api/snapshot' && new URL(request.url()).searchParams.get('period') === 'this_week');
  await period(page).selectOption('this_week');
  await waiting;
  await expect(metric(page, 'applications', 4)).toHaveCount(0);
  await expect(metric(page, 'applications')).toBeDisabled();
  await period(page).selectOption('all_time');
  await expect(metric(page, 'applications', 4)).toBeEnabled();
  release(); await settled;
  await expect(metric(page, 'applications', 99)).toHaveCount(0);
  await expect(metric(page, 'applications', 4)).toBeEnabled();
});

test('switching directories never flashes another directory totals or applies a late response', async ({ page, request }) => {
  const first = await directoryFixture(request, 'Snapshot old directory');
  const second = await directoryFixture(request, 'Snapshot new directory');
  let release, delivered;
  const held = new Promise(resolve => { release = resolve; });
  const settled = new Promise(resolve => { delivered = resolve; });
  await page.route('**/api/snapshot?*', async route => {
    const url = route.request().url(), isFirst = new URL(url).searchParams.get('directoryId') === first.id;
    if (isFirst) await held;
    try { await route.fulfill({ json: responseFor(url, isFirst ? first : second, { applications: isFirst ? 99 : 7, profiles: 0, emails: 0 }) }); }
    catch (error) { if (!isFirst) throw error; }
    finally { if (isFirst) delivered(); }
  });
  const waiting = page.waitForRequest(request => new URL(request.url()).pathname === '/api/snapshot' && new URL(request.url()).searchParams.get('directoryId') === first.id);
  await openDirectory(page, first); await waiting;
  await expect(metric(page, 'applications')).toBeDisabled();
  await page.getByRole('tab', { name: new RegExp(second.name) }).click();
  await expect(snapshot(page)).toContainText(second.name);
  await expect(metric(page, 'applications', 7)).toBeEnabled();
  release(); await settled;
  await expect(metric(page, 'applications', 99)).toHaveCount(0);
  await expect(metric(page, 'applications', 7)).toBeEnabled();
});

test('snapshot is readable at 320px and keyboard details return focus without motion', async ({ page, request }, testInfo) => {
  const directory = await directoryFixture(request, 'Snapshot narrow screen');
  await profileFixture(request, directory.companies[0]);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDirectory(page, directory);
  const profiles = metric(page, 'profiles', 1);
  await expect(profiles).toBeVisible();
  await expect(period(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await profiles.focus(); await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Profiles created', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(profiles).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('snapshot-320.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('emails without saved receipts are explained without increasing the confirmed total', async ({ page, request }) => {
  const directory = await directoryFixture(request, 'Snapshot missing receipts');
  await page.route('**/api/snapshot?*', route => route.fulfill({ json: {
    ...responseFor(route.request().url(), directory, { applications: 0, profiles: 0, emails: 1 }, { emails: fakeItems(directory, 1) }),
    unverifiedEmails: 3,
  } }));
  await openDirectory(page, directory);
  const emails = metric(page, 'emails', 1);
  await expect(emails).toBeEnabled();
  await expect(emails.locator('sup')).toHaveText('*');
  await expect(emails).toHaveAttribute('aria-description', /Some earlier emails have no saved receipt/);
  await expect(snapshot(page).getByText('Some earlier emails have no saved receipt and aren’t included.', { exact: true })).toHaveCount(0);
  await emails.click();
  const dialog = page.getByRole('dialog', { name: 'Emails sent', exact: true });
  await expect(records(dialog)).toHaveCount(1);
  await expect(dialog).toContainText('Some earlier emails have no saved receipt and aren’t included.');
  await expect(dialog).toContainText('An emailed application also appears under Applications sent.');
});

test('refreshing the same directory keeps confirmed totals and the chosen period visible', async ({ page, request }) => {
  const directory = await directoryFixture(request, 'Snapshot stable refresh');
  let holdRefresh = false, release;
  const held = new Promise(resolve => { release = resolve; });
  await page.route('**/api/snapshot?*', async route => {
    const isRefresh = holdRefresh;
    if (isRefresh) await held;
    await route.fulfill({ json: responseFor(route.request().url(), directory, { applications: isRefresh ? 5 : 3, profiles: 0, emails: 0 }) });
  });
  await openDirectory(page, directory);
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(metric(page, 'applications', 3)).toBeEnabled();
  await period(page).selectOption('this_week');
  await expect(snapshot(page)).toHaveAttribute('aria-busy', 'false');
  holdRefresh = true;
  const refreshRequest = page.waitForRequest(request => new URL(request.url()).pathname === '/api/snapshot');
  await page.getByRole('textbox', { name: 'Search companies', exact: true }).fill('company 000');
  await refreshRequest;
  await expect(snapshot(page)).toHaveAttribute('aria-busy', 'true');
  await expect(metric(page, 'applications', 3)).toBeEnabled();
  await expect(period(page)).toHaveValue('this_week');
  release();
  await expect(metric(page, 'applications', 5)).toBeEnabled();
  await expect(snapshot(page)).toHaveAttribute('aria-busy', 'false');
  await expect(period(page)).toHaveValue('this_week');
});

test('Arabic snapshot fits 320px and preserves translated keyboard navigation', async ({ page, request }, testInfo) => {
  const directory = await directoryFixture(request, 'ملخص تجريبي');
  await profileFixture(request, directory.companies[0]);
  expect((await request.patch('/api/settings', { data: { language: 'ar' } })).ok()).toBeTruthy();
  try {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addInitScript(id => localStorage.setItem('apply-directory', id), directory.id);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    const summary = page.getByRole('region', { name: 'ملخص الدليل', exact: true });
    const picker = summary.getByRole('combobox', { name: 'فترة الملخص', exact: true });
    const profiles = summary.getByRole('button', { name: `ملفات مهنية أُنشئت: ${new Intl.NumberFormat('ar').format(1)}`, exact: true });
    await expect(profiles).toBeEnabled();
    await expect(picker).toBeVisible();
    await expect(picker.getByRole('option', { name: 'كل الفترات', exact: true })).toHaveCount(1);
    await expect(picker.getByRole('option', { name: 'هذا الأسبوع', exact: true })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await profiles.focus(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'ملفات مهنية أُنشئت', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'إغلاق', exact: true })).toBeFocused();
    await expect(dialog.getByRole('list', { name: 'سجلات الملخص', exact: true }).getByRole('listitem')).toHaveCount(1);
    await expect(dialog).not.toContainText('Companies with a completed career profile');
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(profiles).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath('snapshot-arabic-320.png'), fullPage: true });
  } finally {
    await request.patch('/api/settings', { data: { language: 'en' } });
  }
});
