import test from 'node:test';
import assert from 'node:assert/strict';
import ICAL from 'ical.js';
import { createICloudCalendarProvider, parseICloudEvents, appleUrl, appleFetch } from '../server/providers/icloud-calendar.mjs';

const CALENDAR = { url: 'https://p12-caldav.icloud.com/123/calendars/work/', displayName: 'Work', components: ['VEVENT'] };
const event = { calendarId: CALENDAR.url, title: 'Interview', start: '2026-11-13T10:00:00Z', end: '2026-11-13T11:00:00Z', description: 'Bring your CV\nVideo call', location: 'Online', idempotencyKey: 'interview-company-role', explicit: true };
const range = { timeMin: '2026-11-13T00:00:00Z', timeMax: '2026-11-17T00:00:00Z', limit: 50 };
const unpack = value => value.structuredContent;
const ics = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fixture//EN', ...events.flatMap(lines => ['BEGIN:VEVENT', ...lines, 'END:VEVENT']), 'END:VCALENDAR', ''].join('\r\n');

function fixture(options = {}) {
  const calls = [], saves = [], auth = options.auth || {};
  let receivedOptions;
  const client = {
    login: async args => { calls.push({ type: 'login', args }); if (options.loginError) throw options.loginError; },
    fetchCalendars: async () => { calls.push({ type: 'calendars' }); return options.calendars || [CALENDAR]; },
    fetchCalendarObjects: async args => { calls.push({ type: 'read', args }); return options.objects || []; },
    createCalendarObject: async args => {
      calls.push({ type: 'create', args });
      options.beforeCreate?.(saves.at(-1));
      if (options.createError) throw options.createError;
      return { status: options.status ?? 201 };
    },
  };
  const provider = createICloudCalendarProvider({ config: { credentials: { username: 'owner@example.test', password: 'app-specific-fixture' } }, auth,
    saveAuth: async value => { saves.push(structuredClone(value)); },
    createClient: async args => { receivedOptions = args; return client; },
  });
  return { provider, calls, saves, auth, options: () => receivedOptions };
}

test('iCloud discovery is read only and accepts calendar URLs only on exact Apple CalDAV hosts', async () => {
  const f = fixture();
  assert.deepEqual(await f.provider.connect(), { status: 'connected', account: 'owner@example.test' });
  assert.deepEqual(f.calls[0], { type: 'login', args: { loadCollections: false, loadObjects: false } });
  assert.equal(f.options().serverUrl, 'https://caldav.icloud.com');
  assert.equal(f.options().credentials.password, 'app-specific-fixture');
  assert.equal(typeof f.options().fetch, 'function');
  assert.deepEqual(unpack(await f.provider.call('icloud_calendar_list_calendars')), { calendars: [{ id: CALENDAR.url, name: 'Work' }] });
  assert.equal(f.calls.filter(call => ['create', 'read'].includes(call.type)).length, 0);
  for (const bad of ['http://caldav.icloud.com/calendar/', 'https://caldav.icloud.com.attacker.test/', 'https://attacker.icloud.com/', 'https://user:secret@caldav.icloud.com/', 'https://p12-caldav.icloud.com:8443/']) assert.throws(() => appleUrl(bad), /unsupported/);
  const wrong = fixture({ calendars: [{ url: 'https://attacker.test/calendar/' }] });
  await assert.rejects(wrong.provider.connect(), error => /could not connect/.test(error.message) && !error.message.includes('app-specific-fixture'));
});

test('iCloud fetch checks redirects before credentials can reach another host and preserves DAV methods', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return calls.length === 1 ? new Response(null, { status: 307, headers: { Location: 'https://p12-caldav.icloud.com/123/calendars/' } }) : new Response('ok', { status: 207 });
  };
  const headers = { Authorization: 'Basic fixture-secret' };
  assert.equal((await appleFetch('https://caldav.icloud.com/.well-known/caldav', { method: 'PROPFIND', body: '<properties/>', headers }, fetch)).status, 207);
  assert.equal(calls[1].init.method, 'PROPFIND');
  assert.equal(calls[1].init.body, '<properties/>');
  assert.equal(calls[1].init.headers, headers);
  assert.ok(calls.every(call => call.init.redirect === 'manual'));
  let badCalls = 0;
  await assert.rejects(appleFetch('https://caldav.icloud.com/', { headers }, async () => { badCalls++; return new Response(null, { status: 302, headers: { Location: 'https://attacker.test/steal' } }); }), /unsupported/);
  assert.equal(badCalls, 1);
});

test('iCloud preserves expanded recurrence instances without a master, all-day dates, and canceled overrides', () => {
  const objects = [{ data: ics(
    ['UID:series', 'RECURRENCE-ID:20261113T100000Z', 'DTSTART:20261113T120000Z', 'DTEND:20261113T130000Z', 'SUMMARY:Moved interview'],
    ['UID:series', 'RECURRENCE-ID:20261114T100000Z', 'STATUS:CANCELLED'],
    ['UID:holiday', 'DTSTART;VALUE=DATE:20261115', 'DTEND;VALUE=DATE:20261116', 'SUMMARY:Preparation day'],
  ) }];
  const result = parseICloudEvents(objects, range, CALENDAR.url);
  assert.deepEqual(result.events.map(item => item.title), ['Moved interview', 'Preparation day']);
  assert.equal(result.events[0].id, 'series:2026-11-13T10:00:00Z');
  assert.equal(result.events[0].start.dateTime, '2026-11-13T12:00:00.000Z');
  assert.deepEqual(result.events[1].start, { date: '2026-11-15' });
  assert.equal(result.events[1].allDay, true);
  assert.equal(result.hasMore, false);
});

test('iCloud fallback expands raw recurring ICS using actual ical.js overrides and keeps unrelated UIDs separate', () => {
  const objects = [{ data: ics(
    ['UID:series', 'DTSTART:20261113T100000Z', 'DTEND:20261113T110000Z', 'RRULE:FREQ=DAILY;COUNT=3', 'SUMMARY:Daily interview'],
    ['UID:series', 'RECURRENCE-ID:20261114T100000Z', 'DTSTART:20261114T120000Z', 'DTEND:20261114T130000Z', 'SUMMARY:Rescheduled interview'],
    ['UID:series', 'RECURRENCE-ID:20261115T100000Z', 'DTSTART:20261115T100000Z', 'DTEND:20261115T110000Z', 'STATUS:CANCELLED'],
    ['UID:different-series', 'RECURRENCE-ID:20261113T100000Z', 'DTSTART:20261113T150000Z', 'DTEND:20261113T160000Z', 'SUMMARY:Unrelated event'],
  ) }];
  const parsed = parseICloudEvents(objects, range, CALENDAR.url);
  assert.deepEqual(parsed.events.map(item => item.title), ['Daily interview', 'Unrelated event', 'Rescheduled interview']);
  assert.equal(parsed.events.length, 3);
  const limited = parseICloudEvents(objects, { ...range, limit: 2 }, CALENDAR.url);
  assert.equal(limited.events.length, 2);
  assert.equal(limited.hasMore, true);
  const duplicate = parseICloudEvents([...objects, ...objects], range, CALENDAR.url);
  assert.equal(duplicate.events.length, parsed.events.length);
});

test('iCloud reads only a selected calendar in a bounded range and rejects unrelated URLs before requests', async () => {
  const f = fixture({ objects: [{ data: ics(['UID:event', 'DTSTART:20261113T100000Z', 'DTEND:20261113T110000Z', 'SUMMARY:Interview']) }] });
  const value = unpack(await f.provider.call('icloud_calendar_list_events', { calendarId: CALENDAR.url, ...range }));
  assert.equal(value.events[0].title, 'Interview');
  const read = f.calls.find(call => call.type === 'read');
  assert.equal(read.args.calendar.url, CALENDAR.url);
  assert.equal(Date.parse(read.args.timeRange.start), Date.parse(range.timeMin));
  assert.equal(Date.parse(read.args.timeRange.end), Date.parse(range.timeMax));
  assert.equal(read.args.expand, true);
  await assert.rejects(f.provider.call('icloud_calendar_list_events', { calendarId: 'https://p12-caldav.icloud.com/another-user/', ...range }), /available iCloud calendar/);
  await assert.rejects(f.provider.call('icloud_calendar_list_events', { ...range, timeMax: '2027-11-13T00:00:00Z' }), /90 days/);
  assert.equal(f.calls.filter(call => call.type === 'read').length, 1);
});

test('iCloud writes valid ICS only after a durable explicit intent, and success is idempotent', async () => {
  const f = fixture({ beforeCreate: saved => assert.equal(Object.values(saved.icloudEvents)[0].status, 'pending') });
  await f.provider.connect();
  await assert.rejects(f.provider.call('icloud_calendar_create_event', { ...event, explicit: false }), /explicitly/);
  assert.equal(f.calls.filter(call => call.type === 'create').length, 0);
  const receipt = unpack(await f.provider.call('icloud_calendar_create_event', event));
  assert.equal(receipt.status, 'created');
  const create = f.calls.find(call => call.type === 'create');
  assert.deepEqual(create.args.headers, { 'If-None-Match': '*' });
  const parsed = new ICAL.Component(ICAL.parse(create.args.iCalString));
  const vevent = new ICAL.Event(parsed.getFirstSubcomponent('vevent'));
  assert.equal(vevent.summary, event.title);
  assert.equal(vevent.uid, receipt.eventId);
  assert.equal(vevent.description, event.description);
  assert.equal(vevent.startDate.toJSDate().toISOString(), event.start.replace('Z', '.000Z'));
  assert.equal(parsed.getFirstSubcomponent('vevent').getAllProperties('attendee').length, 0);
  assert.deepEqual(unpack(await f.provider.call('icloud_calendar_create_event', event)), receipt);
  assert.equal(f.calls.filter(call => call.type === 'create').length, 1);
  await assert.rejects(f.provider.call('icloud_calendar_create_event', { ...event, title: 'Another event' }), /different event/);
});

test('iCloud 200/202/204/conflict and timeouts remain unknown across retries and restarts', async () => {
  for (const options of [{ status: 200 }, { status: 202 }, { status: 204 }, { status: 412 }, { createError: new Error('request timed out with app-specific-fixture') }]) {
    const f = fixture(options);
    const first = unpack(await f.provider.call('icloud_calendar_create_event', event));
    assert.equal(first.status, 'unknown');
    assert.ok(!JSON.stringify(first).includes('app-specific-fixture'));
    assert.equal(unpack(await f.provider.call('icloud_calendar_create_event', event)).status, 'unknown');
    assert.equal(f.calls.filter(call => call.type === 'create').length, 1);
    const restored = fixture({ auth: structuredClone(f.saves.at(-1)) });
    assert.equal(unpack(await restored.provider.call('icloud_calendar_create_event', event)).status, 'unknown');
    assert.equal(restored.calls.filter(call => call.type === 'create').length, 0);
  }
});
