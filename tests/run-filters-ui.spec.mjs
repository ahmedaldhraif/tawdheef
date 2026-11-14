import { test, expect } from '@playwright/test';

const records = [
  { name: 'Filter Federal', type: 'Federal government entity', location: 'Abu Dhabi' },
  { name: 'Filter Local', type: 'Emirate government entity', location: 'Dubai' },
  { name: 'Filter Government Company', type: 'Government-owned company', location: 'Abu Dhabi' },
  { name: 'Filter Private', type: 'Private company', location: 'Dubai' },
  { name: 'Filter Nonprofit', type: 'Non-profit organisation', location: 'UAE-wide' },
  { name: 'Filter Unknown', type: 'Company, ownership unconfirmed', location: '' },
];
async function openFixture(page, request, name, input = records) {
  const response = await request.post('/api/directories', { data: { name } });
  expect(response.ok()).toBeTruthy();
  const directory = await response.json();
  const added = await request.post(`/api/directories/${directory.id}/companies`, { data: { records: input } });
  expect(added.ok()).toBeTruthy();
  await page.addInitScript(id => localStorage.setItem('apply-directory', id), directory.id);
  await page.route('**/api/assistants', route => route.fulfill({ json: [{ id: 'codex', name: 'Codex', installed: true }, { id: 'claude-code', name: 'Claude Code', installed: true }] }));
  // The only sending endpoint is trapped: these tests never launch an assistant.
  await page.route('**/api/run', route => route.fulfill({ status: 409, json: { error: 'A fixture run must be mocked.' } }));
  await page.goto('/');
  await expect(page.locator('h1')).toContainText(name);
  await expect(page.locator('tbody tr')).toHaveCount(Math.min(input.length, 100));
  await expect(page.locator('.heading-actions').getByRole('button')).toBeEnabled();
  return directory;
}
const mainRun = page => page.locator('.heading-actions').getByRole('button', { name: /^Run on/ });
async function openRun(page) {
  await mainRun(page).click();
  const dialog = page.getByRole('dialog', { name: 'Run', exact: true });
  await expect(dialog.getByRole('button', { name: /^Run on/ })).toBeEnabled();
  return dialog;
}
async function cityPanel(page) {
  await page.getByRole('button', { name: 'Filter by city', exact: true }).click();
  return page.getByRole('group', { name: 'City', exact: true });
}
async function typePanel(page) {
  await page.getByRole('button', { name: 'Filter by company type', exact: true }).click();
  return page.getByRole('group', { name: 'Company type', exact: true });
}
async function fakeRun(page, directory) {
  let submitted;
  const run = { id: 'guided-fixture-run', directoryId: directory.id, assistant: 'codex', status: 'completed', completed: 0, companyIds: [], targets: [] };
  await page.route('**/api/run', async route => {
    submitted = route.request().postDataJSON();
    Object.assign(run, { actions: submitted.actions, companyTypes: submitted.companyTypes, locations: submitted.locations, companyIds: submitted.companyIds || [] });
    await route.fulfill({ json: run });
  });
  await page.route('**/api/runs/guided-fixture-run', route => route.fulfill({ json: run }));
  return () => submitted;
}
test.beforeEach(async ({ page, request }) => {
  expect((await request.patch('/api/settings', { data: { connectionMode: 'local-adapters' } })).ok()).toBe(true);
  page.__filterErrors = [];
  page.on('pageerror', error => page.__filterErrors.push(error.message));
  await page.route('**/api/bootstrap', async route => { const response = await route.fetch(), boot = await response.json(); boot.settings.connectionMode = 'local-adapters'; return route.fulfill({ response, json: boot }); });
  await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => expect(page.__filterErrors).toEqual([]));

test('filter the list first, then Run sends that exact scope with only the chosen actions', async ({ page, request }, testInfo) => {
  const directory = await openFixture(page, request, 'Guided scope');
  const sent = await fakeRun(page, directory);
  let panel = await cityPanel(page);
  await panel.getByRole('checkbox', { name: 'Dubai', exact: true }).check();
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  panel = await typePanel(page);
  await panel.getByRole('checkbox', { name: 'Private companies', exact: true }).check();
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(mainRun(page)).toHaveText('Run on 1 company');
  await expect(page.getByRole('button', { name: 'Remove city filter Dubai', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove company type filter Private companies', exact: true })).toBeVisible();
  const dialog = await openRun(page);
  await expect(dialog.getByRole('checkbox')).toHaveCount(3);
  await expect(dialog.getByRole('searchbox')).toHaveCount(0);
  await expect(dialog.getByRole('checkbox', { name: 'Apply to jobs that match my CV', exact: true })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Create an account or complete my profile', exact: true })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Email my CV for future opportunities', exact: true })).not.toBeChecked();
  await dialog.locator('summary').filter({ hasText: 'Add a note' }).click();
  await dialog.getByLabel('Note (optional)', { exact: true }).fill('Engineering roles only');
  await expect(dialog.getByRole('heading', { name: 'Instructions for your assistant', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('textbox')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: 'Run on 1 company', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('simple-run-note.png') });
  await dialog.locator('summary').filter({ hasText: 'Add a note' }).click();
  await page.screenshot({ path: testInfo.outputPath('simple-run-desktop.png') });
  await dialog.getByRole('button', { name: 'Run on 1 company', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Run progress', exact: true })).toBeVisible();
  expect(sent()).toMatchObject({ directoryId: directory.id, companyTypes: ['private'], locations: ['location:dubai'], actions: { applyMatchingJobs: true, createProfiles: true, sendCvEmails: false }, instructions: 'Engineering roles only', explicit: true });
  expect(sent().companyIds).toBeUndefined();
});

test('multiple type and city choices narrow the table and checked rows alone are passed to Run', async ({ page, request }) => {
  const directory = await openFixture(page, request, 'Guided selected rows');
  let panel = await typePanel(page);
  await panel.getByRole('checkbox', { name: 'Federal government', exact: true }).check();
  await panel.getByRole('checkbox', { name: 'Private companies', exact: true }).check();
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  panel = await cityPanel(page);
  await panel.getByRole('checkbox', { name: 'Dubai', exact: true }).check();
  await panel.getByRole('checkbox', { name: 'Abu Dhabi', exact: true }).check();
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  const privateRow = page.getByRole('checkbox', { name: 'Select Filter Private', exact: true });
  await privateRow.focus(); await page.keyboard.press('Space');
  await expect(mainRun(page)).toHaveText('Run on 1 selected');
  // A checked company that is completed inline must immediately leave the Run count.
  const status = page.getByRole('combobox', { name: 'Status for Filter Private', exact: true });
  await status.selectOption('closed');
  await expect(mainRun(page)).toHaveText('Run on 0 selected');
  await expect(mainRun(page)).toBeDisabled();
  await status.selectOption('ready');
  await expect(mainRun(page)).toHaveText('Run on 1 selected');
  await expect(mainRun(page)).toBeEnabled();
  const companies = await (await request.get(`/api/companies?directoryId=${directory.id}`)).json();
  const companyId = companies.items.find(item => item.name === 'Filter Private').id;
  const sent = await fakeRun(page, directory);
  const dialog = await openRun(page);
  await expect(dialog.getByRole('status')).toContainText('1 selected company');
  await dialog.getByRole('button', { name: 'Run on 1 selected', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Run progress', exact: true })).toBeVisible();
  expect(sent().companyIds).toEqual([companyId]);
  expect(sent().locations).toEqual(['location:abu dhabi', 'location:dubai']);
  expect(sent().companyTypes).toEqual(['federal_government', 'private']);
});

test('typed city searches do not silently run the entire directory and filters remain visible', async ({ page, request }) => {
  await openFixture(page, request, 'Guided city search');
  const panel = await cityPanel(page);
  const search = panel.getByRole('searchbox', { name: 'Search cities', exact: true });
  await search.fill('Dubai');
  await expect(mainRun(page)).toBeDisabled();
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await panel.getByRole('checkbox', { name: 'Dubai', exact: true }).check();
  await expect(search).toHaveValue('');
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(mainRun(page)).toHaveText('Run on 2 companies');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Remove city filter Dubai', exact: true })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove city filter Dubai', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await expect(mainRun(page)).toHaveText('Run on 6 companies');
});

test('Run includes every filtered company across pages and applies search and status to its scope', async ({ page, request }) => {
  const directory = await openFixture(page, request, 'Guided paginated scope', Array.from({ length: 130 }, (_, i) => ({ name: `Engineer ${String(i).padStart(3, '0')}`, type: 'Private company', location: 'Dubai' })));
  await expect(mainRun(page)).toHaveText('Run on 130 companies');
  const dialog = await openRun(page);
  await expect(dialog.getByRole('status')).toContainText('130 companies');
  await expect(dialog.getByRole('button', { name: 'Run on 130 companies', exact: true })).toHaveText('Run');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search companies', exact: true }).fill('Engineer 12');
  await page.getByRole('combobox', { name: 'Application status', exact: true }).selectOption('not_started');
  await expect(page.locator('tbody tr')).toHaveCount(10);
  await expect(mainRun(page)).toHaveText('Run on 10 companies');
  const sent = await fakeRun(page, directory);
  const filtered = await openRun(page);
  await filtered.getByRole('button', { name: 'Run on 10 companies', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Run progress', exact: true })).toBeVisible();
  expect(sent()).toMatchObject({ search: 'Engineer 12', status: 'not_started', attention: '' });
  expect(sent().companyIds).toBeUndefined();
});

test('future-only actions are explicit, all off disables Run, and the assistant is remembered', async ({ page, request }) => {
  await page.route('**/api/bootstrap', async route => {
    const response = await route.fetch(), boot = await response.json();
    boot.settings.preferredAssistant = 'claude-code'; boot.settings.connectionMode = 'local-adapters';
    return route.fulfill({ response, json: boot });
  });
  const directory = await openFixture(page, request, 'Guided future only');
  const sent = await fakeRun(page, directory);
  const dialog = await openRun(page);
  await dialog.getByRole('checkbox', { name: 'Apply to jobs that match my CV', exact: true }).uncheck();
  await expect(dialog.getByRole('checkbox', { name: 'Create an account or complete my profile', exact: true })).toBeChecked();
  await expect(dialog.getByRole('button', { name: /^Run on/ })).toBeEnabled();
  await dialog.getByRole('checkbox', { name: 'Create an account or complete my profile', exact: true }).uncheck();
  await expect(dialog.getByRole('button', { name: /^Run on/ })).toBeDisabled();
  await expect(dialog).toContainText('Choose at least one action to start.');
  await expect(dialog).toContainText('For future opportunities:');
  await dialog.getByRole('checkbox', { name: 'Email my CV for future opportunities', exact: true }).check();
  await expect(dialog.getByRole('combobox', { name: 'Assistant for this run', exact: true })).toHaveCount(0);
  await expect(dialog.locator('.run-assistant-selected')).toContainText('Claude Code');
  await expect(dialog.getByRole('button', { name: /^Run on/ })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Run on 6 companies', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Run progress', exact: true })).toBeVisible();
  expect(sent().actions).toEqual({ applyMatchingJobs: false, createProfiles: false, sendCvEmails: true });
  expect(sent().assistant).toBe('claude-code');
  await expect(dialog.locator('.run-assistant-selected')).toHaveCount(0);
});

test('failed and stale Run previews cannot enable the wrong scope or actions', async ({ page, request }) => {
  await openFixture(page, request, 'Guided preview recovery');
  const dialog = await openRun(page);
  await dialog.getByRole('checkbox', { name: 'Create an account or complete my profile', exact: true }).uncheck();
  await expect(dialog.getByRole('button', { name: /^Run on/ })).toBeEnabled();
  let releaseOld, oldRequested;
  const oldWait = new Promise(resolve => { releaseOld = resolve; });
  const requested = new Promise(resolve => { oldRequested = resolve; });
  await page.route('**/api/run-preview', async route => {
    const input = route.request().postDataJSON();
    const response = await route.fetch();
    if (input.actions?.createProfiles && !input.actions?.sendCvEmails) { oldRequested(); await oldWait; }
    await route.fulfill({ response });
  });
  await dialog.getByRole('checkbox', { name: 'Create an account or complete my profile', exact: true }).check();
  await requested;
  await expect(dialog.getByRole('button', { name: 'Checking companies…', exact: true })).toBeDisabled();
  await dialog.getByRole('checkbox', { name: 'Email my CV for future opportunities', exact: true }).check();
  await expect(dialog.getByRole('button', { name: 'Run on 6 companies', exact: true })).toBeEnabled();
  releaseOld();
  await expect(dialog.getByRole('checkbox', { name: 'Email my CV for future opportunities', exact: true })).toBeChecked();
  await page.unroute('**/api/run-preview');
  let failed = false;
  await page.route('**/api/run-preview', route => { if (!failed) { failed = true; return route.fulfill({ status: 503, json: { error: 'Fixture preview unavailable' } }); } return route.continue(); });
  await dialog.getByRole('checkbox', { name: 'Create an account or complete my profile', exact: true }).uncheck();
  await expect(dialog.getByRole('alert')).toHaveText('Fixture preview unavailable');
  await expect(dialog.getByRole('button', { name: 'Checking companies…', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Run on 6 companies', exact: true })).toBeEnabled();
});

test('older servers cannot ignore current list scope or action choices', async ({ page, request }) => {
  await openFixture(page, request, 'Guided old server');
  await page.route('**/api/run-preview', route => route.fulfill({ json: { count: 6, runActionsVersion: 1 } }));
  await mainRun(page).click();
  const dialog = page.getByRole('dialog', { name: 'Run', exact: true });
  await expect(dialog.getByRole('alert')).toHaveText('Restart the local app to use these Run options, then check again.');
  await expect(dialog.getByRole('button', { name: 'Checking companies…', exact: true })).toBeDisabled();
});

test('mobile filters fit, Escape returns focus, and Run actions remain visible', async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFixture(page, request, 'Guided mobile');
  const panel = await cityPanel(page);
  await expect(panel.getByRole('searchbox', { name: 'Search cities', exact: true })).toBeFocused();
  await panel.getByRole('checkbox', { name: 'Dubai', exact: true }).check();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Filter by city', exact: true })).toBeFocused();
  await expect(mainRun(page)).toHaveText('Run on 2 companies');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const dialog = await openRun(page);
  await expect(dialog.getByRole('checkbox')).toHaveCount(3);
  const runButton = dialog.getByRole('button', { name: 'Run on 2 companies', exact: true });
  await expect(runButton).toBeInViewport({ ratio: 1 });
  await dialog.locator('summary').filter({ hasText: 'Add a note' }).click();
  await dialog.locator('.dialog-content').evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(runButton).toBeInViewport({ ratio: 1 });
  await dialog.locator('summary').filter({ hasText: 'Add a note' }).click();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('simple-run-mobile.png'), fullPage: true });
});

test('city choices are directory-specific and search keeps earlier selections', async ({ page, request }) => {
  await openFixture(page, request, 'Guided location catalog', Array.from({ length: 12 }, (_, index) => ({ name: `Place ${index + 1}`, type: 'Private company', location: `City ${String(index + 1).padStart(2, '0')}` })));
  let panel = await cityPanel(page);
  const search = panel.getByRole('searchbox', { name: 'Search cities', exact: true });
  await search.fill('City 09'); await panel.getByRole('checkbox', { name: 'City 09', exact: true }).check();
  await search.fill('City 10'); await panel.getByRole('checkbox', { name: 'City 10', exact: true }).check();
  await panel.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(mainRun(page)).toHaveText('Run on 2 companies');
  await expect(page.getByRole('button', { name: 'Remove city filter City 09', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove city filter City 10', exact: true })).toBeVisible();
  await openFixture(page, request, 'Guided Canadian cities', [{ name: 'Toronto company', location: 'Toronto' }, { name: 'Vancouver company', location: 'Vancouver' }]);
  panel = await cityPanel(page);
  await expect(panel.getByRole('checkbox', { name: 'Toronto', exact: true })).toBeVisible();
  await expect(panel.getByRole('checkbox', { name: 'Vancouver', exact: true })).toBeVisible();
  await expect(panel.getByRole('checkbox', { name: 'City 09', exact: true })).toHaveCount(0);
});
