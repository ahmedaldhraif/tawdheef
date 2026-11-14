/** Offline checks for the generated public site. Reads public files only.
 * Run after building: node scripts/marketing/check-seo.mjs
 * No server, browser, network, tracker database or generated-file writes. */
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const site = join(root, 'site-dist');
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const read = file => readFile(file, 'utf8');
const decode = value => value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (entity, key) => {
  if (key.startsWith('#')) return String.fromCodePoint(key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1)));
  return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[key.toLowerCase()] ?? entity;
});
function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4]);
  }
  return result;
}
const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map(match => attributes(match[0]));
async function walk(folder) {
  const children = await readdir(folder, { withFileTypes: true });
  return (await Promise.all(children.map(entry => {
    const file = join(folder, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Generated site contains a symlink: ${relative(site, file)}`);
    return entry.isDirectory() ? walk(file) : [file];
  }))).flat();
}

try {
  const config = JSON.parse(await read(join(root, 'website/config.json')));
  const domain = new URL(config.domain);
  check(domain.protocol === 'https:' && config.domain === domain.origin, 'config.domain must be a bare HTTPS origin without a trailing slash.');
  const guides = JSON.parse(await read(join(root, 'website/guides.json')));
  const catalog = JSON.parse(await read(join(root, 'directories/catalog.json')));
  // Derive canonical routes from public definitions so new guides/packs
  // cannot silently disappear from a sitemap that still happens to be valid XML.
  const expected = new Set(['/', '/skills/', '/guides/', '/about/', '/directories/', '/policies/', '/directories/uae/', '/ar/', '/ar/skills/', '/ar/guides/', '/examples/', '/examples/job-search-brief/', '/ar/examples/', '/ar/examples/job-search-brief/']);
  for (const guide of guides) for (const prefix of ['', '/ar']) expected.add(`${prefix}/guides/${guide.slug}/`);
  for (const pack of catalog.packs.filter(pack => pack.featured !== false && !pack.historical)) expected.add(`/directories/${pack.id}/`);
  const redirects = new Map();
  for (const line of (await read(join(site, '_redirects'))).split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const [from, to, status] = line.trim().split(/\s+/);
    check(from.startsWith('/') && to?.startsWith('/') && status === '301', `Unexpected static redirect: ${line}`);
    check(!redirects.has(from), `Duplicate redirect: ${from}`);
    redirects.set(from, to);
  }
  const legacy = ['/skills/tawdheef', '/get-started', '/guides/get-started'];
  for (const prefix of ['', '/ar']) for (const path of legacy) for (const suffix of ['', '/']) {
    check(redirects.get(prefix + path + suffix) === prefix + '/guides/use-the-skill/', `Missing legacy 301: ${prefix + path + suffix}`);
  }
  const files = await walk(site);
  const pages = new Map();
  for (const file of files.filter(file => file.endsWith('.html'))) {
    const path = '/' + relative(site, file).split(sep).join('/').replace(/index\.html$/, '');
    const html = await read(file);
    const ids = tags(html, '[a-z][a-z0-9:-]*').map(tag => tag.id).filter(Boolean);
    check(new Set(ids).size === ids.length, `Duplicate HTML IDs: ${path}`);
    pages.set(path, { file, html, ids: new Set(ids), links: tags(html, 'link') });
  }
  async function targetFor(url) {
    let pathname = url.pathname;
    const seen = new Set();
    while (redirects.has(pathname)) {
      if (seen.has(pathname)) throw new Error(`Redirect loop: ${pathname}`);
      seen.add(pathname);
      pathname = new URL(redirects.get(pathname), domain).pathname;
    }
    const file = resolve(site, '.' + decodeURIComponent(pathname));
    if (file !== site && !file.startsWith(site + sep)) return null;
    try {
      const info = await stat(file);
      return { file: info.isDirectory() ? join(file, 'index.html') : file, pathname };
    } catch { return null; }
  }
  const checkedResources = new Set();
  async function checkReference(href, from) {
    let url;
    try { url = new URL(href, domain.origin + from); }
    catch { check(false, `Invalid URL in ${from}: ${href}`); return; }
    if (url.origin !== domain.origin) return;
    const key = url.pathname + url.hash;
    if (checkedResources.has(key)) return;
    checkedResources.add(key);
    const target = await targetFor(url);
    if (!target) { check(false, `Missing internal resource in ${from}: ${href}`); return; }
    try { check((await stat(target.file)).isFile(), `Not a file in ${from}: ${href}`); }
    catch { check(false, `Missing internal resource in ${from}: ${href}`); return; }
    if (url.hash && target.file.endsWith('.html')) {
      const html = pages.get(target.pathname.endsWith('/') ? target.pathname : target.pathname + '/')?.html ?? await read(target.file);
      check(tags(html, '[a-z][a-z0-9:-]*').some(tag => tag.id === decodeURIComponent(url.hash.slice(1))), `Missing fragment in ${from}: ${href}`);
    }
  }
  function absoluteURL(value, label, { own = false, clean = false } = {}) {
    try {
      const url = new URL(value);
      check(url.protocol === 'https:' && !url.username && !url.password, `Expected credential-free HTTPS URL (${label}): ${value}`);
      if (own) check(url.origin === domain.origin, `Wrong site origin (${label}): ${value}`);
      if (clean) check(!url.search && !url.hash, `Query/fragment in canonical URL (${label}): ${value}`);
      return url;
    } catch { check(false, `Invalid absolute URL (${label}): ${value}`); return null; }
  }
  let jsonLdCount = 0;
  const canonicalPages = new Map();
  for (const [path, page] of pages) {
    const canonical = page.links.filter(link => link.rel?.toLowerCase() === 'canonical');
    if (expected.has(path)) check(canonical.length === 1, `Expected exactly one canonical: ${path}`);
    if (canonical.length) {
      check(canonical.length === 1, `Duplicate canonicals: ${path}`);
      const url = absoluteURL(canonical[0].href, path, { own: true, clean: true });
      if (url?.pathname === path) {
        check(expected.has(path), `Unexpected self-canonical page missing from route definitions: ${path}`);
        canonicalPages.set(path, page);
        check(!tags(page.html, 'meta').some(meta => /^(robots|googlebot|bingbot)$/i.test(meta.name ?? '') && /(?:noindex|none)/i.test(meta.content ?? '')), `Canonical page is noindex: ${path}`);
      } else check(redirects.get(path) === url?.pathname, `Canonical is not self-referencing: ${path}`);
    }
    // Research table rows and embedded source values retain their original text.
    const ownedText = decode(page.html.replace(/<tbody\b[^>]*>[\s\S]*?<\/tbody>/gi, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, ''));
    check(!ownedText.includes('\u2014'), `Em dash in owned rendered text: ${path}`);
    for (const meta of tags(page.html, 'meta')) if (['description', 'og:title', 'og:description', 'twitter:title', 'twitter:description'].includes(meta.name ?? meta.property)) {
      check(!meta.content?.includes('\u2014'), `Em dash in owned page metadata: ${path}`);
    }
    for (const tag of tags(page.html, '[a-z][a-z0-9:-]*')) {
      for (const key of ['href', 'src', 'poster']) if (tag[key]) await checkReference(tag[key], path);
      if (tag.srcset) for (const item of tag.srcset.split(',')) await checkReference(item.trim().split(/\s+/)[0], path);
    }
    for (const match of page.html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (attributes(match[1]).type !== 'application/ld+json') continue;
      let data;
      try { data = JSON.parse(match[2]); } catch { check(false, `Invalid JSON-LD: ${path}`); continue; }
      jsonLdCount++;
      check(data['@context'] === 'https://schema.org', `Wrong JSON-LD context: ${path}`);
      const graph = data['@graph'];
      check(Array.isArray(graph), `Missing JSON-LD graph: ${path}`);
      const webPage = graph?.find(node => node['@type'] === 'WebPage');
      const webSite = graph?.find(node => node['@type'] === 'WebSite');
      check(webPage?.url === domain.origin + path && webPage?.['@id'] === domain.origin + path, `JSON-LD WebPage URL mismatch: ${path}`);
      check(webPage?.inLanguage === (path.startsWith('/ar/') ? 'ar' : 'en'), `JSON-LD inLanguage mismatch: ${path}`);
      check(webSite?.url === domain.origin && webSite?.['@id'] === domain.origin + '/#website', `JSON-LD WebSite mismatch: ${path}`);
      const visit = async (value, key = '') => {
        if (Array.isArray(value)) { for (const item of value) await visit(item, key); return; }
        if (value && typeof value === 'object') { for (const [name, child] of Object.entries(value)) await visit(child, name); return; }
        if (typeof value === 'string' && ['url', '@id', 'contentUrl', 'license', 'sameAs', 'item'].includes(key)) {
          const url = absoluteURL(value, `JSON-LD ${path} ${key}`);
          // #dataset and #website are graph identifiers, not HTML anchors.
          if (url?.origin === domain.origin) { url.hash = ''; await checkReference(url.href, path); }
        }
        if (key === 'inLanguage') check(value === (path.startsWith('/ar/') ? 'ar' : 'en'), `JSON-LD language mismatch: ${path}`);
      };
      await visit(data);
    }
    if (expected.has(path)) check(/<script\b[^>]*type=["']application\/ld\+json["']/i.test(page.html), `Missing JSON-LD: ${path}`);
  }
  for (const path of expected) check(canonicalPages.has(path), `Missing expected canonical page: ${path}`);
  for (const [path, page] of canonicalPages) {
    const localized = path === '/' || path === '/ar/' || /^\/(?:ar\/)?(?:skills\/|guides\/|examples\/)/.test(path);
    const alternates = page.links.filter(link => link.rel === 'alternate' && link.hreflang);
    if (!localized) { check(!alternates.length, `Unexpected locale alternates without a translated route: ${path}`); continue; }
    const english = path.startsWith('/ar/') ? path.slice(3) : path;
    const arabic = '/ar' + english;
    const expectedAlternates = { en: domain.origin + english, ar: domain.origin + arabic, 'x-default': domain.origin + english };
    check(alternates.length === 3, `Expected en/ar/x-default alternates: ${path}`);
    for (const [language, href] of Object.entries(expectedAlternates)) {
      check(alternates.filter(link => link.hreflang === language && link.href === href).length === 1, `Wrong ${language} alternate: ${path}`);
      const target = canonicalPages.get(new URL(href).pathname);
      check(Boolean(target), `Alternate has no canonical target: ${href}`);
      check(target?.links.some(link => link.rel === 'alternate' && link.hreflang === language && link.href === href), `Nonreciprocal alternate: ${path} -> ${href}`);
      for (const [otherLanguage, otherHref] of Object.entries(expectedAlternates)) check(target?.links.some(link => link.rel === 'alternate' && link.hreflang === otherLanguage && link.href === otherHref), `Alternate cluster differs: ${href}`);
    }
  }
  for (const file of files.filter(file => file.endsWith('.css'))) {
    for (const match of (await read(file)).matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) await checkReference(match[1], '/' + relative(site, file).split(sep).join('/'));
  }
  const sitemap = await read(join(site, 'sitemap.xml'));
  const urlset = sitemap.match(/^\s*<\?xml\s+[^?]*\?>\s*<urlset\s+xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"\s*>([\s\S]*)<\/urlset>\s*$/);
  check(Boolean(urlset), 'Sitemap must be a complete generated XML URL-set with the sitemap namespace.');
  const entries = [...(urlset?.[1] ?? '').matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>\s*<\/url>/g)];
  check(entries.map(entry => entry[0]).join('').replace(/\s+/g, '') === (urlset?.[1] ?? '').replace(/\s+/g, ''), 'Sitemap contains malformed or unsupported URL entries.');
  for (const entry of entries) check(!Number.isNaN(Date.parse(entry[2])) && entry[2] === config.siteDate, `Invalid/stale sitemap lastmod: ${entry[2]}`);
  const sitemapURLs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decode(match[1]));
  check(new Set(sitemapURLs).size === sitemapURLs.length, 'Duplicate sitemap URLs.');
  check(sitemapURLs.length === expected.size, `Expected ${expected.size} sitemap URLs, found ${sitemapURLs.length}.`);
  for (const href of sitemapURLs) {
    const url = absoluteURL(href, 'sitemap', { own: true, clean: true });
    check(url && canonicalPages.has(url.pathname), `Sitemap entry has no self-canonical page: ${href}`);
  }
  const llms = await read(join(site, 'llms.txt'));
  for (const path of canonicalPages.keys()) check(sitemapURLs.includes(domain.origin + path) && llms.includes(`](${domain.origin + path})`), `Canonical missing from sitemap or llms.txt: ${path}`);
  const robots = await read(join(site, 'robots.txt'));
  const rules = []; let wildcard = false;
  for (const line of robots.split(/\r?\n/)) {
    const match = line.replace(/#.*$/, '').trim().match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const [, raw, value] = match, name = raw.toLowerCase();
    if (name === 'user-agent') wildcard = value === '*';
    if (wildcard && ['allow', 'disallow'].includes(name) && value) rules.push({ allow: name === 'allow', value });
  }
  check(rules.some(rule => rule.allow && rule.value === '/'), 'Production robots.txt must explicitly Allow: / for User-agent: *.');
  check(robots.split(/\r?\n/).some(line => line.trim() === `Sitemap: ${domain.origin}/sitemap.xml`), 'Wrong production Sitemap directive.');
  for (const path of canonicalPages.keys()) {
    const matching = rules.filter(rule => new RegExp('^' + rule.value.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*').replace(/\\\$$/, '$')).test(path));
    matching.sort((a, b) => b.value.length - a.value.length || Number(b.allow) - Number(a.allow));
    check(!matching.length || matching[0].allow, `robots.txt disallows canonical page: ${path}`);
  }
  if (errors.length) {
    console.error(`SEO check failed: ${errors.length} issue(s).\n` + [...new Set(errors)].slice(0, 30).map(error => `- ${error}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`SEO check passed: ${canonicalPages.size} canonical pages, ${sitemapURLs.length} sitemap URLs, ${jsonLdCount} JSON-LD graphs, ${checkedResources.size} internal resources/fragments, reciprocal English/Arabic alternates, robots and llms.txt.`);
    console.log('Offline only: does not verify deployment, HTTP headers, external URLs, crawl/index/ranking outcomes or browser interactions. Research table text is excluded from the owned-copy em dash check.');
  }
} catch (error) {
  console.error(`SEO check could not finish: ${error.message}`);
  process.exitCode = 1;
}
