import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  page.__progressErrors = [];
  page.on('pageerror', error => page.__progressErrors.push(error.message));
  await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => expect(page.__progressErrors).toEqual([]));

async function fixture(request, suffix) {
  const response = await request.post('/api/directories', { data: { name: `Progress ${suffix}`, flag: '📁' } });
  expect(response.ok()).toBeTruthy();
  const directory = await response.json();
  expect((await request.post(`/api/directories/${directory.id}/companies`, { data: { records: [
    { name: `Career profile ${suffix}`, type: 'Private company', careersUrl: 'https://careers.example.test/profile' },
    { name: `No activity ${suffix}` },
  ] } })).ok()).toBeTruthy();
  const companies = await (await request.get(`/api/companies?directoryId=${directory.id}`)).json();
  const company = companies.items.find(item => item.name.startsWith('Career profile'));
  let application;
  for (const event of ['account_created', 'profile_created', 'cv_uploaded', 'prepared']) {
    const result = await request.post('/api/applications', { data: {
      ...(application ? { id: application.id } : {}), companyId: company.id,
      event, method: 'career_page', url: 'https://careers.example.test/profile',
      evidence: 'Fixture confirms the recorded career-page step.', notes: 'No suitable vacancy today.',
    } });
    expect(result.ok()).toBeTruthy();
    application = await result.json();
  }
  return { directory, company };
}

test('optional Progress column retains career steps without marking an application', async ({ page, request }, testInfo) => {
  const { directory, company } = await fixture(request, 'column');
  await page.addInitScript(id => localStorage.setItem('apply-directory', id), directory.id);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(directory.name);
  await expect(page.getByRole('columnheader', { name: 'Progress', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'List options', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Choose columns', exact: true }).click();
  const columns = page.getByRole('dialog', { name: 'Columns', exact: true });
  await columns.getByRole('checkbox', { name: 'Progress', exact: true }).click();
  await expect(columns.getByRole('checkbox', { name: 'Progress', exact: true })).toBeChecked();
  await expect(page.getByRole('columnheader', { name: 'Progress', exact: true })).toHaveCount(1);
  await columns.getByRole('checkbox', { name: 'Company type', exact: true }).click();
  await expect(columns.getByRole('checkbox', { name: 'Company type', exact: true })).toBeChecked();
  await expect(page.getByRole('columnheader', { name: 'Company type', exact: true })).toHaveCount(1);
  await columns.getByRole('button', { name: 'Close', exact: true }).click();
  const progress = page.getByRole('button', { name: `View progress for ${company.name}`, exact: true });
  await expect(progress).toContainText('Account created');
  await expect(progress).toContainText('Profile created');
  await expect(progress).toContainText('CV uploaded');
  await expect(progress).not.toContainText('Applied');
  await expect(page.getByRole('combobox', { name: `Status for ${company.name}`, exact: true })).toHaveValue('not_started');
  await progress.click();
  const history = page.getByRole('dialog', { name: company.name, exact: true });
  await expect(history.getByRole('list', { name: 'Recorded progress' })).toContainText('Account created');
  await expect(history.getByRole('list', { name: 'Recorded progress' })).toContainText('Profile created');
  await expect(history.getByRole('link', { name: 'Career page', exact: true })).toHaveAttribute('href', 'https://careers.example.test/profile');
  await history.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(progress).toContainText('CV uploaded');
  await page.screenshot({ path: testInfo.outputPath('company-progress.png'), fullPage: true });
});

test('reports show account and CV milestones separately from sent applications', async ({ page, request }) => {
  const { directory } = await fixture(request, 'report');
  await request.patch('/api/settings', { data: { emailReports: false, reportFrequency: 'off', lastReportAt: null } });
  const response = await request.post('/api/reports');
  expect(response.ok()).toBeTruthy();
  const report = await response.json();
  expect(report.accountsCreated).toBeGreaterThan(0);
  expect(report.profilesCreated).toBeGreaterThan(0);
  expect(report.cvsUploaded).toBeGreaterThan(0);
  await page.addInitScript(id => localStorage.setItem('apply-directory', id), directory.id);
  await page.goto('/');
  await page.getByRole('button', { name: 'Update schedule', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Updates & reports', exact: true });
  for (const [label, key] of [['Accounts created', 'accountsCreated'], ['Profiles created', 'profilesCreated'], ['CVs uploaded', 'cvsUploaded'], ['CVs sent', 'cvsSent'], ['Applications sent', 'applied']]) {
    await expect(dialog.locator('dl > div').filter({ has: page.locator('dt').filter({ hasText: new RegExp(`^${label}$`) }) }).locator('dd')).toHaveText(String(report[key]));
  }
  await expect(dialog.getByText('Account, profile and CV totals count companies with recorded progress during this report period. They are separate from applications sent.')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByText('CVs sent', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
