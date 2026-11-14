import React, { useEffect, useState } from 'react';
import { Copy, Play } from 'lucide-react';
import ProviderLogo from './ProviderLogo.jsx';
import RunActivityMark from './RunActivityMark.jsx';
import { COMPANY_TYPES } from './company-types.js';
import { DEFAULT_RUN_ACTIONS } from './run-actions.js';
import './run-filters.css';
import './agent-readiness.css';

export function RunProgress({ run, open, stop, t = value => value }) {
  const working = run.status === 'running';
  const waiting = working && (run.mode === 'native' || run.native === true) && !run.activeCompanyId;
  const total = run.total ?? run.companyIds?.length ?? 0;
  return <div className="run-banner" role="status">
    <RunActivityMark size={28} active={working && Boolean(run.activeCompanyId)} />
    {run.assistant && <ProviderLogo provider={run.assistant} size={20} decorative />}
    <span>{run.directoryName ? `${run.directoryName} · ` : ''}{run.currentName ? `${run.currentName} · ` : ''}{waiting ? t('Waiting for assistant') : working ? `Working · ${run.completed} of ${total} checked` : `Run ${run.status} · ${run.completed} of ${total} checked`}</span>
    <button onClick={open}>View progress</button>
    {working && <button onClick={stop}>Stop</button>}
  </div>;
}

export default function RunDialog({ t, directory, selected, scope, scopeLabels, settings, connectionMode, preferredAssistant, onChangeAssistant, run, onRunUpdate, pollingError, close, start, onStartNative, onCopyHandoff, api, Modal, stopped }) {
  const [instructions, setInstructions] = useState('');
  const assistant = (preferredAssistant || settings?.preferredAssistant) === 'claude-code' ? 'claude-code' : 'codex';
  const nativeMode = run ? run.mode === 'native' || run.native === true : (connectionMode || settings?.connectionMode) !== 'local-adapters';
  const assistantName = assistant === 'codex' ? 'Codex' : 'Claude Code';
  const [handoff, setHandoff] = useState(''), [handoffCopied, setHandoffCopied] = useState(false), [handoffFallback, setHandoffFallback] = useState('');
  const [assistants, setAssistants] = useState(null);
  const [actions, setActions] = useState(() => ({ ...DEFAULT_RUN_ACTIONS, createProfiles: true }));
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [previewRetry, setPreviewRetry] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const listScope = scope || { directoryId: directory.id, ...(selected?.size ? { companyIds: [...selected].sort() } : {}) };
  const scopeKey = JSON.stringify({ ...listScope, actions });
  const count = preview?.scopeKey === scopeKey ? preview.count : null;
  const hasSelection = Array.isArray(listScope.companyIds);
  const hasAction = Object.values(actions).some(Boolean);
  const companyTypes = listScope.companyTypes || [];
  const locations = listScope.locations || [];
  const locationLabels = scopeLabels?.locationLabels || locations.map(id => preview?.locations?.find(item => item.id === id)?.label || (id === 'unknown' ? 'Unknown location' : id.replace(/^location:/, '')));
  const companyTypeLabels = scopeLabels?.companyTypeLabels || COMPANY_TYPES.filter(type => companyTypes.includes(type.id)).map(type => type.label);
  const startLabel = count === null ? 'Checking companies…' : `Run on ${count} ${hasSelection ? 'selected' : count === 1 ? 'company' : 'companies'}`;
  useEffect(() => {
    if (run || nativeMode) return;
    let active = true;
    api('/assistants').then(clients => { if (active) setAssistants(clients); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [run?.id, directory.id, nativeMode]);
  useEffect(() => {
    if (run) return;
    let active = true;
    setPreview(null); setPreviewError('');
    api('/run-preview', 'POST', JSON.parse(scopeKey)).then(value => {
      if (!active) return;
      if (!Number.isInteger(value.count) || value.count < 0) throw new Error('The company count could not be checked. Try again.');
      if (value.runActionsVersion !== 1 || value.listScopeVersion !== 1) throw new Error('Restart the local app to use these Run options, then check again.');
      setPreview({ ...value, scopeKey });
    }).catch(e => { if (active) { setPreview(null); setPreviewError(e.message); } });
    return () => { active = false; };
  }, [run?.id, scopeKey, previewRetry]);
  const working = run?.status === 'running';
  const current = run?.targets?.find(target => target.status === 'working');
  const confirmedCount = run?.outcomes?.applicationsSent ?? run?.appliedCount ?? (run?.targets ? run.targets.filter(target => target.status === 'applied').length : run?.targetCounts ? run.targetCounts.applied || 0 : run?.counts ? run.counts.applied || 0 : 'Loading');
  async function copyHandoff(value) {
    const result = value || handoff || await onCopyHandoff?.(run);
    const prompt = typeof result === 'string' ? result : result?.prompt;
    if (typeof prompt !== 'string' || !prompt.trim()) throw new Error(t('The run request could not be prepared. Try again.'));
    setHandoff(prompt); setHandoffCopied(false); setHandoffFallback('');
    try { await navigator.clipboard.writeText(prompt); setHandoffCopied(true); }
    catch { setHandoffFallback(prompt); }
  }
  async function startRun() {
    setBusy(true); setError('');
    try {
      const result = await (nativeMode ? onStartNative : start)(instructions, assistant, actions);
      onRunUpdate(result.run || result);
      if (nativeMode && result.handoff) await copyHandoff(result.handoff);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  const footer = <div className="run-dialog-footer">
    {(error || pollingError || previewError) && <div className="run-dialog-error"><p className="form-error" role="alert">{error || pollingError || previewError}</p>{previewError && !run && <button type="button" onClick={() => { setPreview(null); setPreviewError(''); setPreviewRetry(value => value + 1); }}>Check again</button>}</div>}
    <div className="run-dialog-actions">
      {run ? <><button onClick={close} disabled={busy}>Close</button>{working && nativeMode && <button type="button" className="primary" disabled={busy || (!handoff && !onCopyHandoff)} onClick={async () => { setBusy(true); setError(''); try { await copyHandoff(); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }}><Copy size={15} />{t(handoffCopied ? 'Run request copied' : 'Copy run request')}</button>}{working && <button disabled={busy} onClick={async () => { setBusy(true); try { onRunUpdate(await api(`/runs/${run.id}/stop`, 'POST')); await stopped(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>Stop run</button>}</> : <>
        <div className="run-assistant-selected"><ProviderLogo provider={assistant} size={20} decorative /><span>{assistantName}</span>{onChangeAssistant && <button type="button" className="text-button" disabled={busy} onClick={onChangeAssistant}>{t('Change')}</button>}</div>
        <button onClick={close} disabled={busy}>Cancel</button>
        <button className="primary" aria-label={busy ? 'Starting…' : startLabel} disabled={busy || !count || !hasAction || (nativeMode ? !onStartNative : !assistants?.find(client => client.id === assistant)?.installed)} onClick={startRun}><Play size={15} />{busy ? 'Starting…' : 'Run'}</button>
      </>}
    </div>
  </div>;
  return <Modal title={run ? 'Run progress' : 'Run'} close={close} t={t} pending={busy} footer={footer}>
    {run ? <>
      <div className="run-current"><RunActivityMark size={32} active={working && Boolean(run.activeCompanyId)} /><ProviderLogo provider={run.assistant} size={24} /><strong>{working ? (current?.name || run.currentName ? `Working on ${current?.name || run.currentName}` : t(nativeMode ? 'Waiting for assistant' : 'Starting your assistant…')) : run.status === 'completed' ? 'Finished this pass' : 'Run stopped'}</strong></div>
      <p className="dialog-intro">{run.completed} of {run.total ?? run.companyIds?.length ?? 0} companies checked. {confirmedCount} with confirmed submissions.</p>
      {run.companyTypes?.length > 0 && <p className="field-hint">Company types: {COMPANY_TYPES.filter(type => run.companyTypes.includes(type.id)).map(type => t(type.label)).join(', ')}.</p>}
      {run.locations?.length > 0 && <p className="field-hint">Locations: {(run.locationLabels || run.locations.map(id => id === 'unknown' ? 'Unknown location' : id.replace(/^location:/, ''))).join(', ')}.</p>}
      <p className="field-hint">{working ? nativeMode ? <>{t('Paste the run request into your existing')} {run.assistant === 'claude-code' ? 'Claude Code' : 'Codex'} {t('chat. Keep Tawdheef open to record progress.')}</> : 'You can close this panel. The run continues while the local app and computer are running.' : run.notes || 'Press Run again to retry unfinished companies.'}</p>
      {nativeMode && run.status === 'cancelled' && <p className="field-hint">{t('Stop any remaining work in your assistant.')}</p>}
      {working && handoffFallback && <label>{t('Copy into your assistant')}<textarea rows={3} readOnly value={handoffFallback} onFocus={event => event.target.select()} /></label>}
      <ol className="run-targets">{run.targets?.map(target => <li key={target.companyId}><span>{target.name || target.companyId}</span><strong>{({ pending: working ? 'Waiting' : 'Not attempted', working: working ? 'Working…' : 'Needs you', applied: 'Applied', checked: 'Checked', failed: 'Try again', needs_you: 'Needs you', uncertain: 'Check submission', skipped: 'Skipped' })[target.status]}</strong>{target.reason && <small>{target.reason}</small>}</li>)}</ol>
    </> : <>
      <p className="dialog-intro" role="status"><strong>{count === null ? previewError ? 'Count unavailable' : 'Checking your list…' : `${count.toLocaleString()} ${hasSelection ? 'selected ' : ''}${count === 1 ? 'company' : 'companies'}`}</strong> in {directory.name}.</p>
      {(locationLabels.length > 0 || companyTypeLabels.length > 0) && <p className="run-scope-summary">{[...locationLabels, ...companyTypeLabels].join(' · ')}</p>}
      {count === 0 && <p className="field-hint">No unfinished companies match this selection. Close Run to change your list.</p>}
      <fieldset className="run-action-options" aria-label={t('Run actions')} disabled={busy}>
        <div className="run-action-row">
          <label className="checkbox-label run-action-choice"><input type="checkbox" checked={actions.applyMatchingJobs} onChange={event => setActions(value => ({ ...value, applyMatchingJobs: event.target.checked }))} /><span>{t('Apply to jobs that match my CV')}</span></label>
        </div>
        <p className="run-future-heading">{actions.applyMatchingJobs ? 'If no matching job is found:' : 'For future opportunities:'}</p>
        <div className="run-action-row">
          <label className="checkbox-label run-action-choice"><input type="checkbox" checked={actions.createProfiles} onChange={event => setActions(value => ({ ...value, createProfiles: event.target.checked }))} /><span>{t('Create an account or complete my profile')}</span></label>
        </div>
        <div className="run-action-row">
          <label className="checkbox-label run-action-choice"><input type="checkbox" checked={actions.sendCvEmails} onChange={event => setActions(value => ({ ...value, sendCvEmails: event.target.checked }))} /><span>{t('Email my CV for future opportunities')}</span></label>
        </div>
        {!hasAction && <p className="field-hint">Choose at least one action to start.</p>}
      </fieldset>
      {!nativeMode && assistants && !assistants.find(client => client.id === assistant)?.installed && <p className="field-hint">Install and sign in to {assistant === 'codex' ? 'Codex' : 'Claude Code'} on this computer. Open Connections for setup.</p>}
      <details className="run-more-options"><summary>Add a note</summary>
        <label>{t('Note (optional)')}<textarea rows={2} placeholder="e.g. Product roles only, remote or hybrid" value={instructions} onChange={e => setInstructions(e.target.value)} /></label>
      </details>
    </>}
  </Modal>;
}
