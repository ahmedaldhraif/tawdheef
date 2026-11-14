/** Bounded public GETs. Imported source URLs never authorize local-network access. */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { createHash } from 'node:crypto';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';

export function publicAddress(address) {
  const value = address.toLowerCase();
  if (isIP(value) === 4) {
    const [a, b] = value.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19].includes(b)));
  }
  if (isIP(value) === 6) return /^[23][0-9a-f]{3}:/i.test(value) && !/^(?:2001:(?:0:|db8:)|2002:)/i.test(value);
  return false;
}
export function publicSourceUrl(input) {
  const url = new URL(input);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) throw new Error('Use a public HTTP careers or profile URL.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host.includes('.') && !isIP(host) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host) || (isIP(host) && !publicAddress(host))) throw new Error('Use a public careers or profile URL.');
  url.hash = ''; return url;
}
const decode = text => text.replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, value => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[value]).replace(/&#(\d+);/g, (_, n) => Number(n) > 0 && Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : '');
const scriptOpening = /^<script\b((?:"[^"]*"|'[^']*'|[^'">])*)>/i;
function staticJsonLd(script) {
  const attributes = script.match(scriptOpening)?.[1];
  if (attributes === undefined) return false;
  for (const match of attributes.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    if (match[1].toLowerCase() === 'type') return (match[2] ?? match[3] ?? match[4] ?? '').trim().toLowerCase() === 'application/ld+json';
  }
  return false;
}
function browserRequirement(input, url) {
  const html = input.replace(/<script\b[^>]*>[^]*?<\/script\s*>/gi, script => staticJsonLd(script) ? '' : script);
  if (/(?:enable|requires?|needs?|turn on)[^.<>]{0,50}javascript|javascript (?:is )?(?:disabled|not enabled|required)|loading (?:jobs|positions|vacancies|opportunities)/i.test(html)) return 'javascript_required';
  let hostname = ''; try { hostname = new URL(url).hostname; } catch { /* Snapshot callers validate the URL. */ }
  if (/(?:^|\.)myworkdayjobs\.com$/i.test(hostname)) return 'client_rendered';
  const scripts = html.match(/<script\b[^>]*>[^]*?<\/script\s*>/gi) || [];
  const framework = /__NEXT_DATA__|\/_next\/|__NUXT__|\/_nuxt\/|\bng-version\s*=|\bng-app\s*=|<app-root\b/i.test(html);
  const mount = /\bid\s*=\s*["'](?:root|app|application|__next|__nuxt|jobs|vacancies|job[-_](?:list|results))["']/i.test(html);
  if (framework || scripts.length && mount) return 'client_rendered';
  if (scripts.some(script => /\b(?:fetch|XMLHttpRequest)\s*\(|\baxios\s*\.|(?:jobs|vacancies|workday)[^"'<>]{0,80}\.js/i.test(script))) return 'client_rendered';
  if (/<(?:iframe|frame|object|embed)\b/i.test(html)) return 'embedded_source';
  // An opaque external bundle can fetch jobs even beside a long static shell
  // or a default "no jobs" placeholder. Its name/text cannot prove it inert.
  if (/<script\b|<[a-z][^>]*\s+on[a-z]+\s*=|\b(?:href|src)\s*=\s*["']\s*javascript:/i.test(html)) return 'client_rendered';
  return null;
}
export function publicPageSnapshot(html, url) {
  const clean = html.replace(/<!--[^]*?-->|<(script|style|noscript)\b[^>]*>[^]*?<\/\1\s*>/gi, ' ');
  const title = decode(clean.match(/<title\b[^>]*>([^]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, ' ') || '').trim().slice(0, 300);
  const text = decode(clean.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const links = [];
  for (const match of clean.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([^]*?)<\/a>/gi)) {
    try { const target = publicSourceUrl(new URL(decode(match[1]), url).href).href; if (!links.some(link => link.url === target)) links.push({ url: target, label: decode(match[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 160) }); } catch { /* Non-web links are not job evidence. */ }
    if (links.length >= 60) break;
  }
  const browserReason = browserRequirement(html, url);
  const staticScripts = (html.match(/<script\b[^>]*>[^]*?<\/script\s*>/gi) || []).filter(staticJsonLd);
  const staticData = staticScripts.join('\n');
  const structuredData = staticScripts.map(script => script.replace(scriptOpening, '').replace(/<\/script\s*>$/i, '').trim()).join('\n');
  return { url, title, text: text.slice(0, 18000), textTruncated: text.length > 18000, links, contentHash: createHash('sha256').update(clean).update(staticData).digest('hex'), untrusted: true,
    structuredData: structuredData.slice(0, 6000), structuredDataTruncated: structuredData.length > 6000,
    requiresBrowser: browserReason !== null, browserReason,
    loginRequired: /<input\b[^>]*type\s*=\s*["']password["']/i.test(html) };
}
export async function readPublicPage(input, { resolveHost = lookup, maxBytes = 262144, timeoutMs = 15000 } = {}) {
  let url = publicSourceUrl(input);
  const deadline = Date.now() + timeoutMs;
  for (let redirect = 0; redirect <= 4; redirect++) {
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    let lookupTimer;
    let addresses;
    try { addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await Promise.race([resolveHost(hostname, { all: true }), new Promise((_, reject) => { lookupTimer = setTimeout(() => reject(new Error('The public source lookup timed out.')), Math.max(1, deadline - Date.now())); })]); }
    finally { clearTimeout(lookupTimer); }
    if (!addresses.length || addresses.some(item => !publicAddress(item.address))) throw new Error('This source cannot be checked as a public page.');
    // Pin the validated address for this connection; a second DNS resolution
    // must not redirect an imported URL to private infrastructure.
    const chosen = addresses[0];
    const result = await new Promise((accept, reject) => {
      let deadlineTimer;
      const fail = error => { clearTimeout(deadlineTimer); reject(error); };
      const request = (url.protocol === 'https:' ? https : http).request(url, { method: 'GET', headers: { 'User-Agent': 'Tawdheef local update check', Accept: 'text/html,text/plain;q=0.9', 'Accept-Encoding': 'identity' },
        lookup: (_host, options, callback) => options.all ? callback(null, [chosen]) : callback(null, chosen.address, chosen.family) }, response => {
        const chunks = []; let bytes = 0;
        response.on('data', chunk => { bytes += chunk.length; if (bytes > maxBytes) request.destroy(new Error('The source is too large for a background snapshot.')); else chunks.push(chunk); });
        response.on('end', () => { clearTimeout(deadlineTimer); accept({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }); });
        response.on('error', fail);
      });
      deadlineTimer = setTimeout(() => request.destroy(new Error('The public source check timed out.')), Math.max(1, deadline - Date.now()));
      request.on('error', fail); request.end();
    });
    if ([301, 302, 303, 307, 308].includes(result.status) && result.headers.location) { url = publicSourceUrl(new URL(result.headers.location, url).href); continue; }
    if (result.status !== 200 || !/^(?:text\/html|text\/plain|application\/xhtml\+xml)(?:;|$)/i.test(result.headers['content-type'] || '')) throw new Error('Open this source in your assistant’s browser to check it.');
    let bytes = result.body;
    const encoding = result.headers['content-encoding'];
    if (encoding && encoding !== 'identity') {
      const decompress = { gzip: gunzipSync, deflate: inflateSync, br: brotliDecompressSync }[encoding];
      if (!decompress) throw new Error('This source needs a browser check.');
      bytes = decompress(bytes, { maxOutputLength: maxBytes });
    }
    return publicPageSnapshot(bytes.toString('utf8'), url.href);
  }
  throw new Error('Open the saved source in your assistant’s browser; it redirected too many times.');
}
