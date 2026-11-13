import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { createGoogleCalendarProvider, GOOGLE_CALENDAR_MAPPINGS } from '../server/providers/google-calendar.mjs';

const SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';
const REDIRECT = 'http://127.0.0.1:4000/api/connections/calendar/oauth/callback';
const AUTH = { tokens: { access_token: 'fixture-calendar-access', refresh_token: 'fixture-calendar-refresh', scope: SCOPES }, account: 'owner@example.test' };
const INPUT = { title: 'Discuss the role', start: '2026-11-16T10:00:00+04:00', end: '2026-11-16T10:30:00+04:00', description: 'Bring your questions', location: 'Online', explicit: true, idempotencyKey: 'event-intent-1' };

function fixture(options = {}) {
  const calls = [], saves = [], events = new Map();
  let current = 1_800_000_000_000;
  class OAuth extends EventEmitter {
    setCredentials(value) { this.credentials = structuredClone(value); }
    generateAuthUrl(value) { this.authValues = value; return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({ ...value, scope: value.scope.join(' ') })}`; }
    async getToken(value) { calls.push({ action: 'exchange', value }); if (options.tokenError) throw options.tokenError; return { tokens: options.tokens || { access_token: 'new-calendar-access', refresh_token: 'new-calendar-refresh', scope: SCOPES } }; }
  }
  const oauth = new OAuth();
  const api = {
    calendarList: {
      get: async (args, requestOptions) => { calls.push({ action: 'account', args, requestOptions }); if (options.accountError) throw options.accountError; return { data: { id: options.account || 'owner@example.test', primary: true, summary: 'Personal', timeZone: 'Asia/Dubai' } }; },
      list: async (args, requestOptions) => { calls.push({ action: 'calendars', args, requestOptions }); return { data: options.calendars || { items: [{ id: 'owner@example.test', summary: 'Personal', primary: true, accessRole: 'owner', timeZone: 'Asia/Dubai' }] } }; },
    },
    events: {
      list: async (args, requestOptions) => { calls.push({ action: 'list', args, requestOptions }); return { data: options.eventList || { items: [], timeZone: 'Asia/Dubai' } }; },
      insert: async (args, requestOptions) => {
        calls.push({ action: 'insert', args, requestOptions }); options.beforeInsert?.(saves.at(-1));
        const event = { ...structuredClone(args.requestBody), status: 'confirmed', htmlLink: 'https://calendar.google.com/calendar/event?eid=actual-event' };
        events.set(event.id, event);
        if (options.insertError) throw options.insertError;
        return { data: Object.hasOwn(options, 'insertResult') ? options.insertResult : event };
      },
      get: async (args, requestOptions) => {
        calls.push({ action: 'get', args, requestOptions });
        const event = options.existingEvent || events.get(args.eventId);
        if (!event || options.get404) throw { response: { status: 404 } };
        return { data: event };
      },
    },
  };
  const provider = createGoogleCalendarProvider({
    config: options.config || { adapter: 'google-calendar', oauth: { clientId: 'fixture-calendar-client', clientSecret: 'fixture-calendar-secret' } },
    auth: options.auth || {}, redirectUrl: options.redirectUrl || REDIRECT,
    saveAuth: async value => saves.push(structuredClone(value)),
    createOAuthClient: async value => { calls.push({ action: 'oauth', value }); return oauth; },
    createCalendarClient: async value => { assert.equal(value, oauth); return api; }, now: () => current,
  });
  return { provider, oauth, calls, saves, events, setNow: value => { current = value; } };
}

test('Google Calendar connects with its own scoped PKCE flow and never creates during setup', async () => {
  const f = fixture();
  const state = await f.provider.connect();
  assert.equal(state.status, 'auth_required');
  assert.deepEqual(f.oauth.authValues.scope, SCOPES.split(' '));
  assert.ok(!f.oauth.authValues.scope.some(scope => scope.includes('gmail')));
  const pending = f.saves.at(-1).pending;
  assert.equal(f.oauth.authValues.code_challenge, createHash('sha256').update(pending.verifier).digest('base64url'));
  assert.equal(f.oauth.authValues.access_type, 'offline');
  assert.ok(!JSON.stringify(state).includes('fixture-calendar-secret'));
  assert.ok(!JSON.stringify(state).includes(pending.verifier));
  const connected = await f.provider.oauthCallback(new URLSearchParams({ code: 'calendar-code', state: pending.state }));
  assert.deepEqual(connected, { status: 'connected', account: 'owner@example.test' });
  assert.equal(f.saves.at(-1).pending, undefined);
  assert.equal(f.calls.filter(call => call.action === 'insert').length, 0);
  assert.deepEqual(f.provider.mappings, GOOGLE_CALENDAR_MAPPINGS);
});

test('Google Calendar rejects wrong, expired and replayed sign-in state before exchanging a code', async () => {
  const f = fixture();
  await f.provider.connect();
  const pending = f.saves.at(-1).pending;
  await assert.rejects(f.provider.oauthCallback({ state: 'wrong', code: 'code' }), /did not match/);
  f.setNow(pending.createdAt + 600_001);
  await assert.rejects(f.provider.oauthCallback({ state: pending.state, code: 'code' }), /expired/);
  await assert.rejects(f.provider.oauthCallback({ state: pending.state, code: 'code' }), /did not match/);
  assert.equal(f.calls.filter(call => call.action === 'exchange').length, 0);
});

test('Google Calendar keeps refresh tokens for the same account and saves silent refresh credentials', async () => {
  const f = fixture({ auth: { ...AUTH, tokens: { refresh_token: 'existing-refresh', scope: 'partial' } }, tokens: { access_token: 'new-access', scope: SCOPES } });
  await f.provider.connect();
  await f.provider.oauthCallback({ state: f.saves.at(-1).pending.state, code: 'code' });
  assert.equal(f.saves.at(-1).tokens.refresh_token, 'existing-refresh');
  f.oauth.emit('tokens', { access_token: 'refreshed-calendar-access', refresh_token: undefined });
  await f.provider.close();
  assert.equal(f.saves.at(-1).tokens.refresh_token, 'existing-refresh');
  assert.equal(f.saves.at(-1).tokens.access_token, 'refreshed-calendar-access');
  const reopened = fixture({ auth: f.saves.at(-1) });
  assert.equal((await reopened.provider.connect()).status, 'connected');
  assert.equal(reopened.oauth.authValues, undefined);
});

test('Google Calendar will not attach a former account refresh token to a new account', async () => {
  const f = fixture({ auth: { ...AUTH, tokens: { refresh_token: 'old-refresh', scope: 'partial' } }, tokens: { access_token: 'new-access', scope: SCOPES }, account: 'other@example.test' });
  await f.provider.connect();
  await assert.rejects(f.provider.oauthCallback({ state: f.saves.at(-1).pending.state, code: 'code' }), /own background access/);
  assert.equal(f.saves.at(-1).tokens, undefined);
});

test('Google Calendar read tools preserve provider IDs, timezone and pagination without inferring outcomes', async () => {
  const f = fixture({ auth: AUTH, eventList: { timeZone: 'Asia/Dubai', nextPageToken: 'next-events', items: [
    { id: 'actual-event', summary: 'Interview practice', status: 'confirmed', start: { dateTime: INPUT.start, timeZone: 'Asia/Dubai' }, end: { dateTime: INPUT.end, timeZone: 'Asia/Dubai' }, htmlLink: 'https://calendar.google.com/calendar/event?eid=actual-event' },
    { id: 'all-day', summary: 'Holiday', status: 'confirmed', start: { date: '2026-11-16' }, end: { date: '2026-11-17' } },
    { id: 'cancelled', summary: 'Cancelled', status: 'cancelled', start: { dateTime: INPUT.start }, end: { dateTime: INPUT.end } },
  ] } });
  const calendars = await f.provider.call('google_calendar_list_calendars', {});
  assert.deepEqual(calendars.structuredContent.calendars[0], { id: 'owner@example.test', title: 'Personal', primary: true, timeZone: 'Asia/Dubai', accessRole: 'owner' });
  const response = await f.provider.call('google_calendar_list_events', { timeMin: '2026-11-16T00:00:00+04:00', timeMax: '2026-11-17T00:00:00+04:00', limit: 25 });
  assert.equal(response.structuredContent.events.length, 2);
  assert.equal(response.structuredContent.events[0].id, 'actual-event');
  assert.equal(response.structuredContent.events[0].start.timeZone, 'Asia/Dubai');
  assert.deepEqual(response.structuredContent.events[1].start, { date: '2026-11-16' });
  assert.equal(response.structuredContent.nextPageToken, 'next-events');
  assert.ok(!('companyId' in response.structuredContent.events[0]));
  assert.equal(f.calls.find(call => call.action === 'list').args.maxResults, 25);
  assert.equal(f.calls.filter(call => call.action === 'insert').length, 0);
});

test('Google Calendar read ranges require valid offset timestamps and never exceed ninety days', async () => {
  const f = fixture({ auth: AUTH });
  for (const args of [
    { timeMin: '2026-11-16T00:00:00', timeMax: '2026-11-17T00:00:00+04:00' },
    { timeMin: '2026-02-30T00:00:00Z', timeMax: '2026-03-05T00:00:00Z' },
    { timeMin: '2026-11-16T00:00:00Z', timeMax: '2026-11-15T00:00:00Z' },
    { timeMin: '2026-01-01T00:00:00Z', timeMax: '2026-12-31T00:00:00Z' },
    { timeMin: '2026-11-16T00:00:00Z', timeMax: '2026-11-17T00:00:00Z', limit: 101 },
  ]) await assert.rejects(f.provider.call('google_calendar_list_events', args), /date|time|90 days|limit/);
  assert.equal(f.calls.filter(call => call.action === 'list').length, 0);
});

test('Google Calendar creates only explicit events, persists the intent first and sends no invitations', async () => {
  let beforeInsert;
  const f = fixture({ auth: AUTH, beforeInsert: value => { beforeInsert = value; } });
  await assert.rejects(f.provider.call('google_calendar_create_event', { ...INPUT, explicit: false }), /explicitly/);
  await assert.rejects(f.provider.call('google_calendar_create_event', { ...INPUT, attendees: [{ email: 'person@example.test' }] }), /Attendees/);
  const response = await f.provider.call('google_calendar_create_event', INPUT);
  assert.equal(response.structuredContent.status, 'created');
  assert.equal(response.structuredContent.event.title, INPUT.title);
  assert.equal(response.structuredContent.event.start.dateTime, INPUT.start);
  const inserted = f.calls.find(call => call.action === 'insert');
  assert.equal(inserted.args.calendarId, 'owner@example.test');
  assert.equal(inserted.args.sendUpdates, 'none');
  assert.equal(inserted.requestOptions.retry, false);
  assert.equal(inserted.args.requestBody.attendees, undefined);
  assert.match(inserted.args.requestBody.id, /^[0-9a-v]{5,1024}$/);
  assert.equal(Object.values(beforeInsert.calendarOutbox)[0].status, 'pending');
  assert.ok(!JSON.stringify(beforeInsert).includes(INPUT.description));
  const again = await f.provider.call('google_calendar_create_event', INPUT);
  assert.deepEqual(again, response);
  assert.equal(f.calls.filter(call => call.action === 'insert').length, 1);
  await assert.rejects(f.provider.call('google_calendar_create_event', { ...INPUT, title: 'Changed title' }), /different event details/);
});

test('Google Calendar reconciles lost create responses by deterministic ID without creating again', async () => {
  const f = fixture({ auth: AUTH, insertError: new Error('access_token=do-not-leak timeout') });
  await assert.rejects(f.provider.call('google_calendar_create_event', INPUT), error => /did not confirm/.test(error.message) && !error.message.includes('do-not-leak'));
  const response = await f.provider.call('google_calendar_create_event', INPUT);
  assert.equal(response.structuredContent.status, 'created');
  assert.equal(response.structuredContent.reconciled, true);
  assert.equal(f.calls.filter(call => call.action === 'insert').length, 1);
  assert.equal(f.calls.filter(call => call.action === 'get').length, 1);
  const storedEvent = [...f.events.values()][0];
  const reopened = fixture({ auth: f.saves.at(-1), existingEvent: storedEvent });
  assert.equal((await reopened.provider.call('google_calendar_create_event', INPUT)).structuredContent.eventId, storedEvent.id);
  assert.equal(reopened.calls.filter(call => call.action === 'insert').length, 0);
});

test('Google Calendar unknown create outcomes and conflicting provider IDs never become fabricated success', async () => {
  const f = fixture({ auth: AUTH, insertError: new Error('timeout'), get404: true });
  await assert.rejects(f.provider.call('google_calendar_create_event', INPUT), /did not confirm/);
  assert.equal((await f.provider.call('google_calendar_create_event', INPUT)).structuredContent.status, 'unconfirmed');
  assert.equal(f.calls.filter(call => call.action === 'insert').length, 1);
  const bad = fixture({ auth: AUTH, insertResult: { id: 'arbitrary-id', status: 'confirmed' } });
  assert.equal((await bad.provider.call('google_calendar_create_event', INPUT)).structuredContent.status, 'unconfirmed');
  assert.equal(bad.calls.filter(call => call.action === 'insert').length, 1);
});

test('Google Calendar rejects remote callbacks and emits safe errors without secret request data', async () => {
  const remote = fixture({ redirectUrl: 'https://remote.example.test/callback' });
  await assert.rejects(remote.provider.connect(), /this computer/);
  const f = fixture({ tokenError: new Error('request client_secret=private-calendar-secret') });
  await f.provider.connect();
  await assert.rejects(f.provider.oauthCallback({ state: f.saves.at(-1).pending.state, code: 'private-code' }), error => !/private-calendar-secret|private-code/.test(error.message));
});
