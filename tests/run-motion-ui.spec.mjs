import { test, expect } from '@playwright/test';

async function openRunFixture(page, overrides = {}) {
  let run = {
    id: 'motion-fixture', directoryId: 'uae', directoryName: 'UAE', managed: true,
    assistant: 'codex', total: 42, completed: 7, appliedCount: 3,
    activeCompanyId: 'motion-company', currentName: 'Example company', status: 'running',
    ...overrides,
  };
  await page.route('**/api/bootstrap', async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.runs = [run];
    await route.fulfill({ json: body });
  });
  await page.route('**/api/runs/motion-fixture', route => route.fulfill({ json: run }));
  await page.route('**/api/runs/motion-fixture/stop', route => {
    run = { ...run, status: 'cancelled', activeCompanyId: null };
    return route.fulfill({ json: run });
  });
  await page.goto('/');
  await expect(page.locator('.run-banner')).toBeVisible();
  return value => { run = { ...run, ...value }; };
}

const runningAnimations = locator => locator.evaluate(element => element.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length);

test.beforeEach(async ({ page }) => {
  page.__motionErrors = [];
  page.on('pageerror', error => page.__motionErrors.push(error.message));
  await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => expect(page.__motionErrors).toEqual([]));

test('run activity uses real owned work, remains stationary and stops immediately on Stop', async ({ page }, testInfo) => {
  await openRunFixture(page);
  const banner = page.locator('.run-banner');
  const mark = banner.locator('.run-activity-mark');
  await expect(banner).toContainText('Example company');
  await expect(banner).toContainText('7 of 42 checked');
  await expect(mark).toHaveAttribute('aria-hidden', 'true');
  await expect(mark).toHaveCSS('pointer-events', 'none');
  await expect(mark).toHaveCSS('color', 'rgb(37, 37, 37)');
  await expect.poll(() => runningAnimations(mark)).toBeGreaterThan(0);
  // The fixed mark and information retain their geometry while only a sheen moves.
  const before = await mark.boundingBox();
  await page.waitForTimeout(180);
  expect(await mark.boundingBox()).toEqual(before);
  await expect(page.locator('.tawdheef-brand .tawdheef-mark')).toHaveCSS('fill', 'rgb(90, 42, 255)');
  expect(await runningAnimations(page.locator('.tawdheef-brand .tawdheef-mark'))).toBe(0);
  await banner.getByRole('button', { name: 'View progress', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Run progress', exact: true });
  await expect(dialog).toContainText('3 with confirmed submissions');
  await expect.poll(() => runningAnimations(dialog.locator('.run-activity-mark'))).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('working-mark.png') });
  await dialog.getByRole('button', { name: 'Stop run', exact: true }).click();
  await expect(dialog).toContainText('Run stopped');
  await expect(dialog.locator('.run-activity-mark')).toHaveAttribute('data-active', 'false');
  expect(await runningAnimations(dialog.locator('.run-activity-mark'))).toBe(0);
});

test('queued and completed runs remain static and hidden documents stop the work sheen', async ({ page }) => {
  await page.addInitScript(() => {
    window.__motionDocumentHidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__motionDocumentHidden });
  });
  const setRun = await openRunFixture(page, { activeCompanyId: null, currentName: '' });
  let mark = page.locator('.run-banner .run-activity-mark');
  await expect(mark).toHaveAttribute('data-active', 'false');
  expect(await runningAnimations(mark)).toBe(0);
  setRun({ activeCompanyId: 'motion-company', currentName: 'Example company' });
  await page.reload();
  mark = page.locator('.run-banner .run-activity-mark');
  await expect.poll(() => runningAnimations(mark)).toBeGreaterThan(0);
  await page.evaluate(() => { window.__motionDocumentHidden = true; document.dispatchEvent(new Event('visibilitychange')); });
  await expect(mark).toHaveAttribute('data-visible', 'false');
  expect(await runningAnimations(mark)).toBe(0);
  await page.evaluate(() => { window.__motionDocumentHidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => runningAnimations(mark)).toBeGreaterThan(0);
  setRun({ status: 'completed', activeCompanyId: null, completed: 42 });
  await page.reload();
  await expect(mark).toHaveAttribute('data-active', 'false');
  expect(await runningAnimations(mark)).toBe(0);
});

test('reduced motion and forced colors keep the owned-work indicator static and legible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRunFixture(page);
  const mark = page.locator('.run-banner .run-activity-mark');
  await expect(mark).toHaveAttribute('data-active', 'true');
  expect(await runningAnimations(mark)).toBe(0);
  await expect(page.locator('.run-banner')).toContainText('Example company');
  await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' });
  await expect(mark.locator('.run-activity-sheen')).toHaveCSS('display', 'none');
  expect(await runningAnimations(mark)).toBe(0);
  await expect(page.locator('.run-banner').getByRole('button', { name: 'Stop', exact: true })).toBeVisible();
});
