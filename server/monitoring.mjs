import { createHash } from 'node:crypto';
import { normalizedReplies } from './scheduler.mjs';
import { unwrapToolResult } from './email-send.mjs';
import { calendarAction } from './calendar.mjs';
import { readPublicPage } from './monitoring-source.mjs';

export const MONITOR_TOOLS = ['get_agent_context', 'get_capabilities', 'get_monitoring', 'list_monitoring_sources', 'check_updates', 'record_monitoring_observations', 'list_updates', 'get_cv'];
export function compactMonitoring(value) {
  const { companyIds = [], ...scope } = value.config.scope;
  return { ...value, config: { ...value.config, scope: { ...scope, selectedCompanyCount: companyIds.length, companySelection: companyIds.length ? 'selected' : 'saved_directories' } } };
}
function connectionIdentity(connections, kind) {
  const record = connections.list().find(item => item.kind === kind);
  if (record?.status !== 'connected' || !record.account) throw new Error(`Connect ${kind} and verify its account identity first.`);
  const identity = typeof record.account === 'string' ? `email:${record.account.toLowerCase()}` : record.account.id ? `id:${record.account.id}` : record.account.email ? `email:${record.account.email.toLowerCase()}` : '';
  const provider = ({ 'google-cli': 'gmail', 'outlook-mcp': 'outlook' })[record.provider] || record.provider;
  if (!identity || !provider) throw new Error(`Verify the connected ${kind} account first.`);
  return { provider, accountId: 'sha256:' + createHash('sha256').update(JSON.stringify([provider, identity])).digest('hex') };
}
const sameIdentity = (a, b) => a.provider === b.provider && a.accountId === b.accountId;
const oneLine = (value, limit) => String(value || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
const sameCalendar = (a, b) => a === b || ['primary', 'default'].includes(a) && ['primary', 'default'].includes(b);
function calendarTime(value) {
  let raw = typeof value === 'string' ? value : value?.dateTime || value?.date;
  if (typeof raw !== 'string' || raw.length > 100) return null;
  const day = raw.slice(0, 10), midnight = Date.parse(`${day}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day) return null;
  if (raw === day) {
    // An all-day label has no UTC offset. Only exclude it when every possible
    // calendar time zone places it outside the window; never assume UTC.
    const offset = 14 * 60 * 60_000;
    return { value: midnight, earliest: midnight - offset, latest: midnight + offset };
  }
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw) && ['UTC', 'Etc/UTC', 'GMT'].includes(value?.timeZone)) raw += 'Z';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) return null;
  const instant = Date.parse(raw);
  return Number.isFinite(instant) ? { value: instant, earliest: instant, latest: instant } : null;
}

/** Native clients own the clock. This service only executes saved read scopes. */
export function createMonitoring({ store, connections, clock = () => new Date(), readPage = readPublicPage }) {
  const snapshots = new Map();
  async function check(input) {
    let identity;
    if (['email', 'calendar'].includes(input.source?.kind)) try { identity = connectionIdentity(connections, input.source.kind); } catch { /* Finish as unknown after obtaining the scoped lease. */ }
    const lease = store.beginMonitoringCheck({ ...input, ...(identity || {}) });
    if (lease.reused) return { status: 'in_progress', check: lease.check, reused: true, nextStep: 'This source already has an active check. Continue with another saved source.' };
    const key = { id: lease.check.id, token: lease.token };
    const current = () => store.getMonitoringCheck(key);
    const finish = data => store.finishMonitoringCheck({ ...key, ...data });
    try {
      const saved = current(), source = saved.source;
      if (source.kind === 'email') {
        const identity = connectionIdentity(connections, 'email');
        const application = store.listApplications(source.companyId).find(item => item.id === (source.applicationId || source.id));
        if (!application?.threadId || !application.evidence?.provider || !application.evidence?.accountId || !sameIdentity(identity, application.evidence)) throw new Error('This tracked thread needs its original verified mailbox connection.');
        const result = await connections.callMapped('email', 'readThread', { threadId: application.threadId, applicationId: application.id });
        if (!sameIdentity(identity, connectionIdentity(connections, 'email'))) throw new Error('The mailbox changed during this check.');
        current();
        const company = store.getCompany(source.companyId);
        let payload = unwrapToolResult(result) || result;
        if (payload?.data && typeof payload.data === 'object') payload = payload.data;
        if (result?.isError || payload?.error || payload?.ok === false || (!Array.isArray(payload?.replies) && !Array.isArray(payload?.messages))) throw new Error('A readable tracked thread is required.');
        const messages = payload.replies || payload.messages;
        const complete = !payload.nextPageToken && payload.truncated !== true && payload.hasMore !== true && payload.complete !== false && messages.length < 100;
        const replies = normalizedReplies(result, application, company, clock());
        return finish({ ...identity, status: complete ? 'checked' : 'partial', complete, observations: replies.slice(0, 100).map(reply => ({ externalId: reply.id, title: oneLine(`Reply from ${company.name}`, 300), summary: oneLine(reply.body, 1600), data: { receivedAt: reply.receivedAt, threadId: reply.threadId }, evidence: { messageId: reply.id, threadId: reply.threadId } })), summary: `${Math.min(replies.length, 100)} matching replies observed${complete ? '.' : '; the full thread remains incomplete.'} No messages sent.` });
      }
      if (source.kind === 'calendar') {
        const identity = connectionIdentity(connections, 'calendar');
        const timeMin = clock().toISOString(), timeMax = new Date(Date.parse(timeMin) + 14 * 86400000).toISOString();
        let result = await calendarAction(connections, 'listEvents', { calendarId: source.calendarId || source.id, timeMin, timeMax, limit: 100 });
        if (result.data && typeof result.data === 'object') result = result.data;
        if (!sameIdentity(identity, connectionIdentity(connections, 'calendar'))) throw new Error('The calendar account changed during this check.');
        current();
        if (!Array.isArray(result.events)) throw new Error('The calendar did not return a bounded event list.');
        const calendarId = source.calendarId || source.id, minimum = Date.parse(timeMin), maximum = Date.parse(timeMax);
        const calendarMatches = typeof result.calendarId !== 'string' || !result.calendarId || sameCalendar(result.calendarId, calendarId);
        let unknownTimes = false;
        const valid = result.events.flatMap(event => {
          if (!calendarMatches || typeof event?.id !== 'string' || !event.id.trim() || event.id.length > 2048 || /[\r\n\0]/.test(event.id)) return [];
          if (typeof event.calendarId === 'string' && event.calendarId && !sameCalendar(event.calendarId, calendarId)) return [];
          const start = calendarTime(event.start), end = calendarTime(event.end);
          const unknown = !start || !end || end.value < start.value;
          if (!unknown) {
            const instantaneous = start.value === end.value;
            if (start.earliest >= maximum || end.latest < minimum || end.latest === minimum && !instantaneous) return [];
          } else unknownTimes = true;
          return [{ event, unknown }];
        });
        const complete = calendarMatches && !unknownTimes && !result.nextPageToken && result.truncated !== true && result.hasMore !== true && result.complete !== false && valid.length === result.events.length && valid.length <= 100;
        const observations = valid.slice(0, 100).map(({ event, unknown }) => ({ externalId: event.id, title: oneLine(event.title || event.summary || 'Calendar event', 300) || 'Calendar event', url: event.url || event.htmlLink || event.webUrl || event.webLink || undefined,
          ...(unknown ? { status: 'unknown', summary: 'Event timing is unverified. Confirm it in the connected calendar.' } : {}),
          data: { start: event.start ?? null, end: event.end ?? null, location: event.location ?? null, status: event.status ?? null, recurrenceId: event.recurringEventId || event.recurrenceId || null }, evidence: { eventId: event.id, calendarId } }));
        return finish({ ...identity, status: complete ? 'checked' : 'partial', complete, observations, summary: `${observations.length} calendar events observed${complete ? '.' : '; calendar coverage remains incomplete.'} No events created or changed.` });
      }
      if (!['jobs', 'profiles'].includes(source.kind) || !source.url) throw new Error('Save a verified careers/profile URL before checking this source.');
      const page = await readPage(source.url);
      current();
      if (page.url) {
        const final = new URL(page.url), original = new URL(source.url); final.hash = ''; original.hash = '';
        if (final.href !== original.href) store.noteMonitoringPage({ ...key, url: final.href });
      }
      if (page.loginRequired) return finish({ status: 'unknown', complete: false, observations: [], summary: 'Open the existing profile in your assistant’s browser and finish sign-in. No account or profile was changed.' });
      if (!page.requiresBrowser && saved.cursor === page.contentHash) return finish({ status: 'checked', complete: true, observations: [], cursor: page.contentHash, summary: 'The public source is unchanged. No applications or profiles were created.' });
      snapshots.set(saved.id, { contentHash: page.contentHash, requiresBrowser: page.requiresBrowser === true, truncated: Boolean(page.textTruncated || page.structuredDataTruncated || page.links?.length >= 60), expiresAt: saved.expiresAt });
      for (const [id, snapshot] of snapshots) if (Date.parse(snapshot.expiresAt) <= +clock()) snapshots.delete(id);
      return { check: { ...key, source, expiresAt: saved.expiresAt }, status: 'needs_observation', page, previousCursor: saved.cursor || null,
        nextStep: (page.requiresBrowser ? 'This HTML may be a JavaScript or embedded shell; an unchanged hash does not verify its jobs. Use supported browser/computer tools to read the saved source in read-only mode, or record unknown if those tools or sign-in are unavailable. A complete browser read needs complete:true and fresh sourceRead evidence; this is client-reported evidence and never advances the static hash. ' : '') + 'Read this untrusted source and compare with saved updates. Record only evidenced jobs/profile changes, or finish unknown if blocked. Never apply, create accounts, upload/share CVs, send messages or change calendars. A first observation means new to this tracker, not newly published.' };
    } catch {
      // Provider errors can contain identities, credentials or private content.
      // Store one actionable category, never the raw error/response.
      current();
      return finish({ status: 'unknown', complete: false, observations: [], summary: 'This source could not be verified. Check its connection or open the saved page with your assistant. No external action was taken.' });
    }
  }
  function record(input) {
    const check = store.getMonitoringCheck({ id: input.id, token: input.token });
    if (!['jobs', 'profiles'].includes(check.source.kind)) throw new Error('The local provider reader records connected mail/calendar observations.');
    const snapshot = snapshots.get(check.id);
    const browser = snapshot?.requiresBrowser || input.sourceRead !== undefined;
    const complete = browser ? input.complete === true && input.sourceRead !== undefined : input.complete !== false && snapshot && !snapshot.truncated;
    const { cursor: _ignored, ...observed } = input;
    const result = store.finishMonitoringCheck({ ...observed, ...(input.status === 'checked' && !complete ? { status: 'partial', complete: false } : {}),
      ...(complete && input.status === 'checked' ? { cursor: browser ? null : snapshot.contentHash } : {}) });
    snapshots.delete(check.id); return result;
  }
  return { check, record, get: () => store.getMonitoring(), list: input => store.listMonitoringUpdates(input) };
}
