import { test, expect } from '@playwright/test';

const installCommand = 'npx skills@latest add ahmedaldhraif/tawdheef --skill tawdheef';
const quickStart = 'npm run setup -- --browser\nnpm run agent -- codex --browser\nnpm start';
const guideSlugs = ['use-the-skill', 'connect-your-agent', 'connect-your-cv', 'use-directory-packs', 'apply-to-jobs', 'replies-and-reports', 'troubleshoot', 'for-agents'];

async function captureClipboard(page) {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async text => { window.__copied = text; } },
  }));
}

test('Skills is a canonical overview while six legacy setup aliases retain anchors', async ({ page, request }) => {
  const overview = await request.get('/skills/', { maxRedirects: 0 });
  expect(overview.status()).toBe(200);
  expect(overview.headers().location).toBeUndefined();
  for (const path of ['/skills/tawdheef', '/skills/tawdheef/', '/get-started', '/get-started/', '/guides/get-started', '/guides/get-started/']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(301);
    expect(response.headers().location, path).toBe('/guides/use-the-skill/');
  }
  await page.goto('/skills/');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.tawdheef.com/skills/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Find matching jobs\.\s*Build career profiles\./);
  const cards = page.locator('.skills-guide-card');
  await expect(cards).toHaveCount(8);
  expect((await cards.evaluateAll(links => links.map(link => link.getAttribute('href')))).sort())
    .toEqual(guideSlugs.map(slug => `/guides/${slug}/`).sort());
  await expect(page.locator('.skills-setup-steps>li>h3')).toHaveText(['Set up the app','Create or connect your CV','Choose companies. Run.']);
  await expect(page.locator('.skills-skill-only')).not.toHaveAttribute('open');
  await page.goto('/skills/#create-or-connect-cv');
  await expect(page.locator('#create-or-connect-cv')).toBeInViewport();
  await expect(page.locator('.skills-cv-brand img')).toHaveAttribute('src','/brands/tabbio-wordmark-violet-original.svg');
  expect(await page.locator('.skills-cv-brand img').evaluate(image=>image.getBoundingClientRect().top)).toBeGreaterThan(72);
  await expect(page.locator('.skills-cv-actions').getByRole('link',{name:'Create your free CV',exact:true})).toHaveAttribute('href',/^https:\/\/app\.tabbio\.com/);
  await expect(page.locator('.skills-cv-actions').getByRole('link',{name:'Connect your CV',exact:true})).toHaveAttribute('href','/guides/use-the-skill/#cv');
  await page.goto('/skills/tawdheef/#install');
  await expect(page).toHaveURL(/\/guides\/use-the-skill\/#install$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set up Tawdheef with your agent');
  const mark = page.locator('.guide-title-row img');
  await expect(mark).toHaveAttribute('src', '/brand/mark.svg');
  expect(await mark.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  for (const id of ['install', 'agent', 'cv', 'use', 'workflow', 'prompts', 'permissions', 'privacy']) {
    await expect(page.locator('#' + id)).toHaveCount(1);
  }
  await page.goto('/get-started/#cv');
  await expect(page).toHaveURL(/\/guides\/use-the-skill\/#cv$/);
});

test('homepage exposes the CLI and sends setup to the Skills quick start', async ({ page }) => {
  await captureClipboard(page);
  await page.goto('/welcome/');
  await expect(page.locator('#walkthrough [role=tablist]')).toHaveCount(0);
  await expect(page.locator('#walkthrough img')).toHaveCount(1);
  await expect(page.locator('.desktop-navigation').getByRole('link', { name: 'Skills', exact: true })).toHaveAttribute('href', '/skills/');
  await expect(page.locator('#quick-cli')).toBeVisible();
  await expect(page.locator('#quick-cli').locator('xpath=ancestor::details')).toHaveCount(0);
  await page.locator('#quick-setup [data-copy]').click();
  expect(await page.evaluate(() => window.__copied)).toBe(quickStart);
  await page.getByRole('link', { name: 'Set up with your agent', exact: true }).click();
  await expect(page).toHaveURL(/\/skills\/#get-started$/);
  await expect(page.locator('#get-started')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download the app', exact: true })).toHaveAttribute('href', /github.com\/ahmedaldhraif\/tawdheef\/releases\/download\/v[\d.]+\/tawdheef-[\d.]+-source.zip$/);
});

test('Skills copies the install command and all three setup commands exactly', async ({ page }) => {
  await captureClipboard(page);
  await page.goto('/skills/');
  await page.locator('.skills-skill-only summary').click();
  await page.locator('[data-copy="skills-install"]').click();
  expect(await page.evaluate(() => window.__copied)).toBe(installCommand);
  await expect(page.locator('[data-copy="skills-install"]')).toHaveText('Copied');
  await page.locator('[data-copy="skills-quick-cli"]').click();
  expect(await page.evaluate(() => window.__copied)).toBe(quickStart);
  await expect(page.locator('#copy-status')).toHaveText('Copied to clipboard');
});

test('guide search filters actual content, handles empty results and returns focus', async ({ page }) => {
  await page.goto('/skills/');
  const trigger = page.locator('.docs-search-trigger');
  const dialog = page.getByRole('dialog', { name: 'Search skills and guides' });
  const input = page.getByRole('searchbox', { name: 'Search skills and guides' });
  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(input).toBeFocused();
  await input.fill('tracked application threads');
  const results = dialog.locator('[data-docs-search]:visible');
  await expect(dialog.locator('a[href="/guides/replies-and-reports/"]')).toBeVisible();
  expect(await results.count()).toBeLessThan(9);
  expect(await results.evaluateAll(links => links.every(link => link.dataset.docsSearch.toLowerCase().includes('tracked application threads')))).toBe(true);
  await input.press('ArrowDown');
  await expect(results.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(dialog).toBeVisible();
  await expect(input).toHaveValue('');
  await input.fill('no-such-guide-734921');
  await expect(dialog.locator('[data-docs-search]:visible')).toHaveCount(0);
  await expect(page.locator('#docs-search-empty')).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('color theme choice survives reload in both directions', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/skills/');
  await expect(page.locator('html')).toHaveAttribute('data-docs-theme', 'light');
  await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-docs-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-docs-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-docs-theme', 'light');
});

test('390px Skills navigation works and long commands scroll inside the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/skills/');
  const menu = page.getByRole('button', { name: 'Menu', exact: true });
  const navigation = page.locator('#docs-navigation');
  await expect(navigation).not.toBeVisible();
  await menu.click();
  await expect(navigation).toBeVisible();
  await expect(navigation.locator('a[href^="/guides/"]').filter({ hasNotText: 'All guides' })).toHaveCount(8);
  await navigation.getByRole('link', { name: 'Install and set up', exact: true }).click();
  await expect(page).toHaveURL(/\/guides\/use-the-skill\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Set up Tawdheef with your agent');
  await page.goto('/skills/');
  await expect(page.locator('.skills-guide-card')).toHaveCount(8);
  await page.locator('.skills-skill-only summary').click();
  for (const id of ['skills-install', 'skills-quick-cli']) {
    const code = page.locator('#' + id);
    const metrics = await code.evaluate(element => {
      const rect = element.getBoundingClientRect();
      element.scrollLeft = element.scrollWidth;
      return { left: rect.left, right: rect.right, scrollLeft: element.scrollLeft, overflowX: getComputedStyle(element).overflowX };
    });
    expect(metrics.left).toBeGreaterThanOrEqual(0);
    expect(metrics.right).toBeLessThanOrEqual(391);
    expect(metrics.overflowX).toBe('auto');
    if (id === 'skills-install') expect(metrics.scrollLeft).toBeGreaterThan(0);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});
