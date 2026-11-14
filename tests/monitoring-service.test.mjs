import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { openStore } from '../server/store.mjs';
import { createMonitoring, MONITOR_TOOLS } from '../server/monitoring.mjs';
import { publicAddress, publicSourceUrl, publicPageSnapshot, readPublicPage } from '../server/monitoring-source.mjs';

async function fixture(t, { readPage, callMapped } = {}) {
  const prefix = join(tmpdir(), 'tawdheef-monitor-service-'), dataDir = await mkdtemp(prefix);
  let current = new Date('2026-11-14T08:00:00Z');
  const clock = () => current;
  const store = openStore({ dataDir, seed: false, clock });
  store.createDirectory({ id: 'fixture', name: 'Fixture' });
  store.addCompanies('fixture', [{ id: 'company', name: 'Synthetic company', email: 'careers@example.test', careersUrl: 'https://careers.example.com/jobs' }]);
  const accounts = { email: 'person@example.test', calendar: 'person@example.test' }, calls = [];
  const providers = { email: 'google-cli', calendar: 'google-calendar' };
  const connections = {
    list: () => ['email', 'calendar'].map(kind => ({ kind, status: accounts[kind] ? 'connected' : 'disconnected', provider: providers[kind], account: accounts[kind] })),
    async callMapped(kind, action, args) {
      assert.ok(['readThread', 'listEvents'].includes(action), 'monitoring must never request an external write');
      calls.push({ kind, action, args });
      return callMapped?.(kind, action, args, { accounts, providers }) ?? { structuredContent: { events: [] } };
    },
  };
  const service = createMonitoring({ store, connections, clock, readPage: readPage || (async () => ({ text: 'Synthetic jobs', links: [], contentHash: 'fixture-hash', untrusted: true })) });
  t.after(async () => { store.close(); assert.ok(resolve(dataDir).startsWith(resolve(prefix))); await rm(dataDir, { recursive: true, force: true, maxRetries: 5 }); });
  const enable = patch => store.configureMonitoring({ expectedRevision: store.getMonitoring().config.revision, explicit: true, patch: { enabled: true, channels: { jobs: true }, scope: { directoryIds: ['fixture'] }, ...patch } });
  const input = (kind = 'jobs', id = 'company') => ({ configurationRevision: store.getMonitoring().config.revision, assistant: 'codex', source: { kind, id } });
  return { store, service, enable, input, calls, accounts, providers, clock, advance: ms => { current = new Date(+current + ms); } };
}
const known = [{ externalId: 'job-1', title: 'Engineer', url: 'https://careers.example.com/jobs/1', data: { state: 'open' }, evidence: 'Synthetic job listing' }];
const emailScope = (email, provider = 'gmail') => ({ provider, accountId: 'sha256:' + createHash('sha256').update(JSON.stringify([provider, `email:${email.toLowerCase()}`])).digest('hex') });
function trackedEmail(store, identity = emailScope('person@example.test')) {
  const run = store.startRun({ directoryId: 'fixture', companyIds: ['company'], mode: 'send_and_submit', explicit: true });
  const application = store.logApplication({ companyId: 'company', runId: run.id, role: 'Synthetic role', method: 'email', status: 'applied', to: 'careers@example.test', threadId: 'thread-1', evidence: { providerMessageId: 'sent-1', ...identity } });
  store.updateRun(run.id, { status: 'completed' });
  return application;
}
const reply = index => ({ id: `reply-${index}`, threadId: 'thread-1', isReply: true, from: 'Careers <careers@example.test>', body: 'Synthetic reply', receivedAt: '2026-11-14T08:01:00Z' });

test('web monitoring records a complete fingerprint once, then recognizes unchanged content without application authority', async t => {
  let reads = 0;
  const { store, service, enable, input } = await fixture(t, { readPage: async () => { reads++; return { text: 'Synthetic jobs', links: [], contentHash: 'fixture-hash', untrusted: true }; } });
  enable();
  const pending = await service.check(input());
  assert.equal(pending.status, 'needs_observation');
  const recorded = service.record({ id: pending.check.id, token: pending.check.token, status: 'checked', observations: known });
  assert.equal(recorded.check.status, 'checked'); assert.equal(recorded.added, 1);
  const unchanged = await service.check(input());
  assert.equal(unchanged.check.status, 'checked'); assert.equal(unchanged.added, 0); assert.equal(reads, 2);
  assert.equal(store.listMonitoringUpdates().total, 1);
  assert.equal(store.listApplications().length, 0); assert.equal(store.listRuns().length, 0);
  assert.ok(!MONITOR_TOOLS.some(name => /start_run|send|form_submission|create_calendar|configure_monitoring/.test(name)));
});

test('an edited careers URL cannot inherit the old source HTML cursor even if its content hash matches', async t => {
  const { store, service, enable, input } = await fixture(t); enable();
  const original = await service.check(input());
  service.record({ id: original.check.id, token: original.check.token, status: 'checked', observations: [] });
  store.updateCompany('company', { careersUrl: 'https://careers.example.com/replacement-jobs' });
  const replacement = await service.check(input());
  assert.equal(replacement.status, 'needs_observation'); assert.equal(replacement.previousCursor, null);
  assert.equal(replacement.check.source.url, 'https://careers.example.com/replacement-jobs');
});

test('incomplete web snapshots retain observations without advancing a success cursor', async t => {
  const { store, service, enable, input } = await fixture(t, { readPage: async () => ({ text: 'Bounded partial source', links: [], textTruncated: true, contentHash: 'partial-hash', untrusted: true }) });
  enable();
  const first = await service.check(input());
  const partial = service.record({ id: first.check.id, token: first.check.token, status: 'checked', observations: known });
  assert.equal(partial.check.status, 'partial'); assert.equal(partial.check.cursor, null);
  assert.equal(store.getMonitoring().status.lastSuccessAt, null); assert.equal(store.listMonitoringUpdates().total, 1);
  const retry = await service.check(input()); assert.equal(retry.status, 'needs_observation');
  service.record({ id: retry.check.id, token: retry.check.token, status: 'unknown', observations: [] });
  assert.equal(store.listMonitoringUpdates().total, 1, 'incomplete or absent results cannot delete prior observations');
});

test('JavaScript and embedded careers shells require a real browser observation rather than a static hash', () => {
  const cases = [
    ['<div id="root"></div><script src="/assets/main.js"></script>', 'https://careers.example.com/'],
    ['<noscript>You need to enable JavaScript to see jobs.</noscript><script src="/app.js"></script>', 'https://careers.example.com/'],
    ['<div id="__next">Careers</div><script id="__NEXT_DATA__" type="application/json">{}</script>', 'https://careers.example.com/'],
    ['<h1>Careers</h1><script>fetch("/api/jobs").then(renderJobs)</script>', 'https://careers.example.com/'],
    [`<h1>Careers</h1><p>${'Long static company introduction. '.repeat(40)}</p><div id="vacancy-results"></div><script src="/runtime.js"></script>`, 'https://careers.example.com/'],
    ['<p>There are no current vacancies.</p><script src="/analytics.js"></script>', 'https://careers.example.com/'],
    ['<iframe src="https://boards.example.com/jobs"></iframe>', 'https://careers.example.com/'],
    ['<h1>Careers</h1><p>Explore our teams.</p>', 'https://company.wd1.myworkdayjobs.com/en-US/jobs'],
  ];
  for (const [html, url] of cases) {
    const page = publicPageSnapshot(html, url);
    assert.equal(page.requiresBrowser, true, url); assert.ok(page.browserReason);
  }
});

test('identical HTML shells never skip two browser-backed cycles or establish a successful static cursor', async t => {
  const shell = '<title>Careers</title><div id="root"></div><script src="/assets/main.js"></script>';
  const page = publicPageSnapshot(shell, 'https://careers.example.com/jobs');
  let reads = 0;
  const { store, service, enable, input, advance } = await fixture(t, { readPage: async () => { reads++; return { ...page }; } });
  enable();
  for (let cycle = 1; cycle <= 2; cycle++) {
    const pending = await service.check(input());
    assert.equal(pending.status, 'needs_observation'); assert.equal(pending.page.contentHash, page.contentHash);
    assert.match(pending.nextStep, /supported browser\/computer tools.*read-only/);
    const recorded = service.record({ id: pending.check.id, token: pending.check.token, status: 'checked', complete: true, cursor: 'caller-must-not-cache-this', observations: [{ externalId: `browser-job-${cycle}`, title: `Browser-observed job ${cycle}`, url: `https://careers.example.com/jobs/${cycle}`, evidence: 'Injected read-only browser observation fixture' }] });
    assert.equal(recorded.check.status, 'partial'); assert.equal(recorded.check.cursor, null);
    assert.equal(store.getMonitoring().status.lastSuccessAt, null); advance(1000);
  }
  assert.equal(reads, 2); assert.equal(store.listMonitoringUpdates().total, 2);
  // Even a hash saved by an older app version must not suppress a shell read.
  const old = store.beginMonitoringCheck(input());
  store.finishMonitoringCheck({ id: old.check.id, token: old.token, status: 'checked', observations: [], cursor: page.contentHash });
  const oldSuccess = store.getMonitoring().status.lastSuccessAt;
  advance(1000);
  const legacy = await service.check(input());
  assert.equal(legacy.status, 'needs_observation');
  const blocked = service.record({ id: legacy.check.id, token: legacy.check.token, status: 'unknown', observations: [], summary: 'Supported browser access is unavailable. Open the saved source to verify current jobs.' });
  assert.equal(blocked.check.status, 'unknown'); assert.equal(store.getMonitoring().status.lastSuccessAt, oldSuccess);
  assert.equal(store.listApplications().length, 0); assert.equal(store.listRuns().length, 0);
});

test('a clear static no-vacancy notice retains normal source-backed observation and unchanged checks', async t => {
  const page = publicPageSnapshot('<h1>Careers</h1><p>There are no current vacancies. Please check this page later.</p>', 'https://careers.example.com/jobs');
  assert.equal(page.requiresBrowser, false); assert.equal(page.browserReason, null);
  const { store, service, enable, input } = await fixture(t, { readPage: async () => ({ ...page }) });
  enable();
  const pending = await service.check(input());
  const observed = service.record({ id: pending.check.id, token: pending.check.token, status: 'checked', observations: [], summary: 'The static public source explicitly states there are no current vacancies.' });
  assert.equal(observed.check.status, 'checked'); assert.equal(observed.check.cursor, page.contentHash);
  const unchanged = await service.check(input());
  assert.equal(unchanged.check.status, 'checked'); assert.equal(store.listMonitoringUpdates().total, 0);
});

test('fresh complete client-reported browser reads can finish while identical shell HTML always requires another render', async t => {
  const page = publicPageSnapshot('<div id="root"></div><script src="/bundle.js"></script>', 'https://careers.example.com/jobs');
  const { store, service, enable, input, clock, advance } = await fixture(t, { readPage: async () => ({ ...page }) });
  enable();
  for (let cycle = 1; cycle <= 2; cycle++) {
    const pending = await service.check(input()); assert.equal(pending.status, 'needs_observation');
    const result = service.record({ id: pending.check.id, token: pending.check.token, status: 'checked', complete: true, cursor: 'caller-supplied-hash', sourceRead: { method: 'native_browser', url: `${page.url}#jobs`, observedAt: clock().toISOString(), evidence: 'Injected browser fixture: the saved careers page finished loading and displayed the listed roles.' }, observations: [{ externalId: `browser-${cycle}`, title: `Observed role ${cycle}`, evidence: 'Injected browser role evidence' }] });
    assert.equal(result.check.status, 'checked'); assert.equal(result.check.cursor, null);
    assert.equal(result.check.sourceRead.method, 'native_browser'); assert.equal(result.check.sourceRead.clientReported, true);
    assert.equal(result.check.sourceRead.url, page.url); assert.equal(result.check.sourceRead.observedAt, clock().toISOString());
    assert.equal(store.getMonitoring().status.lastSuccessAt, clock().toISOString());
    advance(1000);
  }
  assert.equal(store.listMonitoringUpdates().total, 2);
  assert.equal(store.listApplications().length, 0); assert.equal(store.listRuns().length, 0);
});

test('browser evidence requires the exact source, fresh lease time, bounded safe fields and explicit completeness', async t => {
  const finalUrl = 'https://careers.example.com/redirected-jobs';
  const page = publicPageSnapshot('<div id="app"></div><script src="/bundle.js"></script>', finalUrl);
  const { store, service, enable, input, clock } = await fixture(t, { readPage: async () => ({ ...page }) });
  enable();
  const pending = await service.check(input()), key = { id: pending.check.id, token: pending.check.token };
  const base = { method: 'native_browser', url: finalUrl, observedAt: clock().toISOString(), evidence: 'Injected browser fixture observed the loaded current roles.' };
  assert.equal(store.getMonitoringCheck(key).pageUrl, finalUrl, 'only the server-observed redirect becomes an allowed final URL');
  for (const invalid of [
    { ...base, url: 'https://unrelated.example.com/jobs' },
    { ...base, observedAt: '2026-11-14T07:54:59.999Z' },
    { ...base, observedAt: '2026-11-14T08:05:00.001Z' },
    { ...base, method: 'static_html' }, { ...base, evidence: '' },
    { ...base, evidence: 'x'.repeat(4001) }, { ...base, evidence: 'password=fixture-secret' },
    { ...base, evidence: 'API_KEY=fixture-secret' }, { ...base, evidence: 'Bearer fixture-token' },
    { ...base, evidence: '{"access_token":"fixture-secret"}' },
    { ...base, sessionId: 'must-not-persist' }, null,
  ]) {
    assert.throws(() => service.record({ ...key, status: 'checked', complete: true, observations: known, sourceRead: invalid }));
    assert.equal(store.getMonitoringCheck(key).status, 'running'); assert.equal(store.listMonitoringUpdates().total, 0);
  }
  const partial = service.record({ ...key, status: 'checked', sourceRead: base, observations: known });
  assert.equal(partial.check.status, 'partial', 'browser completion must be explicit'); assert.equal(partial.check.cursor, null);
  assert.equal(partial.check.sourceRead.clientReported, true);
  const next = await service.check(input());
  const complete = service.record({ id: next.check.id, token: next.check.token, status: 'checked', complete: true, sourceRead: { ...base, url: `${finalUrl}#roles` }, observations: known });
  assert.equal(complete.check.status, 'checked'); assert.equal(complete.check.cursor, null);
});

test('static JSON-LD remains untrusted visible evidence, affects the source hash and reports its own truncation', async t => {
  const html = '<h1>Careers</h1><script type="application/ld+json">{"@type":"JobPosting","title":"JavaScript required role"}</script>';
  const page = publicPageSnapshot(html, 'https://careers.example.com/jobs');
  assert.equal(page.requiresBrowser, false); assert.match(page.structuredData, /JobPosting/);
  assert.equal(page.structuredDataTruncated, false); assert.equal(page.untrusted, true);
  assert.notEqual(page.contentHash, publicPageSnapshot(html.replace('required role', 'Engineer'), page.url).contentHash);
  const executable = publicPageSnapshot('<script data-note="type=\'application/ld+json\'">fetch("/api/jobs")</script>', page.url);
  assert.equal(executable.requiresBrowser, true, 'a quoted attribute value must not disguise an executable script as JSON-LD');
  const large = publicPageSnapshot(`<script type=application/ld+json>{"@type":"JobPosting","description":"${'x'.repeat(7000)}"}</script>`, page.url);
  assert.equal(large.requiresBrowser, false); assert.equal(large.structuredData.length, 6000); assert.equal(large.structuredDataTruncated, true);
  const { service, enable, input } = await fixture(t, { readPage: async () => ({ ...large }) }); enable();
  const pending = await service.check(input());
  const partial = service.record({ id: pending.check.id, token: pending.check.token, status: 'checked', observations: [] });
  assert.equal(partial.check.status, 'partial'); assert.equal(partial.check.cursor, null);
});

test('late web reads and records cannot commit after a lease expires or saved scope is revoked', async t => {
  let completeRead, notify;
  const started = new Promise(resolve => { notify = resolve; });
  const { store, service, enable, input, advance } = await fixture(t, { readPage: () => { notify(); return new Promise(resolve => { completeRead = resolve; }); } });
  enable();
  const pending = service.check(input()); await started;
  store.configureMonitoring({ expectedRevision: store.getMonitoring().config.revision, patch: { enabled: false } });
  completeRead({ text: 'Late source', links: [], contentHash: 'late-hash', untrusted: true });
  await assert.rejects(pending, /revoked|settings changed/);
  assert.equal(store.listMonitoringUpdates().total, 0);
  enable();
  const lease = store.beginMonitoringCheck({ ...input(), leaseMs: 1000 });
  advance(1001);
  assert.throws(() => service.record({ id: lease.check.id, token: lease.token, status: 'checked', observations: known }), /expired/);
  assert.equal(store.listMonitoringUpdates().total, 0);
});

test('tracked email uses the original provider/account namespace and rejects a connection switch during a read', async t => {
  let switchDuringRead = false;
  const { store, service, enable, input, calls, accounts } = await fixture(t, { callMapped: (_kind, _action, _args, state) => {
    if (switchDuringRead) state.accounts.email = 'other@example.test';
    return { structuredContent: { messages: [{ ...reply(1), body: 'Thank you for applying.\nNext steps follow soon.' }, { ...reply(2), from: 'unrelated@example.test' }] } };
  } });
  const application = trackedEmail(store);
  enable({ channels: { jobs: false, email: true } });
  const first = await service.check(input('email', application.id));
  assert.equal(first.check.status, 'checked'); assert.equal(first.added, 1);
  assert.equal(calls[0].args.threadId, application.threadId);
  const update = store.listMonitoringUpdates({ compact: false }).items[0];
  assert.equal(update.provider, 'gmail'); assert.equal(update.accountId, emailScope('person@example.test').accountId);
  assert.equal(update.externalId, 'reply-1'); assert.equal(update.evidence.messageId, 'reply-1');
  assert.equal(update.summary, 'Thank you for applying. Next steps follow soon.');
  switchDuringRead = true;
  const switched = await service.check(input('email', application.id));
  assert.equal(switched.check.status, 'unknown'); assert.equal(store.listMonitoringUpdates().total, 1);
  const reads = calls.length;
  await assert.rejects(service.check(input('email', application.id)), /original.*account|original.*provider/);
  assert.equal(calls.length, reads, 'known account mismatch is rejected before reading a thread');
  assert.equal(accounts.email, 'other@example.test'); assert.equal(store.listApplications()[0].status, 'applied');
});

test('unreadable email results remain unknown and bounded partial replies never become a complete no-change claim', async t => {
  let response = { structuredContent: { error: 'Private provider error details' } };
  const { store, service, enable, input } = await fixture(t, { callMapped: () => response });
  const application = trackedEmail(store);
  enable({ channels: { jobs: false, email: true } });
  const unreadable = await service.check(input('email', application.id));
  assert.equal(unreadable.check.status, 'unknown'); assert.equal(store.getMonitoring().status.lastSuccessAt, null);
  assert.ok(!JSON.stringify(unreadable).includes('Private provider error details'));
  response = { structuredContent: { messages: Array.from({ length: 102 }, (_, index) => reply(index)), hasMore: true } };
  const partial = await service.check(input('email', application.id));
  assert.equal(partial.check.status, 'partial'); assert.equal(store.listMonitoringUpdates().total, 100);
  assert.equal(store.getMonitoring().status.lastSuccessAt, null);
});

test('calendar partial pages preserve stable event IDs and native provider links without calendar writes', async t => {
  let partial = true;
  const { store, service, enable, input, calls } = await fixture(t, { callMapped: () => ({ structuredContent: { events: [{ id: 'event-instance-1', title: 'Synthetic interview', start: '2026-11-15T08:00:00Z', end: '2026-11-15T09:00:00Z', webUrl: 'https://calendar.google.com/calendar/event?eid=fixture', recurringEventId: 'series-1' }], ...(partial ? { nextPageToken: 'next-page' } : {}) } }) });
  enable({ channels: { jobs: false, calendar: true }, scope: { directoryIds: [], calendarIds: ['selected-calendar'] } });
  const first = await service.check(input('calendar', 'selected-calendar'));
  assert.equal(first.check.status, 'partial'); assert.equal(first.added, 1);
  assert.equal(calls[0].action, 'listEvents'); assert.equal(calls[0].args.limit, 100);
  assert.equal(Date.parse(calls[0].args.timeMax) - Date.parse(calls[0].args.timeMin), 14 * 86400000);
  const update = store.listMonitoringUpdates({ compact: false }).items[0];
  assert.equal(update.externalId, 'event-instance-1'); assert.equal(update.data.recurrenceId, 'series-1');
  assert.equal(update.url, 'https://calendar.google.com/calendar/event?eid=fixture');
  partial = false;
  const second = await service.check(input('calendar', 'selected-calendar'));
  assert.equal(second.check.status, 'checked'); assert.equal(second.unchanged, 1); assert.equal(store.listMonitoringUpdates().total, 1);
  assert.equal(store.listApplications().length, 0);
});

test('invalid calendar records preserve valid observations and keep incomplete results partial', async t => {
  const { store, service, enable, input } = await fixture(t, { callMapped: () => ({ structuredContent: { events: [{ id: 'valid-event', title: 'A valid\ncalendar title', start: '2026-11-15T08:00:00Z', end: '2026-11-15T09:00:00Z', webLink: 'https://outlook.office.com/calendar/item/fixture' }, { id: '', title: 'Missing stable ID' }] } }) });
  enable({ channels: { jobs: false, calendar: true }, scope: { directoryIds: [], calendarIds: ['calendar'] } });
  const result = await service.check(input('calendar', 'calendar'));
  assert.equal(result.check.status, 'partial'); assert.equal(store.listMonitoringUpdates().total, 1);
  const update = store.listMonitoringUpdates().items[0];
  assert.equal(update.externalId, 'valid-event'); assert.equal(update.title, 'A valid calendar title');
  assert.equal(update.url, 'https://outlook.office.com/calendar/item/fixture');
});

test('calendar scope rejects explicit contradictions while preserving unknown timing as partial source facts', async t => {
  const events = [
    { id: 'inside', calendarId: 'selected', title: 'Inside', start: '2026-11-15T08:00:00Z', end: '2026-11-15T09:00:00Z' },
    { id: 'wrong-calendar', calendarId: 'another-calendar', title: 'Wrong calendar', start: '2026-11-15T08:00:00Z', end: '2026-11-15T09:00:00Z' },
    { id: 'ends-at-start', title: 'Past', start: '2026-11-14T07:00:00Z', end: '2026-11-14T08:00:00Z' },
    { id: 'starts-at-end', title: 'Future', start: '2026-11-28T08:00:00Z', end: '2026-11-28T09:00:00Z' },
    { id: 'past-all-day', title: 'Past all-day', start: { date: '2026-11-12' }, end: { date: '2026-11-13' } },
    { id: 'future-all-day', title: 'Future all-day', start: '2026-11-30', end: '2026-12-01' },
    { id: 'unknown-time', title: 'Unknown time', start: null, end: null },
    { id: 'unknown-zone', title: 'Unknown zone', start: { dateTime: '2026-11-15T08:00:00', timeZone: 'Asia/Dubai' }, end: { dateTime: '2026-11-15T09:00:00', timeZone: 'Asia/Dubai' } },
    { id: 'backwards', title: 'Unverified interval', start: '2026-11-16T08:00:00Z', end: '2026-11-15T08:00:00Z' },
    { id: 'invalid-date', title: 'Invalid date', start: '2026-02-30', end: '2026-03-01' },
  ];
  const { store, service, enable, input } = await fixture(t, { callMapped: () => ({ structuredContent: { calendarId: 'selected', events } }) });
  enable({ channels: { jobs: false, calendar: true }, scope: { directoryIds: [], calendarIds: ['selected'] } });
  const result = await service.check(input('calendar', 'selected'));
  assert.equal(result.check.status, 'partial'); assert.equal(result.check.cursor, null); assert.equal(result.check.complete, false);
  assert.equal(store.getMonitoring().status.lastSuccessAt, null);
  const updates = store.listMonitoringUpdates({ compact: false }).items;
  assert.deepEqual(new Set(updates.map(item => item.externalId)), new Set(['inside', 'unknown-time', 'unknown-zone', 'backwards', 'invalid-date']));
  for (const item of updates.filter(item => item.externalId !== 'inside')) {
    assert.equal(item.status, 'unknown'); assert.match(item.summary, /timing is unverified/);
  }
  assert.equal(updates.find(item => item.externalId === 'unknown-time').data.start, null);
  assert.equal(store.listApplications().length, 0);
});

test('overlapping, all-day and exact-boundary instants remain valid without assuming an all-day UTC offset', async t => {
  const events = [
    { id: 'overlaps-start', title: 'Ongoing', start: '2026-11-13T08:00:00Z', end: '2026-11-14T09:00:00Z' },
    { id: 'overlaps-end', title: 'Continues later', start: '2026-11-28T07:00:00Z', end: '2026-11-29T08:00:00Z' },
    { id: 'all-day', title: 'All day', start: { date: '2026-11-14' }, end: { date: '2026-11-15' } },
    { id: 'all-day-possible-overlap', title: 'All-day calendar-zone boundary', start: { date: '2026-11-13' }, end: { date: '2026-11-14' } },
    { id: 'offset-start', title: 'Starts now', start: '2026-11-14T12:00:00+04:00', end: '2026-11-14T13:00:00+04:00' },
    { id: 'instant-start', title: 'Instant', start: '2026-11-14T08:00:00Z', end: '2026-11-14T08:00:00Z' },
    { id: 'utc-object', title: 'UTC object', start: { dateTime: '2026-11-15T08:00:00', timeZone: 'UTC' }, end: { dateTime: '2026-11-15T09:00:00', timeZone: 'UTC' } },
  ];
  const { store, service, enable, input } = await fixture(t, { callMapped: () => ({ structuredContent: { events } }) });
  enable({ channels: { jobs: false, calendar: true }, scope: { directoryIds: [], calendarIds: ['selected'] } });
  const first = await service.check(input('calendar', 'selected'));
  assert.equal(first.check.status, 'checked'); assert.equal(first.added, events.length);
  assert.ok(store.listMonitoringUpdates().items.every(item => item.status === 'new'));
  const repeated = await service.check(input('calendar', 'selected'));
  assert.equal(repeated.unchanged, events.length); assert.equal(store.listMonitoringUpdates().total, events.length);
});

test('an explicitly contradictory calendar envelope records no event while native default aliases remain usable', async t => {
  let calendarId = 'wrong-calendar';
  const { store, service, enable, input, providers } = await fixture(t, { callMapped: () => ({ structuredContent: { calendarId, events: [{ id: 'event-1', calendarId, title: 'Synthetic event', start: '2026-11-15T08:00:00Z', end: '2026-11-15T09:00:00Z' }] } }) });
  providers.calendar = 'outlook';
  enable({ channels: { jobs: false, calendar: true }, scope: { directoryIds: [], calendarIds: ['default'] } });
  const mismatch = await service.check(input('calendar', 'default'));
  assert.equal(mismatch.check.status, 'partial'); assert.equal(mismatch.added, 0); assert.equal(store.listMonitoringUpdates().total, 0);
  calendarId = 'primary';
  const nativeAlias = await service.check(input('calendar', 'default'));
  assert.equal(nativeAlias.check.status, 'checked'); assert.equal(nativeAlias.added, 1);
});

test('public source reads reject private destinations before a socket and strip active content from snapshots', async () => {
  for (const url of ['http://127.0.0.1/', 'https://user:secret@example.com/', 'http://10.0.0.1/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'ftp://careers.example.com/', 'https://careers.example.com:8443/', 'http://intranet/']) assert.throws(() => publicSourceUrl(url));
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '100.64.0.1', '172.16.0.1', '192.168.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1']) assert.equal(publicAddress(address), false, address);
  await assert.rejects(readPublicPage('https://careers.example.com/', { resolveHost: async () => [{ address: '10.0.0.1', family: 4 }] }), /public page/);
  await assert.rejects(readPublicPage('https://careers.example.com/', { resolveHost: async () => [{ address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 }] }), /public page/);
  const page = publicPageSnapshot('<title>Jobs &amp; careers</title><script>private script</script><style>secret style</style><a href="http://127.0.0.1/">Internal</a><a href="/jobs/1">Engineer</a><input type="password">', 'https://careers.example.com/');
  assert.equal(page.untrusted, true); assert.equal(page.loginRequired, true); assert.equal(page.title, 'Jobs & careers');
  assert.ok(!page.text.includes('private script')); assert.ok(!page.text.includes('secret style')); assert.equal(page.links.length, 1);
});

test('the public-page deadline also bounds an injected DNS lookup that never resolves', async () => {
  let timer;
  const outcome = await Promise.race([
    readPublicPage('https://careers.example.com/', { timeoutMs: 20, resolveHost: () => new Promise(() => {}) }).then(() => ({ type: 'unexpected-success' }), error => ({ type: 'error', message: error.message })),
    new Promise(resolve => { timer = setTimeout(() => resolve({ type: 'deadline-not-enforced' }), 200); }),
  ]);
  clearTimeout(timer);
  assert.equal(outcome.type, 'error', 'DNS must share the bounded read deadline');
});

test('public GET pins the validated address, sends no credentials and rejects a private redirect before a second request', async () => {
  const original = http.request, requests = [];
  http.request = (url, options, callback) => {
    requests.push({ url: url.href, options });
    const request = new EventEmitter();
    request.end = () => queueMicrotask(() => {
      const response = new EventEmitter(); response.statusCode = 302; response.headers = { location: 'http://169.254.169.254/latest/meta-data/' };
      callback(response); response.emit('end');
    });
    request.destroy = error => request.emit('error', error);
    return request;
  };
  try {
    let resolutions = 0;
    await assert.rejects(readPublicPage('http://careers.example.com/', { resolveHost: async () => { resolutions++; return [{ address: '93.184.216.34', family: 4 }]; } }), /public.*URL|public careers/);
    assert.equal(resolutions, 1); assert.equal(requests.length, 1); assert.equal(requests[0].options.method, 'GET');
    assert.ok(!Object.keys(requests[0].options.headers).some(key => /cookie|authorization/i.test(key)));
    const pinned = await new Promise((resolve, reject) => requests[0].options.lookup('careers.example.com', { all: true }, (error, result) => error ? reject(error) : resolve(result)));
    assert.deepEqual(pinned, [{ address: '93.184.216.34', family: 4 }]);
  } finally { http.request = original; }
});
