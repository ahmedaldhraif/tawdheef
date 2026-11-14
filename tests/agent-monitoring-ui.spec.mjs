import { test, expect } from '@playwright/test';

const initialConfig = () => ({ revision: 0, enabled: false, assistant: 'codex', frequency: 'daily', time: '09:00', timezone: 'Asia/Dubai', channels: { jobs: false, profiles: false, email: false, calendar: false }, scope: { directoryIds: ['uae'], companyIds: [], calendarIds: [] }, instructions: '' });
const initialStatus = () => ({ lastCheckAt: null, lastSuccessAt: null, unreadCount: 0, activeChecks: 0, externalScheduleStatus: 'unknown', nextRunAt: null });
const prompt = 'Create a local daily fixture monitoring schedule. Read only the selected companies and tracked email threads. Never apply, send messages or create calendar events.';

test.beforeEach(async ({ page }) => {
  page.__monitorConfig = initialConfig(); page.__monitorStatus = initialStatus();
  page.__monitorUpdates = [];
  page.__monitorWrites = []; page.__monitorErrors = []; page.__unexpectedMonitorWrites = [];
  page.__preferredAssistant = 'codex';
  page.on('pageerror', error => page.__monitorErrors.push(error.message));
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__monitorClipboard = text; } } }); });
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) { page.__unexpectedMonitorWrites.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    return route.continue();
  });
  await page.route('**/api/bootstrap', async route => {
    const response = await route.fetch(), boot = await response.json();
    boot.settings.preferredAssistant = page.__preferredAssistant; boot.runs = [];
    return route.fulfill({ response, json: boot });
  });
  await page.route('**/api/monitoring', route => {
    if (route.request().method() === 'PATCH') {
      const input = route.request().postDataJSON();
      page.__monitorWrites.push({ path: 'config', input });
      expect(input.explicit).toBe(true); expect(input.expectedRevision).toBe(page.__monitorConfig.revision);
      page.__monitorConfig = { ...page.__monitorConfig, ...input.patch, revision: page.__monitorConfig.revision + 1 };
    }
    return route.fulfill({ json: { config: page.__monitorConfig, status: page.__monitorStatus } });
  });
  await page.route('**/api/monitoring/recipe', route => {
    const input = route.request().postDataJSON(); page.__monitorWrites.push({ path: 'recipe', input });
    expect(input.configurationRevision).toBe(page.__monitorConfig.revision);
    return route.fulfill({ json: { prompt, workspace: '/fixture/workspace', requirements: [], creation: 'requested_only' } });
  });
  await page.route('**/api/monitoring/updates?*', route => route.fulfill({ json: { items: page.__monitorUpdates, total: page.__monitorUpdates.length, nextOffset: null } }));
  await page.route('**/api/monitoring/updates/*/ack', route => {
    const id = new URL(route.request().url()).pathname.split('/').at(-2), input = route.request().postDataJSON();
    const update = page.__monitorUpdates.find(item => item.id === id);
    expect(input.expectedRevision).toBe(update.revision);
    page.__monitorWrites.push({ path: 'ack', input });
    Object.assign(update, { revision: update.revision + 1, acknowledgedAt: '2026-11-14T06:00:00Z' });
    page.__monitorStatus.unreadCount = page.__monitorUpdates.filter(item => !item.acknowledgedAt).length;
    return route.fulfill({ json: update });
  });
});

test.afterEach(async ({ page }) => {
  expect(page.__monitorErrors).toEqual([]); expect(page.__unexpectedMonitorWrites).toEqual([]);
});

async function openSettings(page) {
  await page.goto('/'); await expect(page.locator('.company-name').first()).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings.locator('.monitoring-disclosure > summary').click();
  await expect(settings.getByRole('region', { name: 'Monitoring', exact: true })).toBeVisible();
  return { settings, panel: settings.getByRole('region', { name: 'Monitoring', exact: true }) };
}

test('monitoring is opt-in and copying prepares a native request without claiming an active schedule', async ({ page }) => {
  const { panel } = await openSettings(page);
  await expect(panel.getByRole('checkbox', { name: 'Monitor with Codex', exact: true })).not.toBeChecked();
  await expect(panel.getByText('Monitoring is off', { exact: true })).toBeVisible();
  expect(page.__monitorWrites).toEqual([]);
  await panel.getByRole('checkbox', { name: 'Monitor with Codex', exact: true }).check();
  await expect(panel.getByRole('button', { name: 'Copy schedule request', exact: true })).toBeDisabled();
  await panel.getByRole('checkbox', { name: 'Matching jobs', exact: true }).check();
  await panel.getByRole('checkbox', { name: 'Career profiles', exact: true }).check();
  await panel.getByRole('button', { name: 'Copy schedule request', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Schedule request copied', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__monitorClipboard)).toBe(prompt);
  expect(page.__monitorWrites.map(item => item.path)).toEqual(['config', 'recipe']);
  expect(page.__monitorConfig.channels).toEqual({ jobs: true, profiles: true, email: false, calendar: false });
  await expect(panel).not.toContainText('Schedule active');
  await expect(panel).not.toContainText('Next check:');
  await expect(panel).toContainText('Creating the schedule happens there.');
});

for (const clipboardBlocked of [false, true]) {
  test(`saving monitoring preserves ${clipboardBlocked ? 'manual copy text' : 'copy confirmation'} until the choices change`, async ({ page }) => {
    await page.addInitScript(({ prompt, clipboardBlocked }) => {
      const fetch = window.fetch.bind(window);
      window.fetch = (input, options) => {
        const url = new URL(typeof input === 'string' ? input : input.url, location.href);
        if (url.pathname !== '/api/monitoring/recipe') return fetch(input, options);
        // Resolve immediately after the parent saves, before React commits that save.
        // Both the returned revision/timezone and copy feedback then land in one batch.
        window.__immediateMonitorRecipe = JSON.parse(options.body);
        return Promise.resolve(new Response(JSON.stringify({ prompt, creation: 'requested_only' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      };
      if (clipboardBlocked) navigator.clipboard.writeText = async () => { throw new Error('Clipboard unavailable'); };
    }, { prompt, clipboardBlocked });
    if (clipboardBlocked) await page.route('**/api/monitoring/scope', route => route.fulfill({ json: { scope: { directoryIds: [], companyIds: ['fixture-company'] } } }));
    const { panel } = await openSettings(page);
    await panel.getByRole('checkbox', { name: 'Monitor with Codex', exact: true }).check();
    await panel.getByRole('checkbox', { name: 'Matching jobs', exact: true }).check();
    await panel.getByRole('button', { name: 'Copy schedule request', exact: true }).click();
    if (clipboardBlocked) await expect(panel.getByRole('textbox', { name: 'Copy into your assistant', exact: true })).toHaveValue(prompt);
    else await expect(panel.getByRole('button', { name: 'Schedule request copied', exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.__immediateMonitorRecipe.configurationRevision)).toBe(page.__monitorConfig.revision);
    expect(page.__monitorWrites.map(write => write.path)).toEqual(['config']);
    await expect(panel).toContainText('Creating the schedule happens there.');
    if (clipboardBlocked) {
      await panel.getByRole('button', { name: 'Use current list', exact: true }).click();
      await expect(panel).toContainText('Scope: 1 saved company');
    } else await panel.getByRole('combobox', { name: 'Frequency', exact: true }).selectOption('weekly');
    await expect(panel.getByRole('button', { name: 'Copy schedule request', exact: true })).toBeEnabled();
    await expect(panel.getByRole('textbox', { name: 'Copy into your assistant', exact: true })).toHaveCount(0);
    await expect(panel).not.toContainText('Creating the schedule happens there.');
  });
}

test('calendar monitoring requires an explicitly selected calendar and stays blocked without one', async ({ page }) => {
  page.__monitorConfig = { ...initialConfig(), enabled: true, channels: { jobs: false, profiles: false, email: false, calendar: true } };
  const { panel } = await openSettings(page);
  await expect(panel).toContainText('Needs you');
  await expect(panel).toContainText('Choose a calendar to monitor.');
  await expect(panel.getByRole('button', { name: 'Copy schedule request', exact: true })).toBeDisabled();
  expect(page.__monitorWrites).toEqual([]);
});

test('calendar discovery runs only after Choose a calendar and records its selected ID', async ({ page }) => {
  page.__monitorConfig = { ...initialConfig(), enabled: true, channels: { jobs: false, profiles: false, email: false, calendar: true } };
  let calendarReads = 0;
  await page.route('**/api/calendar/calendars', route => { calendarReads++; return route.fulfill({ json: { calendars: [{ id: 'fixture-calendar', name: 'Fixture interviews' }] } }); });
  const { panel } = await openSettings(page);
  expect(calendarReads).toBe(0);
  await panel.getByRole('button', { name: 'Choose a calendar', exact: true }).click();
  await expect(panel.getByRole('combobox', { name: 'Calendar', exact: true })).toBeVisible();
  expect(calendarReads).toBe(1);
  await panel.getByRole('combobox', { name: 'Calendar', exact: true }).selectOption('fixture-calendar');
  await expect(panel).toContainText('Calendar events in the next 14 days.');
  await panel.getByRole('button', { name: 'Copy schedule request', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Schedule request copied', exact: true })).toBeVisible();
  expect(page.__monitorConfig.scope.calendarIds).toEqual(['fixture-calendar']);
});

test('changing the preferred assistant does not relabel an existing monitoring owner', async ({ page }) => {
  page.__preferredAssistant = 'claude-code';
  page.__monitorConfig = { ...initialConfig(), assistant: 'codex', enabled: true, channels: { jobs: true, profiles: false, email: false, calendar: false } };
  const { panel } = await openSettings(page);
  await expect(panel.getByRole('checkbox', { name: 'Monitor with Codex', exact: true })).toBeChecked();
  const savedTimezone = (await (await page.request.get('/api/settings')).json()).timezone;
  await expect(panel.getByText(savedTimezone, { exact: true })).toBeVisible();
  await expect(panel.getByRole('checkbox', { name: 'Monitor with Claude Code', exact: true })).toHaveCount(0);
  expect(page.__monitorWrites).toEqual([]);
  await panel.getByRole('button', { name: 'Copy schedule request', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Schedule request copied', exact: true })).toBeVisible();
  expect(page.__monitorConfig.assistant).toBe('codex');
  expect(page.__monitorConfig.timezone).toBe(savedTimezone);
  expect(page.__monitorWrites.find(write => write.path === 'recipe').input.assistant).toBe('codex');
});

test('only recorded check results show update counts and reported schedules await their first check', async ({ page }) => {
  page.__monitorConfig = { ...initialConfig(), enabled: true, channels: { jobs: true, profiles: false, email: false, calendar: false } };
  page.__monitorStatus.externalScheduleStatus = 'reported';
  let { panel, settings } = await openSettings(page);
  await expect(panel).toContainText('Awaiting first check');
  await expect(panel).not.toContainText('0 unread updates');
  await settings.getByRole('button', { name: 'Cancel', exact: true }).click();
  page.__monitorStatus = { ...initialStatus(), externalScheduleStatus: 'reported', lastCheckAt: '2026-11-14T05:00:00Z', lastSuccessAt: '2026-11-14T05:00:00Z', unreadCount: 2 };
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Settings', exact: true }).locator('.monitoring-disclosure > summary')).toContainText('2 unread updates');
  await page.getByRole('dialog', { name: 'Settings', exact: true }).locator('.monitoring-disclosure > summary').click();
  panel = page.getByRole('region', { name: 'Monitoring', exact: true });
  await expect(panel).toContainText('Last check:'); await expect(panel).toContainText('2 unread updates');
});

test('an unverified check shows its real handoff even when it produced no update records', async ({ page }) => {
  page.__monitorStatus = { ...initialStatus(), lastCheckAt: '2026-11-14T05:00:00Z', needsYouCount: 1, latestSummary: 'Open the existing profile and finish sign-in. No profile was changed.' };
  const { panel } = await openSettings(page);
  await expect(panel.getByRole('status')).toContainText('Needs you');
  await expect(panel.getByRole('status')).toContainText('1 source needs attention');
  await expect(panel.getByRole('status')).toContainText('finish sign-in');
  await expect(panel.getByRole('status')).not.toContainText('Ready');
});

test('a blocked clipboard keeps the real request selectable without declaring schedule creation', async ({ page }) => {
  page.__monitorConfig = { ...initialConfig(), enabled: true, channels: { jobs: true, profiles: false, email: true, calendar: false } };
  const { panel } = await openSettings(page);
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Clipboard unavailable'); }; });
  await panel.getByRole('button', { name: 'Copy schedule request', exact: true }).click();
  await expect(panel.getByRole('textbox', { name: 'Copy into your assistant', exact: true })).toHaveValue(prompt);
  await expect(panel.getByRole('textbox', { name: 'Copy into your assistant', exact: true })).toHaveAttribute('readonly', '');
  await expect(panel).not.toContainText('Schedule active');
});

test('a failed recipe retains the selected scope and supports another preparation attempt', async ({ page }) => {
  page.__monitorConfig = { ...initialConfig(), enabled: true, channels: { jobs: true, profiles: false, email: false, calendar: false } };
  let attempts = 0;
  await page.route('**/api/monitoring/recipe', route => ++attempts === 1
    ? route.fulfill({ status: 503, json: { error: 'The schedule request could not be prepared. Try again.' } })
    : route.fulfill({ json: { prompt, creation: 'requested_only' } }));
  const { panel } = await openSettings(page);
  await panel.getByRole('button', { name: 'Copy schedule request', exact: true }).click();
  await expect(panel.getByRole('alert')).toContainText('The schedule request could not be prepared. Try again.');
  await expect(panel.getByRole('checkbox', { name: 'Matching jobs', exact: true })).toBeChecked();
  await panel.getByRole('button', { name: 'Copy schedule request', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Schedule request copied', exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});

test('recent updates show real evidence and Needs you while marking read changes only the local record', async ({ page }) => {
  page.__monitorStatus = { ...initialStatus(), lastCheckAt: '2026-11-14T05:00:00Z', unreadCount: 2 };
  page.__monitorUpdates = [
    { id: 'fixture-job', revision: 1, title: 'Fixture matching vacancy', summary: 'A newly listed fixture role matches the saved scope.', url: 'https://example.invalid/careers/fixture', status: 'new', changedAt: '2026-11-14T05:00:00Z', acknowledgedAt: null, source: { kind: 'jobs', id: 'fixture-source', companyId: '', name: 'Fixture company' } },
    { id: 'fixture-profile', revision: 1, title: 'Fixture profile needs sign-in', summary: 'Sign in before this profile can be checked.', url: 'javascript:alert(1)', status: 'unknown', changedAt: '2026-11-14T05:00:00Z', acknowledgedAt: null, source: { kind: 'profiles', id: 'fixture-profile-source', companyId: '', name: 'Fixture company' } },
  ];
  const { panel } = await openSettings(page);
  await panel.locator('summary').filter({ hasText: 'Recent updates' }).click();
  await expect(panel).toContainText('Fixture matching vacancy'); await expect(panel).toContainText('Found');
  await expect(panel).toContainText('Fixture profile needs sign-in'); await expect(panel).toContainText('Needs you');
  await expect(panel.getByRole('link', { name: 'Source', exact: true })).toHaveCount(1);
  await expect(panel.getByRole('link', { name: 'Source', exact: true })).toHaveAttribute('href', 'https://example.invalid/careers/fixture');
  await panel.getByRole('button', { name: 'Mark as read', exact: true }).first().click();
  await expect(panel.getByRole('button', { name: 'Mark as read', exact: true })).toHaveCount(1);
  await expect(panel).toContainText('1 unread update');
  expect(page.__monitorWrites.map(item => item.path)).toEqual(['ack']);
});

test('narrow monitoring controls remain readable with the Settings save action available', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  page.__monitorConfig = { ...initialConfig(), enabled: true, channels: { jobs: true, profiles: true, email: true, calendar: false } };
  const { panel, settings } = await openSettings(page);
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(settings.getByRole('button', { name: 'Save changes', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('native-monitoring-mobile.png'), fullPage: true });
});
