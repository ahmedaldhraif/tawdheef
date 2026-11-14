import { test, expect } from '@playwright/test';
import { isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';

const json = async (request, url) => {
  const response = await request.get(url);
  expect(response.ok()).toBeTruthy();
  return response.json();
};

async function openTracker(page) {
  await page.goto('/');
  await expect(page.getByRole('tab', { name: /UAE/ })).toBeVisible();
  await expect(page.locator('.company-name').first()).toBeVisible();
}

async function searchFor(page, name) {
  await page.getByRole('textbox', { name: 'Search companies', exact: true }).fill(name);
  const row = page.locator('tbody tr').filter({ has: page.getByText(name, { exact: true }) });
  await expect(row).toHaveCount(1);
  return row;
}

async function listOption(page, name) {
  await page.getByRole('button', { name: 'List options', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}

async function createFixture(request, name, records) {
  const response = await request.post('/api/directories', { data: { name, flag: '📁' } });
  expect(response.ok()).toBeTruthy();
  const directory = await response.json();
  const add = await request.post(`/api/directories/${directory.id}/companies`, { data: { records } });
  expect(add.ok()).toBeTruthy();
  const companies = (await json(request, `/api/companies?directoryId=${directory.id}`)).items;
  return { directory, companies };
}

async function selectDirectorySymbol(page, dialog, value) {
  await dialog.getByRole('button', { name: 'Choose a flag or icon', exact: true }).click();
  if (value.startsWith('icon:')) {
    await dialog.getByRole('tab', { name: 'Icons', exact: true }).click();
    await dialog.getByRole('combobox', { name: 'Category', exact: true }).selectOption({ label: value === 'icon:briefcase' ? 'Work' : 'Folders' });
    await dialog.getByRole('option', { name: value === 'icon:briefcase' ? 'Briefcase' : 'Folder', exact: true }).click();
  } else {
    await dialog.getByRole('tab', { name: 'Countries & territories', exact: true }).click();
    await dialog.getByRole('searchbox', { name: 'Search countries or codes', exact: true }).fill(value);
    const name = value === 'GB' ? 'United Kingdom (GB)' : value === 'NP' ? 'Nepal (NP)' : 'United Arab Emirates (AE)';
    await dialog.getByRole('option', { name, exact: true }).click();
  }
  await expect(dialog.getByRole('button', { name: 'Choose a flag or icon', exact: true })).toHaveAttribute('aria-expanded', 'false');
}

async function createDirectory(page, name, flag = null) {
  await page.getByRole('button', { name: 'Add directory', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add directory', exact: true });
  await dialog.getByLabel('Directory name', { exact: true }).fill(name);
  if (flag) await selectDirectorySymbol(page, dialog, flag);
  await dialog.getByRole('button', { name: 'Create directory', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('tab', { name: new RegExp(name) })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('h1')).toContainText(name);
}

test.beforeEach(async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.__runtimeErrors = errors;
  await page.route('**/api/bootstrap', async route => { const response = await route.fetch(), boot = await response.json(); boot.settings.connectionMode = 'native'; return route.fulfill({ response, json: boot }); });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort();
  });
});

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
  expect(page.__runtimeErrors).toEqual([]);
});

test('opens the real 772-record UAE source without invented applications', async ({ page, request }, testInfo) => {
  await openTracker(page);
  await expect(page.getByRole('tab', { name: /UAE/ })).toContainText('772');
  await expect(page.getByRole('tab', { name: /UAE/ }).locator('img.country-flag')).toHaveAttribute('src', '/flags/AE.svg');
  await expect.poll(() => page.getByRole('tab', { name: /UAE/ }).locator('img.country-flag').evaluate(image => image.complete && image.naturalWidth > 0)).toBeTruthy();
  await expect(page.locator('tbody tr')).toHaveCount(100);
  const data = await json(request, '/api/companies?directoryId=uae&limit=1000');
  expect(data.total).toBe(772);
  expect(data.statusCounts.not_started).toBe(772);
  expect(data.items.every(company => company.status === 'not_started')).toBeTruthy();
  const abb = data.items.find(company => company.name === 'ABB');
  expect(abb.careersUrl).toBe('https://careers.abb/global/en/career-opportunities');
  const detail = await json(request, `/api/companies/${abb.id}`);
  expect(detail.applications).toEqual([]);
  expect((await json(request, '/api/bootstrap')).runs.filter(run => run.directoryId === 'uae')).toEqual([]);
  await expect(page.getByRole('combobox', { name: 'Application status', exact: true })).toBeVisible();
  await expect(page.locator('.status-filters')).toHaveCount(0);
  await expect(page.locator('.company-initial')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('desktop-initial.png'), fullPage: true });
});

test('search finds the source company and careers link uses its real destination', async ({ page }) => {
  await openTracker(page);
  const row = await searchFor(page, 'ABB');
  await expect(row.getByRole('link', { name: 'Open careers', exact: true })).toHaveAttribute('href', 'https://careers.abb/global/en/career-opportunities');
  await page.getByRole('textbox', { name: 'Search companies', exact: true }).fill('No such organisation 12345');
  await expect(page.getByRole('heading', { name: 'No companies found', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(100);
  await expect(page.locator('.heading-actions').getByRole('button', { name: 'Check replies', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeVisible();
});

test('inline note and status edits persist across reload; Escape cancels an edit', async ({ page, request }) => {
  await openTracker(page);
  let row = await searchFor(page, 'ABB');
  await row.getByRole('button', { name: 'Edit Notes for ABB', exact: true }).click();
  await row.getByRole('textbox', { name: 'Notes for ABB', exact: true }).fill('Check UAE engineering roles this week.');
  await row.getByRole('textbox', { name: 'Notes for ABB', exact: true }).press('Enter');
  await expect(row.getByRole('button', { name: 'Edit Notes for ABB', exact: true })).toHaveText('Check UAE engineering roles this week.');
  await row.getByRole('combobox', { name: 'Status for ABB', exact: true }).selectOption('ready');
  await expect.poll(async () => (await json(request, '/api/companies?directoryId=uae&search=ABB')).items.find(company => company.name === 'ABB')?.status).toBe('ready');
  await row.getByRole('button', { name: 'Edit Notes for ABB', exact: true }).click();
  await row.getByRole('textbox', { name: 'Notes for ABB', exact: true }).fill('This draft must be cancelled.');
  await row.getByRole('textbox', { name: 'Notes for ABB', exact: true }).press('Escape');
  await page.reload();
  row = await searchFor(page, 'ABB');
  await expect(row.getByRole('button', { name: 'Edit Notes for ABB', exact: true })).toHaveText('Check UAE engineering roles this week.');
  await expect(row.getByRole('combobox', { name: 'Status for ABB', exact: true })).toHaveValue('ready');
  const company = (await json(request, '/api/companies?directoryId=uae&search=ABB')).items.find(item => item.name === 'ABB');
  expect((await json(request, `/api/companies/${company.id}`)).applications).toEqual([]);
});

test('adds and renames a flagged directory and remembers its own columns', async ({ page }) => {
  await openTracker(page);
  await createDirectory(page, 'Research shortlist');
  await page.getByRole('button', { name: 'Customize directory', exact: true }).click();
  const customize = page.getByRole('dialog', { name: 'Customize directory', exact: true });
  await customize.getByLabel('Directory name', { exact: true }).fill('UK shortlist');
  await selectDirectorySymbol(page, customize, 'GB');
  await customize.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('tab', { name: /UK shortlist/ }).locator('img.country-flag')).toHaveAttribute('src', '/flags/GB.svg');
  await expect.poll(() => page.getByRole('tab', { name: /UK shortlist/ }).locator('img.country-flag').evaluate(image => image.complete && image.naturalWidth > 0)).toBeTruthy();
  await listOption(page, 'Choose columns');
  const columns = page.getByRole('dialog', { name: 'Columns', exact: true });
  // This control persists remotely before reflecting its new checked state.
  await columns.getByRole('checkbox', { name: 'Notes', exact: true }).click();
  await expect(columns.getByRole('checkbox', { name: 'Notes', exact: true })).not.toBeChecked();
  await columns.getByRole('checkbox', { name: 'Sector', exact: true }).click();
  await expect(columns.getByRole('checkbox', { name: 'Sector', exact: true })).toBeChecked();
  await columns.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('tab', { name: /UK shortlist/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('columnheader', { name: 'Sector', exact: true })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Notes', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: /UAE/ }).click();
  await expect(page.getByRole('columnheader', { name: 'Notes', exact: true })).toBeVisible();
});

test('directory picker searches all offline country flags and Enter chooses without submitting', async ({ page, request }, testInfo) => {
  await openTracker(page);
  const before = (await json(request, '/api/bootstrap')).directories.length;
  await page.getByRole('button', { name: 'Add directory', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add directory', exact: true });
  await dialog.getByLabel('Directory name', { exact: true }).fill('Nepal research');
  await dialog.getByRole('button', { name: 'Choose a flag or icon', exact: true }).click();
  await dialog.getByRole('tab', { name: 'Countries & territories', exact: true }).click();
  const countries = dialog.getByRole('listbox', { name: 'Countries & territories', exact: true });
  await expect.poll(() => countries.getByRole('option').count()).toBeGreaterThan(240);
  const search = dialog.getByRole('searchbox', { name: 'Search countries or codes', exact: true });
  await search.fill('Nepal');
  await expect(countries.getByRole('option', { name: 'Nepal (NP)', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('directory-country-picker.png'), fullPage: true });
  await search.press('Enter');
  await expect(dialog).toBeVisible();
  expect((await json(request, '/api/bootstrap')).directories.length).toBe(before);
  await dialog.getByRole('button', { name: 'Create directory', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('tab', { name: /Nepal research/ }).locator('img.country-flag')).toHaveAttribute('src', '/flags/NP.svg');
  const saved = (await json(request, '/api/bootstrap')).directories.find(directory => directory.name === 'Nepal research');
  expect(saved.flag).toBe('NP');
  await page.reload();
  await expect(page.getByRole('tab', { name: /Nepal research/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: /Nepal research/ }).locator('img.country-flag')).toHaveAttribute('src', '/flags/NP.svg');
});

test('directory picker categories save a real icon and Escape closes only the picker', async ({ page, request }) => {
  await openTracker(page);
  await page.getByRole('button', { name: 'Add directory', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add directory', exact: true });
  await dialog.getByLabel('Directory name', { exact: true }).fill('Work shortlist');
  const trigger = dialog.getByRole('button', { name: 'Choose a flag or icon', exact: true });
  await trigger.click();
  await dialog.getByRole('searchbox').press('Escape');
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole('tab', { name: 'Icons', exact: true }).click();
  const category = dialog.getByRole('combobox', { name: 'Category', exact: true });
  for (const label of ['Folders', 'Work', 'Education', 'Interests']) await expect(category.getByRole('option', { name: label, exact: true })).toHaveCount(1);
  await category.selectOption({ label: 'Work' });
  await dialog.getByRole('option', { name: 'Briefcase', exact: true }).click();
  await dialog.getByRole('button', { name: 'Create directory', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const saved = (await json(request, '/api/bootstrap')).directories.find(directory => directory.name === 'Work shortlist');
  expect(saved.flag).toBe('icon:briefcase');
  await page.reload();
  const tab = page.getByRole('tab', { name: /Work shortlist/ });
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(tab.locator('svg')).toBeVisible();
  await expect(tab.locator('img.country-flag')).toHaveCount(0);
});

test('CSV preview leaves records unchanged until the import is committed', async ({ page, request }) => {
  await openTracker(page);
  await createDirectory(page, 'Import verification');
  await listOption(page, 'Import list');
  const dialog = page.getByRole('dialog', { name: /Import.*Import verification/ });
  await dialog.getByLabel('Paste CSV', { exact: true }).fill('Company,Careers,Sector,Source role\nUI Example One,https://example.com/careers,Engineering,Commercial employer\nUI Example Two,https://example.org/jobs,Healthcare,Job board');
  await dialog.getByRole('button', { name: 'Review import', exact: true }).click();
  await expect(dialog.getByText('2 records ready to import', { exact: true })).toBeVisible();
  const directory = (await json(request, '/api/bootstrap')).directories.find(item => item.name === 'Import verification');
  expect((await json(request, `/api/companies?directoryId=${directory.id}`)).total).toBe(0);
  await dialog.getByRole('button', { name: 'Add to directory', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  const rows = (await json(request, `/api/companies?directoryId=${directory.id}`)).items;
  expect(rows.map(item => item.name)).toEqual(['UI Example One', 'UI Example Two']);
  expect(rows[1].sourceRole).toBe('Job board');
  expect(rows.every(item => item.status === 'not_started')).toBeTruthy();
});

test('Monitoring keeps local report generation and never rewrites saved adapter preferences', async ({ page, request }, testInfo) => {
  await openTracker(page);
  const before = await json(request, '/api/settings');
  const runsBefore = (await json(request, '/api/bootstrap')).runs;
  await page.locator('.monitor-summary').getByRole('button', { name: 'Monitoring', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Monitoring', exact: true });
  await dialog.locator('summary').filter({ hasText: /^Reports & replies$/ }).click();
  await expect(dialog.locator('summary').filter({ hasText: /^Local reply checks$/ })).toHaveCount(0);
  await expect(dialog.getByRole('checkbox', { name: 'Email reports to me', exact: true })).toHaveCount(0);
  await dialog.locator('summary').filter({ hasText: /^Latest report$/ }).click();
  await dialog.getByRole('button', { name: 'Generate report', exact: true }).click();
  await expect(dialog).not.toContainText('No reports yet.');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const after = await json(request, '/api/settings');
  for (const key of ['reportFrequency', 'reportTime', 'reportEmail', 'emailReports', 'refreshFrequency', 'lastRefreshAt']) expect(after[key]).toBe(before[key]);
  expect((await json(request, '/api/bootstrap')).runs).toEqual(runsBefore);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const preferences = page.getByRole('dialog', { name: 'Preferences', exact: true });
  await expect(preferences.getByLabel('Time zone', { exact: true })).toHaveValue('Asia/Dubai');
  await expect(preferences.locator('summary').filter({ hasText: /^Reports & replies$/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('native-preferences.png') });
});

test('a saved Last update date opens the matching company activity', async ({ page, request }) => {
  const { directory, companies } = await createFixture(request, 'Activity verification', [{ name: 'UI Activity Example', careersUrl: 'https://example.com/jobs' }]);
  const response = await request.patch(`/api/companies/${companies[0].id}`, { data: { notes: 'A recorded local change.' } });
  expect(response.ok()).toBeTruthy();
  const detail = await json(request, `/api/companies/${companies[0].id}`);
  await openTracker(page);
  await page.getByRole('tab', { name: /Activity verification/ }).click();
  const row = await searchFor(page, 'UI Activity Example');
  await row.getByRole('button', { name: 'View activity for UI Activity Example', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'UI Activity Example', exact: true });
  await expect(dialog.getByRole('tab', { name: 'Application history', exact: true })).toHaveClass(/active/);
  await expect(dialog.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible();
  await expect(dialog.locator('.activity-list')).toContainText(detail.activity[0].detail);
  expect((await json(request, `/api/companies?directoryId=${directory.id}`)).total).toBe(1);
});

test('dialog focus stays inside, Escape closes it, and focus returns to the trigger', async ({ page }) => {
  await openTracker(page);
  const trigger = page.getByRole('button', { name: 'Settings', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Preferences', exact: true });
  const close = dialog.getByRole('button', { name: 'Close', exact: true });
  await expect(close).toBeFocused();
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('agent setup stays in the actual client while machine configuration remains available', async ({ page, request, baseURL }, testInfo) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__setupClipboard = text; } } }));
  await openTracker(page);
  const config = await json(request, '/api/agent-config');
  const server = config.mcpServers['apply-tracker'];
  expect(isAbsolute(server.command)).toBeTruthy(); expect(existsSync(server.command)).toBeTruthy();
  expect(isAbsolute(server.args[0])).toBeTruthy(); expect(existsSync(server.args[0])).toBeTruthy();
  expect(server.env.APPLY_TRACKER_DATA).toContain('apply-tracker-ui-');
  expect(server.env.APPLY_TRACKER_PORT).toBe(new URL(baseURL).port);
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  await page.getByRole('button', { name: /^Assistant —/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Assistant', exact: true });
  await expect(dialog.locator('pre, code, textarea')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Copy setup request', exact: true }).click();
  expect(await page.evaluate(() => window.__setupClipboard)).toContain('Codex');
  await expect(dialog.getByRole('button', { name: 'Setup request copied', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('compact-native-assistant.png') });
});

test('mobile keeps page width within the viewport while the table scrolls', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTracker(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  const scroll = page.locator('.table-scroll');
  expect(await scroll.evaluate(element => element.scrollWidth > element.clientWidth)).toBeTruthy();
  const addCompany = await page.getByRole('button', { name: 'Add company', exact: true }).boundingBox();
  expect(addCompany.x + addCompany.width).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const bounds = await page.getByRole('dialog', { name: 'Preferences', exact: true }).boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await expect(page.locator('.company-name').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
});

test('Native Run uses the existing assistant, shows real queue state and stops without test submissions', async ({ page, request }, testInfo) => {
  await openTracker(page);
  // Wait for the filtered response before selecting; the existing ABB row is
  // already visible in the unfiltered page while the search is debouncing.
  const searched = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/companies' && url.searchParams.get('search') === 'ABB';
  });
  const row = await searchFor(page, 'ABB');
  await searched;
  await expect(page.locator('.heading-actions').getByRole('button', { name: /^Run on/ })).toBeEnabled();
  await row.getByRole('checkbox', { name: 'Select ABB', exact: true }).check();
  const company = (await json(request, '/api/companies?directoryId=uae&search=ABB')).items.find(c => c.name === 'ABB');
  let run = { id: 'fixture-run', native: true, assistant: 'codex', companyIds: [company.id], completed: 0, status: 'running', activeCompanyId: company.id, targets: [{ companyId: company.id, name: 'ABB', status: 'working' }] };
  await page.route('**/api/native/runs', route => { const input = route.request().postDataJSON(); expect(input.explicit).toBe(true); expect(input.assistant).toBe('codex'); expect(input.companyIds).toEqual([company.id]); expect(input.limit).toBeUndefined(); return route.fulfill({ json: { run } }); });
  await page.route('**/api/runs/fixture-run', route => route.fulfill({ json: run }));
  await page.route('**/api/runs/fixture-run/targets?*', route => route.fulfill({json:{runId:run.id,offset:0,limit:50,total:run.companyIds.length,items:run.targets}}));
  await page.route('**/api/runs/fixture-run/stop', route => { run = { ...run, status: 'cancelled', activeCompanyId: null }; return route.fulfill({ json: run }); });
  await page.getByRole('button', { name: /^Run/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Run', exact: true });
  await expect(dialog.getByRole('status')).toContainText('1 selected company');
  await dialog.locator('summary').filter({ hasText: /^Add a note$/ }).click();
  await dialog.getByLabel('Note (optional)', { exact: true }).fill('Engineering roles in the UAE.');
  await dialog.getByRole('button', { name: /^Run on/ }).click();
  const progress = page.getByRole('dialog', { name: 'Run progress', exact: true });
  await expect(progress.getByText('Working on ABB')).toBeVisible();
  await expect(progress.locator('.run-targets')).toContainText('ABB');
  await page.screenshot({ path: testInfo.outputPath('run-progress.png') });
  await progress.getByRole('button', { name: 'Stop run', exact: true }).click();
  await expect(progress.getByText('Run stopped')).toBeVisible();
  expect((await json(request, `/api/companies/${company.id}`)).applications).toEqual([]);
});

test('active run stays visible across directories and summary keeps confirmed count while details load', async ({ page, request }) => {
  const created = await request.post('/api/directories', { data: { name: 'Other run tab' } }); expect(created.ok()).toBeTruthy();
  const summary = { id: 'progress-fixture', directoryId: 'uae', directoryName: 'UAE', native: true, assistant: 'codex', total: 40, completed: 30, appliedCount: 3, activeCompanyId: 'company-30', currentName: 'Current company', status: 'running' };
  await page.route('**/api/bootstrap', async route => { const response = await route.fetch(); const body = await response.json(); body.settings.connectionMode = 'native'; body.runs = [summary]; await route.fulfill({ json: body }); });
  await page.route('**/api/runs/progress-fixture', route => route.fulfill({ status: 503, json: { error: 'Fixture details unavailable' } }));
  await page.route('**/api/runs/progress-fixture/targets?*', route => route.fulfill({status:503,json:{error:'Fixture target history unavailable'}}));
  await openTracker(page); await page.getByRole('tab', { name: /Other run tab/ }).click();
  await expect(page.locator('.run-banner')).toContainText('UAE'); await expect(page.locator('.run-banner')).toContainText('Current company');
  await expect(page.locator('.run-banner').getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
  await page.locator('.heading-actions').getByRole('button', { name: 'View progress', exact: true }).click();
  const progress = page.getByRole('dialog', { name: 'Run progress', exact: true });
  await expect(progress).toContainText('3 with confirmed submissions'); await expect(progress).toContainText('Working on Current company');
  await expect(progress.getByRole('alert').filter({hasText:'Fixture details unavailable'})).toBeVisible();
  await expect(progress.getByRole('alert').filter({hasText:'Fixture target history unavailable'})).toBeVisible();
});

test('Contacts keeps website, careers, LinkedIn and email directly available in one cell', async ({ page }) => {
  await openTracker(page);
  await createDirectory(page, 'Contact verification');
  await listOption(page, 'Import list');
  const dialog = page.getByRole('dialog', { name: /Import.*Contact verification/ });
  await dialog.getByLabel('Paste CSV', { exact: true }).fill('Company,Website,Careers,LinkedIn,Email\nUI Contact Example,https://example.com/company,https://example.com/careers,https://www.linkedin.com/company/ui-contacts/,jobs@example.com');
  await dialog.getByRole('button', { name: 'Review import', exact: true }).click();
  await expect(dialog.getByText(/1 records? ready to import/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Add to directory', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Contacts', exact: true })).toBeVisible();
  const row = await searchFor(page, 'UI Contact Example');
  const contacts = row.locator('td.col-careersUrl');
  await expect(contacts.locator('a[href="https://example.com/company"]')).toBeVisible();
  await expect(contacts.locator('a[href="https://example.com/careers"]')).toBeVisible();
  await expect(contacts.locator('a[href="https://www.linkedin.com/company/ui-contacts/"]')).toBeVisible();
  await expect(contacts.locator('a[href="mailto:jobs@example.com"]')).toBeVisible();
  for (const link of await contacts.getByRole('link').all()) await expect(link).toHaveAccessibleName(/\S/);
  const linkedin = contacts.getByRole('link', { name: 'Open LinkedIn company page', exact: true });
  const mark = linkedin.locator('svg.brand-mark-linkedin');
  await expect(mark).toHaveAttribute('viewBox', '0 0 24 24');
  await expect(mark).toHaveAttribute('aria-hidden', 'true');
  await expect(linkedin.locator('img')).toHaveCount(0);
  const dimensions = await mark.boundingBox();
  expect(dimensions.width).toBe(14);
  expect(dimensions.height).toBe(14);
  await expect(linkedin.locator('svg')).toHaveCount(1);
});


test('List options supports keyboard navigation, Escape focus return and an unclipped action menu', async ({ page }, testInfo) => {
  await openTracker(page);
  const trigger = page.getByRole('button', { name: 'List options', exact: true });
  await trigger.press('ArrowDown');
  const menu = page.getByRole('menu', { name: 'List options', exact: true });
  await expect(menu).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Choose columns', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Import list', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: 'Manage directory packs', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('menuitem', { name: 'Choose columns', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(menu).toBeVisible();
  expect(await menu.evaluate(element => element.matches(':popover-open'))).toBeTruthy();
  const menuBounds = await menu.boundingBox();
  const toolbarBounds = await page.locator('.table-toolbar').boundingBox();
  expect(menuBounds.y + menuBounds.height).toBeGreaterThan(toolbarBounds.y + toolbarBounds.height);
  expect(menuBounds.x).toBeGreaterThanOrEqual(0);
  expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(1440);
  await page.screenshot({ path: testInfo.outputPath('list-options.png'), fullPage: true });
  await page.getByRole('menuitem', { name: 'Choose columns', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Columns', exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBeTruthy();
  await page.keyboard.press('Escape');
  await trigger.press('ArrowUp');
  await expect(page.getByRole('menuitem', { name: 'Manage directory packs', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menuitem', { name: 'Export all companies (CSV)', exact: true })).toBeFocused();
  const exported = page.waitForEvent('download');
  await page.keyboard.press('Space');
  expect((await exported).suggestedFilename()).toMatch(/\.csv$/);
  await expect(menu).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('attention and follow-up filters select only their real local records', async ({ page, request }) => {
  const { directory, companies } = await createFixture(request, 'Attention filter verification', [
    { name: 'UI Needs My Help', careersUrl: 'https://example.com/help' },
    { name: 'UI Follow Up Due', careersUrl: 'https://example.com/followup' },
    { name: 'UI No Attention Needed', careersUrl: 'https://example.com/clear' },
  ]);
  const byName = name => companies.find(company => company.name === name);
  let response = await request.patch(`/api/companies/${byName('UI Needs My Help').id}`, { data: { attention: 'needs_you' } });
  expect(response.ok()).toBeTruthy();
  const due = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  response = await request.patch(`/api/companies/${byName('UI Follow Up Due').id}`, { data: { followUpAt: due } });
  expect(response.ok()).toBeTruthy();
  await openTracker(page);
  await page.getByRole('tab', { name: /Attention filter verification/ }).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  const filter = page.getByRole('combobox', { name: 'Application status', exact: true });
  await filter.selectOption('needs_you');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toContainText('UI Needs My Help');
  await filter.selectOption('follow_up_due');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toContainText('UI Follow Up Due');
  await filter.selectOption('');
  await expect(page.locator('tbody tr')).toHaveCount(3);
  const saved = await json(request, `/api/companies?directoryId=${directory.id}`);
  expect(saved.items.every(company => company.status === 'not_started')).toBeTruthy();
});

test('a delayed initial company request shows loading rather than an empty result', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/companies?*', async route => { await gate; await route.continue(); });
  await page.goto('/');
  await expect(page.getByRole('tab', { name: /UAE/ })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Loading companies…' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No companies found', exact: true })).not.toBeVisible();
  expect(await page.locator('.table-scroll').getAttribute('aria-busy')).toBe('true');
  release();
  await expect(page.locator('tbody tr:not(.skeleton-row)')).toHaveCount(100);
  await expect(page.locator('.table-scroll')).toHaveAttribute('aria-busy', 'false');
});

test('inline note Undo restores the previous saved value', async ({ page, request }) => {
  await createFixture(request, 'Undo verification', [{ name: 'UI Undo Example', careersUrl: 'https://example.com/jobs' }]);
  await openTracker(page);
  await page.getByRole('tab', { name: /Undo verification/ }).click();
  const row = await searchFor(page, 'UI Undo Example');
  await row.getByRole('button', { name: 'Edit Notes for UI Undo Example', exact: true }).click();
  const editor = row.getByRole('textbox', { name: 'Notes for UI Undo Example', exact: true });
  await editor.fill('A note to undo immediately.');
  await editor.press('Enter');
  await expect(row.getByRole('button', { name: 'Edit Notes for UI Undo Example', exact: true })).toHaveText('A note to undo immediately.');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Edit Notes for UI Undo Example', exact: true })).toHaveText('Add a note');
});

test('Add email opens the matching contact field and saves its real local value', async ({ page, request }) => {
  await createFixture(request, 'Missing contact verification', [{ name: 'UI Missing Email', website: 'https://example.com' }]);
  await openTracker(page);
  await page.getByRole('tab', { name: /Missing contact verification/ }).click();
  const row = await searchFor(page, 'UI Missing Email');
  await row.getByRole('button', { name: 'Add email for UI Missing Email', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'UI Missing Email', exact: true });
  const email = dialog.getByLabel('Careers email', { exact: true });
  await expect(email).toBeFocused();
  await email.fill('jobs@example.com');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(row.getByRole('link', { name: 'Email UI Missing Email', exact: true })).toHaveAttribute('href', 'mailto:jobs@example.com');
});

test('Undo remains available while its notification is hovered or keyboard focused', async ({ page, request }) => {
  const { companies } = await createFixture(request, 'Notification timing verification', [{ name: 'UI Timed Undo' }]);
  const saved = await request.patch('/api/companies/' + companies[0].id, { data: { notes: 'Original note', expectedRevision: companies[0].revision } });
  expect(saved.ok()).toBeTruthy();
  await openTracker(page);
  await page.getByRole('tab', { name: /Notification timing verification/ }).click();
  const row = await searchFor(page, 'UI Timed Undo');
  await page.clock.install();
  await row.getByRole('button', { name: 'Edit Notes for UI Timed Undo', exact: true }).click();
  const editor = row.getByRole('textbox', { name: 'Notes for UI Timed Undo', exact: true });
  await editor.fill('Changed note'); await editor.press('Enter');
  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  await expect(undo).toBeVisible();
  await undo.hover(); await page.clock.fastForward(12000);
  await expect(undo).toBeVisible();
  await undo.focus(); await page.mouse.move(2, 2); await page.clock.fastForward(12000);
  await expect(undo).toBeVisible();
  await undo.press('Enter');
  await expect(row.getByRole('button', { name: 'Edit Notes for UI Timed Undo', exact: true })).toHaveText('Original note');
});
