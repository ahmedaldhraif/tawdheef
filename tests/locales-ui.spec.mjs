import { test, expect } from '@playwright/test';

const quickStart = 'npm run setup -- --browser\nnpm run agent -- codex --browser\nnpm start';
const installCommand = 'npx skills@latest add ahmedaldhraif/tawdheef --skill tawdheef';
const anchors = {
  'use-the-skill': ['install', 'agent', 'if-you-prefer-the-terminal', 'cv', 'workflow', 'use', 'already-connected-install-just-the-skill', 'prompts', 'permissions', 'privacy'],
  'connect-your-agent': ['connect-this-project', 'manual-project-connection', 'add-browser-tools-when-needed', 'install-just-the-skill', 'expected-result'],
  'connect-your-cv': ['if-you-do-not-have-a-tabbio-cv', 'connect-an-existing-cv', 'keep-the-current-version-available', 'expected-result'],
  'use-directory-packs': ['download-and-import-a-pack', 'ask-your-agent-to-handle-the-steps', 'improve-the-directory', 'expected-result'],
  'apply-to-jobs': ['before-you-start', 'choose-the-work', 'when-a-site-needs-you', 'expected-result'],
  'replies-and-reports': ['check-progress-now', 'add-a-schedule-when-you-want-one', 'expected-result'],
  troubleshoot: ['find-the-blocker', 'the-app-will-not-start', 'the-assistant-is-installed-but-run-cannot-use-it', 'the-cv-is-connected-but-cannot-be-read', 'browser-forms-or-email-are-unavailable', 'a-pack-import-looks-incomplete', 'expected-result'],
  'for-agents': ['establish-the-contract', 'discover-public-packs-first', 'act-within-the-requested-run', 'cv-and-reporting-tools', 'expected-result'],
};

async function captureClipboard(page) {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: async text => { window.__copied = text; } },
  }));
}

async function expectArabic(page) {
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
}

test('landing language switch preserves the current section in both directions', async ({ page }) => {
  await page.goto('/welcome/#how-it-works');
  await page.locator('.site-header .language-switch a[lang="ar"]').click();
  await expect(page).toHaveURL(/\/welcome\/ar\/#how-it-works$/);
  await expectArabic(page);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.tawdheef.com/ar/');
  await expect(page.locator('#how-it-works')).toBeVisible();
  await expect(page.locator('.language-switch a[lang="ar"]')).toHaveAttribute('aria-current', 'page');
  await page.locator('.site-header .language-switch a[lang="en"]').click();
  await expect(page).toHaveURL(/\/welcome\/#how-it-works$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
});

test('Arabic landing keeps copyable skill instructions and a paste-only recording', async ({ page }) => {
  await captureClipboard(page);
  await page.goto('/welcome/ar/');
  const section = page.locator('#how-it-works');
  await expect(section.locator('.workflow')).toHaveCount(0);
  await expect(section.locator('.skills-cv-shortcut')).toHaveCount(0);
  const demo = section.locator('.agent-install-demo');
  const image = demo.locator('[data-demo-gif]');
  await image.scrollIntoViewIfNeeded();
  await expect(image).toHaveAttribute('src', '/site-assets/agent-setup/claude-paste.gif');
  await image.evaluate(element => element.decode());
  expect(await image.evaluate(element => [element.naturalWidth, element.naturalHeight])).toEqual([584, 210]);
  await expect(demo.getByRole('button', { name: 'إيقاف مؤقت', exact: true })).toBeVisible();
  await expect(demo.locator('figcaption span')).toHaveText('الصق الأمر في مساعدك.');
  const cv = page.locator('#tabbio .tabbio-actions');
  await expect(cv.getByRole('link', { name: 'أنشئ سيرتك مجانًا', exact: true })).toHaveAttribute('href', /^https:\/\/app\.tabbio\.com/);
  await expect(cv.getByRole('link', { name: 'اربط سيرتك الذاتية', exact: true })).toHaveAttribute('href', '/ar/guides/use-the-skill/#cv');
  await expect(section.getByRole('link',{name:'جهّز التطبيق',exact:true})).toHaveAttribute('href','/ar/skills/#get-started');
  await expect(page.locator('#quick-cli')).toHaveCSS('direction','ltr');
  await section.locator('[data-copy="quick-cli"]').click();
  expect(await page.evaluate(()=>window.__copied)).toBe(installCommand);
  await expect(page.locator('#copy-status')).toHaveText('تم النسخ إلى الحافظة.');
});

test('Arabic Skills search normalizes hamza and exposes translated search and copy controls', async ({ page }) => {
  await captureClipboard(page);
  await page.goto('/ar/skills/');
  await expectArabic(page);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.tawdheef.com/ar/skills/');
  await expect(page.locator('.skills-guide-card')).toHaveCount(8);
  const install = page.locator('[data-copy="skills-install"]');
  await expect(install).toHaveAccessibleName('نسخ الأمر');
  await install.click();
  expect(await page.evaluate(() => window.__copied)).toBe(installCommand);
  await expect(install).toHaveText('تم النسخ');
  const trigger = page.getByRole('button', { name: 'ابحث في المهارات والأدلة', exact: true });
  const dialog = page.getByRole('dialog', { name: 'ابحث في المهارات والأدلة' });
  const search = page.getByRole('searchbox', { name: 'ابحث في المهارات والأدلة' });
  await trigger.click();
  await expect(search).toBeFocused();
  await search.fill('اعداد');
  await expect(dialog.locator('a[href="/ar/guides/use-the-skill/"]')).toBeVisible();
  await expect(dialog.locator('a[href="/ar/guides/troubleshoot/"]')).toBeVisible();
  await expect(dialog.locator('#docs-search-status')).toContainText('النتائج:');
  const results = dialog.locator('[data-docs-search]:visible');
  expect(await results.count()).toBeGreaterThan(0);
  expect(await results.count()).toBeLessThan(9);
  await expect(dialog.getByRole('button', { name: 'إغلاق البحث' })).toBeVisible();
  await search.fill('لايوجددليل734921');
  await expect(results).toHaveCount(0);
  await expect(page.locator('#docs-search-empty')).toHaveText('لا توجد نتائج. جرّب كلمة أخرى.');
  await expect(page.locator('#docs-search-empty')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

for (const [slug, ids] of Object.entries(anchors)) {
  test(`Arabic guide ${slug} retains its English anchors and translated controls`, async ({ page }) => {
    await page.goto(`/ar/guides/${slug}/`);
    await expectArabic(page);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://www.tawdheef.com/ar/guides/${slug}/`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    for (const id of ids) await expect(page.locator(`.guide-body :is(h2,h3)#${id}`)).toHaveCount(1);
    await expect(page.locator('.guide-body')).not.toContainText(/\{#[a-z]/);
    const copies = page.locator('.guide-body [data-copy]');
    if (['use-the-skill', 'connect-your-agent', 'replies-and-reports', 'troubleshoot', 'for-agents'].includes(slug)) {
      expect(await copies.count()).toBeGreaterThan(0);
    }
    for (const copy of await copies.all()) {
      await expect(copy).toHaveText('نسخ');
      await expect(copy).toHaveAccessibleName(/نسخ/);
    }
    await expect(page.locator('.site-header .language-switch a[lang="en"]')).toHaveAttribute('href', `/guides/${slug}/`);
  });
}

for (const width of [320, 390, 768, 1440]) {
  test(`Arabic landing, Skills and guide fit ${width}px with reachable header controls`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/welcome/ar/', '/ar/skills/', '/ar/guides/use-the-skill/']) {
      await page.goto(path);
      await expectArabic(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(width + 1);
      const language = page.locator('.site-header .language-switch a[lang="en"]');
      await expect(language).toBeVisible();
      const languageBox = await language.boundingBox();
      expect(languageBox.height, path).toBeGreaterThanOrEqual(44);
      expect(languageBox.width, path).toBeGreaterThanOrEqual(44);
      expect(languageBox.x, path).toBeGreaterThanOrEqual(0);
      expect(languageBox.x + languageBox.width, path).toBeLessThanOrEqual(width + 1);
      const menu = page.locator('.site-header :is(.mobile-menu-button,.docs-menu-trigger)');
      if (width <= 768) {
        await expect(menu).toBeVisible();
        const box = await menu.boundingBox();
        expect(box.height, path).toBeGreaterThanOrEqual(44);
        expect(box.width, path).toBeGreaterThanOrEqual(44);
        expect(box.x + box.width, path).toBeLessThanOrEqual(width + 1);
        await menu.click();
        const popover = page.locator(path === '/welcome/ar/' ? '#mobile-navigation' : '#docs-navigation');
        await expect(popover).toBeVisible();
        if (path !== '/welcome/ar/' && width <= 390) {
          await expect(page.locator('.site-header .docs-theme-toggle')).not.toBeVisible();
          await expect(popover.locator('.docs-menu-theme')).toBeVisible();
          expect((await popover.locator('.docs-menu-theme').boundingBox()).height).toBeGreaterThanOrEqual(44);
        }
        await page.keyboard.press('Escape');
        await expect(popover).not.toBeVisible();
      }
    }
  });
}
