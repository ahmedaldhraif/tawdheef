import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { applicationMilestones } from './progress.mjs';

const KINDS = ['jobs', 'profiles', 'email', 'calendar'];
const ASSISTANTS = ['codex', 'claude-code'];
const hash = value => createHash('sha256').update(value).digest('hex');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const canonical = value => Array.isArray(value) ? value.map(canonical) : plain(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

/** Read-monitoring records only. Native Codex/Claude owns the clock; this module
 * never installs a schedule, calls a provider, or creates submission authority. */
export function createMonitoringStore({ db, getStore, tx, activity, now, ErrorType }) {
  db.exec(`CREATE INDEX IF NOT EXISTS companies_active_scope ON companies(directory_id,id) WHERE json_extract(payload,'$.archived') IS NOT 1;
    CREATE TABLE IF NOT EXISTS monitor_checks(id TEXT PRIMARY KEY, source_key TEXT NOT NULL, started_at TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS monitor_checks_source ON monitor_checks(source_key,started_at);
    CREATE INDEX IF NOT EXISTS monitor_checks_status ON monitor_checks(json_extract(payload,'$.status'),started_at);
    CREATE INDEX IF NOT EXISTS monitor_checks_success ON monitor_checks(json_extract(payload,'$.status'),json_extract(payload,'$.finishedAt'));
    CREATE INDEX IF NOT EXISTS monitor_checks_started ON monitor_checks(started_at);
    CREATE INDEX IF NOT EXISTS monitor_checks_finished ON monitor_checks(json_extract(payload,'$.finishedAt'));
    CREATE TABLE IF NOT EXISTS monitor_updates(id TEXT PRIMARY KEY, stable_key TEXT UNIQUE NOT NULL, updated_at TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS monitor_updates_time ON monitor_updates(updated_at);
    CREATE INDEX IF NOT EXISTS monitor_updates_unread ON monitor_updates(json_extract(payload,'$.acknowledgedAt'));`);
  const fail = (message, status = 400) => { throw new ErrorType(message, status); };
  const require = (condition, message, status) => { if (!condition) fail(message, status); };
  const object = (value, keys, label = 'monitoring options') => {
    require(plain(value), `Supply an object for ${label}.`);
    require(Object.keys(value).every(key => keys.includes(key)), `Use only supported ${label} fields.`);
  };
  const string = (value, label, maximum = 2048, empty = false) => {
    require(typeof value === 'string' && (empty || value.trim()) && value.length <= maximum && !/[\0\r\n]/.test(value), `Use valid ${label}, up to ${maximum} characters.`);
    return value;
  };
  const ids = (value, label) => {
    require(Array.isArray(value), `${label} must be a list of IDs.`);
    return [...new Set(value.map(item => string(item, label)))];
  };
  const read = (table, id) => { const row = db.prepare(`SELECT payload FROM ${table} WHERE id=?`).get(id); return row ? JSON.parse(row.payload) : null; };
  const saveSetting = (id, payload) => db.prepare('INSERT INTO settings(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(id, JSON.stringify(payload));
  const checks = ({ sourceKey, status } = {}) => {
    const where = [], args = [];
    if (sourceKey) { where.push('source_key=?'); args.push(sourceKey); }
    if (status) { where.push("json_extract(payload,'$.status')=?"); args.push(status); }
    return db.prepare('SELECT payload FROM monitor_checks' + (where.length ? ` WHERE ${where.join(' AND ')}` : '') + ' ORDER BY started_at DESC,rowid DESC').all(...args).map(row => JSON.parse(row.payload));
  };
  const saveCheck = check => db.prepare('INSERT INTO monitor_checks VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(check.id, check.sourceKey, check.startedAt, JSON.stringify(check));
  const publicCheck = check => { const { tokenHash, ...result } = check; return structuredClone(result); };
  const config = () => read('settings', 'monitoring') || {
    revision: 1, enabled: false,
    assistant: getStore().getSettings().preferredAssistant || 'codex',
    frequency: 'daily', time: '09:00', timezone: getStore().getSettings().timezone,
    channels: Object.fromEntries(KINDS.map(kind => [kind, false])),
    scope: { directoryIds: [], companyIds: [], calendarIds: [] }, instructions: '',
  };
  const safeUrl = value => {
    if (!value) return '';
    string(value, 'evidence URL', 8192);
    let url; try { url = new URL(value); } catch { fail('Use a complete HTTP(S) evidence URL.'); }
    require(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, 'Use an HTTP(S) evidence URL without credentials.');
    return url.href;
  };
  const pageUrl = value => {
    string(value, 'source page URL', 8192);
    const url = new URL(safeUrl(value)); url.hash = '';
    return url.href;
  };
  function browserSourceRead(value, check) {
    object(value, ['method', 'url', 'observedAt', 'evidence'], 'browser source evidence');
    require(value.method === 'native_browser' && ['jobs', 'profiles'].includes(check.source.kind), 'Use native_browser evidence only for a saved jobs/profile source.');
    const url = pageUrl(value.url), expected = [pageUrl(check.source.url), ...(check.pageUrl ? [check.pageUrl] : [])];
    require(expected.includes(url), 'Browser evidence must identify the exact saved source or its server-observed final page URL.');
    const parsed = new URL(url);
    require(![...parsed.searchParams.keys()].some(key => /^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|password|api[_-]?key|secret|client[_-]?secret|authorization|cookie|session(?:[_-]?(?:id|token))?)$/i.test(key)), 'Keep credentials and session tokens out of browser evidence.');
    string(value.observedAt, 'browser observation timestamp', 100);
    const observed = Date.parse(value.observedAt), tolerance = 5 * 60_000;
    require(/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(value.observedAt) && Number.isFinite(observed) && observed >= Date.parse(check.startedAt) - tolerance && observed <= Math.min(Date.parse(check.expiresAt) + tolerance, Date.parse(now()) + tolerance), 'Use a fresh browser observation from this check lease, within five minutes of clock tolerance.');
    require(typeof value.evidence === 'string' && value.evidence.trim() && value.evidence.length <= 4000 && !value.evidence.includes('\0'), 'Supply browser source evidence from 1 to 4,000 characters.');
    require(!/\bbearer\s+\S+|\b(?:password|api[_ -]?key|secret|token|access[_ -]?token|refresh[_ -]?token|id[_ -]?token|client[_ -]?secret|authorization|cookie|session(?:[_ -]?(?:id|token))?)["']?\s*[:=]/i.test(value.evidence), 'Keep credentials and session tokens out of browser evidence.');
    return { method: 'native_browser', url, observedAt: new Date(observed).toISOString(), evidence: value.evidence.trim(), clientReported: true };
  }
  const json = (value, label) => {
    require(plain(value), `${label} must be a JSON object.`);
    let bytes;
    try { bytes = JSON.stringify(value); } catch { fail(`${label} must be readable JSON.`); }
    require(bytes.length <= 20000, `${label} must stay under 20,000 characters.`);
    const copy = JSON.parse(bytes);
    function inspect(item, depth = 0) {
      require(depth <= 8, `${label} is too deeply nested.`);
      if (Array.isArray(item)) item.forEach(value => inspect(value, depth + 1));
      else if (plain(item)) for (const [key, value] of Object.entries(item)) {
        require(!/password|access.?token|refresh.?token|client.?secret|cookie|authorization|session.?token/i.test(key), 'Keep credentials, cookies and session tokens out of monitoring records.');
        require(!['__proto__', 'prototype', 'constructor'].includes(key), 'Use ordinary observation field names.');
        inspect(value, depth + 1);
      }
    }
    inspect(copy);
    return copy;
  };

  function companyScope(current) {
    const where = ["json_extract(c.payload,'$.archived') IS NOT 1", "json_extract(d.payload,'$.archived') IS NOT 1"], args = [];
    if (current.scope.directoryIds.length) { where.push('c.directory_id IN (SELECT value FROM json_each(?))'); args.push(JSON.stringify(current.scope.directoryIds)); }
    if (current.scope.companyIds.length) { where.push('c.id IN (SELECT value FROM json_each(?))'); args.push(JSON.stringify(current.scope.companyIds)); }
    return { predicate: where.join(' AND '), args };
  }
  function hasScopedCompany(current) {
    const { predicate, args } = companyScope(current);
    return Boolean(db.prepare(`SELECT 1 FROM companies c JOIN directories d ON d.id=c.directory_id WHERE ${predicate} LIMIT 1`).get(...args));
  }
  function jobSourcesPage(current, offset, limit) {
    const { predicate, args } = companyScope(current);
    const from = `FROM companies c JOIN directories d ON d.id=c.directory_id WHERE ${predicate}`;
    const total = Number(db.prepare(`SELECT COUNT(*) AS n ${from}`).get(...args).n);
    const items = db.prepare(`WITH page AS (SELECT c.rowid AS source_order ${from} ORDER BY c.rowid LIMIT ? OFFSET ?)
      SELECT c.id,c.name,json_extract(c.payload,'$.careersUrl') AS careersUrl,
      json_extract(c.payload,'$.applyUrl') AS applyUrl,json_extract(c.payload,'$.website') AS website
      FROM page JOIN companies c ON c.rowid=page.source_order ORDER BY page.source_order`).all(...args, limit, offset).map(jobSource);
    return { items, total };
  }
  function scopedCompany(current, id) {
    const company = read('companies', id), directory = company && read('directories', company.directoryId);
    return company && !company.archived && directory && !directory.archived &&
      (!current.scope.directoryIds.length || current.scope.directoryIds.includes(company.directoryId)) &&
      (!current.scope.companyIds.length || current.scope.companyIds.includes(company.id)) ? company : null;
  }
  const jobSource = company => ({ kind: 'jobs', id: company.id, companyId: company.id, name: company.name, url: company.careersUrl || company.applyUrl || company.website || '' });
  function emailSource(application, company) {
    if (application?.method !== 'email' || !application.threadId || !(application.appliedAt || application.cvSentAt) || ['sending', 'unknown', 'failed'].includes(application.deliveryStatus)) return null;
    return { kind: 'email', id: application.id, applicationId: application.id, companyId: application.companyId, name: company.name, threadId: application.threadId, recipient: application.to || company.email || '', provider: application.provider || application.evidence?.provider || '', accountId: application.accountId || application.evidence?.accountId || '' };
  }
  function profileSources(application, company) {
    const result = [];
    for (const milestone of applicationMilestones(application)) {
      if (milestone.event !== 'profile_created' || !milestone.url) continue;
      const url = safeUrl(milestone.url);
      result.push({ kind: 'profiles', id: `${application.id}:${hash(url).slice(0, 20)}`, applicationId: application.id, companyId: application.companyId, name: company.name, url });
    }
    return result;
  }
  function sources(current, kind) {
    if (kind === 'calendar') return current.scope.calendarIds.map(id => ({ kind, id, calendarId: id, forecastDays: 14, limit: 100 }));
    const { predicate, args } = companyScope(current);
    const relevant = kind === 'email'
      ? "json_extract(a.payload,'$.method')='email' AND COALESCE(json_extract(a.payload,'$.threadId'),'')<>'' AND (COALESCE(json_extract(a.payload,'$.appliedAt'),'')<>'' OR COALESCE(json_extract(a.payload,'$.cvSentAt'),'')<>'') AND COALESCE(json_extract(a.payload,'$.deliveryStatus'),'') NOT IN ('sending','unknown','failed')"
      : "(json_extract(a.payload,'$.status')='profile_created' OR EXISTS (SELECT 1 FROM json_each(a.payload,'$.milestones') m WHERE json_extract(CASE WHEN m.type='object' THEN m.value ELSE '{}' END,'$.event')='profile_created'))";
    const rows = db.prepare(`SELECT a.payload,c.name,json_extract(c.payload,'$.email') AS email FROM applications a
      JOIN companies c ON c.id=a.company_id JOIN directories d ON d.id=c.directory_id
      WHERE ${predicate} AND ${relevant} ORDER BY a.rowid`).all(...args);
    const applications = rows.map(row => ({ application: JSON.parse(row.payload), company: { name: row.name, email: row.email } }));
    if (kind === 'email') return applications.map(({ application, company }) => emailSource(application, company)).filter(Boolean);
    const result = [], seen = new Set();
    for (const { application, company } of applications) for (const source of profileSources(application, company)) {
      const destination = `${source.companyId}:${source.url}`;
      if (seen.has(destination)) continue;
      seen.add(destination);
      result.push(source);
    }
    return result;
  }
  function sourceFor(current, source) {
    object(source, ['kind', 'id'], 'monitoring source');
    require(KINDS.includes(source.kind), 'Choose jobs, profiles, email or calendar.');
    string(source.id, 'source ID');
    require(current.enabled && current.channels[source.kind], 'Enable this monitoring channel explicitly before checking it.');
    let found;
    if (source.kind === 'calendar') {
      if (current.scope.calendarIds.includes(source.id)) found = { kind: 'calendar', id: source.id, calendarId: source.id, forecastDays: 14, limit: 100 };
    } else if (source.kind === 'jobs') {
      const company = scopedCompany(current, source.id);
      if (company) found = jobSource(company);
    } else {
      const applicationId = source.kind === 'profiles' ? source.id.slice(0, source.id.lastIndexOf(':')) : source.id;
      const application = read('applications', applicationId), company = application && scopedCompany(current, application.companyId);
      if (company) found = source.kind === 'email' ? emailSource(application, company) : profileSources(application, company).find(item => item.id === source.id);
    }
    require(found, 'This source is outside the saved monitoring scope or is no longer available.');
    return found;
  }
  function revoke(reason) {
    let revoked = 0;
    for (const check of checks({ status: 'running' })) {
      check.status = 'revoked'; check.finishedAt = now(); check.summary = reason;
      saveCheck(check); revoked++;
    }
    return revoked;
  }
  function validateCheck(input) {
    object(input, ['id', 'token'], 'check identity');
    string(input.id, 'check ID', 200); string(input.token, 'check token', 200);
    const check = read('monitor_checks', input.id);
    require(check, 'Monitoring check not found.', 404);
    const actual = Buffer.from(hash(input.token), 'hex'), expected = Buffer.from(check.tokenHash, 'hex');
    require(actual.length === expected.length && timingSafeEqual(actual, expected), 'The monitoring check token is invalid.', 403);
    const current = config();
    require(check.status === 'running' && Date.parse(check.expiresAt) > Date.parse(now()), 'This monitoring check expired or was revoked.', 409);
    require(current.enabled && check.configurationRevision === current.revision && check.assistant === current.assistant, 'Monitoring settings changed. Begin a new check using the current configuration.', 409);
    sourceFor(current, { kind: check.source.kind, id: check.source.id });
    return check;
  }
  function page(input, allowed) {
    object(input, allowed);
    const offset = input.offset ?? 0, limit = input.limit ?? 20;
    require(Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(limit) && limit >= 1 && limit <= 100, 'Use a nonnegative offset and a limit from 1 to 100.');
    return { offset, limit };
  }

  return {
    getMonitoring() {
      const current = config();
      const latest = db.prepare("SELECT started_at FROM monitor_checks WHERE json_extract(payload,'$.configurationRevision')=? ORDER BY started_at DESC,rowid DESC LIMIT 1").get(current.revision);
      const success = db.prepare("SELECT MAX(json_extract(payload,'$.finishedAt')) AS finished_at FROM monitor_checks WHERE json_extract(payload,'$.configurationRevision')=? AND json_extract(payload,'$.status')='checked'").get(current.revision);
      const schedule = read('settings', 'monitoring_schedule_report');
      const unreadCount = Number(db.prepare("SELECT COUNT(*) AS n FROM monitor_updates WHERE json_extract(payload,'$.acknowledgedAt') IS NULL").get().n);
      const needsYou = new Set(db.prepare("SELECT DISTINCT json_extract(u.payload,'$.source.kind') AS kind,json_extract(u.payload,'$.source.id') AS id FROM monitor_updates u JOIN monitor_checks c ON c.id=json_extract(u.payload,'$.checkId') WHERE json_extract(c.payload,'$.configurationRevision')=? AND json_extract(u.payload,'$.acknowledgedAt') IS NULL AND json_extract(u.payload,'$.status') IN ('unknown','error')").all(current.revision).map(source => hash(JSON.stringify([source.kind, source.id]))));
      const failures = db.prepare(`SELECT candidate.payload FROM monitor_checks candidate
        WHERE json_extract(candidate.payload,'$.configurationRevision')=? AND json_extract(candidate.payload,'$.status') IN ('unknown','error')
        AND NOT EXISTS (SELECT 1 FROM monitor_checks newer WHERE newer.source_key=candidate.source_key AND json_extract(newer.payload,'$.configurationRevision')=json_extract(candidate.payload,'$.configurationRevision') AND json_extract(newer.payload,'$.finishedAt') IS NOT NULL
          AND (json_extract(newer.payload,'$.finishedAt') > json_extract(candidate.payload,'$.finishedAt') OR
            (json_extract(newer.payload,'$.finishedAt')=json_extract(candidate.payload,'$.finishedAt') AND newer.rowid>candidate.rowid)))`).all(current.revision);
      for (const row of failures) needsYou.add(JSON.parse(row.payload).sourceKey);
      const finished = db.prepare("SELECT payload FROM monitor_checks WHERE json_extract(payload,'$.configurationRevision')=? AND json_extract(payload,'$.finishedAt') IS NOT NULL ORDER BY json_extract(payload,'$.finishedAt') DESC,rowid DESC LIMIT 1").get(current.revision);
      return { config: structuredClone(current), status: {
        lastCheckAt: latest?.started_at || null,
        lastSuccessAt: success?.finished_at || null,
        unreadCount,
        needsYouCount: needsYou.size,
        latestSummary: finished ? JSON.parse(finished.payload).summary || null : null,
        activeChecks: checks({ status: 'running' }).filter(check => check.configurationRevision === current.revision && Date.parse(check.expiresAt) > Date.parse(now())).length,
        externalScheduleStatus: schedule?.configurationRevision === current.revision && schedule.assistant === current.assistant ? 'reported' : 'unknown',
        nextRunAt: null,
      } };
    },
    configureMonitoring(input = {}) {
      object(input, ['expectedRevision', 'explicit', 'patch']);
      object(input.patch, ['enabled', 'assistant', 'frequency', 'time', 'timezone', 'channels', 'scope', 'instructions'], 'monitoring configuration');
      return tx(() => {
        const previous = config();
        require(input.expectedRevision === previous.revision, 'Monitoring settings changed. Read them, merge and retry with expectedRevision.', 409);
        const next = { ...previous, ...input.patch, channels: { ...previous.channels }, scope: { ...previous.scope } };
        if (input.patch.channels !== undefined) {
          object(input.patch.channels, KINDS, 'monitoring channels');
          for (const [kind, enabled] of Object.entries(input.patch.channels)) { require(typeof enabled === 'boolean', 'Monitoring channel selections must be true or false.'); next.channels[kind] = enabled; }
        }
        if (input.patch.scope !== undefined) {
          object(input.patch.scope, ['directoryIds', 'companyIds', 'calendarIds'], 'monitoring scope');
          for (const [key, value] of Object.entries(input.patch.scope)) next.scope[key] = ids(value, key);
        }
        require(typeof next.enabled === 'boolean', 'Monitoring enabled must be true or false.');
        require(ASSISTANTS.includes(next.assistant), 'Choose Codex or Claude Code for monitoring.');
        require(['hourly', 'daily', 'weekly'].includes(next.frequency), 'Choose an hourly, daily or weekly native-client recipe.');
        require(typeof next.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(next.time), 'Choose a valid monitoring recipe time.');
        string(next.timezone, 'time zone', 100);
        try { new Intl.DateTimeFormat('en', { timeZone: next.timezone }).format(); } catch { fail('Choose a valid monitoring time zone.'); }
        require(typeof next.instructions === 'string' && next.instructions.length <= 2000 && !next.instructions.includes('\0'), 'Keep monitoring role/location preferences under 2,000 characters.');
        for (const id of next.scope.directoryIds) require(read('directories', id) && !read('directories', id).archived, 'Choose active directories for monitoring.');
        for (const id of next.scope.companyIds) require(read('companies', id) && !read('companies', id).archived, 'Choose active companies for monitoring.');
        if (next.enabled) {
          require(input.explicit === true, 'Explicitly enable monitoring for the saved read-only scope.');
          require(Object.values(next.channels).some(Boolean), 'Choose at least one monitoring channel.');
          if (next.channels.jobs || next.channels.profiles) require((next.scope.directoryIds.length || next.scope.companyIds.length) && hasScopedCompany(next), 'Choose at least one active company or directory for job/profile monitoring.');
          if (next.channels.calendar) require(next.scope.calendarIds.length, 'Choose calendar IDs before enabling calendar monitoring.');
        }
        next.revision = previous.revision + 1;
        saveSetting('monitoring', next);
        // One owner for recurring tracked-mail reads. Explicit native monitoring
        // pauses only the legacy reply timer; turning it off never resumes it.
        if (next.enabled && next.channels.email) saveSetting('main', { ...read('settings', 'main'), refreshFrequency: 'manual' });
        revoke('Monitoring configuration changed; the old check authority was revoked.');
        activity('monitoring_configured', next.enabled ? 'Read-only monitoring scope saved. Native client scheduling remains unverified.' : 'Monitoring disabled. No native-client schedule was created or removed.');
        return getStore().getMonitoring();
      });
    },
    listMonitoringSources(input = {}) {
      const { offset, limit } = page(input, ['kind', 'limit', 'offset']);
      require(KINDS.includes(input.kind), 'Choose jobs, profiles, email or calendar.');
      const ownTransaction = !db.isTransaction;
      if (ownTransaction) db.exec('BEGIN');
      try {
        const current = config();
        let items = [], total = 0;
        if (current.enabled && current.channels[input.kind]) {
          if (input.kind === 'jobs') ({ items, total } = jobSourcesPage(current, offset, limit));
          else { const rows = sources(current, input.kind); items = rows.slice(offset, offset + limit); total = rows.length; }
        }
        const result = { configurationRevision: current.revision, assistant: current.assistant, kind: input.kind, items, total, offset, limit, nextOffset: offset + limit < total ? offset + limit : null };
        if (ownTransaction) db.exec('COMMIT');
        return result;
      } catch (error) { if (ownTransaction) db.exec('ROLLBACK'); throw error; }
    },
    beginMonitoringCheck(input = {}) {
      object(input, ['configurationRevision', 'assistant', 'source', 'provider', 'accountId', 'leaseMs']);
      return tx(() => {
        const current = config();
        require(input.configurationRevision === current.revision, 'Use the current monitoring configuration revision.', 409);
        require(input.assistant === current.assistant, 'Use the assistant selected in monitoring settings.');
        const source = sourceFor(current, input.source);
        const provider = string(input.provider ?? source.provider ?? '', 'provider identity', 200, true), accountId = string(input.accountId ?? source.accountId ?? '', 'account identity', 2048, true);
        if (source.kind === 'email') {
          require(!source.provider || source.provider === provider, 'Keep the original tracked email provider.');
          require(!source.accountId || source.accountId === accountId, 'Read the tracked thread only through its original mailbox account.');
        }
        const leaseMs = input.leaseMs ?? 10 * 60000;
        require(Number.isSafeInteger(leaseMs) && leaseMs >= 1000 && leaseMs <= 20 * 60000, 'Use a monitoring lease from one second to twenty minutes.');
        const sourceKey = hash(JSON.stringify([source.kind, source.id]));
        const previous = checks({ sourceKey });
        const active = previous.find(check => check.status === 'running' && Date.parse(check.expiresAt) > Date.parse(now()));
        if (active) return { check: publicCheck(active), reused: true, token: null, nextStep: 'This source already has an active check. Do not duplicate it.' };
        for (const check of previous.filter(check => check.status === 'running')) { check.status = 'expired'; check.finishedAt = now(); saveCheck(check); }
        const token = randomBytes(32).toString('base64url');
        const prior = previous.find(check => check.status === 'checked' && check.provider === provider && check.accountId === accountId && (!['jobs', 'profiles'].includes(source.kind) || check.source.url === source.url));
        const check = { id: `monitor_${randomUUID()}`, sourceKey, configurationRevision: current.revision, assistant: current.assistant, source, provider, accountId, startedAt: now(), expiresAt: new Date(Date.parse(now()) + leaseMs).toISOString(), status: 'running', tokenHash: hash(token), cursor: prior?.cursor ?? null };
        saveCheck(check);
        return { check: publicCheck(check), token, reused: false };
      });
    },
    getMonitoringCheck(input = {}) { return publicCheck(validateCheck(input)); },
    noteMonitoringPage(input = {}) {
      object(input, ['id', 'token', 'url']);
      return tx(() => {
        const check = validateCheck({ id: input.id, token: input.token });
        require(['jobs', 'profiles'].includes(check.source.kind), 'Record a page URL only for a saved jobs/profile source.');
        check.pageUrl = pageUrl(input.url); saveCheck(check);
        return publicCheck(check);
      });
    },
    finishMonitoringCheck(input = {}) {
      object(input, ['id', 'token', 'status', 'observations', 'cursor', 'summary', 'complete', 'provider', 'accountId', 'sourceRead']);
      return tx(() => {
        const check = validateCheck({ id: input.id, token: input.token });
        require(['checked', 'partial', 'unknown', 'error'].includes(input.status), 'Choose checked, partial, unknown or error for this source check.');
        require(input.complete === undefined || typeof input.complete === 'boolean', 'Complete must be true or false.');
        const status = input.status === 'checked' && input.complete === false ? 'partial' : input.status;
        const sourceRead = input.sourceRead === undefined ? null : browserSourceRead(input.sourceRead, check);
        if (sourceRead && status === 'checked') require(input.complete === true, 'Confirm complete:true for a completed browser source read.');
        for (const [key, maximum] of [['provider', 200], ['accountId', 2048]]) if (input[key] !== undefined) {
          string(input[key], `${key} identity`, maximum);
          require(!check[key] || check[key] === input[key], 'Keep the original monitoring provider and account identity.'); check[key] = input[key];
        }
        if (['email', 'calendar'].includes(check.source.kind) && status === 'checked') require(check.provider && check.accountId, 'A completed provider check needs its actual provider and account identity.');
        const observations = input.observations ?? [];
        require(Array.isArray(observations) && observations.length <= 100, 'Record up to 100 observations per bounded check.');
        let added = 0, changed = 0, unchanged = 0;
        for (const observation of observations) {
          object(observation, ['externalId', 'title', 'summary', 'url', 'status', 'data', 'evidence'], 'observation');
          const externalId = string(observation.externalId, 'external item ID');
          const title = string(observation.title, 'observation title', 500);
          const summary = string(observation.summary ?? '', 'observation summary', 2000, true);
          const incoming = observation.status ?? 'new';
          require(['new', 'changed', 'unknown', 'error'].includes(incoming), 'Choose new, changed, unknown or error for an observation.');
          if (['email', 'calendar'].includes(check.source.kind) && ['new', 'changed'].includes(incoming)) require(check.provider && check.accountId, 'Provider observations need the actual provider and account identity.');
          const url = safeUrl(observation.url), data = json(observation.data ?? {}, 'Observation data');
          const evidence = observation.evidence === undefined ? null : typeof observation.evidence === 'string' ? string(observation.evidence, 'observation evidence', 4000) : json(observation.evidence, 'Observation evidence');
          require(!Object.hasOwn(data, 'removed') && !Object.hasOwn(data, 'deleted'), 'Absence is not evidence of removal. Record an explicit sourced status instead.');
          const stableKey = hash(JSON.stringify([check.source.kind, check.source.id, check.provider, check.accountId, externalId]));
          const fingerprint = hash(JSON.stringify(canonical({ title, url, data, uncertainty: ['unknown', 'error'].includes(incoming) ? [incoming, summary] : null })));
          const row = db.prepare('SELECT payload FROM monitor_updates WHERE stable_key=?').get(stableKey), previous = row ? JSON.parse(row.payload) : null;
          if (previous?.fingerprint === fingerprint) { previous.lastSeenAt = now(); previous.checkId = check.id; db.prepare('UPDATE monitor_updates SET payload=? WHERE id=?').run(JSON.stringify(previous), previous.id); unchanged++; continue; }
          const item = { ...(previous || {}), id: previous?.id || `update_${randomUUID()}`, revision: (previous?.revision || 0) + 1, source: check.source, provider: check.provider, accountId: check.accountId, externalId, title, summary, url, data, evidence, fingerprint, status: ['unknown', 'error'].includes(incoming) ? incoming : previous ? 'changed' : 'new', firstSeenAt: previous?.firstSeenAt || now(), lastSeenAt: now(), changedAt: now(), acknowledgedAt: null, checkId: check.id };
          if (previous && ['unknown', 'error'].includes(incoming)) {
            if (['new', 'changed'].includes(previous.status)) item.lastObserved = { title: previous.title, url: previous.url, data: previous.data, evidence: previous.evidence, observedAt: previous.changedAt };
          } else delete item.lastObserved;
          db.prepare('INSERT INTO monitor_updates VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,payload=excluded.payload').run(item.id, stableKey, item.changedAt, JSON.stringify(item));
          if (previous) changed++; else added++;
        }
        if (input.cursor !== undefined) {
          require(input.cursor === null || typeof input.cursor === 'string' && input.cursor.length <= 8192 && !/[\0\r\n]/.test(input.cursor), 'Use a bounded opaque read cursor or null.');
          if (status === 'checked') check.cursor = input.cursor;
        }
        if (sourceRead) { check.sourceRead = sourceRead; check.cursor = null; }
        check.status = status; check.finishedAt = now(); check.complete = status === 'checked'; check.summary = string(input.summary ?? '', 'check summary', 2000, true); check.counts = { added, changed, unchanged };
        saveCheck(check);
        activity('monitoring_checked', `${check.source.kind}: ${status}; ${added} new, ${changed} changed.`, check.source.companyId || null);
        return { check: publicCheck(check), added, changed, unchanged };
      });
    },
    listMonitoringUpdates(input = {}) {
      const { offset, limit } = page(input, ['status', 'unread', 'compact', 'limit', 'offset']);
      require(input.status === undefined || ['new', 'changed', 'unknown', 'error'].includes(input.status), 'Choose a supported monitoring update status.');
      require(input.unread === undefined || typeof input.unread === 'boolean', 'Unread must be true or false.');
      require(input.compact === undefined || typeof input.compact === 'boolean', 'Compact must be true or false.');
      const where = [], args = [];
      if (input.status) { where.push("json_extract(payload,'$.status')=?"); args.push(input.status); }
      if (input.unread !== undefined) where.push(`json_extract(payload,'$.acknowledgedAt') IS ${input.unread ? '' : 'NOT '}NULL`);
      const predicate = where.length ? ` WHERE ${where.join(' AND ')}` : '';
      const total = Number(db.prepare(`SELECT COUNT(*) AS n FROM monitor_updates${predicate}`).get(...args).n);
      const records = db.prepare(`SELECT payload FROM monitor_updates${predicate} ORDER BY updated_at DESC,rowid DESC LIMIT ? OFFSET ?`).all(...args, limit, offset).map(row => JSON.parse(row.payload));
      const items = input.compact === false ? records : records.map(({ data, evidence, lastObserved, fingerprint, ...item }) => ({ ...item, detailsAvailable: true }));
      return { items, total, offset, limit, compact: input.compact !== false, nextOffset: offset + limit < total ? offset + limit : null };
    },
    acknowledgeMonitoringUpdate(input = {}) {
      object(input, ['id', 'expectedRevision']);
      return tx(() => {
        const item = read('monitor_updates', string(input.id, 'update ID', 200));
        require(item, 'Monitoring update not found.', 404);
        require(input.expectedRevision === item.revision, 'This update changed. Read it again before acknowledging.', 409);
        item.acknowledgedAt ||= now();
        db.prepare('UPDATE monitor_updates SET payload=? WHERE id=?').run(JSON.stringify(item), item.id);
        return item;
      });
    },
    revokeMonitoringChecks(input = {}) {
      object(input, ['reason']);
      const reason = string(input.reason ?? 'Monitoring check authority was revoked.', 'revocation reason', 500);
      return tx(() => ({ revoked: revoke(reason) }));
    },
    reportMonitoringSchedule(input = {}) {
      object(input, ['configurationRevision', 'assistant', 'description', 'externalId']);
      return tx(() => {
        const current = config();
        require(input.configurationRevision === current.revision && input.assistant === current.assistant, 'Report the native schedule only for the current monitoring configuration.', 409);
        const report = { configurationRevision: current.revision, assistant: current.assistant, reportedAt: now(), description: string(input.description ?? '', 'schedule description', 1000, true), externalId: string(input.externalId ?? '', 'external schedule ID', 500, true) };
        saveSetting('monitoring_schedule_report', report);
        return { externalScheduleStatus: 'reported', verified: false, nextRunAt: null };
      });
    },
  };
}
