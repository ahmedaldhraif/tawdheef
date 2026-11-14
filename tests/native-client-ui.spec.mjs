import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const observedAt = '2026-11-14T07:00:00Z';
const unknownClient = assistant => ({ assistant, mode: 'native', clientReported: true, independentlyVerified: false, primaryEmail: null, capabilities: Object.fromEntries(['cv', 'email', 'calendar', 'browser', 'computer', 'passwordManager'].map(kind => [kind, { status: 'unknown', observedAt: null, provider: '' }])) });
const scheduleConfig = () => ({ revision: 0, enabled: true, assistant: 'codex', frequency: 'daily', time: '09:00', timezone: 'Asia/Dubai', channels: { jobs: false, profiles: false, email: false, calendar: true }, scope: { directoryIds: ['uae'], companyIds: [], calendarIds: [] }, instructions: '' });
const monitoringStatus = { lastCheckAt: null, lastSuccessAt: null, unreadCount: 0, activeChecks: 0, externalScheduleStatus: 'unknown', nextRunAt: null };

test.beforeEach(async ({ page, request }) => {
  expect((await request.patch('/api/settings', { data: { connectionMode: 'native' } })).ok()).toBe(true);
  page.__nativeClient = unknownClient('codex'); page.__nativeAssistant = 'codex'; page.__nativeMode = 'native'; page.__nativeLanguage = 'en';
  page.__nativeErrors = []; page.__nativeForbidden = []; page.__nativeRequests = []; page.__nativeWrites = []; page.__nativeRun = null;
  page.on('pageerror', error => page.__nativeErrors.push(error.message));
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__nativeClipboard = text; } } }); });
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (/^\/api\/(?:setup-status|assistant-check|assistants|calendar|connections)(?:\/|\?|$)/.test(url.pathname) || url.pathname === '/api/run') {
      page.__nativeForbidden.push(`${request.method()} ${url.pathname}`); return route.abort();
    }
    if (url.pathname.startsWith('/api/') && url.pathname !== '/api/run-preview' && !['GET', 'HEAD'].includes(request.method())) { page.__nativeForbidden.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    return route.continue();
  });
  await page.route('**/api/bootstrap', async route => {
    const response = await route.fetch(), boot = await response.json();
    boot.settings = { ...boot.settings, language: page.__nativeLanguage, connectionMode: page.__nativeMode, preferredAssistant: page.__nativeAssistant };
    boot.connections = []; boot.nativeClient = page.__nativeClient; boot.runs = page.__nativeRun ? [page.__nativeRun] : [];
    return route.fulfill({ response, json: boot });
  });
  await page.route('**/api/native/client?*', route => route.fulfill({ json: page.__nativeClient }));
  await page.route('**/api/native/connection-request?*', route => {
    const input = Object.fromEntries(new URL(route.request().url()).searchParams); page.__nativeRequests.push(input);
    return route.fulfill({ json: { assistant: input.assistant, prompt: `Fixture ${input.assistant} ${input.kind} ${input.provider || ''} setup. Check your actual client tools; do not send or submit.` } });
  });
  await page.route('**/api/settings', route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    const patch = route.request().postDataJSON(); page.__nativeWrites.push({ path: 'settings', input: patch });
    if (patch.preferredAssistant) { page.__nativeAssistant = patch.preferredAssistant; page.__nativeClient = unknownClient(patch.preferredAssistant); }
    if (patch.connectionMode) page.__nativeMode = patch.connectionMode;
    return route.fulfill({ json: { preferredAssistant: page.__nativeAssistant, connectionMode: page.__nativeMode } });
  });
  await page.route('**/api/native/runs', route => {
    const input = route.request().postDataJSON(); page.__nativeWrites.push({ path: 'run', input });
    page.__nativeRun = { id: 'native-ui-fixture', directoryId: 'uae', directoryName: 'UAE', native: true, mode: 'send_and_submit', executionOwner: 'native-client', assistant: input.assistant, status: 'running', total: 772, completed: 0, activeCompanyId: null, currentName: '', actions: input.actions, targetCounts: {}, outcomes: { applicationsSent: 0 } };
    return route.fulfill({ json: { run: page.__nativeRun, handoff: { assistant: input.assistant, prompt: 'Fixture explicit native run request. Claim only this saved scope and actions.' } } });
  });
  await page.route('**/api/native/runs/native-ui-fixture/request', route => route.fulfill({ json: { prompt: 'Fixture reopened native run request.', assistant: page.__nativeAssistant } }));
  await page.route('**/api/runs/native-ui-fixture', route => route.fulfill({ json: page.__nativeRun }));
  await page.route('**/api/runs/native-ui-fixture/stop', route => {
    page.__nativeWrites.push({ path: 'stop' }); page.__nativeRun = { ...page.__nativeRun, status: 'cancelled', activeCompanyId: null };
    return route.fulfill({ json: page.__nativeRun });
  });
  await page.route('**/api/monitoring', route => route.fulfill({ json: { config: scheduleConfig(), status: monitoringStatus } }));
  await page.route('**/api/monitoring/updates?*', route => route.fulfill({ json: { items: [], total: 0, nextOffset: null } }));
});

test.afterEach(async ({ page }) => { expect(page.__nativeErrors).toEqual([]); expect(page.__nativeForbidden).toEqual([]); });
async function openTracker(page) { await page.goto('/'); await expect(page.locator('.company-name').first()).toBeVisible(); }
async function openConnections(page) { await openTracker(page); await page.getByRole('button', { name: 'Connections', exact: true }).click(); return page.getByRole('dialog'); }
async function capture(page, name) {
  if (process.env.TAWDHEEF_CAPTURE_UI !== '1') return;
  const folder = join(process.cwd(), 'outputs', 'native-client-ui-review-20261114');
  await mkdir(folder, { recursive: true }); await page.screenshot({ path: join(folder, `${name}.png`), fullPage: true });
}

test('native connections keep six familiar categories and never probe local providers or CLI sign-in', async ({ page }) => {
  const dialog = await openConnections(page);
  await expect(dialog.locator('.connection-category-row')).toHaveCount(6);
  await expect(dialog.getByRole('button', { name: 'Assistant — Codex', exact: true })).toBeVisible();
  for (const label of ['Tabbio CV', 'Email', 'Calendar', 'Browser & computer use', 'Passwords']) await expect(dialog.getByRole('button', { name: `${label} — Unknown`, exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Check connections', exact: true })).toHaveCount(0);
  await expect(dialog.getByText('Connected', { exact: true })).toHaveCount(0);
  expect(page.__nativeRequests).toEqual([]); expect(page.__nativeWrites).toEqual([]);
  await capture(page, 'en-connections-1440');
});

test('email setup copies a request to the chosen actual client without showing OAuth or credential fields', async ({ page }) => {
  const dialog = await openConnections(page);
  await dialog.getByRole('button', { name: 'Assistant — Codex', exact: true }).click();
  await dialog.getByRole('radio', { name: 'Use Claude Code', exact: true }).check();
  await dialog.getByRole('button', { name: 'Back to connections', exact: true }).click();
  await dialog.getByRole('button', { name: 'Email — Unknown', exact: true }).click();
  await dialog.locator('[data-connection-provider="gmail"]').click();
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await expect(dialog.getByText('Claude Code', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Copy setup request', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Setup request copied', exact: true })).toBeVisible();
  await capture(page, 'en-provider-1440');
  expect(await page.evaluate(() => window.__nativeClipboard)).toContain('claude-code email gmail');
  expect(page.__nativeRequests.at(-1)).toMatchObject({ assistant: 'claude-code', kind: 'email', provider: 'gmail' });
  expect(page.__nativeWrites).toEqual([{ path: 'settings', input: { preferredAssistant: 'claude-code' } }]);
});

test('native capability reports remain dated client reports and keep browser separate from computer use', async ({ page }) => {
  page.__nativeClient.capabilities.assistant = { status: 'reported', observedAt, localToolUseObserved: true, clientReported: false };
  page.__nativeClient.capabilities.email = { status: 'reported', observedAt, provider: 'gmail', accountEmail: 'fixture@example.test', nextStep: 'Reported by this assistant; not independently verified.' };
  page.__nativeClient.capabilities.browser = { status: 'reported', observedAt, provider: 'native-browser' };
  page.__nativeClient.capabilities.computer = { status: 'needs_you', observedAt, nextStep: 'Enable supported computer tools in your actual client.' };
  const dialog = await openConnections(page);
  await dialog.getByRole('button', { name: 'Email — Client reported', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Client reported');
  await expect(dialog.getByRole('status')).toContainText('Reported');
  await expect(dialog.getByRole('status')).toContainText('fixture@example.test');
  await expect(dialog).not.toContainText('Connected');
  await dialog.getByRole('button', { name: 'Back to connections', exact: true }).click();
  await dialog.getByRole('button', { name: 'Browser & computer use — Client reported', exact: true }).click();
  await expect(dialog).toContainText('Computer use'); await expect(dialog).toContainText('Needs you');
  await expect(dialog).toContainText('Enable supported computer tools in your actual client.');
  await dialog.getByRole('button', { name: 'Back to connections', exact: true }).click();
  await dialog.getByRole('button', { name: 'Assistant — Codex', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Tracker used');
  await expect(dialog.getByRole('status')).not.toContainText('Client reported');
});

test('Tabbio CV uses native MCP guidance and keeps an optional local original file', async ({ page }) => {
  await page.route('**/api/cv/file', route => route.fulfill({ json: { available: false, code: 'CV_ARTIFACT_MISSING' } }));
  const dialog = await openConnections(page);
  await dialog.getByRole('button', { name: 'Tabbio CV — Unknown', exact: true }).click();
  await expect(dialog.getByRole('link', { name: 'Create a CV in Tabbio', exact: true })).toHaveAttribute('href', 'https://www.tabbio.com/en');
  await expect(dialog).toContainText('Connect Tabbio MCP in your assistant');
  await dialog.getByRole('button', { name: 'Copy setup request', exact: true }).click();
  expect(page.__nativeRequests.at(-1)).toMatchObject({ assistant: 'codex', kind: 'cv' });
  await dialog.locator('.cv-original-file > summary').click();
  await expect(dialog.getByLabel('CV file', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: /token|secret|password/i })).toHaveCount(0);
});

test('native run needs no CLI and waits for the existing client with selected actions and a revocable Stop', async ({ page }) => {
  await openTracker(page);
  await page.locator('.heading-actions').getByRole('button', { name: /^Run on/ }).click();
  let dialog = page.getByRole('dialog', { name: 'Run', exact: true });
  await expect(dialog).not.toContainText('Install and sign in');
  await dialog.getByRole('checkbox', { name: 'Apply to jobs that match my CV', exact: true }).uncheck();
  await dialog.getByRole('button', { name: /^Run on/ }).click();
  dialog = page.getByRole('dialog', { name: 'Run progress', exact: true });
  await expect(dialog).toContainText('Waiting for assistant');
  await expect(dialog).toContainText('0 with confirmed submissions.');
  await expect(dialog.getByRole('button', { name: 'Run request copied', exact: true })).toBeVisible();
  const input = page.__nativeWrites.find(item => item.path === 'run').input;
  expect(input).toMatchObject({ assistant: 'codex', explicit: true, mode: 'send_and_submit', actions: { applyMatchingJobs: false, createProfiles: true, sendCvEmails: false } });
  expect(await page.evaluate(() => window.__nativeClipboard)).toContain('Fixture explicit native run request');
  await dialog.getByRole('button', { name: 'Stop run', exact: true }).click();
  await expect(dialog).toContainText('Run stopped');
  expect(page.__nativeWrites.filter(item => item.path === 'stop')).toHaveLength(1);
});

test('blocked clipboard preserves native setup request as selectable text', async ({ page }) => {
  const dialog = await openConnections(page);
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Clipboard unavailable'); }; });
  await dialog.getByRole('button', { name: 'Passwords — Unknown', exact: true }).click();
  await expect(dialog).toContainText('Website passwords stay in your browser or password manager.');
  await dialog.getByRole('button', { name: 'Copy setup request', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Copy into your assistant', exact: true })).toHaveValue(/codex passwordManager/);
  await expect(dialog).not.toContainText('Connected');
});

test('reopened native progress copies a handoff with fallback and Stop removes the obsolete request', async ({ page }) => {
  page.__nativeRun = { id: 'native-ui-fixture', directoryId: 'uae', directoryName: 'UAE', native: true, mode: 'send_and_submit', assistant: 'codex', status: 'running', total: 3, completed: 1, activeCompanyId: null, currentName: '', targetCounts: { checked: 1 }, outcomes: { applicationsSent: 2 } };
  await openTracker(page);
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Clipboard unavailable'); }; });
  await page.locator('.run-banner').getByRole('button', { name: 'View progress', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Run progress', exact: true });
  await expect(dialog).toContainText('2 with confirmed submissions.');
  await dialog.getByRole('button', { name: 'Copy run request', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Copy into your assistant', exact: true })).toHaveValue('Fixture reopened native run request.');
  await dialog.getByRole('button', { name: 'Stop run', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Copy into your assistant', exact: true })).toHaveCount(0);
  await expect(dialog).toContainText('Stop any remaining work in your assistant.');
});

test('native monitoring requests calendar IDs from the client without loading local calendar adapters', async ({ page }) => {
  await openTracker(page); await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings.locator('.monitoring-disclosure > summary').click();
  const panel = settings.getByRole('region', { name: 'Monitoring', exact: true });
  await expect(panel).toContainText('Ask your assistant to report a calendar you choose.');
  await panel.getByRole('button', { name: 'Copy calendar request', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Calendar request copied', exact: true })).toBeVisible();
  expect(page.__nativeRequests.at(-1)).toMatchObject({ assistant: 'codex', kind: 'calendar' });
  await expect(panel.getByRole('button', { name: 'Copy schedule request', exact: true })).toBeDisabled();
});

test('a saved local calendar ID does not masquerade as a calendar reported by the native client', async ({ page }) => {
  const config = scheduleConfig(); config.scope.calendarIds = ['old-local-calendar'];
  await page.route('**/api/monitoring', route => route.fulfill({ json: { config, status: monitoringStatus } }));
  await openTracker(page); await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings.locator('.monitoring-disclosure > summary').click();
  const panel = settings.getByRole('region', { name: 'Monitoring', exact: true });
  await expect(panel).toContainText('Ask your assistant to report a calendar you choose.');
  await expect(panel.getByRole('button', { name: 'Copy schedule request', exact: true })).toBeDisabled();
});

test('native connections remain usable at 320px without exposing advanced adapters by default', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  const dialog = await openConnections(page);
  await capture(page, 'en-connections-320');
  await expect(dialog.getByRole('combobox', { name: 'Connections managed by', exact: true })).toBeHidden();
  await dialog.getByRole('button', { name: 'Calendar — Unknown', exact: true }).click();
  await dialog.locator('[data-connection-provider="icloud-calendar"]').click();
  await expect(dialog.getByRole('button', { name: 'Copy setup request', exact: true })).toBeVisible();
  await capture(page, 'en-provider-320');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await dialog.getByRole('button', { name: 'Copy setup request', exact: true }).boundingBox()).height).toBeGreaterThanOrEqual(44);
});

for (const width of [320, 1440]) test(`Arabic native client connections and calendar requests remain clear at ${width}px`, async ({ page }) => {
  page.__nativeLanguage = 'ar'; await page.setViewportSize({ width, height: width === 320 ? 760 : 960 });
  await openTracker(page); await page.getByRole('button', { name: 'الاتصالات', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(dialog.locator('.connection-category-row')).toHaveCount(6);
  await expect(dialog.getByRole('button', { name: 'البريد — غير معروف', exact: true })).toBeVisible();
  await capture(page, `ar-connections-${width}`);
  await dialog.getByRole('button', { name: 'البريد — غير معروف', exact: true }).click();
  await dialog.locator('[data-connection-provider="gmail"]').click();
  await expect(dialog.getByText('اربط بريدك في تطبيق مساعدك. يحتفظ توظيف بالنتائج المسجلة.', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'نسخ طلب الإعداد', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'تم نسخ طلب الإعداد', exact: true })).toBeVisible();
  await capture(page, `ar-provider-${width}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'تم', exact: true }).click();
  await page.getByRole('button', { name: 'الإعدادات', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'الإعدادات', exact: true });
  await settings.locator('.monitoring-disclosure > summary').click();
  const panel = settings.getByRole('region', { name: 'المتابعة', exact: true });
  await expect(panel).toContainText('اطلب من مساعدك تسجيل تقويم تختاره.');
  await panel.getByRole('button', { name: 'نسخ طلب التقويم', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'تم نسخ طلب التقويم', exact: true })).toBeVisible();
  await capture(page, `ar-monitoring-${width}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('local adapter compatibility requires the explicit advanced mode choice and can return to native', async ({ page }) => {
  await page.route('**/api/setup-status?*', route => route.fulfill({ json: { assistant: 'codex', verified: false, ready: false, steps: [], setupPrompt: 'Fixture legacy setup only.' } }));
  const dialog = await openConnections(page);
  await dialog.locator('.native-connection-advanced > summary').click();
  await dialog.getByRole('combobox', { name: 'Connections managed by', exact: true }).selectOption('local-adapters');
  await expect(dialog.getByRole('button', { name: 'Check connections', exact: true })).toBeVisible();
  await dialog.locator('.native-connection-advanced > summary').click();
  await dialog.getByRole('combobox', { name: 'Connections managed by', exact: true }).selectOption('native');
  await expect(dialog.getByRole('button', { name: 'Check connections', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Email — Unknown', exact: true })).toBeVisible();
  expect(page.__nativeWrites.map(item => item.input)).toEqual([{ connectionMode: 'local-adapters' }, { connectionMode: 'native' }]);
});
