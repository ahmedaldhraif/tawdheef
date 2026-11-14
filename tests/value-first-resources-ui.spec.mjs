import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ui } from '../website/i18n/ui.mjs';

const resources = [
  { slug: '', file: 'README.md' },
  { slug: 'job-search-brief/', file: 'job-search-brief.md' },
];
const sourceFor = (locale, file) => readFileSync(new URL('../docs/' + (locale === 'ar' ? 'i18n/ar/' : '') + 'examples/' + file, import.meta.url), 'utf8').replaceAll('\r\n', '\n');

for (const locale of ['en', 'ar']) for (const resource of resources) for (const colorScheme of ['light', 'dark']) {
  test(`${locale} ${resource.file} is readable and copies its real source in ${colorScheme}`, async ({ page }) => {
    const markdown = sourceFor(locale, resource.file);
    const title = markdown.match(/^# (.+)$/m)[1];
    const request = markdown.match(/```text\n([\s\S]*?)\n```/)[1];
    const path = (locale === 'ar' ? '/ar' : '') + '/examples/' + resource.slug;
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async value => { window.__resourceCopied = value; } },
    }));
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('html')).toHaveAttribute('data-docs-theme', colorScheme);
    await expect(page.locator('main h1')).toHaveText(title);
    await expect(page.locator('main .guide-code code')).toHaveText(request);
    await expect(page.locator('main .guide-code pre')).toHaveAttribute('dir', 'auto');
    for (const element of ['.guide-code', '.guide-code pre', '.guide-code code']) {
      await expect(page.locator('main ' + element)).toHaveCSS('direction', locale === 'ar' ? 'rtl' : 'ltr');
    }
    await expect(page.locator('main .guide-code pre')).toHaveCSS('text-align', 'start');
    await expect(page.locator('main .guide-code code')).toHaveCSS('text-align', 'start');
    await expect(page.locator('main .guide-code .copy')).toHaveAttribute('aria-label', resource.slug ? (locale === 'ar' ? 'انسخ ملخص البحث عن عمل' : 'Copy job-search brief') : (locale === 'ar' ? 'انسخ طلب البحث' : 'Copy research request'));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.tawdheef.com' + path);
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', 'https://www.tawdheef.com/examples/' + resource.slug);
    await expect(page.locator('link[rel="alternate"][hreflang="ar"]')).toHaveAttribute('href', 'https://www.tawdheef.com/ar/examples/' + resource.slug);
    await expect(page.locator('main a[href^="../"], main a[href^="./"], main a[href^="/docs/"]')).toHaveCount(0);
    await expect(page.locator('main .guide-source a').first()).toHaveAttribute('href', 'https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/' + (locale === 'ar' ? 'i18n/ar/' : '') + 'examples/' + resource.file);

    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      expect(await page.locator('main .guide-code pre').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      const copy = page.locator('main .guide-code .copy');
      await copy.scrollIntoViewIfNeeded();
      const bounds = await copy.boundingBox();
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.width).toBeGreaterThanOrEqual(44);
    }
    const copy = page.locator('main .guide-code .copy');
    await copy.click();
    await expect(copy).toHaveText(ui[locale].copied);
    expect(await page.evaluate(() => window.__resourceCopied)).toBe(request);
    await expect(page.locator('#copy-status')).toHaveText(ui[locale].copiedStatus);
  });
}

test('public research language changes retain shared section anchors', async ({ page }) => {
  await page.goto('/examples/#research-request');
  await page.getByRole('navigation', { name: 'Language', exact: true }).getByRole('link', { name: 'العربية', exact: true }).click();
  await expect(page).toHaveURL(/\/ar\/examples\/#research-request$/);
  await expect(page.locator('#research-request')).toBeVisible();
  await page.getByRole('navigation', { name: 'اللغة', exact: true }).getByRole('link', { name: 'English', exact: true }).click();
  await expect(page).toHaveURL(/\/examples\/#research-request$/);
  await expect(page.locator('#research-request')).toBeVisible();
});

test('resource continuations use native examples and canonical locale guides', async ({ page }) => {
  for (const locale of ['en', 'ar']) {
    const prefix = locale === 'ar' ? '/ar' : '';
    await page.goto(prefix + '/examples/');
    const body = page.locator('main .guide-body');
    await expect(body.locator(`a[href="${prefix}/examples/job-search-brief/"]`)).toHaveCount(1);
    await expect(body.locator(`a[href="${prefix}/guides/connect-your-cv/"]`)).toHaveCount(1);
    await expect(body.locator(`a[href="${prefix}/guides/use-directory-packs/"]`)).toHaveCount(1);
    await body.locator(`a[href="${prefix}/examples/job-search-brief/"]`).click();
    await expect(page).toHaveURL(new RegExp(prefix + '/examples/job-search-brief/$'));
    await expect(page.locator(`main .guide-body a[href="${prefix}/examples/"]`)).toHaveCount(1);
    await expect(page.locator('main .guide-body')).toContainText(locale === 'ar' ? 'ملاحظاتك' : 'private');
  }
});

for (const locale of ['en', 'ar']) {
  const prefix = locale === 'ar' ? '/ar' : '';
  test(`${locale} homepage offers public company research before setup and CV connection`, async ({ page }) => {
    await page.goto(locale === 'ar' ? '/welcome/ar/' : '/welcome/');
    expect(await page.evaluate(() => {
      const packs = document.querySelector('#directories');
      const setup = document.querySelector('#how-it-works');
      const cv = document.querySelector('#tabbio');
      return Boolean((packs.compareDocumentPosition(setup) & Node.DOCUMENT_POSITION_FOLLOWING) && (setup.compareDocumentPosition(cv) & Node.DOCUMENT_POSITION_FOLLOWING));
    })).toBe(true);
    await expect(page.locator('.hero .actions .button')).toHaveAttribute('href', prefix + '/skills/#get-started');
    await expect(page.locator('#directories .directory-row')).toHaveCount(6);
    await expect(page.locator('#directories a[href*="tabbio"]')).toHaveCount(0);
    await expect(page.locator('#how-it-works .agent-install-demo')).toHaveCount(1);
    await page.locator(`#directories a[href="${prefix}/examples/"]`).click();
    await expect(page).toHaveURL(new RegExp(prefix + '/examples/$'));
    await expect(page.locator('main input, main form')).toHaveCount(0);
  });

  test(`${locale} setup explains the CV requirement before download and search finds public research`, async ({ page }) => {
    await page.goto(prefix + '/skills/#get-started');
    const requirement = page.locator('.skills-requirements');
    await expect(requirement).toContainText('Tabbio');
    await expect(requirement).toContainText('Run');
    expect(await page.evaluate(() => Boolean(document.querySelector('.skills-requirements').compareDocumentPosition(document.querySelector('.skills-start-actions')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    await expect(requirement.locator(`a[href="${prefix}/examples/"]`)).toHaveCount(1);
    await expect(page.locator('.skills-guide-card')).toHaveCount(8);
    await page.getByRole('button', { name: ui[locale].searchTitle, exact: true }).click();
    await page.locator('#docs-search-input').fill(locale === 'ar' ? 'قبل تثبيت' : 'before installing');
    const result = page.locator(`#docs-search a[href="${prefix}/examples/"]`);
    await expect(result).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(new RegExp(prefix + '/examples/$'));
    await expect(page.locator('main .guide-code')).toHaveCount(1);
  });
}

test('directory hub leads to public company research before import setup', async ({ page }) => {
  await page.goto('/directories/');
  const research = page.locator('.pack-list').getByRole('link', { name: 'Research companies before setup', exact: true });
  await expect(research).toHaveAttribute('href', '/examples/');
  expect(await research.evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector('#how-packs-work')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await research.click();
  await expect(page).toHaveURL(/\/examples\/$/);
  await expect(page.locator('main .guide-code')).toHaveCount(1);
});

test('country packs lead into public research while preserving agent and CV continuations', async ({ page }) => {
  for (const pack of ['bahrain', 'kuwait', 'oman', 'qatar', 'saudi-arabia', 'uae-expanded']) {
    await page.goto('/directories/' + pack + '/');
    const section = page.locator('main section').filter({ has: page.getByRole('heading', { name: 'For your agent', exact: true }) });
    const links = section.locator('p').last().locator('a');
    await expect(links.nth(0)).toHaveText('Try public research');
    await expect(links.nth(0)).toHaveAttribute('href', '/examples/#research-request');
    await expect(links.nth(1)).toHaveAttribute('href', 'https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/AGENT-DIRECTORIES.md');
    await expect(links.nth(2)).toHaveAttribute('href', '/guides/use-the-skill/#cv');
  }
  await page.locator('main a[href="/examples/#research-request"]').click();
  await expect(page).toHaveURL(/\/examples\/#research-request$/);
  await expect(page.locator('#research-request')).toBeVisible();
});

for (const locale of ['en', 'ar']) for (const alias of ['skills/tawdheef', 'get-started', 'guides/get-started']) {
  test(`${locale} ${alias} static fallback retains its language and canonical setup destination`, () => {
    const prefix = locale === 'ar' ? '/ar' : '';
    const target = prefix + '/guides/use-the-skill/';
    const html = readFileSync(new URL('../public' + prefix + '/' + alias + '/index.html', import.meta.url), 'utf8');
    expect(html).toMatch(new RegExp('<html\\b[^>]*lang=["\']' + locale + '["\']'));
    expect(html).toMatch(new RegExp('<html\\b[^>]*dir=["\']' + (locale === 'ar' ? 'rtl' : 'ltr') + '["\']'));
    expect(html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1]).toBe('https://www.tawdheef.com' + target);
    expect(html.match(/<meta\b[^>]*http-equiv=["']refresh["'][^>]*content=["']([^"']+)["']/i)?.[1].replaceAll(' ', '')).toBe('0;url=' + target);
    expect(html).toMatch(/<meta\b[^>]*name=["']robots["'][^>]*content=["']noindex,follow["']/i);
    expect(html).toContain('href="' + target + '"');
  });
}
