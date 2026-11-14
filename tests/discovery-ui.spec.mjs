import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const observedAt = '2026-11-14T08:00:00Z';
const preferences = () => ({ revision: 7, roles: ['Designer'], locations: ['Dubai'], notes: '', criteriaHash: 'fixture-criteria' });
const job = (index, patch = {}) => ({ id: `job-${index}`, title: `Product designer ${index}`, url: `https://careers.example.test/jobs/${index}`, locations: ['Dubai'], companyNames: ['Fixture company'], companyIds: [], provider: 'greenhouse', status: 'open', revision: 1, contentHash: 'fixture-job-hash', changedFields: ['new'], firstSeenAt: observedAt, lastSeenAt: observedAt, lastCompleteAt: observedAt, needsDetail: false, matchState: 'current', decision: 'suitable', assessment: { decision: 'suitable', reason: 'Your recorded design experience supports the required design work.', assessedAt: observedAt, clientReported: true, isCurrent: true }, clientReported: true, ...patch });
const overview = () => ({ new: 21, changed: 1, pending: 21, needsYou: 1, nextStep: 'Sign in to the blocked source in your actual client.', lastCheckAt: observedAt, lastSuccessAt: observedAt, cv: { status: 'reported', id: 'cv-fixture', versionHash: 'current-cv-version' }, preferences: preferences(), sourceProblems: [{ companyId: 'blocked-company', companyName: 'Blocked source fixture', sourceUrl: 'https://careers.example.test/blocked', status: 'error', nextStep: 'Sign in to the blocked source in your actual client.', observedAt }] });

test.beforeEach(async ({ page, request }) => {
  const previous = (await (await request.get('/api/bootstrap')).json()).settings;
  page.__priorSettings = { connectionMode: previous.connectionMode, preferredAssistant: previous.preferredAssistant, language: previous.language };
  await request.patch('/api/settings', { data: { connectionMode: 'native', preferredAssistant: 'claude-code', language: 'en' } });
  const response = await request.post('/api/directories', { data: { name: `Discovery ${test.info().testId}`, flag: '📁' } });
  page.__directory = await response.json();
  await request.post(`/api/directories/${page.__directory.id}/companies`, { data: { records: [{ name: 'Fixture company', type: 'Private company', location: 'Dubai', careersUrl: 'https://careers.example.test/fixture' }] } });
  page.__jobs = Array.from({ length: 21 }, (_, index) => job(index + 1));
  page.__summary = overview(); page.__preferences = preferences(); page.__calls = []; page.__writes = []; page.__errors = []; page.__recipe = null;
  page.on('pageerror', error => page.__errors.push(error.message));
  await page.addInitScript(id => {
    localStorage.setItem('apply-directory', id);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__discoveryClipboard = text; } } });
  }, page.__directory.id);
  await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.route('**/api/discovery/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname.replace('/api/discovery', '');
    page.__calls.push({ path, query: Object.fromEntries(url.searchParams), method: request.method() });
    if (page.__missing && path === '/summary') return route.fulfill({ status: 404, json: { error: 'This action was not found.' } });
    if (page.__serverError && path === '/jobs') return route.fulfill({ status: 503, json: { error: 'Saved jobs are temporarily unavailable.' } });
    if (path === '/summary') return route.fulfill({ json: page.__summary });
    if (path === '/jobs') {
      const start = url.searchParams.get('cursor') ? 20 : 0;
      return route.fulfill({ json: { items: page.__jobs.slice(start, start + 20), total: page.__jobs.length, nextCursor: page.__jobs.length > start + 20 ? 'fixture-page-2' : null, summary: page.__summary, preferences: page.__preferences, cv: page.__summary.cv, sourceProblems: page.__summary.sourceProblems } });
    }
    if (path.startsWith('/jobs/')) {
      const selected = page.__jobs.find(item => item.id === path.split('/').at(-1));
      return route.fulfill({ json: { job: { ...selected, description: '<script>not executable</script> Design customer-facing products.', requirements: ['Design experience'], evidence: 'Client read the exact source URL at the recorded time.' }, assessment: selected.assessment && { ...selected.assessment, assistant: 'claude-code', cvReference: { sourceId: 'actual-source-reference', versionHash: 'assessed-cv-version' }, requirements: [{ kind: 'required', jobQuote: 'Design experience', cvFactRef: 'experience.design.1', relation: 'supports' }] }, matchState: selected.matchState, changedFields: selected.changedFields, nextStep: selected.nextStep, cv: page.__summary.cv, preferences: page.__preferences } });
    }
    if (path === '/preferences') {
      if (request.method() === 'PATCH') {
        const input = request.postDataJSON(); page.__writes.push(input);
        if (page.__conflict) return route.fulfill({ status: 409, json: { error: 'Saved discovery preferences changed.' } });
        page.__preferences = { ...page.__preferences, ...input.patch, revision: input.expectedRevision + 1 };
      }
      return route.fulfill({ json: page.__preferences });
    }
    if (path === '/request') { page.__recipe = Object.fromEntries(url.searchParams); return route.fulfill({ json: { prompt: `Readonly review in ${page.__recipe.assistant} for ${page.__recipe.directoryId}${page.__recipe.jobId ? ` job ${page.__recipe.jobId}` : ''}. No applications authorized.`, readOnly: true, actionsAuthorized: false } }); }
    return route.fulfill({ status: 404, json: { error: 'Unexpected fixture route.' } });
  });
});
test.afterEach(async ({ page, request }) => {
  await request.patch('/api/settings', { data: page.__priorSettings });
  expect(page.__errors).toEqual([]);
});
async function open(page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(page.__directory.name);
  await expect(page.locator('tbody tr:not(.skeleton-row)')).toHaveCount(1);
  const section = page.locator('.discovery-panel').first();
  await section.locator('summary').click();
  await expect(section).toContainText('New 21');
  return section;
}
async function review(page) { const section = await open(page); await section.getByRole('button', { name: 'Review jobs', exact: true }).click(); return page.getByRole('dialog'); }
async function pageWidths(page) {
  return page.evaluate(() => ({
    viewport: innerWidth, document: document.documentElement.scrollWidth, direction: document.documentElement.dir,
    elements: ['.directory-heading', '.directory-heading > div:first-child', '.directory-heading h1', '.discovery-panel', '.modal-backdrop', '.dialog', '.dialog-header'].map(selector => {
      const node = document.querySelector(selector), rect = node?.getBoundingClientRect();
      return { selector, left: rect?.left, right: rect?.right, width: rect?.width, clientWidth: node?.clientWidth, scrollWidth: node?.scrollWidth, font: node && getComputedStyle(node).fontFamily };
    }),
  }));
}

test('job list loads on demand, paginates, keeps old jobs beside a source problem, and returns focus', async ({ page }) => {
  const section = await open(page);
  expect(page.__calls.filter(call => call.path === '/jobs')).toHaveLength(0);
  await expect(section).toContainText('Needs you: Sign in to the blocked source');
  await section.getByRole('button', { name: 'Review jobs', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.discovery-jobs > li')).toHaveCount(20);
  await expect(dialog).toContainText('Blocked source fixture'); await expect(dialog).toContainText('Previous jobs are kept');
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(dialog.locator('.discovery-jobs > li')).toHaveCount(1); await expect(dialog).toContainText('Product designer 21');
  await dialog.getByRole('button', { name: 'Previous', exact: true }).click(); await expect(dialog.locator('.discovery-jobs > li')).toHaveCount(20);
  await expect(dialog.getByRole('list', { name: 'Jobs', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(section.getByRole('button', { name: 'Review jobs', exact: true })).toBeFocused();
  expect(page.__calls.filter(call => call.path === '/jobs').every(call => call.query.assistant === 'claude-code' && call.query.directoryId === page.__directory.id && call.query.limit === '20')).toBe(true);
});

test('job detail keeps stale assessment and original CV provenance, literal source text and read-only handoff', async ({ page }) => {
  page.__jobs = [job(1, { matchState: 'stale', changedFields: ['description'], assessment: { ...job(1).assessment, decision: 'needs_you', isCurrent: false }, nextStep: 'Review the changed requirement against the current CV.' })];
  const dialog = await review(page);
  await expect(dialog).toContainText('Needs review'); await expect(dialog).not.toContainText('Suitable');
  await expect(dialog.locator('.discovery-state')).toHaveText('Needs review');
  await dialog.getByRole('button', { name: 'Product designer 1', exact: true }).click();
  await expect(dialog).toContainText('Previous client assessment');
  await dialog.getByText('Assessment evidence', { exact: true }).click();
  await expect(dialog).toContainText('assessed-cv-version'); await expect(dialog).not.toContainText('current-cv-version');
  await expect(dialog).toContainText('experience.design.1'); await expect(dialog).toContainText('Claude Code');
  await dialog.getByText('Posting details', { exact: true }).click(); await expect(dialog).toContainText('<script>not executable</script>');
  await expect(dialog.getByRole('link', { name: 'Open posting', exact: true })).toHaveAttribute('href', 'https://careers.example.test/jobs/1');
  await dialog.getByRole('button', { name: 'Copy review request', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Review request copied', exact: true })).toBeVisible();
  expect(page.__recipe).toMatchObject({ assistant: 'claude-code', jobId: 'job-1', directoryId: page.__directory.id });
  expect(await page.evaluate(() => window.__discoveryClipboard)).toContain('No applications authorized');
  expect(page.__calls.every(call => call.method === 'GET')).toBe(true);
});

test('unreported CV, incomplete posting and unknown source do not become a guessed match or closure', async ({ page }) => {
  page.__jobs = [job(1, { assessment: null, decision: null, matchState: 'cv_unknown', status: 'unknown' }), job(2, { assessment: null, decision: null, matchState: 'needs_detail' })];
  const dialog = await review(page);
  await expect(dialog).toContainText('CV not reported'); await expect(dialog).toContainText('Details needed');
  await expect(dialog).not.toContainText('Suitable'); await expect(dialog).not.toContainText('Closed'); await expect(dialog).not.toContainText('0%');
  await dialog.getByRole('combobox', { name: 'View', exact: true }).selectOption('needs_you');
  await expect.poll(() => page.__calls.filter(call => call.path === '/jobs').at(-1)?.query.review).toBe('needs_you');
});

test('missing API, a failed read and an empty list stay distinct', async ({ page }) => {
  page.__missing = true;
  let releaseRows, heldRows = false;
  const initialRows = new Promise(resolve => { releaseRows = resolve; });
  await page.route('**/api/companies?*', async route => {
    if (!heldRows && new URL(route.request().url()).searchParams.get('directoryId') === page.__directory.id) {
      heldRows = true; await initialRows;
    }
    return route.continue();
  });
  // Automatic reads keep failing until the actual Retry click is dispatched.
  // Flipping a healthy flag before click() lets a rowsRevision refresh remove
  // the button while Playwright is still checking that it is actionable.
  await page.route('**/api/discovery/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/summary') || path.endsWith('/jobs')) {
      const retried = await route.request().frame().evaluate(key => window.__discoveryRetryClicked?.[key] === true, path);
      if (retried && path.endsWith('/summary')) page.__missing = false;
      if (retried && path.endsWith('/jobs')) page.__serverError = false;
    }
    return route.fallback();
  });
  async function retry(button, path) {
    await button.evaluate((node, key) => node.addEventListener('click', () => {
      window.__discoveryRetryClicked ||= {}; window.__discoveryRetryClicked[key] = true;
    }, { once: true }), path);
    const response = page.waitForResponse(value => new URL(value.url()).pathname === path && value.status() === 200);
    await button.click(); await response;
  }
  try {
    await page.goto('/'); await expect(page.getByRole('heading', { level: 1 })).toContainText(page.__directory.name);
    const section = page.locator('.discovery-panel').first(); await section.locator('summary').click();
    await expect(section.getByRole('alert')).toContainText('Restart Tawdheef');
    const beforeRows = page.__calls.filter(call => call.path === '/summary').length;
    releaseRows(); await expect(page.locator('tbody tr:not(.skeleton-row)')).toHaveCount(1);
    await expect.poll(() => page.__calls.filter(call => call.path === '/summary').length).toBeGreaterThan(beforeRows);
    await expect(section.getByRole('alert')).toContainText('Restart Tawdheef');
    expect(page.__missing).toBe(true);
    await retry(section.getByRole('button', { name: 'Retry', exact: true }), '/api/discovery/summary');
    await expect(section).toContainText('New 21');
    page.__serverError = true; await section.getByRole('button', { name: 'Review jobs', exact: true }).click();
    const dialog = page.getByRole('dialog'); await expect(dialog.getByRole('alert')).toContainText('temporarily unavailable'); await expect(dialog).not.toContainText('No jobs to review yet.');
    page.__jobs = [];
    await retry(dialog.getByRole('button', { name: 'Retry', exact: true }), '/api/discovery/jobs');
    await expect(dialog).toContainText('No jobs to review yet.');
  } finally { releaseRows(); }
});

test('job preference typing is preserved and saves once through a revision-protected explicit patch', async ({ page }) => {
  await open(page); await page.getByRole('button', { name: 'Settings', exact: true }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByText('Job preferences', { exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Roles', exact: true }).fill('Designer,\nResearcher,');
  await expect(dialog.getByRole('textbox', { name: 'Roles', exact: true })).toHaveValue('Designer,\nResearcher,');
  await dialog.getByRole('textbox', { name: 'Job locations', exact: true }).fill('Dubai، Remote');
  await dialog.getByRole('textbox', { name: 'Job notes', exact: true }).fill('Remote roles preferred.');
  expect(page.__writes).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click(); await expect(dialog).toHaveCount(0);
  expect(page.__writes).toEqual([{ expectedRevision: 7, explicit: true, patch: { roles: ['Designer', 'Researcher'], locations: ['Dubai', 'Remote'], notes: 'Remote roles preferred.' } }]);
});

test('a preference conflict preserves the draft and never overwrites the newer revision', async ({ page }) => {
  page.__conflict = true; await open(page); await page.getByRole('button', { name: 'Settings', exact: true }).click(); const dialog = page.getByRole('dialog');
  await dialog.getByText('Job preferences', { exact: true }).click(); await dialog.getByRole('textbox', { name: 'Roles', exact: true }).fill('My unsaved role');
  page.__preferences = { ...preferences(), revision: 8, roles: ['Changed elsewhere'] };
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Preferences changed elsewhere. Your draft is kept.');
  await expect(dialog.getByRole('textbox', { name: 'Roles', exact: true })).toHaveValue('My unsaved role'); expect(page.__writes[0].expectedRevision).toBe(7);
});

test('returning to a visible tab refreshes the current list and hides unsafe posting links', async ({ page }) => {
  page.__jobs = [job(1, { url: 'javascript:alert(1)' })]; const dialog = await review(page);
  await expect(dialog.locator('.discovery-jobs > li')).toHaveCount(1);
  const before = page.__calls.length;
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => page.__calls.length).toBe(before);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => page.__calls.filter(call => call.path === '/jobs').length).toBeGreaterThan(1);
  await dialog.getByRole('button', { name: 'Product designer 1', exact: true }).click(); await expect(dialog.getByRole('link', { name: 'Open posting', exact: true })).toHaveCount(0);
});

test('English and Arabic discovery remain readable at 320 and 1440 with native dialog controls', async ({ page, request }) => {
  await mkdir('outputs/discovery-ui-captures', { recursive: true });
  for (const language of ['en', 'ar']) {
    await request.patch('/api/settings', { data: { language } });
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 960 }); await page.goto('/');
      const section = page.locator('.discovery-panel').first(); await section.locator('summary').click();
      await section.getByRole('button', { name: language === 'ar' ? 'مراجعة الوظائف' : 'Review jobs', exact: true }).click();
      const dialog = page.getByRole('dialog'); await expect(dialog.locator('.discovery-jobs > li')).toHaveCount(20);
      const widths = await pageWidths(page);
      expect(widths.document, JSON.stringify({ language, width, ...widths })).toBeLessThanOrEqual(widths.viewport);
      await page.screenshot({ path: `outputs/discovery-ui-captures/${language}-${width}.png`, fullPage: true });
      await page.keyboard.press('Escape');
    }
  }
});

test('an unbroken directory title wraps without widening the page or hiding dialog controls', async ({ page, request }) => {
  const title = `Discovery ${'M'.repeat(120)}`;
  await page.route('**/api/bootstrap', async route => {
    const response = await route.fetch(), boot = await response.json();
    boot.directories = boot.directories.map(directory => directory.id === page.__directory.id ? { ...directory, name: title } : directory);
    return route.fulfill({ response, json: boot });
  });
  await page.setViewportSize({ width: 320, height: 960 });
  for (const language of ['en', 'ar']) {
    await request.patch('/api/settings', { data: { language } }); await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.locator('tbody tr:not(.skeleton-row)')).toHaveCount(1);
    const widths = await pageWidths(page);
    expect(widths.document, JSON.stringify({ language, ...widths })).toBeLessThanOrEqual(widths.viewport);
    const section = page.locator('.discovery-panel').first(); await section.locator('summary').click();
    await section.getByRole('button', { name: language === 'ar' ? 'مراجعة الوظائف' : 'Review jobs', exact: true }).click();
    const dialog = page.getByRole('dialog'); await expect(dialog.locator('.discovery-jobs > li')).toHaveCount(20);
    const modalWidths = await pageWidths(page), header = modalWidths.elements.find(element => element.selector === '.dialog-header');
    expect(modalWidths.document, JSON.stringify({ language, ...modalWidths })).toBeLessThanOrEqual(modalWidths.viewport);
    expect(header.scrollWidth, JSON.stringify({ language, ...modalWidths })).toBeLessThanOrEqual(header.clientWidth);
    await expect(dialog.getByRole('button', { name: language === 'ar' ? 'إغلاق' : 'Close', exact: true })).toBeInViewport();
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
  }
});

test('company jobs reuse the existing dialog with exact company scope and a read-only fallback', async ({ page }) => {
  await open(page);
  await page.locator('tbody .company-name').click();
  const dialog = page.getByRole('dialog');
  const companySection = dialog.locator('.discovery-panel');
  await companySection.locator('summary').click(); await companySection.getByRole('button', { name: 'Review jobs', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1); await expect(dialog.locator('.discovery-jobs > li')).toHaveCount(20);
  const input = page.__calls.filter(call => call.path === '/jobs').at(-1).query;
  expect(JSON.parse(input.companyIds)).toHaveLength(1); expect(input.directoryId).toBe(page.__directory.id);
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Clipboard unavailable'); }; });
  await dialog.locator('.discovery-inline').getByRole('button', { name: 'Copy review request', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Review request', exact: true })).toContainText('Readonly review in claude-code');
  expect(page.__recipe.companyId).toBe(JSON.parse(input.companyIds)[0]);
  await dialog.locator('.discovery-inline').getByRole('button', { name: 'Back to company', exact: true }).click();
  await expect(companySection.getByRole('button', { name: 'Review jobs', exact: true })).toBeFocused();
});

test('a delayed old review response cannot replace the newly selected view', async ({ page }) => {
  const section = await open(page);
  let release, requested;
  const waiting = new Promise(resolve => { requested = resolve; });
  const delayed = new Promise(resolve => { release = resolve; });
  await page.route('**/api/discovery/jobs?*', async route => {
    if (new URL(route.request().url()).searchParams.get('review') !== 'pending') return route.fallback();
    requested(); await delayed;
    await route.fulfill({ json: { items: [job(91, { title: 'Old delayed view' })], total: 1, nextCursor: null, sourceProblems: [] } });
  });
  await section.getByRole('button', { name: 'Review jobs', exact: true }).click(); await waiting;
  const dialog = page.getByRole('dialog'); await dialog.getByRole('combobox', { name: 'View', exact: true }).selectOption('all');
  await expect(dialog.locator('.discovery-jobs > li')).toHaveCount(20); release();
  await expect.poll(() => page.__calls.some(call => call.query.review === 'all')).toBe(true);
  await expect(dialog).not.toContainText('Old delayed view');
  await dialog.getByRole('button', { name: 'Product designer 1', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Back to jobs', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
});

test('a delayed copy response from the old directory never writes the clipboard or a new scope hint', async ({ page }) => {
  const section = await open(page);
  let release, started;
  const requested = new Promise(resolve => { started = resolve; });
  const delayed = new Promise(resolve => { release = resolve; });
  await page.route('**/api/discovery/request?*', async route => { started(); await delayed; await route.fulfill({ json: { prompt: 'OLD DIRECTORY REQUEST', readOnly: true, actionsAuthorized: false } }); });
  await section.getByRole('button', { name: 'Copy review request', exact: true }).click(); await requested;
  await page.getByRole('tab').filter({ hasText: 'UAE' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('UAE');
  const received = page.waitForResponse(response => new URL(response.url()).pathname === '/api/discovery/request');
  release(); await (await received).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  // Wait for the newly selected scope, rather than a timeout.
  await expect.poll(() => page.__calls.filter(call => call.path === '/summary').at(-1)?.query.directoryId).toBe('uae');
  expect(await page.evaluate(() => window.__discoveryClipboard)).toBeUndefined();
  await expect(page.locator('.discovery-panel').first().getByRole('button', { name: 'Review request copied', exact: true })).toHaveCount(0);
});
