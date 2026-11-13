// Progress is derived from recorded outcomes, never from company status or source data.
export const PROGRESS_EVENTS = ['account_created', 'profile_created', 'cv_uploaded', 'cv_sent', 'talent_pool_joined', 'applied'];
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const supported = value => PROGRESS_EVENTS.includes(value);

function destination(application, event) {
  if (event === 'applied') return `application:${application.id}`;
  if (event === 'cv_sent' && application.to) return `email:${application.to.trim().toLowerCase()}`;
  try {
    const url = new URL(application.url);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) {
      return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
    }
  } catch {}
  return 'company';
}

export function applicationMilestones(application) {
  const milestones = (application.milestones || []).filter(item => supported(item.event) && validTime(item.at)).map(item => ({ ...item }));
  const append = (event, at) => {
    if (!supported(event) || !validTime(at)) return;
    const target = destination(application, event);
    if (!milestones.some(item => item.event === event && item.destination === target)) {
      milestones.push({ event, at, destination: target, url: application.url || '', evidence: application.evidence || null });
    }
  };
  // Backward compatibility: only facts that the old record actually retained.
  if (application.appliedAt) append('applied', application.appliedAt);
  if (application.cvSentAt) append('cv_sent', application.cvSentAt);
  if (!milestones.some(item => item.event === application.status)) append(application.status, application.updatedAt || application.createdAt);
  return milestones.sort((a, b) => a.at.localeCompare(b.at));
}

export function recordMilestone(previous, application, at) {
  const milestones = previous ? applicationMilestones(previous) : [];
  if (supported(application.status)) {
    const target = destination(application, application.status);
    if (!milestones.some(item => item.event === application.status && item.destination === target)) {
      milestones.push({ event: application.status, at, destination: target, url: application.url || '', evidence: application.evidence || null });
    }
  }
  return milestones;
}

export function progressByCompany(applications, activity = []) {
  const values = new Map();
  const entry = companyId => {
    if (!values.has(companyId)) values.set(companyId, Object.fromEntries(PROGRESS_EVENTS.map(event => [event, new Set()])));
    return values.get(companyId);
  };
  for (const application of applications) {
    for (const milestone of applicationMilestones(application)) entry(application.companyId)[milestone.event].add(milestone.destination || 'company');
  }
  // Older versions kept the current event only. Their explicit activity remains
  // evidence of a milestone, but cannot establish an additional destination.
  for (const item of activity) {
    if (supported(item.action) && item.companyId && validTime(item.createdAt)) {
      const targets = entry(item.companyId)[item.action];
      if (!targets.size) targets.add('company');
    }
  }
  return new Map([...values].map(([companyId, events]) => [companyId, Object.fromEntries(PROGRESS_EVENTS.map(event => [event, events[event].size]))]));
}

export const emptyProgress = () => Object.fromEntries(PROGRESS_EVENTS.map(event => [event, 0]));

export function milestoneReport(applications, activity, companyIds, since, until) {
  const start = Date.parse(since), end = Date.parse(until);
  const counts = Object.fromEntries(PROGRESS_EVENTS.map(event => [event, new Set()]));
  const add = (companyId, event, at) => {
    const time = Date.parse(at);
    if (companyIds.has(companyId) && supported(event) && time >= start && time <= end) counts[event].add(companyId);
  };
  const known = new Set();
  const firstRecorded = new Map();
  for (const application of applications) for (const milestone of applicationMilestones(application)) {
    known.add(`${application.companyId}:${milestone.event}`);
    const key = JSON.stringify([application.companyId, milestone.event, milestone.destination || 'company']);
    const previous = firstRecorded.get(key);
    if (!previous || milestone.at < previous.at) firstRecorded.set(key, { companyId: application.companyId, ...milestone });
  }
  for (const milestone of firstRecorded.values()) add(milestone.companyId, milestone.event, milestone.at);
  // Activity is a conservative fallback for old records that lost their prior
  // event. Repeated legacy messages cannot establish another new achievement.
  const legacy = new Map();
  for (const item of activity) {
    const key = `${item.companyId}:${item.action}`;
    if (!supported(item.action) || known.has(key) || !validTime(item.createdAt)) continue;
    if (!legacy.has(key) || item.createdAt < legacy.get(key).createdAt) legacy.set(key, item);
  }
  for (const item of legacy.values()) add(item.companyId, item.action, item.createdAt);
  return {
    accountsCreated: counts.account_created.size,
    profilesCreated: counts.profile_created.size,
    cvsUploaded: counts.cv_uploaded.size,
    cvsSent: counts.cv_sent.size,
    talentPoolsJoined: counts.talent_pool_joined.size,
    progressCountUnit: 'companies',
  };
}
