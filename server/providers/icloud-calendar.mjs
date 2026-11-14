import { createHash } from 'node:crypto';
import { requireProviderDependency } from '../provider-dependencies.mjs';
import { calendarRange, calendarEvent } from '../calendar.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });
export const ICLOUD_CALENDAR_MAPPINGS = {
  listCalendars: { tool: 'icloud_calendar_list_calendars', arguments: {} },
  listEvents: { tool: 'icloud_calendar_list_events', arguments: { calendarId: '{{calendarId}}', timeMin: '{{timeMin}}', timeMax: '{{timeMax}}', limit: '{{limit}}' } },
  createEvent: { tool: 'icloud_calendar_create_event', arguments: { calendarId: '{{calendarId}}', title: '{{title}}', start: '{{start}}', end: '{{end}}', description: '{{description}}', location: '{{location}}', explicit: '{{explicit}}', idempotencyKey: '{{idempotencyKey}}' } },
};

export function appleUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !(url.hostname === 'caldav.icloud.com' || /^p\d+-caldav\.icloud\.com$/.test(url.hostname))) throw new Error('iCloud returned an unsupported calendar address.');
  return url;
}

export async function appleFetch(input, init = {}, fetchImpl = fetch) {
  let url = appleUrl(typeof input === 'string' || input instanceof URL ? input : input.url);
  for (let step = 0; step < 5; step++) {
    const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(25000), redirect: 'manual' });
    if (![301, 302, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) throw new Error('iCloud did not return a calendar address.');
    const next = appleUrl(new URL(location, url));
    await response.body?.cancel().catch(() => {});
    url = next;
  }
  throw new Error('iCloud calendar redirected too many times.');
}

export function parseICloudEvents(objects, range, calendarId, { dataDir } = {}) {
  const module = requireProviderDependency('ical.js', { dataDir }), ICAL = module.default || module;
  const instances = new Map(), min = Date.parse(range.timeMin), max = Date.parse(range.timeMax);
  let inputBytes = 0, occurrences = 0;
  const emit = (event, start, end, recurrenceId = start) => {
    if (String(event.component.getFirstPropertyValue('status')).toUpperCase() === 'CANCELLED') return;
    if (typeof event.uid !== 'string' || !event.uid || !start || !end) throw new Error('iCloud returned an event without a valid identifier or time.');
    const startValue = start.isDate ? { date: start.toString() } : { dateTime: start.toJSDate().toISOString() };
    const endValue = end.isDate ? { date: end.toString() } : { dateTime: end.toJSDate().toISOString() };
    const first = Date.parse(startValue.dateTime || startValue.date), last = Date.parse(endValue.dateTime || endValue.date);
    if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) throw new Error('iCloud returned an event with invalid times.');
    if (first >= max || !(last > min || (first === last && first >= min))) return;
    const id = `${event.uid}:${recurrenceId.toString()}`;
    instances.set(id, { id, calendarId, title: event.summary || '(Untitled)', summary: event.summary || '(Untitled)', start: startValue, end: endValue, allDay: start.isDate, description: event.description || '', location: event.location || '', provider: 'icloud-calendar' });
    if (instances.size > 10000) throw new Error('Choose a smaller iCloud calendar range.');
  };
  for (const object of objects) {
    if (typeof object.data !== 'string' || object.data.length > 2000000) throw new Error('An iCloud event is too large to read.');
    inputBytes += Buffer.byteLength(object.data);
    if (inputBytes > 10 * 1024 * 1024) throw new Error('Choose a smaller iCloud calendar range.');
    const component = new ICAL.Component(ICAL.parse(object.data));
    for (const zone of component.getAllSubcomponents('vtimezone')) {
      const id = zone.getFirstPropertyValue('tzid');
      if (id) ICAL.TimezoneService.register(id, new ICAL.Timezone(zone));
    }
    const components = component.getAllSubcomponents('vevent');
    const exceptions = components.filter(c => c.hasProperty('recurrence-id')).map(c => new ICAL.Event(c));
    for (const item of components.filter(c => !c.hasProperty('recurrence-id'))) {
      const uid = item.getFirstPropertyValue('uid');
      const event = new ICAL.Event(item, { exceptions: exceptions.filter(exception => exception.uid === uid), strictExceptions: true });
      if (String(item.getFirstPropertyValue('status')).toUpperCase() === 'CANCELLED') continue;
      if (!event.isRecurring()) emit(event, event.startDate, event.endDate);
      else {
        const iterator = event.iterator();
        let occurrence;
        while ((occurrence = iterator.next()) && +occurrence.toJSDate() < max) {
          if (++occurrences > 50000) throw new Error('An iCloud recurring event needs a smaller supported range.');
          const details = event.getOccurrenceDetails(occurrence);
          emit(details.item, details.startDate, details.endDate, occurrence);
        }
      }
    }
    // CalDAV expand responses can contain RECURRENCE-ID instances without a
    // master. Preserve them, along with overrides moved into the requested range.
    for (const exception of exceptions) {
      if (String(exception.component.getFirstPropertyValue('status')).toUpperCase() !== 'CANCELLED') emit(exception, exception.startDate, exception.endDate, exception.recurrenceId);
    }
  }
  const events = [...instances.values()].sort((a, b) => Date.parse(a.start.dateTime || a.start.date) - Date.parse(b.start.dateTime || b.start.date));
  return { events: events.slice(0, range.limit), hasMore: events.length > range.limit };
}

export function createICloudCalendarProvider({ config = {}, auth = {}, dataDir, saveAuth = async () => {}, createClient = options => new (requireProviderDependency('tsdav', { dataDir }).DAVClient)(options) } = {}) {
  let client, calendars;
  const tools = [
    { name: 'icloud_calendar_list_calendars', description: 'Read your iCloud calendars.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
    { name: 'icloud_calendar_list_events', description: 'Read events in a bounded range from one iCloud calendar.', inputSchema: { type: 'object', properties: { calendarId: { type: 'string' }, timeMin: { type: 'string' }, timeMax: { type: 'string' }, limit: { type: 'integer' } }, required: ['timeMin', 'timeMax'] }, annotations: { readOnlyHint: true } },
    { name: 'icloud_calendar_create_event', description: 'Create one explicitly requested calendar event. Never starts from a schedule.', inputSchema: { type: 'object', properties: { calendarId: { type: 'string' }, title: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, description: { type: 'string' }, location: { type: 'string' }, explicit: { const: true }, idempotencyKey: { type: 'string' } }, required: ['title', 'start', 'end', 'explicit', 'idempotencyKey'] } },
  ];
  async function connect() {
    const { username, password } = config.credentials || {};
    if (typeof username !== 'string' || !username.includes('@') || !password) throw new Error('Enter your Apple Account email and an app-specific password from account.apple.com.');
    try {
      client = await createClient({ serverUrl: 'https://caldav.icloud.com', credentials: { username, password }, authMethod: 'Basic', defaultAccountType: 'caldav', fetch: appleFetch });
      await client.login({ loadCollections: false, loadObjects: false });
      calendars = await client.fetchCalendars();
      if (!Array.isArray(calendars)) throw new Error();
      for (const calendar of calendars) appleUrl(calendar.url);
      return { status: 'connected', account: username };
    } catch { client = null; throw new Error('iCloud Calendar could not connect. Check your Apple Account email, two-factor authentication and app-specific password.'); }
  }
  async function selected(id) {
    if (!client) await connect();
    const calendar = id ? calendars.find(c => c.url === id) : calendars.find(c => !c.components || c.components.includes('VEVENT'));
    if (!calendar) throw new Error('Choose an available iCloud calendar.');
    return calendar;
  }
  return {
    mappings: ICLOUD_CALENDAR_MAPPINGS, tools: () => structuredClone(tools), connect,
    async oauthCallback() { throw new Error('iCloud Calendar uses an app-specific password instead of OAuth.'); },
    async call(name, args = {}) {
      if (!client) await connect();
      if (name === 'icloud_calendar_list_calendars') return result({ calendars: calendars.map(c => ({ id: c.url, name: typeof c.displayName === 'string' ? c.displayName : 'iCloud Calendar' })) });
      const calendar = await selected(args.calendarId);
      if (name === 'icloud_calendar_list_events') {
        const range = calendarRange(args);
        const objects = await client.fetchCalendarObjects({ calendar, timeRange: { start: range.timeMin, end: range.timeMax }, expand: true });
        if (!Array.isArray(objects) || objects.length > 2000) throw new Error('Choose a smaller calendar range.');
        return result({ provider: 'icloud-calendar', calendarId: calendar.url, ...parseICloudEvents(objects, range, calendar.url, { dataDir }) });
      }
      if (name !== 'icloud_calendar_create_event') throw new Error('Choose a supported iCloud calendar action.');
      const event = calendarEvent(args), key = hash(event.idempotencyKey), fingerprint = hash(JSON.stringify([calendar.url, event.title, event.start, event.end, event.description, event.location]));
      auth.icloudEvents ||= {};
      const previous = auth.icloudEvents[key];
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new Error('This event key belongs to a different event.');
        return result(previous.receipt || { status: 'unknown', eventId: previous.uid, nextStep: 'Check your calendar before trying again. This event will not be automatically repeated.' });
      }
      const uid = `${key}@apply-tracker.local`;
      const module = requireProviderDependency('ical.js', { dataDir }), ICAL = module.default || module;
      const component = new ICAL.Component('vcalendar'); component.updatePropertyWithValue('version', '2.0'); component.updatePropertyWithValue('prodid', '-//Apply Tracker//Local Calendar//EN');
      const vevent = new ICAL.Component('vevent'); const entry = new ICAL.Event(vevent);
      entry.uid = uid; entry.summary = event.title; entry.description = event.description; entry.location = event.location;
      entry.startDate = ICAL.Time.fromJSDate(new Date(event.start), true); entry.endDate = ICAL.Time.fromJSDate(new Date(event.end), true);
      vevent.updatePropertyWithValue('dtstamp', ICAL.Time.now()); component.addSubcomponent(vevent);
      auth.icloudEvents[key] = { uid, fingerprint, status: 'pending' }; await saveAuth(auth);
      try {
        const response = await client.createCalendarObject({ calendar, filename: `${key}.ics`, iCalString: component.toString(), headers: { 'If-None-Match': '*' } });
        if (response.status !== 201) return result({ status: 'unknown', eventId: uid, nextStep: 'Check iCloud Calendar before retrying. No automatic repeat will be made.' });
        const receipt = { status: 'created', eventId: uid, calendarId: calendar.url, provider: 'icloud-calendar' };
        auth.icloudEvents[key].receipt = receipt; await saveAuth(auth); return result(receipt);
      } catch { return result({ status: 'unknown', eventId: uid, nextStep: 'Check iCloud Calendar before retrying. No automatic repeat will be made.' }); }
    },
    async close() { client = null; },
  };
}
