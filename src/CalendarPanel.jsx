import React, { useState, useEffect, useRef } from 'react';
import ProviderLogo from './ProviderLogo.jsx';

const NAMES = { 'google-calendar': 'Google Calendar', 'outlook-calendar': 'Outlook Calendar', 'icloud-calendar': 'iCloud Calendar' };
const eventDate = value => typeof value === 'string' ? value : value?.dateTime || value?.date;
const displayEventDate = event => {
  const start = eventDate(event.start);
  if (typeof start !== 'string' || !start) return 'Time unavailable';
  const allDay = event.allDay || event.isAllDay || event.start?.date;
  const date = new Date(allDay ? start.slice(0, 10) + 'T12:00:00' : start);
  return Number.isFinite(date.getTime()) ? (allDay ? date.toLocaleDateString() + ' (all day)' : date.toLocaleString()) : 'Time unavailable';
};
export default function CalendarPanel({ conn, provider, api, updated, close, back, notify, Modal, t, safeHref, backLabel = 'Back to connections' }) {
  const chosen = provider || conn?.adapter || 'google-calendar';
  const same = conn?.adapter === chosen;
  const [clientId, setClientId] = useState(same ? conn?.oauthClientId || '' : '');
  const [clientSecret, setClientSecret] = useState('');
  const [username, setUsername] = useState(same ? conn?.credentialUsername || '' : '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [authUrl, setAuthUrl] = useState('');
  const [calendars, setCalendars] = useState([]), [calendarId, setCalendarId] = useState(''), [events, setEvents] = useState(null);
  const [calendarsLoading, setCalendarsLoading] = useState(false), [eventsLoading, setEventsLoading] = useState(false), [eventsTruncated, setEventsTruncated] = useState(false);
  const [form, setForm] = useState({ title: '', start: '', end: '' }), [eventKey, setEventKey] = useState(() => crypto.randomUUID());
  const mounted = useRef(true), actionPending = useRef(false), calendarRequest = useRef(0), eventsRequest = useRef(0), selectedCalendar = useRef(calendarId), edited = useRef({ clientId: false, username: false });
  const accountId = same ? (typeof conn?.account === 'string' ? conn.account : conn?.account?.id || conn?.account?.email || '') : '';
  const scope = `${chosen}:${same ? conn?.status || '' : ''}:${accountId}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  selectedCalendar.current = calendarId;
  const connected = same && conn?.status === 'connected';
  useEffect(() => { if (connected) setAuthUrl(''); }, [connected]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; calendarRequest.current++; eventsRequest.current++; };
  }, []);
  useEffect(() => {
    calendarRequest.current++; eventsRequest.current++;
    setCalendars([]); setCalendarId(''); setEvents(null); setCalendarsLoading(false); setEventsLoading(false); setEventsTruncated(false); setEventKey(crypto.randomUUID());
    if (connected) void loadCalendars();
  }, [scope]);
  useEffect(() => {
    if (!edited.current.clientId) setClientId(same ? conn?.oauthClientId || '' : '');
    if (!edited.current.username) setUsername(same ? conn?.credentialUsername || '' : '');
  }, [same, conn?.oauthClientId, conn?.credentialUsername]);
  const name = NAMES[chosen];
  const setupRef = useRef(null), focusAfterBusy = useRef(null);
  useEffect(() => {
    if (!busy && focusAfterBusy.current) { focusAfterBusy.current.focus(); focusAfterBusy.current = null; }
  }, [busy, error]);
  async function action(task) {
    if (actionPending.current) return;
    actionPending.current = true; setBusy(true); setError('');
    try { await task(); } catch (failure) { if (mounted.current) setError(failure.message); }
    finally { actionPending.current = false; if (mounted.current) setBusy(false); }
  }
  async function loadCalendars() {
    const request = ++calendarRequest.current, owner = currentScope.current;
    const current = () => mounted.current && request === calendarRequest.current && owner === currentScope.current;
    setCalendarsLoading(true);
    try {
      const result = await api('/calendar/calendars');
      if (!current()) return;
      if (!Array.isArray(result.calendars)) throw new Error('The calendar list could not be read. Check your connection and try again.');
      setCalendars(result.calendars);
      const first = result.calendars.find(item => item.id === selectedCalendar.current) || result.calendars.find(item => item.primary) || result.calendars[0];
      setCalendarId(first?.id || '');
    } catch (failure) { if (current()) setError(failure.message); }
    finally { if (current()) setCalendarsLoading(false); }
  }
  async function loadEvents() {
    const selected = selectedCalendar.current, request = ++eventsRequest.current, owner = currentScope.current;
    const current = () => mounted.current && request === eventsRequest.current && owner === currentScope.current && selected === selectedCalendar.current;
    setEventsLoading(true); setError('');
    try {
      const data = await api('/calendar/events', 'POST', { calendarId: selected });
      if (!current()) return;
      if (!Array.isArray(data.events)) throw new Error('Events could not be read. Check your connection and try again.');
      setEvents(data.events); setEventsTruncated(data.truncated === true || data.hasMore === true || Boolean(data.nextPageToken || data.nextCursor));
    } catch (failure) { if (current()) setError(failure.message); }
    finally { if (current()) setEventsLoading(false); }
  }
  async function connect() { await action(async () => {
    if (chosen === 'icloud-calendar' && (!username.trim() || (!password && !(same && conn?.hasCredentials)))) throw new Error('Enter your Apple Account email and app-specific password.');
    if (chosen !== 'icloud-calendar' && !clientId.trim() && !(same && conn?.oauthConfigured)) {
      const info = await api('/integrations');
      if (!info.oauth?.[chosen === 'google-calendar' ? 'gmailConfigured' : 'outlookConfigured']) {
        if (setupRef.current) { setupRef.current.open = true; focusAfterBusy.current = setupRef.current.querySelector('input'); }
        throw new Error('Add your OAuth client ID in One-time setup, then sign in.');
      }
    }
    const config = { adapter: chosen, provider: chosen, label: name };
    if (chosen === 'icloud-calendar') {
      if (!same || password || username !== conn?.credentialUsername) config.credentials = { username: username.trim(), password };
    } else if (!same || clientId !== conn?.oauthClientId || clientSecret) config.oauth = { clientId: clientId.trim(), ...(clientSecret ? { clientSecret } : {}), ...(chosen === 'outlook-calendar' ? { tenant: 'common' } : {}) };
    await api('/connections/calendar', 'PUT', config);
    const result = await api('/connections/calendar/connect', 'POST', {});
    setAuthUrl(result.authUrl || ''); setClientSecret(''); setPassword('');
    if (safeHref(result.authUrl)) window.open(result.authUrl, '_blank', 'noopener,noreferrer');
    if (result.status === 'error') throw new Error(result.lastError);
    await updated();
    if (result.status === 'connected') notify(`${name} connected`);
  }); }
  return <Modal title={`Connect ${name}`} close={close} t={t} pending={busy}>
    <button type="button" className="text-button" disabled={busy} onClick={back}>{backLabel}</button>
    <p className="calendar-provider-title"><ProviderLogo provider={chosen} size={32} decorative /><strong>{name}</strong></p>
    <p className="dialog-intro">See your upcoming events and add interviews when you ask. Connecting does not create events.</p>
    {connected && <p className="connection-state"><strong>Connected</strong><bdi className="calendar-account">{typeof conn.account === 'string' ? conn.account : conn.account?.email || ''}</bdi></p>}
    {chosen === 'icloud-calendar' ? <>
      <label>Apple Account email<input type="email" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} disabled={busy} onChange={e => { edited.current.username = true; setUsername(e.target.value); }} /></label>
      <label>App-specific password<input type="password" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={password} disabled={busy} onChange={e => setPassword(e.target.value)} placeholder={same && conn?.hasCredentials ? 'Saved; leave blank to keep' : 'From your Apple Account'} /></label>
      <p className="connection-help">Create an app-specific password at <a href="https://account.apple.com" target="_blank" rel="noreferrer">account.apple.com</a>. Use that here, rather than your main Apple password.</p>
    </> : <details className="advanced" ref={setupRef}>
      <summary>One-time setup</summary>
      <p className="connection-help">Use your own {chosen === 'google-calendar' ? 'Google Desktop' : 'Microsoft public desktop'} OAuth registration. Calendar access is separate from email. Callback: <code>{window.location.origin}/api/connections/calendar/oauth/callback</code></p>
      <label>OAuth client ID<input value={clientId} disabled={busy} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={e => { edited.current.clientId = true; setClientId(e.target.value); }} /></label>
      {chosen === 'google-calendar' && <>
        <label>Desktop client secret, if supplied<input value={clientSecret} type="password" disabled={busy} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={e => setClientSecret(e.target.value)} placeholder={same && conn?.hasClientSecret ? 'Saved; leave blank to keep' : ''} /></label>
        <label>Import Google desktop credentials<input type="file" accept=".json,application/json" disabled={busy} onChange={async e => { const input = e.currentTarget, file = input.files?.[0]; if (!file) return; try { if (file.size > 64000) throw new Error('Choose the small Google OAuth credentials JSON.'); const value = JSON.parse(await file.text()); if (!mounted.current) return; if (typeof value.installed?.client_id !== 'string') throw new Error('Choose a Google Desktop app credentials file.'); edited.current.clientId = true; setClientId(value.installed.client_id); setClientSecret(value.installed.client_secret || ''); setError(''); } catch (failure) { if (mounted.current) setError(failure.message); } finally { if (input.isConnected) input.value = ''; } }} /></label>
      </>}
    </details>}
    {safeHref(authUrl) && <a className="button auth-link" href={safeHref(authUrl)} target="_blank" rel="noreferrer">Continue sign-in</a>}
    <div className="form-actions"><button type="button" className="primary" disabled={busy} onClick={connect}>{busy ? 'Connecting…' : chosen === 'icloud-calendar' ? 'Connect iCloud Calendar' : `Sign in to ${name}`}</button></div>
    {connected && <section className="calendar-actions">
      <h3>Upcoming events</h3>
      {!calendars.length ? <button type="button" disabled={busy || calendarsLoading} onClick={() => void loadCalendars()}>{calendarsLoading ? 'Loading calendars…' : 'Choose calendar'}</button> : <label>Calendar<select disabled={busy || calendarsLoading} value={calendarId} onChange={e => { eventsRequest.current++; selectedCalendar.current = e.target.value; setCalendarId(e.target.value); setEvents(null); setEventsLoading(false); setEventsTruncated(false); setEventKey(crypto.randomUUID()); }}>{calendars.map(item => <option key={item.id} value={item.id}>{item.title || item.name || item.summary || item.id}</option>)}</select></label>}
      <button type="button" disabled={busy || !calendarId || eventsLoading} onClick={() => void loadEvents()}>{eventsLoading ? 'Loading events…' : 'Show next 30 days'}</button>
      {eventsLoading && <p className="connection-help" role="status">Checking the selected calendar…</p>}
      {events && <ul className="calendar-events" aria-busy={eventsLoading}>{events.length ? events.map(event => <li key={event.id}><strong dir="auto">{event.title || event.summary || '(Untitled)'}</strong><span>{displayEventDate(event)}</span></li>) : <li>No events in this range.</li>}</ul>}
      {events && <p className="connection-help">Times use this computer’s timezone.{eventsTruncated ? ` Showing the first ${events.length} events. Ask your assistant for a shorter date range to see the rest.` : ''}</p>}
      <details className="advanced"><summary>Add an event</summary>
        <label>Event title<input disabled={busy} maxLength={300} value={form.title} onChange={e => { setForm({ ...form, title: e.target.value }); setEventKey(crypto.randomUUID()); }} /></label>
        <label>Start<input type="datetime-local" disabled={busy} value={form.start} onChange={e => { setForm({ ...form, start: e.target.value }); setEventKey(crypto.randomUUID()); }} /></label>
        <label>End<input type="datetime-local" disabled={busy} value={form.end} onChange={e => { setForm({ ...form, end: e.target.value }); setEventKey(crypto.randomUUID()); }} /></label>
        <p className="connection-help">Times use this computer’s timezone. This adds an event to your calendar without inviting anyone.</p>
        <button disabled={busy || !calendarId || !form.title || !form.start || !form.end} onClick={() => action(async () => { const data = await api('/calendar/event', 'POST', { calendarId, title: form.title, start: new Date(form.start).toISOString(), end: new Date(form.end).toISOString(), explicit: true, idempotencyKey: eventKey }); if (data.status !== 'created') throw new Error('The result is uncertain. Check your calendar before trying again.'); notify('Calendar event created'); })}>Add event to calendar</button>
      </details>
    </section>}
    {(error || (same && conn?.lastError)) && <p className="form-error" role="alert">{error || conn.lastError}</p>}
    <div className="form-actions">{same && conn?.configured && <button className="danger-text push-left" disabled={busy} onClick={() => action(async () => { await api('/connections/calendar', 'DELETE'); await updated(); notify('Calendar disconnected'); close(); })}>Disconnect calendar</button>}<button disabled={busy} onClick={close}>Close</button></div>
  </Modal>;
}
