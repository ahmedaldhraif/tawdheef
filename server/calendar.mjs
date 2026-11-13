import { unwrapToolResult } from './email-send.mjs';

const DAY = 86400000;
function validDateTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export function calendarRange(input = {}) {
  const timeMin = input.timeMin || new Date().toISOString();
  if (!validDateTime(timeMin)) throw new Error('Choose a valid calendar start with a timezone.');
  const timeMax = input.timeMax || new Date(Date.parse(timeMin) + 30 * DAY).toISOString();
  if (![timeMin, timeMax].every(validDateTime) || Date.parse(timeMax) <= Date.parse(timeMin) || Date.parse(timeMax) - Date.parse(timeMin) > 90 * DAY) throw new Error('Choose a calendar range up to 90 days, using valid dates with a timezone.');
  return { calendarId: typeof input.calendarId === 'string' ? input.calendarId : '', timeMin: new Date(timeMin).toISOString(), timeMax: new Date(timeMax).toISOString(), limit: Number.isInteger(input.limit) && input.limit > 0 ? Math.min(input.limit, 100) : 50 };
}

export function calendarEvent(input = {}) {
  if (input.explicit !== true) throw new Error('Create an event only after the user explicitly asks for it.');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 300 || /[\r\n\0]/.test(input.title)) throw new Error('Give the calendar event a one-line title, under 300 characters.');
  calendarRange({ timeMin: input.start, timeMax: input.end });
  if (!input.start || !input.end) throw new Error('Choose the event start and end.');
  if (typeof input.idempotencyKey !== 'string' || !input.idempotencyKey || input.idempotencyKey.length > 300) throw new Error('An event key is required to prevent duplicate calendar entries.');
  for (const key of ['description', 'location']) if (input[key] != null && (typeof input[key] !== 'string' || input[key].length > 10000 || input[key].includes('\0'))) throw new Error('Keep calendar details under 10,000 characters.');
  if ((input.location || '').length > 1000) throw new Error('Keep the calendar location under 1,000 characters.');
  return { calendarId: input.calendarId || '', title: input.title.trim(), start: new Date(input.start).toISOString(), end: new Date(input.end).toISOString(), description: input.description || '', location: input.location || '', idempotencyKey: input.idempotencyKey, explicit: true };
}

export async function calendarAction(connections, action, input = {}) {
  if (!['listCalendars', 'listEvents', 'createEvent'].includes(action)) throw new Error('Choose a supported calendar action.');
  const args = action === 'createEvent' ? calendarEvent(input) : action === 'listEvents' ? calendarRange(input) : {};
  const result = await connections.callMapped('calendar', action, args);
  if (result?.isError) throw new Error('The calendar could not complete this action. Check its sign-in and permissions.');
  const data = unwrapToolResult(result);
  if (!data) throw new Error('The calendar did not return a readable result. Check it before retrying an event.');
  return data;
}
