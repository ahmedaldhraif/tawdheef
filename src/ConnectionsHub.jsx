import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Copy, KeyRound, Mail, Monitor } from 'lucide-react';
import ProviderLogo from './ProviderLogo.jsx';
import './connections-compact.css';
import './agent-readiness.css';
import { NativeCapabilityStatus, NativeConnectionContent, nativeCapability, nativeClientName } from './NativeConnectionPanel.jsx';
import { ReadinessSummary, readinessLabel, useNativeReadiness } from './NativeReadiness.jsx';

const categories = [['assistant', 'Assistant'], ['cv', 'Tabbio CV'], ['email', 'Email', Mail], ['calendar', 'Calendar', CalendarDays], ['browser', 'Browser & computer use', Monitor], ['passwords', 'Passwords', KeyRound]];
const providers = { email: [['gmail', 'Gmail'], ['outlook', 'Outlook Email'], ['icloud-mail', 'iCloud Mail']], calendar: [['google-calendar', 'Google Calendar'], ['outlook-calendar', 'Outlook Calendar'], ['icloud-calendar', 'iCloud Calendar']] };
export default function ConnectionsHub({ settings, clientStatus, onSettingsChange, onCopyConnectionRequest, onOpenJobPreferences, close, Modal, t = value => value, api }) {
  const [pane, setPane] = useState('main'), [provider, setProvider] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const saving = useRef(false), rows = useRef(new Map());
  const preferredAssistant = settings?.preferredAssistant === 'claude-code' ? 'claude-code' : 'codex';
  const [assistant, setAssistant] = useState(preferredAssistant);
  const [setupCopied, setSetupCopied] = useState(false), [setupFallback, setSetupFallback] = useState('');
  useEffect(() => { setAssistant(preferredAssistant); }, [preferredAssistant]);
  const name = nativeClientName(assistant);
  const selectedStatus = clientStatus?.assistant === assistant ? clientStatus : null;
  const readiness = useNativeReadiness({ api, assistant, revision: JSON.stringify([settings?.applicationEmail, selectedStatus?.capabilities]) });
  useEffect(() => { setSetupCopied(false); setSetupFallback(''); }, [assistant]);
  async function checkSetup() {
    if (busy) return;
    setBusy(true); setError(''); setSetupCopied(false); setSetupFallback('');
    try {
      const result = await api('/native/setup-request', 'POST', { assistant });
      if (typeof result?.prompt !== 'string' || !result.prompt.trim()) throw new Error(t('The setup request could not be prepared. Try again.'));
      try { await navigator.clipboard.writeText(result.prompt); setSetupCopied(true); }
      catch { setSetupFallback(result.prompt); }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function changeSettings(patch) {
    if (saving.current) return;
    const previousAssistant = assistant;
    saving.current = true; setBusy(true); setError('');
    if (patch.preferredAssistant) setAssistant(patch.preferredAssistant);
    try { await (onSettingsChange ? onSettingsChange(patch) : api('/settings', 'PATCH', patch)); }
    catch (failure) { setAssistant(previousAssistant); setError(failure.message); }
    finally { saving.current = false; setBusy(false); }
  }
  function navigate(next, nextProvider = null) { setError(''); setProvider(nextProvider); setPane(next); requestAnimationFrame(() => rows.current.get('back')?.focus()); }
  function back() { if (provider) { const previous = provider; setProvider(null); requestAnimationFrame(() => rows.current.get(previous)?.focus()); return; } const previous = pane; setPane('main'); requestAnimationFrame(() => rows.current.get(previous)?.focus()); }
  const title = pane === 'main' ? 'Connections' : provider ? providers[pane]?.find(([id]) => id === provider)?.[1] : categories.find(([id]) => id === pane)?.[1];
  return <Modal title={t(title || 'Connections')} close={close} t={t} pending={busy} footer={<div className="connections-dialog-footer"><div className="form-actions"><button type="button" onClick={close} disabled={busy}>{t('Done')}</button></div></div>}>
    {pane !== 'main' && <button type="button" className="text-button connections-back" disabled={busy} ref={node => rows.current.set('back', node)} onClick={back}><ChevronLeft size={16} />{t(provider ? 'Back' : 'Back to connections')}</button>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {pane === 'main' ? <><ReadinessSummary readiness={readiness} assistantName={name} t={t}>
      <button type="button" disabled={busy} onClick={checkSetup}><Copy size={15} />{t(setupCopied ? 'Setup request copied' : 'Check setup')}</button>
    </ReadinessSummary>
    {(setupCopied || setupFallback) && <p className="field-hint">{t('Paste into')} {name}. {t('Your assistant checks its existing connections.')}</p>}
    {setupFallback && <label>{t('Copy into your assistant')}<textarea rows={3} readOnly value={setupFallback} onFocus={event => event.target.select()} /></label>}
    {readiness.value && <details className="native-readiness-details"><summary>{t('Setup details')}</summary><dl>{readiness.value.checks.map(check => <div key={check.id}><dt>{t(check.label)}</dt><dd><strong>{readinessLabel(check.status, t)}</strong>{check.detail && <span>{check.detail}</span>}</dd></div>)}</dl></details>}
    <div className="connection-category-list">{categories.map(([kind, label, Icon]) => {
      const capability = nativeCapability(selectedStatus, kind);
      const value = kind === 'assistant' ? name : capability?.status === 'reported' ? 'Client reported' : capability?.status === 'needs_you' ? 'Needs you' : 'Unknown';
      return <button type="button" className="connection-category-row" key={kind} disabled={busy} ref={node => rows.current.set(kind, node)} aria-label={`${t(label)} — ${t(value)}`} onClick={() => navigate(kind)}>{kind === 'assistant' || kind === 'cv' ? <ProviderLogo provider={kind === 'assistant' ? assistant : 'tabbio'} size={24} decorative /> : <Icon size={23} strokeWidth={1.7} aria-hidden="true" />}<span className="connection-category-name">{t(label)}</span><span className="connection-category-value">{kind === 'email' && capability?.accountEmail ? capability.accountEmail : t(value)}</span><ChevronRight size={17} aria-hidden="true" /></button>;
    })}</div>{onOpenJobPreferences && <button type="button" className="text-button connections-job-preferences" disabled={busy} onClick={onOpenJobPreferences}><span>{t('Job preferences')}</span><ChevronRight size={17} aria-hidden="true" /></button>}</> : <>
      {pane === 'assistant' ? <><div className="provider-rows connections-assistant-picker">{[['codex', 'Codex'], ['claude-code', 'Claude Code']].map(([id, label]) => <label className="provider-row checkbox-label" key={id}><input type="radio" name="preferred-native-assistant" checked={assistant === id} disabled={busy} aria-label={t(`Use ${label}`)} onChange={() => changeSettings({ preferredAssistant: id })} /><ProviderLogo provider={id} size={25} decorative /><span>{label}</span></label>)}</div><NativeConnectionContent key={assistant} kind="assistant" {...{ assistant, settings, onSettingsChange, clientStatus: selectedStatus, onCopyConnectionRequest, api, t }} disabled={busy} onPendingChange={setBusy} /></> : providers[pane] && !provider ? <><NativeCapabilityStatus capability={nativeCapability(selectedStatus, pane)} t={t} /><div className="provider-rows connections-provider-picker">{providers[pane].map(([id, label]) => <button type="button" className="provider-row" key={id} disabled={busy} ref={node => rows.current.set(id, node)} data-connection-provider={id} onClick={() => navigate(pane, id)}><ProviderLogo provider={id} size={25} decorative /><span className="provider-row-name">{label}</span><ChevronRight size={17} className="connection-chevron" aria-hidden="true" /></button>)}</div></> : <NativeConnectionContent key={`${pane}:${provider}:${assistant}`} kind={pane} {...{ provider, assistant, settings, onSettingsChange, clientStatus: selectedStatus, onCopyConnectionRequest, api, t }} readiness={readiness.value} onReadinessChange={readiness.refresh} disabled={busy} onPendingChange={setBusy} />}
    </>}
  </Modal>;
}
