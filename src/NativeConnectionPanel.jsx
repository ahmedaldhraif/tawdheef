import React, { useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import ProviderLogo from './ProviderLogo.jsx';
import CvFileControl from './CvFileControl.jsx';

const names = { cv: 'Tabbio CV', tabbio: 'Tabbio CV', email: 'Email', calendar: 'Calendar', browser: 'Browser & computer use', passwords: 'Passwords', passwordManager: 'Passwords', assistant: 'Assistant' };
export const nativeClientName = assistant => assistant === 'claude-code' ? 'Claude Code' : 'Codex';
export const nativeCapability = (status, kind) => status?.capabilities?.[kind === 'passwords' ? 'passwordManager' : kind === 'tabbio' ? 'cv' : kind];
export function NativeCapabilityStatus({ capability, t }) {
  const observedAt = capability?.observedAt && Number.isFinite(Date.parse(capability.observedAt)) ? new Date(capability.observedAt).toLocaleString() : '';
  return <div className="native-capability-status" role="status"><p><strong>{t(capability?.status === 'reported' ? capability.localToolUseObserved ? 'Tracker used' : 'Client reported' : capability?.status === 'needs_you' ? 'Needs you' : 'Unknown')}</strong>{observedAt && <span className="connection-checked-at">{t(capability?.localToolUseObserved ? 'Observed' : 'Reported')} {observedAt}</span>}</p>{capability?.accountEmail && <p>{capability.accountEmail}</p>}{capability?.nextStep && <p>{capability.nextStep}</p>}</div>;
}

export function ConnectionModeControl({ mode = 'native', onChange, disabled, t }) {
  return <details className="advanced native-connection-advanced"><summary>{t('Advanced compatibility')}</summary><label>{t('Connections managed by')}<select value={mode} disabled={disabled} onChange={event => onChange(event.target.value)}><option value="native">{t('My Codex or Claude Code client')}</option><option value="local-adapters">{t('Tawdheef local adapters')}</option></select></label></details>;
}

export function NativeConnectionContent({ kind, provider, assistant = 'codex', clientStatus, onCopyConnectionRequest, onCopyCapabilityRequest, onPendingChange, api, t = value => value, disabled = false }) {
  const [busy, setBusy] = useState(false), [copied, setCopied] = useState(false), [fallback, setFallback] = useState(''), [error, setError] = useState('');
  const name = nativeClientName(assistant), reportedCapability = nativeCapability(clientStatus?.assistant === assistant ? clientStatus : null, kind);
  const capability = provider && ['email', 'calendar'].includes(kind) && reportedCapability?.provider?.toLowerCase() !== provider.toLowerCase() ? null : reportedCapability;
  const copyRequest = onCopyConnectionRequest || (['browser', 'passwords'].includes(kind) ? onCopyCapabilityRequest : null);
  async function copy() {
    if (!copyRequest || busy || disabled) return;
    setBusy(true); onPendingChange?.(true); setCopied(false); setFallback(''); setError('');
    try {
      const result = await copyRequest(onCopyConnectionRequest ? kind === 'passwords' ? 'passwordManager' : kind === 'tabbio' ? 'cv' : kind : kind, { provider, assistant });
      const prompt = typeof result === 'string' ? result : result?.prompt;
      if (typeof prompt !== 'string' || !prompt.trim()) throw new Error(t('The setup request could not be prepared. Try again.'));
      try { await navigator.clipboard.writeText(prompt); setCopied(true); } catch { setFallback(prompt); }
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); onPendingChange?.(false); }
  }
  return <div className="connection-capability native-connection-content">
    <p className="connection-capability-owner"><ProviderLogo provider={assistant} size={24} decorative /><strong>{name}</strong></p>
    {kind === 'browser' ? <><strong>{t('Browser')}</strong><NativeCapabilityStatus capability={capability} t={t} /><strong>{t('Computer use')}</strong><NativeCapabilityStatus capability={nativeCapability(clientStatus?.assistant === assistant ? clientStatus : null, 'computer')} t={t} /></> : <NativeCapabilityStatus capability={capability} t={t} />}
    {['cv', 'tabbio'].includes(kind) ? <><p>{t('Connect Tabbio MCP in your assistant to use your real CV.')}</p><a className="native-create-cv" href="https://www.tabbio.com/en" target="_blank" rel="noopener noreferrer">{t('Create a CV in Tabbio')}<ExternalLink size={14} /></a></> : kind === 'email' ? <p>{t('Connect your email in your assistant. Tawdheef keeps the recorded outcomes.')}</p> : kind === 'calendar' ? <p>{t('Connect your calendar in your assistant and report the calendars you choose.')}</p> : kind === 'passwords' || kind === 'passwordManager' ? <p>{t('Website passwords stay in your browser or password manager. Your assistant uses the access you allow.')}</p> : kind === 'browser' ? <p>{t('Browser and computer use are managed in your assistant.')}</p> : <p>{t('Connect this local tracker to your existing assistant. Continue in the client you already use.')}</p>}
    <button type="button" disabled={disabled || busy || !copyRequest} onClick={copy}><Copy size={15} />{t(busy ? 'Preparing request…' : copied ? 'Setup request copied' : 'Copy setup request')}</button>
    {(copied || fallback) && <p className="field-hint">{t('Paste into')} {name}. {t('Setup happens in your assistant.')}</p>}
    {fallback && <label>{t('Copy into your assistant')}<textarea rows={3} value={fallback} readOnly onFocus={event => event.target.select()} /></label>}
    {['cv', 'tabbio'].includes(kind) && api && <CvFileControl api={api} t={t} disabled={disabled || busy} />}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}

export default function NativeConnectionPanel({ kind, provider, preferredAssistant, settings, clientStatus, onCopyConnectionRequest, onCopyCapabilityRequest, api, t = value => value, Modal, close, back, backLabel = 'Back to connections' }) {
  const assistant = preferredAssistant || settings?.preferredAssistant || 'codex';
  const [busy, setBusy] = useState(false);
  return <Modal title={t(names[kind] || 'Connections')} close={close} t={t} pending={busy} footer={<button type="button" onClick={close} disabled={busy}>{t('Done')}</button>}>
    {back && <button type="button" className="text-button connections-back" disabled={busy} onClick={back}>{t(backLabel)}</button>}
    <NativeConnectionContent key={`${kind}:${provider}:${assistant}`} {...{ kind, provider, assistant, clientStatus, onCopyConnectionRequest, onCopyCapabilityRequest, api, t }} disabled={busy} onPendingChange={setBusy} />
  </Modal>;
}
