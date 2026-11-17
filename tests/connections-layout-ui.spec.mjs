import { test, expect } from '@playwright/test';

const observedAt = '2026-11-16T08:00:00Z';
const connectionNote = 'External sign-in remains in the selected assistant; this records local tool use only.';
const emptyClient = assistant => ({ assistant, mode: 'native', capabilities: {} });
const words = {
  en: { connections: 'Connections', assistant: 'Assistant', back: 'Back to connections', codex: 'Use Codex', claude: 'Use Claude Code', unknown: 'Not checked', optional: 'Optional', cv: 'Tabbio CV', email: 'Email', calendar: 'Calendar', passwords: 'Passwords' },
  ar: { connections: 'الاتصالات', assistant: 'المساعد', back: 'العودة إلى الاتصالات', codex: 'استخدام Codex', claude: 'استخدام Claude Code', unknown: 'لم يُفحص', optional: 'اختياري', cv: 'سيرة Tabbio الذاتية', email: 'البريد', calendar: 'التقويم', passwords: 'كلمات المرور' },
};

test.beforeEach(async ({ page }) => {
  page.__connections = { assistant: 'codex', language: 'en', client: emptyClient('codex'), saves: [], requests: [], forbidden: [], errors: [], failSave: false };
  page.on('pageerror', error => page.__connections.errors.push(error.message));
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__connectionsClipboard = text; } } }));
  await page.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (/^\/api\/(?:setup-status|assistant-check|assistants|connections|calendar)(?:\/|$)/.test(url.pathname)
      || (url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method()))) {
      page.__connections.forbidden.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    return route.continue();
  });
  await page.route('**/api/bootstrap', async route => {
    const response = await route.fetch(), boot = await response.json(), state = page.__connections;
    boot.settings = { ...boot.settings, connectionMode: 'native', preferredAssistant: state.assistant, language: state.language };
    boot.nativeClient = state.client; boot.connections = []; boot.runs = [];
    return route.fulfill({ response, json: boot });
  });
  await page.route('**/api/native/client?*', route => route.fulfill({ json: page.__connections.client }));
  await page.route('**/api/native/readiness*', route => {
    const assistant = new URL(route.request().url()).searchParams.get('assistant') || page.__connections.assistant;
    return route.fulfill({ json: {
      assistant, ready: false, status: 'unknown', clientReported: true, independentlyVerified: false, checkedAt: null,
      checks: [{ id: 'cv', label: 'Readable CV', status: 'unknown', required: true }], nextStep: { id: 'cv' },
    } });
  });
  await page.route('**/api/settings', route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    const input = route.request().postDataJSON(), state = page.__connections;
    state.saves.push(input);
    expect(Object.keys(input)).toEqual(['preferredAssistant']);
    if (state.failSave) return route.fulfill({ status: 503, json: { error: 'The assistant choice could not be saved. Try again.' } });
    state.assistant = input.preferredAssistant; state.client = emptyClient(state.assistant);
    return route.fulfill({ json: { connectionMode: 'native', preferredAssistant: state.assistant } });
  });
  await page.route('**/api/native/setup-request', route => {
    const input = route.request().postDataJSON(); page.__connections.requests.push(input);
    return route.fulfill({ json: { prompt: `Fixture setup for ${input.assistant}. Inspect actual client tools. Do not send or submit.` } });
  });
  await page.route('**/api/native/connection-request?*', route => {
    const input = Object.fromEntries(new URL(route.request().url()).searchParams); page.__connections.requests.push(input);
    return route.fulfill({ json: { prompt: `Fixture ${input.assistant} ${input.kind} ${input.provider || ''} request. Do not send or submit.` } });
  });
});

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'wait' });
  expect(page.__connections.errors).toEqual([]);
  expect(page.__connections.forbidden).toEqual([]);
});

async function openConnections(page) {
  const labels = words[page.__connections.language];
  await page.goto('/'); await expect(page.locator('.company-name').first()).toBeVisible();
  await page.getByRole('button', { name: labels.connections, exact: true }).click();
  return page.getByRole('dialog');
}

for (const language of ['en', 'ar']) for (const width of [1440, 320]) {
  test(`assistant rows remain aligned and radios stay compact in ${language} at ${width}px`, async ({ page }) => {
    page.__connections.language = language;
    await page.setViewportSize({ width, height: width === 320 ? 760 : 960 });
    const labels = words[language], dialog = await openConnections(page);
    await expect(dialog.locator('.connection-category-row')).toHaveCount(6);
    await expect(dialog.getByRole('button', { name: `${labels.email} — ${labels.unknown}`, exact: true })).toBeVisible();
    for (const category of [labels.calendar, labels.passwords]) await expect(dialog.getByRole('button', { name: `${category} — ${labels.optional}`, exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: `${labels.assistant} — Codex`, exact: true }).click();
    const group = dialog.getByRole('group', { name: labels.assistant, exact: true });
    await expect(group).toBeVisible();
    await expect(group.getByRole('radio', { name: labels.codex, exact: true })).toBeChecked();
    await expect(group.getByRole('radio', { name: labels.claude, exact: true })).not.toBeChecked();
    const geometry = await group.locator('.provider-row').evaluateAll(rows => rows.map(row => {
      const radio = row.querySelector('input[type="radio"]'), icon = row.querySelector('img.provider-logo'), name = row.querySelector('.provider-row-name');
      if (!radio || !icon || !name) return null;
      const box = element => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, center: rect.top + rect.height / 2 }; };
      return { direction: getComputedStyle(row).direction, row: box(row), radio: box(radio), icon: box(icon), name: box(name) };
    }));
    expect(geometry).toHaveLength(2);
    for (const item of geometry) {
      expect(item).not.toBeNull();
      expect(item.radio.width).toBeCloseTo(18, 0); expect(item.radio.height).toBeCloseTo(18, 0);
      expect(item.row.height).toBeGreaterThanOrEqual(48);
      expect(Math.abs(item.radio.center - item.icon.center)).toBeLessThanOrEqual(2);
      expect(Math.abs(item.radio.center - item.name.center)).toBeLessThanOrEqual(2);
      if (item.direction === 'rtl') {
        expect(item.icon.left).toBeGreaterThanOrEqual(item.name.right);
        expect(item.name.left).toBeGreaterThan(item.radio.right);
      } else {
        expect(item.icon.right).toBeLessThanOrEqual(item.name.left);
        expect(item.name.right).toBeLessThan(item.radio.left);
      }
      expect(item.name.height).toBeLessThan(30);
    }
    const headerBack = dialog.locator('.dialog-header').getByRole('button', { name: labels.back, exact: true });
    await expect(headerBack).toBeVisible(); await expect(headerBack).toBeFocused();
    await expect(dialog.locator('.dialog-content').getByRole('button', { name: labels.back, exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await headerBack.click();
    await expect(dialog.getByRole('button', { name: `${labels.assistant} — Codex`, exact: true })).toBeFocused();
    expect(page.__connections.saves).toEqual([]);
  });
}

test('native radio arrow keys save the selected assistant and retain it after reload', async ({ page }) => {
  const dialog = await openConnections(page);
  await dialog.getByRole('button', { name: 'Assistant — Codex', exact: true }).click();
  const codex = dialog.getByRole('radio', { name: 'Use Codex', exact: true }), claude = dialog.getByRole('radio', { name: 'Use Claude Code', exact: true });
  await codex.focus(); await codex.press('ArrowDown');
  await expect(claude).toBeChecked(); await expect(claude).toBeEnabled(); await expect(claude).toBeFocused();
  expect(page.__connections.saves).toEqual([{ preferredAssistant: 'claude-code' }]);
  await dialog.locator('.dialog-header').getByRole('button', { name: 'Back to connections', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Assistant — Claude Code', exact: true })).toBeFocused();
  await page.reload(); await page.getByRole('button', { name: 'Connections', exact: true }).click();
  await dialog.getByRole('button', { name: 'Assistant — Claude Code', exact: true }).click();
  await expect(dialog.getByRole('radio', { name: 'Use Claude Code', exact: true })).toBeChecked();
});

test('failed assistant selection restores the saved choice and permits retry', async ({ page }) => {
  const dialog = await openConnections(page);
  await dialog.getByRole('button', { name: 'Assistant — Codex', exact: true }).click();
  page.__connections.failSave = true;
  // A rejected save may restore the old value before check() verifies its click.
  await dialog.getByRole('radio', { name: 'Use Claude Code', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('The assistant choice could not be saved. Try again.');
  await expect(dialog.getByRole('radio', { name: 'Use Codex', exact: true })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: 'Use Claude Code', exact: true })).toBeEnabled();
  expect(page.__connections.assistant).toBe('codex');
  page.__connections.failSave = false;
  await dialog.getByRole('radio', { name: 'Use Claude Code', exact: true }).check();
  await expect(dialog.getByRole('radio', { name: 'Use Claude Code', exact: true })).toBeChecked();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('provider header navigation restores each originating row without changing accounts', async ({ page }) => {
  const dialog = await openConnections(page), email = dialog.getByRole('button', { name: 'Email — Not checked', exact: true });
  await email.click();
  const gmail = dialog.getByRole('button', { name: 'Gmail', exact: true });
  await gmail.click();
  await expect(dialog.getByRole('button', { name: 'Copy setup request', exact: true })).toBeVisible();
  await dialog.locator('.dialog-header').getByRole('button', { name: 'Back', exact: true }).click();
  await expect(gmail).toBeFocused();
  await dialog.locator('.dialog-header').getByRole('button', { name: 'Back to connections', exact: true }).click();
  await expect(email).toBeFocused();
  expect(page.__connections.saves).toEqual([]); expect(page.__connections.requests).toEqual([]);
  await expect(dialog.locator('input[type="password"]')).toHaveCount(0);
});

test('an accepted assistant choice survives a later status refresh failure', async ({ page }) => {
  const dialog = await openConnections(page);
  await dialog.getByRole('button', { name: 'Assistant — Codex', exact: true }).click();
  await page.route('**/api/bootstrap', route => route.fulfill({ status: 503, json: { error: 'Status refresh unavailable.' } }));
  const claude = dialog.getByRole('radio', { name: 'Use Claude Code', exact: true });
  await claude.check();
  await expect(claude).toBeEnabled(); await expect(claude).toBeChecked(); await expect(claude).toBeFocused();
  await expect(dialog.getByRole('alert')).toHaveCount(0);
  expect(page.__connections.assistant).toBe('claude-code');
  await dialog.getByRole('button', { name: 'Back to connections', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Assistant — Claude Code', exact: true })).toBeFocused();
});

test('local connection provenance stays on demand and never implies external sign-in', async ({ page }) => {
  page.__connections.client.capabilities.assistant = { status: 'reported', localToolUseObserved: true, observedAt, nextStep: connectionNote };
  const dialog = await openConnections(page);
  await dialog.getByRole('button', { name: 'Assistant — Codex', exact: true }).click();
  await expect(dialog.getByText('Local connection observed', { exact: true })).toBeVisible();
  await expect(dialog.locator('.connection-capability-owner')).toHaveCount(0);
  const details = dialog.locator('details').filter({ has: page.getByText('Connection details', { exact: true }) });
  await expect(details).not.toHaveAttribute('open', '');
  await expect(dialog.getByText(connectionNote, { exact: true })).toBeHidden();
  await details.locator('summary').click();
  await expect(dialog.getByText(connectionNote, { exact: true })).toBeVisible();
  await expect(details).toContainText('Observed');
  await expect(dialog.getByText('Connected', { exact: true })).toHaveCount(0);
});

test('setup action names clipboard handoff explicitly and performs no connection probe', async ({ page }) => {
  const dialog = await openConnections(page);
  await expect(dialog.getByRole('button', { name: 'Check setup', exact: true })).toHaveCount(0);
  await expect(dialog.getByText(/Paste.*Codex|Codex.*paste/i)).toBeVisible();
  await dialog.getByRole('button', { name: 'Copy setup request', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Setup request copied', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__connectionsClipboard)).toContain('Fixture setup for codex');
  expect(page.__connections.requests).toEqual([{ assistant: 'codex' }]);
  expect(page.__connections.saves).toEqual([]);
});
