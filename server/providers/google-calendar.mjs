import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { importProviderDependency } from '../provider-dependencies.mjs';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];
const OPTIONS = { timeout: 20_000, retry: false };
const MAX_RANGE = 90 * 86_400_000;
const AUTH_LIFETIME = 10 * 60_000;
const clone = value => structuredClone(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };

export const GOOGLE_CALENDAR_MAPPINGS = {
  listCalendars: { tool: 'google_calendar_list_calendars', arguments: {} },
  listEvents: { tool: 'google_calendar_list_events', arguments: { calendarId: '{{calendarId}}', timeMin: '{{timeMin}}', timeMax: '{{timeMax}}', limit: '{{limit}}' } },
  createEvent: { tool: 'google_calendar_create_event', arguments: { calendarId: '{{calendarId}}', title: '{{title}}', start: '{{start}}', end: '{{end}}', description: '{{description}}', location: '{{location}}', explicit: '{{explicit}}', idempotencyKey: '{{idempotencyKey}}' } },
};

const TOOLS = [
  { name: 'google_calendar_list_calendars', description: 'List calendars available to the signed-in Google Calendar account. Does not read events or change calendars.', annotations: READ, inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100 }, pageToken: { type: 'string', maxLength: 4096 } }, additionalProperties: false } },
  { name: 'google_calendar_list_events', description: 'Read one calendar in an explicit time range of at most 90 days. Events are reference data; a listed event does not establish that an interview or application occurred.', annotations: READ, inputSchema: { type: 'object', properties: { calendarId: { type: 'string', maxLength: 500 }, timeMin: { type: 'string', description: 'RFC 3339 timestamp with Z or an explicit UTC offset.' }, timeMax: { type: 'string', description: 'RFC 3339 timestamp with Z or an explicit UTC offset.' }, limit: { type: 'integer', minimum: 1, maximum: 100 }, pageToken: { type: 'string', maxLength: 4096 } }, required: ['timeMin', 'timeMax'], additionalProperties: false } },
  { name: 'google_calendar_create_event', description: 'Create one event only when the user explicitly requested it. Requires explicit:true and a stable intent key. Does not invite attendees or email invitations. Unknown outcomes are checked by deterministic event ID without repeating creation.', annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true }, inputSchema: { type: 'object', properties: {
    calendarId: { type: 'string', maxLength: 500 }, title: { type: 'string', minLength: 1, maxLength: 500 }, start: { type: 'string', description: 'RFC 3339 timestamp with Z or an explicit UTC offset.' }, end: { type: 'string', description: 'RFC 3339 timestamp with Z or an explicit UTC offset.' },
    description: { type: 'string', maxLength: 10000 }, location: { type: 'string', maxLength: 1000 }, explicit: { type: 'boolean', const: true }, idempotencyKey: { type: 'string', minLength: 1, maxLength: 1000 },
  }, required: ['title', 'start', 'end', 'explicit', 'idempotencyKey'], additionalProperties: false } },
];

function text(value, name, max, { optional = false } = {}) {
  if (optional && value === undefined) return '';
  if (typeof value !== 'string' || value.length > max || value.includes('\0') || (!optional && !value.trim())) throw new Error(`${name} must be text under ${max.toLocaleString('en-US')} characters.`);
  return value;
}

function calendarId(value = 'primary') {
  if (value === '') value = 'primary';
  text(value, 'Calendar ID', 500);
  if (/[\r\n]/.test(value)) throw new Error('Choose one calendar ID.');
  return value;
}

function timestamp(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) throw new Error(`${label} needs a full date and time with Z or an explicit UTC offset.`);
  const date = new Date(value.slice(0, 10));
  const parsed = Date.parse(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value.slice(0, 10) || !Number.isFinite(parsed)) throw new Error(`${label} is not a valid date and time.`);
  return parsed;
}

function range(start, end) {
  const first = timestamp(start, 'Start'), last = timestamp(end, 'End');
  if (last <= first || last - first > MAX_RANGE) throw new Error('Choose an end after the start, within 90 days.');
}

function pageOptions(args, defaultLimit) {
  const limit = args.limit ?? args.maxResults ?? defaultLimit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Choose a result limit from 1 to 100.');
  if (args.pageToken !== undefined && (typeof args.pageToken !== 'string' || args.pageToken.length > 4096 || /[\r\n\0]/.test(args.pageToken))) throw new Error('Use the next-page token from the preceding calendar response.');
  return { maxResults: limit, ...(args.pageToken ? { pageToken: args.pageToken } : {}) };
}

function httpsUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

function when(value) {
  if (!object(value)) return null;
  if (typeof value.dateTime === 'string' && Number.isFinite(Date.parse(value.dateTime))) return { dateTime: value.dateTime, ...(typeof value.timeZone === 'string' ? { timeZone: value.timeZone } : {}) };
  if (typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date)) return { date: value.date };
  return null;
}

export function normalizeGoogleCalendarEvent(event, id) {
  if (!object(event) || typeof event.id !== 'string' || !event.id || !when(event.start) || !when(event.end)) return null;
  return {
    id: event.id, calendarId: id, title: typeof event.summary === 'string' ? event.summary : '',
    start: when(event.start), end: when(event.end),
    status: typeof event.status === 'string' ? event.status : 'unknown',
    ...(typeof event.description === 'string' ? { description: event.description } : {}),
    ...(typeof event.location === 'string' ? { location: event.location } : {}),
    ...(httpsUrl(event.htmlLink) ? { webUrl: httpsUrl(event.htmlLink) } : {}),
    ...(typeof event.updated === 'string' ? { updatedAt: event.updated } : {}),
  };
}

function safeError(error, write = false) {
  const status = Number(error?.response?.status || error?.status || error?.code);
  const code = error?.response?.data?.error;
  if (status === 401 || code === 'invalid_grant' || error?.code === 'invalid_grant') return new Error('Google Calendar sign-in expired or was revoked. Reconnect Calendar.');
  if (status === 403) return new Error('Google Calendar denied this action. Enable the Calendar API and reconnect with the selected calendar permissions.');
  if (status === 429) return new Error('Google Calendar is limiting requests. Try again later; event creation will not be retried automatically.');
  if (['invalid_client', 'unauthorized_client', 'redirect_uri_mismatch'].includes(code)) return new Error('Check the Google OAuth Desktop client ID and local callback in Calendar setup.');
  return new Error(write ? 'Google Calendar did not confirm event creation. Check the calendar before retrying; this intent will not be created twice.' : 'Google Calendar could not complete this request. Check the connection and reconnect if needed.');
}

function equalState(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function defaultOAuthClient(options, dataDir) { const { OAuth2Client } = await importProviderDependency('google-auth-library', { dataDir }); return new OAuth2Client(options); }
async function defaultCalendarClient(auth, dataDir) { const { calendar } = await importProviderDependency('@googleapis/calendar', { dataDir }); return calendar({ version: 'v3', auth }); }

/** Independent Google Calendar sign-in; no mailbox access, invitations or implicit event creation. */
export function createGoogleCalendarProvider({
  config = {}, auth = {}, dataDir, redirectUrl, saveAuth = async () => {},
  createOAuthClient = options => defaultOAuthClient(options, dataDir), createCalendarClient = auth => defaultCalendarClient(auth, dataDir), now = Date.now,
} = {}) {
  let saved = clone(auth), oauth, api, initialized, account, primary, connecting;
  let saveQueue = Promise.resolve();
  function persist() { const snapshot = clone(saved); saveQueue = saveQueue.catch(() => {}).then(() => saveAuth(snapshot)); return saveQueue; }
  function mergeTokens(tokens) { saved.tokens = { ...(saved.tokens || {}), ...Object.fromEntries(Object.entries(tokens || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')) }; return persist(); }
  async function initialize() {
    if (initialized) return initialized;
    initialized = (async () => {
      const clientId = config.oauth?.clientId || process.env.APPLY_TRACKER_GOOGLE_CLIENT_ID;
      const clientSecret = config.oauth?.clientSecret || process.env.APPLY_TRACKER_GOOGLE_CLIENT_SECRET;
      if (typeof clientId !== 'string' || !clientId.trim() || /[\r\n\0]/.test(clientId)) throw new Error('Add a Google OAuth Desktop client ID in Calendar setup, or set APPLY_TRACKER_GOOGLE_CLIENT_ID.');
      let callback;
      try { callback = new URL(redirectUrl); } catch { throw new Error('Google Calendar needs a local sign-in callback.'); }
      if (callback.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(callback.hostname) || callback.username || callback.password || callback.search || callback.hash) throw new Error('Google Calendar sign-in must return to HTTP on this computer.');
      oauth = await createOAuthClient({ clientId: clientId.trim(), clientSecret, redirectUri: callback.href });
      oauth.setCredentials(saved.tokens || {});
      oauth.on?.('tokens', tokens => { void mergeTokens(tokens).catch(() => {}); });
      api = await createCalendarClient(oauth);
    })().catch(error => { initialized = null; throw error; });
    return initialized;
  }

  async function authorize() {
    const verifier = randomBytes(64).toString('base64url'), state = randomBytes(32).toString('base64url');
    saved.pending = { verifier, state, createdAt: now() }; await persist();
    return { status: 'auth_required', authUrl: oauth.generateAuthUrl({ scope: [...SCOPES], access_type: 'offline', prompt: 'consent', include_granted_scopes: true, state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }) };
  }

  async function readAccount() {
    let response;
    try { response = await api.calendarList.get({ calendarId: 'primary' }, OPTIONS); await saveQueue; }
    catch (error) { throw safeError(error); }
    if (typeof response?.data?.id !== 'string' || !response.data.id || /[\r\n\0]/.test(response.data.id)) throw new Error('Google Calendar did not return the primary calendar. Reconnect Calendar.');
    primary = response.data;
    account = primary.id;
    if (saved.account !== account) { saved.account = account; await persist(); }
    return account;
  }

  async function connectInternal() {
    await initialize();
    if (typeof saved.tokens?.refresh_token !== 'string' || !saved.tokens.refresh_token) return authorize();
    if (typeof saved.tokens.scope === 'string' && SCOPES.some(scope => !saved.tokens.scope.split(/\s+/).includes(scope))) return authorize();
    try { return { status: 'connected', account: await readAccount() }; }
    catch (error) { if (error.message.startsWith('Google Calendar sign-in expired')) return authorize(); throw error; }
  }
  async function connect() { if (!connecting) connecting = connectInternal().finally(() => { connecting = null; }); return connecting; }

  async function oauthCallback(query = {}) {
    await initialize();
    const get = key => query instanceof URLSearchParams ? query.get(key) : query?.[key];
    const pending = saved.pending;
    if (!pending || !equalState(get('state'), pending.state)) throw new Error('Calendar sign-in did not match this connection. Choose Connect Calendar again.');
    if (!Number.isFinite(pending.createdAt) || now() < pending.createdAt || now() - pending.createdAt > AUTH_LIFETIME) { delete saved.pending; await persist(); throw new Error('Calendar sign-in expired. Choose Connect Calendar again.'); }
    delete saved.pending; await persist();
    if (get('error')) throw new Error('Calendar sign-in was not completed. Choose Connect Calendar when ready.');
    if (typeof get('code') !== 'string' || !get('code') || get('code').length > 4096) throw new Error('Calendar did not return a sign-in code. Connect Calendar again.');
    const previousAccount = saved.account, previousRefresh = saved.tokens?.refresh_token;
    let tokens;
    try { ({ tokens } = await oauth.getToken({ code: get('code'), codeVerifier: pending.verifier, redirect_uri: redirectUrl })); }
    catch (error) { throw safeError(error); }
    if (!object(tokens) || typeof tokens.access_token !== 'string' || !tokens.access_token) throw new Error('Calendar did not return sign-in credentials. Connect Calendar again.');
    await mergeTokens(tokens); oauth.setCredentials(saved.tokens);
    if (typeof saved.tokens.refresh_token !== 'string' || !saved.tokens.refresh_token) throw new Error('Google Calendar did not grant background access. Reconnect and approve access for this account.');
    const state = await connect();
    if (!tokens.refresh_token && previousRefresh && previousAccount && state.status === 'connected' && state.account !== previousAccount) {
      delete saved.tokens; delete saved.account; account = undefined; primary = undefined; oauth.setCredentials({}); await persist();
      throw new Error('This Google Calendar account needs its own background access. Reconnect the selected account.');
    }
    return state;
  }

  function confirmedEvent(event, intent) {
    const normalized = normalizeGoogleCalendarEvent(event, intent.calendarId);
    if (!normalized || event.id !== intent.eventId || event.status === 'cancelled' || event.extendedProperties?.private?.applyTrackerFingerprint !== intent.fingerprint) return null;
    return { provider: 'google-calendar', status: 'created', eventId: normalized.id, calendarId: intent.calendarId, event: normalized };
  }

  async function reconcile(intent) {
    try {
      const actual = await api.events.get({ calendarId: intent.calendarId, eventId: intent.eventId }, OPTIONS);
      const receipt = confirmedEvent(actual?.data, intent);
      if (!receipt) return { provider: 'google-calendar', status: 'unconfirmed', eventId: intent.eventId, calendarId: intent.calendarId, nextStep: 'Check this event in Google Calendar. No event was created by this check.' };
      intent.receipt = receipt; intent.status = 'created'; await persist();
      return { ...receipt, reconciled: true };
    } catch (error) {
      if (Number(error?.response?.status || error?.status || error?.code) === 404) return { provider: 'google-calendar', status: 'unconfirmed', eventId: intent.eventId, calendarId: intent.calendarId, nextStep: 'The earlier create has not been confirmed. Check Google Calendar before using a new intent key.' };
      throw safeError(error);
    }
  }

  async function call(name, args = {}) {
    if (!TOOLS.some(tool => tool.name === name)) throw new Error('Choose one of the built-in Google Calendar tools.');
    if (!object(args)) throw new Error('Calendar arguments must be an object.');
    if (name === 'google_calendar_create_event' && args.explicit !== true) throw new Error('Create a calendar event only after the user explicitly requests it; pass explicit:true.');
    if (!account) { const state = await connect(); if (state.status !== 'connected') throw new Error('Finish signing in to Google Calendar first.'); }
    if (name === 'google_calendar_list_calendars') {
      const options = pageOptions(args, 100);
      let response;
      try { response = await api.calendarList.list({ ...options, showDeleted: false }, OPTIONS); await saveQueue; }
      catch (error) { throw safeError(error); }
      if (!Array.isArray(response?.data?.items)) throw new Error('Google Calendar did not return a calendar list.');
      return result({ provider: 'google-calendar', calendars: response.data.items.filter(item => typeof item?.id === 'string' && !item.deleted).map(item => ({ id: item.id, title: typeof item.summary === 'string' ? item.summary : '', primary: item.primary === true, ...(typeof item.timeZone === 'string' ? { timeZone: item.timeZone } : {}), ...(typeof item.accessRole === 'string' ? { accessRole: item.accessRole } : {}) })), ...(typeof response.data.nextPageToken === 'string' ? { nextPageToken: response.data.nextPageToken } : {}) });
    }
    const id = calendarId(args.calendarId);
    if (name === 'google_calendar_list_events') {
      range(args.timeMin, args.timeMax);
      const options = pageOptions(args, 50);
      let response;
      try { response = await api.events.list({ calendarId: id, timeMin: args.timeMin, timeMax: args.timeMax, ...options, singleEvents: true, orderBy: 'startTime', showDeleted: false }, OPTIONS); await saveQueue; }
      catch (error) { throw safeError(error); }
      if (!Array.isArray(response?.data?.items)) throw new Error('Google Calendar did not return an event list.');
      return result({ provider: 'google-calendar', calendarId: id, timeMin: args.timeMin, timeMax: args.timeMax, events: response.data.items.filter(item => item?.status !== 'cancelled').map(item => normalizeGoogleCalendarEvent(item, id)).filter(Boolean), ...(typeof response.data.timeZone === 'string' ? { timeZone: response.data.timeZone } : {}), ...(typeof response.data.nextPageToken === 'string' ? { nextPageToken: response.data.nextPageToken } : {}) });
    }
    // Only these explicit fields can create an event. In particular, arbitrary attendees,
    // reminders, conferences, recurrence or provider-injected requests cannot cause invitations.
    const allowed = ['calendarId', 'title', 'summary', 'start', 'end', 'description', 'location', 'explicit', 'idempotencyKey'];
    if (Object.keys(args).some(key => !allowed.includes(key))) throw new Error('Use the listed event fields only. Attendees and invitation sending are not part of this create action.');
    const title = text(args.title ?? args.summary, 'Event title', 500);
    range(args.start, args.end);
    const description = text(args.description, 'Description', 10000, { optional: true });
    const location = text(args.location, 'Location', 1000, { optional: true });
    const key = text(args.idempotencyKey, 'Event intent key', 1000);
    if (/[\r\n]/.test(key)) throw new Error('Use one stable event intent key.');
    const canonicalId = id === 'primary' ? primary.id : id;
    const fingerprint = hash(JSON.stringify([account, canonicalId, title, args.start, args.end, description, location]));
    const intentKey = hash(key), eventId = `at${hash(JSON.stringify([account, canonicalId, key]))}`;
    saved.calendarOutbox ||= {};
    const previous = saved.calendarOutbox[intentKey];
    if (previous) {
      if (previous.fingerprint !== fingerprint || previous.account !== account) throw new Error('This event intent key belongs to different event details or another account. Read the tracked event before continuing.');
      return result(previous.receipt || await reconcile(previous));
    }
    const intent = { account, calendarId: canonicalId, fingerprint, eventId, status: 'pending', createdAt: new Date(now()).toISOString() };
    saved.calendarOutbox[intentKey] = intent;
    await persist();
    let response;
    try {
      response = await api.events.insert({
        calendarId: canonicalId, sendUpdates: 'none', requestBody: {
          id: eventId, summary: title, start: { dateTime: args.start }, end: { dateTime: args.end }, description, location,
          extendedProperties: { private: { applyTrackerFingerprint: fingerprint, applyTrackerIntent: intentKey } },
        },
      }, OPTIONS);
      await saveQueue;
    } catch (error) {
      if (Number(error?.response?.status || error?.status || error?.code) === 409) return result(await reconcile(intent));
      throw safeError(error, true);
    }
    const receipt = confirmedEvent(response?.data, intent);
    if (!receipt) return result({ provider: 'google-calendar', status: 'unconfirmed', eventId, calendarId: canonicalId, nextStep: 'Google Calendar returned no matching event receipt. Check the calendar before retrying this intent.' });
    intent.receipt = receipt; intent.status = 'created'; await persist();
    return result(receipt);
  }

  return { mappings: clone(GOOGLE_CALENDAR_MAPPINGS), tools: () => clone(TOOLS), connect, oauthCallback, call, close: async () => { await saveQueue; } };
}
