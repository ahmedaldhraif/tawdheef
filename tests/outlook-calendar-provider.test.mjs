import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutlookCalendarProvider, OUTLOOK_CALENDAR_MAPPINGS, OUTLOOK_CALENDAR_SCOPES } from '../server/providers/outlook-calendar.mjs';

const ACCOUNT = { homeAccountId: 'calendar-fixture-account', username: 'me@example.test' };
const EVENT = { subject: 'Interview — مقابلة', start: '2026-11-14T14:00:00+04:00', end: '2026-11-14T14:30:00+04:00', body: 'Discuss the role', location: 'Office', explicit: true, idempotencyKey: 'calendar-event-fixture-001' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

function fixture(options = {}) {
  const auth = options.auth || { accountId: ACCOUNT.homeAccountId, msalCache: JSON.stringify({ accounts: [ACCOUNT] }) };
  const calls = [], saves = [], authRequests = [];
  let state = { accounts: [] };
  const cache = { deserialize: value => { state = JSON.parse(value); }, serialize: () => JSON.stringify(state), getAllAccounts: async () => state.accounts };
  const pca = {
    getTokenCache: () => cache,
    async acquireTokenSilent(args) { authRequests.push(args); return { account: ACCOUNT, accessToken: 'fixture-only-calendar-token' }; },
    async getAuthCodeUrl(args) { authRequests.push(args); return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?state=${args.state}`; },
  };
  const provider = createOutlookCalendarProvider({
    config: { adapter: 'outlook-calendar', oauth: { clientId: 'calendar-client-fixture' } }, auth,
    redirectUrl: 'http://127.0.0.1:4000/api/connections/calendar/oauth/callback',
    saveAuth: async value => { saves.push(structuredClone(value)); if (options.onSave) options.onSave(value); },
    msalFactory: () => pca,
    fetchImpl: async (input, init = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      const call = { url, method: init.method || 'GET', headers: new Headers(init.headers), body: init.body ? JSON.parse(init.body) : undefined };
      calls.push(call);
      assert.equal(url.origin, 'https://graph.microsoft.com');
      assert.equal(call.headers.get('authorization'), 'Bearer fixture-only-calendar-token');
      if (url.pathname === '/v1.0/me') return json({ id: 'calendar-user-fixture', mail: ACCOUNT.username });
      return options.fetch ? options.fetch(call) : json({ value: [] });
    },
  });
  return { provider, auth, calls, saves, authRequests };
}

test('Outlook calendar uses a separate calendar-only OAuth grant and tool surface', async () => {
  const f = fixture({ auth: {} });
  assert.equal((await f.provider.connect()).status, 'auth_required');
  assert.deepEqual(f.authRequests[0].scopes, OUTLOOK_CALENDAR_SCOPES);
  assert.equal(f.authRequests[0].scopes.some(scope => scope.startsWith('Mail.')), false);
  const names = f.provider.tools().map(tool => tool.name);
  assert.ok(names.includes('outlook_create_calendar_event'));
  assert.ok(names.every(name => !/mail|thread|profile/.test(name)));
  assert.deepEqual(f.provider.mappings, OUTLOOK_CALENDAR_MAPPINGS);
});

test('Outlook calendar lists safe calendar metadata and bounded events with normalized UTC', async () => {
  const f = fixture({ fetch(call) {
    assert.match(call.headers.get('prefer'), /outlook.timezone="UTC"/);
    if (call.url.pathname === '/v1.0/me/calendars') return json({ value: [{ id: 'calendar-fixture', name: 'My calendar', isDefaultCalendar: true, canEdit: true, owner: { address: ACCOUNT.username } }] });
    assert.equal(call.url.pathname, '/v1.0/me/calendar/calendarView');
    assert.equal(call.url.searchParams.get('startDateTime'), '2026-11-14T10:00:00.000Z');
    assert.equal(call.url.searchParams.get('endDateTime'), '2026-11-14T10:30:00.000Z');
    assert.equal(call.url.searchParams.get('$top'), '10');
    return json({ value: [{ id: 'event-fixture', subject: EVENT.subject, start: { dateTime: '2026-11-14T10:00:00.0000000', timeZone: 'UTC' }, end: { dateTime: '2026-11-14T10:30:00', timeZone: 'UTC' }, location: { displayName: 'Office' }, webLink: 'javascript:bad()' }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/calendar/calendarView?$skiptoken=fixture' });
  } });
  const calendars = (await f.provider.call('outlook_list_calendars')).structuredContent.calendars;
  assert.deepEqual(calendars[0], { id: 'calendar-fixture', name: 'My calendar', primary: true, canEdit: true, owner: ACCOUNT.username });
  const data = (await f.provider.call('outlook_list_calendar_events', { start: EVENT.start, end: EVENT.end, limit: 10 })).structuredContent;
  assert.equal(data.events[0].start, '2026-11-14T10:00:00.000Z');
  assert.equal(data.events[0].webLink, null);
  assert.equal(data.truncated, true);
  assert.equal(data.raw, undefined);
});

test('Outlook calendar rejects invalid dates, unbounded ranges and foreign pagination before unsafe reads', async () => {
  const f = fixture();
  await assert.rejects(f.provider.call('outlook_list_calendar_events', { start: '2026-11-14T10:00:00', end: EVENT.end }), /timezone offset/);
  await assert.rejects(f.provider.call('outlook_list_calendar_events', { start: '2026-02-31T10:00:00Z', end: '2026-03-04T11:00:00Z' }), /valid calendar/);
  await assert.rejects(f.provider.call('outlook_list_calendar_events', { start: EVENT.end, end: EVENT.start }), /end must be after/);
  await assert.rejects(f.provider.call('outlook_list_calendar_events', { start: EVENT.start, end: '2027-06-01T10:00:00Z' }), /90 days/);
  assert.equal(f.calls.length, 0);
  const foreign = fixture({ fetch: () => json({ value: [], '@odata.nextLink': 'https://elsewhere.example.test/v1.0/me/calendars' }) });
  await assert.rejects(foreign.provider.call('outlook_list_calendars'), /unsupported calendar page/);
  assert.equal(foreign.calls.length, 1);
});

test('Outlook calendar requires explicit event authority and never accepts attendees', async () => {
  const f = fixture();
  await assert.rejects(f.provider.call('outlook_create_calendar_event', { ...EVENT, explicit: false }), /explicitly requests/);
  await assert.rejects(f.provider.call('outlook_create_calendar_event', { ...EVENT, attendees: ['recruiter@example.test'] }), /without invitations/);
  await assert.rejects(f.provider.call('outlook_create_calendar_event', { ...EVENT, idempotencyKey: undefined }), /idempotency key/);
  assert.equal(f.calls.length, 0);
});

test('Outlook calendar persists a transaction key before creating one event and reuses its receipt', async () => {
  let durable = false, transactionId;
  const f = fixture({
    onSave(value) { if (Object.values(value.outlookCalendarOutbox || {}).some(entry => entry.stage === 'creating')) durable = true; },
    fetch(call) {
      assert.equal(call.method, 'POST');
      assert.equal(call.url.pathname, '/v1.0/me/calendar/events');
      assert.ok(durable);
      assert.equal(call.body.attendees, undefined);
      assert.equal(call.body.start.dateTime, '2026-11-14T10:00:00.000');
      assert.equal(call.body.start.timeZone, 'UTC');
      transactionId = call.body.transactionId;
      return json({ ...call.body, id: 'event-created-fixture', webLink: 'https://outlook.office.com/calendar/item/fixture' }, 201);
    },
  });
  const first = (await f.provider.call('outlook_create_calendar_event', EVENT)).structuredContent;
  assert.equal(first.status, 'created');
  assert.equal(first.eventId, 'event-created-fixture');
  assert.match(transactionId, /^apply-tracker-[a-f\d]{40}$/);
  const second = (await f.provider.call('outlook_create_calendar_event', EVENT)).structuredContent;
  assert.deepEqual(second, first);
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
  await assert.rejects(f.provider.call('outlook_create_calendar_event', { ...EVENT, subject: 'A different event' }), /already used/);
});

test('Outlook calendar preserves an ambiguous create and reconciles by transaction ID without repeating POST', async () => {
  let createBody, found = false;
  const f = fixture({ fetch(call) {
    if (call.method === 'POST') { createBody = call.body; throw new Error('fixture lost response Bearer private-token'); }
    return json({ value: found ? [{ ...createBody, id: 'event-created-fixture' }] : [] });
  } });
  const pending = (await f.provider.call('outlook_create_calendar_event', EVENT)).structuredContent;
  assert.equal(pending.status, 'unknown');
  assert.ok(!JSON.stringify(pending).includes('private-token'));
  const repeated = (await f.provider.call('outlook_create_calendar_event', EVENT)).structuredContent;
  assert.equal(repeated.status, 'unknown');
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
  found = true;
  const reconciled = (await f.provider.call('outlook_reconcile_calendar_event', { idempotencyKey: EVENT.idempotencyKey })).structuredContent;
  assert.equal(reconciled.status, 'created');
  assert.equal(f.calls.filter(call => call.method === 'POST').length, 1);
});

test('Outlook calendar refuses a returned event whose details do not match the reserved request', async () => {
  const f = fixture({ fetch: call => json({ ...call.body, id: 'wrong-event-fixture', subject: 'Another event' }, 201) });
  const pending = (await f.provider.call('outlook_create_calendar_event', EVENT)).structuredContent;
  assert.equal(pending.status, 'unknown');
  assert.equal(pending.eventId, undefined);
});
