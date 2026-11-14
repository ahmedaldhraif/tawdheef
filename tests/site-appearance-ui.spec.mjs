import { test, expect } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { ui } from '../website/i18n/ui.mjs';

const config = JSON.parse(readFileSync(new URL('../website/config.json', import.meta.url), 'utf8'));
const guides = JSON.parse(readFileSync(new URL('../website/guides.json', import.meta.url), 'utf8'));
const catalog = JSON.parse(readFileSync(new URL('../directories/catalog.json', import.meta.url), 'utf8'));
// Match the SEO check's route formula without requiring an untracked site-dist
// build during collection. The browser CI job only builds the local app.
const expectedPaths = new Set(['/', '/skills/', '/guides/', '/about/', '/directories/', '/policies/', '/directories/uae/', '/ar/', '/ar/skills/', '/ar/guides/']);
for (const guide of guides) for (const prefix of ['', '/ar']) expectedPaths.add(`${prefix}/guides/${guide.slug}/`);
for (const pack of catalog.packs.filter(pack => pack.featured !== false && !pack.historical)) expectedPaths.add(`/directories/${pack.id}/`);
const canonicalPaths = [...expectedPaths];
const localPath = path => path === '/' ? '/welcome/' : path === '/ar/' ? '/welcome/ar/' : path;
const themeKey = 'tawdheef-docs-theme';

test.beforeAll(() => {
  expect(canonicalPaths).toHaveLength(32);
  const sitemapPath = new URL('../site-dist/sitemap.xml', import.meta.url);
  if (!existsSync(sitemapPath)) return;
  const sitemap = readFileSync(sitemapPath, 'utf8');
  const generated = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, value]) => {
    const url = new URL(value);
    expect(url.origin).toBe(new URL(config.domain).origin);
    return url.pathname;
  });
  expect(generated.length).toBe(new Set(generated).size);
  expect(generated.sort()).toEqual([...canonicalPaths].sort());
});

function collectErrors(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function expectTheme(page, theme) {
  await expect(page.locator('html')).toHaveAttribute('data-docs-theme', theme);
  // Check the painted canvas as well as the preference attribute: a dark label
  // on an unchanged white page would otherwise pass a theme-state-only test.
  const brightness = () => page.evaluate(() => {
    const style = getComputedStyle(document.body);
    const color = /rgba\([^)]*,\s*0\)/.test(style.backgroundColor)
      ? getComputedStyle(document.documentElement).backgroundColor : style.backgroundColor;
    const values = (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    return values.reduce((sum, value, index) => sum + value / 255 * [0.2126, 0.7152, 0.0722][index], 0);
  });
  if (theme === 'dark') await expect.poll(brightness, 'Dark canvas is painted').toBeLessThan(0.3);
  else await expect.poll(brightness, 'Light canvas is painted').toBeGreaterThan(0.8);
}

async function changeTheme(page, theme, locale = 'en') {
  const name = theme === 'dark' ? ui[locale].switchDark : ui[locale].switchLight;
  await page.getByRole('button', { name, exact: true }).click();
  await expectTheme(page, theme);
}

for (const colorScheme of ['light', 'dark']) {
  test(`device ${colorScheme} is the default across landing, Skills and guides`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    const errors = collectErrors(page);
    for (const path of ['/welcome/', '/welcome/ar/', '/skills/', '/ar/skills/', '/guides/connect-your-cv/', '/ar/guides/connect-your-cv/']) {
      await page.goto(path);
      await expectTheme(page, colorScheme);
      expect(await page.evaluate(key => localStorage.getItem(key), themeKey)).toBeNull();
    }
    expect(errors).toEqual([]);
  });
}

test('device changes apply live until an explicit choice, and reset restores device following', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/welcome/');
  await expectTheme(page, 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectTheme(page, 'dark');
  await changeTheme(page, 'light');
  expect(await page.evaluate(key => localStorage.getItem(key), themeKey)).toBe('light');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expectTheme(page, 'light');

  for (const path of ['/skills/', '/guides/use-the-skill/', '/welcome/ar/']) {
    await page.goto(path);
    await expectTheme(page, 'light');
  }
  await page.getByRole('button', { name: 'استخدم مظهر الجهاز', exact: true }).click();
  await expectTheme(page, 'dark');
  expect(await page.evaluate(key => localStorage.getItem(key), themeKey)).toBeNull();
  await page.emulateMedia({ colorScheme: 'light' });
  await expectTheme(page, 'light');
});

test('an explicit dark choice survives navigation and reload on a light device', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/welcome/');
  await changeTheme(page, 'dark');
  for (const path of ['/skills/', '/guides/connect-your-agent/', '/ar/skills/', '/welcome/']) {
    await page.goto(path);
    await expectTheme(page, 'dark');
  }
  await page.reload();
  await expectTheme(page, 'dark');
  expect(await page.evaluate(key => localStorage.getItem(key), themeKey)).toBe('dark');
});

const languageJourneys = [
  ['/welcome/#how-it-works', '/welcome/ar/#how-it-works'],
  ['/skills/#get-started', '/ar/skills/#get-started'],
  ['/guides/use-the-skill/#cv', '/ar/guides/use-the-skill/#cv'],
];
for (const [english, arabic] of languageJourneys) {
  test(`language navigation retains section and theme from ${english}`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(english);
    await changeTheme(page, 'dark');
    await page.locator('.site-header [data-language-link][lang="ar"]').click();
    await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).hash).toBe(arabic);
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expectTheme(page, 'dark');
    await page.locator('.site-header [data-language-link][lang="en"]').click();
    await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).hash).toBe(english);
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expectTheme(page, 'dark');
    expect(errors).toEqual([]);
  });
}

for (const [path, locale] of [['/welcome/', 'en'], ['/welcome/ar/', 'ar']]) {
  test(`320px landing menu exposes a reachable 44px theme control (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(path);
    await page.getByRole('button', { name: ui[locale].menu, exact: true }).click();
    const menu = page.locator('#mobile-navigation');
    await expect(menu).toBeVisible();
    const toggle = menu.getByRole('button', { name: ui[locale].switchDark, exact: true });
    await expect(toggle).toBeVisible();
    await toggle.scrollIntoViewIfNeeded();
    const hit = await toggle.evaluate(element => {
      const box = element.getBoundingClientRect();
      const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return { width: box.width, height: box.height, left: box.left, right: box.right, bottom: box.bottom, reachable: top === element || element.contains(top) };
    });
    expect(hit.width).toBeGreaterThanOrEqual(44);
    expect(hit.height).toBeGreaterThanOrEqual(44);
    expect(hit.left).toBeGreaterThanOrEqual(0);
    expect(hit.right).toBeLessThanOrEqual(320);
    expect(hit.bottom).toBeLessThanOrEqual(740);
    expect(hit.reachable).toBe(true);
    await toggle.click();
    await expectTheme(page, 'dark');
  });
}

// Readability samples use actual foreground/background colors from the first
// heading and normal paragraph, not snapshots of implementation-specific tokens.
async function mobileMetrics(page, paragraphSelector = 'main p') {
  return page.evaluate(paragraphSelector => {
    const parse = value => {
      const channels = (value.match(/[\d.]+/g) || []).map(Number);
      return [channels[0] || 0, channels[1] || 0, channels[2] || 0, channels[3] ?? 1];
    };
    const over = (front, back) => [0, 1, 2].map(i => front[i] * front[3] + back[i] * (1 - front[3]));
    const luminance = color => color.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
    const background = element => {
      const ancestors = []; for (let node = element; node; node = node.parentElement) ancestors.unshift(node);
      return ancestors.reduce((color, node) => over(parse(getComputedStyle(node).backgroundColor), color), [255, 255, 255]);
    };
    const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
    const samples = ['main h1', paragraphSelector].map(selector => [...document.querySelectorAll(selector)].find(visible)).filter(Boolean).map(element => {
      const style = getComputedStyle(element), bg = background(element), fg = over(parse(style.color), bg);
      const a = luminance(bg), b = luminance(fg), large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && parseInt(style.fontWeight, 10) >= 700);
      return { text: element.textContent.trim().slice(0, 100), ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), minimum: large ? 3 : 4.5 };
    });
    return { width: window.innerWidth, scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), direction: getComputedStyle(document.documentElement).direction, samples };
  }, paragraphSelector);
}

test('standalone brand page follows device appearance at 320px without changing preview controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const errors = collectErrors(page);
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    const response = await page.goto('/brand/');
    expect(response?.status()).toBe(200);
    await expectTheme(page, colorScheme);
    await page.evaluate(() => document.fonts.ready);
    const metrics = await mobileMetrics(page, 'main p.lead');
    expect(metrics.scrollWidth).toBeLessThanOrEqual(320);
    expect(metrics.samples).toHaveLength(2);
    for (const sample of metrics.samples) expect(sample.ratio, `Brand ${colorScheme}: ${sample.text}`).toBeGreaterThanOrEqual(sample.minimum);

    // "Dark" changes the artwork's preview surface, not the site's preference.
    const darkPreview = page.getByRole('group', { name: 'Preview background', exact: true }).getByRole('button', { name: 'Dark', exact: true });
    await darkPreview.click();
    await expect(darkPreview).toHaveAttribute('aria-pressed', 'true');
    await expectTheme(page, colorScheme);
    expect(await page.evaluate(key => localStorage.getItem(key), themeKey)).toBeNull();
  }
  expect(errors).toEqual([]);
});

for (const width of [320, 390]) for (const colorScheme of ['light', 'dark']) {
  test(`all canonical pages fit ${width}px and remain readable in ${colorScheme}`, async ({ page }) => {
    test.setTimeout(180_000);
    expect(canonicalPaths).toHaveLength(32);
    expect(new Set(canonicalPaths).size).toBe(canonicalPaths.length);
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme });
    const errors = collectErrors(page);
    for (const path of canonicalPaths) await test.step(path, async () => {
      const response = await page.goto(localPath(path));
      expect.soft(response?.status(), path).toBe(200);
      await page.evaluate(() => document.fonts.ready);
      const metrics = await mobileMetrics(page);
      expect.soft(metrics.scrollWidth, `${path}: page must not scroll horizontally`).toBeLessThanOrEqual(width);
      expect.soft(metrics.direction, path).toBe(path.startsWith('/ar/') ? 'rtl' : 'ltr');
      expect.soft(metrics.samples.length, `${path}: representative text exists`).toBe(2);
      for (const sample of metrics.samples) expect.soft(sample.ratio, `${path}: contrast for ${JSON.stringify(sample.text)}`).toBeGreaterThanOrEqual(sample.minimum);
      await expectTheme(page, colorScheme);
    });
    expect(errors, 'Canonical page runtime or console errors').toEqual([]);
  });
}

for (const scheme of ['light', 'dark']) {
  test('assistant marks align and UAE PASS stays visible in ' + scheme, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    for (const width of [390, 1440]) for (const path of ['/welcome/', '/welcome/ar/']) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      const marks = await page.locator('.hero .agent-name').evaluateAll(items => items.map(item => {
        const img = item.querySelector('img'), box = img.getBoundingClientRect();
        const text = [...item.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
        const range = document.createRange(); range.selectNodeContents(text);
        const label = range.getBoundingClientRect(), style = getComputedStyle(img);
        return { labelY: label.y, centerY: box.y + box.height / 2, loaded: img.complete && img.naturalWidth > 0, scheme: style.colorScheme, background: style.backgroundColor, shadow: style.boxShadow };
      }));
      expect(marks).toHaveLength(2);
      expect(marks.every(mark => mark.loaded)).toBe(true);
      expect(Math.abs(marks[0].labelY - marks[1].labelY)).toBeLessThan(1);
      expect(Math.abs(marks[0].centerY - marks[1].centerY)).toBeLessThan(1.5);
      expect(marks[0].scheme).toBe(scheme);
      expect(marks[0].background).toBe('rgba(0, 0, 0, 0)');
      expect(marks[0].shadow).toBe('none');
      const uaePass = page.locator('.identity-option img');
      await uaePass.scrollIntoViewIfNeeded();
      expect(await uaePass.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
      await expect(uaePass).toHaveCSS('filter', scheme === 'dark' ? 'brightness(0) invert(1)' : 'none');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  });
}
