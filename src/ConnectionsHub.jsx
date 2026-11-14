import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Copy, KeyRound, Mail, Monitor, RefreshCw } from 'lucide-react';
import ProviderLogo from './ProviderLogo.jsx';
import './connections-compact.css';
import './agent-readiness.css';

// The hub unmounts while a provider is open. Retain only the last control name,
// so returning with Back places keyboard users where they left the list.
let returningView = null;

export default function ConnectionsHub({ connections = [], settings, restoreNavigation = false, onSettingsChange, onNextStep, onTestAgent, onCopyCapabilityRequest, open, close, Modal, t, api }) {
  const rowsRef = useRef(new Map());
  const restoredView = useRef(restoreNavigation ? returningView : null);
  const [pane, setPane] = useState(() => restoredView.current?.pane || 'main');
  const focusAfterNavigation = useRef(restoredView.current?.control || null), originCategory = useRef(restoredView.current?.category || null);
  const preferredAssistant = settings?.preferredAssistant === 'claude-code' ? 'claude-code' : 'codex';
  const [assistant, setAssistant] = useState(preferredAssistant), [savingAssistant, setSavingAssistant] = useState(false);
  const [report, setReport] = useState(null), [checking, setChecking] = useState(false), [error, setError] = useState(''), [copied, setCopied] = useState(false), [showPrompt, setShowPrompt] = useState(false);
  const [testingAgent, setTestingAgent] = useState(false), [agentCheck, setAgentCheck] = useState(null);
  const [copyingCapability, setCopyingCapability] = useState(false), [capabilityCopied, setCapabilityCopied] = useState(false), [capabilityFallback, setCapabilityFallback] = useState('');
  const request = useRef(0), saving = useRef(false), mounted = useRef(true);
  const pending = checking || savingAssistant || testingAgent || copyingCapability;
  useEffect(() => { setAssistant(preferredAssistant); }, [preferredAssistant]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current++; }; }, []);
  const setupRequest = report?.setupPrompt ? `Use ${assistant === 'codex' ? 'Codex' : 'Claude Code'} for this setup. ${report.setupPrompt}` : '';
  async function withModelDetails(value) {
    if (value?.modelCheck?.status !== 'needs_you' || value.modelCheck.nextStep) return value;
    try {
      const proof = await api('/assistant-check?assistant=' + assistant);
      return { ...value, modelCheck: proof, modelAccessVerified: proof.modelAccessVerified === true };
    } catch { return value; }
  }
  useEffect(() => {
    let active = true;
    const version = ++request.current;
    setReport(null); setAgentCheck(null); setCopied(false); setShowPrompt(false);
    api('/setup-status?assistant=' + assistant).then(withModelDetails).then(value => { if (active && version === request.current) setReport(value); }).catch(e => { if (active && version === request.current) setError(e.message); });
    return () => { active = false; };
  }, [assistant]);
  async function check() {
    if (pending) return;
    const version = ++request.current; setChecking(true); setError('');
    setAgentCheck(null);
    setReport(previous => previous ? { ...previous, verified: false, ready: false } : previous);
    try { const value = await withModelDetails(await api('/setup-status/check', 'POST', { assistant })); if (mounted.current && version === request.current) setReport(value); }
    catch (e) { if (mounted.current && version === request.current) setError(e.message); }
    finally { if (mounted.current) setChecking(false); }
  }
  async function testAgent() {
    if (pending || !onTestAgent || !report?.ready) return;
    const version = ++request.current; setTestingAgent(true); setError(''); setAgentCheck(null);
    try {
      const value = await onTestAgent(assistant);
      if (mounted.current && version === request.current) {
        if (!value || typeof value.modelAccessVerified !== 'boolean') throw new Error(t('The agent check did not return a verified result. Try again.'));
        const proof = value.modelCheck || { ...value, status: value.status || (value.modelAccessVerified ? 'ready' : 'needs_you') };
        setAgentCheck(proof);
        setReport(previous => ({ ...previous, ...(value.steps ? value : {}), modelAccessVerified: proof.modelAccessVerified === true, modelCheck: proof }));
      }
    } catch (e) { if (mounted.current && version === request.current) { setError(e.message); setAgentCheck({ status: 'needs_you', modelAccessVerified: false }); } }
    finally { if (mounted.current) setTestingAgent(false); }
  }
  async function chooseAssistant(id) {
    if (pending || saving.current || id === assistant) return;
    const previous = assistant;
    saving.current = true; setSavingAssistant(true); setError(''); setAssistant(id);
    try {
      const patch = { preferredAssistant: id };
      await (onSettingsChange ? onSettingsChange(patch) : api('/settings', 'PATCH', patch));
      if (mounted.current) setAssistant(id);
    } catch (e) { if (mounted.current) { setAssistant(previous); setError(e.message); } }
    finally { saving.current = false; if (mounted.current) setSavingAssistant(false); }
  }
  function openProvider(kind, provider) {
    const returnPane = kind === 'ai' ? 'assistant' : kind === 'tabbio' ? 'main' : kind;
    returningView = { pane: returnPane, control: kind === 'ai' && provider === 'claude' ? 'claude-code' : kind === 'tabbio' ? 'cv' : provider, category: kind === 'ai' ? 'assistant' : kind === 'tabbio' ? 'cv' : kind };
    open(kind, provider);
  }
  function nextStep() {
    const action = modelNeedsYou ? 'assistant' : report?.nextStep?.action;
    if (action === 'check') return check();
    if (action === 'assistant') return openProvider('ai', assistant === 'claude-code' ? 'claude' : 'codex');
    if (action === 'browser') return showPane('browser');
    if (action === 'cv') return openProvider('tabbio', 'tabbio');
    if (action === 'email') {
      const provider = connections.find(item => item.kind === 'email')?.adapter || 'gmail';
      return openProvider('email', ({ 'google-cli': 'gmail', 'outlook-mcp': 'outlook' })[provider] || provider);
    }
    if (action === 'calendar') return openProvider('calendar', connections.find(item => item.kind === 'calendar')?.adapter || 'google-calendar');
    if (onNextStep) return onNextStep(action);
    close();
  }
  async function copy() {
    try { await navigator.clipboard.writeText(setupRequest); setCopied(true); setShowPrompt(false); }
    catch { setShowPrompt(true); }
  }
  async function copyCapability() {
    if (pending || !onCopyCapabilityRequest) return;
    setCopyingCapability(true); setCapabilityCopied(false); setCapabilityFallback(''); setError('');
    try {
      const result = await onCopyCapabilityRequest(pane);
      if (typeof result?.prompt !== 'string' || !result.prompt.trim()) throw new Error(t('The setup request could not be prepared. Try again.'));
      try { await navigator.clipboard.writeText(result.prompt); setCapabilityCopied(true); }
      catch { setCapabilityFallback(result.prompt); }
    } catch (failure) { setError(t(failure.message || 'The setup request could not be prepared. Try again.')); }
    finally { setCopyingCapability(false); }
  }
  function showPane(next) {
    if (pending) return;
    originCategory.current = next;
    focusAfterNavigation.current = 'back';
    setCapabilityCopied(false); setCapabilityFallback(''); setShowPrompt(false); setCopied(false); setError('');
    setPane(next);
  }
  function back() {
    focusAfterNavigation.current = originCategory.current;
    setPane('main'); setCapabilityCopied(false); setCapabilityFallback(''); setShowPrompt(false); setError('');
  }
  useEffect(() => {
    returningView = null;
    const control = focusAfterNavigation.current;
    focusAfterNavigation.current = null;
    if (!control) return;
    const frame = requestAnimationFrame(() => rowsRef.current.get(control)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [pane]);
  const modelProof = agentCheck || report?.modelCheck;
  const modelNeedsYou = modelProof?.status === 'needs_you';
  const modelVerified = modelProof ? modelProof.status === 'ready' && modelProof.modelAccessVerified === true : report?.modelAccessVerified === true;
  const ready = report?.verified && report.ready && !modelNeedsYou;
  const canTestAgent = onTestAgent && report?.verified && report.ready && !modelVerified && modelProof?.status !== 'checking';
  const nextAction = modelNeedsYou ? 'assistant' : report?.nextStep?.action;
  const nextDetail = modelNeedsYou ? (typeof modelProof.nextStep === 'string' ? modelProof.nextStep : modelProof.nextStep?.detail) || t('Open your assistant, check its access, then test again.') : report?.nextStep?.detail;
  const nextLabel = t(({ assistant: `Open ${assistant === 'codex' ? 'Codex' : 'Claude Code'} setup`, browser: 'Set up browser tools', cv: 'Open Tabbio CV', email: 'Open email connection', calendar: 'Open calendar connection', directory: 'Choose a directory', check: 'Check connections' })[nextAction] || report?.nextStep?.title || 'Check connections');
  const observationAt = modelVerified || modelNeedsYou ? modelProof?.checkedAt : report?.verified ? report.checkedAt : null;
  const checkedAt = Number.isFinite(Date.parse(observationAt)) ? new Date(observationAt).toLocaleString() : '';
  const assistantName = assistant === 'codex' ? 'Codex' : 'Claude Code';
  const paneTitles = { main: 'Connections', assistant: 'Assistant', email: 'Email', calendar: 'Calendar', browser: 'Browser & computer use', passwords: 'Passwords' };
  const providerNames = { gmail: 'Gmail', 'google-cli': 'Gmail', outlook: 'Outlook Email', 'outlook-mcp': 'Outlook Email', 'icloud-mail': 'iCloud Mail', 'google-calendar': 'Google Calendar', 'outlook-calendar': 'Outlook Calendar', 'icloud-calendar': 'iCloud Calendar' };
  const email = connections.find(item => item.kind === 'email'), calendar = connections.find(item => item.kind === 'calendar');
  function providerState(kind, provider) {
    const current = connections.find(item => item.kind === kind);
    const matches = current && (current.provider === provider || current.adapter === provider || (provider === 'gmail' && current.adapter === 'google-cli') || (provider === 'outlook' && current.adapter === 'outlook-mcp'));
    const connected = matches && current.status === 'connected';
    const needsCheck = kind === 'tabbio' && report?.verified && report.steps?.find(step => step.id === 'cv')?.status === 'needs_action';
    const status = needsCheck ? 'Needs you' : connected ? 'Connected' : matches && ['auth_required', 'error'].includes(current.status) ? 'Needs you' : matches && current.status === 'connecting' ? 'Connecting…' : matches && current.configured ? 'Reconnect' : 'Connect';
    return { connected, status };
  }
  function categoryState(connection) {
    if (!connection || connection.status === 'disconnected' && !connection.configured) return 'Optional';
    if (connection.status === 'connected') return providerNames[connection.adapter] || providerNames[connection.provider] || 'Connected';
    return ['auth_required', 'error'].includes(connection.status) ? 'Needs you' : connection.status === 'connecting' ? 'Connecting…' : connection.configured ? 'Reconnect' : 'Optional';
  }
  const categories = [
    { id: 'assistant', name: 'Assistant', value: assistantName, logo: assistant },
    { id: 'cv', name: 'Tabbio CV', value: providerState('tabbio', 'tabbio').status, logo: 'tabbio' },
    { id: 'email', name: 'Email', value: categoryState(email), logo: email?.status === 'connected' ? [email.adapter, email.provider].find(id => providerNames[id]) : null, icon: Mail },
    { id: 'calendar', name: 'Calendar', value: categoryState(calendar), logo: calendar?.status === 'connected' ? [calendar.adapter, calendar.provider].find(id => providerNames[id]) : null, icon: CalendarDays },
    { id: 'browser', name: 'Browser & computer use', value: assistantName, icon: Monitor },
    { id: 'passwords', name: 'Passwords', value: 'In your browser', icon: KeyRound },
  ];
  const providerRows = pane === 'email' ? [['gmail', 'Gmail'], ['outlook', 'Outlook Email'], ['icloud-mail', 'iCloud Mail']] : [['google-calendar', 'Google Calendar'], ['outlook-calendar', 'Outlook Calendar'], ['icloud-calendar', 'iCloud Calendar']];
  const footer = <div className="connections-dialog-footer"><div className="form-actions"><button onClick={close} disabled={pending}>{t('Done')}</button>{['main', 'assistant'].includes(pane) && <><button className={canTestAgent ? 'text-button' : ''} onClick={check} disabled={pending}><RefreshCw size={15} />{t(checking ? 'Checking connections…' : 'Check connections')}</button>{canTestAgent && <button type="button" className="primary" disabled={pending} onClick={testAgent}>{t(testingAgent ? 'Testing agent…' : assistant === 'codex' ? 'Test Codex' : 'Test Claude Code')}</button>}</>}</div></div>;
  return <Modal title={t(paneTitles[pane])} close={close} t={t} pending={pending} footer={footer}>
    {pane !== 'main' && <button type="button" className="text-button connections-back" disabled={pending} ref={node => { if (node) rowsRef.current.set('back', node); else rowsRef.current.delete('back'); }} onClick={back}><ChevronLeft size={16} />{t('Back to connections')}</button>}
    {(report?.verified || modelNeedsYou) && ['main', 'assistant'].includes(pane) && <div className={'connections-check-result connection-readiness ' + (ready ? 'ready' : '')} role="status"><div><strong>{t(ready ? modelVerified ? 'Ready' : 'Connections ready' : 'Needs you')}</strong>{checkedAt && <span className="connection-checked-at">{t('Checked')} {checkedAt}</span>}</div>{!ready && <><p>{nextDetail}</p><button type="button" className="text-button" disabled={pending} onClick={nextStep}>{nextLabel}</button></>}{ready && !modelVerified && <p>{t(onTestAgent ? 'Test your assistant with one small read-only model check.' : 'Model access is checked when your assistant starts work.')}</p>}</div>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {pane === 'main' && <div className="connection-category-list">{categories.map(category => <button type="button" className="connection-category-row" key={category.id} disabled={pending} aria-label={`${t(category.name)} — ${t(category.value)}`} ref={node => { if (node) rowsRef.current.set(category.id, node); else rowsRef.current.delete(category.id); }} onClick={() => category.id === 'cv' ? openProvider('tabbio', 'tabbio') : showPane(category.id)}>{category.logo ? <ProviderLogo provider={category.logo} size={24} decorative /> : <category.icon size={23} strokeWidth={1.7} aria-hidden="true" />}<span className="connection-category-name">{t(category.name)}</span><span className="connection-category-value">{t(category.value)}</span><ChevronRight size={17} aria-hidden="true" /></button>)}</div>}
    {['email', 'calendar'].includes(pane) && <div className="provider-rows connections-provider-picker">{providerRows.map(([provider, label]) => {
      const { connected, status } = providerState(pane, provider);
      return <button type="button" className="provider-row" disabled={pending} key={provider} ref={node => { if (node) rowsRef.current.set(provider, node); else rowsRef.current.delete(provider); }} data-connection-provider={provider} aria-haspopup="dialog" aria-label={`${label} — ${t(status)}`} onClick={() => openProvider(pane, provider)}><ProviderLogo provider={provider} size={25} decorative /><span className="provider-row-name">{label}</span><span className={'provider-row-state' + (connected ? ' connected' : '')}>{t(status)}</span><ChevronRight size={17} className="connection-chevron" aria-hidden="true" /></button>;
    })}</div>}
    {pane === 'assistant' && <div className="provider-rows connections-assistant-picker">{[['codex', 'Codex'], ['claude-code', 'Claude Code']].map(([id, name]) => {
      const ready = report?.verified && report.assistant === id && report.steps?.find(step => step.id === 'assistant')?.status === 'ready';
      return <div className="provider-row assistant-provider-row" key={id}>
        <label className="checkbox-label"><input type="radio" name="run-assistant" aria-label={t(`Use ${name} for Run`)} checked={assistant === id} disabled={pending} onChange={() => chooseAssistant(id)} /><ProviderLogo provider={id} size={25} decorative /><span>{name}</span></label>
        <button type="button" disabled={pending} className={'assistant-setup-link ' + (ready ? 'connected' : '')} aria-label={`${name} — ${t('View setup')}`} ref={node => { if (node) rowsRef.current.set(id, node); else rowsRef.current.delete(id); }} onClick={() => openProvider('ai', id === 'claude-code' ? 'claude' : 'codex')}>{t(ready ? 'Sign-in checked' : 'View setup')}<ChevronRight size={17} aria-hidden="true" /></button>
      </div>;
    })}</div>}
    {['browser', 'passwords'].includes(pane) && <div className="connection-capability">
      <p className="connection-capability-owner"><ProviderLogo provider={assistant} size={24} decorative /><strong>{assistantName}</strong></p>
      {pane === 'browser' ? <><p>{t('Browser and computer use are managed in your assistant.')}</p><p>{t('Your assistant can check supported tools and guide you through setup. Sign-ins and identity checks may need you.')}</p></> : <><p>{t('Website passwords stay in your browser or password manager.')}</p><p>{t('Your assistant reuses existing accounts and checks your connected primary email before creating an account. Sign-ins and identity checks may need you.')}</p></>}
      <button type="button" disabled={pending || !onCopyCapabilityRequest} onClick={copyCapability}><Copy size={15} />{t(copyingCapability ? 'Preparing request…' : capabilityCopied ? 'Setup request copied' : 'Copy setup request')}</button>
      {capabilityFallback && <label>{t('Copy into your assistant')}<textarea rows={3} readOnly value={capabilityFallback} onFocus={event => event.target.select()} /></label>}
    </div>}
    {['main', 'assistant'].includes(pane) && <div className="connection-setup-request"><button type="button" className="text-button" disabled={!report || pending} onClick={copy}><Copy size={15} />{t(copied ? 'Setup request copied' : 'Copy setup request')}</button>{showPrompt && <label>{t('Copy into your assistant')}<textarea rows={3} readOnly value={setupRequest} onFocus={event => event.target.select()} /></label>}</div>}
  </Modal>;
}
