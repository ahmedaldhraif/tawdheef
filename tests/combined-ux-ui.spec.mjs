import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openStore } from '../server/store.mjs';

const profiles = { applyMatchingJobs: false, createProfiles: true, sendCvEmails: false };
const applications = { applyMatchingJobs: true, createProfiles: false, sendCvEmails: false };
const cvEmails = { applyMatchingJobs: false, createProfiles: false, sendCvEmails: true };

async function json(request, url, method = 'get', data) {
  const response = await request[method](url, data === undefined ? {} : { data });
  expect(response.ok(), `${method.toUpperCase()} ${url}: ${await response.text()}`).toBeTruthy();
  return response.json();
}

async function fixture(request, label, records = [{ name: `Combined ${label} employer`, careersUrl: 'https://employer.example.test/careers' }]) {
  const directory = await json(request, '/api/directories', 'post', { name: `Combined ${label}`, flag: '📁' });
  await json(request, `/api/directories/${directory.id}/companies`, 'post', { records });
  const page = await json(request, `/api/companies?directoryId=${directory.id}&limit=100`);
  return { directory, companies: page.items };
}

async function openFixture(page, directory, count) {
  await page.addInitScript(id => localStorage.setItem('apply-directory', id), directory.id);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(directory.name);
  await expect(page.locator('tbody tr:not(.skeleton-row)')).toHaveCount(count);
}

async function detail(page, company) {
  await page.locator('tbody tr').filter({ has: page.getByText(company.name, { exact: true }) }).locator('.company-name').click();
  const dialog = page.getByRole('dialog', { name: company.name, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function listOption(page, label) {
  await page.getByRole('button', { name: 'List options', exact: true }).click();
  await page.getByRole('menuitem', { name: label, exact: true }).click();
}

async function patchCompany(request, company, patch) {
  const current = (await json(request, `/api/companies/${company.id}`)).company;
  return json(request, `/api/companies/${company.id}`, 'patch', { expectedRevision: current.revision, ...patch });
}

// Record a synthetic receipt through the real Native coordinator. Nothing is sent,
// submitted to a website, or delegated to a model or CLI process.
async function recordSyntheticApplication(request, directory, company) {
  const result = await json(request, '/api/native/runs', 'post', {
    directoryId: directory.id, companyIds: [company.id], assistant: 'codex',
    explicit: true, mode: 'send_and_submit', actions: applications,
  });
  const run = result.run;
  let finished = false;
  try {
    const claim = await json(request, `/api/native/runs/${run.id}/claim`, 'post', { assistant: 'codex' });
    expect(claim.target.companyId).toBe(company.id);
    await json(request, '/api/applications', 'post', {
      companyId: company.id, runId: run.id, event: 'applied', method: 'form',
      role: 'Synthetic Engineer', url: 'https://employer.example.test/jobs/synthetic',
      evidence: 'Synthetic test receipt; no external application occurred.',
    });
    await json(request, `/api/native/runs/${run.id}/finish`, 'post', {
      assistant: 'codex', companyId: company.id, claimToken: claim.claimToken,
      status: 'applied', reason: 'Synthetic receipt recorded for UI verification.',
    });
    finished = true;
  } finally {
    if (!finished) await request.post(`/api/runs/${run.id}/stop`);
  }
}

test.beforeEach(async ({ page, request }) => {
  await json(request, '/api/settings', 'patch', {
    connectionMode: 'native', language: 'en', preferredAssistant: 'codex',
    refreshFrequency: 'manual', reportFrequency: 'off', emailReports: false, applicationEmail: '',
  });
  const monitoring = await json(request, '/api/monitoring');
  if (monitoring.config.enabled || monitoring.config.assistant !== 'codex') await json(request, '/api/monitoring', 'patch', {
    expectedRevision: monitoring.config.revision, explicit: true, patch: { enabled: false, assistant: 'codex' },
  });
  page.__combinedErrors = [];
  page.__combinedForbidden = [];
  page.__combinedExternal = [];
  page.on('pageerror', error => page.__combinedErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: async text => { window.__combinedClipboard = text; } },
    });
  });
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      page.__combinedExternal.push(url.origin);
      return route.abort();
    }
    if (/^\/api\/(?:connections(?:\/|$)|calendar(?:\/|$)|assistants$|assistant-check(?:\/|$)|setup-status(?:\/|$)|agent-capabilities(?:\/|$)|refresh$|run$)/.test(url.pathname)
      || /^\/api\/background\/(?:install|startup)/.test(url.pathname)) {
      page.__combinedForbidden.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    return route.continue();
  });
});

test.afterEach(async ({ page, request }) => {
  expect(page.__combinedErrors).toEqual([]);
  expect(page.__combinedForbidden).toEqual([]);
  expect(page.__combinedExternal).toEqual([]);
  expect((await json(request, '/api/settings')).connectionMode).toBe('native');
});

test('a new local store defaults to Native and Preferences keeps personal choices separate from provider setup', async ({ page, request }) => {
  const prefix = join(tmpdir(), 'tawdheef-combined-default-');
  const dataDir = await mkdtemp(prefix), store = openStore({ dataDir, seed: false });
  try { expect(store.getSettings().connectionMode).toBe('native'); }
  finally {
    store.close();
    expect(resolve(dataDir).startsWith(resolve(prefix))).toBe(true);
    await rm(dataDir, { recursive: true, force: true, maxRetries: 5 });
  }
  const { directory } = await fixture(request, 'Preferences');
  await openFixture(page, directory, 1);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Preferences', exact: true });
  await expect(panel.getByRole('combobox', { name: 'Language', exact: true })).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Time zone', exact: true })).toBeVisible();
  await expect(panel.getByRole('textbox', { name: /default application email|contact email|password|token|client secret/i })).toHaveCount(0);
  await expect(panel.getByRole('checkbox', { name: /Monitor with|Email reports/i })).toHaveCount(0);
  await expect(panel.getByRole('combobox', { name: /Check replies|Frequency/i })).toHaveCount(0);
  const background = await json(request, '/api/background');
  if (background.startupSupported) await expect(panel.getByRole('checkbox', { name: 'Open at sign-in', exact: true })).toBeVisible();
  else await expect(panel).toContainText('Automatic startup is unavailable on this computer.');
  await panel.locator('summary').filter({ hasText: /^Job preferences$/ }).click();
  await panel.getByRole('textbox', { name: 'Roles', exact: true }).fill('Engineer, Product engineer');
  await panel.getByRole('textbox', { name: 'Job locations', exact: true }).fill('Dubai');
  await panel.getByRole('textbox', { name: 'Job notes', exact: true }).fill('Synthetic preferences, no CV or provider access.');
  await panel.getByRole('textbox', { name: 'Time zone', exact: true }).fill('Asia/Dubai');
  await panel.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(panel).not.toBeVisible();
  const saved = await json(request, '/api/discovery/preferences');
  expect(saved.roles).toEqual(['Engineer', 'Product engineer']);
  expect(saved.locations).toEqual(['Dubai']);
  expect((await json(request, '/api/settings')).reportFrequency).toBe('off');
});

test('the overview opens Native Monitoring containing local Reports & replies without enabling a schedule', async ({ page, request }) => {
  const { directory } = await fixture(request, 'Monitoring');
  const before = await json(request, '/api/monitoring');
  await openFixture(page, directory, 1);
  const overview = page.locator('.directory-overview');
  await expect(overview.getByRole('region', { name: 'Directory snapshot', exact: true })).toBeVisible();
  await overview.getByRole('button', { name: 'Monitoring', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Monitoring', exact: true });
  await panel.locator('.monitoring-disclosure > summary').click();
  await expect(panel.getByRole('checkbox', { name: 'Monitor with Codex', exact: true })).not.toBeChecked();
  await expect(panel.getByText('Monitoring is off', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Copy schedule request', exact: true })).toHaveCount(0);
  const reports = panel.locator('details.reports-replies');
  await reports.locator(':scope > summary').filter({ hasText: /^Reports & replies$/ }).click();
  await expect(reports.getByRole('combobox', { name: /Check replies|Frequency/i })).toHaveCount(0);
  await expect(reports.getByRole('checkbox', { name: 'Email reports to me', exact: true })).toHaveCount(0);
  await expect(reports.getByText('Report schedule', { exact: true })).toHaveCount(0);
  await reports.locator('summary').filter({ hasText: /^Latest report$/ }).click();
  const reportIds = new Set((await json(request, '/api/reports')).map(item => item.id));
  await reports.getByRole('button', { name: 'Generate report', exact: true }).click();
  await expect.poll(async () => (await json(request, '/api/reports')).filter(item => !reportIds.has(item.id)).length).toBe(1);
  const report = (await json(request, '/api/reports')).find(item => !reportIds.has(item.id));
  expect(report.delivery?.status || 'local').toBe('local');
  const after = await json(request, '/api/monitoring');
  expect(after.config).toEqual(before.config);
  expect(after.status.externalScheduleStatus).toBe(before.status.externalScheduleStatus);
});

test('Native Email saves the intended new-account email without changing reported account or sender metadata', async ({ page, request }) => {
  const { directory } = await fixture(request, 'Contact hint');
  const accountEmail = 'reported-owner@example.test';
  await json(request, '/api/native/client/report', 'post', {
    assistant: 'codex', kind: 'email', status: 'available', provider: 'gmail',
    accountEmail, accountId: 'synthetic-native-mailbox', observedAt: new Date().toISOString(),
    evidence: 'Synthetic client-reported mailbox metadata; no provider access.',
  });
  const before = await json(request, '/api/native/client?assistant=codex');
  expect(before.primaryEmail).toBe(accountEmail);
  await openFixture(page, directory, 1);
  const writes = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) writes.push({ path, method: request.method(), input: request.postDataJSON() });
  });
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  await page.getByRole('dialog', { name: 'Connections', exact: true }).getByRole('button', { name: /^Email —/ }).click();
  await page.getByRole('dialog', { name: 'Email', exact: true }).getByRole('button', { name: 'Gmail', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Gmail', exact: true });
  await expect(panel.getByText(accountEmail, { exact: true })).toBeVisible();
  await expect(panel.getByRole('textbox', { name: 'Email for new accounts', exact: true })).toHaveCount(0);
  await expect(panel.locator('.native-contact-label')).toHaveText('Email for new accounts');
  await expect(panel).toContainText('Your assistant checks this mailbox. Existing accounts keep their sign-in.');
  const edit = panel.getByRole('button', { name: 'Edit Email for new accounts', exact: true });
  await expect(edit).toContainText('Use the observed mailbox');
  await edit.click();
  const hint = panel.getByRole('textbox', { name: 'Email for new accounts', exact: true });
  await hint.fill('discarded-hint@example.test');
  await hint.press('Escape');
  await expect(panel).toBeVisible();
  await expect(edit).toBeFocused();
  await expect(edit).toContainText('Use the observed mailbox');
  expect((await json(request, '/api/settings')).applicationEmail).toBe('');
  expect(writes).toEqual([]);
  await edit.click();
  await hint.fill('local-hint@example.test');
  await hint.press('Enter');
  await expect(edit).toContainText('local-hint@example.test');
  await expect.poll(async () => (await json(request, '/api/settings')).applicationEmail).toBe('local-hint@example.test');
  expect(writes).toEqual([{ path: '/api/settings', method: 'PATCH', input: { applicationEmail: 'local-hint@example.test' } }]);
  const after = await json(request, '/api/native/client?assistant=codex');
  expect(after.primaryEmail).toBe(accountEmail);
  expect(after.capabilities.email).toEqual(before.capabilities.email);
  expect(after.capabilities.email.accountEmail).toBe(accountEmail);
  await expect(panel.getByText(accountEmail, { exact: true })).toBeVisible();
});

test('Career profile is a default column and an explicit hidden-column preference survives reload', async ({ page, request }) => {
  const { directory } = await fixture(request, 'Profile column');
  await openFixture(page, directory, 1);
  await expect(page.getByRole('columnheader', { name: 'Career profile', exact: true })).toBeVisible();
  await listOption(page, 'Choose columns');
  const columns = page.getByRole('dialog', { name: 'Columns', exact: true });
  const profileColumn = columns.getByRole('checkbox', { name: 'Career profile', exact: true });
  await profileColumn.click();
  await expect(profileColumn).not.toBeChecked();
  await columns.getByRole('button', { name: 'Close', exact: true }).click();
  await expect.poll(async () => (await json(request, '/api/bootstrap')).directories.find(item => item.id === directory.id).columns.includes('progress')).toBe(false);
  await page.reload();
  await expect(page.locator('.company-name').first()).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Career profile', exact: true })).toHaveCount(0);
});

test('career route findings require evidence and do not invent profile or application milestones', async ({ page, request }) => {
  const { directory, companies: [company] } = await fixture(request, 'Route evidence');
  await openFixture(page, directory, 1);
  const panel = await detail(page, company);
  await expect(panel.getByRole('combobox', { name: 'Careers page availability', exact: true })).toHaveValue('unknown');
  await expect(panel.getByRole('combobox', { name: 'Account / profile', exact: true })).toHaveValue('unknown');
  await panel.getByRole('combobox', { name: 'Careers page availability', exact: true }).selectOption('needs_check');
  await panel.getByRole('combobox', { name: 'Account / profile', exact: true }).selectOption('needs_check');
  await panel.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('source or reason');
  expect((await json(request, `/api/companies/${company.id}`)).company.routesCheckedAt).toBeNull();
  const evidence = 'Synthetic reader could not load https://employer.example.test/careers; needs checking.';
  await panel.getByRole('textbox', { name: 'Source or reason', exact: true }).fill(evidence);
  await panel.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(async () => (await json(request, `/api/companies/${company.id}`)).company.routeEvidence).toBe(evidence);
  const checked = (await json(request, `/api/companies/${company.id}`)).company;
  expect(checked.careersPageStatus).toBe('needs_check');
  expect(checked.profileSupport).toBe('needs_check');
  expect(Number.isFinite(Date.parse(checked.routesCheckedAt))).toBe(true);
  expect(checked.status).toBe('not_started');
  expect(checked.progress.profile_created).toBe(0);
  expect(checked.progress.applied).toBe(0);
  await panel.getByRole('textbox', { name: 'Notes', exact: true }).fill('An unrelated synthetic note.');
  await panel.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(async () => (await json(request, `/api/companies/${company.id}`)).company.notes).toBe('An unrelated synthetic note.');
  expect((await json(request, `/api/companies/${company.id}`)).company.routesCheckedAt).toBe(checked.routesCheckedAt);
});

test('a sourced Not offered finding stays separate from Status and only excludes profile work', async ({ page, request }) => {
  const { directory, companies } = await fixture(request, 'Independent actions', [
    { name: 'Combined Already applied', careersUrl: 'https://employer.example.test/careers' },
    { name: 'Combined Profile not offered', careersUrl: 'https://employer.example.test/retained-source' },
    { name: 'Combined Route not checked', careersUrl: 'https://employer.example.test/unknown' },
  ]);
  const applied = companies.find(item => item.name === 'Combined Already applied');
  const notOffered = companies.find(item => item.name === 'Combined Profile not offered');
  await recordSyntheticApplication(request, directory, applied);
  await patchCompany(request, notOffered, {
    careersPageStatus: 'not_found', profileSupport: 'not_offered',
    routeEvidence: 'Synthetic public source explicitly offers no career account or profile.',
  });
  expect((await json(request, '/api/run-preview', 'post', { directoryId: directory.id, actions: profiles })).count).toBe(2);
  expect((await json(request, '/api/run-preview', 'post', { directoryId: directory.id, actions: applications })).count).toBe(2);
  expect((await json(request, '/api/run-preview', 'post', { directoryId: directory.id, actions: cvEmails })).count).toBe(3);
  await openFixture(page, directory, 3);
  const row = page.locator('tbody tr').filter({ has: page.getByText(notOffered.name, { exact: true }) });
  await expect(row.locator('td.col-progress')).toContainText('Not offered');
  await expect(row.getByRole('combobox', { name: `Status for ${notOffered.name}`, exact: true })).toHaveValue('not_started');
  await expect(row.getByRole('button', { name: `No careers page found: ${notOffered.name}`, exact: true })).toBeVisible();
  await expect(row.getByRole('link', { name: 'Open careers', exact: true })).toHaveCount(0);
  const saved = (await json(request, `/api/companies/${notOffered.id}`)).company;
  expect(saved.careersUrl).toBe('https://employer.example.test/retained-source');
  expect(saved.progress.profile_created).toBe(0);
  await page.locator('.heading-actions').getByRole('button', { name: /^Run on/ }).click();
  let panel = page.getByRole('dialog', { name: 'Run', exact: true });
  await panel.getByRole('checkbox', { name: 'Apply to jobs that match my CV', exact: true }).uncheck();
  await expect(panel.getByRole('checkbox', { name: 'Create an account or complete my profile', exact: true })).toBeChecked();
  await expect(panel.getByRole('button', { name: 'Run on 2 companies', exact: true })).toBeEnabled();
  await panel.getByRole('button', { name: 'Run on 2 companies', exact: true }).click();
  panel = page.getByRole('dialog', { name: 'Run progress', exact: true });
  try {
    await expect(panel).toContainText('Waiting for assistant');
    await expect(panel).not.toContainText('Install and sign in');
    const run = (await json(request, '/api/bootstrap')).runs.find(item => item.status === 'running' && item.directoryId === directory.id);
    expect(run.native).toBe(true);
    expect(run.actions).toEqual(profiles);
    const targets = await json(request, `/api/runs/${run.id}/targets?offset=0&limit=50`);
    expect(targets.items.map(item => item.companyId)).toContain(applied.id);
    expect(targets.items.map(item => item.companyId)).not.toContain(notOffered.id);
    expect(targets.total).toBe(2);
    await expect(panel.getByRole('button', { name: 'Run request copied', exact: true })).toBeVisible();
  } finally {
    const active = (await json(request, '/api/bootstrap')).runs.find(item => item.status === 'running' && item.directoryId === directory.id);
    if (active) await json(request, `/api/runs/${active.id}/stop`, 'post');
  }
});

for (const language of ['en', 'ar']) {
  test(`company detail tabs use Home End arrows and correct panel associations in ${language === 'ar' ? 'RTL' : 'LTR'}`, async ({ page, request }) => {
    const { directory, companies: [company] } = await fixture(request, `Tabs ${language}`);
    await json(request, '/api/settings', 'patch', { language });
    await openFixture(page, directory, 1);
    await expect(page.locator('html')).toHaveAttribute('dir', language === 'ar' ? 'rtl' : 'ltr');
    const panel = await detail(page, company);
    const labels = language === 'ar' ? ['التفاصيل', 'سجل التقديم', 'تفاصيل المصدر'] : ['Details', 'Application history', 'Source details'];
    const tabs = labels.map(name => panel.getByRole('tab', { name, exact: true }));
    const check = async index => {
      await expect(tabs[index]).toBeFocused();
      await expect(tabs[index]).toHaveAttribute('aria-selected', 'true');
      await expect(tabs[index]).toHaveAttribute('tabindex', '0');
      const content = panel.getByRole('tabpanel');
      await expect(content).toHaveAttribute('aria-labelledby', await tabs[index].getAttribute('id'));
      await expect(tabs[index]).toHaveAttribute('aria-controls', await content.getAttribute('id'));
      for (let other = 0; other < tabs.length; other++) if (other !== index) {
        await expect(tabs[other]).toHaveAttribute('aria-selected', 'false');
        await expect(tabs[other]).toHaveAttribute('tabindex', '-1');
      }
    };
    await tabs[0].focus(); await check(0);
    await page.keyboard.press(language === 'ar' ? 'ArrowLeft' : 'ArrowRight'); await check(1);
    await page.keyboard.press('End'); await check(2);
    await page.keyboard.press('Home'); await check(0);
    await page.keyboard.press(language === 'ar' ? 'ArrowRight' : 'ArrowLeft'); await check(2);
  });
}

test('a company draft survives tab changes and Cancel discards it only after an explicit choice', async ({ page, request }) => {
  const { directory, companies: [company] } = await fixture(request, 'Draft guard');
  await openFixture(page, directory, 1);
  const writes = [];
  page.on('request', request => { if (request.method() === 'PATCH' && new URL(request.url()).pathname === `/api/companies/${company.id}`) writes.push(request.url()); });
  const panel = await detail(page, company);
  await panel.getByRole('textbox', { name: 'Notes', exact: true }).fill('Unsaved synthetic draft.');
  await panel.getByRole('tab', { name: 'Source details', exact: true }).click();
  await panel.getByRole('tab', { name: 'Application history', exact: true }).click();
  await panel.getByRole('tab', { name: 'Details', exact: true }).click();
  await expect(panel.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('Unsaved synthetic draft.');
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
  const guard = page.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true });
  await expect(guard.getByRole('button', { name: 'Keep editing', exact: true })).toBeFocused();
  await guard.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(panel.getByRole('textbox', { name: 'Notes', exact: true })).toHaveValue('Unsaved synthetic draft.');
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
  await guard.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(writes).toEqual([]);
  expect((await json(request, `/api/companies/${company.id}`)).company.notes).toBe('');
});

test('a pending real Save excludes Archive and tab changes and Undo restores the stored record', async ({ page, request }) => {
  const { directory, companies: [company] } = await fixture(request, 'Save Undo');
  await openFixture(page, directory, 1);
  const panel = await detail(page, company);
  let release, held = false;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(`**/api/companies/${company.id}`, async route => {
    if (route.request().method() === 'PATCH' && !held) { held = true; await gate; }
    await route.continue();
  });
  try {
    await panel.getByRole('textbox', { name: 'Notes', exact: true }).fill('Stored synthetic note.');
    await panel.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(panel).toHaveAttribute('aria-busy', 'true');
    await expect(panel.getByRole('button', { name: 'Archive', exact: true })).toBeDisabled();
    await expect(panel.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
    for (const tab of await panel.getByRole('tab').all()) await expect(tab).toBeDisabled();
    release();
    await expect.poll(async () => (await json(request, `/api/companies/${company.id}`)).company.notes).toBe('Stored synthetic note.');
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    const undo = panel.getByRole('button', { name: 'Undo', exact: true });
    await undo.focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await json(request, `/api/companies/${company.id}`)).company.notes).toBe('');
    const restored = (await json(request, `/api/companies/${company.id}`)).company;
    expect(restored.careersPageStatus).toBe('unknown');
    expect(restored.profileSupport).toBe('unknown');
    expect(restored.routesCheckedAt).toBeNull();
    expect(restored.archived).not.toBe(true);
  } finally { release(); }
});

test('contributor links retain their destinations and Export all companies includes filtered-out records', async ({ page, request }) => {
  const { directory, companies } = await fixture(request, 'Contribution CSV', [
    { name: 'Combined CSV shown', sourceId: 'combined-csv-shown', careersUrl: 'https://example.test/shown' },
    { name: 'Combined CSV hidden', sourceId: 'combined-csv-hidden', careersUrl: 'https://example.test/hidden' },
  ]);
  await openFixture(page, directory, 2);
  const footer = page.locator('.workspace-footer');
  await expect(footer.getByRole('link', { name: 'Open source', exact: true })).toHaveAttribute('href', 'https://github.com/ahmedaldhraif/tawdheef');
  await expect(footer.getByRole('link', { name: '@ahmedaldhraif', exact: true })).toHaveAttribute('href', 'https://github.com/ahmedaldhraif');
  await expect(footer.getByRole('link', { name: 'Contribute', exact: true })).toHaveAttribute('href', 'https://github.com/ahmedaldhraif/tawdheef/blob/main/CONTRIBUTING.md');
  const panel = await detail(page, companies[0]);
  await panel.getByRole('tab', { name: 'Source details', exact: true }).click();
  await expect(panel.getByRole('link', { name: 'Suggest a correction', exact: true })).toHaveAttribute('href', 'https://github.com/ahmedaldhraif/tawdheef/issues/new?template=directory-data.yml');
  await panel.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search companies', exact: true }).fill('Combined CSV shown');
  await expect(page.locator('tbody tr:not(.skeleton-row)')).toHaveCount(1);
  await page.getByRole('button', { name: 'List options', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export all companies (CSV)', exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const content = await readFile(await download.path(), 'utf8');
  expect(content).toContain('Combined CSV shown');
  expect(content).toContain('Combined CSV hidden');
});

test('a delayed and failed initial read has loading and Retry states before real companies appear', async ({ page, request }) => {
  const { directory } = await fixture(request, 'Loading recovery');
  await page.addInitScript(id => localStorage.setItem('apply-directory', id), directory.id);
  let release, phase = 'hold';
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/companies?*', async route => {
    if (phase === 'hold') await gate;
    if (phase === 'fail') return route.fulfill({ status: 503, json: { error: 'Synthetic company read unavailable.' } });
    return route.continue();
  });
  try {
    await page.goto('/');
    await expect(page.locator('.table-scroll')).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('tbody .skeleton-row').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /No companies found|This directory is empty/ })).toHaveCount(0);
    phase = 'fail'; release();
    const error = page.locator('.empty[role="alert"]');
    await expect(error.getByRole('heading', { name: 'Company list unavailable', exact: true })).toBeVisible();
    await expect(error).toContainText('Synthetic company read unavailable.');
    await expect(page.getByRole('heading', { name: /No companies found|This directory is empty/ })).toHaveCount(0);
    phase = 'ready';
    await error.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.locator('.company-name strong').first()).toHaveText('Combined Loading recovery employer');
    await expect(page.locator('.table-scroll')).toHaveAttribute('aria-busy', 'false');
    await expect(error).toHaveCount(0);
  } finally { release(); }
});

test('Clear filters resets search city company type and application status together', async ({ page, request }) => {
  const { directory } = await fixture(request, 'Clear filters', [
    { name: 'Combined Sharjah private', type: 'Private company', location: 'Sharjah' },
    { name: 'Combined Dubai government', type: 'Federal government entity', location: 'Dubai' },
  ]);
  await openFixture(page, directory, 2);
  await page.getByRole('button', { name: 'Filter by city', exact: true }).click();
  let group = page.getByRole('group', { name: 'City', exact: true });
  await group.getByRole('checkbox', { name: 'Sharjah', exact: true }).check();
  await group.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Filter by company type', exact: true }).click();
  group = page.getByRole('group', { name: 'Company type', exact: true });
  await group.getByRole('checkbox', { name: 'Private companies', exact: true }).check();
  await group.getByRole('button', { name: 'Done', exact: true }).click();
  const status = page.getByRole('combobox', { name: 'Application status', exact: true });
  await status.selectOption('not_started');
  const search = page.getByRole('textbox', { name: 'Search companies', exact: true });
  await search.fill('No synthetic company matches this');
  await expect(page.getByRole('heading', { name: 'No companies found', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(status).toHaveValue('');
  await expect(page.locator('.company-filter-chips')).toHaveCount(0);
  await expect(page.locator('tbody tr:not(.skeleton-row)')).toHaveCount(2);
  await page.getByRole('button', { name: 'Filter by city', exact: true }).click();
  await expect(page.getByRole('group', { name: 'City', exact: true }).getByRole('checkbox', { name: 'Sharjah', exact: true })).not.toBeChecked();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Filter by company type', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Company type', exact: true }).getByRole('checkbox', { name: 'Private companies', exact: true })).not.toBeChecked();
});

test('a failed Monitoring read hides unavailable controls and Try again rereads the real local configuration', async ({ page, request }) => {
  const { directory } = await fixture(request, 'Monitoring recovery');
  const original = await json(request, '/api/monitoring');
  let recover = false, reads = 0, settled = 0;
  const writes = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) writes.push(request.url());
  });
  await page.route('**/api/monitoring', async route => {
    expect(route.request().method()).toBe('GET');
    reads++;
    try {
      if (!recover) return await route.fulfill({ status: 503, json: { error: 'Synthetic monitoring configuration unavailable.' } });
      return await route.continue();
    } finally { settled++; }
  });
  await openFixture(page, directory, 1);
  await expect(page.locator('.monitor-summary')).toContainText('Monitoring unavailable');
  await page.locator('.monitor-summary').getByRole('button', { name: 'Monitoring', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Monitoring', exact: true });
  const failure = panel.getByRole('alert');
  await expect(failure).toContainText('Synthetic monitoring configuration unavailable.');
  await expect(panel.getByText('Loading monitoring settings…', { exact: true })).toHaveCount(0);
  await expect(panel.locator('.monitoring-panel')).toHaveCount(0);
  await expect(panel.getByRole('checkbox', { name: 'Monitor with Codex', exact: true })).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Copy schedule request', exact: true })).toHaveCount(0);
  await expect.poll(() => settled === reads).toBe(true);
  const failedReads = reads;
  expect(failedReads).toBeGreaterThanOrEqual(2);
  // Both overview and dialog failures have settled before the fault is released.
  // The user's actual Retry click must initiate a new successful local GET.
  const recoveredRead = page.waitForResponse(response => new URL(response.url()).pathname === '/api/monitoring' && response.request().method() === 'GET' && response.status() === 200);
  recover = true;
  await failure.getByRole('button', { name: 'Try again', exact: true }).click();
  await recoveredRead;
  expect(reads).toBeGreaterThan(failedReads);
  await expect(failure).toHaveCount(0);
  await panel.locator('.monitoring-disclosure > summary').click();
  await expect(panel.getByRole('checkbox', { name: 'Monitor with Codex', exact: true })).not.toBeChecked();
  await expect(panel.getByText('Monitoring is off', { exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  expect((await json(request, '/api/monitoring')).config).toEqual(original.config);
});

async function expectContained(page, dialog, closeLabel = 'Close') {
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth }));
  expect(viewport.documentWidth).toBeLessThanOrEqual(viewport.width);
  if (!dialog) return;
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  const width = await dialog.evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client);
  const content = dialog.locator('.dialog-content').first();
  const contentWidth = await content.evaluate(element => ({ scroll: element.scrollWidth, client: element.clientWidth }));
  expect(contentWidth.scroll).toBeLessThanOrEqual(contentWidth.client);
  await expect(dialog.getByRole('button', { name: closeLabel, exact: true })).toBeInViewport();
}

for (const language of ['en', 'ar']) for (const width of [320, 1440]) {
  test(`combined Native surfaces stay contained in ${language} at ${width}px`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width, height: width === 320 ? 760 : 960 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { directory, companies: [company] } = await fixture(request, `Responsive ${language} ${width}`);
    await json(request, '/api/settings', 'patch', { language });
    const ar = language === 'ar';
    const labels = {
      close: ar ? 'إغلاق' : 'Close', settings: ar ? 'الإعدادات' : 'Settings', preferences: ar ? 'التفضيلات' : 'Preferences',
      monitoring: ar ? 'المتابعة' : 'Monitoring', reports: ar ? 'التقارير والردود' : 'Reports & replies',
      language: ar ? 'اللغة' : 'Language', timezone: ar ? 'المنطقة الزمنية' : 'Time zone',
      careers: ar ? 'صفحة الوظائف' : 'Careers page availability', profile: ar ? 'الحساب / الملف المهني' : 'Account / profile',
      evidence: ar ? 'المصدر أو السبب' : 'Source or reason', connections: ar ? 'الاتصالات' : 'Connections',
      contact: ar ? 'البريد للحسابات الجديدة' : 'Email for new accounts',
    };
    const capture = async (name, dialog) => {
      await expectContained(page, dialog, labels.close);
      await page.screenshot({ path: testInfo.outputPath(`combined-${language}-${width}-${name}.png`) });
    };
    await openFixture(page, directory, 1);
    await expect(page.locator('html')).toHaveAttribute('dir', ar ? 'rtl' : 'ltr');
    await expect(page.locator('.directory-overview')).toBeInViewport();
    await capture('overview');

    await page.getByRole('button', { name: labels.settings, exact: true }).click();
    let panel = page.getByRole('dialog', { name: labels.preferences, exact: true });
    await expect(panel.getByRole('combobox', { name: labels.language, exact: true })).toBeInViewport();
    await expect(panel.getByRole('textbox', { name: labels.timezone, exact: true })).toBeInViewport();
    await capture('preferences', panel);
    await panel.getByRole('button', { name: labels.close, exact: true }).click();

    await page.locator('.monitor-summary').getByRole('button', { name: labels.monitoring, exact: true }).click();
    panel = page.getByRole('dialog', { name: labels.monitoring, exact: true });
    await panel.locator('.monitoring-disclosure > summary').click();
    await panel.locator('.reports-replies > summary').filter({ hasText: labels.reports }).click();
    await expect(panel.locator('.reports-replies')).toHaveAttribute('open', '');
    await capture('monitoring-reports', panel);
    await panel.getByRole('button', { name: labels.close, exact: true }).click();

    panel = await detail(page, company);
    const evidence = panel.getByRole('textbox', { name: labels.evidence, exact: true });
    await evidence.scrollIntoViewIfNeeded();
    await expect(panel.getByRole('combobox', { name: labels.careers, exact: true })).toBeInViewport();
    await expect(panel.getByRole('combobox', { name: labels.profile, exact: true })).toBeInViewport();
    await expect(evidence).toBeInViewport();
    await capture('career-routes', panel);
    await panel.getByRole('button', { name: labels.close, exact: true }).click();

    await page.getByRole('button', { name: labels.connections, exact: true }).click();
    await page.getByRole('dialog', { name: labels.connections, exact: true }).getByRole('button', { name: ar ? /^البريد —/ : /^Email —/ }).click();
    await page.getByRole('dialog', { name: ar ? 'البريد' : 'Email', exact: true }).getByRole('button', { name: 'Gmail', exact: true }).click();
    panel = page.getByRole('dialog', { name: 'Gmail', exact: true });
    await expect(panel.locator('.native-contact-label')).toHaveText(labels.contact);
    await panel.getByRole('button', { name: `Edit ${labels.contact}`, exact: true }).click();
    const hint = panel.getByRole('textbox', { name: labels.contact, exact: true });
    await hint.fill('responsive-hint@example.test');
    await expect(hint).toBeInViewport();
    await capture('email-hint', panel);
    await hint.press('Escape');
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: labels.close, exact: true }).click();
    expect((await json(request, '/api/settings')).applicationEmail).toBe('');
  });
}
