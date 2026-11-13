import { test, expect } from '@playwright/test';

const fixtureRecords = [
  { name: 'Filter Federal', type: 'Federal government entity', location: 'Abu Dhabi' },
  { name: 'Filter Local', type: 'Emirate government entity', location: 'Dubai' },
  { name: 'Filter Government Company', type: 'Government-owned company', location: 'Abu Dhabi' },
  { name: 'Filter Private', type: 'Private company', location: 'Dubai' },
  { name: 'Filter Nonprofit', type: 'Non-profit organisation', location: 'UAE-wide' },
  { name: 'Filter Unknown', type: 'Company, ownership unconfirmed', location: '' },
];

async function openFixture(page, request, name, records = fixtureRecords) {
  const response = await request.post('/api/directories', { data: { name } });
  expect(response.ok()).toBeTruthy();
  const directory = await response.json();
  const added = await request.post(`/api/directories/${directory.id}/companies`, { data: { records } });
  expect(added.ok()).toBeTruthy();
  await page.addInitScript(id => localStorage.setItem('apply-directory', id), directory.id);
  await page.route('**/api/assistants', route => route.fulfill({ json: [{ id: 'codex', name: 'Codex', installed: true }, { id: 'claude-code', name: 'Claude Code', installed: true }] }));
  // Every test traps the sending endpoint. No test may launch a real assistant.
  await page.route('**/api/run', route => route.fulfill({ status: 409, json: { error: 'Fixture run must be explicitly mocked.' } }));
  await page.goto('/');
  await expect(page.locator('h1')).toContainText(name);
  await expect(page.locator('tbody tr')).toHaveCount(records.length);
  return directory;
}

async function openRun(page) {
  await page.locator('.heading-actions').getByRole('button', { name: /^Run/ }).click();
  return page.getByRole('dialog', { name: 'Run', exact: true });
}

async function fakeRun(page, directory, verify) {
  const run = { id: 'filter-fixture-run', directoryId: directory.id, assistant: 'codex', status: 'completed', completed: 0, companyIds: [], targets: [] };
  await page.route('**/api/run', async route => {
    const input = route.request().postDataJSON();
    verify(input);
    Object.assign(run, { companyTypes: input.companyTypes, locations: input.locations, companyIds: input.companyIds || [] });
    await route.fulfill({ json: run });
  });
  await page.route('**/api/runs/filter-fixture-run', route => route.fulfill({ json: run }));
}

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.__filterErrors = errors;
  await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => expect(page.__filterErrors).toEqual([]));

test('Run combines several company types and sends that exact scope', async ({ page, request }, testInfo) => {
  const directory = await openFixture(page, request, 'Run type union');
  let submitted = false;
  await fakeRun(page, directory, input => {
    submitted = true;
    expect(input.directoryId).toBe(directory.id);
    expect(input.companyTypes).toEqual(['local_government', 'private']);
    expect(input.companyIds).toBeUndefined();
    expect(input.assistant).toBe('codex');
    expect(input.explicit).toBe(true);
  });
  const dialog = await openRun(page);
  await expect(dialog.getByRole('status')).toContainText('6 to check.');
  await expect(dialog.getByRole('checkbox')).toHaveCount(6);
  await dialog.getByRole('checkbox', { name: 'Local government', exact: true }).check();
  await expect(dialog.getByRole('status')).toContainText('1 to check.');
  await dialog.getByRole('checkbox', { name: 'Private companies', exact: true }).check();
  await expect(dialog.getByRole('status')).toContainText('2 to check.');
  await expect(dialog.getByRole('checkbox', { name: 'Unknown type', exact: true })).not.toBeChecked();
  await dialog.getByLabel('What work are you looking for?', { exact: true }).fill('Engineering roles');
  await page.screenshot({ path: testInfo.outputPath('run-company-types-desktop.png') });
  await dialog.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Run progress', exact: true })).toContainText('Company types: Local government, Private companies.');
  expect(submitted).toBe(true);
});

test('type filtering stays within selected companies and disables an empty Run', async ({ page, request }) => {
  const directory = await openFixture(page, request, 'Run selected types');
  await page.getByRole('checkbox', { name: 'Select Filter Federal', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Select Filter Local', exact: true }).check();
  const selectedIds = await page.locator('tbody tr').evaluateAll(rows => rows.filter(row => row.querySelector('input[type="checkbox"]')?.checked).map(row => row.querySelector('.company-name strong').textContent));
  expect(selectedIds).toEqual(['Filter Federal', 'Filter Local']);
  const companies = await (await request.get(`/api/companies?directoryId=${directory.id}`)).json();
  const ids = companies.items.filter(company => selectedIds.includes(company.name)).map(company => company.id);
  await fakeRun(page, directory, input => {
    expect([...input.companyIds].sort()).toEqual([...ids].sort());
    expect(input.companyTypes).toEqual(['federal_government', 'private']);
  });
  const dialog = await openRun(page);
  await expect(dialog.getByRole('status')).toContainText('Selected companies');
  await expect(dialog.getByRole('status')).toContainText('2 to check.');
  await dialog.getByRole('checkbox', { name: 'Private companies', exact: true }).check();
  await expect(dialog.getByRole('status')).toContainText('0 to check.');
  await expect(dialog.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
  await expect(dialog).toContainText('No remaining companies match.');
  const federal = dialog.getByRole('checkbox', { name: 'Federal government', exact: true });
  await federal.focus();
  await page.keyboard.press('Space');
  await expect(federal).toBeChecked();
  await expect(dialog.getByRole('status')).toContainText('1 to check.');
  await dialog.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Run progress', exact: true })).toBeVisible();
});

test('a stale preview cannot re-enable Run or replace the latest company count', async ({ page, request }) => {
  await openFixture(page, request, 'Run preview race');
  const dialog = await openRun(page);
  await expect(dialog.getByRole('status')).toContainText('6 to check.');
  let releaseOld;
  const oldWait = new Promise(resolve => { releaseOld = resolve; });
  let oldRequested;
  const requested = new Promise(resolve => { oldRequested = resolve; });
  await page.route('**/api/run-preview', async route => {
    const input = route.request().postDataJSON();
    const response = await route.fetch();
    if (input.companyTypes.length === 1) {
      oldRequested();
      await oldWait;
    }
    await route.fulfill({ response });
  });
  await dialog.getByRole('checkbox', { name: 'Local government', exact: true }).check();
  await requested;
  await expect(dialog.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('status')).toContainText('Checking the list');
  await dialog.getByRole('checkbox', { name: 'Private companies', exact: true }).check();
  await expect(dialog.getByRole('status')).toContainText('2 to check.');
  releaseOld();
  await expect(dialog.getByRole('status')).toContainText('2 to check.');
  await expect(dialog.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
});

test('failed preview clears the old count and supports a read-only retry', async ({ page, request }) => {
  await openFixture(page, request, 'Run preview recovery');
  const dialog = await openRun(page);
  await expect(dialog.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
  let failed = false;
  await page.route('**/api/run-preview', route => {
    if (!failed) {
      failed = true;
      return route.fulfill({ status: 503, json: { error: 'Fixture preview unavailable' } });
    }
    return route.continue();
  });
  await dialog.getByRole('checkbox', { name: 'Unknown type', exact: true }).check();
  await expect(dialog.getByRole('alert')).toHaveText('Fixture preview unavailable');
  await expect(dialog.getByRole('status')).toContainText('Count unavailable.');
  await expect(dialog.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('1 to check.');
  await expect(dialog.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
  await expect(dialog).toContainText('Unknown type means ownership has not been verified.');
});

test('an older server cannot silently ignore Run filters', async ({ page, request }) => {
  await openFixture(page, request, 'Run old server guard');
  const dialog = await openRun(page);
  await expect(dialog.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
  await page.route('**/api/run-preview', route => route.fulfill({ json: { count: 6 } }));
  await dialog.getByRole('checkbox', { name: 'Private companies', exact: true }).check();
  await expect(dialog.getByRole('alert')).toHaveText('Restart the local app to enable these filters, then check again.');
  await expect(dialog.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('status')).toContainText('Count unavailable.');
});

test('Run filters reset explicitly, reopen at all types and fit a narrow viewport', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixture(page, request, 'Run mobile types');
  let dialog = await openRun(page);
  await expect(dialog.getByRole('status')).toContainText('6 to check.');
  await dialog.getByRole('checkbox', { name: 'Government-owned / semi-government', exact: true }).check();
  await expect(dialog.getByRole('status')).toContainText('1 to check.');
  await dialog.getByRole('button', { name: 'All types', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('6 to check.');
  await dialog.getByRole('checkbox', { name: 'Private companies', exact: true }).check();
  await expect(dialog.getByRole('status')).toContainText('1 to check.');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  dialog = await openRun(page);
  await expect(dialog.getByRole('status')).toContainText('6 to check.');
  await expect(dialog.getByRole('checkbox', { name: 'Private companies', exact: true })).not.toBeChecked();
  await dialog.locator('.run-location-filters summary').click();
  const runButton = dialog.locator('.dialog-footer').getByRole('button', { name: 'Run', exact: true });
  await expect(runButton).toBeInViewport({ ratio: 1 });
  const runBounds = await runButton.boundingBox();
  expect(runBounds.y + runBounds.height).toBeLessThanOrEqual(844);
  await dialog.locator('.dialog-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(runButton).toBeInViewport({ ratio: 1 });
  await dialog.locator('.dialog-content').evaluate(element => { element.scrollTop = 0; });
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const label of await dialog.locator('.run-type-option:visible').all()) {
    const bounds = await label.boundingBox();
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  }
  await page.screenshot({ path: testInfo.outputPath('run-company-types-mobile.png'), fullPage: true });
});

test('multiple locations combine with company types and come from the current directory', async ({ page, request }, testInfo) => {
  const directory = await openFixture(page, request, 'Run locations Gulf');
  const facets = await (await request.post('/api/run-preview', { data: { directoryId: directory.id } })).json();
  const locationIds = facets.locations.filter(item => ['Dubai', 'Abu Dhabi'].includes(item.label)).map(item => item.id).sort();
  expect(locationIds).toHaveLength(2);
  await fakeRun(page, directory, input => {
    expect(input.companyTypes).toEqual(['federal_government', 'private']);
    expect(input.locations).toEqual(locationIds);
  });
  let dialog = await openRun(page);
  await expect(dialog.getByRole('status')).toContainText('6 to check.');
  await dialog.getByRole('checkbox', { name: 'Federal government', exact: true }).check();
  await dialog.getByRole('checkbox', { name: 'Private companies', exact: true }).check();
  await expect(dialog.getByRole('status')).toContainText('2 to check.');
  await dialog.locator('.run-location-filters summary').click();
  await dialog.getByRole('checkbox', { name: 'Dubai', exact: true }).check();
  await expect(dialog.getByRole('status')).toContainText('1 to check.');
  await dialog.getByRole('checkbox', { name: 'Abu Dhabi', exact: true }).check();
  await expect(dialog.getByRole('status')).toContainText('2 to check.');
  await expect(dialog.locator('.run-location-filters summary')).toContainText('2 selected');
  await expect(dialog.getByRole('checkbox', { name: 'UAE-wide', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('run-company-types-locations-desktop.png') });
  await dialog.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Run progress', exact: true })).toContainText('City / location: 2 selected.');
  await page.getByRole('dialog', { name: 'Run progress', exact: true }).getByRole('button', { name: 'Close', exact: true }).last().click();
  await openFixture(page, request, 'Run locations Canada', [
    { name: 'Toronto Fixture', type: 'Private company', location: 'Toronto' },
    { name: 'Vancouver Fixture', type: 'Private company', location: 'Vancouver' },
  ]);
  dialog = await openRun(page);
  await expect(dialog.getByRole('status')).toContainText('2 to check.');
  await dialog.locator('.run-location-filters summary').click();
  await expect(dialog.getByRole('checkbox', { name: 'Toronto', exact: true })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'Vancouver', exact: true })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'Dubai', exact: true })).toHaveCount(0);
  await expect(dialog.locator('.run-location-filters summary')).toContainText('All');
});

test('a long location list is searchable without losing selected cities', async ({ page, request }) => {
  await openFixture(page, request, 'Run many locations', Array.from({ length: 12 }, (_, index) => ({
    name: `Location fixture ${index + 1}`, type: 'Private company', location: `City ${String(index + 1).padStart(2, '0')}`,
  })));
  const dialog = await openRun(page);
  await expect(dialog.getByRole('status')).toContainText('12 to check.');
  await dialog.locator('.run-location-filters summary').click();
  const search = dialog.getByRole('searchbox', { name: 'Search locations', exact: true });
  await search.fill('City 09');
  await dialog.getByRole('checkbox', { name: 'City 09', exact: true }).check();
  await expect(dialog.getByRole('status')).toContainText('1 to check.');
  await search.fill('City 10');
  await dialog.getByRole('checkbox', { name: 'City 10', exact: true }).check();
  await expect(dialog.getByRole('status')).toContainText('2 to check.');
  await search.fill('No matching city');
  await expect(dialog.getByText('No locations match your search.', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('status')).toContainText('2 to check.');
  await search.clear();
  await expect(dialog.getByRole('checkbox', { name: 'City 09', exact: true })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'City 10', exact: true })).toBeChecked();
  await dialog.getByRole('button', { name: 'All locations', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('12 to check.');
});
