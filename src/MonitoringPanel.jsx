import React, { useEffect, useId, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import ProviderLogo from './ProviderLogo.jsx';
import './monitoring-panel.css';

const CHANNELS = [['jobs', 'Matching jobs'], ['profiles', 'Career profiles'], ['email', 'Application emails'], ['calendar', 'Calendar']];
const timeLabel = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : null;

export default function MonitoringPanel({ config, onChange, status, updates = [], onAcknowledge, onOpenCompany, safeHref, onCopyRequest, onUseCurrentScope, onChooseCalendar, onOpenConnections, scopeLabel, preferredAssistant, calendars = [], pending = false, t = value => value }) {
  const headingId = useId(), calendarHintId = useId();
  const [copying, setCopying] = useState(false), [copied, setCopied] = useState(false), [fallback, setFallback] = useState(''), [error, setError] = useState('');
  const [acknowledging, setAcknowledging] = useState(null), acknowledgePending = useRef(false);
  const [choosingCalendar, setChoosingCalendar] = useState(false), [calendarError, setCalendarError] = useState(false);
  const configKey = JSON.stringify(config);
  useEffect(() => { setCopied(false); setFallback(''); setError(''); }, [configKey]);
  if (!config) return <section className="settings-section monitoring-panel"><h3>{t('Monitoring')}</h3><p className="field-hint">{t('Loading monitoring settings…')}</p></section>;
  const assistant = (config.assistant || preferredAssistant) === 'claude-code' ? 'claude-code' : 'codex';
  const name = assistant === 'codex' ? 'Codex' : 'Claude Code';
  const channels = config.channels || {}, scope = config.scope || {};
  const busy = pending || copying || choosingCalendar || acknowledging !== null;
  const hasChannels = CHANNELS.some(([id]) => channels[id] === true);
  const calendarMissing = channels.calendar === true && !scope.calendarIds?.length;
  const lastCheck = timeLabel(status?.lastCheckAt), lastSuccess = timeLabel(status?.lastSuccessAt);
  const earlierSuccess = lastSuccess && Date.parse(status.lastSuccessAt) < Date.parse(status?.lastCheckAt);
  const unread = Number.isInteger(status?.unreadCount) && status.unreadCount >= 0 ? status.unreadCount : null;
  const active = Number.isInteger(status?.activeChecks) ? status.activeChecks : 0;
  const needsYou = Number.isInteger(status?.needsYouCount) && status.needsYouCount > 0 ? status.needsYouCount : 0;
  const scopeSummary = scopeLabel || (scope.companyIds?.length ? `${scope.companyIds.length} ${t(scope.companyIds.length === 1 ? 'saved company' : 'saved companies')}` : scope.directoryIds?.length ? `${scope.directoryIds.length} ${t(scope.directoryIds.length === 1 ? 'saved directory' : 'saved directories')}` : t('Saved companies'));
  function update(patch) { onChange?.({ ...config, ...patch, assistant: preferredAssistant || assistant }); }
  async function chooseCalendar() {
    if (busy || !onChooseCalendar) return;
    setChoosingCalendar(true); setError(''); setCalendarError(false);
    try { await onChooseCalendar(); }
    catch (failure) { setCalendarError(true); setError(t(failure.message || 'Calendars could not be loaded. Check your connection and try again.')); }
    finally { setChoosingCalendar(false); }
  }
  function evidenceUrl(value) {
    try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && (!safeHref || safeHref(value)) ? url.href : null; }
    catch { return null; }
  }
  async function markRead(update) {
    if (busy || acknowledgePending.current || !onAcknowledge) return;
    acknowledgePending.current = true; setAcknowledging(update.id); setError('');
    try { await onAcknowledge(update); }
    catch (failure) { setError(t(failure.message || 'The update could not be marked as read. Try again.')); }
    finally { acknowledgePending.current = false; setAcknowledging(null); }
  }
  async function copyRequest() {
    if (busy || !config.enabled || !hasChannels || calendarMissing || !onCopyRequest) return;
    setCopying(true); setError(''); setCopied(false); setFallback('');
    try {
      const recipe = await onCopyRequest();
      const prompt = typeof recipe === 'string' ? recipe : recipe?.prompt || recipe?.request;
      if (typeof prompt !== 'string' || !prompt.trim()) throw new Error(t('The schedule request could not be prepared. Try again.'));
      try { await navigator.clipboard.writeText(prompt); setCopied(true); }
      catch { setFallback(prompt); }
    } catch (failure) { setError(t(failure.message || 'The schedule request could not be prepared. Try again.')); }
    finally { setCopying(false); }
  }
  return <details className="settings-section monitoring-disclosure">
    <summary><span>{t('Monitoring')}</span><span className="monitoring-disclosure-state">{needsYou > 0 ? t('Needs you') : unread > 0 ? `${unread} ${t(unread === 1 ? 'unread update' : 'unread updates')}` : config.enabled ? name : t('Off')}</span></summary>
    <section className="monitoring-panel" aria-labelledby={headingId}>
    <h3 className="sr-only" id={headingId}>{t('Monitoring')}</h3>
    <label className="checkbox-label monitoring-enable"><input type="checkbox" checked={config.enabled === true} disabled={busy} onChange={event => update({ enabled: event.target.checked })} /><span>{t('Monitor with')} <ProviderLogo provider={assistant} size={19} decorative />{name}</span></label>
    <fieldset className="monitoring-options" disabled={busy || !config.enabled}>
      <legend className="sr-only">{t('What to monitor')}</legend>
      <div className="monitoring-channels">{CHANNELS.map(([id, label]) => <label className="checkbox-label" key={id}><input type="checkbox" checked={channels[id] === true} aria-describedby={id === 'calendar' && calendarMissing ? calendarHintId : undefined} onChange={event => update({ channels: { ...channels, [id]: event.target.checked } })} />{t(label)}</label>)}</div>
      <div className="monitoring-scope"><span>{t('Scope')}: {scopeSummary}</span>{onUseCurrentScope && <button type="button" className="text-button" onClick={onUseCurrentScope}>{t('Use current list')}</button>}</div>
      {channels.calendar === true && calendars.length > 0 && <label className="monitoring-calendar">{t('Calendar')}<select value={scope.calendarIds?.[0] || ''} onChange={event => update({ scope: { ...scope, calendarIds: event.target.value ? [event.target.value] : [] } })}><option value="">{t('Choose a calendar')}</option>{calendars.map(calendar => <option key={calendar.id} value={calendar.id}>{calendar.name || calendar.summary || calendar.id}</option>)}</select></label>}
      {calendarMissing && <p id={calendarHintId} className="field-hint monitoring-needs-you">{t('Needs you')}: {t('Choose a calendar to monitor.')}{onChooseCalendar && calendars.length === 0 && <button type="button" className="text-button" onClick={chooseCalendar}>{t(choosingCalendar ? 'Loading calendars…' : 'Choose a calendar')}</button>}{onOpenConnections && (!onChooseCalendar || calendarError) && <button type="button" className="text-button" onClick={() => onOpenConnections('calendar')}>{t('Open Calendar in Connections')}</button>}</p>}
      {channels.calendar === true && !calendarMissing && <p className="field-hint">{t('Calendar events in the next 14 days.')}</p>}
      <div className="form-row monitoring-cadence"><label>{t('Frequency')}<select value={config.frequency || 'daily'} onChange={event => update({ frequency: event.target.value })}>{[['hourly', 'Hourly'], ['daily', 'Daily'], ['weekly', 'Weekly']].map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>{config.frequency !== 'hourly' && <label>{t('Time')}<input type="time" value={config.time || '09:00'} onChange={event => update({ time: event.target.value })} /></label>}</div>
      <p className="field-hint monitoring-timezone">{config.timezone || t('Your saved time zone')}</p>
    </fieldset>
    <div className="monitoring-observed" role="status">
      {active > 0 ? <p>{t('Check in progress')}</p> : lastCheck ? <><p>{t('Last check')}: {lastCheck}</p>{earlierSuccess && <p>{t('Last successful check')}: {lastSuccess}</p>}{unread !== null && <p>{unread} {t(unread === 1 ? 'unread update' : 'unread updates')}</p>}</> : config.enabled ? <p>{t(status?.externalScheduleStatus === 'reported' ? 'Awaiting first check' : 'Set up the local schedule in')} {status?.externalScheduleStatus !== 'reported' && name}</p> : <p>{t('Monitoring is off')}</p>}
      {needsYou > 0 && <p><strong>{t('Needs you')}</strong>: {needsYou} {t(needsYou === 1 ? 'source needs attention' : 'sources need attention')}</p>}
      {status?.latestSummary && <p>{t('Last result')}: {status.latestSummary}</p>}
    </div>
    <details className="monitoring-updates">
      <summary>{t('Recent updates')}</summary>
      {updates.length ? <ul>{updates.map(update => {
        const url = evidenceUrl(update.url), changedAt = timeLabel(update.changedAt);
        const needsYou = ['unknown', 'error'].includes(update.status);
        return <li key={update.id}>
          <div className="monitoring-update-heading"><strong>{update.title || update.source?.name || t('Update')}</strong><span>{t(needsYou ? 'Needs you' : update.status === 'new' ? 'Found' : 'Changed')}</span></div>
          {update.summary && <p>{update.summary}</p>}
          <div className="monitoring-update-actions">{changedAt && <time dateTime={update.changedAt}>{changedAt}</time>}{url && <a href={url} target="_blank" rel="noreferrer noopener">{t('Source')}</a>}{update.source?.companyId && onOpenCompany && <button type="button" className="text-button" disabled={busy} onClick={() => onOpenCompany(update.source.companyId)}>{update.source.name || t('Open company')}</button>}{!update.acknowledgedAt && onAcknowledge && <button type="button" className="text-button" disabled={busy} onClick={() => markRead(update)}>{t(acknowledging === update.id ? 'Marking as read…' : 'Mark as read')}</button>}</div>
        </li>;
      })}</ul> : <p className="field-hint">{t('No updates recorded yet.')}</p>}
    </details>
    {config.enabled && <>
      <p className="field-hint">{t('Your assistant checks for changes. Applications, messages and calendar changes need a separate request.')}</p>
      <button type="button" className="monitoring-copy" disabled={busy || !hasChannels || calendarMissing || !onCopyRequest} onClick={copyRequest}><Copy size={15} />{t(copying ? 'Preparing request…' : copied ? 'Schedule request copied' : 'Copy schedule request')}</button>
      {(copied || fallback) && <p className="field-hint">{t('Paste into')} {name}. {t('Creating the schedule happens there.')}</p>}
      {fallback && <label className="monitoring-copy-fallback">{t('Copy into your assistant')}<textarea rows={3} readOnly value={fallback} onFocus={event => event.target.select()} /></label>}
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  </details>;
}
