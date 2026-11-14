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

test.beforeEach(async ({ page }) => {
  page.__pageErrors = [];
  page.__unexpectedWrites = [];
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
    boot.runs = [];
    boot.connections = boot.connections.map(connection => ({ ...connection, status: 'disconnected', configured: false }));
    await route.fulfill({ response, json: boot });
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
  const dialog = page.getByRole('dialog', { name: 'Connections', exact: true });
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
  for (const name of ['Email', 'Calendar', 'Your CV', 'AI assistants']) await expect(dialog.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Copy setup request', exact: true })).toBeVisible();
  await expect(dialog.locator('pre')).toHaveCount(0);
  await expect(dialog.locator('.dialog-intro, .connection-group-hint')).toHaveCount(0);
  await expect(dialog.getByText('Optional', { exact: true })).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('connections-desktop.png') });
});

test('optional agent helper copies setup-only instructions for the single selected assistant', async ({ page }) => {
  const dialog = await openConnections(page);
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
  await expect(dialog.getByText('Ready for Run', { exact: true })).toHaveCount(0);
  expect(checks).toEqual([]);
  await dialog.getByRole('button', { name: 'Check connections', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Ready for Run');
  expect(checks).toEqual([{ assistant: 'codex' }]);
  await expect(dialog.getByRole('button', { name: 'Gmail \u2014 Connect', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Google Calendar \u2014 Connect', exact: true })).toBeVisible();
  await dialog.getByRole('radio', { name: 'Use Claude Code for Run', exact: true }).check();
  await expect(dialog.getByText('Ready for Run', { exact: true })).toHaveCount(0);
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
  await expect(dialog.getByText('Ready for Run', { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Check connections', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Ready for Run');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Check connections', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('The local setup check could not finish. Try again.');
  await expect(dialog.getByText('Ready for Run', { exact: true })).toHaveCount(0);
  expect(attempts).toBe(3);
});

test('assistant choice persists when returning from CV and AI setup', async ({ page }) => {
  let dialog = await openConnections(page);
  await dialog.getByRole('radio', { name: 'Use Claude Code for Run', exact: true }).check();
  await dialog.getByRole('button', { name: 'Tabbio CV \u2014 Connect', exact: true }).click();
  const cv = page.getByRole('dialog', { name: 'Connect Tabbio CV', exact: true });
  await expect(cv).toBeVisible();
  await cv.getByRole('button', { name: 'Back to connections', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Connections', exact: true });
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
  await expect(dialog.getByRole('radio', { name: 'Use Claude Code for Run', exact: true })).toBeChecked();
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
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openTracker(page);
  await expect(page.locator('.workspace-dot-grid')).toBeVisible();
  await expect(page.locator('.workspace-dot-spotlight')).toHaveCSS('display', 'none');
  await page.mouse.move(150, 150);
  expect(await page.locator('.workspace-dot-spotlight').evaluate(element => element.getAnimations().length)).toBe(0);
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
    await expect(touchPage.locator('.workspace-dot-grid')).toBeVisible();
    await expect(touchPage.locator('.workspace-dot-spotlight')).toHaveCSS('display', 'none');
    await touchPage.getByRole('textbox', { name: 'Search companies', exact: true }).tap();
    expect(await touchPage.locator('.workspace-dot-spotlight').evaluate(element => element.getAnimations().length)).toBe(0);
    expect(await touchPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  } finally { await touch.close(); }
});
