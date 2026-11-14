import { test, expect } from '@playwright/test';

async function fixture(page, { failFirst = false, holdFirst = false } = {}) {
  let run = {
    id: 'polling-fixture', directoryId: 'uae', directoryName: 'UAE', managed: true,
    assistant: 'codex', total: 42, completed: 7, appliedCount: 0,
    activeCompanyId: 'polling-company', currentName: 'Polling company', status: 'running',
    targets: [{ companyId: 'polling-company', name: 'Polling company', status: 'working' }],
  };
  let reads = 0, bootstraps = 0, release;
  const held = holdFirst ? new Promise(resolve => { release = resolve; }) : null;
  await page.addInitScript(() => {
    window.__pollingDocumentHidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__pollingDocumentHidden });
  });
  await page.route('**/api/bootstrap', async route => {
    bootstraps++;
    const response = await route.fetch();
    const body = await response.json();
    const { targets, ...summary } = run;
    await route.fulfill({ json: { ...body, runs: [summary] } });
  });
  await page.route('**/api/runs/polling-fixture', async route => {
    const attempt = ++reads;
    const snapshot = { ...run };
    if (attempt === 1 && held) await held;
    if (attempt === 1 && failFirst) return route.fulfill({ status: 503, json: { error: 'Progress is temporarily unavailable.' } });
    return route.fulfill({ json: snapshot });
  });
  await page.route('**/api/runs/polling-fixture/stop', route => {
    run = { ...run, status: 'cancelled', activeCompanyId: null };
    return route.fulfill({ json: run });
  });
  // No real assistant or provider action can start in this fixture.
  await page.route('**/api/run', route => route.fulfill({ status: 409, json: { error: 'Only fixture runs are allowed.' } }));
  await page.clock.install();
  await page.goto('/');
  await expect(page.locator('.run-banner')).toBeVisible();
  await expect.poll(() => reads).toBe(1);
  return {
    reads: () => reads, bootstraps: () => bootstraps,
    update: patch => { run = { ...run, ...patch }; },
    release: () => release?.(),
  };
}

async function visibility(page, hidden) {
  await page.evaluate(value => {
    window.__pollingDocumentHidden = value;
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test.beforeEach(async ({ page }) => {
  page.__pollingErrors = [];
  page.on('pageerror', error => page.__pollingErrors.push(error.message));
  await page.route('**/*', route => ['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
});
test.afterEach(async ({ page }) => expect(page.__pollingErrors).toEqual([]));

test('banner and dialog share one run reader, pause when hidden and catch up immediately on return', async ({ page }) => {
  const run = await fixture(page);
  const banner = page.locator('.run-banner');
  await banner.getByRole('button', { name: 'View progress', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Run progress', exact: true });
  await expect(dialog).toContainText('7 of 42 companies checked');
  expect(run.reads()).toBe(1);
  run.update({ completed: 8 });
  await page.clock.runFor(2100);
  await expect.poll(run.reads).toBe(2);
  await expect(banner).toContainText('8 of 42 checked');
  await expect(dialog).toContainText('8 of 42 companies checked');
  expect(run.bootstraps()).toBe(1);

  await visibility(page, true);
  run.update({ completed: 12 }); // The server's queue progresses independently of this hidden page.
  await page.clock.runFor(6500);
  expect(run.reads()).toBe(2);
  expect(run.bootstraps()).toBe(1);
  await visibility(page, false);
  await expect.poll(run.reads).toBe(3);
  await expect(banner).toContainText('12 of 42 checked');
  await expect(dialog).toContainText('12 of 42 companies checked');

  run.update({ status: 'completed', completed: 42, activeCompanyId: null });
  await page.clock.runFor(2100);
  await expect(dialog).toContainText('Finished this pass');
  await expect(banner).toContainText('Run completed');
  const completedReads = run.reads();
  await page.clock.runFor(6500);
  expect(run.reads()).toBe(completedReads);
});

test('a failed progress read retries and clears its error after recovery', async ({ page }) => {
  const run = await fixture(page, { failFirst: true });
  await page.locator('.run-banner').getByRole('button', { name: 'View progress', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Run progress', exact: true });
  await expect(dialog.getByRole('alert')).toHaveText('Progress is temporarily unavailable.');
  run.update({ completed: 9 });
  await page.clock.runFor(2100);
  await expect.poll(run.reads).toBe(2);
  await expect(dialog).toContainText('9 of 42 companies checked');
  await expect(dialog.getByRole('alert')).toHaveCount(0);
});

test('slow reads never overlap and a late response cannot undo Stop', async ({ page }) => {
  const run = await fixture(page, { holdFirst: true });
  await page.locator('.run-banner').getByRole('button', { name: 'View progress', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Run progress', exact: true });
  await page.clock.runFor(6500);
  expect(run.reads()).toBe(1);
  await dialog.getByRole('button', { name: 'Stop run', exact: true }).click();
  await expect(dialog).toContainText('Run stopped');
  await expect(page.locator('.run-banner')).toContainText('Run cancelled');
  run.release();
  await page.clock.runFor(2100);
  await expect(dialog).toContainText('Run stopped');
  await expect(page.locator('.run-banner')).toContainText('Run cancelled');
  expect(run.reads()).toBe(1);
});
