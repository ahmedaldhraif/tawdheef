import { test, expect } from '@playwright/test';

const installCommand = 'npx skills@latest add ahmedaldhraif/tawdheef --skill tawdheef';
const quickStart = 'npm run setup -- --browser\nnpm run agent -- codex --browser\nnpm start';
const guideSlugs = ['use-the-skill', 'connect-your-agent', 'connect-your-cv', 'use-directory-packs', 'apply-to-jobs', 'replies-and-reports', 'troubleshoot', 'for-agents'];

async function captureClipboard(page) {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async text => { window.__copied = text; } },
  }));
}


async function expectPasteDemo(page, request) {
  const section = page.locator('#how-it-works');
  await expect(section.locator('.skills-cv-shortcut')).toHaveCount(0);
  const demo = section.locator('.agent-install-demo');
  const image = demo.locator('[data-demo-gif]');
  await image.scrollIntoViewIfNeeded();
  await expect(image).toHaveAttribute('src', '/site-assets/agent-setup/claude-paste.gif');
  await image.evaluate(element => element.decode());
  expect(await image.evaluate(element => ({ width: element.naturalWidth, height: element.naturalHeight }))).toEqual({ width: 584, height: 210 });
  await expect(demo.locator('button, video')).toHaveCount(0);
  await expect(demo.locator('figcaption')).toHaveText('Paste the command into your agent.');
  await expect(image).toHaveCSS('border-radius', '12px');

  const cv = page.locator('#tabbio .tabbio-actions');
  await expect(cv.getByRole('link', { name: 'Create your free CV', exact: true })).toHaveAttribute('href', /^https:\/\/app\.tabbio\.com/);
  await expect(cv.getByRole('link', { name: 'Connect your CV', exact: true })).toHaveAttribute('href', '/guides/use-the-skill/#cv');
  const poster = await request.get('/site-assets/agent-setup/claude-paste-poster.png');
  expect(poster.status()).toBe(200);
  expect(poster.headers()['content-type']).toMatch(/^image\/png/);
  const media = await request.get('/site-assets/agent-setup/claude-paste.gif');
  expect(media.status()).toBe(200);
  expect(media.headers()['content-type']).toMatch(/^image\/gif/);
  expect((await media.body()).subarray(0, 3).toString()).toBe('GIF');
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
  await expect(page.locator('.skills-hero .skills-cv-shortcut')).toHaveCount(0);
  await page.locator('#create-or-connect-cv').scrollIntoViewIfNeeded();
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

test('homepage copies the skill install command and links to actual app setup', async ({ page, request }) => {
  await captureClipboard(page);
  await page.goto('/welcome/');
  await expect(page.locator('#walkthrough [role=tablist]')).toHaveCount(0);
  await expect(page.locator('#walkthrough img')).toHaveCount(1);
  await expect(page.locator('.desktop-navigation').getByRole('link', { name: 'Skills', exact: true })).toHaveAttribute('href', '/skills/');
  await expect(page.locator('#quick-cli')).toBeVisible();
  await expect(page.locator('#quick-cli').locator('xpath=ancestor::details')).toHaveCount(0);
  await expectPasteDemo(page, request);
  await page.locator('#quick-setup [data-copy]').click();
  expect(await page.evaluate(() => window.__copied)).toBe(installCommand);
  await page.getByRole('link', { name: 'Set up the app', exact: true }).click();
  await expect(page).toHaveURL(/\/skills\/#get-started$/);
  await expect(page.locator('#get-started')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download the app', exact: true })).toHaveAttribute('href', /github.com\/ahmedaldhraif\/tawdheef\/releases\/download\/v[\d.]+\/tawdheef-[\d.]+-source.zip$/);
});

test('real agent GIF runs automatically onscreen and respects visibility and reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/welcome/');
  const demo = page.locator('.agent-install-demo');
  const image = demo.locator('[data-demo-gif]');
  const gif = '/site-assets/agent-setup/claude-paste.gif';
  const poster = '/site-assets/agent-setup/claude-paste-poster.png';
  await expect(demo.locator('button, video')).toHaveCount(0);
  await image.scrollIntoViewIfNeeded();
  await expect(image).toHaveAttribute('src', gif);
  await image.evaluate(element => element.decode());
  expect(await image.evaluate(element => [element.naturalWidth, element.naturalHeight])).toEqual([584, 210]);
  await expect(image).toHaveCSS('border-radius', '12px');

  await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await expect(image).toHaveAttribute('src', poster);
  await image.scrollIntoViewIfNeeded();
  await expect(image).toHaveAttribute('src', gif);
  await page.evaluate(() => {
    const original = Object.getOwnPropertyDescriptor(document, 'hidden');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    try { document.dispatchEvent(new Event('visibilitychange')); }
    finally {
      if (original) Object.defineProperty(document, 'hidden', original);
      else delete document.hidden;
    }
  });
  await expect(image).toHaveAttribute('src', poster);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(image).toHaveAttribute('src', gif);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await image.scrollIntoViewIfNeeded();
  await expect(image).toHaveAttribute('src', poster);
  await image.evaluate(element => element.decode());
  expect(await image.evaluate(element => [element.naturalWidth, element.naturalHeight])).toEqual([584, 210]);
  await expect(demo.locator('button, video')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(image).toHaveAttribute('src', gif);
});

test('Skills copies the install command and all three setup commands exactly', async ({ page }) => {
  await captureClipboard(page);
  await page.goto('/skills/');
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

for (const width of [320, 390]) for (const [locale, path] of [['en', '/welcome/'], ['ar', '/welcome/ar/']]) {
  test('landing GIF fits ' + width + 'px in ' + locale + ' and defaults still with reduced motion', async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path);
    const section = page.locator('#how-it-works');
    await expect(section.locator('.skills-cv-shortcut')).toHaveCount(0);
    const image = section.locator('.agent-demo-image');
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute('src', '/site-assets/agent-setup/claude-paste-poster.png');
    await expect(image).toHaveCSS('border-radius', '12px');
    await expect(section.locator('.agent-install-demo button, .agent-install-demo video')).toHaveCount(0);
    const box = await image.boundingBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await expect(page.locator('#tabbio .tabbio-actions a')).toHaveCount(2);
  });
}

for (const width of [320, 390]) for (const [locale, path] of [['en', '/skills/'], ['ar', '/ar/skills/']]) {
  test('Skills automatic GIF fits ' + width + 'px in ' + locale + ' with no playback controls', async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(path);
    await expect(page.locator('.skills-hero .skills-cv-shortcut')).toHaveCount(0);
    const demo = page.locator('.skills-hero .agent-install-demo');
    const image = demo.locator('[data-demo-gif]');
    await expect(demo.locator('button, video')).toHaveCount(0);
    await expect(demo.locator('figcaption')).toHaveText(locale === 'ar' ? 'الصق الأمر في مساعدك.' : 'Paste the command into your agent.');
    await image.scrollIntoViewIfNeeded();
    await expect(image).toHaveAttribute('src', '/site-assets/agent-setup/claude-paste-poster.png');
    await image.evaluate(element => element.decode());
    expect(await image.evaluate(element => [element.naturalWidth, element.naturalHeight])).toEqual([584, 210]);
    await expect(image).toHaveCSS('border-radius', '12px');

    // The CV actions remain in their dedicated setup step, away from the skill command.
    await expect(page.locator('.skills-cv-brand img')).toHaveAttribute('src', '/brands/tabbio-wordmark-violet-original.svg');
    await expect(page.locator('.skills-cv-actions a')).toHaveCount(2);
    await expect(page.locator('.skills-cv-actions a[href^="https://app.tabbio.com"]')).toHaveCount(1);
    await expect(page.locator('.skills-cv-actions a[href="' + (locale === 'ar' ? '/ar' : '') + '/guides/use-the-skill/#cv"]')).toHaveCount(1);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(image).toHaveAttribute('src', '/site-assets/agent-setup/claude-paste.gif');
    await image.evaluate(element => element.decode());
    expect(await image.evaluate(element => [element.naturalWidth, element.naturalHeight])).toEqual([584, 210]);
    const box = await image.boundingBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.width).toBeLessThanOrEqual(600);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test('website, Skills, brand guide and app footers omit the Tabbio endorsement', async ({ page }) => {
  for (const path of ['/welcome/', '/welcome/ar/', '/skills/', '/ar/skills/', '/guides/connect-your-cv/', '/brand/', '/']) {
    await page.goto(path);
    const footer = page.locator('.site-footer, .guide-footer, .workspace-footer');
    await expect(footer).toHaveCount(1);
    await expect(footer).not.toContainText(/Powered by|بدعم من|Tabbio/i);
    await expect(footer.locator('a[href*="tabbio.com"], img[src*="tabbio"]')).toHaveCount(0);
  }
});
