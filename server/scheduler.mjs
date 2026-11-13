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
  lines.push('', `Open your tracker on this computer: ${baseUrl}`);
  return lines.join('\n');
}

/** Local timers refresh recorded threads and create reports. They never start application runs. */
export function createScheduler({ store, connections, clock = () => new Date(), intervalMs = 60_000, baseUrl = 'http://127.0.0.1:4000' }) {
  let timer = null;
  let refreshing = null;
  let reporting = null;
  let ticking = null;

  async function refreshInternal() {
    const current = clock();
    const startedAt = current.toISOString();
    // Reserve before network access; wake/restart does not repeatedly retry the same slot.
    store.updateSettings({ lastRefreshAt: startedAt, lastRefreshError: null });
    const applications = store.listApplications().filter(item => (item.appliedAt || item.cvSentAt) && item.threadId && item.method === 'email' && ['applied', 'cv_sent', 'replied'].includes(item.status));
    const threadCounts = new Map();
    for (const application of applications) threadCounts.set(application.threadId, (threadCounts.get(application.threadId) || 0) + 1);
    const summary = { checked: 0, updated: 0, skipped: 0, errors: [], lastRefreshAt: startedAt };
    let next = 0;
    async function worker() {
      while (next < applications.length) {
        const application = applications[next++];
        if (threadCounts.get(application.threadId) !== 1) { summary.skipped++; continue; }
        try {
          const company = store.getCompany(application.companyId);
          if (company.archived || !address(application.to || application.recipient || application.evidence?.to || company.email)) { summary.skipped++; continue; }
          const result = await connections.callMapped('email', 'readThread', { threadId: application.threadId, applicationId: application.id });
          summary.checked++;
          const latest = normalizedReplies(result, application, company, current).at(-1);
          if (!latest || (application.lastReplyAt && Date.parse(latest.receivedAt) <= Date.parse(application.lastReplyAt))) continue;
          // Human progress can change during a read; never move Interview/Offer/Closed backwards.
          const fresh = store.listApplications(application.companyId).find(item => item.id === application.id);
          if (!fresh || !['applied', 'cv_sent', 'replied'].includes(fresh.status)) { summary.skipped++; continue; }
          if (fresh.lastReplyAt && Date.parse(latest.receivedAt) <= Date.parse(fresh.lastReplyAt)) continue;
          store.logApplication({ id: fresh.id, companyId: fresh.companyId, role: fresh.role, method: fresh.method, status: 'replied', receivedAt: latest.receivedAt, lastReply: latest.body });
          summary.updated++;
        } catch (error) {
          summary.errors.push({ applicationId: application.id, error: errorText(error) });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, applications.length) }, worker));
    const failure = summary.errors.length ? `${summary.errors.length} thread update${summary.errors.length === 1 ? '' : 's'} failed. ${summary.errors[0].error}` : null;
    if (failure) {
      summary.status = summary.checked ? 'partial' : 'failed';
      summary.message = summary.checked ? `${summary.checked} email threads checked. ${failure}` : `No email threads could be checked. ${failure}`;
    } else if (summary.checked) {
      summary.status = 'checked';
      summary.message = `${summary.checked} email thread${summary.checked === 1 ? '' : 's'} checked. ${summary.updated ? `${summary.updated} application${summary.updated === 1 ? '' : 's'} updated with a reply.` : 'No new matched replies.'}`;
    } else if (!applications.length) {
      summary.status = 'no_threads';
      summary.message = 'No sent email threads to check yet. Directory links have not been rechecked.';
    } else {
      summary.status = 'skipped';
      summary.message = 'No email threads were checked. Add a known recipient and a unique thread ID to the recorded applications.';
    }
    store.updateSettings({ lastRefreshError: failure, lastRefreshMessage: summary.message, lastRefreshStatus: summary.status });
    store.addActivity(summary.checked ? 'refresh_completed' : 'refresh_skipped', summary.message);
    return summary;
  }

  function refresh() {
    if (!refreshing) refreshing = refreshInternal().finally(() => { refreshing = null; });
    return refreshing;
  }

  async function generateReportInternal() {
    const current = clock();
    const settings = store.getSettings();
    const since = settings.lastReportAt || new Date(current.getTime() - (settings.reportFrequency === 'daily' ? DAY : 7 * DAY)).toISOString();
    const generatedAt = current.toISOString();
    // Persist before send; ambiguous delivery is never automatically resent in this slot.
    store.updateSettings({ lastReportAt: generatedAt, lastReportError: null });
    const report = store.saveReport({ ...store.report({ since }), generatedAt, delivery: { status: settings.emailReports ? 'pending' : 'local', ...(settings.emailReports ? { to: settings.reportEmail, attemptedAt: generatedAt } : {}) } });
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
    await Promise.allSettled([ticking, refreshing, reporting].filter(Boolean));
  }

  return { tick, refresh, generateReport, start, stop };
}
