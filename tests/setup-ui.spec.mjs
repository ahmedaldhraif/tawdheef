import { test, expect } from '@playwright/test';

function setupReport(assistant = 'codex', { verified = false, ready = false } = {}) {
  const name = assistant === 'claude-code' ? 'Claude Code' : 'Codex';
  return {
    checkedAt: '2026-11-13T04:00:00.000Z', verified, ready, assistant,
    assistants: [{ id: 'codex', name: 'Codex', installed: true }, { id: 'claude-code', name: 'Claude Code', installed: true }],
    steps: [
      { id: 'assistant', title: 'Your assistant', status: ready ? 'ready' : 'not_checked', detail: ready ? `${name} sign-in checked.` : `${name} is installed. Check sign-in.`, action: 'assistant', required: true },
      { id: 'cv', title: 'Your CV', status: ready ? 'ready' : 'not_checked', detail: ready ? 'Your connected CV was read successfully.' : 'Connect Tabbio and check CV access.', action: 'cv', required: true },
      { id: 'directory', title: 'Company list', status: 'ready', detail: '772 companies and sources are available.', action: 'directory', required: true },
      { id: 'browser', title: 'Browser tools', status: 'ready', detail: 'Browser tools and Chromium are installed.', action: 'browser', required: true },
      { id: 'email', title: 'Email', status: 'optional', detail: 'Add email when you need it.', action: 'email', required: false },
      { id: 'calendar', title: 'Calendar', status: 'optional', detail: 'Add a calendar later.', action: 'calendar', required: false },
      { id: 'schedule', title: 'Updates & reports', status: 'optional', detail: 'Choose a schedule later.', action: 'schedule', required: false },
    ],
    nextStep: ready
      ? { id: 'run', title: 'Ready for Run', detail: 'Choose your directory and describe the work you want.', action: 'run' }
      : { id: 'assistant', title: 'Check your assistant', detail: `Check ${name} sign-in and CV access.`, action: 'check' },
    setupPrompt: `Set up Tawdheef for me using ${name}. Read AGENTS.md and docs/FIRST-RUN.md. Keep working settings. Let me complete account sign-ins. Do not send applications or change schedules.`,
  };
}

test.beforeEach(async ({ page, request }) => {
  expect((await request.patch('/api/settings', { data: { connectionMode: 'local-adapters' } })).ok()).toBe(true);
  page.__pageErrors = [];
  page.__unexpectedWrites = [];
  page.__preferredAssistant = 'codex';
  page.on('pageerror', error => page.__pageErrors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__setupClipboard = text; } } });
  });
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method()) && url.pathname !== '/api/setup-status/check') {
      page.__unexpectedWrites.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    return route.continue();
  });
  await page.route('**/api/bootstrap', async route => {
    const response = await route.fetch(), boot = await response.json();
    boot.settings.preferredAssistant = page.__preferredAssistant; boot.settings.connectionMode = 'local-adapters';
    boot.runs = [];
    boot.connections = boot.connections.map(connection => ({ ...connection, status: 'disconnected', configured: false }));
    await route.fulfill({ response, json: boot });
  });
  await page.route('**/api/settings', route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    const patch = route.request().postDataJSON();
    expect(Object.keys(patch)).toEqual(['preferredAssistant']);
    page.__preferredAssistant = patch.preferredAssistant;
    return route.fulfill({ json: { preferredAssistant: page.__preferredAssistant } });
  });
  await page.route('**/api/setup-status?*', route => route.fulfill({ json: setupReport(new URL(route.request().url()).searchParams.get('assistant')) }));
  await page.route('**/api/setup-status/check', route => route.fulfill({ json: setupReport(route.request().postDataJSON().assistant, { verified: true, ready: true }) }));
});

test.afterEach(async ({ page }) => {
  expect(page.__pageErrors).toEqual([]);
  expect(page.__unexpectedWrites).toEqual([]);
});

async function openTracker(page) {
  await page.goto('/');
  await expect(page.locator('.company-name').first()).toBeVisible();
}

async function openConnections(page) {
  await openTracker(page);
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Check connections', exact: true })).toBeEnabled();
  return dialog;
}

test('first use keeps a single Connections entry without an onboarding banner or second setup screen', async ({ page }, testInfo) => {
  await openTracker(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.setup-banner')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Set up with my agent', exact: true })).toHaveCount(0);
  const search = page.getByRole('textbox', { name: 'Search companies', exact: true });
  await search.fill('ABB');
  await expect(page.getByText('ABB', { exact: true })).toBeVisible();
  await expect.poll(() => page.locator('tbody tr').count()).toBeLessThan(100);
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Connections', exact: true });
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(dialog.getByRole('button', { name: 'Setup checklist', exact: true })).toHaveCount(0);
  for (const name of ['Assistant', 'Tabbio CV', 'Email', 'Calendar', 'Browser & computer use', 'Passwords']) await expect(dialog.getByRole('button', { name: new RegExp(`^${name.replace('&', '\\&')} —`) })).toBeVisible();
  await expect(dialog.locator('.connection-category-row')).toHaveCount(6);
  await expect(dialog.getByRole('radio')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Gmail \u2014 Connect', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Copy setup request', exact: true })).toBeVisible();
  await expect(dialog.locator('pre')).toHaveCount(0);
  await expect(dialog.locator('.dialog-intro, .connection-group-hint')).toHaveCount(0);
  await expect(dialog.getByText('Optional', { exact: true })).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('connections-desktop.png') });
});

test('optional agent helper copies setup-only instructions for the single selected assistant', async ({ page }) => {
  const dialog = await openConnections(page);
  await dialog.getByRole('button', { name: /^Assistant —/ }).click();
  await expect(dialog.getByRole('radio')).toHaveCount(2);
  await dialog.getByRole('radio', { name: 'Use Claude Code for Run', exact: true }).check();
  await expect(dialog.getByRole('radio', { name: 'Use Codex for Run', exact: true })).not.toBeChecked();
  await expect(dialog.getByRole('radio', { name: 'Use Claude Code for Run', exact: true })).toBeChecked();
  const copy = dialog.getByRole('button', { name: 'Copy setup request', exact: true });
  await expect(copy).toBeEnabled();
  await copy.click();
  const copied = await page.evaluate(() => window.__setupClipboard);
  expect(copied).toContain('using Claude Code');
  expect(copied).toContain('docs/FIRST-RUN.md');
  expect(copied).toContain('Do not send applications or change schedules');
  await expect(dialog.getByRole('textbox', { name: 'Copy into your assistant', exact: true })).toHaveCount(0);
  await expect(dialog.locator('pre')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Run', exact: true })).toHaveCount(0);
});

test('a blocked clipboard exposes only a compact selectable setup request', async ({ page }) => {
  const dialog = await openConnections(page);
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Clipboard blocked'); }; });
  await dialog.getByRole('button', { name: 'Copy setup request', exact: true }).click();
  const fallback = dialog.getByRole('textbox', { name: 'Copy into your assistant', exact: true });
  await expect(fallback).toHaveValue(/Read AGENTS.md and docs\/FIRST-RUN.md/);
  await expect(fallback).toHaveAttribute('readonly', '');
  await expect(fallback).toHaveAttribute('rows', '3');
  await expect(dialog.locator('pre')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Check connections', exact: true })).toBeInViewport();
});

test('Email and Calendar reveal provider choices one level deeper and keep keyboard focus on return', async ({ page }) => {
  const dialog = await openConnections(page);
  await dialog.getByRole('button', { name: 'Email \u2014 Optional', exact: true }).click();
  await expect(dialog).toHaveAccessibleName('Email');
  await expect(dialog.locator('[data-connection-provider]')).toHaveCount(3);
  await expect(dialog.locator('.provider-row img.provider-logo')).toHaveCount(3);
  await dialog.getByRole('button', { name: 'Gmail \u2014 Connect', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Back to connections', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Back to connections', exact: true }).click();
  await expect(dialog).toHaveAccessibleName('Email');
  await expect(dialog.getByRole('button', { name: 'Gmail \u2014 Connect', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Back to connections', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Email \u2014 Optional', exact: true })).toBeFocused();
  await dialog.getByRole('button', { name: 'Calendar \u2014 Optional', exact: true }).click();
  await expect(dialog).toHaveAccessibleName('Calendar');
  for (const name of ['Google Calendar', 'Outlook Calendar', 'iCloud Calendar']) await expect(dialog.getByRole('button', { name: `${name} — Connect`, exact: true })).toBeVisible();
});

test('browser and password setup stay client-owned and copy only the requested capability guidance', async ({ page }) => {
  const requests = [];
  await page.route('**/api/agent-capabilities/recipe?*', route => {
    const url = new URL(route.request().url()), kind = url.searchParams.get('kind');
    requests.push({ assistant: url.searchParams.get('assistant'), kind });
    return route.fulfill({ json: { assistant: 'codex', kind, prompt: `Help me set up ${kind} in Codex. Keep career passwords in the supported browser or manager; do not change global settings or submit anything.` } });
  });
  const dialog = await openConnections(page);
  await dialog.getByRole('button', { name: /^Browser & computer use —/ }).click();
  await expect(dialog).toHaveAccessibleName('Browser & computer use');
  await dialog.getByRole('button', { name: 'Copy setup request', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Setup request copied', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.__setupClipboard)).toContain('set up browser in Codex');
  await dialog.getByRole('button', { name: 'Back to connections', exact: true }).click();
  await dialog.getByRole('button', { name: /^Passwords —/ }).click();
  await expect(dialog).toHaveAccessibleName('Passwords');
  await expect(dialog).toContainText('Website passwords stay in your browser or password manager.');
  await expect(dialog.locator('input[type="password"]')).toHaveCount(0);
  await expect(dialog).not.toContainText('0 items');
  await expect(dialog).not.toContainText('Connected');
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Clipboard blocked'); }; });
  await dialog.getByRole('button', { name: 'Copy setup request', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Copy into your assistant', exact: true })).toHaveValue(/set up passwords in Codex/);
  expect(requests).toEqual([{ assistant: 'codex', kind: 'browser' }, { assistant: 'codex', kind: 'passwords' }]);
});

test('Check connections verifies only the chosen assistant and explains blockers without requiring optional accounts', async ({ page }) => {
  const checks = [];
  await page.route('**/api/setup-status/check', route => {
    const input = route.request().postDataJSON(); checks.push(input);
    const report = setupReport(input.assistant, { verified: true, ready: input.assistant === 'codex' });
    if (input.assistant === 'claude-code') {
      report.steps[0] = { ...report.steps[0], status: 'needs_action', detail: 'Sign in to Claude Code on this computer.' };
      report.nextStep = { id: 'assistant', title: 'Needs you', detail: 'Sign in to Claude Code on this computer.', action: 'assistant' };
    }
    return route.fulfill({ json: report });
  });
  const dialog = await openConnections(page);
  await expect(dialog.getByText('Connections ready', { exact: true })).toHaveCount(0);
  expect(checks).toEqual([]);
  await dialog.getByRole('button', { name: 'Check connections', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Connections ready');
  expect(checks).toEqual([{ assistant: 'codex' }]);
  await expect(dialog.getByRole('button', { name: 'Email \u2014 Optional', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Calendar \u2014 Optional', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: /^Assistant —/ }).click();
  await dialog.getByRole('radio', { name: 'Use Claude Code for Run', exact: true }).check();
  await expect(dialog.getByText('Connections ready', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Check connections', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Needs you');
  await expect(dialog.getByRole('status')).toContainText('Sign in to Claude Code on this computer.');
  expect(checks).toEqual([{ assistant: 'codex' }, { assistant: 'claude-code' }]);
});

test('failed connection summaries and checks leave a direct retry available', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/setup-status?*', route => route.fulfill({ status: 503, json: { error: 'The setup summary is unavailable. Check connections to retry.' } }));
  await page.route('**/api/setup-status/check', route => [1, 3].includes(++attempts)
    ? route.fulfill({ status: 503, json: { error: 'The local setup check could not finish. Try again.' } })
    : route.fulfill({ json: setupReport(route.request().postDataJSON().assistant, { verified: true, ready: true }) }));
  const dialog = await openConnections(page);
  await expect(dialog.getByRole('alert')).toHaveText('The setup summary is unavailable. Check connections to retry.');
  await expect(dialog.getByRole('button', { name: 'Check connections', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Check connections', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('The local setup check could not finish. Try again.');
  await expect(dialog.getByText('Connections ready', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Check connections', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Connections ready');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Check connections', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('The local setup check could not finish. Try again.');
  await expect(dialog.getByText('Connections ready', { exact: true })).toHaveCount(0);
  expect(attempts).toBe(3);
});

test('assistant choice persists when returning from CV and AI setup', async ({ page }) => {
  let dialog = await openConnections(page);
  await dialog.getByRole('button', { name: /^Assistant —/ }).click();
  await dialog.getByRole('radio', { name: 'Use Claude Code for Run', exact: true }).check();
  await dialog.getByRole('button', { name: 'Back to connections', exact: true }).click();
  await dialog.getByRole('button', { name: 'Tabbio CV \u2014 Connect', exact: true }).click();
  const cv = page.getByRole('dialog', { name: 'Connect Tabbio CV', exact: true });
  await expect(cv).toBeVisible();
  await cv.getByRole('button', { name: 'Back to connections', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^Assistant —/ }).click();
  await expect(dialog.getByRole('radio', { name: 'Use Claude Code for Run', exact: true })).toBeChecked();
  await dialog.getByRole('button', { name: 'Claude Code \u2014 View setup', exact: true }).click();
  const ai = page.getByRole('dialog', { name: 'Claude Code setup', exact: true });
  await expect(ai.getByRole('link', { name: 'Install Claude Code', exact: true })).toBeVisible();
  await expect(ai.getByRole('tab')).toHaveCount(0);
  await ai.getByRole('button', { name: 'Back to connections', exact: true }).click();
  await expect(dialog.getByRole('radio', { name: 'Use Claude Code for Run', exact: true })).toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Claude Code \u2014 View setup', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  await dialog.getByRole('button', { name: /^Assistant —/ }).click();
  await expect(dialog.getByRole('radio', { name: 'Use Claude Code for Run', exact: true })).toBeChecked();
});

test('a failed shared assistant preference save keeps the previous choice and offers a retry', async ({ page }) => {
  const dialog = await openConnections(page);
  await dialog.getByRole('button', { name: /^Assistant —/ }).click();
  await page.route('**/api/settings', route => route.request().method() === 'PATCH'
    ? route.fulfill({ status: 503, json: { error: 'The assistant choice could not be saved. Try again.' } })
    : route.continue());
  await dialog.getByRole('radio', { name: 'Use Claude Code for Run', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('The assistant choice could not be saved. Try again.');
  await expect(dialog.getByRole('radio', { name: 'Use Codex for Run', exact: true })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: 'Use Claude Code for Run', exact: true })).toBeEnabled();
});

test('the one readiness action opens the exact CV connection and returns focus', async ({ page }) => {
  await page.route('**/api/setup-status/check', route => {
    const report = setupReport('codex', { verified: true, ready: false });
    report.nextStep = { id: 'cv', title: 'Your CV', detail: 'Your CV needs sign-in. Open Tabbio CV to continue.', action: 'cv' };
    report.steps[1].status = 'needs_action';
    return route.fulfill({ json: report });
  });
  const dialog = await openConnections(page);
  await dialog.getByRole('button', { name: 'Check connections', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Needs you');
  await dialog.getByRole('button', { name: 'Open Tabbio CV', exact: true }).click();
  const cv = page.getByRole('dialog', { name: 'Connect Tabbio CV', exact: true });
  await expect(cv).toBeVisible();
  await cv.getByRole('button', { name: 'Back to connections', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Tabbio CV \u2014 Connect', exact: true })).toBeFocused();
});

test('a model check requires its explicit button and only verified evidence changes Connections ready to Ready', async ({ page }) => {
  const calls = [];
  await page.route('**/api/assistant-check', route => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ json: { modelAccessVerified: true, status: 'ready', checkedAt: '2026-11-14T05:00:00Z', nextStep: null } });
  });
  const dialog = await openConnections(page);
  expect(calls).toEqual([]);
  await dialog.getByRole('button', { name: 'Check connections', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Connections ready');
  expect(calls).toEqual([]);
  await dialog.getByRole('button', { name: 'Test Codex', exact: true }).click();
  await expect(dialog.getByRole('status').getByText('Ready', { exact: true })).toBeVisible();
  expect(calls).toEqual([{ assistant: 'codex', explicit: true }]);
});

test('a failed explicit agent check shows Needs you and leaves retry and setup available', async ({ page }) => {
  await page.route('**/api/assistant-check', route => route.fulfill({ json: { modelAccessVerified: false, status: 'needs_you', checkedAt: '2026-11-14T05:00:00Z', nextStep: 'Open Codex and review its model-provider access, then test again.' } }));
  const dialog = await openConnections(page);
  await dialog.getByRole('button', { name: 'Check connections', exact: true }).click();
  await dialog.getByRole('button', { name: 'Test Codex', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Needs you');
  await expect(dialog.getByRole('status')).toContainText('review its model-provider access');
  await expect(dialog.getByRole('button', { name: 'Test Codex', exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: 'Open Codex setup', exact: true })).toBeVisible();
});

test('a failed model proof keeps its actionable reason after Connections is closed and reopened', async ({ page }) => {
  let proof = { assistant: 'codex', status: 'not_checked', modelAccessVerified: false, checkedAt: null, category: null };
  let modelCalls = 0;
  const reason = 'The assistant did not complete both fixture tool calls. Check its MCP access, then test again.';
  const report = verified => ({ ...setupReport('codex', { verified, ready: verified }), modelCheck: { ...proof }, modelAccessVerified: proof.modelAccessVerified });
  await page.route('**/api/setup-status?*', route => route.fulfill({ json: report(false) }));
  await page.route('**/api/setup-status/check', route => route.fulfill({ json: report(true) }));
  await page.route('**/api/assistant-check*', route => {
    if (route.request().method() === 'POST') {
      modelCalls++;
      proof = { ...proof, status: 'needs_you', category: 'tool_proof_missing', modelAccessVerified: false, checkedAt: '2026-11-14T05:00:00Z' };
    }
    return route.fulfill({ json: { ...proof, nextStep: reason } });
  });
  const dialog = await openConnections(page);
  await expect(dialog.getByText('Needs you', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Check connections', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Connections ready');
  await dialog.getByRole('button', { name: 'Test Codex', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText(reason);
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Needs you');
  await expect(dialog.getByRole('status')).toContainText(reason);
  await expect(dialog.getByRole('button', { name: 'Open Codex setup', exact: true })).toBeVisible();
  expect(modelCalls).toBe(1);
});

test('rechecking connections keeps the actual saved model-proof timestamp', async ({ page }) => {
  const proof = { assistant: 'codex', status: 'ready', modelAccessVerified: true, checkedAt: '2026-11-14T05:00:00Z', category: null };
  let checks = 0;
  await page.route('**/api/setup-status?*', route => route.fulfill({ json: { ...setupReport('codex'), modelAccessVerified: true, modelCheck: proof } }));
  await page.route('**/api/setup-status/check', route => route.fulfill({ json: { ...setupReport('codex', { verified: true, ready: true }), checkedAt: ++checks === 1 ? '2026-11-14T07:00:00Z' : '2026-11-14T08:00:00Z', modelAccessVerified: true, modelCheck: proof } }));
  const dialog = await openConnections(page);
  const originalTime = await page.evaluate(value => new Date(value).toLocaleString(), proof.checkedAt);
  for (const hour of ['07', '08']) {
    await dialog.getByRole('button', { name: 'Check connections', exact: true }).click();
    await expect(dialog.getByRole('status').getByText('Ready', { exact: true })).toBeVisible();
    await expect(dialog.locator('.connection-checked-at')).toContainText(originalTime);
    const connectionTime = await page.evaluate(value => new Date(value).toLocaleString(), `2026-11-14T${hour}:00:00Z`);
    await expect(dialog.locator('.connection-checked-at')).not.toContainText(connectionTime);
  }
  expect(checks).toBe(2);
});

test('narrow Connections helper stays readable and keyboard dismissal returns focus', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const dialog = await openConnections(page);
  await expect(dialog.getByRole('button', { name: 'Check connections', exact: true })).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Done', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBeTruthy();
  const close = dialog.getByRole('button', { name: 'Close', exact: true }).first();
  await close.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Check connections', exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('connections-mobile.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Connections', exact: true })).toBeFocused();
});

for (const width of [320, 1440]) test(`Arabic tracker connections, CV upload and monitoring remain readable at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: width === 320 ? 740 : 960 });
  await page.route('**/api/bootstrap', async route => {
    const response = await route.fetch(), boot = await response.json();
    boot.settings.language = 'ar'; boot.settings.preferredAssistant = 'codex'; boot.settings.connectionMode = 'local-adapters'; boot.runs = [];
    boot.connections = boot.connections.map(item => ({ ...item, status: 'disconnected', configured: false }));
    return route.fulfill({ response, json: boot });
  });
  await page.route('**/api/monitoring', route => route.fulfill({ json: {
    config: { revision: 0, enabled: true, assistant: 'codex', frequency: 'daily', time: '09:00', timezone: 'Asia/Dubai', channels: { jobs: true, profiles: true, email: true, calendar: true }, scope: { directoryIds: ['uae'], companyIds: [], calendarIds: ['fixture-calendar'] }, instructions: '' },
    status: { lastCheckAt: '2026-11-14T05:00:00Z', lastSuccessAt: null, unreadCount: 2, needsYouCount: 1, latestSummary: 'يلزم تسجيل الدخول للتحقق من الملف المهني.', activeChecks: 0, externalScheduleStatus: 'unknown', nextRunAt: null },
  } }));
  await page.route('**/api/monitoring/updates?*', route => route.fulfill({ json: { items: [], total: 0, nextOffset: null } }));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.getByRole('button', { name: 'الاتصالات', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.connection-category-row')).toHaveCount(6);
  await expect(dialog).toContainText('المتصفح والتحكم بالجهاز');
  await expect(dialog.getByRole('button', { name: 'نسخ طلب الإعداد', exact: true })).toBeVisible();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`connections-ar-${width}.png`) });
  await dialog.getByRole('button', { name: /^المساعد —/ }).click();
  await expect(dialog.getByRole('radio', { name: 'استخدام Codex للتشغيل', exact: true })).toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Codex — الإعداد', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'فحص الاتصالات', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('الاتصالات جاهزة');
  await expect(dialog.getByRole('button', { name: 'اختبار Codex', exact: true })).toBeVisible();
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`assistant-ar-${width}.png`) });
  await dialog.getByRole('button', { name: 'العودة إلى الاتصالات', exact: true }).click();
  await dialog.getByRole('button', { name: /^كلمات المرور —/ }).click();
  await expect(dialog).toContainText('تبقى كلمات مرور المواقع في متصفحك أو مدير كلمات المرور.');
  await expect(dialog).not.toContainText('Website passwords stay');
  await page.screenshot({ path: testInfo.outputPath(`passwords-ar-${width}.png`) });
  await dialog.getByRole('button', { name: 'العودة إلى الاتصالات', exact: true }).click();
  await dialog.getByRole('button', { name: /^سيرة Tabbio الذاتية —/ }).click();
  await dialog.locator('.cv-original-file > summary').click();
  await expect(dialog.locator('.cv-original-file')).toContainText('ملف السيرة الذاتية الأصلي للرفع');
  await expect(dialog.getByLabel('ملف السيرة الذاتية', { exact: true })).toBeVisible();
  await dialog.locator('.dialog-header button').first().click();
  await page.getByRole('button', { name: 'الإعدادات', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'الإعدادات', exact: true });
  await expect(settings.locator('.monitoring-disclosure > summary')).toContainText('يحتاج تدخلك');
  await page.screenshot({ path: testInfo.outputPath(`settings-collapsed-ar-${width}.png`) });
  await settings.locator('.monitoring-disclosure > summary').click();
  const panel = settings.getByRole('region', { name: 'المتابعة', exact: true });
  for (const name of ['الوظائف المناسبة', 'الملفات المهنية', 'رسائل طلبات التوظيف', 'التقويم']) await expect(panel.getByRole('checkbox', { name, exact: true })).toBeChecked();
  await expect(panel).toContainText('النطاق: 1 دليل محفوظ');
  await expect(panel).toContainText('أحداث التقويم خلال الأيام الأربعة عشر القادمة.');
  await expect(panel.getByRole('button', { name: 'نسخ طلب الجدولة', exact: true })).toBeVisible();
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(settings.getByRole('button', { name: 'حفظ التغييرات', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath(`monitoring-ar-${width}.png`) });
});

test('workspace pointer highlight fades to idle and leaves table controls unobstructed', async ({ page }) => {
  await page.addInitScript(() => {
    const requestFrame = window.requestAnimationFrame.bind(window);
    window.__workspaceFrameRequests = 0;
    window.requestAnimationFrame = callback => { window.__workspaceFrameRequests++; return requestFrame(callback); };
  });
  await openTracker(page);
  const background = page.locator('.workspace-background');
  const spotlight = page.locator('.workspace-dot-spotlight');
  await expect(background).toHaveAttribute('aria-hidden', 'true');
  await expect(background).toHaveCSS('pointer-events', 'none');
  expect(Number(await background.evaluate(element => getComputedStyle(element).zIndex))).toBeLessThan(0);
  await page.mouse.move(125, 155);
  await expect.poll(() => spotlight.evaluate(element => element.style.getPropertyValue('--pattern-x'))).toBe('125px');
  await expect.poll(() => spotlight.evaluate(element => Number(getComputedStyle(element).opacity))).toBeGreaterThan(0);
  await expect.poll(() => spotlight.evaluate(element => Number(getComputedStyle(element).opacity))).toBe(0);
  expect(await spotlight.evaluate(element => element.getAnimations().some(animation => animation.playState === 'running'))).toBe(false);
  const idleFrames = await page.evaluate(() => window.__workspaceFrameRequests);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__workspaceFrameRequests)).toBe(idleFrames);
  // The dot texture remains below the opaque working surface, never above text.
  await expect(page.locator('.table-surface')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  const search = page.getByRole('textbox', { name: 'Search companies', exact: true });
  expect(await search.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) === element;
  })).toBe(true);
  await search.click();
  await search.fill('ABB');
  await expect(page.getByText('ABB', { exact: true })).toBeVisible();
  await expect.poll(() => page.locator('tbody tr').count()).toBeLessThan(100);
});

test('workspace texture stays static for reduced motion and touch, and hides in forced colors', async ({ page, browser, baseURL }) => {
  const expectTextureForPreferences = async currentPage => {
    const solidSurface = await currentPage.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)').matches);
    if (solidSurface) {
      await expect(currentPage.locator('.workspace-background')).toHaveCSS('display', 'none');
      await expect(currentPage.locator('.workspace-dot-grid')).toBeHidden();
    } else await expect(currentPage.locator('.workspace-dot-grid')).toBeVisible();
  };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openTracker(page);
  await expectTextureForPreferences(page);
  await expect(page.locator('.workspace-dot-spotlight')).toHaveCSS('display', 'none');
  await page.mouse.move(150, 150);
  expect(await page.locator('.workspace-dot-spotlight').evaluate(element => element.getAnimations().length)).toBe(0);
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-reduced-transparency', value: 'reduce' }] });
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches)).toBe(true);
  await expect(page.locator('.workspace-background')).toHaveCSS('display', 'none');
  await page.emulateMedia({ forcedColors: 'active' });
  await expect(page.locator('.workspace-background')).toHaveCSS('display', 'none');
  const touch = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'no-preference' });
  const writes = [], errors = [];
  try {
    const touchPage = await touch.newPage();
    touchPage.on('pageerror', error => errors.push(error.message));
    await touchPage.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
      if (url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) { writes.push(request.url()); return route.abort(); }
      return route.continue();
    });
    await openTracker(touchPage);
    await expectTextureForPreferences(touchPage);
    await expect(touchPage.locator('.workspace-dot-spotlight')).toHaveCSS('display', 'none');
    await touchPage.getByRole('textbox', { name: 'Search companies', exact: true }).tap();
    expect(await touchPage.locator('.workspace-dot-spotlight').evaluate(element => element.getAnimations().length)).toBe(0);
    expect(await touchPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  } finally { await touch.close(); }
});
