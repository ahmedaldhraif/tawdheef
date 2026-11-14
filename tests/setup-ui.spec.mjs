import { test, expect } from '@playwright/test';

const unknownClient = assistant => ({ assistant, capabilities: {} });
test.beforeEach(async ({ page }) => {
  page.__pageErrors = []; page.__unexpectedWrites = []; page.__preferredAssistant = 'codex';
  page.on('pageerror', error => page.__pageErrors.push(error.message));
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__setupClipboard = text; } } }));
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (/^\/api\/(?:setup-status|assistant-check|assistants|connections|calendar)(?:\/|$)/.test(url.pathname)) { page.__unexpectedWrites.push(request.url()); return route.abort(); }
    if (url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) { page.__unexpectedWrites.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    return route.continue();
  });
  await page.route('**/api/bootstrap', async route => {
    const response = await route.fetch(), boot = await response.json();
    boot.settings.preferredAssistant = page.__preferredAssistant; boot.runs = []; boot.nativeClient = unknownClient(page.__preferredAssistant);
    return route.fulfill({ response, json: boot });
  });
  await page.route('**/api/settings', route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    const patch = route.request().postDataJSON(); expect(Object.keys(patch)).toEqual(['preferredAssistant']);
    page.__preferredAssistant = patch.preferredAssistant;
    return route.fulfill({ json: { preferredAssistant: page.__preferredAssistant } });
  });
  await page.route('**/api/native/connection-request?*', route => {
    const input = Object.fromEntries(new URL(route.request().url()).searchParams);
    return route.fulfill({ json: { assistant: input.assistant, prompt: `Set up ${input.kind} ${input.provider || ''} in ${input.assistant}. Read AGENTS.md and preserve settings. Do not send or submit.` } });
  });
});
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'wait' }); expect(page.__pageErrors).toEqual([]); expect(page.__unexpectedWrites).toEqual([]); });
async function openTracker(page) { await page.goto('/'); await expect(page.locator('.company-name').first()).toBeVisible(); }
async function openConnections(page) { await openTracker(page); await page.getByRole('button', { name: 'Connections', exact: true }).click(); return page.getByRole('dialog'); }

test('first use keeps a single Connections entry with only the six actual-client categories', async ({ page }) => {
  const dialog = await openConnections(page);
  await expect(page.locator('[data-connections-trigger]')).toHaveCount(1);
  await expect(dialog.locator('.connection-category-row')).toHaveCount(6);
  await expect(dialog.getByText('Advanced compatibility', { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Check connections', exact: true })).toHaveCount(0);
  await expect(dialog.locator('input[type="password"]')).toHaveCount(0);
});
test('assistant choice persists through CV guidance and reloading without model probes', async ({ page }) => {
  const dialog = await openConnections(page);
  await dialog.getByRole('button', { name: /^Assistant —/ }).click();
  await dialog.getByRole('radio', { name: 'Use Claude Code', exact: true }).check();
  await dialog.getByRole('button', { name: 'Back to connections', exact: true }).click();
  await dialog.getByRole('button', { name: 'Tabbio CV — Unknown', exact: true }).click();
  await expect(dialog).toContainText('Claude Code');
  await dialog.getByRole('button', { name: 'Copy setup request', exact: true }).click();
  expect(await page.evaluate(() => window.__setupClipboard)).toContain('claude-code');
  await page.reload();
  await page.getByRole('button', { name: 'Connections', exact: true }).click();
  await dialog.getByRole('button', { name: /^Assistant —/ }).click();
  await expect(dialog.getByRole('radio', { name: 'Use Claude Code', exact: true })).toBeChecked();
});
test('a failed assistant preference save retains the earlier selection and retry', async ({ page }) => {
  const dialog = await openConnections(page);
  await dialog.getByRole('button', { name: /^Assistant —/ }).click();
  await page.route('**/api/settings', route => route.request().method() === 'PATCH' ? route.fulfill({ status: 503, json: { error: 'The assistant choice could not be saved. Try again.' } }) : route.continue());
  await dialog.getByRole('radio', { name: 'Use Claude Code', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('The assistant choice could not be saved. Try again.');
  await expect(dialog.getByRole('radio', { name: 'Use Codex', exact: true })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: 'Use Claude Code', exact: true })).toBeEnabled();
});
test('Email and Calendar provider navigation returns focus without handling credentials', async ({ page }) => {
  const dialog = await openConnections(page);
  for (const [kind, provider] of [['Email', 'Gmail'], ['Calendar', 'Google Calendar']]) {
    const category = dialog.getByRole('button', { name: `${kind} — Unknown`, exact: true });
    await category.click();
    const row = dialog.getByRole('button', { name: provider, exact: true });
    await row.click();
    await expect(dialog.getByRole('button', { name: 'Copy setup request', exact: true })).toBeVisible();
    await expect(dialog.locator('input[type="password"]')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(row).toBeFocused();
    await dialog.getByRole('button', { name: 'Back to connections', exact: true }).click();
    await expect(category).toBeFocused();
  }
});
test('a blocked clipboard shows only the requested setup text and Escape returns focus', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('blocked'); } } }));
  const dialog = await openConnections(page);
  await dialog.getByRole('button', { name: 'Browser & computer use — Unknown', exact: true }).click();
  await dialog.getByRole('button', { name: 'Copy setup request', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Copy into your assistant', exact: true })).toHaveValue(/browser/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
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
