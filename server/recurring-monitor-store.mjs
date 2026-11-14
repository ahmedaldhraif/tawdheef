import { createHash, randomUUID } from 'node:crypto';

const PERIOD = { daily: 86_400_000, weekly: 7 * 86_400_000 };
const blankActions = () => ({ applyMatchingJobs: false, createProfiles: false, sendCvEmails: false });
const fail = (message, status = 400) => { const error = new Error(message); error.status = status; throw error; };
const requireValue = (value, message, status) => { if (!value) fail(message, status); };
const object = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const string = (value, label, max = 1000) => { requireValue(typeof value === 'string' && value.trim() && value.length <= max, `${label} must be nonempty text, up to ${max} characters.`); return value.trim(); };
const strings = (value = [], label) => { requireValue(Array.isArray(value) && value.length <= 100, `${label} must be a list of text.`); return [...new Set(value.map(item => string(item, label, 500)))]; };
const roleKey = value => String(value || '').trim().toLocaleLowerCase('en').replace(/\s+/g, ' ');
const hash = value => createHash('sha256').update(value).digest('hex');
const scopeFacts = company => ({ name: roleKey(company.name), website: company.website || '', careersUrl: company.careersUrl || '', applyUrl: company.applyUrl || '', email: (company.email || '').toLowerCase() });

function publicUrl(value) {
  let url;
  try { url = new URL(value); } catch { fail('Use a complete public http or https source/job URL.'); }
  requireValue(['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && url.hostname !== 'localhost' && !/^(?:127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(url.hostname) && !url.hostname.startsWith('['), 'Use a public source/job URL without credentials or local addresses.');
  url.hash = '';
  requireValue(![...url.searchParams.keys()].some(key => /^(?:access_token|refresh_token|api_key|password|secret|session|sessionid|authorization)$/i.test(key)), 'Do not record credentials or session tokens in job/source URLs.');
  for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key)) url.searchParams.delete(key);
  return url.href;
}

/** Persistent monitoring facts and explicit, bounded recurring authority. No provider calls. */
export function createRecurringMonitoringStore({ db, store, clock = () => new Date() }) {
  const now = () => new Date(clock()).toISOString();
  const transaction = fn => { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; } };
  db.exec(`CREATE TABLE IF NOT EXISTS monitoring_rules(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS monitored_jobs(id TEXT PRIMARY KEY, rule_id TEXT NOT NULL, company_id TEXT NOT NULL, job_key TEXT NOT NULL, matched INTEGER NOT NULL, last_seen TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS monitored_jobs_rule ON monitored_jobs(rule_id,last_seen);
    CREATE INDEX IF NOT EXISTS monitored_jobs_company ON monitored_jobs(company_id,matched,last_seen);
    CREATE TABLE IF NOT EXISTS monitoring_checks(id TEXT PRIMARY KEY, run_id TEXT NOT NULL, rule_id TEXT NOT NULL, company_id TEXT NOT NULL, payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS monitoring_checks_run ON monitoring_checks(run_id,company_id);
    CREATE TABLE IF NOT EXISTS monitoring_application_checks(id TEXT PRIMARY KEY,run_id TEXT NOT NULL,rule_id TEXT NOT NULL,company_id TEXT NOT NULL,application_id TEXT NOT NULL,status TEXT NOT NULL,observed_at TEXT NOT NULL,payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS monitoring_application_checks_period ON monitoring_application_checks(rule_id,observed_at);`);
  const readRule = id => { const row = db.prepare('SELECT payload FROM monitoring_rules WHERE id=?').get(id); requireValue(row, 'Monitoring rule not found.', 404); return JSON.parse(row.payload); };
  const writeRule = rule => { db.prepare('INSERT INTO monitoring_rules VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(rule.id, JSON.stringify(rule)); return rule; };
  const activeRule = id => { const rule = readRule(id); requireValue(rule.enabled && (!rule.expiresAt || Date.parse(rule.expiresAt) > Date.parse(now())), 'This monitoring rule is paused or expired. Enable it explicitly before another check.'); return rule; };
  const directory = id => { const result = store.listDirectories().find(item => item.id === id); requireValue(result, 'Choose an active directory.'); return result; };
  const cancelRuleRuns = id => {
    for (const run of store.listRuns()) if (run.monitoringRuleId === id && run.status === 'running') store.updateRun(run.id, { status: 'cancelled', notes: 'Monitoring permission changed. Check the saved rule before restarting.' });
  };
  const methods = {
    listMonitoringRules({ directoryId } = {}) {
      return db.prepare('SELECT payload FROM monitoring_rules ORDER BY rowid DESC').all().map(row => JSON.parse(row.payload)).filter(rule => !directoryId || rule.directoryId === directoryId).map(rule => ({ ...rule, expired: Boolean(rule.expiresAt && Date.parse(rule.expiresAt) <= Date.parse(now())) }));
    },
    getMonitoringRule(id) { return readRule(id); },
    monitoringJobKey(id) {
      if (typeof id !== 'string') return null;
      return db.prepare('SELECT job_key FROM monitored_jobs WHERE id=?').get(id)?.job_key || null;
    },
    saveMonitoringRule(input = {}) {
      requireValue(object(input), 'Supply monitoring settings.');
      const allowed = new Set(['id', 'expectedRevision', 'directoryId', 'companyIds', 'name', 'assistant', 'frequency', 'mode', 'criteria', 'enabled', 'explicit', 'expiresAt', 'search', 'status', 'attention', 'companyTypes', 'locations']);
      requireValue(Object.keys(input).every(key => allowed.has(key)), 'Use supported monitoring settings only.');
      const previous = input.id ? readRule(input.id) : null;
      if (previous) requireValue(input.expectedRevision === previous.revision, 'Monitoring rule changed. Read it and retry with its revision.', 409);
      const selectedDirectory = directory(input.directoryId || previous?.directoryId);
      const hasFilters = ['search', 'status', 'attention', 'companyTypes', 'locations'].some(key => Object.hasOwn(input, key));
      let scopeIds;
      if (!previous || hasFilters || input.companyIds !== undefined) {
        scopeIds = [];
        let offset = 0, page;
        do { page = store.listCompanies({ directoryId: selectedDirectory.id, search: input.search || '', status: input.status || '', attention: input.attention || '', companyTypes: input.companyTypes, locations: input.locations, limit: 5000, offset }); scopeIds.push(...page.items.map(item => item.id)); offset += page.items.length; } while (offset < page.total && page.items.length);
      }
      const ids = input.companyIds === undefined ? scopeIds || previous?.companyIds : input.companyIds;
      requireValue(Array.isArray(ids) && ids.length > 0 && ids.every(id => typeof id === 'string'), 'Choose at least one company to monitor.');
      const companyIds = [...new Set(ids)].filter(id => !scopeIds || scopeIds.includes(id));
      requireValue(companyIds.length > 0, 'No companies match this monitoring scope.');
      requireValue(companyIds.every(id => { const item = store.getCompany(id); return !item.archived && item.directoryId === selectedDirectory.id; }), 'Monitor only active companies in the selected directory.');
      const assistant = input.assistant || previous?.assistant || 'codex', frequency = input.frequency || previous?.frequency || 'weekly', mode = input.mode || previous?.mode || 'notify';
      requireValue(['codex', 'claude-code'].includes(assistant), 'Choose Codex or Claude Code.');
      requireValue(Object.hasOwn(PERIOD, frequency), 'Choose daily or weekly monitoring.');
      requireValue(['notify', 'apply'].includes(mode), 'Choose notify or apply monitoring.');
      const criteria = input.criteria || previous?.criteria || {};
      requireValue(object(criteria) && Object.keys(criteria).every(key => ['roles', 'locations', 'notes'].includes(key)), 'Use roles, locations and notes as matching preferences.');
      const checkedCriteria = { roles: strings(criteria.roles, 'Roles'), locations: strings(criteria.locations, 'Locations'), notes: typeof criteria.notes === 'string' ? criteria.notes.trim() : '' };
      requireValue(checkedCriteria.notes.length <= 4000, 'Keep matching notes within 4,000 characters.');
      const enabled = input.enabled === undefined ? false : input.enabled;
      requireValue(typeof enabled === 'boolean', 'Enabled must be true or false.');
      requireValue(!enabled || input.explicit === true, 'Enable monitoring only after the person explicitly chooses its saved scope and actions.');
      const expiresAt = input.expiresAt ?? previous?.expiresAt ?? null;
      if (expiresAt !== null) requireValue(typeof expiresAt === 'string' && Number.isFinite(Date.parse(expiresAt)) && Date.parse(expiresAt) > Date.parse(now()), 'Choose a future monitoring expiry.');
      if (mode === 'apply') requireValue(expiresAt && checkedCriteria.roles.length && checkedCriteria.locations.length, 'Automatic applications need an expiry and explicit role and work-location preferences.');
      const companySnapshots = Object.fromEntries(companyIds.map(id => [id, scopeFacts(store.getCompany(id))]));
      const saved = { id: previous?.id || `monitor_${randomUUID()}`, revision: (previous?.revision || 0) + 1, name: input.name ? string(input.name, 'Rule name', 200) : previous?.name || selectedDirectory.name, directoryId: selectedDirectory.id, directoryName: selectedDirectory.name, companyIds, companySnapshots, assistant, frequency, mode, criteria: checkedCriteria, enabled, expiresAt, consentedAt: enabled ? now() : null, createdAt: previous?.createdAt || now(), updatedAt: now(), nextCheckAt: enabled ? new Date(Date.parse(now()) + PERIOD[frequency]).toISOString() : null, lastCheckAt: previous?.lastCheckAt || null, lastStatus: previous?.lastStatus || 'not_checked', lastError: null };
      return transaction(() => {
        if (previous) { requireValue(readRule(previous.id).revision === input.expectedRevision, 'Monitoring rule changed. Read it and retry with its revision.', 409); cancelRuleRuns(previous.id); }
        requireValue(companyIds.every(id => JSON.stringify(companySnapshots[id]) === JSON.stringify(scopeFacts(store.getCompany(id))) && !store.getCompany(id).archived), 'The directory changed while saving monitoring. Review its scope again.', 409);
        return writeRule(saved);
      });
    },
    setMonitoringRuleStatus({ id, enabled, explicit = false, expectedRevision } = {}) {
      const rule = readRule(id);
      if (expectedRevision !== undefined) requireValue(expectedRevision === rule.revision, 'Monitoring rule changed. Read it and retry with its revision.', 409);
      requireValue(typeof enabled === 'boolean', 'Enabled must be true or false.');
      requireValue(!enabled || explicit === true, 'Explicitly enable this saved monitoring rule.');
      requireValue(!enabled || expectedRevision !== undefined, 'Read the monitoring rule and pass its current revision before enabling it.');
      requireValue(!enabled || !rule.expiresAt || Date.parse(rule.expiresAt) > Date.parse(now()), 'This monitoring permission expired. Review and save a new expiry.');
      return transaction(() => {
        const latest = readRule(id);
        if (expectedRevision !== undefined) requireValue(expectedRevision === latest.revision, 'Monitoring rule changed. Read it and retry with its revision.', 409);
        cancelRuleRuns(id);
        return writeRule({ ...latest, enabled, revision: latest.revision + 1, updatedAt: now(), consentedAt: enabled ? now() : null, nextCheckAt: enabled ? new Date(Date.parse(now()) + PERIOD[latest.frequency]).toISOString() : null });
      });
    },
    interruptMonitoringRules() {
      // Restart never silently restores recurring sending authority.
      for (const rule of methods.listMonitoringRules()) if (rule.mode === 'apply' && rule.enabled) methods.setMonitoringRuleStatus({ id: rule.id, enabled: false });
    },
    startMonitoringRun(ruleId) {
      return transaction(() => {
        const rule = activeRule(ruleId), selectedDirectory = directory(rule.directoryId);
        requireValue(!store.listRuns().some(run => run.managed && run.status === 'running'), 'A run is already working. Stop it before checking another directory.');
        const companyIds = rule.companyIds.filter(id => { const company = store.getCompany(id); return !company.archived && company.directoryId === rule.directoryId; });
        requireValue(companyIds.length, 'No saved monitoring companies are active. Review the rule.');
        const actions = { ...blankActions(), applyMatchingJobs: rule.mode === 'apply' };
        const run = { id: `run_${randomUUID()}`, directoryId: rule.directoryId, directoryName: selectedDirectory.name, companyIds, companyTypes: [], locations: [], companyTypeLabels: [], locationLabels: rule.criteria.locations, search: '', statusFilter: '', attentionFilter: '', filters: { search: '', status: '', attention: '', companyTypes: [], locations: [] }, actions, instructions: rule.criteria.notes, mode: rule.mode === 'apply' ? 'send_and_submit' : 'monitor_notify', explicit: true, authorization: 'recurring_monitoring_rule', monitoringRuleId: rule.id, monitoringRuleRevision: rule.revision, monitoringMode: rule.mode, monitoringCriteria: structuredClone(rule.criteria), managed: true, assistant: rule.assistant, status: 'running', activeCompanyId: null, completed: 0, createdAt: now(), updatedAt: now(), expiresAt: new Date(Math.min(Date.parse(now()) + 3_600_000, rule.expiresAt ? Date.parse(rule.expiresAt) : Infinity)).toISOString(), targets: companyIds.map(companyId => ({ companyId, name: store.getCompany(companyId).name, status: 'pending' })) };
        db.prepare('INSERT INTO runs VALUES(?,?)').run(run.id, JSON.stringify(run));
        writeRule({ ...rule, lastStartedAt: now(), activeRunId: run.id, nextCheckAt: new Date(Date.parse(now()) + PERIOD[rule.frequency]).toISOString(), lastStatus: 'checking', lastError: null });
        return run;
      });
    },
    assertMonitoringRun(runId, companyId) {
      const run = store.getRun(runId), rule = activeRule(run.monitoringRuleId);
      requireValue(run.status === 'running' && run.managed && run.activeCompanyId === companyId && run.companyIds.includes(companyId) && rule.companyIds.includes(companyId) && run.monitoringRuleRevision === rule.revision, 'This monitoring attempt has stopped or its permission changed.');
      requireValue(rule.companySnapshots?.[companyId] && JSON.stringify(rule.companySnapshots[companyId]) === JSON.stringify(scopeFacts(store.getCompany(companyId))), 'This company or its recruitment routes changed. Review and save the monitoring rule before continuing.');
      return { run, rule };
    },
    assertMonitoringSubmission(input) {
      const { run, rule } = methods.assertMonitoringRun(input.runId, input.companyId);
      requireValue(rule.mode === 'apply' && run.monitoringMode === 'apply', 'This monitoring rule only discovers jobs; submissions are disabled.');
      const purpose = input.purpose || 'application';
      requireValue(['application', 'account', 'profile', 'cv_upload'].includes(purpose), 'Monitoring does not authorize general CV sharing or talent-pool registration.');
      const matches = db.prepare('SELECT payload FROM monitored_jobs WHERE rule_id=? AND company_id=? AND matched=1').all(rule.id, input.companyId).map(row => JSON.parse(row.payload)).filter(job => job.lastRunId === run.id);
      const job = matches.find(item => item.id === input.monitoredJobId);
      requireValue(job, 'Record a verified matching job from this monitoring check and pass its monitoredJobId before submitting.');
      requireValue(purpose !== 'application' || roleKey(job.title) === roleKey(input.role), 'Apply only to the exact role bound to this monitoredJobId.');
      requireValue(purpose !== 'application' || !input.url || [job.url, job.applyUrl].filter(Boolean).includes(publicUrl(input.url)), 'Use the exact verified posting or linked application URL for this monitoredJobId.');
      if (purpose === 'application' && typeof input.body === 'string') requireValue([job.url, job.applyUrl].filter(Boolean).some(url => input.body.includes(url)), 'A monitored application email must identify its exact verified job URL.');
      return true;
    },
    recordMonitoredJobs(input = {}) {
      const { run, rule } = methods.assertMonitoringRun(input.runId, input.companyId);
      requireValue(['checked', 'blocked', 'error'].includes(input.status), 'Record checked, blocked or error for this source.');
      const company = store.getCompany(input.companyId);
      const sources = [company.website, company.careersUrl, company.applyUrl].filter(Boolean).map(value => { try { return new URL(value); } catch { return null; } }).filter(Boolean);
      const sourceUrl = input.sourceUrl ? publicUrl(input.sourceUrl) : '';
      requireValue(sourceUrl ? sources.some(saved => saved.origin === new URL(sourceUrl).origin || saved.protocol === 'http:' && new URL(sourceUrl).protocol === 'https:' && saved.hostname === new URL(sourceUrl).hostname) : !sources.length && input.status === 'blocked', 'Use a saved official website or careers source for this company; a missing route can only be recorded as blocked.');
      requireValue(Array.isArray(input.jobs) && input.jobs.length <= 200, 'Record up to 200 verified jobs per source call.');
      requireValue(input.status === 'checked' || input.jobs.length === 0, 'A blocked or failed source cannot establish new jobs.');
      const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 1000) : '';
      requireValue(input.status === 'checked' || reason, 'Explain the source blocker or error.');
      const jobs = input.jobs.map(job => {
        requireValue(object(job) && typeof job.matchesCV === 'boolean', 'Each job needs a true/false CV match decision.');
        const url = publicUrl(job.url), title = string(job.title, 'Job title', 500), location = string(job.location, 'Actual job location', 500), evidence = string(job.evidence, 'Job evidence', 4000), matchReason = string(job.reason, 'Match reason', 2000);
        const applyUrl = job.applyUrl ? publicUrl(job.applyUrl) : null;
        if (applyUrl) requireValue(evidence.includes(job.applyUrl), 'The posting evidence must explicitly identify its linked application URL.');
        if (rule.mode === 'apply' && job.matchesCV) {
          requireValue(rule.criteria.roles.some(value => roleKey(title).includes(roleKey(value))) && rule.criteria.locations.some(value => roleKey(location).includes(roleKey(value))), 'An automatic application match must explicitly fit a saved role and actual work location. Record other jobs as nonmatches for review.');
        }
        const identity = store.getCompanyIdentityKey?.(company.id) || [...(store.relatedCompanyIds?.(company.id) || [company.id])].sort()[0];
        return { id: `job_${hash(`${rule.id}\n${company.id}\n${url}`)}`, jobKey: hash(`${identity}\n${url}`), ruleId: rule.id, directoryId: rule.directoryId, companyId: company.id, companyName: company.name, url, ...(applyUrl ? { applyUrl } : {}), title, location, matchesCV: job.matchesCV, reason: matchReason, evidence, sourceUrl, lastRunId: run.id, lastSeenAt: now(), observation: 'Verified posting at the recorded check time; availability may change.' };
      });
      return transaction(() => {
        for (const job of jobs) {
          const old = db.prepare('SELECT payload FROM monitored_jobs WHERE id=?').get(job.id);
          const original = db.prepare("SELECT MIN(json_extract(payload,'$.firstSeenAt')) AS first_seen FROM monitored_jobs WHERE job_key=?").get(job.jobKey).first_seen;
          job.firstSeenAt = old ? JSON.parse(old.payload).firstSeenAt : original || now();
          db.prepare('INSERT INTO monitored_jobs VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET matched=excluded.matched,last_seen=excluded.last_seen,payload=excluded.payload').run(job.id, rule.id, company.id, job.jobKey, Number(job.matchesCV), job.lastSeenAt, JSON.stringify(job));
        }
        const totals = db.prepare("SELECT COUNT(*) AS found,COALESCE(SUM(matched),0) AS matches FROM monitored_jobs WHERE rule_id=? AND company_id=? AND json_extract(payload,'$.lastRunId')=? AND json_extract(payload,'$.sourceUrl')=?").get(rule.id, company.id, run.id, sourceUrl);
        const check = { id: hash(`${run.id}\n${company.id}\n${sourceUrl}`), runId: run.id, ruleId: rule.id, companyId: company.id, companyName: company.name, sourceUrl, status: input.status, reason, checkedAt: now(), jobsFound: totals.found, matches: totals.matches };
        db.prepare('INSERT INTO monitoring_checks VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(check.id, run.id, rule.id, company.id, JSON.stringify(check));
        return { ...check, records: jobs };
      });
    },
    monitoringChecks(runId, companyId) {
      return db.prepare('SELECT payload FROM monitoring_checks WHERE run_id=?' + (companyId ? ' AND company_id=?' : '')).all(runId, ...(companyId ? [companyId] : [])).map(row => JSON.parse(row.payload));
    },
    recordMonitoringApplicationRefresh(runId, result) {
      const run = store.getRun(runId), rule = readRule(run.monitoringRuleId);
      requireValue(object(result) && Array.isArray(result.outcomes), 'Record actual scoped application checks.');
      const applications = new Map(store.listApplications().filter(application => run.companyIds.includes(application.companyId)).map(application => [application.id, application]));
      return transaction(() => {
        for (const outcome of result.outcomes) {
          const application = applications.get(outcome.applicationId);
          requireValue(application && application.companyId === outcome.companyId && ['checked', 'failed', 'unavailable', 'skipped'].includes(outcome.status), 'Record checks only for this monitor’s tracked submissions.');
          const fact = { ...outcome, runId, ruleId: rule.id, observedAt: now() };
          db.prepare('INSERT INTO monitoring_application_checks VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,observed_at=excluded.observed_at,payload=excluded.payload').run(hash(`${runId}\n${application.id}`), runId, rule.id, application.companyId, application.id, outcome.status, fact.observedAt, JSON.stringify(fact));
        }
        const summary = { status: result.status, message: String(result.message || '').slice(0, 1000), checked: result.checked || 0, updated: result.updated || 0, unavailable: result.unavailable || 0, failed: result.errors?.length || 0, skipped: result.skipped || 0, checkedAt: now() };
        writeRule({ ...readRule(rule.id), lastApplicationRefresh: summary });
        return summary;
      });
    },
    finishMonitoringRun(runId) {
      return transaction(() => {
      const run = store.getRun(runId), rule = readRule(run.monitoringRuleId);
      if (rule.activeRunId !== run.id) return rule;
      const checks = methods.monitoringChecks(run.id), failures = checks.filter(check => check.status !== 'checked');
      const incomplete = run.targets.filter(target => target.status !== 'checked' && target.status !== 'applied').length;
      const applicationAttention = rule.lastApplicationRefresh?.failed || rule.lastApplicationRefresh?.unavailable;
      return writeRule({ ...rule, activeRunId: null, lastCheckAt: now(), lastStatus: run.status === 'cancelled' ? 'cancelled' : failures.length || incomplete || applicationAttention ? 'needs_you' : 'checked', lastError: failures[0]?.reason || (incomplete ? `${incomplete} companies need attention. Open run progress.` : applicationAttention ? rule.lastApplicationRefresh.message : null), lastCheckSummary: { companiesChecked: new Set(checks.filter(check => check.status === 'checked').map(check => check.companyId)).size, sourcesChecked: checks.length, jobsFound: checks.reduce((sum, check) => sum + check.jobsFound, 0), matches: checks.reduce((sum, check) => sum + check.matches, 0), failures: failures.length } });
      });
    },
    recordMonitoringFailure(ruleId, reason) {
      return transaction(() => {
      const rule = readRule(ruleId);
      return writeRule({ ...rule, lastStatus: 'needs_you', lastError: String(reason || 'The monitoring check could not start.').slice(0, 600), nextCheckAt: rule.enabled ? new Date(Date.parse(now()) + PERIOD[rule.frequency]).toISOString() : null });
      });
    },
    getMonitoringResults({ ruleId, directoryId, companyId, matchedOnly = true, since, offset = 0, limit = 50 } = {}) {
      requireValue(Number.isInteger(offset) && offset >= 0 && Number.isInteger(limit) && limit >= 1 && limit <= 200 && typeof matchedOnly === 'boolean', 'Use offset >= 0 and limit 1 to 200.');
      const where = [], values = [];
      if (ruleId) { readRule(ruleId); where.push('rule_id=?'); values.push(ruleId); }
      if (directoryId) { where.push("json_extract(payload,'$.directoryId')=?"); values.push(directoryId); }
      if (companyId) { where.push('company_id=?'); values.push(companyId); }
      if (matchedOnly) where.push('matched=1');
      if (since) { requireValue(typeof since === 'string' && Number.isFinite(Date.parse(since)), 'Use a valid since timestamp.'); where.push("json_extract(payload,'$.firstSeenAt')>=?"); values.push(new Date(since).toISOString()); }
      const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
      const total = db.prepare('SELECT COUNT(DISTINCT job_key) AS count FROM monitored_jobs' + clause).get(...values).count;
      const records = db.prepare('SELECT payload FROM (SELECT payload,last_seen,id,ROW_NUMBER() OVER(PARTITION BY job_key ORDER BY last_seen DESC,id DESC) AS rank FROM monitored_jobs' + clause + ') WHERE rank=1 ORDER BY last_seen DESC,id LIMIT ? OFFSET ?').all(...values, limit, offset).map(row => JSON.parse(row.payload));
      return { total, offset, limit, records, items: records, hasMore: offset + records.length < total };
    },
    monitoringSummary({ directoryId } = {}) {
      const rules = methods.listMonitoringRules({ directoryId });
      const result = db.prepare("SELECT COUNT(DISTINCT job_key) AS count FROM monitored_jobs WHERE matched=1" + (directoryId ? " AND json_extract(payload,'$.directoryId')=?" : '')).get(...(directoryId ? [directoryId] : []));
      const since = new Date(Date.parse(now()) - 7 * PERIOD.daily).toISOString();
      const recent = db.prepare("SELECT COUNT(DISTINCT job_key) AS count FROM monitored_jobs WHERE matched=1 AND json_extract(payload,'$.firstSeenAt')>=?" + (directoryId ? " AND json_extract(payload,'$.directoryId')=?" : '')).get(since, ...(directoryId ? [directoryId] : []));
      const lastCheckedAt = rules.map(rule => rule.lastCheckAt).filter(Boolean).sort().at(-1) || null;
      return { matchingJobs: result.count, newMatches: recent.count, newMatchesSince: since, period: 'last_7_days', ruleCount: rules.length, enabledCount: rules.filter(rule => rule.enabled && !rule.expired).length, rules: rules.length, enabled: rules.filter(rule => rule.enabled && !rule.expired).length, lastCheckedAt, lastCheckAt: lastCheckedAt, nextCheckAt: rules.filter(rule => rule.enabled && !rule.expired).map(rule => rule.nextCheckAt).filter(Boolean).sort()[0] || null, needsYou: rules.filter(rule => rule.lastStatus === 'needs_you').length };
    },
    monitoringReport({ since, until = now(), ruleId } = {}) {
      requireValue(typeof since === 'string' && Number.isFinite(Date.parse(since)) && Number.isFinite(Date.parse(until)), 'Use a valid monitoring reporting period.');
      const start = new Date(since).toISOString(), end = new Date(until).toISOString();
      const clause = ruleId ? ' AND rule_id=?' : '';
      const values = [start, end, ...(ruleId ? [ruleId] : [])];
      const newMatches = db.prepare("SELECT COUNT(DISTINCT job_key) AS count FROM monitored_jobs WHERE matched=1 AND json_extract(payload,'$.firstSeenAt')>=? AND json_extract(payload,'$.firstSeenAt')<=?" + clause).get(...values).count;
      const checks = db.prepare("SELECT payload FROM monitoring_checks WHERE json_extract(payload,'$.checkedAt')>=? AND json_extract(payload,'$.checkedAt')<=?" + clause).all(...values).map(row => JSON.parse(row.payload));
      const applicationOutcomes = db.prepare('SELECT payload FROM (SELECT payload,ROW_NUMBER() OVER(PARTITION BY application_id ORDER BY observed_at DESC,rowid DESC) AS rank FROM monitoring_application_checks WHERE observed_at>=? AND observed_at<=?' + clause + ') WHERE rank=1').all(...values).map(row => JSON.parse(row.payload));
      const applicationUpdates = { total: applicationOutcomes.length, checked: applicationOutcomes.filter(item => item.status === 'checked').length, failed: applicationOutcomes.filter(item => item.status === 'failed').length, unavailable: applicationOutcomes.filter(item => item.status === 'unavailable').length, skipped: applicationOutcomes.filter(item => item.status === 'skipped').length, outcomes: applicationOutcomes };
      return { since: start, until: end, newMatches, companiesChecked: new Set(checks.filter(check => check.status === 'checked').map(check => check.companyId)).size, sourcesChecked: checks.filter(check => check.status === 'checked').length, blockedSources: checks.filter(check => check.status === 'blocked').length, failedSources: checks.filter(check => check.status === 'error').length, applicationUpdates, needsYou: checks.filter(check => check.status !== 'checked').map(({ companyId, companyName, sourceUrl, status, reason, checkedAt }) => ({ companyId, companyName, sourceUrl, status, reason, checkedAt })) };
    },
  };
  return methods;
}
