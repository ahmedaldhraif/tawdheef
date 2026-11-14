import { applicationMilestones } from './progress.mjs';

const time = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const value = input => typeof input === 'string' && input.trim() ? input.trim() : null;
const evidenceExists = evidence => !!(value(evidence) || (evidence && typeof evidence === 'object' && ['providerMessageId', 'messageId', 'receipt', 'url', 'confirmation'].some(key => value(evidence[key]))));

function publicUrl(input) {
  try {
    const url = new URL(input);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined;
    // The full company record retains source evidence. A compact snapshot must
    // not repeat session tokens or form parameters in its preview links.
    return url.origin + url.pathname.replace(/\/+$/, '');
  } catch { return undefined; }
}

/** Calendar Monday, not a rolling seven-day duration. Searching local dates
 * handles timezone offsets, DST and midnight transitions without an extra library. */
export function snapshotWeekStart(until, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const day = date => {
    const parts = formatter.formatToParts(date);
    return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
  };
  const current = day(new Date(until));
  const date = new Date(current + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  const monday = date.toISOString().slice(0, 10), middle = date.getTime();
  // Find the first matching local date, then the exact boundary. A day is never
  // inferred by subtracting 24 hours from the current local timestamp.
  let previous = middle - 36 * 3600000;
  for (let cursor = previous + 3600000; cursor <= middle + 36 * 3600000; cursor += 3600000) {
    if (day(new Date(cursor)) >= monday) {
      let low = previous, high = cursor;
      while (high - low > 1) {
        const candidate = Math.floor((low + high) / 2);
        if (day(new Date(candidate)) >= monday) high = candidate;
        else low = candidate;
      }
      return new Date(high).toISOString();
    }
    previous = cursor;
  }
  throw new Error('Could not determine the start of this week.');
}

function messageKey(application, milestone) {
  const receipt = milestone.evidence && typeof milestone.evidence === 'object' ? milestone.evidence : {};
  const currentReceipt = application.evidence && typeof application.evidence === 'object' ? application.evidence : {};
  const id = value(receipt.providerMessageId) || value(receipt.messageId) || value(application.providerMessageId) || value(currentReceipt.providerMessageId) || value(currentReceipt.messageId);
  if (!id) return null;
  const provider = value(receipt.provider) || value(receipt.providerId) || value(currentReceipt.provider) || value(currentReceipt.providerId) || value(application.provider) || value(application.providerId) || '';
  const account = value(receipt.accountId) || value(receipt.mailbox) || value(receipt.mailboxId) || value(currentReceipt.accountId) || value(currentReceipt.mailbox) || value(currentReceipt.mailboxId) || value(application.accountId) || value(application.mailbox) || value(application.mailboxId) || '';
  return JSON.stringify([provider, account.toLowerCase(), id]);
}

const earlier = (items, key, item) => {
  const previous = items.get(key);
  if (!previous || item.at < previous.at || (item.at === previous.at && item.id < previous.id)) items.set(key, item);
};

/** Derive evidence-backed outcomes, never mutable company status or counters.
 * All deduplication precedes window filtering so editing/relogging old work
 * cannot turn it into a new weekly achievement. */
export function directorySnapshot({ directory, companies, applications, activity = [], timeZone, until, period = 'all_time', metric = null, offset = 0, limit = 20 }) {
  const since = period === 'this_week' ? snapshotWeekStart(until, timeZone) : null;
  const lower = since ? Date.parse(since) : -Infinity, upper = Date.parse(until);
  const members = new Map(companies.filter(company => company.directoryId === directory.id).map(company => [company.id, company]));
  const applied = new Map(), profiles = new Map(), emails = new Map(), missingEmails = new Map();
  const profileDestinations = new Map(), knownProfileCompanies = new Set();
  for (const application of applications) {
    const company = members.get(application.companyId);
    if (!company) continue;
    const row = milestone => ({
      id: String(application.id), companyId: company.id, companyName: company.name,
      role: String(application.role || '').slice(0, 500), at: new Date(milestone.at).toISOString(),
      method: String(application.method || '').slice(0, 100),
      ...(publicUrl(milestone.url || application.url) ? { url: publicUrl(milestone.url || application.url) } : {}),
      ...(value(application.to) ? { recipient: application.to.slice(0, 320) } : {}),
    });
    const unresolved = ['sending', 'unknown', 'failed'].includes(application.deliveryStatus);
    for (const milestone of applicationMilestones(application)) {
      if (time(milestone.at) === null) continue;
      if (milestone.event === 'profile_created' && (evidenceExists(milestone.evidence) || publicUrl(milestone.url))) {
        if (unresolved && application.purpose === 'profile') continue;
        const destination = publicUrl(milestone.url) || milestone.destination || 'company';
        knownProfileCompanies.add(company.id);
        earlier(profileDestinations, JSON.stringify([company.id, destination]), row(milestone));
      }
      if (!['applied', 'cv_sent'].includes(milestone.event) || unresolved) continue;
      if (!evidenceExists(milestone.evidence) && !evidenceExists(application.evidence)) continue;
      const item = row(milestone);
      const receiptKey = application.method === 'email' ? messageKey(application, milestone) : null;
      if (milestone.event === 'applied' && (!application.purpose || application.purpose === 'application')) {
        earlier(applied, receiptKey ? 'email:' + receiptKey : application.idempotencyKey || application.id, item);
      }
      if (application.method !== 'email' || (application.purpose && !['application', 'cv_share'].includes(application.purpose))) continue;
      if (receiptKey) earlier(emails, receiptKey, item);
      else earlier(missingEmails, application.idempotencyKey || application.id, item);
    }
  }
  // Only explicit legacy profile outcomes are retained; status changes and an
  // account registration cannot imply profile completion or a submitted job.
  const legacyProfiles = new Map();
  for (const item of activity) {
    const company = members.get(item.companyId);
    if (!company || item.applicationId || item.action !== 'profile_created' || knownProfileCompanies.has(company.id) || time(item.createdAt) === null || !value(item.detail)) continue;
    earlier(legacyProfiles, company.id, { id: String(item.id), companyId: company.id, companyName: company.name, role: '', method: 'career_page', at: new Date(item.createdAt).toISOString() });
  }
  const inWindow = item => Date.parse(item.at) >= lower && Date.parse(item.at) <= upper;
  // A company may complete a genuinely new profile on another careers portal
  // this week; count that company once within the window, not every portal.
  for (const item of [...profileDestinations.values(), ...legacyProfiles.values()].filter(inWindow)) earlier(profiles, item.companyId, item);
  const sort = rows => rows.sort((a, b) => b.at.localeCompare(a.at) || a.companyName.localeCompare(b.companyName) || a.id.localeCompare(b.id));
  const outcomes = { applications: sort([...applied.values()].filter(inWindow)), profiles: sort([...profiles.values()]), emails: sort([...emails.values()].filter(inWindow)) };
  const rows = metric ? outcomes[metric] : [];
  return {
    directoryId: directory.id, directoryName: directory.name, period, timeZone, since, until,
    counts: Object.fromEntries(Object.entries(outcomes).map(([key, items]) => [key, items.length])),
    unverifiedEmails: [...missingEmails.values()].filter(inWindow).length,
    metric, items: rows.slice(offset, offset + limit), total: rows.length, offset, limit,
  };
}
