import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { calendarTime, sameCalendar } from './native-client.mjs';

const ASSISTANTS = ['codex', 'claude-code'];
const KINDS = ['assistant', 'cv', 'email', 'calendar', 'browser', 'computer', 'passwordManager'];
const TTL = 24 * 60 * 60_000;
const hash = value => createHash('sha256').update(value).digest('hex');
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
export function nativeIdentity({ provider, accountId, accountEmail, kind = 'email' }) {
  if (kind === 'email') provider = ({ 'google-cli': 'gmail', 'outlook-mcp': 'outlook' })[provider] || provider;
  const identity = accountId ? `id:${accountId}` : accountEmail ? `email:${accountEmail.toLowerCase()}` : '';
  return { provider, accountId: /^sha256:[a-f0-9]{64}$/.test(accountId || '') ? accountId : identity && provider ? `sha256:${hash(JSON.stringify([provider, identity]))}` : '' };
}

/** Native clients own all external tools. This store saves reports and authority only. */
export function createNativeStore({ db, getStore, tx, now, activity, ErrorType, usage, saveCompany }) {
  db.exec(`CREATE TABLE IF NOT EXISTS native_run_targets(run_id TEXT NOT NULL REFERENCES runs(id),company_id TEXT NOT NULL REFERENCES companies(id),position INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(run_id,company_id));
    CREATE UNIQUE INDEX IF NOT EXISTS native_targets_order ON native_run_targets(run_id,position);
    CREATE INDEX IF NOT EXISTS native_targets_status ON native_run_targets(run_id,json_extract(payload,'$.status'),position);
    CREATE INDEX IF NOT EXISTS applications_run ON applications(json_extract(payload,'$.runId'));`);
  const require = (test, message, status = 400) => { if (!test) throw new ErrorType(message, status); };
  const object = (value, keys) => { require(plain(value), 'Supply structured native-client fields.'); require(Object.keys(value).every(key => keys.includes(key)), 'Use only supported native-client fields; never send credentials, raw CVs or logs.'); };
  const text = (value, label, max = 2000, optional = false) => { require(typeof value === 'string' && (optional || value.trim()) && value.length <= max && !/[\0\r\n]/.test(value), `Use bounded one-line ${label}.`); return value.trim(); };
  const assistant = value => { require(ASSISTANTS.includes(value), 'Choose Codex or Claude Code.'); return value; };
  const read = (table, id) => { const row = db.prepare(`SELECT payload FROM ${table} WHERE id=?`).get(id); return row ? JSON.parse(row.payload) : null; };
  const setting = (key, value) => db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(key, JSON.stringify(value));
  const saveRun = run => db.prepare('UPDATE runs SET payload=? WHERE id=?').run(JSON.stringify(run), run.id);
  const saveApplication = value => db.prepare('UPDATE applications SET payload=? WHERE id=?').run(JSON.stringify(value), value.id);
  const target = (runId, companyId) => { const row = db.prepare('SELECT payload FROM native_run_targets WHERE run_id=? AND company_id=?').get(runId, companyId); return row ? JSON.parse(row.payload) : null; };
  const saveTarget = value => db.prepare('UPDATE native_run_targets SET payload=? WHERE run_id=? AND company_id=?').run(JSON.stringify(value), value.runId, value.companyId);
  const publicTarget = value => { if (!value) return null; const { tokenHash, ...item } = value; return item; };
  const nativeRun = runId => { const run = getStore().getRun(runId); require(run.native === true, 'Choose a native-client Run.'); return run; };
  const email = value => { const result = text(value, 'observed email address', 320).toLowerCase(); require(/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(result), 'Use an actual observed email address.'); return result; };
  const safeText = value => {
    const result = text(value, 'evidence', 4000);
    require(!/\bbearer\s+\S+|\b(?:password|api[_ -]?key|secret|token|access[_ -]?token|refresh[_ -]?token|id[_ -]?token|client[_ -]?secret|authorization|cookie|session[_ -]?(?:id|token))["']?\s*[:=]/i.test(result), 'Keep credentials and session tokens out of native reports.');
    return result;
  };
  const url = value => {
    text(value, 'source URL', 8192); let result; try { result = new URL(value); } catch { require(false, 'Use a complete HTTP(S) source URL.'); }
    require(['http:', 'https:'].includes(result.protocol) && !result.username && !result.password, 'Use an HTTP(S) URL without credentials.');
    require(![...result.searchParams.keys()].some(key => /^(?:token|access_token|refresh_token|password|api_key|secret|session|sessionid)$/i.test(key)), 'Keep secret URL parameters out of native reports.');
    return result.href;
  };
  const capabilities = owner => read('settings', `native_client:${owner}`) || {};
  function connection(owner, kind) {
    const value = capabilities(assistant(owner))[kind], age = value ? Date.parse(now()) - Date.parse(value.observedAt) : Infinity;
    const fresh = value && age >= -300_000 && age <= TTL;
    return value ? { ...value, status: fresh ? value.status : 'unknown', stale: !fresh, clientReported: true, independentlyVerified: false } : { status: 'unknown', observedAt: null, provider: '', clientReported: true, independentlyVerified: false, nextStep: `Ask this assistant to check its own ${kind} tools and report their observed state.` };
  }
  const page = ({ offset = 0, limit = 20 }) => { require(Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(limit) && limit >= 1 && limit <= 100, 'Use a nonnegative offset and limit from 1 to 100.'); return { offset, limit }; };
  function view(runId) {
    const run = nativeRun(runId), counts = {};
    for (const row of db.prepare("SELECT json_extract(payload,'$.status') AS status,COUNT(*) AS n FROM native_run_targets WHERE run_id=? GROUP BY json_extract(payload,'$.status')").all(runId)) counts[row.status] = Number(row.n);
    const current = run.activeCompanyId && target(runId, run.activeCompanyId);
    const outcomes = db.prepare(`SELECT
      COUNT(DISTINCT CASE WHEN COALESCE(json_extract(a.payload,'$.appliedAt'),'')<>'' THEN a.company_id END) AS applicationsSent,
      COUNT(DISTINCT CASE WHEN json_extract(a.payload,'$.status')='profile_created' OR EXISTS(SELECT 1 FROM json_each(a.payload,'$.milestones') m WHERE json_extract(CASE WHEN m.type='object' THEN m.value ELSE '{}' END,'$.event')='profile_created') THEN a.company_id END) AS careerProfiles,
      COUNT(DISTINCT CASE WHEN json_extract(a.payload,'$.method')='email' AND json_extract(a.payload,'$.deliveryStatus')='confirmed' AND COALESCE(json_extract(a.payload,'$.providerMessageId'),'')<>'' THEN json_array(COALESCE(json_extract(a.payload,'$.evidence.provider'),''),COALESCE(json_extract(a.payload,'$.evidence.accountId'),''),json_extract(a.payload,'$.providerMessageId')) END) AS emailsSent
      FROM applications a WHERE json_extract(a.payload,'$.runId')=?`).get(runId);
    return { id: run.id, status: run.status, assistant: run.assistant, directoryId: run.directoryId, directoryName: run.directoryName, actions: run.actions, filters: run.filters, total: run.companyIds.length, completed: run.completed, activeCompanyId: run.activeCompanyId || null, currentName: current?.name || '', createdAt: run.createdAt, expiresAt: run.expiresAt, notes: run.notes || '', mode: 'send_and_submit', native: true, executionOwner: 'native-client', clientReported: true, targetCounts: counts, outcomes: Object.fromEntries(Object.entries(outcomes).map(([key, value]) => [key, Number(value)])) };
  }
  function claim(input) {
    const run = nativeRun(input.runId), item = target(run.id, input.companyId);
    require(run.status === 'running' && item?.status === 'working' && run.activeCompanyId === item.companyId && item.expiresAt > now(), 'This native target expired or was stopped. Start a fresh explicit Run.', 409);
    require(assistant(input.assistant) === run.assistant, 'Use the assistant selected for this Run.');
    text(input.claimToken, 'active claim token', 200);
    const actual = Buffer.from(hash(input.claimToken), 'hex'), expected = Buffer.from(item.tokenHash || '', 'hex');
    require(actual.length === expected.length && timingSafeEqual(actual, expected), 'The native target claim token is invalid.', 403);
    require(!getStore().getCompany(item.companyId).archived, 'This company was archived. Stop this attempt.');
    return { run, item };
  }
  function stop(runId, reason) {
    const run = nativeRun(runId);
    if (['running', 'expired'].includes(run.status)) {
      const item = run.activeCompanyId && target(run.id, run.activeCompanyId);
      if (item?.status === 'working') { item.status = 'needs_you'; item.reason = reason; item.finishedAt = now(); delete item.tokenHash; saveTarget(item); run.completed++; }
      run.status = 'cancelled'; run.activeCompanyId = null; run.notes = reason; run.updatedAt = now(); saveRun(run);
    }
    return view(runId);
  }
  return {
    getNativeClientStatus({ assistant: owner = getStore().getSettings().preferredAssistant } = {}) {
      assistant(owner); const result = Object.fromEntries(KINDS.map(kind => [kind, connection(owner, kind)]));
      const used = read('settings', `native_use:${owner}`);
      if (used) result.assistant = { ...result.assistant, status: Date.parse(now()) - Date.parse(used.observedAt) <= TTL ? 'reported' : 'unknown', observedAt: used.observedAt, localToolUseObserved: true, lastTool: used.tool, clientReported: false, independentlyVerified: false, nextStep: 'A Tawdheef tool call was observed here. External tools, account sign-in and model access remain owned by the assistant.' };
      return { assistant: owner, mode: 'native', clientReported: true, independentlyVerified: false, primaryEmail: result.email.status === 'reported' ? result.email.accountEmail || null : null, capabilities: result };
    },
    touchNativeClient({ assistant: owner, tool } = {}) { assistant(owner); require(['get_agent_context', 'get_capabilities'].includes(tool), 'Record only actual Tawdheef bootstrap tool use.'); setting(`native_use:${owner}`, { tool, observedAt: now() }); return getStore().getNativeClientStatus({ assistant: owner }); },
    reportNativeConnection(input = {}) {
      object(input, ['assistant', 'kind', 'status', 'observedAt', 'provider', 'accountEmail', 'accountId', 'cv', 'calendarIds', 'evidence', 'nextStep']);
      const owner = assistant(input.assistant); require(KINDS.includes(input.kind), 'Choose a native-client capability.');
      require(['available', 'needs_you', 'unknown'].includes(input.status), 'Report available, needs_you or unknown.');
      text(input.observedAt, 'observation timestamp', 100); const at = Date.parse(input.observedAt);
      require(/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(input.observedAt) && Number.isFinite(at) && at <= Date.parse(now()) + 300_000, 'Use the actual client observation time with a timezone.');
      const value = { status: input.status === 'available' ? 'reported' : input.status, observedAt: new Date(at).toISOString(), provider: input.provider === undefined ? '' : text(input.provider, 'provider name', 100), nextStep: input.status === 'available' ? 'Reported by this assistant; the app has not independently checked this connection.' : `Check ${input.kind} in the selected assistant, then report its current state.` };
      if (input.nextStep !== undefined) { value.nextStep = safeText(input.nextStep); require(value.nextStep.length <= 1000, 'Keep the actionable next step under 1,000 characters.'); }
      if (input.accountEmail !== undefined) value.accountEmail = email(input.accountEmail);
      if (input.accountId !== undefined) value.accountId = text(input.accountId, 'public provider account ID', 2048);
      if (value.accountId !== undefined) value.accountId = nativeIdentity({ ...value, kind: input.kind }).accountId;
      if (['email', 'calendar'].includes(input.kind) && input.status === 'available') { const identity = nativeIdentity({ ...value, kind: input.kind }); require(identity.provider && identity.accountId, 'Report the actual provider and observed account identity.'); Object.assign(value, identity); }
      if (input.cv !== undefined) {
        require(input.kind === 'cv', 'CV metadata belongs only to the CV capability.'); object(input.cv, ['id', 'url', 'label', 'updatedAt', 'primaryEmail']); value.cv = {};
        for (const key of ['id', 'label']) if (input.cv[key] !== undefined) value.cv[key] = text(input.cv[key], `CV ${key}`, 500);
        if (input.cv.url !== undefined) value.cv.url = url(input.cv.url);
        if (input.cv.updatedAt !== undefined) { require(typeof input.cv.updatedAt === 'string' && Number.isFinite(Date.parse(input.cv.updatedAt)), 'Use the observed CV update timestamp.'); value.cv.updatedAt = new Date(input.cv.updatedAt).toISOString(); }
        if (input.cv.primaryEmail !== undefined) value.cv.primaryEmail = email(input.cv.primaryEmail);
      }
      if (input.kind === 'cv' && input.status === 'available') require(value.cv?.id || value.cv?.url, 'Report a real CV source ID or URL, without its contents.');
      if (input.calendarIds !== undefined) { require(input.kind === 'calendar' && Array.isArray(input.calendarIds) && input.calendarIds.length <= 1000, 'Report a bounded list of actual calendar IDs.'); value.calendarIds = [...new Set(input.calendarIds.map(id => text(id, 'calendar ID', 2048)))]; }
      if (input.evidence !== undefined) value.evidence = safeText(input.evidence);
      return tx(() => { setting(`native_client:${owner}`, { ...capabilities(owner), [input.kind]: value }); return getStore().getNativeClientStatus({ assistant: owner }); });
    },
    prepareNativeEmail(input = {}) {
      object(input, ['assistant', 'runId', 'companyId', 'claimToken', 'role', 'purpose', 'to', 'subject', 'body', 'attachments']);
      return tx(() => {
        claim(input);
        const mailbox = connection(input.assistant, 'email');
        require(mailbox.status === 'reported' && mailbox.provider && mailbox.accountId, 'Ask this assistant to inspect and report its current mailbox identity before preparing a send.');
        const attachments = input.attachments ?? [];
        require(Array.isArray(attachments) && attachments.length <= 5, 'Use up to five native-client CV attachment references, without file contents.');
        const references = attachments.map(value => { object(value, ['name', 'source', 'reference']); require(['native_cv', 'native-client'].includes(value.source), 'Use an actual native-client attachment source.'); const reference = safeText(value.reference); require(reference.length <= 2048, 'Keep actual attachment references under 2,048 characters.'); return { name: text(value.name, 'attachment name', 200), source: value.source, reference, clientReported: true }; });
        const pending = getStore().beginEmailSend(input, { transaction: false });
        if (pending.reused) return { application: pending.application, sendPlan: pending.application.nativePlan || null, reused: true, maySend: false, nextStep: 'Inspect the original intent in Sent. Never resend or change its identity/key while the outcome is uncertain.' };
        const application = pending.application;
        application.nativeAssistant = input.assistant;
        application.nativePlan = { applicationId: application.id, idempotencyKey: application.idempotencyKey, purpose: application.purpose, companyId: application.companyId, runId: application.runId, from: mailbox.accountEmail || null, to: application.to, subject: application.subject, body: application.body, attachments: references, provider: mailbox.provider, accountId: mailbox.accountId, clientReported: true };
        application.evidence = { provider: mailbox.provider, accountId: mailbox.accountId, clientReported: true };
        saveApplication(application);
        return { application, sendPlan: application.nativePlan, reused: false, maySend: true, nextStep: 'Use only this exact plan with your own authorized mailbox tools. Send once, then resolve with its actual sent receipt. The app has not sent anything.' };
      });
    },
    resolveNativeEmail(input = {}) {
      object(input, ['assistant', 'id', 'outcome', 'receipt', 'evidence', 'explicit']); assistant(input.assistant);
      return tx(() => {
        const application = read('applications', input.id);
        require(application?.nativePlan && application.method === 'email', 'Choose the original native-client email intent.');
        require(application.nativeAssistant === input.assistant, 'Use the original native assistant selected for this email intent.');
        require(['confirmed', 'unknown', 'not_sent'].includes(input.outcome), 'Resolve as confirmed, unknown or verified not_sent.');
        if (application.deliveryStatus === 'confirmed') return { application, reused: true, clientReported: true };
        const evidence = input.evidence === undefined ? '' : safeText(input.evidence);
        if (input.outcome === 'not_sent') require(input.explicit === true && evidence, 'The user must explicitly confirm inspected non-delivery before clearing an uncertain send.');
        let receipt;
        if (input.outcome === 'confirmed') {
          object(input.receipt, ['providerMessageId', 'messageId', 'threadId', 'provider', 'accountId', 'accountEmail', 'from', 'to', 'subject', 'sentAt']);
          const messageId = text(input.receipt.providerMessageId || input.receipt.messageId, 'actual sent message ID', 1000);
          const accountEmail = input.receipt.accountEmail || input.receipt.from;
          const identity = nativeIdentity({ provider: text(input.receipt.provider, 'original mail provider', 100), accountId: input.receipt.accountId === undefined ? undefined : text(input.receipt.accountId, 'original mailbox account ID', 2048), accountEmail: accountEmail === undefined ? undefined : email(accountEmail) });
          require(identity.provider === application.nativePlan.provider && identity.accountId === application.nativePlan.accountId, 'Inspect the receipt in the original provider and mailbox account. Never reassign its identity.');
          if (input.receipt.to !== undefined) require(email(input.receipt.to) === application.to.toLowerCase(), 'The sent receipt must match the original recipient.');
          if (input.receipt.subject !== undefined) require(input.receipt.subject === application.subject, 'The sent receipt must match the original subject.');
          if (application.nativePlan.from && accountEmail !== undefined) require(email(accountEmail) === application.nativePlan.from, 'The sent receipt must match the original sender.');
          require(typeof input.receipt.sentAt === 'string' && Number.isFinite(Date.parse(input.receipt.sentAt)) && Date.parse(input.receipt.sentAt) >= Date.parse(application.createdAt) - 300_000 && Date.parse(input.receipt.sentAt) <= Date.parse(now()) + 300_000, 'Record the actual send time from the original intent receipt.');
          receipt = { providerMessageId: messageId, ...identity, sentAt: new Date(input.receipt.sentAt).toISOString(), clientReported: true, reportingAssistant: input.assistant };
          if (input.receipt.threadId !== undefined) receipt.threadId = text(input.receipt.threadId, 'original sent thread ID', 2048);
          if (evidence) receipt.confirmation = evidence;
        }
        const saved = getStore().finishEmailSend(application.id, { deliveryStatus: input.outcome === 'confirmed' ? 'confirmed' : input.outcome === 'not_sent' ? 'failed' : 'unknown', receipt, notes: evidence || (input.outcome === 'confirmed' ? 'The native client reported an inspected sent receipt. The app did not send this message.' : 'The native client could not confirm sending. Inspect the original Sent intent before any retry.') }, { transaction: false });
        return { application: saved, clientReported: true, independentlyVerified: false };
      });
    },
    beginNativeMonitoringCheck(input = {}) {
      object(input, ['assistant', 'configurationRevision', 'source', 'leaseMs']); assistant(input.assistant);
      require(getStore().getSettings().connectionMode === 'native', 'Switch to native connection mode before requesting native-client monitoring.');
      const kind = input.source?.kind, capability = ['email', 'calendar'].includes(kind) ? connection(input.assistant, kind) : null;
      const identity = capability?.status === 'reported' ? { provider: capability.provider, accountId: capability.accountId } : {};
      const lease = getStore().beginMonitoringCheck({ ...input, ...identity, native: true });
      if (lease.reused) return { status: 'in_progress', check: lease.check, reused: true, readRequest: null, nextStep: 'This source already has a read lease. Do not duplicate it.' };
      const key = { id: lease.check.id, token: lease.token }, source = lease.check.source;
      const unknown = reason => ({ status: 'needs_you', ...getStore().finishMonitoringCheck({ ...key, status: 'unknown', complete: false, observations: [], summary: reason }), readRequest: null });
      if (capability && (capability.status !== 'reported' || !identity.provider || !identity.accountId)) return unknown('Ask the selected assistant to report its actual current provider/account connection before reading this saved source.');
      if (kind === 'email' && (!source.provider || !source.accountId)) return unknown('The historical thread lacks its original mailbox identity. Inspect its original sent receipt; never assign it to the current account.');
      if (kind === 'calendar' && !capability.calendarIds?.some(id => sameCalendar(id, source.calendarId))) return unknown('The selected calendar was not reported by this assistant. Inspect the saved calendar selection.');
      let readRequest;
      if (kind === 'email') {
        const application = read('applications', source.applicationId);
        readRequest = { kind, method: 'native_email', sourceId: source.id, applicationId: source.applicationId, threadId: source.threadId, recipient: source.recipient, after: application.appliedAt || application.cvSentAt, ...identity, limit: 100, trackedThreadOnly: true };
      } else if (kind === 'calendar') readRequest = { kind, method: 'native_calendar', sourceId: source.id, calendarId: source.calendarId, timeMin: lease.check.startedAt, timeMax: new Date(Date.parse(lease.check.startedAt) + 14 * 86400000).toISOString(), limit: 100, ...identity };
      else readRequest = { kind, method: 'native_browser', sourceId: source.id, companyId: source.companyId, url: source.url, limit: 100 };
      if (['jobs', 'profiles'].includes(kind) && !source.url) return unknown('Save an actual careers/profile URL before asking the native client to read this source.');
      return { status: 'needs_observation', check: { ...lease.check, token: lease.token }, readRequest: { ...readRequest, executionOwner: 'native-client', readOnly: true, writesAllowed: false }, reused: false, nextStep: 'Read only this source with your own authorized tools. Report fresh sourceRead evidence and bounded source-backed observations. Do not apply, create profiles, upload/share CVs, send messages, change calendars or start a Run from monitoring.' };
    },
    recordNativeMonitoringCheck(input = {}) {
      object(input, ['id', 'token', 'status', 'complete', 'observations', 'sourceRead', 'summary', 'cursor']);
      require(getStore().getSettings().connectionMode === 'native', 'Use native mode to finish a native-client source read.');
      const key = { id: input.id, token: input.token }, check = getStore().getMonitoringCheck(key);
      require(check.native === true, 'Finish this check through its original native-client reader.');
      let observations = input.observations ?? [];
      require(Array.isArray(observations) && observations.length <= 100, 'Record up to 100 bounded native observations.');
      let complete = input.complete === true && input.sourceRead !== undefined;
      if (['email', 'calendar'].includes(check.source.kind)) {
        const current = connection(check.assistant, check.source.kind);
        if (current.status !== 'reported' || current.provider !== check.provider || current.accountId !== check.accountId) return getStore().finishMonitoringCheck({ ...key, status: 'unknown', complete: false, observations: [], summary: 'The native client account report changed during this check. Inspect the original provider/account before trying again.' });
      }
      if (check.source.kind === 'email') {
        for (const item of observations) if (!['unknown', 'error'].includes(item.status)) require(item.data?.threadId === check.source.threadId && (!item.evidence?.messageId || item.evidence.messageId === item.externalId), 'Record messages only from the exact tracked thread and actual message ID.');
      }
      if (check.source.kind === 'calendar') observations = observations.flatMap(item => {
        if (['unknown', 'error'].includes(item.status)) { complete = false; return [item]; }
        if (item.data?.calendarId && !sameCalendar(item.data.calendarId, check.source.calendarId)) { complete = false; return []; }
        const start = calendarTime(item.data?.start), end = calendarTime(item.data?.end);
        if (!start || !end || end.value < start.value) { complete = false; return [{ ...item, status: 'unknown', summary: item.summary || 'Event timing is unverified. Inspect the native calendar source.' }]; }
        const minimum = Date.parse(check.startedAt), maximum = minimum + 14 * 86400000, instantaneous = start.value === end.value;
        if (start.earliest >= maximum || end.latest < minimum || end.latest === minimum && !instantaneous) { complete = false; return []; }
        return [item];
      });
      if (observations.some(item => ['unknown', 'error'].includes(item.status))) complete = false;
      return getStore().finishMonitoringCheck({ ...key, status: input.status === 'checked' && !complete ? 'partial' : input.status, complete, observations, ...(input.sourceRead !== undefined ? { sourceRead: input.sourceRead } : {}), ...(input.summary !== undefined ? { summary: input.summary } : {}), cursor: null });
    },
    startNativeRun(input = {}) {
      return tx(() => {
        require(getStore().getSettings().connectionMode === 'native', 'Switch to native connection mode before starting a native Run.');
        assistant(input.assistant);
        require(!getStore().listRuns().some(run => run.status === 'running'), 'Stop the current Run before starting another native Run.');
        const companyIds = getStore().remainingCompanies(input).map(company => company.id);
        require(companyIds.length, 'No unfinished companies match this selection.');
        const run = getStore().startRun({ ...input, companyIds }, { transaction: false });
        Object.assign(run, { native: true, assistant: input.assistant, activeCompanyId: null }); saveRun(run);
        const insert = db.prepare('INSERT INTO native_run_targets VALUES(?,?,?,?)');
        companyIds.forEach((companyId, position) => { const item = { runId: run.id, companyId, position, name: getStore().getCompany(companyId).name, status: 'pending' }; insert.run(run.id, companyId, position, JSON.stringify(item)); });
        return { run: view(run.id) };
      });
    },
    getNativeRun({ runId } = {}) { return view(runId); },
    listNativeTargets(input = {}) {
      object(input, ['runId', 'offset', 'limit', 'status']); const { offset, limit } = page(input); nativeRun(input.runId);
      require(input.status === undefined || ['pending', 'working', 'applied', 'checked', 'failed', 'needs_you', 'uncertain', 'skipped'].includes(input.status), 'Choose a supported native-target status.');
      const where = 'run_id=?' + (input.status ? " AND json_extract(payload,'$.status')=?" : ''), args = [input.runId, ...(input.status ? [input.status] : [])];
      const total = Number(db.prepare(`SELECT COUNT(*) AS n FROM native_run_targets WHERE ${where}`).get(...args).n);
      const items = db.prepare(`SELECT payload FROM native_run_targets WHERE ${where} ORDER BY position LIMIT ? OFFSET ?`).all(...args, limit, offset).map(row => publicTarget(JSON.parse(row.payload)));
      return { items, total, offset, limit, nextOffset: offset + limit < total ? offset + limit : null };
    },
    claimNativeTarget(input = {}) {
      object(input, ['runId', 'assistant']);
      return tx(() => {
        const run = nativeRun(input.runId); require(run.status === 'running', 'Start a fresh explicit Run; this Run expired or stopped.'); require(assistant(input.assistant) === run.assistant, 'Use the assistant selected for this Run.');
        if (run.activeCompanyId) return { run: view(run.id), target: publicTarget(target(run.id, run.activeCompanyId)), claimToken: null, reused: true, nextStep: 'An attempt already owns this company. Inspect it; do not duplicate work.' };
        let item;
        while (true) {
          const row = db.prepare("SELECT payload FROM native_run_targets WHERE run_id=? AND json_extract(payload,'$.status')='pending' ORDER BY position LIMIT 1").get(run.id);
          if (!row) { run.status = 'completed'; run.updatedAt = now(); saveRun(run); return { run: view(run.id), target: null, claimToken: null, reused: false }; }
          item = JSON.parse(row.payload); const company = getStore().getCompany(item.companyId);
          if (!company.archived && ['not_started', 'ready'].includes(company.status) && !getStore().listApplications(company.id).some(application => application.appliedAt)) break;
          item.status = 'skipped'; item.reason = 'Already submitted, completed or archived.'; item.finishedAt = now(); saveTarget(item); run.completed++;
        }
        const claimToken = randomBytes(32).toString('base64url'); item.status = 'working'; item.startedAt = now(); item.expiresAt = new Date(Date.parse(now()) + 3600_000).toISOString(); item.tokenHash = hash(claimToken); saveTarget(item);
        run.activeCompanyId = item.companyId; run.expiresAt = item.expiresAt; run.updatedAt = now(); saveRun(run);
        return { run: view(run.id), target: publicTarget(item), claimToken, expiresAt: item.expiresAt, reused: false };
      });
    },
    getNativeClaim(input = {}) { object(input, ['runId', 'companyId', 'assistant', 'claimToken']); const result = claim(input); return { run: view(result.run.id), target: publicTarget(result.item) }; },
    finishNativeTarget(input = {}) {
      object(input, ['runId', 'companyId', 'assistant', 'claimToken', 'status', 'reason', 'usage', 'durationMs']);
      return tx(() => {
        const { run, item } = claim(input);
        require(['applied', 'checked', 'failed', 'needs_you', 'uncertain', 'skipped'].includes(input.status), 'Choose a supported target outcome.');
        const applied = getStore().listApplications(item.companyId).some(application => application.appliedAt);
        require(input.status !== 'applied' || applied, 'Record an actual application receipt before marking the target applied.');
        item.status = applied ? 'applied' : input.status; item.reason = input.reason === undefined || input.reason === '' ? '' : safeText(input.reason).slice(0, 500); item.finishedAt = now(); delete item.tokenHash;
        if (input.usage !== undefined && input.usage !== null) item.usage = usage(input.usage);
        if (input.durationMs !== undefined) { require(typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) && input.durationMs >= 0, 'Use finite nonnegative durationMs.'); item.durationMs = input.durationMs; }
        item.clientReported = true; saveTarget(item); run.completed++; run.activeCompanyId = null; run.updatedAt = now();
        if (!db.prepare("SELECT 1 FROM native_run_targets WHERE run_id=? AND json_extract(payload,'$.status')='pending' LIMIT 1").get(run.id)) run.status = 'completed'; saveRun(run);
        if (['failed', 'needs_you', 'uncertain'].includes(item.status)) { const company = getStore().getCompany(item.companyId); company.attention = item.status === 'failed' ? 'update_failed' : 'needs_you'; company.nextAction = item.reason; company.lastUpdate = now(); company.revision++; saveCompany(company); }
        activity('native_target_finished', `${item.status}: ${item.reason}`, item.companyId); return { run: view(run.id), target: publicTarget(item) };
      });
    },
    stopNativeRun({ runId } = {}) { return tx(() => stop(runId, 'Stopped. Inspect any uncertain submission before a fresh explicit Run.')); },
    recoverNativeRuns() {
      return tx(() => { const rows = db.prepare("SELECT id FROM runs WHERE json_extract(payload,'$.native')=1 AND json_extract(payload,'$.status')='running'").all(); for (const row of rows) stop(row.id, 'The app restarted. Sending authority was cancelled; inspect unfinished work before a fresh explicit Run.'); return { cancelled: rows.length }; });
    },
  };
}
