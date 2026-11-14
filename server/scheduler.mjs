import { confirmedEmailReceipt } from './email-send.mjs';

const DAY = 86_400_000;
const intervals = { hourly: 3_600_000, daily: DAY, weekly: 7 * DAY };
const errorText = error => String(error?.message || error || 'Update failed.').slice(0, 600);

function localParts(date, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(part => [part.type, part.value]));
  const calendar = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  return { calendar, day: new Date(calendar).getUTCDay(), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export function isReportDue(settings, current = new Date()) {
  if (settings.reportFrequency === 'off') return false;
  const now = localParts(current, settings.timezone);
  const [hours, minutes] = settings.reportTime.split(':').map(Number);
  const reportMinutes = hours * 60 + minutes;
  const last = settings.lastReportAt && Number.isFinite(Date.parse(settings.lastReportAt)) ? localParts(new Date(settings.lastReportAt), settings.timezone) : null;
  const nowStamp = now.calendar + now.minutes * 60_000;
  const lastStamp = last ? last.calendar + last.minutes * 60_000 : -Infinity;
  let scheduled;
  if (settings.reportFrequency === 'custom') {
    scheduled = last ? last.calendar + Number(settings.reportEveryDays) * DAY + reportMinutes * 60_000 : now.calendar + reportMinutes * 60_000;
    return nowStamp >= scheduled;
  }
  if (settings.reportFrequency === 'weekly') {
    let daysSince = (now.day - Number(settings.reportDay) + 7) % 7;
    if (!last && (daysSince !== 0 || now.minutes < reportMinutes)) return false;
    if (daysSince === 0 && now.minutes < reportMinutes) daysSince = 7;
    scheduled = now.calendar - daysSince * DAY + reportMinutes * 60_000;
  } else {
    if (!last && now.minutes < reportMinutes) return false;
    scheduled = now.calendar - (now.minutes < reportMinutes ? DAY : 0) + reportMinutes * 60_000;
  }
  return lastStamp < scheduled;
}

function unpack(result) {
  if (result?.isError) throw new Error('The connected tool reported an error. Check its result before retrying.');
  if (result?.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
  if (Array.isArray(result?.content)) {
    const objects = result.content.filter(item => item.type === 'text').flatMap(item => {
      try { const parsed = JSON.parse(item.text); return parsed && typeof parsed === 'object' ? [parsed] : []; } catch { return []; }
    });
    return objects.length === 1 ? objects[0] : null;
  }
  return result && typeof result === 'object' ? result : null;
}

function address(value) {
  if (typeof value === 'object' && value) value = value.email || value.address;
  if (typeof value !== 'string') return '';
  const text = value.trim();
  const candidate = text.match(/<([^<>]+)>$/)?.[1] || text;
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(candidate) ? candidate.toLowerCase() : '';
}

export function normalizedReplies(result, application, company, current = new Date()) {
  let payload = unpack(result);
  if (payload?.data && typeof payload.data === 'object') payload = payload.data;
  const explicitReplyCollection = Array.isArray(payload?.replies);
  const messages = explicitReplyCollection ? payload.replies : payload?.messages;
  if (!Array.isArray(messages)) return [];
  const recipient = address(application.to || application.recipient || application.evidence?.to || company.email);
  if (!recipient) return [];
  return messages.filter(message => {
    if (!message || typeof message !== 'object') return false;
    const received = Date.parse(message.receivedAt);
    return typeof message.id === 'string' && message.id.length > 0
      && message.threadId === application.threadId
      && (explicitReplyCollection ? message.isReply !== false : message.isReply === true)
      && address(message.from) === recipient
      && typeof message.body === 'string'
      && Number.isFinite(received) && received >= Date.parse(application.appliedAt || application.cvSentAt)
      && received <= current.getTime() + 5 * 60_000;
  }).sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt));
}

function reportBody(report, baseUrl) {
  const lines = [
    'Your job hunt', '',
    `Applications sent: ${report.applied}`,
    `Companies with accounts created: ${report.accountsCreated ?? 0}`,
    `Companies with profiles created: ${report.profilesCreated ?? 0}`,
    `Companies with CVs uploaded: ${report.cvsUploaded ?? 0}`,
    `Companies sent a CV: ${report.cvsSent ?? 0}`,
    `Companies with talent pools joined: ${report.talentPoolsJoined ?? 0}`,
    `Recorded replies: ${report.replies}`,
    `Interviews: ${report.interviews}`,
    `Follow-ups due: ${report.followUps.length}`,
    `Needs you: ${report.needsYou.length}`,
    `Updates needing attention: ${report.errors}`,
  ];
  if (report.followUps.length) lines.push('', 'Follow-ups', ...report.followUps.map(item => `${item.name}: ${item.followUpAt}`));
  if (report.needsYou.length) lines.push('', 'Needs you', ...report.needsYou.map(item => item.name));
  if (report.monitoring) {
    lines.push('', `New matching jobs: ${report.monitoring.newMatches}`, `Companies checked for jobs: ${report.monitoring.companiesChecked}`, `Recruitment sources checked: ${report.monitoring.sourcesChecked}`, `Sources needing sign-in or help: ${report.monitoring.blockedSources}`, `Source checks failed: ${report.monitoring.failedSources}`);
    for (const item of report.monitoring.needsYou) lines.push(`${item.companyName}: ${item.reason}`);
    if (report.monitoring.applicationUpdates) {
      const updates = report.monitoring.applicationUpdates;
      lines.push(`Tracked application threads checked: ${updates.checked}`, `Application statuses not freshly verified: ${updates.failed + updates.unavailable + updates.skipped}`);
      for (const item of updates.outcomes.filter(item => item.status !== 'checked')) lines.push(`${item.role || 'Tracked application'}: ${item.reason}`);
    }
  }
  lines.push('', `Open your tracker on this computer: ${baseUrl}`);
  return lines.join('\n');
}

/** Reply/report timers remain separate from explicitly enabled monitoring rules. */
export function createScheduler({ store, connections, clock = () => new Date(), intervalMs = 60_000, baseUrl = 'http://127.0.0.1:4000', monitoring = null }) {
  let timer = null;
  let refreshing = null;
  let reporting = null;
  let ticking = null;
  const scopedRefreshes = new Map(), threadReads = new Map();

  async function refreshInternal({ companyIds = null, shouldContinue = () => true } = {}) {
    const current = clock();
    const startedAt = current.toISOString();
    // Reserve before network access; wake/restart does not repeatedly retry the same slot.
    if (companyIds === null) store.updateSettings({ lastRefreshAt: startedAt, lastRefreshError: null });
    const scope = companyIds === null ? null : new Set(companyIds);
    const sent = store.listApplications().filter(item => item.appliedAt || item.cvSentAt);
    const known = scope ? sent.filter(item => scope.has(item.companyId)) : sent.filter(item => item.threadId && item.method === 'email' && ['applied', 'cv_sent', 'replied'].includes(item.status));
    const applications = known.filter(item => item.threadId && item.method === 'email' && item.status !== 'closed');
    const threadCounts = new Map();
    for (const application of sent.filter(item => item.threadId)) threadCounts.set(application.threadId, (threadCounts.get(application.threadId) || 0) + 1);
    const summary = { scope: scope ? 'selected_companies' : 'all_tracked', companyCount: scope?.size ?? null, checked: 0, updated: 0, skipped: 0, unavailable: 0, errors: [], outcomes: [], lastRefreshAt: startedAt };
    const record = (application, status, reason, extra = {}) => summary.outcomes.push({ applicationId: application.id, companyId: application.companyId, role: application.role || '', method: application.method, applicationStatus: application.status, status, reason, checkedAt: status === 'checked' ? startedAt : null, observedAt: startedAt, ...extra });
    for (const application of known) if (!applications.includes(application)) {
      if (application.status === 'closed') { summary.skipped++; record(application, 'skipped', 'This application is closed; its status was not refreshed.'); }
      else { summary.unavailable++; record(application, 'unavailable', 'No known email submission thread is recorded. Review the career portal for a fresh status.'); }
    }
    let next = 0;
    async function worker() {
      while (next < applications.length) {
        const application = applications[next++];
        if (!shouldContinue()) { summary.skipped++; record(application, 'skipped', 'Monitoring was paused or its permission changed before this thread read.'); continue; }
        if (threadCounts.get(application.threadId) !== 1) { summary.skipped++; record(application, 'skipped', 'This thread belongs to more than one tracked submission; inspect it before assigning a reply.'); continue; }
        try {
          const company = store.getCompany(application.companyId);
          const recipient = application.to || application.recipient || application.evidence?.to || (scope ? '' : company.email);
          if (company.archived || !address(recipient)) { summary.skipped++; record(application, 'skipped', 'The company is archived or the original submission has no verified recipient address.'); continue; }
          let reading = threadReads.get(application.id);
          if (!reading) {
            reading = Promise.resolve().then(() => shouldContinue() ? connections.callMapped('email', 'readThread', { threadId: application.threadId, applicationId: application.id }) : null).finally(() => { if (threadReads.get(application.id) === reading) threadReads.delete(application.id); });
            threadReads.set(application.id, reading);
          }
          const result = await reading;
          if (!shouldContinue()) { summary.skipped++; record(application, 'skipped', 'Monitoring was paused or its permission changed during the read; no application status was changed.'); continue; }
          const envelope = unpack(result), payload = envelope?.data && typeof envelope.data === 'object' ? envelope.data : envelope;
          if (!payload || !Array.isArray(payload.replies) && !Array.isArray(payload.messages) || payload.threadId && payload.threadId !== application.threadId || /^(?:error|failed|pending|approval_required|auth_required|authentication_required)$/i.test(payload.status || '')) throw new Error('The mailbox did not return a readable result for the tracked thread. Its application status is not freshly verified.');
          const latest = normalizedReplies(result, application, company, current).at(-1);
          summary.checked++;
          record(application, 'checked', latest ? 'Known submission thread checked against its saved sender and receipt.' : 'Known submission thread checked; no newer supported reply was found. The recorded application outcome remains unchanged.', { ...(latest ? { latestReplyAt: latest.receivedAt } : {}), source: 'tracked_email_thread' });
          if (!latest || (application.lastReplyAt && Date.parse(latest.receivedAt) <= Date.parse(application.lastReplyAt))) continue;
          // Human progress can change during a read; never move Interview/Offer/Closed backwards.
          const fresh = store.listApplications(application.companyId).find(item => item.id === application.id);
          if (!fresh || !['applied', 'cv_sent', 'replied'].includes(fresh.status)) { summary.skipped++; continue; }
          if (fresh.lastReplyAt && Date.parse(latest.receivedAt) <= Date.parse(fresh.lastReplyAt)) continue;
          store.logApplication({ id: fresh.id, companyId: fresh.companyId, role: fresh.role, method: fresh.method, status: 'replied', receivedAt: latest.receivedAt, lastReply: latest.body });
          summary.updated++;
        } catch (error) {
          summary.errors.push({ applicationId: application.id, error: errorText(error) });
          record(application, 'failed', errorText(error));
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, applications.length) }, worker));
    const failure = summary.errors.length ? `${summary.errors.length} thread update${summary.errors.length === 1 ? '' : 's'} failed. ${summary.errors[0].error}` : null;
    if (failure) {
      summary.status = summary.checked ? 'partial' : 'failed';
      summary.message = summary.checked ? `${summary.checked} email threads checked. ${failure}` : `No email threads could be checked. ${failure}`;
    } else if (summary.checked) {
      summary.status = summary.unavailable ? 'partial' : 'checked';
      summary.message = `${summary.checked} email thread${summary.checked === 1 ? '' : 's'} checked. ${summary.updated ? `${summary.updated} application${summary.updated === 1 ? '' : 's'} updated with a reply.` : 'No new matched replies.'}`;
      if (summary.unavailable) summary.message += ` ${summary.unavailable} application statuses need a portal check.`;
    } else if (summary.unavailable) {
      summary.status = 'unavailable';
      summary.message = `No email threads could be checked. ${summary.unavailable} application statuses need a portal check; their saved outcomes are unchanged.`;
    } else if (!applications.length) {
      summary.status = 'no_threads';
      summary.message = 'No sent email threads to check yet. Directory links have not been rechecked.';
    } else {
      summary.status = 'skipped';
      summary.message = scope ? 'No email threads were checked. See the recorded per-application reason; saved outcomes are unchanged.' : 'No email threads were checked. Add a known recipient and a unique thread ID to the recorded applications.';
    }
    if (companyIds === null) store.updateSettings({ lastRefreshError: failure, lastRefreshMessage: summary.message, lastRefreshStatus: summary.status });
    store.addActivity(scope ? 'monitor_application_updates' : summary.checked ? 'refresh_completed' : 'refresh_skipped', summary.message);
    return summary;
  }

  function refresh() {
    if (!refreshing) refreshing = refreshInternal().finally(() => { refreshing = null; });
    return refreshing;
  }

  function refreshForCompanies(companyIds, { shouldContinue = () => true } = {}) {
    if (!Array.isArray(companyIds) || companyIds.some(id => typeof id !== 'string') || typeof shouldContinue !== 'function') throw new Error('Choose explicit company IDs for tracked-thread updates.');
    const ids = [...new Set(companyIds)].sort(), key = JSON.stringify(ids);
    if (!scopedRefreshes.has(key)) {
      const refreshing = refreshInternal({ companyIds: ids, shouldContinue }).finally(() => scopedRefreshes.delete(key));
      scopedRefreshes.set(key, refreshing);
    }
    return scopedRefreshes.get(key);
  }

  async function generateReportInternal() {
    const current = clock();
    const settings = store.getSettings();
    const since = settings.lastReportAt || new Date(current.getTime() - (settings.reportFrequency === 'daily' ? DAY : 7 * DAY)).toISOString();
    const generatedAt = current.toISOString();
    // Persist before send; ambiguous delivery is never automatically resent in this slot.
    store.updateSettings({ lastReportAt: generatedAt, lastReportError: null });
    const report = store.saveReport({ ...store.report({ since }), ...(store.monitoringReport ? { monitoring: store.monitoringReport({ since, until: generatedAt }) } : {}), generatedAt, delivery: { status: settings.emailReports ? 'pending' : 'local', ...(settings.emailReports ? { to: settings.reportEmail, attemptedAt: generatedAt } : {}) } });
    if (!settings.emailReports) {
      store.addActivity('report_created', 'Report saved on this computer.');
      return report;
    }
    try {
      if (!address(settings.reportEmail)) throw new Error('Add a valid report email address in Settings.');
      const response = await connections.callMapped('email', 'sendEmail', {
        to: settings.reportEmail,
        recipient: settings.reportEmail,
        reportId: report.id,
        idempotencyKey: report.id,
        subject: `Your job hunt, ${new Intl.DateTimeFormat('en-GB', { timeZone: settings.timezone, dateStyle: 'medium' }).format(current)}`,
        body: reportBody(report, baseUrl),
      });
      const receipt = confirmedEmailReceipt(response, connections.getMappings?.('email')?.sendEmail || {});
      if (!receipt) {
        throw new Error('The email tool did not return a confirmed sent receipt. Check your mailbox before sending this report again.');
      }
      report.delivery = { ...report.delivery, status: 'sent', messageId: receipt.providerMessageId, receipt, sentAt: current.toISOString() };
      store.saveReport(report);
      store.addActivity('report_sent', 'Report sent through the connected mailbox.');
    } catch (error) {
      const message = errorText(error);
      report.delivery = { ...report.delivery, status: 'unconfirmed', error: message };
      store.saveReport(report);
      store.updateSettings({ lastReportError: message });
      store.addActivity('report_email_unconfirmed', `Report saved locally. Email delivery is unconfirmed. ${message}`);
    }
    return report;
  }

  function generateReport() {
    if (!reporting) reporting = generateReportInternal().finally(() => { reporting = null; });
    return reporting;
  }

  async function tickInternal() {
    const current = clock();
    const settings = store.getSettings();
    const interval = intervals[settings.refreshFrequency];
    const result = {};
    if (interval && (!settings.lastRefreshAt || current.getTime() - Date.parse(settings.lastRefreshAt) >= interval)) result.refresh = await refresh();
    if (isReportDue(store.getSettings(), current)) result.report = await generateReport();
    if (monitoring) result.monitoring = await monitoring.tick();
    return result;
  }

  function tick() {
    if (!ticking) ticking = tickInternal().finally(() => { ticking = null; });
    return ticking;
  }

  function start() {
    if (timer) return;
    const run = () => tick().catch(error => {
      store.updateSettings({ lastRefreshError: errorText(error) });
      store.addActivity('schedule_error', errorText(error));
    });
    timer = setInterval(run, intervalMs);
    timer.unref?.();
    void run();
  }

  async function stop() {
    clearInterval(timer);
    timer = null;
    await Promise.allSettled([ticking, refreshing, reporting, ...scopedRefreshes.values()].filter(Boolean));
  }

  return { tick, refresh, refreshForCompanies, generateReport, start, stop };
}
