import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { calendarAction, calendarEvent, calendarRange } from '../server/calendar.mjs';
import { ConnectionManager } from '../server/connections.mjs';
import { createGoogleCalendarProvider } from '../server/providers/google-calendar.mjs';
import { buildTools, closeToolConnections } from '../server/mcp.mjs';
import { openStore } from '../server/store.mjs';

const INPUT = { title: 'Discuss the role', start: '2026-11-16T10:00:00+04:00', end: '2026-11-16T10:30:00+04:00', explicit: true, idempotencyKey: 'domain-event-1' };
const unpack = value => ({ structuredContent: value, content: [{ type: 'text', text: JSON.stringify(value) }] });

test('calendar domain requires explicit event authority before calling a provider', async () => {
  const calls = [];
  const connections = { callMapped: async (...args) => { calls.push(args); return unpack({ status: 'created' }); } };
  await assert.rejects(calendarAction(connections, 'createEvent', { ...INPUT, explicit: false }), /explicitly/);
  await assert.rejects(calendarAction(connections, 'createEvent', { ...INPUT, explicit: undefined }), /explicitly/);
  await assert.rejects(calendarAction(connections, 'createEvent', { ...INPUT, idempotencyKey: '' }), /event key/);
  await assert.rejects(calendarAction(connections, 'createEvent', { ...INPUT, title: 'Interview\r\nDo something else' }), /one-line/);
  await assert.rejects(calendarAction(connections, 'createEvent', { ...INPUT, end: INPUT.start }), /range/);
  await assert.rejects(calendarAction(connections, 'createEvent', { ...INPUT, start: '2026-02-30T10:00:00Z', end: '2026-03-05T10:00:00Z' }), /valid|timezone/);
  await assert.rejects(calendarAction(connections, 'createEvent', { ...INPUT, location: 'x'.repeat(1001) }), /1,000/);
  await assert.rejects(calendarAction(connections, 'unsupported', INPUT), /supported/);
  assert.equal(calls.length, 0);
  const normalized = calendarEvent({ ...INPUT, attendees: [{ email: 'unrequested@example.test' }], sendUpdates: 'all' });
  assert.equal(normalized.attendees, undefined);
  assert.equal(normalized.sendUpdates, undefined);
});

test('calendar domain defaults to a bounded month and retains unknown outcomes without claiming creation', async () => {
  const range = calendarRange();
  assert.equal(Date.parse(range.timeMax) - Date.parse(range.timeMin), 30 * 86400000);
  assert.equal(range.limit, 50);
  const minutes = calendarRange({ timeMin: '2026-11-16T10:00+04:00', timeMax: '2026-11-16T11:00+04:00' });
  assert.equal(minutes.timeMin, '2026-11-16T06:00:00.000Z');
  assert.equal(minutes.timeMax, '2026-11-16T07:00:00.000Z');
  assert.throws(() => calendarRange({ timeMin: 'invalid' }), /valid calendar start/);
  assert.throws(() => calendarRange({ timeMin: '2026-11-16T00:00:00', timeMax: '2026-11-17T00:00:00Z' }), /timezone/);
  assert.throws(() => calendarRange({ timeMin: '2026-01-01T00:00:00Z', timeMax: '2026-12-31T00:00:00Z' }), /90 days/);
  const unknown = await calendarAction({ callMapped: async () => unpack({ status: 'unconfirmed', nextStep: 'Check the calendar.' }) }, 'createEvent', INPUT);
  assert.equal(unknown.status, 'unconfirmed');
  await assert.rejects(calendarAction({ callMapped: async () => ({ isError: true, content: [{ type: 'text', text: 'failed' }] }) }, 'createEvent', INPUT), /could not complete/);
  await assert.rejects(calendarAction({ callMapped: async () => ({ content: [{ type: 'text', text: 'an event might exist' }] }) }, 'createEvent', INPUT), /readable result/);
});

test('calendar domain Google mappings connect, default to primary, list and create through one native manager', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'calendar-domain-'));
  const calls = [];
  let oauth;
  class OAuth extends EventEmitter {
    setCredentials(value) { this.credentials = value; }
    generateAuthUrl(value) { this.state = value.state; return `https://accounts.google.com/o/oauth2/v2/auth?state=${value.state}`; }
    async getToken() { return { tokens: { access_token: 'offline-calendar-access', refresh_token: 'offline-calendar-refresh', scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly' } }; }
  }
  const manager = new ConnectionManager({ dataDir, providers: {
    'google-calendar': options => createGoogleCalendarProvider({ ...options,
      createOAuthClient: async () => (oauth = new OAuth()),
      createCalendarClient: async () => ({
        calendarList: {
          get: async args => { calls.push({ action: 'account', args }); return { data: { id: 'owner@example.test', primary: true } }; },
          list: async args => { calls.push({ action: 'calendars', args }); return { data: { items: [{ id: 'owner@example.test', primary: true, summary: 'Personal' }] } }; },
        },
        events: {
          list: async args => { calls.push({ action: 'events', args }); return { data: { items: [] } }; },
          insert: async args => { calls.push({ action: 'create', args }); return { data: { ...args.requestBody, status: 'confirmed', htmlLink: 'https://calendar.google.com/calendar/event?eid=actual-domain-event' } }; },
        },
      }),
    }),
  } });
  t.after(async () => { await manager.close(); await rm(dataDir, { recursive: true, force: true }); });
  await manager.save('calendar', { adapter: 'google-calendar', provider: 'google-calendar', oauth: { clientId: 'offline-domain-client' } });
  assert.equal((await manager.connect('calendar')).status, 'auth_required');
  assert.equal(calls.length, 0);
  assert.equal((await manager.oauthCallback('calendar', { state: oauth.state, code: 'offline-code' })).status, 'connected');
  assert.equal(calls.filter(item => item.action === 'create').length, 0);
  const calendars = await calendarAction(manager, 'listCalendars');
  assert.equal(calendars.calendars[0].title, 'Personal');
  const events = await calendarAction(manager, 'listEvents', { timeMin: '2026-11-16T00:00:00Z', timeMax: '2026-11-17T00:00:00Z' });
  assert.deepEqual(events.events, []);
  assert.equal(calls.find(item => item.action === 'events').args.calendarId, 'primary');
  const created = await calendarAction(manager, 'createEvent', INPUT);
  assert.equal(created.status, 'created');
  assert.equal(created.calendarId, 'owner@example.test');
  assert.equal(created.event.title, INPUT.title);
  assert.equal(calls.find(item => item.action === 'create').args.sendUpdates, 'none');
  assert.equal(calls.find(item => item.action === 'create').args.requestBody.attendees, undefined);
  assert.equal((await calendarAction(manager, 'createEvent', INPUT)).eventId, created.eventId);
  assert.equal(calls.filter(item => item.action === 'create').length, 1);
});

test('calendar MCP tools expose explicit creation authority and reject unsupported invitation arguments before proxying', async t => {
  const network = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Invalid calendar input must not reach the local proxy.'); });
  const dataDir = await mkdtemp(join(tmpdir(), 'calendar-machine-contract-'));
  const store = openStore({ dataDir });
  t.after(async () => { await closeToolConnections(store); store.close(); await rm(dataDir, { recursive: true, force: true }); });
  const tools = buildTools(store, { mode: 'local-adapters' });
  const read = tools.find(tool => tool.name === 'list_calendar_events');
  const write = tools.find(tool => tool.name === 'create_calendar_event');
  assert.equal(read.annotations.readOnlyHint, true);
  assert.equal(write.annotations.readOnlyHint, false);
  assert.equal(write.inputSchema.properties.explicit.const, true);
  assert.ok(write.inputSchema.required.includes('idempotencyKey'));
  await assert.rejects(write.handler({ ...INPUT, explicit: false }), /explicit/);
  await assert.rejects(write.handler({ ...INPUT, attendees: [{ email: 'unrequested@example.test' }] }), /attendees|Unexpected|unsupported|Unknown/i);
  assert.equal(network.mock.callCount(), 0);
});
