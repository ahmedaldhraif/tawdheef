import React, { useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import ProviderLogo from './ProviderLogo.jsx';
import CvFileControl from './CvFileControl.jsx';
import { Editable } from './SharedUI.jsx';
import { readinessLabel } from './NativeReadiness.jsx';

export const nativeClientName = assistant => assistant === 'claude-code' ? 'Claude Code' : 'Codex';
export const nativeCapability = (status, kind) => status?.capabilities?.[kind === 'passwords' ? 'passwordManager' : kind === 'tabbio' ? 'cv' : kind];
export function NativeCapabilityStatus({ capability, t }) {
  const observedAt = capability?.observedAt && Number.isFinite(Date.parse(capability.observedAt)) ? new Date(capability.observedAt).toLocaleString() : '';
  const method = ({ mcp: 'Through MCP', browser: 'Through browser', computer: 'Through computer use', file: 'Through a file', other: 'Through your assistant' })[capability?.accessMethod];
  return <div className="native-capability-status" role="status"><p><strong>{t(capability?.status === 'reported' ? capability.localToolUseObserved ? 'Tracker used' : 'Client reported' : capability?.status === 'needs_you' ? 'Needs you' : 'Unknown')}</strong>{observedAt && <span className="connection-checked-at">{t(capability?.localToolUseObserved ? 'Observed' : 'Reported')} {observedAt}</span>}</p>{capability?.accountEmail && <p>{capability.accountEmail}</p>}{method && <p>{t(method)}</p>}{capability?.nextStep && <p>{capability.nextStep}</p>}</div>;
}

export function NativeConnectionContent({ kind, provider, assistant = 'codex', settings, onSettingsChange, clientStatus, onCopyConnectionRequest, onPendingChange, readiness, onReadinessChange, api, t = value => value, disabled = false }) {
  const [busy, setBusy] = useState(false), [copied, setCopied] = useState(false), [fallback, setFallback] = useState(''), [error, setError] = useState('');
  const name = nativeClientName(assistant), reportedCapability = nativeCapability(clientStatus?.assistant === assistant ? clientStatus : null, kind);
  const capability = provider && ['email', 'calendar'].includes(kind) && reportedCapability?.provider?.toLowerCase() !== provider.toLowerCase() ? null : reportedCapability;
  const uploadFile = readiness?.assistant === assistant ? readiness.checks?.find(check => check.id === 'uploadFile') : null;
  const copyRequest = onCopyConnectionRequest;
  async function copy() {
    if (!copyRequest || busy || disabled) return;
    setBusy(true); onPendingChange?.(true); setCopied(false); setFallback(''); setError('');
    try {
      const result = await copyRequest(kind === 'passwords' ? 'passwordManager' : kind === 'tabbio' ? 'cv' : kind, { provider, assistant });
      const prompt = typeof result === 'string' ? result : result?.prompt;
      if (typeof prompt !== 'string' || !prompt.trim()) throw new Error(t('The setup request could not be prepared. Try again.'));
      try { await navigator.clipboard.writeText(prompt); setCopied(true); } catch { setFallback(prompt); }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); onPendingChange?.(false); }
  }
  return <div className="connection-capability native-connection-content">
    <p className="connection-capability-owner"><ProviderLogo provider={assistant} size={24} decorative /><strong>{name}</strong></p>
    {['cv', 'tabbio'].includes(kind) && <strong>{t('Readable CV')}</strong>}
    {kind === 'browser' ? <><strong>{t('Browser')}</strong><NativeCapabilityStatus capability={capability} t={t} /><strong>{t('Computer use')}</strong><NativeCapabilityStatus capability={nativeCapability(clientStatus?.assistant === assistant ? clientStatus : null, 'computer')} t={t} /></> : <NativeCapabilityStatus capability={capability} t={t} />}
    {['cv', 'tabbio'].includes(kind) && capability?.cv?.label && <p>{capability.cv.label}</p>}
    {['cv', 'tabbio'].includes(kind) ? <><p>{t('Use Tabbio in your assistant to read your real CV.')}</p><a className="native-create-cv" href="https://www.tabbio.com/en" target="_blank" rel="noopener noreferrer">{t('Create a CV in Tabbio')}<ExternalLink size={14} /></a></> : kind === 'email' ? <p>{t('Connect your email in your assistant. Tawdheef keeps the recorded outcomes.')}</p> : kind === 'calendar' ? <p>{t('Connect your calendar in your assistant and report the calendars you choose.')}</p> : kind === 'passwords' || kind === 'passwordManager' ? <p>{t('Use a unique password for each career site through your assistant’s supported password manager. Reuse existing accounts.')}</p> : kind === 'browser' ? <p>{t('Browser and computer use are managed in your assistant.')}</p> : <p>{t('Connect this local tracker to your existing assistant. Continue in the client you already use.')}</p>}
    <button type="button" disabled={disabled || busy || !copyRequest} onClick={copy}><Copy size={15} />{t(busy ? 'Preparing request…' : copied ? 'Setup request copied' : 'Copy setup request')}</button>
    {(copied || fallback) && <p className="field-hint">{t('Paste into')} {name}. {t('Setup happens in your assistant.')}</p>}
    {fallback && <label>{t('Copy into your assistant')}<textarea rows={3} value={fallback} readOnly onFocus={event => event.target.select()} /></label>}
    {kind === 'email' && onSettingsChange && <div className="native-contact-hint">
      <strong className="native-contact-label">{t('Email for new accounts')}</strong>
      <p className="field-hint">{t('Your assistant checks this mailbox. Existing accounts keep their sign-in.')}</p>
      <fieldset className="form-fields" disabled={disabled || busy}><Editable value={settings?.applicationEmail || ''} label={t('Email for new accounts')} placeholder={t('Use the observed mailbox')} onSave={async value => {
        setBusy(true); onPendingChange?.(true);
        try { await onSettingsChange({ applicationEmail: value }); }
        finally { setBusy(false); onPendingChange?.(false); }
      }} /></fieldset>
      {readiness?.intendedEmail && readiness?.observedEmail && readiness.intendedEmail !== readiness.observedEmail && <p className="form-error">{t('The reported mailbox is different. Ask your assistant to select this account before registering.')}</p>}
    </div>}
    {['cv', 'tabbio'].includes(kind) && uploadFile && <div className="native-upload-status" role="status"><strong>{t('CV upload file')} · {readinessLabel(uploadFile.status, t)}</strong>{uploadFile.detail && <p>{uploadFile.detail}</p>}</div>}
    {['cv', 'tabbio'].includes(kind) && api && <CvFileControl api={api} t={t} disabled={disabled || busy} onChange={onReadinessChange} />}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}
