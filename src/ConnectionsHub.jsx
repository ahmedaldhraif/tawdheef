import React, { useEffect, useRef, useState } from 'react';
import { ChevronRight, Copy, RefreshCw } from 'lucide-react';
import ProviderLogo from './ProviderLogo.jsx';

// The hub unmounts while a provider is open. Retain only the last control name,
// so returning with Back places keyboard users where they left the list.
let returningProvider = null;

export default function ConnectionsHub({ connections = [], open, close, Modal, t, api }) {
  const rowsRef = useRef(new Map());
  const [assistant, setAssistant] = useState(() => localStorage.getItem('tawdheef-assistant') === 'claude-code' ? 'claude-code' : 'codex');
  const [report, setReport] = useState(null), [checking, setChecking] = useState(false), [error, setError] = useState(''), [copied, setCopied] = useState(false), [showPrompt, setShowPrompt] = useState(false);
  const request = useRef(0);
  useEffect(() => {
    let active = true;
    const version = ++request.current;
    setReport(null); setError(''); setCopied(false);
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
    try { await navigator.clipboard.writeText(report.setupPrompt); setCopied(true); }
    catch { setShowPrompt(true); setError('Copy the instructions below and paste them into your assistant.'); }
  }
  useEffect(() => {
    const provider = returningProvider;
    returningProvider = null;
    if (!provider) return;
    const frame = requestAnimationFrame(() => rowsRef.current.get(provider)?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  const groups = [
    { title: 'Email', hint: 'Send applications and check recorded replies.', rows: [['gmail', 'Gmail', 'email'], ['outlook', 'Outlook Email', 'email'], ['icloud-mail', 'iCloud Mail', 'email']] },
    { title: 'Calendar', hint: 'See upcoming events and add an interview when you ask.', rows: [['google-calendar', 'Google Calendar', 'calendar'], ['outlook-calendar', 'Outlook Calendar', 'calendar'], ['icloud-calendar', 'iCloud Calendar', 'calendar']] },
    { title: 'Your CV', hint: 'Use your structured Tabbio CV.', rows: [['tabbio', 'Tabbio CV', 'tabbio']] },
  ];
  return <Modal title="Connections" close={close} t={t} pending={checking}>
    <p className="dialog-intro">Choose your email, calendar, CV and assistant. Account sign-ins and credentials stay on this computer.</p>
    {report?.verified && <div className={'connections-check-result ' + (report.ready ? 'ready' : '')} role="status"><strong>{report.ready ? 'Ready for Run' : report.nextStep.title}</strong><p>{report.ready ? 'Your assistant sign-in and CV access were checked. Choose a directory and press Run when you want to apply.' : report.nextStep.detail}</p></div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="connection-groups">{groups.map(group => <section key={group.title} aria-labelledby={`connection-group-${group.rows[0][0]}`}>
      <h3 id={`connection-group-${group.rows[0][0]}`}>{group.title}</h3><p className="connection-group-hint">{group.hint}</p>
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
    <section aria-labelledby="connection-group-ai"><h3 id="connection-group-ai">AI assistants</h3><p className="connection-group-hint">Choose one assistant for Run.</p><div className="provider-rows">{[['codex', 'Codex'], ['claude-code', 'Claude Code']].map(([id, name]) => {
      const ready = report?.verified && report.assistant === id && report.steps.find(step => step.id === 'assistant')?.status === 'ready';
      return <div className="provider-row assistant-provider-row" key={id}>
        <label className="checkbox-label"><input type="radio" name="run-assistant" aria-label={`Use ${name} for Run`} checked={assistant === id} disabled={checking} onChange={() => { localStorage.setItem('tawdheef-assistant', id); setAssistant(id); }} /><ProviderLogo provider={id} size={25} decorative /><span>{name}</span></label>
        <button type="button" disabled={checking} className={'assistant-setup-link ' + (ready ? 'connected' : '')} aria-label={`${name} — View setup`} ref={node => { if (node) rowsRef.current.set(id, node); else rowsRef.current.delete(id); }} onClick={() => { returningProvider = id; open('ai', id === 'claude-code' ? 'claude' : 'codex'); }}>{ready ? 'Ready' : 'View setup'}<ChevronRight size={17} aria-hidden="true" /></button>
      </div>;
    })}</div></section></div>
    <details className="connection-agent-help"><summary>Set up with my agent</summary><p className="field-hint">Paste these instructions into {assistant === 'codex' ? 'Codex' : 'Claude Code'} with this app folder open. Your agent handles the commands; you complete sign-in.</p><button disabled={!report || checking} onClick={copy}><Copy size={15} />{copied ? 'Instructions copied' : 'Copy instructions'}</button><details open={showPrompt || undefined} onToggle={e => setShowPrompt(e.currentTarget.open)}><summary>Read instructions</summary><pre tabIndex={0}>{report?.setupPrompt || 'Loading instructions…'}</pre></details></details>
    <p className="connection-help">Email and calendar are optional. Checking confirms assistant sign-in and CV access; it never sends an application.</p>
    <div className="form-actions"><button onClick={close} disabled={checking}>Done</button><button onClick={check} disabled={checking}><RefreshCw size={15} />{checking ? 'Checking connections…' : 'Check connections'}</button></div>
  </Modal>;
}
