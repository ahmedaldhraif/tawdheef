/** Pure public-source planning and bounded, untrusted payload normalization.
 * The actual native client performs every read. Workday support is best-effort;
 * unknown layouts require its browser, not an invented successful empty feed. */
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

const MAX_BYTES = 1024 * 1024, MAX_JOBS = 100, MAX_DESCRIPTION = 20000;
const PROVIDERS = ['greenhouse', 'lever', 'ashby', 'workday', 'generic'];
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fail = (message, code = 'ATS_INVALID_INPUT', nextStep) => { const error = new Error(message); error.code = code; if (nextStep) error.nextStep = nextStep; throw error; };
const required = (condition, message, code) => { if (!condition) fail(message, code); };
const segment = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(value);
const idText = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : typeof value === 'string' && value.trim() && value.length <= 500 && !/[\u0000-\u001f\u007f]/.test(value) ? value.trim() : '';
const whitespace = value => String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();

function publicUrl(value) {
  required(typeof value === 'string' && value.length <= 8192 && !/[\u0000-\u001f\u007f]/.test(value), 'Use a bounded public HTTP(S) source URL.');
  let url; try { url = new URL(value); } catch { fail('Use a complete public HTTP(S) URL.'); }
  required(['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && (!url.port || ['80', '443'].includes(url.port)), 'Use a public HTTP(S) URL without credentials or custom ports.');
  required(!isIP(url.hostname.replace(/^\[|\]$/g, '')) && url.hostname.includes('.') && !/(?:^|\.)(?:localhost|local|internal|invalid|test)$/i.test(url.hostname), 'Use a public hostname, not a local address.');
  for (const key of url.searchParams.keys()) required(!/^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|password|api[_-]?key|secret|client[_-]?secret|authorization|cookie|session(?:[_-]?(?:id|token))?)$/i.test(key), 'Keep credentials and session tokens out of discovery URLs.');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key)) url.searchParams.delete(key);
  return url;
}
function descriptor(value) {
  const url = publicUrl(value), host = url.hostname, parts = url.pathname.split('/').filter(Boolean);
  let provider = 'generic', board, apiHost, postingId, jobPath;
  if (['boards.greenhouse.io', 'job-boards.greenhouse.io', 'boards.eu.greenhouse.io', 'job-boards.eu.greenhouse.io', 'boards-api.greenhouse.io', 'boards-api.eu.greenhouse.io'].includes(host)) {
    const api = host.startsWith('boards-api.');
    if (api) { if (parts[0] === 'v1' && parts[1] === 'boards' && parts[3] === 'jobs') { board = parts[2]; postingId = parts[4]; } }
    else if (parts[0] === 'embed' && parts[1] === 'job_board') board = url.searchParams.get('for');
    else if (parts.length === 1 || parts[1] === 'jobs') { board = parts[0]; postingId = parts[2]; }
    if (segment(board) && (postingId === undefined || /^\d+$/.test(postingId))) { provider = 'greenhouse'; apiHost = host.includes('.eu.') ? 'boards-api.eu.greenhouse.io' : 'boards-api.greenhouse.io'; }
  } else if (['jobs.lever.co', 'jobs.eu.lever.co', 'api.lever.co', 'api.eu.lever.co'].includes(host)) {
    const api = host.startsWith('api.'); board = api && parts[0] === 'v0' && parts[1] === 'postings' ? parts[2] : !api ? parts[0] : undefined;
    postingId = api ? parts[3] : parts[1];
    if (segment(board) && (postingId === undefined || segment(postingId))) { provider = 'lever'; apiHost = host.includes('.eu.') ? 'api.eu.lever.co' : 'api.lever.co'; }
  } else if (host === 'jobs.ashbyhq.com' || host === 'api.ashbyhq.com') {
    board = host === 'jobs.ashbyhq.com' ? parts[0] : parts[0] === 'posting-api' && parts[1] === 'job-board' ? parts[2] : undefined;
    postingId = host === 'jobs.ashbyhq.com' ? parts[1] : undefined;
    if (segment(board) && (postingId === undefined || segment(postingId))) { provider = 'ashby'; apiHost = 'api.ashbyhq.com'; }
  } else if (/^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$/i.test(host)) {
    const tenant = host.split('.')[0];
    if (parts[0] === 'wday' && parts[1] === 'cxs') { if (parts[2] === tenant && segment(parts[3]) && (parts[4] === 'jobs' && parts.length === 5 || parts[4] === 'job' && parts.length > 5)) { board = parts[3]; if (parts[4] === 'job') jobPath = '/' + parts.slice(4).join('/'); } }
    else {
      const start = /^[a-z]{2}-[a-z]{2}$/i.test(parts[0] || '') ? 1 : 0;
      if (parts.length === start + 1 || parts[start + 1] === 'job' && parts.length > start + 2) { board = parts[start]; if (parts[start + 1] === 'job') jobPath = '/' + parts.slice(start + 1).join('/'); }
    }
    if (segment(board)) { provider = 'workday'; apiHost = host; postingId = jobPath; }
  }
  const boardKey = provider === 'generic' ? host : `${provider === 'ashby' ? 'jobs.ashbyhq.com' : apiHost}/${board}`;
  return { provider, boardKey, sourceUrl: url.href, url, board, apiHost, postingId, jobPath };
}

export function planJobDiscovery(sourceUrl) {
  const source = descriptor(sourceUrl), { provider, boardKey } = source;
  let requests = [], warnings = [];
  if (provider === 'greenhouse') requests = [{ method: 'GET', url: `https://${source.apiHost}/v1/boards/${source.board}/jobs${source.postingId ? '/' + source.postingId : ''}?content=true` }];
  else if (provider === 'lever') requests = [{ method: 'GET', url: `https://${source.apiHost}/v0/postings/${source.board}${source.postingId ? '/' + source.postingId : ''}?mode=json&limit=100` }];
  else if (provider === 'ashby') requests = [{ method: 'GET', url: source.postingId ? source.sourceUrl : `https://api.ashbyhq.com/posting-api/job-board/${source.board}` }];
  else if (provider === 'workday') {
    const base = `https://${source.apiHost}/wday/cxs/${source.apiHost.split('.')[0]}/${source.board}`;
    requests = source.jobPath ? [{ method: 'GET', url: base + source.jobPath }] : [{ method: 'POST', url: base + '/jobs', body: { appliedFacets: {}, limit: 20, offset: 0, searchText: '' } }];
    warnings = ['Workday CXS layouts are best-effort fixture support. If this public read fails, use the actual client browser and report unknown or partial.'];
  } else warnings = ['No supported public ATS board was identified. Read the saved source with the native client browser and supply bounded source-backed observations.'];
  return { provider, boardKey, sourceUrl: source.sourceUrl, requests, ...(warnings.length ? { warnings } : {}) };
}

function decode(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi, entity => {
    if (entity[1] !== '#') return ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[entity.toLowerCase()];
    const number = /^&#x/i.test(entity) ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1));
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '';
  });
}
function text(value, maximum) {
  const original = typeof value === 'string' ? value : '';
  const decoded = decode(decode(original));
  const clean = decoded.replace(/<!--[^]*?-->|<(script|style|noscript)\b[^>]*>[^]*?<\/\1\s*>/gi, ' ').replace(/<\/?(?:p|div|li|br|h[1-6])\b[^>]*>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/[\t ]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
  return { value: clean.slice(0, maximum), truncated: clean.length > maximum };
}
function locations(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map(item => text(typeof item === 'string' ? item : item?.name ?? item?.location, 500).value).filter(Boolean))].slice(0, 20);
}
function status(value, fallback = 'unknown') {
  if (['closed', 'expired', 'removed', 'unpublished'].includes(String(value).toLowerCase())) return 'closed';
  if (['open', 'published', 'active'].includes(String(value).toLowerCase())) return 'open';
  return value === undefined || value === null || value === '' ? fallback : 'unknown';
}
function validDate(value) {
  if (typeof value !== 'string' || value.length > 100 || !Number.isFinite(Date.parse(value))) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}/.test(value) || new Date(value.slice(0, 10) + 'T00:00:00Z').toISOString().slice(0, 10) !== value.slice(0, 10)) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value).toISOString().slice(0, 10) === value ? value : undefined;
  return /T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? new Date(value).toISOString() : undefined;
}
function bindUrl(plan, value, { custom = false } = {}) {
  const url = publicUrl(value).href, parsed = descriptor(url);
  if (parsed.provider !== 'generic' && plan.provider === 'generic') {
    const nextStep = `In your normal client, verify that the ${parsed.provider} careers board belongs to this company. Read get_company, then update only its verified careersUrl with update_company and patch.expectedRevision, preserving original evidence and sourceRole. Prepare a fresh discovery lease. Scheduled monitoring must report Needs you and hand this source review to the normal client.`;
    fail('The linked ATS board is not bound to this saved generic careers source. ' + nextStep, 'ATS_SOURCE_MISMATCH', nextStep);
  }
  if (parsed.provider !== 'generic') required(parsed.provider === plan.provider && parsed.boardKey === plan.boardKey, 'A posting URL belongs to a different ATS provider or tenant.', 'ATS_SOURCE_MISMATCH');
  else if (!custom && plan.provider !== 'generic') required(new URL(url).origin === new URL(plan.sourceUrl).origin, 'A normalized posting URL must remain on its planned source or evidenced ATS board.', 'ATS_SOURCE_MISMATCH');
  return url;
}
function normalized(plan, input, { fallbackStatus = 'unknown', custom = false, sourceEvidence = '' } = {}) {
  required(plain(input), 'Supply a job object.');
  if (input.provider !== undefined) required(input.provider === plan.provider, 'Do not override the URL-derived ATS provider.', 'ATS_SOURCE_MISMATCH');
  if (input.boardKey !== undefined) required(input.boardKey === plan.boardKey, 'Do not override the URL-derived ATS tenant.', 'ATS_SOURCE_MISMATCH');
  const url = bindUrl(plan, input.url, { custom }), postingId = plan.provider === 'generic' ? '' : idText(input.postingId || descriptor(url).postingId);
  const urlPostingId = descriptor(url).postingId;
  if (postingId && urlPostingId) required(postingId === urlPostingId, 'A posting ID does not match its actual posting URL.', 'ATS_SOURCE_MISMATCH');
  const title = text(input.title, 500), description = text(input.description, MAX_DESCRIPTION);
  required(title.value, 'Each posting needs its actual title.');
  const evidence = text(input.evidence || sourceEvidence, 4000);
  required(evidence.value, 'Each posting needs bounded source evidence.');
  const result = { provider: plan.provider, boardKey: plan.boardKey, ...(postingId ? { postingId } : {}), url, title: title.value, locations: locations(input.locations), description: description.value,
    status: status(input.status, fallbackStatus), contentComplete: input.contentComplete === true && Boolean(description.value) && !description.truncated && !title.truncated, evidence: evidence.value };
  const rawPlaces = Array.isArray(input.locations) ? input.locations : input.locations ? [input.locations] : [];
  if (rawPlaces.length > 20 || rawPlaces.some(value => text(typeof value === 'string' ? value : value?.name ?? value?.location, 500).truncated)) result.contentComplete = false;
  for (const key of ['workplaceType', 'employmentType']) { const value = text(input[key], 100); if (value.value) result[key] = value.value; if (value.truncated) result.contentComplete = false; }
  if (Array.isArray(input.requirements)) { result.requirements = [...new Set(input.requirements.slice(0, 100).map(value => text(value, 1000).value).filter(Boolean))]; if (input.requirements.length > 100 || input.requirements.some(value => typeof value === 'string' && value.length > 1000)) result.contentComplete = false; }
  const deadline = validDate(input.validThrough); if (deadline) result.validThrough = deadline;
  if ((input.validThrough && !deadline) || (input.requirements !== undefined && !Array.isArray(input.requirements))) result.contentComplete = false;
  if (input.applyUrl) result.applyUrl = bindUrl(plan, input.applyUrl, { custom });
  if (input.detailUrl) result.detailUrl = bindUrl(plan, input.detailUrl, { custom });
  return result;
}
function rawPayload(value) {
  let serialized;
  try { serialized = typeof value === 'string' ? value : JSON.stringify(value); } catch { fail('Supply a readable bounded JSON payload.'); }
  required(typeof serialized === 'string' && Buffer.byteLength(serialized) <= MAX_BYTES, 'Raw ATS payloads must stay within 1 MiB; supply client-normalized batches instead.', 'ATS_PAYLOAD_TOO_LARGE');
  try { return JSON.parse(serialized); } catch { fail('Supply valid ATS JSON or native browser observations.'); }
}
function evidence(read, plan) { return text(read.evidence, 3500).value + ` [Client-reported ${plan.provider} source: ${plan.sourceUrl}]`; }

export function normalizeJobDiscovery(plan, { payload, observations, sourceRead, complete = false } = {}) {
  required(plain(plan), 'Use a discovery plan from the saved source.');
  const expected = planJobDiscovery(plan.sourceUrl), source = descriptor(expected.sourceUrl);
  required(plan.provider === expected.provider && plan.boardKey === expected.boardKey && JSON.stringify(plan.requests) === JSON.stringify(expected.requests), 'The discovery plan does not match its saved source URL.', 'ATS_SOURCE_MISMATCH');
  required(plain(sourceRead) && typeof sourceRead.url === 'string', 'Supply the actual native-client source read.');
  required(typeof sourceRead.evidence === 'string' && sourceRead.evidence.trim() && sourceRead.evidence.length <= 4000, 'Supply bounded evidence from the actual native-client read.');
  const readUrl = publicUrl(sourceRead.url).href;
  required([expected.sourceUrl, ...expected.requests.map(request => request.url)].includes(readUrl), 'The native read must identify this planned source or request URL.', 'ATS_SOURCE_MISMATCH');
  required(typeof complete === 'boolean', 'Complete must be true or false.');
  const warnings = [...(expected.warnings || [])], jobs = [];
  let rows, parser, sourceComplete = complete, nextRequest;
  const sourceEvidence = evidence(sourceRead, expected);
  if (observations !== undefined) {
    required(Array.isArray(observations), 'Supply a bounded list of native job observations.');
    rawPayload(observations);
    rows = observations;
    parser = row => {
      const data = plain(row?.data) ? row.data : row;
      return normalized(expected, { ...data, title: row.title ?? data.title, url: row.url ?? data.url, postingId: data.postingId ?? row.externalId, evidence: row.evidence ?? data.evidence, status: data.state ?? data.status }, {});
    };
  } else {
    const data = payload === undefined ? null : rawPayload(payload);
    if (expected.provider === 'greenhouse' && (Array.isArray(data?.jobs) || plain(data) && data.id !== undefined && data.title)) {
      rows = Array.isArray(data.jobs) ? data.jobs : [data];
      if (Number.isSafeInteger(data.meta?.total) && data.meta.total > rows.length) sourceComplete = false;
      parser = row => normalized(expected, { postingId: idText(row.id), url: row.absolute_url, title: row.title, locations: row.location?.name, description: row.content, validThrough: row.application_deadline,
        contentComplete: typeof row.content === 'string' && row.internal_job_id !== null, status: row.internal_job_id === null ? 'unknown' : row.status ?? 'open', detailUrl: `https://${source.apiHost}/v1/boards/${source.board}/jobs/${idText(row.id)}?content=true` }, { fallbackStatus: 'open', custom: true, sourceEvidence });
    } else if (expected.provider === 'lever' && (Array.isArray(data) || plain(data) && data.id && data.text)) {
      rows = Array.isArray(data) ? data : [data];
      if (Array.isArray(data) && rows.length >= 100) sourceComplete = false;
      parser = row => {
        const sections = Array.isArray(row.lists) ? row.lists.map(item => `${item.text || ''}\n${item.content || ''}`).join('\n') : '';
        return normalized(expected, { postingId: row.id, url: row.hostedUrl, applyUrl: row.applyUrl, title: row.text, locations: row.categories?.allLocations || row.categories?.location, workplaceType: row.workplaceType, employmentType: row.categories?.commitment,
          description: [row.descriptionPlain || row.description, sections, row.additionalPlain || row.additional].filter(Boolean).join('\n'), contentComplete: Boolean(row.descriptionPlain || row.description), status: row.state ?? 'open', detailUrl: `https://${source.apiHost}/v0/postings/${source.board}/${idText(row.id)}?mode=json&limit=100` }, { fallbackStatus: 'open', custom: true, sourceEvidence });
      };
    } else if (expected.provider === 'ashby' && Array.isArray(data?.jobs)) {
      rows = data.jobs;
      parser = row => normalized(expected, { postingId: row.id || descriptor(row.jobUrl).postingId, url: row.jobUrl, applyUrl: row.applyUrl, title: row.title, locations: [row.location, ...(row.secondaryLocations || []).map(item => item.location)], workplaceType: row.workplaceType, employmentType: row.employmentType,
        description: row.descriptionPlain || row.descriptionHtml, contentComplete: Boolean(row.descriptionPlain || row.descriptionHtml), status: row.isListed === false ? 'unknown' : row.status ?? 'open', detailUrl: row.jobUrl }, { fallbackStatus: 'open', sourceEvidence });
    } else if (expected.provider === 'workday' && (Array.isArray(data?.jobPostings) || plain(data?.jobPostingInfo))) {
      const detail = plain(data.jobPostingInfo); rows = detail ? [data.jobPostingInfo] : data.jobPostings;
      if (!detail && Number.isSafeInteger(data.total) && data.total > rows.length) {
        sourceComplete = false;
        const request = expected.requests[0];
        if (request.method === 'POST' && rows.length) nextRequest = { ...request, body: { ...request.body, offset: rows.length } };
      }
      parser = row => {
        const rawPath = row.externalPath || (row.externalUrl ? descriptor(row.externalUrl).jobPath : '') || source.jobPath;
        required(typeof rawPath === 'string' && rawPath.length <= 2048 && rawPath.startsWith('/job/') && !/[\\?#\u0000-\u001f\u007f]/.test(rawPath) && !rawPath.split('/').some(part => { const decoded = decodeURIComponent(part); return decoded === '.' || decoded === '..' || decoded.includes('/'); }), 'Workday rows need their actual public posting path.');
        const externalPath = new URL(rawPath, `https://${source.apiHost}`).pathname;
        const url = row.externalUrl || `https://${source.apiHost}/${source.board}${externalPath}`;
        return normalized(expected, { postingId: externalPath, url, title: row.title, locations: [row.location || row.locationsText, ...(Array.isArray(row.additionalLocations) ? row.additionalLocations : [])], employmentType: row.timeType, workplaceType: row.workplaceType,
          description: row.jobDescription, contentComplete: detail && typeof row.jobDescription === 'string', status: row.status ?? row.jobPostingStatus ?? 'unknown', detailUrl: `https://${source.apiHost}/wday/cxs/${source.apiHost.split('.')[0]}/${source.board}${externalPath}` }, { sourceEvidence });
      };
    }
  }
  if (!Array.isArray(rows)) return { jobs: [], complete: false, needsDetail: true, warnings: [...warnings, 'This payload is not a supported complete ATS response. Read the source with the native client browser and record normalized observations.'] };
  if (rows.length > MAX_JOBS) { sourceComplete = false; warnings.push('This feed exceeds 100 records. Use client-normalized batches of at most 100 and retain pagination completeness honestly.'); }
  for (const row of rows.slice(0, MAX_JOBS)) {
    try { jobs.push(parser(row)); }
    catch (error) { if (error.code === 'ATS_SOURCE_MISMATCH') throw error; sourceComplete = false; warnings.push('An incomplete or invalid posting was omitted; inspect the source with the native client.'); }
  }
  if (source.postingId) for (const job of jobs) required(job.postingId === source.postingId, 'The detail payload belongs to a different posting.', 'ATS_SOURCE_MISMATCH');
  const needsDetail = jobs.some(job => !job.contentComplete || job.status === 'unknown') || rows.length > MAX_JOBS || !sourceComplete;
  return { jobs, complete: sourceComplete && !needsDetail, needsDetail, ...(nextRequest ? { nextRequest } : {}), ...(warnings.length ? { warnings: [...new Set(warnings)] } : {}) };
}

export function canonicalJobIdentity(job) {
  required(plain(job) && PROVIDERS.includes(job.provider), 'Use a normalized job provider.');
  const url = publicUrl(job.url).href;
  if (job.provider === 'generic' || !idText(job.postingId)) return JSON.stringify([1, 'url', url]);
  required(typeof job.boardKey === 'string' && job.boardKey.length <= 500 && !/[\u0000-\u001f\u007f]/.test(job.boardKey), 'Use the planned ATS board key.');
  return JSON.stringify([1, job.provider, job.boardKey, idText(job.postingId)]);
}
function meaningful(job) {
  return { version: 1, title: whitespace(job.title), locations: [...new Set((job.locations || []).map(whitespace))].sort(), workplaceType: whitespace(job.workplaceType), employmentType: whitespace(job.employmentType), description: whitespace(job.description), requirements: [...new Set((job.requirements || []).map(whitespace))].sort(), validThrough: validDate(job.validThrough) || '' };
}
export function meaningfulJobHash(job) { return createHash('sha256').update(JSON.stringify(meaningful(job))).digest('hex'); }
export function changedJobFields(previous, next) {
  const before = meaningful(previous), after = meaningful(next), fields = Object.keys(after).filter(key => key !== 'version' && JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  for (const key of ['url', 'applyUrl', 'status', 'contentComplete']) if ((previous[key] ?? null) !== (next[key] ?? null)) fields.push(key);
  return fields;
}
