import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Copy, RefreshCw } from 'lucide-react';
import ProviderLogo from './ProviderLogo.jsx';
import './connections-compact.css';

// The hub unmounts while a provider is open. Retain only the last control name,
// so returning with Back places keyboard users where they left the list.
let returningProvider = null;

export default function ConnectionsHub({ connections = [], open, close, Modal, t, api }) {
  const rowsRef = useRef(new Map());
  const [assistant, setAssistant] = useState(() => localStorage.getItem('tawdheef-assistant') === 'claude-code' ? 'claude-code' : 'codex');
  const [report, setReport] = useState(null), [checking, setChecking] = useState(false), [error, setError] = useState(''), [copied, setCopied] = useState(false), [showPrompt, setShowPrompt] = useState(false);
  const request = useRef(0);
  const setupRequest = report?.setupPrompt ? `Use ${assistant === 'codex' ? 'Codex' : 'Claude Code'} for this setup. ${report.setupPrompt}` : '';
  useEffect(() => {
    let active = true;
    const version = ++request.current;
    setReport(null); setError(''); setCopied(false); setShowPrompt(false);
    api('/setup-status?assistant=' + assistant).then(value => { if (active && version === request.current) setReport(value); }).catch(e => { if (active && version === request.current) setError(e.message); });
    return () => { active = false; };
  }, [assistant]);
  async function check() {
    ++request.current; setChecking(true); setError('');
    setReport(previous => previous ? { ...previous, verified: false, ready: false } : previous);
    try { setReport(await api('/setup-status/check', 'POST', { assistant })); }
    catch (e) { setError(e.message); }
    finally { setChecking(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(setupRequest); setCopied(true); setShowPrompt(false); }
    catch { setShowPrompt(true); }
  }
  useEffect(() => {
    const provider = returningProvider;
    returningProvider = null;
    if (!provider) return;
    const frame = requestAnimationFrame(() => rowsRef.current.get(provider)?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  const groups = [
    { title: 'Email', optional: true, rows: [['gmail', 'Gmail', 'email'], ['outlook', 'Outlook Email', 'email'], ['icloud-mail', 'iCloud Mail', 'email']] },
    { title: 'Calendar', optional: true, rows: [['google-calendar', 'Google Calendar', 'calendar'], ['outlook-calendar', 'Outlook Calendar', 'calendar'], ['icloud-calendar', 'iCloud Calendar', 'calendar']] },
    { title: 'Your CV', rows: [['tabbio', 'Tabbio CV', 'tabbio']] },
  ];
  const footer = <div className="connections-dialog-footer"><div className="form-actions"><button onClick={close} disabled={checking}>Done</button><button onClick={check} disabled={checking}><RefreshCw size={15} />{checking ? 'Checking connections…' : 'Check connections'}</button></div></div>;
  return <Modal title="Connections" close={close} t={t} pending={checking} footer={footer}>
    {report?.verified && <div className={'connections-check-result ' + (report.ready ? 'ready' : '')} role="status"><strong>{report.ready ? 'Ready for Run' : report.nextStep.title}</strong>{!report.ready && <p>{report.nextStep.detail}</p>}</div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="connection-groups compact-connection-groups">{groups.map(group => <section key={group.title} aria-labelledby={`connection-group-${group.rows[0][0]}`}>
      <div className="connection-group-heading"><h3 id={`connection-group-${group.rows[0][0]}`}>{group.title}</h3>{group.optional && <span>Optional</span>}</div>
      <div className="provider-rows">{group.rows.map(([provider, label, kind]) => {
        const current = connections.find(item => item.kind === kind);
        const matches = current && (current.provider === provider || current.adapter === provider || (provider === 'gmail' && current.adapter === 'google-cli') || (provider === 'outlook' && current.adapter === 'outlook-mcp'));
        const connected = matches && current.status === 'connected';
        const needsCheck = kind === 'tabbio' && report?.verified && report.steps.find(step => step.id === 'cv')?.status === 'needs_action';
        const status = needsCheck ? 'Check setup' : connected ? 'Connected' : matches && current.status === 'auth_required' ? 'Finish sign-in' : matches && current.status === 'connecting' ? 'Connecting…' : matches && current.status === 'error' ? 'Check setup' : matches && current.configured ? 'Reconnect' : 'Connect';
        return <button type="button" className="provider-row" disabled={checking} key={provider} ref={node => { if (node) rowsRef.current.set(provider, node); else rowsRef.current.delete(provider); }} data-connection-provider={provider} aria-haspopup="dialog" aria-label={`${label} — ${status}`} onClick={() => { returningProvider = provider; open(kind, provider); }}>
          <ProviderLogo provider={provider === 'claude' ? 'claude-code' : provider} size={25} decorative /><span className="provider-row-name">{label}</span><span className={'provider-row-state' + (connected ? ' connected' : '')}>{status}</span><ChevronRight size={17} className="connection-chevron" aria-hidden="true" />
        </button>;
      })}</div>
    </section>)}
    <section aria-labelledby="connection-group-ai"><h3 id="connection-group-ai">AI assistants</h3><div className="provider-rows">{[['codex', 'Codex'], ['claude-code', 'Claude Code']].map(([id, name]) => {
      const ready = report?.verified && report.assistant === id && report.steps.find(step => step.id === 'assistant')?.status === 'ready';
      return <div className="provider-row assistant-provider-row" key={id}>
        <label className="checkbox-label"><input type="radio" name="run-assistant" aria-label={`Use ${name} for Run`} checked={assistant === id} disabled={checking} onChange={() => { localStorage.setItem('tawdheef-assistant', id); setAssistant(id); }} /><ProviderLogo provider={id} size={25} decorative /><span>{name}</span></label>
        <button type="button" disabled={checking} className={'assistant-setup-link ' + (ready ? 'connected' : '')} aria-label={`${name} — View setup`} ref={node => { if (node) rowsRef.current.set(id, node); else rowsRef.current.delete(id); }} onClick={() => { returningProvider = id; open('ai', id === 'claude-code' ? 'claude' : 'codex'); }}>{ready ? 'Ready' : 'View setup'}<ChevronRight size={17} aria-hidden="true" /></button>
      </div>;
    })}</div></section></div>
    <div className="connection-setup-request"><button type="button" className="text-button" disabled={!report || checking} onClick={copy}><Copy size={15} />{copied ? 'Setup request copied' : 'Copy setup request'}</button>{showPrompt && <label>Copy into your assistant<textarea rows={3} readOnly value={setupRequest} onFocus={event => event.target.select()} /></label>}</div>
  </Modal>;
}
