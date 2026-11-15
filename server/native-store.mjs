import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { calendarTime, sameCalendar } from './native-client.mjs';
import { nativeReadiness } from './native-readiness.mjs';

const ASSISTANTS = ['codex', 'claude-code'];
const KINDS = ['assistant', 'cv', 'email', 'calendar', 'browser', 'computer', 'passwordManager'];
const STAGES = ['check_jobs', 'match_jobs', 'sign_in', 'register', 'profile', 'cv_upload', 'application', 'complete'];
const BLOCKERS = ['sign_in', 'credential', 'consent', 'identity', 'captcha', 'verification', 'cv_file', 'missing_fact', 'tool_unavailable', 'source_error', 'submission_uncertain'];
const TTL = 24 * 60 * 60_000;
const INSPECT_PENDING = 'Inspect the original uncertain submission in its original account before any new Submit. Reconcile its actual receipt; do not repeat the registration or create a new intent key.';
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
    CREATE INDEX IF NOT EXISTS applications_run ON applications(json_extract(payload,'$.runId'));
    CREATE TABLE IF NOT EXISTS native_journeys(company_id TEXT PRIMARY KEY REFERENCES companies(id),payload TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS native_journeys_run ON native_journeys(json_extract(payload,'$.runId'));`);
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
  const workflowText = value => {
    const result = safeText(value);
    require(!/\b(?:code_verifier|client_secret|otp|verification[_ -]?(?:code|token)|auth(?:orization)?[_ -]?code|recovery[_ -]?code|state)["']?\s*[:=]|(?:[\\/]\.codex[\\/]auth\.json|[\\/]\.claude[\\/][^\\/]*credentials|[\\/]Login Data(?:$|[\\/])|[\\/]Cookies(?:$|[\\/]))/i.test(result), 'Keep authentication codes, credential files and session data out of workflow records.');
    return result;
  };
  const url = value => {
    text(value, 'source URL', 8192); let result; try { result = new URL(value); } catch { require(false, 'Use a complete HTTP(S) source URL.'); }
    require(['http:', 'https:'].includes(result.protocol) && !result.username && !result.password, 'Use an HTTP(S) URL without credentials.');
    require(![...result.searchParams.keys()].some(key => /^(?:token|access_token|refresh_token|password|api_key|secret|session|sessionid)$/i.test(key)), 'Keep secret URL parameters out of native reports.');
    return result.href;
  };
  const workflowUrl = value => {
    const result = new URL(url(value));
    const fragment = result.hash.replace(/^#/, ''), fragmentQuery = fragment.includes('?') ? fragment.slice(fragment.indexOf('?') + 1) : fragment;
    require(![...result.searchParams.keys(), ...new URLSearchParams(fragmentQuery).keys()].some(key => /(?:^|[_-])(?:code|state|otp|auth|authorization|credential|token|secret|session|ticket|assertion|code_verifier|verification|signature|sig|sas|keypairid|key-pair-id|SAMLResponse|SAMLRequest|RelayState|JWT)(?:$|[_-])/i.test(key)), 'Use a clean career page URL without authentication, verification, signed-download or callback parameters.');
    require(!/\/(?:oauth|callback|sso)(?:\/|$)/i.test(result.pathname), 'Use a clean career page URL, not an authentication callback.');
    return result.href;
  };
  const checkpoint = companyId => { const row = db.prepare('SELECT payload FROM native_journeys WHERE company_id=?').get(companyId); return row ? JSON.parse(row.payload) : null; };
  function journey(companyId, owner) {
    const company = getStore().getCompany(companyId), saved = checkpoint(companyId);
    const related = getStore().relatedCompanyIds?.(companyId) || [companyId];
    const args = related.length ? related : [companyId];
    const where = `company_id IN (${args.map(() => '?').join(',')}) AND json_extract(payload,'$.deliveryStatus') IN ('unknown','sending') AND json_extract(payload,'$.idempotencyKey') IS NOT NULL`;
    const pendingCount = Number(db.prepare(`SELECT COUNT(*) AS n FROM applications WHERE ${where}`).get(...args).n);
    const pendingIntents = db.prepare(`SELECT id,company_id,json_extract(payload,'$.runId') AS runId,json_extract(payload,'$.nativeAssistant') AS nativeAssistant,json_extract(payload,'$.purpose') AS purpose,json_extract(payload,'$.method') AS method,json_extract(payload,'$.url') AS url,json_extract(payload,'$.role') AS role,json_extract(payload,'$.deliveryStatus') AS deliveryStatus,COALESCE(json_extract(payload,'$.registrationEmail'),json_extract(payload,'$.nativePlan.from')) AS accountEmail FROM applications WHERE ${where} ORDER BY json_extract(payload,'$.createdAt') DESC LIMIT 10`).all(...args).map(item => {
      const { company_id, ...value } = item;
      if (value.url) { try { value.url = workflowUrl(value.url); } catch { delete value.url; value.urlNeedsInspection = true; } }
      return { ...value, companyId: company_id, assistant: item.nativeAssistant || (item.runId ? read('runs', item.runId)?.assistant : null) || null };
    });
    return { companyId, assistant: owner, checkpoint: saved, progress: company.progress, pendingIntents, pendingCount,
      requiresInspection: pendingCount > 0, authority: 'read_only_context',
      nextStep: pendingCount ? INSPECT_PENDING : saved?.nextStep || 'Inspect existing career accounts and recorded progress, then continue the selected actions.' };
  }
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
    const checkpointRevision = Number(db.prepare("SELECT COALESCE(SUM(json_extract(j.payload,'$.revision')),0) AS revision FROM native_run_targets t JOIN native_journeys j ON j.company_id=t.company_id WHERE t.run_id=?").get(run.id).revision);
    let currentCheckpoint = run.activeCompanyId ? checkpoint(run.activeCompanyId) : null;
    const savedInstructions = typeof run.instructions === 'string' ? run.instructions.slice(0, 20000) : '';
    if (currentCheckpoint && db.prepare("SELECT 1 FROM applications WHERE company_id=? AND json_extract(payload,'$.deliveryStatus') IN ('unknown','sending') AND json_extract(payload,'$.idempotencyKey') IS NOT NULL AND json_extract(payload,'$.runId')<>? LIMIT 1").get(run.activeCompanyId, run.id)) currentCheckpoint = { ...currentCheckpoint, requiresInspection: true, nextStep: INSPECT_PENDING };
    return { id: run.id, status: run.status, assistant: run.assistant, directoryId: run.directoryId, directoryName: run.directoryName, actions: run.actions, filters: run.filters, ...(run.resumedFrom ? { resumedFrom: run.resumedFrom, originalFilters: run.originalFilters } : {}), total: run.companyIds.length, completed: run.completed, activeCompanyId: run.activeCompanyId || null, currentName: current?.name || '', currentCheckpoint, createdAt: run.createdAt, updatedAt: run.updatedAt || run.createdAt, checkpointRevision, expiresAt: run.expiresAt, notes: run.notes || '', instructions: savedInstructions, mode: 'send_and_submit', native: true, executionOwner: 'native-client', clientReported: true, targetCounts: counts, outcomes: Object.fromEntries(Object.entries(outcomes).map(([key, value]) => [key, Number(value)])) };
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
    getNativeReadiness(input = {}, { localCvFile } = {}) {
      object(input, ['assistant', 'actions']);
      const owner = assistant(input.assistant || getStore().getSettings().preferredAssistant);
      return nativeReadiness({ client: getStore().getNativeClientStatus({ assistant: owner }), settings: getStore().getSettings(), actions: input.actions, localCvFile });
    },
    getNativeClientStatus({ assistant: owner = getStore().getSettings().preferredAssistant } = {}) {
      assistant(owner); const result = Object.fromEntries(KINDS.map(kind => [kind, connection(owner, kind)]));
      const used = read('settings', `native_use:${owner}`);
      if (used) result.assistant = { ...result.assistant, status: Date.parse(now()) - Date.parse(used.observedAt) <= TTL ? 'reported' : 'unknown', observedAt: used.observedAt, localToolUseObserved: true, lastTool: used.tool, clientReported: false, independentlyVerified: false, nextStep: 'A Tawdheef tool call was observed here. External tools, account sign-in and model access remain owned by the assistant.' };
      return { assistant: owner, mode: 'native', clientReported: true, independentlyVerified: false, primaryEmail: result.email.status === 'reported' ? result.email.accountEmail || null : null, capabilities: result };
    },
    touchNativeClient({ assistant: owner, tool } = {}) { assistant(owner); require(['get_agent_context', 'get_capabilities'].includes(tool), 'Record only actual Tawdheef bootstrap tool use.'); setting(`native_use:${owner}`, { tool, observedAt: now() }); return getStore().getNativeClientStatus({ assistant: owner }); },
    reportNativeConnection(input = {}) {
      object(input, ['assistant', 'kind', 'status', 'observedAt', 'provider', 'accountEmail', 'accountId', 'cv', 'calendarIds', 'evidence', 'nextStep', 'accessMethod']);
      const owner = assistant(input.assistant); require(KINDS.includes(input.kind), 'Choose a native-client capability.');
      require(['available', 'needs_you', 'unknown'].includes(input.status), 'Report available, needs_you or unknown.');
      text(input.observedAt, 'observation timestamp', 100); const at = Date.parse(input.observedAt);
      require(/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(input.observedAt) && Number.isFinite(at) && at <= Date.parse(now()) + 300_000, 'Use the actual client observation time with a timezone.');
      const value = { status: input.status === 'available' ? 'reported' : input.status, observedAt: new Date(at).toISOString(), provider: input.provider === undefined ? '' : text(input.provider, 'provider name', 100), nextStep: input.status === 'available' ? 'Reported by this assistant; the app has not independently checked this connection.' : `Check ${input.kind} in the selected assistant, then report its current state.` };
      if (input.accessMethod !== undefined) { require(['mcp', 'browser', 'computer', 'file', 'other'].includes(input.accessMethod), 'Report the actual supported access method.'); value.accessMethod = input.accessMethod; }
      if (input.nextStep !== undefined) { value.nextStep = safeText(input.nextStep); require(value.nextStep.length <= 1000, 'Keep the actionable next step under 1,000 characters.'); }
      if (input.accountEmail !== undefined) value.accountEmail = email(input.accountEmail);
      if (input.accountId !== undefined) value.accountId = text(input.accountId, 'public provider account ID', 2048);
      if (value.accountId !== undefined) value.accountId = nativeIdentity({ ...value, kind: input.kind }).accountId;
      if (['email', 'calendar'].includes(input.kind) && input.status === 'available') { const identity = nativeIdentity({ ...value, kind: input.kind }); require(identity.provider && identity.accountId, 'Report the actual provider and observed account identity.'); Object.assign(value, identity); }
      if (input.cv !== undefined) {
        require(input.kind === 'cv', 'CV metadata belongs only to the CV capability.'); object(input.cv, ['id', 'url', 'label', 'updatedAt', 'primaryEmail', 'versionHash', 'uploadFile']); value.cv = {};
        if (input.cv.versionHash !== undefined) { require(typeof input.cv.versionHash === 'string' && /^[a-fA-F0-9]{64}$/.test(input.cv.versionHash), 'Use a SHA-256 hash of the actual CV source version, never its contents.'); value.cv.versionHash = input.cv.versionHash.toLowerCase(); }
        for (const key of ['id', 'label']) if (input.cv[key] !== undefined) value.cv[key] = text(input.cv[key], `CV ${key}`, 500);
        if (input.cv.url !== undefined) value.cv.url = url(input.cv.url);
        if (input.cv.updatedAt !== undefined) { require(typeof input.cv.updatedAt === 'string' && Number.isFinite(Date.parse(input.cv.updatedAt)), 'Use the observed CV update timestamp.'); value.cv.updatedAt = new Date(input.cv.updatedAt).toISOString(); }
        if (input.cv.primaryEmail !== undefined) value.cv.primaryEmail = email(input.cv.primaryEmail);
        if (input.cv.uploadFile !== undefined) {
          const file = input.cv.uploadFile;
          object(file, ['name', 'mimeType', 'sizeBytes', 'sha256', 'reference', 'cvSourceId', 'cvVersionHash']);
          const name = workflowText(file.name); require(name.length <= 200 && !/[\\/]/.test(name) && /\.(pdf|docx)$/i.test(name), 'Report an original PDF or DOCX filename, not a file path.');
          const mimeType = /\.pdf$/i.test(name) ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          require(file.mimeType === mimeType && Number.isSafeInteger(file.sizeBytes) && file.sizeBytes > 0 && file.sizeBytes <= 10 * 1024 * 1024, 'Report the actual original PDF/DOCX type and size up to 10 MB.');
          require(typeof file.sha256 === 'string' && /^[a-fA-F0-9]{64}$/.test(file.sha256), 'Report the actual file byte SHA-256, never CV contents.');
          require(value.cv.versionHash && (value.cv.id || value.cv.url) && file.cvSourceId === (value.cv.id || value.cv.url) && typeof file.cvVersionHash === 'string' && file.cvVersionHash.toLowerCase() === value.cv.versionHash, 'Bind the original file to this current CV source and version. Recheck it when the CV changes.');
          const reference = workflowText(file.reference); require(reference.length <= 2048, 'Use a bounded actual client file reference.'); if (/^https?:/i.test(reference)) workflowUrl(reference);
          value.cv.uploadFile = { name, mimeType, sizeBytes: file.sizeBytes, sha256: file.sha256.toLowerCase(), reference, cvSourceId: file.cvSourceId, cvVersionHash: value.cv.versionHash, clientReported: true, independentlyVerified: false };
        }
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
        const intendedEmail = getStore().getSettings().applicationEmail?.trim().toLowerCase();
        require(!intendedEmail || mailbox.accountEmail === intendedEmail, 'The observed mailbox differs from the selected contact email. Inspect the intended sending account before preparing a new email.');
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
      if (kind === 'jobs') readRequest.discovery = getStore().prepareMonitoredJobDiscovery({ ...key, assistant: input.assistant });
      return { status: 'needs_observation', check: { ...lease.check, token: lease.token }, readRequest: { ...readRequest, executionOwner: 'native-client', readOnly: true, writesAllowed: false }, reused: false, nextStep: kind === 'jobs' ? 'Use the nested discovery lease and its exact public feed/browser plan. Record the same read through record_job_discovery; its final batch also completes this saved monitoring check. Review only pending jobs against the current CV and saved preferences. Do not read twice or record a second completion. No applications or external writes are authorized.' : 'Read only this source with your own authorized tools. Report fresh sourceRead evidence and bounded source-backed observations. Do not apply, create profiles, upload/share CVs, send messages, change calendars or start a Run from monitoring.' };
    },
    recordNativeJobDiscovery(input = {}) {
      const scope = getStore().getDiscoveryLeaseScope({ id: input.id, token: input.token, assistant: input.assistant });
      const result = getStore().recordJobDiscovery(input);
      if (!scope.monitoringCheckId || result.leaseActive) return result;
      return { ...result, monitoring: getStore().finishDiscoveredMonitoringCheck({ id: input.id, token: input.token, assistant: input.assistant }) };
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
    getNativeJourney(input = {}) {
      object(input, ['companyId', 'assistant']);
      return journey(input.companyId, assistant(input.assistant || getStore().getSettings().preferredAssistant));
    },
    recordNativeCheckpoint(input = {}) {
      object(input, ['runId', 'companyId', 'assistant', 'claimToken', 'stage', 'status', 'reasonCode', 'nextStep', 'url', 'accountEmail', 'intentId', 'expectedRevision']);
      return tx(() => {
        const { run, item } = claim(input), previous = checkpoint(item.companyId);
        require(STAGES.includes(input.stage), 'Choose a supported career journey step.');
        require(['working', 'needs_you'].includes(input.status), 'Record a working step or a specific Needs you blocker.');
        require(input.status !== 'needs_you' || BLOCKERS.includes(input.reasonCode), 'Needs you requires a concrete blocker code, not a routine confirmation request.');
        if (input.reasonCode !== undefined) require(BLOCKERS.includes(input.reasonCode), 'Choose a supported blocker code.');
        require(Number.isSafeInteger(input.expectedRevision) && input.expectedRevision >= 0, 'Read the current journey and supply expectedRevision (0 for its first checkpoint).');
        require(input.expectedRevision === (previous?.revision || 0), 'This career step changed. Read and merge its latest checkpoint before editing.', 409);
        require(input.stage !== 'application' || run.actions.applyMatchingJobs, 'This Run does not allow job applications.');
        require(!['sign_in', 'register', 'profile', 'cv_upload'].includes(input.stage) || run.actions.applyMatchingJobs || run.actions.createProfiles, 'This Run does not allow career profile steps.');
        const nextStep = workflowText(input.nextStep); require(nextStep.length <= 1000, 'Keep the next step under 1,000 characters.');
        const saved = { companyId: item.companyId, runId: run.id, assistant: run.assistant, stage: input.stage, status: input.status, nextStep,
          revision: (previous?.revision || 0) + 1, updatedAt: now(), clientReported: true, independentlyVerified: false };
        if (input.reasonCode !== undefined) saved.reasonCode = input.reasonCode;
        if (input.url !== undefined) saved.url = workflowUrl(input.url);
        else if (previous?.url && input.stage === previous.stage) saved.url = previous.url;
        if (previous?.accountEmail) saved.accountEmail = previous.accountEmail;
        if (input.accountEmail !== undefined) { const value = email(input.accountEmail); require(!saved.accountEmail || value === saved.accountEmail, 'Keep this career account’s original sign-in email. Do not replace it with the current mailbox.'); saved.accountEmail = value; }
        if (input.intentId !== undefined) {
          const intent = read('applications', text(input.intentId, 'original intent ID', 200));
          require(intent && intent.companyId === item.companyId, 'Reference the original intent for this company.');
          const original = read('runs', intent.runId);
          require(original?.native && original.assistant === run.assistant && (!intent.nativeAssistant || intent.nativeAssistant === run.assistant), 'Use this assistant’s original Native submission intent.');
          saved.intentId = intent.id;
          if (intent.registrationEmail) { require(!saved.accountEmail || saved.accountEmail === intent.registrationEmail, 'Keep the original registration mailbox for this intent.'); saved.accountEmail = intent.registrationEmail; }
        } else if (previous?.intentId && input.stage === previous.stage) saved.intentId = previous.intentId;
        db.prepare('INSERT INTO native_journeys VALUES(?,?) ON CONFLICT(company_id) DO UPDATE SET payload=excluded.payload').run(item.companyId, JSON.stringify(saved));
        run.updatedAt = now(); saveRun(run);
        if (saved.status === 'needs_you') { const company = getStore().getCompany(item.companyId); company.attention = 'needs_you'; company.nextAction = saved.nextStep; company.lastUpdate = now(); company.revision++; saveCompany(company); }
        activity('native_checkpoint', `${saved.stage}: ${saved.status === 'needs_you' ? saved.reasonCode + ': ' : ''}${saved.nextStep}`, item.companyId);
        return { checkpoint: saved, journey: journey(item.companyId, run.assistant), run: view(run.id) };
      });
    },
    resumeNativeRun(input = {}) {
      object(input, ['runId', 'companyId', 'assistant', 'explicit']);
      require(input.explicit === true, 'Resume requires a fresh explicit user action.');
      const original = nativeRun(input.runId);
      require(assistant(input.assistant) === original.assistant, 'Resume with the original Run-selected assistant.');
      require(original.status !== 'running', 'Finish or stop the current Run before resuming a company.');
      require(original.companyIds.includes(input.companyId) && target(original.id, input.companyId), 'Resume only a company in the original snapshotted Run.');
      require(getStore().isCompanyEligibleForRun(input.companyId, original.actions), 'The selected actions for this company are already complete or unavailable.');
      const { status: previousStatus, attention: previousAttention, ...structuralFilters } = original.filters || {};
      const result = getStore().startNativeRun({ directoryId: original.directoryId, ...structuralFilters, companyIds: [input.companyId],
        assistant: original.assistant, actions: original.actions, explicit: true, mode: 'send_and_submit', instructions: original.instructions || '' });
      const resumed = getStore().getRun(result.run.id); resumed.resumedFrom = original.id; resumed.originalFilters = original.filters; saveRun(resumed);
      return { ...result, run: view(resumed.id), journey: journey(input.companyId, original.assistant), resumedFrom: original.id };
    },
    assertNativeRegistrationIdentity({ assistant: owner } = {}) {
      const mailbox = connection(assistant(owner), 'email'), intended = getStore().getSettings().applicationEmail?.trim().toLowerCase();
      require(mailbox.status === 'reported' && mailbox.accountEmail, 'Inspect and report the intended mailbox before creating a new career account.');
      require(!intended || mailbox.accountEmail === intended, 'The observed mailbox differs from the selected contact email. Select and report the intended mailbox before a new registration.');
      return { accountEmail: mailbox.accountEmail, provider: mailbox.provider };
    },
    startNativeRun(input = {}) {
      return tx(() => {
        require(getStore().getSettings().connectionMode === 'native', 'Switch to native connection mode before starting a native Run.');
        assistant(input.assistant);
        require(!getStore().listRuns().some(run => run.native && run.status === 'running'), 'Stop the current Run before starting another native Run.');
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
      object(input, ['runId', 'offset', 'limit', 'status']); const { offset, limit } = page(input); const run = nativeRun(input.runId);
      require(input.status === undefined || ['pending', 'working', 'applied', 'checked', 'failed', 'needs_you', 'uncertain', 'skipped'].includes(input.status), 'Choose a supported native-target status.');
      const where = 'run_id=?' + (input.status ? " AND json_extract(payload,'$.status')=?" : ''), args = [input.runId, ...(input.status ? [input.status] : [])];
      const total = Number(db.prepare(`SELECT COUNT(*) AS n FROM native_run_targets WHERE ${where}`).get(...args).n);
      const pending = "SELECT 1 FROM applications a WHERE a.company_id=t.company_id AND json_extract(a.payload,'$.deliveryStatus') IN ('unknown','sending') AND json_extract(a.payload,'$.idempotencyKey') IS NOT NULL";
      const items = db.prepare(`SELECT t.payload AS payload,j.payload AS checkpoint,EXISTS(${pending}) AS pending,EXISTS(${pending} AND json_extract(a.payload,'$.runId')<>t.run_id) AS priorPending FROM native_run_targets t LEFT JOIN native_journeys j ON j.company_id=t.company_id WHERE ${where.replace(/run_id/g, 't.run_id').replace(/json_extract\(payload/g, 'json_extract(t.payload')} ORDER BY position LIMIT ? OFFSET ?`).all(...args, limit, offset).map(row => {
        const item = publicTarget(JSON.parse(row.payload)), saved = row.checkpoint ? JSON.parse(row.checkpoint) : null;
        const requiresInspection = Boolean(row.priorPending || row.pending && (run.status !== 'running' || ['needs_you', 'uncertain'].includes(item.status)));
        return { ...item, ...(saved ? { checkpoint: saved } : {}), requiresInspection, nextStep: requiresInspection ? INSPECT_PENDING : saved?.nextStep || item.reason || '' };
      });
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
          item = JSON.parse(row.payload);
          if (getStore().isCompanyEligibleForRun(item.companyId, run.actions)) break;
          item.status = 'skipped'; item.reason = 'The selected actions are already completed, or this company was closed or archived.'; item.finishedAt = now(); saveTarget(item); run.completed++;
        }
        const claimToken = randomBytes(32).toString('base64url'); item.status = 'working'; item.startedAt = now(); item.expiresAt = new Date(Date.parse(now()) + 3600_000).toISOString(); item.tokenHash = hash(claimToken); saveTarget(item);
        run.activeCompanyId = item.companyId; run.expiresAt = item.expiresAt; run.updatedAt = now(); saveRun(run);
        return { run: view(run.id), target: publicTarget(item), journey: journey(item.companyId, run.assistant), claimToken, expiresAt: item.expiresAt, reused: false };
      });
    },
    getNativeClaim(input = {}) { object(input, ['runId', 'companyId', 'assistant', 'claimToken']); const result = claim(input); return { run: view(result.run.id), target: publicTarget(result.item) }; },
    finishNativeTarget(input = {}) {
      object(input, ['runId', 'companyId', 'assistant', 'claimToken', 'status', 'reason', 'usage', 'durationMs']);
      return tx(() => {
        const { run, item } = claim(input);
        require(['applied', 'checked', 'failed', 'needs_you', 'uncertain', 'skipped'].includes(input.status), 'Choose a supported target outcome.');
        const applied = getStore().listApplications(item.companyId).some(application => application.runId === run.id && application.appliedAt);
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
