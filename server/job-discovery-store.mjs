import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { planJobDiscovery, normalizeJobDiscovery, canonicalJobIdentity, meaningfulJobHash, changedJobFields } from './ats-discovery.mjs';

const ASSISTANTS = ['codex', 'claude-code'], POLICY = 1;
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const secret = /\bbearer\s+\S+|\b(?:password|api[_ -]?key|secret|token|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|authorization|cookie|session[_ -]?(?:id|token))["']?\s*[:=]/i;
const parsed = row => row ? JSON.parse(row.payload) : null;

/** Local discovery facts and client assessments. No network, model or Run owner. */
export function createJobDiscoveryStore({ db, getStore, tx, now, activity, ErrorType }) {
  db.exec(`CREATE TABLE IF NOT EXISTS discovery_jobs(id TEXT PRIMARY KEY,identity_key TEXT UNIQUE NOT NULL,content_hash TEXT,status TEXT NOT NULL,needs_detail INTEGER NOT NULL,revision INTEGER NOT NULL,first_seen TEXT NOT NULL,last_seen TEXT NOT NULL,validated_at TEXT,observation_status TEXT,payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS discovery_jobs_review ON discovery_jobs(status,needs_detail,content_hash);
    CREATE TABLE IF NOT EXISTS discovery_job_sources(job_id TEXT NOT NULL,company_id TEXT NOT NULL,source_key TEXT NOT NULL,last_seen TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(job_id,company_id,source_key));
    CREATE INDEX IF NOT EXISTS discovery_source_company ON discovery_job_sources(company_id,job_id);
    CREATE TABLE IF NOT EXISTS discovery_assessments(id TEXT PRIMARY KEY,job_id TEXT NOT NULL,content_hash TEXT NOT NULL,cv_key TEXT NOT NULL,criteria_hash TEXT NOT NULL,policy INTEGER NOT NULL,decision TEXT NOT NULL,created_at TEXT NOT NULL,payload TEXT NOT NULL,UNIQUE(job_id,content_hash,cv_key,criteria_hash,policy));
    CREATE INDEX IF NOT EXISTS discovery_assessment_job ON discovery_assessments(job_id,created_at);
    CREATE TABLE IF NOT EXISTS discovery_leases(id TEXT PRIMARY KEY,company_id TEXT NOT NULL,assistant TEXT NOT NULL,expires_at TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS discovery_lease_company ON discovery_leases(company_id,created_at);`);
  const columns = new Set(db.prepare('PRAGMA table_info(discovery_jobs)').all().map(column => column.name));
  for (const column of ['validated_at', 'observation_status']) if (!columns.has(column)) db.exec(`ALTER TABLE discovery_jobs ADD COLUMN ${column} TEXT`);
  const require = (condition, message, status = 400) => { if (!condition) throw new ErrorType(message, status); };
  const object = (value, keys, label = 'discovery fields') => { require(plain(value), `Supply structured ${label}.`); require(Object.keys(value).every(key => keys.includes(key)), `Use only supported ${label}.`); };
  const text = (value, label, maximum = 2000, empty = false) => { require(typeof value === 'string' && (empty || value.trim()) && value.length <= maximum && !value.includes('\0') && !secret.test(value), `Use bounded ${label} without credentials or raw CV content.`); return value.normalize('NFC').trim(); };
  const actor = value => { require(ASSISTANTS.includes(value), 'Choose the actual Codex or Claude Code client.'); return value; };
  const native = () => require(getStore().getSettings().connectionMode === 'native', 'Use Native client ownership for job discovery.');
  const read = (table, id) => parsed(db.prepare(`SELECT payload FROM ${table} WHERE id=?`).get(id));
  const setting = (id, value) => db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(id, JSON.stringify(value));
  function preferences() {
    const value = read('settings', 'discovery_preferences') || { revision: 1, roles: [], locations: [], notes: '' };
    return { ...value, criteriaHash: hash({ roles: [...value.roles].sort(), locations: [...value.locations].sort(), notes: value.notes }) };
  }
  function publicUrl(value) {
    let url; try { url = new URL(value); } catch { require(false, 'Use a complete public source URL.'); }
    const host = url.hostname.toLowerCase();
    require(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && host !== 'localhost' && !host.endsWith('.localhost') && !host.endsWith('.local') && !/^(?:127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host) && !host.startsWith('['), 'Use a public source URL without local/private addresses or credentials.');
    require(![...url.searchParams.keys()].some(key => /^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|password|api[_-]?key|secret|client[_-]?secret|authorization|cookie|session(?:[_-]?(?:id|token))?)$/i.test(key)), 'Keep credentials and session tokens out of source URLs.');
    url.hash = ''; for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key)) url.searchParams.delete(key); return url.href;
  }
  function companySource(companyId) {
    const company = getStore().getCompany(companyId);
    require(!company.archived && getStore().listDirectories().some(directory => directory.id === company.directoryId), 'Choose a company in an active directory.');
    const sourceUrl = publicUrl(company.careersUrl || company.applyUrl || company.website);
    return { company, sourceUrl, sourceRevision: hash([company.id, company.directoryId, company.sourceRole || '', sourceUrl]) };
  }
  const saveLease = lease => db.prepare('INSERT INTO discovery_leases VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload').run(lease.id, lease.companyId, lease.assistant, lease.expiresAt, lease.status, lease.createdAt, JSON.stringify(lease));
  function validateLease(input, finished = false) {
    actor(input.assistant); native();
    const lease = read('discovery_leases', text(input.id, 'lease ID', 200)); require(lease, 'Discovery lease not found.', 404);
    const actual = Buffer.from(hash(text(input.token, 'lease token', 200)), 'hex'), expected = Buffer.from(lease.tokenHash, 'hex');
    require(actual.length === expected.length && timingSafeEqual(actual, expected), 'The discovery lease token is invalid.', 403);
    require(lease.assistant === input.assistant, 'Use the actual client selected for this discovery lease.', 403);
    require((lease.status === 'running' || finished && ['checked', 'partial', 'unknown', 'error'].includes(lease.status)) && lease.expiresAt > now(), 'This discovery lease expired or finished. Prepare a new read.', 409);
    require(companySource(lease.companyId).sourceRevision === lease.sourceRevision, 'The company or recruitment source changed. Prepare a new read.', 409);
    if (lease.monitoringCheckId) {
      const check = read('monitor_checks', lease.monitoringCheckId), config = getStore().getMonitoring().config;
      require(check?.native && check.source.kind === 'jobs' && check.status === 'running' && check.expiresAt > now() && check.assistant === lease.assistant && config.enabled && config.channels.jobs && config.revision === check.configurationRevision && config.assistant === lease.assistant, 'The linked monitoring check stopped or its saved scope changed.', 409);
    }
    return lease;
  }
  function freshCv(assistant) {
    const report = getStore().getNativeClientStatus({ assistant }).capabilities.cv;
    const id = report.cv?.id || report.cv?.url || null, versionHash = report.cv?.versionHash || null;
    const fresh = report.status === 'reported' && id && /^[a-f0-9]{64}$/i.test(versionHash || '');
    return { status: fresh ? 'reported' : 'unknown', id, versionHash, key: fresh ? hash([id, versionHash.toLowerCase()]) : '', observedAt: report.observedAt || null };
  }
  function proof(value, lease) {
    object(value, ['method', 'url', 'observedAt', 'evidence', 'httpStatus', 'etag', 'lastModified'], 'source read evidence');
    require(['native_http', 'native_browser'].includes(value.method), 'Use your actual client HTTP or browser read.');
    const url = publicUrl(value.url), allowed = [lease.plan.sourceUrl, ...(lease.plan.requests || []).map(request => request.url)];
    require(allowed.map(publicUrl).includes(url), 'Read only the exact source or endpoint prepared for this lease.');
    const observedAt = text(value.observedAt, 'source observation time', 100), observed = Date.parse(observedAt), tolerance = 300000;
    require(/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(observedAt) && Number.isFinite(observed) && observed >= Date.parse(lease.createdAt) - tolerance && observed <= Math.min(Date.parse(lease.expiresAt) + tolerance, Date.parse(now()) + tolerance), 'Use a fresh actual source read within this lease.');
    const result = { method: value.method, url, observedAt: new Date(observed).toISOString(), evidence: text(value.evidence, 'source evidence', 4000), clientReported: true };
    if (value.httpStatus !== undefined) { require(Number.isInteger(value.httpStatus) && value.httpStatus >= 100 && value.httpStatus <= 599, 'Use an actual HTTP response status.'); result.httpStatus = value.httpStatus; }
    for (const key of ['etag', 'lastModified']) if (value[key] !== undefined) { result[key] = text(value[key], `HTTP ${key}`, 1000); require(!/[\r\n]/.test(result[key]), 'HTTP validators must be one line.'); }
    return result;
  }
  function scope(input) {
    actor(input.assistant); const where = ["json_extract(c.payload,'$.archived') IS NOT 1", "json_extract(d.payload,'$.archived') IS NOT 1"], args = [];
    if (input.directoryId !== undefined) { require(getStore().listDirectories().some(directory => directory.id === input.directoryId), 'Choose an active directory.'); where.push('c.directory_id=?'); args.push(input.directoryId); }
    if (input.companyId !== undefined) { require(typeof input.companyId === 'string', 'Company ID must be text.'); where.push('c.id=?'); args.push(input.companyId); }
    if (input.companyIds !== undefined) {
      require(Array.isArray(input.companyIds) && input.companyIds.every(id => typeof id === 'string'), 'Company IDs must be a list of text.');
      where.push('c.id IN (SELECT value FROM json_each(?))'); args.push(JSON.stringify([...new Set(input.companyIds)]));
    }
    return { where: where.join(' AND '), args };
  }
  function reviewQuery(input) {
    const selected = scope(input), prefs = preferences(), cv = freshCv(input.assistant);
    const from = `FROM discovery_jobs j LEFT JOIN discovery_assessments current ON current.job_id=j.id AND current.content_hash=j.content_hash AND current.cv_key=? AND current.criteria_hash=? AND current.policy=${POLICY}
      LEFT JOIN discovery_assessments latest ON latest.id=(SELECT a.id FROM discovery_assessments a WHERE a.job_id=j.id ORDER BY a.rowid DESC LIMIT 1)
      WHERE EXISTS(SELECT 1 FROM discovery_job_sources s JOIN companies c ON c.id=s.company_id JOIN directories d ON d.id=c.directory_id WHERE s.job_id=j.id AND ${selected.where})`;
    const state = `CASE WHEN j.status='closed' THEN 'closed' WHEN j.needs_detail=1 OR j.content_hash IS NULL OR j.validated_at IS NULL OR j.validated_at<? OR j.observation_status='unknown' THEN 'needs_detail' WHEN ?='' THEN 'cv_unknown' WHEN current.id IS NULL THEN CASE WHEN latest.id IS NULL THEN 'unscored' ELSE 'stale' END WHEN current.decision='needs_you' THEN 'needs_you' ELSE 'current' END`;
    return { selected, prefs, cv, from, state, stateArgs: [new Date(Date.parse(now()) - 86400000).toISOString(), cv.key], args: [cv.key, prefs.criteriaHash, ...selected.args] };
  }
  function bindings(id, selected, limit) {
    const from = `FROM discovery_job_sources s JOIN companies c ON c.id=s.company_id JOIN directories d ON d.id=c.directory_id WHERE s.job_id=? AND ${selected.where}`;
    return { items: db.prepare(`SELECT DISTINCT c.id,c.name ${from} ORDER BY c.name,c.id LIMIT ?`).all(id, ...selected.args, limit), total: Number(db.prepare(`SELECT COUNT(DISTINCT c.id) AS n ${from}`).get(id, ...selected.args).n) };
  }
  function nextStep(state, assessment) {
    return state === 'closed' ? 'This posting was explicitly reported closed. Do not apply from this saved record.' : state === 'needs_detail' ? 'Use your client to read the actual complete posting before assessing it.' : state === 'cv_unknown' ? 'Read your real CV in this client and report its source ID and versionHash before matching.' : state === 'stale' ? 'Review this posting against the current CV version and saved preferences.' : state === 'unscored' ? 'Assess this posting using actual CV facts and cited job requirements.' : state === 'needs_you' ? assessment?.nextStep || 'Open the assessment and resolve its missing fact.' : null;
  }
  function project(row, query, full = false) {
    const job = JSON.parse(row.payload), assessment = parsed(row.assessment_payload ? { payload: row.assessment_payload } : null), linked = bindings(job.id, query.selected, full ? 20 : 5);
    const latestSource = db.prepare(`SELECT l.status,json_extract(l.payload,'$.nextStep') AS nextStep FROM discovery_leases l JOIN discovery_job_sources s ON s.company_id=l.company_id JOIN companies c ON c.id=s.company_id JOIN directories d ON d.id=c.directory_id WHERE s.job_id=? AND ${query.selected.where} ORDER BY l.rowid DESC LIMIT 1`).get(job.id, ...query.selected.args);
    job.lastKnownStatus = job.status;
    job.latestSourceStatus = latestSource?.status || 'unknown';
    if (job.latestObservationStatus === 'unknown' || ['unknown', 'error', 'partial'].includes(job.latestSourceStatus)) job.status = 'unknown';
    job.needsDetail = job.needsDetail || row.match_state === 'needs_detail';
    const current = row.match_state === 'current' || row.match_state === 'needs_you';
    const value = assessment && { ...assessment, isCurrent: current, clientReported: true };
    const provenance = { companyIds: linked.items.map(item => item.id), companyNames: linked.items.map(item => item.name), sourceCount: linked.total, sourceBindingsTruncated: linked.total > linked.items.length };
    const action = latestSource && ['unknown', 'error', 'partial'].includes(latestSource.status) ? latestSource.nextStep || 'Read this source in your actual client; its latest coverage is incomplete.' : nextStep(row.match_state, value);
    if (full) return { job: { ...job, ...provenance }, assessment: value, matchState: row.match_state, changedFields: job.changedFields || [], nextStep: action, preferences: query.prefs, cv: query.cv };
    const { description, requirements, listing, evidence, ...compact } = job;
    return { ...compact, ...provenance, matchState: row.match_state, decision: value?.decision || null, assessment: value && { decision: value.decision, reason: value.reason, nextStep: value.nextStep || null, assessedAt: value.assessedAt, clientReported: true, isCurrent: value.isCurrent }, nextStep: action, clientReported: true };
  }
  function problems(input, selected) {
    const from = `FROM discovery_leases l JOIN companies c ON c.id=l.company_id JOIN directories d ON d.id=c.directory_id WHERE ${selected.where} AND l.rowid=(SELECT MAX(newer.rowid) FROM discovery_leases newer WHERE newer.company_id=l.company_id) AND l.status IN ('partial','unknown','error')`;
    return { total: Number(db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...selected.args).n), items: db.prepare(`SELECT l.payload ${from} ORDER BY l.created_at DESC LIMIT 100`).all(...selected.args).map(parsed).map(lease => ({ companyId: lease.companyId, companyName: lease.companyName, sourceUrl: lease.sourceUrl, assistant: lease.assistant, status: lease.status, nextStep: lease.nextStep || 'Open this source in your actual client and complete its read.', observedAt: lease.finishedAt || lease.createdAt })) };
  }
  const methods = {
    getDiscoveryPreferences() { return preferences(); },
    updateDiscoveryPreferences(input = {}) {
      object(input, ['expectedRevision', 'explicit', 'patch']); object(input.patch, ['roles', 'locations', 'notes'], 'discovery preferences');
      return tx(() => {
        const previous = preferences(); require(input.expectedRevision === previous.revision, 'Discovery preferences changed. Read them and retry with their revision.', 409); require(input.explicit === true, 'Explicitly save your desired roles and locations.');
        const next = { revision: previous.revision + 1, roles: previous.roles, locations: previous.locations, notes: previous.notes };
        for (const key of ['roles', 'locations']) if (input.patch[key] !== undefined) { require(Array.isArray(input.patch[key]) && input.patch[key].length <= 100, 'Use up to 100 role/location preferences.'); next[key] = [...new Set(input.patch[key].map(value => text(value, key, 300)))]; }
        if (input.patch.notes !== undefined) next.notes = text(input.patch.notes, 'preference notes', 2000, true);
        setting('discovery_preferences', next); return preferences();
      });
    },
    prepareJobDiscovery(input = {}) {
      object(input, ['companyId', 'assistant', 'jobId']); actor(input.assistant); native();
      return tx(() => {
        const source = companySource(input.companyId);
        let url = source.sourceUrl, job;
        if (input.jobId !== undefined) { job = read('discovery_jobs', input.jobId); require(job && db.prepare('SELECT 1 FROM discovery_job_sources WHERE job_id=? AND company_id=?').get(job.id, input.companyId), 'Choose a posting already discovered from this company.', 404); url = publicUrl(job.detailUrl || job.url); }
          const plan = planJobDiscovery(url), token = randomBytes(32).toString('base64url');
        require(!job || job.provider !== 'generic' || plan.provider === 'generic', 'Verify and save the actual ATS careers board with the normal client and current company revision, then prepare a new discovery read. Preserve the original source evidence.');
        const prior = parsed(db.prepare("SELECT payload FROM discovery_leases WHERE company_id=? AND status='checked' AND json_extract(payload,'$.plan.sourceUrl')=? AND json_extract(payload,'$.sourceRevision')=? ORDER BY rowid DESC LIMIT 1").get(input.companyId, plan.sourceUrl, source.sourceRevision));
        const lease = { id: `discovery_${randomUUID()}`, companyId: input.companyId, companyName: source.company.name, assistant: input.assistant, sourceUrl: source.sourceUrl, sourceRevision: source.sourceRevision, plan, tokenHash: hash(token), createdAt: now(), expiresAt: new Date(Date.parse(now()) + 15 * 60000).toISOString(), status: 'running', jobId: job?.id || null, validators: prior?.bodyComplete ? prior.validators || null : null, validationFrom: prior?.bodyComplete ? prior.id : null, expectedValidationCount: prior?.validatedJobCount || 0, counts: { added: 0, changed: 0, unchanged: 0 } };
        saveLease(lease);
        return { id: lease.id, token, expiresAt: lease.expiresAt, companyId: lease.companyId, sourceRevision: lease.sourceRevision, readRequest: { executionOwner: 'native-client', readOnly: true, url, plan, validators: lease.validators }, cached: { lastCheckAt: prior?.finishedAt || null, priorComplete: Boolean(lease.validators && lease.validationFrom) } };
      });
    },
    prepareMonitoredJobDiscovery(input = {}) {
      object(input, ['id', 'token', 'assistant']); const check = getStore().getMonitoringCheck({ id: input.id, token: input.token }); actor(input.assistant);
      require(check.native && check.source.kind === 'jobs' && check.assistant === input.assistant, 'Use the selected actual client and its active Native jobs check.');
      const prepared = methods.prepareJobDiscovery({ companyId: check.source.companyId || check.source.id, assistant: input.assistant });
      const lease = read('discovery_leases', prepared.id); lease.monitoringCheckId = check.id; saveLease(lease); return prepared;
    },
    getDiscoveryLeaseScope(input = {}) { object(input, ['id', 'token', 'assistant']); const lease = validateLease(input); return { companyId: lease.companyId, ...(lease.monitoringCheckId ? { monitoringCheckId: lease.monitoringCheckId } : {}) }; },
    getCompletedMonitoredDiscovery(input = {}) { object(input, ['id', 'token', 'assistant']); const lease = validateLease(input, true); require(lease.monitoringCheckId && lease.status !== 'running', 'Finish the linked discovery read before completing its monitor check.'); return { id: lease.monitoringCheckId, discoveryId: lease.id, companyId: lease.companyId, assistant: lease.assistant, status: lease.status, complete: lease.status === 'checked', sourceRead: lease.sourceRead || null, summary: lease.summary || 'Read-only source discovery completed.', counts: lease.counts }; },
    recordJobDiscovery(input = {}) {
      object(input, ['id', 'token', 'assistant', 'sourceRead', 'payload', 'observations', 'complete', 'status', 'summary', 'nextStep']);
      return tx(() => {
        const lease = validateLease(input), receipt = input.sourceRead ? proof(input.sourceRead, lease) : null;
        require(input.complete === undefined || typeof input.complete === 'boolean', 'Complete must be true or false.');
        require(input.status === undefined || ['checked', 'partial', 'unknown', 'error'].includes(input.status), 'Use checked, partial, unknown or error for this read.');
        const blocked = ['unknown', 'error'].includes(input.status) || receipt?.httpStatus >= 400;
        if (blocked) {
          require(input.payload === undefined && (!input.observations || input.observations.length === 0), 'A blocked or failed source cannot establish new jobs.');
          lease.status = input.status === 'error' ? 'error' : 'unknown'; lease.finishedAt = now(); lease.bodyComplete = false;
          lease.nextStep = text(input.nextStep || 'Open the saved source with your actual client and resolve its access or tool problem.', 'one actionable next step', 1000);
          lease.summary = text(input.summary || receipt?.evidence || 'This source could not be read completely.', 'source summary', 2000); if (receipt) lease.sourceRead = receipt;
          saveLease(lease); return { ...lease.counts, needsDetail: 0, complete: false, leaseActive: false, nextRequest: null, summary: lease.summary };
        }
        require(receipt, 'An actual fresh source read is required before recording jobs.');
        if (receipt.httpStatus === 304) {
          require(receipt.method === 'native_http' && input.payload === undefined && (!input.observations || input.observations.length === 0) && input.complete === true, 'A 304 needs an actual complete conditional HTTP read without a new payload.');
          require(lease.validationFrom && lease.validators && lease.validators.url === receipt.url && (lease.validators.etag && receipt.etag === lease.validators.etag || lease.validators.lastModified && receipt.lastModified === lease.validators.lastModified) && lease.plan.requests.some(request => request.method === 'GET' && publicUrl(request.url) === receipt.url), 'Read the full source: this lease has no matching prior complete HTTP validator.');
          const rows = db.prepare("SELECT s.job_id,s.payload,j.content_hash,json_extract(j.payload,'$.contentComplete') AS content_complete,json_extract(j.payload,'$.listingChanged') AS listing_changed FROM discovery_job_sources s JOIN discovery_jobs j ON j.id=s.job_id WHERE s.company_id=? AND json_extract(s.payload,'$.validatedLeaseId')=?").all(lease.companyId, lease.validationFrom);
          require(rows.length > 0 && rows.length === lease.expectedValidationCount && rows.every(row => row.content_complete && !row.listing_changed && JSON.parse(row.payload).validatedContentHash === row.content_hash), 'Read complete posting details: prior source validation does not cover the current job content.');
          for (const row of rows) {
            const binding = JSON.parse(row.payload); binding.validatedLeaseId = lease.id; binding.lastSeenAt = now();
            db.prepare('UPDATE discovery_job_sources SET last_seen=?,payload=? WHERE job_id=? AND company_id=? AND source_key=?').run(now(), JSON.stringify(binding), row.job_id, lease.companyId, binding.sourceKey);
            db.prepare("UPDATE discovery_jobs SET last_seen=?,validated_at=?,needs_detail=0,payload=json_set(payload,'$.lastSeenAt',?,'$.lastValidatedAt',?,'$.needsDetail',json('false')) WHERE id=?").run(now(), now(), now(), now(), row.job_id);
          }
          lease.status = 'checked'; lease.finishedAt = now(); lease.bodyComplete = true; lease.validatedJobCount = rows.length; lease.sourceRead = receipt; lease.counts.unchanged += rows.length; saveLease(lease);
          return { added: 0, changed: 0, unchanged: rows.length, needsDetail: 0, complete: true, leaseActive: false, nextRequest: null, summary: 'The client reported a fresh 304 for the same complete source representation.' };
        }
        require(receipt.httpStatus === undefined || receipt.httpStatus >= 200 && receipt.httpStatus < 300, 'Record a successful read, an actual conditional 304, or an honest source blocker.');
        const result = normalizeJobDiscovery(lease.plan, { payload: input.payload, observations: input.observations, sourceRead: receipt, complete: input.complete === true });
        require(Array.isArray(result.jobs) && result.jobs.length <= 100, 'Record up to 100 jobs per bounded batch.');
        let added = 0, changed = 0, unchanged = 0, needsDetail = 0;
        const sourceKey = hash([lease.companyId, lease.plan.sourceUrl]);
        for (const incoming of result.jobs) {
          publicUrl(incoming.url); if (incoming.applyUrl) publicUrl(incoming.applyUrl); if (incoming.detailUrl) publicUrl(incoming.detailUrl);
          const identity = canonicalJobIdentity(incoming), jobId = `job_${hash(identity)}`;
          require(!lease.jobId || lease.jobId === jobId, 'This detail lease belongs to another posting.');
          const previous = read('discovery_jobs', jobId), full = incoming.contentComplete === true && Boolean(incoming.description?.trim());
          require(!previous?.latestObservedAt || previous.latestObservedAt <= receipt.observedAt, 'A newer source observation is already recorded. Prepare a fresh read instead of reverting its facts.', 409);
          const fields = ['provider', 'boardKey', 'postingId', 'url', 'applyUrl', 'title', 'locations', 'workplaceType', 'employmentType', 'description', 'requirements', 'validThrough', 'detailUrl'];
          const facts = Object.fromEntries(fields.filter(key => incoming[key] !== undefined).map(key => [key, incoming[key]]));
          const listing = { title: incoming.title, locations: incoming.locations || [], url: incoming.url };
          const contentHash = full ? meaningfulJobHash(incoming) : previous?.contentHash || null;
          const status = ['open', 'closed'].includes(incoming.status) ? incoming.status : previous?.status || 'unknown';
          const listingChanged = Boolean(previous?.contentComplete && hash(listing) !== hash({ title: previous.title, locations: previous.locations || [], url: previous.url }));
          const changedFields = previous ? full ? changedJobFields(previous, incoming) : listingChanged ? ['listing'] : status !== previous.status ? ['status'] : [] : ['new'];
          const materialChange = Boolean(previous && (full && previous.contentHash !== contentHash || status !== previous.status || listingChanged));
          const job = { ...(previous || {}), ...(full || !previous?.contentComplete ? facts : {}), id: jobId, identityKey: identity, status, latestObservationStatus: incoming.status || 'unknown', latestObservedAt: receipt.observedAt, contentHash, contentComplete: full || previous?.contentComplete || false, needsDetail: !full || incoming.status === 'unknown', listingChanged: full ? false : listingChanged, ...(full ? {} : { listing }), revision: (previous?.revision || 0) + (!previous || materialChange ? 1 : 0), changedFields: materialChange || !previous ? changedFields : previous.changedFields || [], firstSeenAt: previous?.firstSeenAt || now(), lastSeenAt: now(), lastCompleteAt: full ? now() : previous?.lastCompleteAt || null, lastValidatedAt: full ? now() : previous?.lastValidatedAt || null, evidence: text(incoming.evidence || receipt.evidence, 'posting evidence', 4000), clientReported: true };
          db.prepare('INSERT INTO discovery_jobs(id,identity_key,content_hash,status,needs_detail,revision,first_seen,last_seen,validated_at,observation_status,payload) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET content_hash=excluded.content_hash,status=excluded.status,needs_detail=excluded.needs_detail,revision=excluded.revision,last_seen=excluded.last_seen,validated_at=excluded.validated_at,observation_status=excluded.observation_status,payload=excluded.payload').run(job.id, identity, contentHash, status, Number(job.needsDetail), job.revision, job.firstSeenAt, now(), job.lastValidatedAt, job.latestObservationStatus, JSON.stringify(job));
          const binding = { jobId, companyId: lease.companyId, sourceKey, sourceUrl: lease.plan.sourceUrl, sourceRevision: lease.sourceRevision, lastSeenAt: now(), lastSeenLeaseId: lease.id, presence: 'observed', ...(full ? { validatedLeaseId: lease.id, validatedContentHash: contentHash, validatedObservedAt: receipt.observedAt } : {}), sourceRead: receipt, clientReported: true };
          db.prepare('INSERT INTO discovery_job_sources VALUES(?,?,?,?,?) ON CONFLICT(job_id,company_id,source_key) DO UPDATE SET last_seen=excluded.last_seen,payload=excluded.payload').run(jobId, lease.companyId, sourceKey, now(), JSON.stringify(binding));
          if (!previous) added++; else if (materialChange) changed++; else if (full) unchanged++;
          if (job.needsDetail) needsDetail++;
        }
        const complete = input.complete === true && result.complete === true && !result.nextRequest;
        if (complete && !lease.jobId) {
          const missing = db.prepare("SELECT s.job_id,s.payload,j.content_hash,json_extract(j.payload,'$.latestObservedAt') AS latest_observed FROM discovery_job_sources s JOIN discovery_jobs j ON j.id=s.job_id WHERE s.company_id=? AND s.source_key=? AND COALESCE(json_extract(s.payload,'$.lastSeenLeaseId'),'')<>?").all(lease.companyId, sourceKey, lease.id);
          for (const row of missing) {
            if (row.latest_observed > receipt.observedAt) continue;
            const binding = JSON.parse(row.payload); binding.presence = 'unknown'; binding.lastMissingAt = receipt.observedAt;
            db.prepare('UPDATE discovery_job_sources SET payload=? WHERE job_id=? AND company_id=? AND source_key=?').run(JSON.stringify(binding), row.job_id, lease.companyId, sourceKey);
            const fresher = db.prepare("SELECT 1 FROM discovery_job_sources WHERE job_id=? AND COALESCE(json_extract(payload,'$.presence'),'observed')='observed' AND json_extract(payload,'$.validatedObservedAt')>=? AND json_extract(payload,'$.validatedContentHash')=? LIMIT 1").get(row.job_id, receipt.observedAt, row.content_hash);
            if (!fresher) db.prepare("UPDATE discovery_jobs SET needs_detail=1,observation_status='unknown',payload=json_set(payload,'$.needsDetail',json('true'),'$.latestObservationStatus','unknown') WHERE id=?").run(row.job_id);
          }
        }
        for (const [key, value] of Object.entries({ added, changed, unchanged })) lease.counts[key] += value;
        lease.sawPartialDetails = lease.sawPartialDetails || needsDetail > 0;
        lease.sourceRead = receipt; lease.validatedJobCount = Number(db.prepare("SELECT COUNT(*) AS n FROM discovery_job_sources WHERE company_id=? AND json_extract(payload,'$.validatedLeaseId')=?").get(lease.companyId, lease.id).n); lease.bodyComplete = complete && !lease.sawPartialDetails && lease.validatedJobCount > 0;
        if (lease.bodyComplete && receipt.method === 'native_http' && (receipt.etag || receipt.lastModified)) lease.validators = { url: receipt.url, ...(receipt.etag ? { etag: receipt.etag } : {}), ...(receipt.lastModified ? { lastModified: receipt.lastModified } : {}) };
        if (complete) { lease.status = 'checked'; lease.finishedAt = now(); }
        else if (input.status === 'partial') { lease.status = 'partial'; lease.finishedAt = now(); lease.nextStep = text(input.nextStep || 'Continue this source with your client; its results remain incomplete.', 'one actionable next step', 1000); }
        lease.summary = text(input.summary || `${added} first observed, ${changed} changed, ${unchanged} unchanged complete postings; ${needsDetail} need actual details.`, 'discovery summary', 2000); saveLease(lease);
        activity('jobs_discovered', lease.summary, lease.companyId);
        return { added, changed, unchanged, needsDetail, complete, leaseActive: lease.status === 'running', nextRequest: result.nextRequest || null, summary: lease.summary, warnings: result.warnings || [] };
      });
    },
    getDiscoverySummary(input = {}) {
      object(input, ['assistant', 'directoryId', 'companyIds', 'companyId']); const query = reviewQuery(input);
      const counts = db.prepare(`SELECT COUNT(*) AS total,COALESCE(SUM(match_state IN ('unscored','stale','needs_detail','cv_unknown')),0) AS pending,COALESCE(SUM(latest_id IS NULL),0) AS new,COALESCE(SUM(latest_id IS NOT NULL AND latest_hash<>content_hash),0) AS changed,COALESCE(SUM(match_state='needs_you'),0) AS needsYou FROM (SELECT ${query.state} AS match_state,latest.id AS latest_id,latest.content_hash AS latest_hash,j.content_hash ${query.from})`).get(...query.stateArgs, ...query.args);
      const sourceProblemPage = problems(input, query.selected), sourceProblems = sourceProblemPage.items;
      const checked = db.prepare(`SELECT MAX(l.created_at) AS lastCheckAt,MAX(CASE WHEN l.status='checked' THEN json_extract(l.payload,'$.finishedAt') END) AS lastSuccessAt FROM discovery_leases l JOIN companies c ON c.id=l.company_id JOIN directories d ON d.id=c.directory_id WHERE ${query.selected.where}`).get(...query.selected.args);
      const jobNeed = db.prepare(`SELECT COALESCE(current.payload,latest.payload) AS payload ${query.from} AND current.decision='needs_you' LIMIT 1`).get(...query.args);
      return { new: Number(counts.new), changed: Number(counts.changed), pending: Number(counts.pending), needsYou: Number(counts.needsYou) + sourceProblemPage.total + (!query.cv.key && counts.total ? 1 : 0), sourceProblems, sourceProblemCount: sourceProblemPage.total, nextStep: sourceProblems[0]?.nextStep || (!query.cv.key && counts.total ? nextStep('cv_unknown') : parsed(jobNeed)?.nextStep || null), cv: query.cv, preferences: query.prefs, lastCheckAt: checked.lastCheckAt || null, lastSuccessAt: checked.lastSuccessAt || null };
    },
    listDiscoveredJobs(input = {}) {
      object(input, ['assistant', 'directoryId', 'companyIds', 'companyId', 'review', 'limit', 'cursor']);
      const limit = input.limit ?? 20, review = input.review ?? 'all'; require(Number.isSafeInteger(limit) && limit >= 1 && limit <= 100, 'Use a job page size from 1 to 100.'); require(['all', 'pending', 'needs_you', 'suitable'].includes(review), 'Choose a supported job review filter.');
      const query = reviewQuery(input), signature = hash([input.directoryId || null, input.companyIds || null, input.companyId || null, review, query.cv.key, query.prefs.criteriaHash]);
      let before = Number.MAX_SAFE_INTEGER;
      if (input.cursor !== undefined) { let cursor; try { cursor = JSON.parse(Buffer.from(text(input.cursor, 'job page cursor', 2048), 'base64url')); } catch { require(false, 'Use a job cursor returned by this tracker.'); } require(cursor.v === 1 && cursor.signature === signature && Number.isSafeInteger(cursor.before) && cursor.before > 0, 'The job scope, CV or preferences changed. Start with the first page.', 409); before = cursor.before; }
      const filter = review === 'pending' ? "match_state IN ('unscored','stale','needs_detail','cv_unknown')" : review === 'needs_you' ? "match_state IN ('needs_you','cv_unknown')" : review === 'suitable' ? "match_state='current' AND decision='suitable'" : '1';
      const base = `SELECT j.rowid AS position,json_remove(j.payload,'$.description','$.requirements','$.listing','$.evidence') AS payload,${query.state} AS match_state,json_remove(COALESCE(current.payload,latest.payload),'$.requirements','$.cvReference') AS assessment_payload,current.decision AS decision ${query.from}`;
      const args = [...query.stateArgs, ...query.args];
      const total = Number(db.prepare(`SELECT COUNT(*) AS n FROM (${base}) WHERE ${filter}`).get(...args).n);
      const rows = db.prepare(`SELECT * FROM (${base}) WHERE ${filter} AND position<? ORDER BY position DESC LIMIT ?`).all(...args, before, limit + 1), hasMore = rows.length > limit;
      const items = rows.slice(0, limit).map(row => project(row, query));
      return { items, total, nextCursor: hasMore ? Buffer.from(JSON.stringify({ v: 1, signature, before: rows[limit - 1].position })).toString('base64url') : null, summary: methods.getDiscoverySummary({ assistant: input.assistant, ...(input.directoryId ? { directoryId: input.directoryId } : {}), ...(input.companyId ? { companyId: input.companyId } : {}), ...(input.companyIds !== undefined ? { companyIds: input.companyIds } : {}) }), preferences: query.prefs, cv: query.cv, sourceProblems: problems(input, query.selected).items };
    },
    getDiscoveredJob(input = {}) {
      object(input, ['id', 'assistant', 'directoryId', 'companyIds', 'companyId']); const query = reviewQuery(input);
      const row = db.prepare(`SELECT j.payload,${query.state} AS match_state,COALESCE(current.payload,latest.payload) AS assessment_payload ${query.from} AND j.id=?`).get(...query.stateArgs, ...query.args, input.id);
      require(row, 'Discovered job not found in this scope.', 404); return project(row, query, true);
    },
    recordJobMatch(input = {}) {
      object(input, ['assistant', 'jobId', 'expectedContentHash', 'expectedPreferencesRevision', 'cvReference', 'decision', 'requirements', 'reason', 'nextStep']); actor(input.assistant); native();
      return tx(() => {
        const prefs = preferences(), cv = freshCv(input.assistant), job = read('discovery_jobs', input.jobId);
        require(job, 'Discovered job not found.', 404); require(job.contentHash === input.expectedContentHash && job.contentComplete && !job.needsDetail && job.latestObservationStatus !== 'unknown' && Date.parse(job.lastValidatedAt) >= Date.parse(now()) - 86400000, 'Read the actual current complete posting before assessing it.', 409);
        require(job.status !== 'closed', 'This posting was explicitly reported closed.');
        require(input.expectedPreferencesRevision === prefs.revision, 'Saved discovery preferences changed. Read them and reassess.', 409);
        object(input.cvReference, ['sourceId', 'versionHash'], 'CV reference'); require(cv.key && input.cvReference.sourceId === cv.id && input.cvReference.versionHash?.toLowerCase() === cv.versionHash?.toLowerCase(), 'Read and report the actual current CV source ID and versionHash in this client before matching.', 409);
        require(['suitable', 'not_suitable', 'needs_you'].includes(input.decision), 'Choose suitable, not_suitable or needs_you.');
        require(Array.isArray(input.requirements) && input.requirements.length <= 30, 'Record up to 30 bounded requirement citations.');
        const content = [job.description, ...(job.requirements || [])].join('\n').normalize('NFC').replace(/\s+/g, ' ');
        const requirements = input.requirements.map(value => { object(value, ['kind', 'jobQuote', 'cvFactRef', 'relation', 'reason'], 'requirement citation'); require(['required', 'preferred'].includes(value.kind) && ['supports', 'contradicts', 'unknown'].includes(value.relation), 'Use typed job requirements and their actual relationship to CV facts.'); const jobQuote = text(value.jobQuote, 'actual job requirement quote', 1000); require(content.includes(jobQuote.replace(/\s+/g, ' ')), 'Cite a requirement actually present in this stored posting.'); const cvFactRef = value.cvFactRef === undefined ? null : text(value.cvFactRef, 'opaque CV section or fact reference', 300); if (cvFactRef) require(/^[A-Za-z][A-Za-z0-9_:/.[\]#~-]{1,299}$/.test(cvFactRef), 'Use a CV fact or section reference, not copied CV text or contact details.'); if (value.relation === 'supports') require(cvFactRef, 'A supported requirement needs an actual CV fact reference.'); return { kind: value.kind, jobQuote, cvFactRef, relation: value.relation, ...(value.reason !== undefined ? { reason: text(value.reason, 'assessment explanation', 1000) } : {}) }; });
        if (input.decision === 'suitable') require(requirements.some(item => item.relation === 'supports') && !requirements.some(item => item.kind === 'required' && item.relation !== 'supports'), 'A suitable assessment needs supported CV references and no unknown or contradicted required requirement.');
        const next = input.nextStep === undefined ? null : text(input.nextStep, 'one actionable next step', 1000); require(input.decision !== 'needs_you' || next, 'Give one actionable next step for Needs you.');
        const assessment = { id: `match_${randomUUID()}`, jobId: job.id, contentHash: job.contentHash, cvReference: { sourceId: cv.id, versionHash: cv.versionHash }, criteriaHash: prefs.criteriaHash, preferencesRevision: prefs.revision, policyVersion: POLICY, assistant: input.assistant, decision: input.decision, requirements, reason: text(input.reason, 'match reason', 2000), nextStep: next, assessedAt: now(), clientReported: true, independentlyVerified: false };
        db.prepare('INSERT INTO discovery_assessments VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(job_id,content_hash,cv_key,criteria_hash,policy) DO UPDATE SET id=excluded.id,decision=excluded.decision,created_at=excluded.created_at,payload=excluded.payload').run(assessment.id, job.id, job.contentHash, cv.key, prefs.criteriaHash, POLICY, assessment.decision, now(), JSON.stringify(assessment));
        return methods.getDiscoveredJob({ id: job.id, assistant: input.assistant });
      });
    },
  };
  return methods;
}
