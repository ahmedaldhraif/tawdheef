import React, { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import ProviderLogo from './ProviderLogo.jsx';
import { TawdheefMark } from './TawdheefBrand.jsx';
import { COMPANY_TYPES } from './company-types.js';
import './run-filters.css';

export function RunProgress({ run, open, stop }) {
  const working = run.status === 'running';
  const total = run.total ?? run.companyIds?.length ?? 0;
  return <div className="run-banner" role="status">
    <TawdheefMark size={28} busy={working && Boolean(run.activeCompanyId)} />
    {run.assistant && <ProviderLogo provider={run.assistant} size={20} decorative />}
    <span>{run.directoryName ? `${run.directoryName} · ` : ''}{run.currentName ? `${run.currentName} · ` : ''}{working ? `Working · ${run.completed} of ${total} checked` : `Run ${run.status} · ${run.completed} of ${total} checked`}</span>
    <button onClick={open}>View progress</button>
    {working && <button onClick={stop}>Stop</button>}
  </div>;
}

export default function RunDialog({ t, directory, selected, run: initialRun, close, start, api, Modal, stopped }) {
  const [instructions, setInstructions] = useState('');
  const [assistant, setAssistant] = useState(() => localStorage.getItem('tawdheef-assistant') || 'codex');
  const [assistants, setAssistants] = useState(null);
  const [companyTypes, setCompanyTypes] = useState([]);
  const [locations, setLocations] = useState([]);
  const [locationSearch, setLocationSearch] = useState('');
  const [facets, setFacets] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [previewRetry, setPreviewRetry] = useState(0);
  const [run, setRun] = useState(initialRun);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const candidatesKey = JSON.stringify({ directoryId: directory.id, ...(selected.size ? { companyIds: [...selected].sort() } : {}) });
  const scopeKey = JSON.stringify({ ...JSON.parse(candidatesKey), companyTypes, locations });
  const count = preview?.scopeKey === scopeKey ? preview.count : null;
  const currentFacets = facets?.candidatesKey === candidatesKey ? facets : null;
  const locationOptions = currentFacets?.locations || [];
  const visibleLocations = locationOptions.filter(item => item.label.toLocaleLowerCase().includes(locationSearch.trim().toLocaleLowerCase()));
  useEffect(() => {
    if (initialRun) return;
    let active = true;
    api('/assistants')
      .then(clients => { if (active) { setAssistants(clients); setAssistant(chosen => clients.some(c => c.id === chosen && c.installed) ? chosen : clients.find(c => c.installed)?.id || chosen); } })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [initialRun?.id, directory.id]);
  useEffect(() => {
    if (run) return;
    let active = true;
    setPreview(null);
    setPreviewError('');
    const requestedScope = JSON.parse(scopeKey);
    api('/run-preview', 'POST', requestedScope)
      .then(value => {
        if (!active) return;
        if (!Number.isInteger(value.count) || value.count < 0) throw new Error('The company count could not be checked. Try again.');
        const validFacets = items => Array.isArray(items) && items.every(item => item && typeof item.id === 'string' && typeof item.label === 'string' && Number.isInteger(item.count) && item.count >= 0);
        if ((requestedScope.companyTypes.length || requestedScope.locations.length) && (!validFacets(value.companyTypes) || !validFacets(value.locations))) {
          throw new Error('Restart the local app to enable these filters, then check again.');
        }
        setPreview({ ...value, scopeKey });
        setFacets({ companyTypes: value.companyTypes || [], locations: value.locations || [], candidatesKey });
      })
      .catch(e => { if (active) { setPreview(null); setPreviewError(e.message); } });
    return () => { active = false; };
  }, [run?.id, scopeKey, previewRetry]);
  function chooseTypes(next) {
    setPreview(null);
    setPreviewError('');
    setError('');
    setCompanyTypes(COMPANY_TYPES.filter(type => next.includes(type.id)).map(type => type.id));
  }
  function chooseLocations(next) {
    setPreview(null);
    setPreviewError('');
    setError('');
    setLocations([...next].sort());
  }
  useEffect(() => {
    if (!run) return;
    let active = true;
    const read = () => api('/runs/' + run.id).then(value => { if (active) setRun(value); }).catch(e => { if (active) setError(e.message); });
    read();
    const timer = run.status === 'running' ? setInterval(read, 2000) : null;
    return () => { active = false; clearInterval(timer); };
  }, [run?.id, run?.status]);
  const working = run?.status === 'running';
  const current = run?.targets?.find(target => target.status === 'working');
  const footer = <div className="run-dialog-footer">
    {(error || previewError) && <div className="run-dialog-error"><p className="form-error" role="alert">{error || previewError}</p>{previewError && !run && <button type="button" onClick={() => { setPreview(null); setPreviewError(''); setPreviewRetry(value => value + 1); }}>Check again</button>}</div>}
    <div className="run-dialog-actions">
      {run ? <><button onClick={close} disabled={busy}>Close</button>{working && <button disabled={busy} onClick={async () => { setBusy(true); try { setRun(await api(`/runs/${run.id}/stop`, 'POST')); await stopped(); } catch (e) { setError(e.message); } finally { setBusy(false); } }}>Stop run</button>}</> : <>
        <button onClick={close} disabled={busy}>Cancel</button>
        <button className="primary" disabled={busy || !count || !assistants?.find(client => client.id === assistant)?.installed} onClick={async () => { setBusy(true); setError(''); try { localStorage.setItem('tawdheef-assistant', assistant); setRun(await start(instructions, assistant, companyTypes, locations)); } catch (e) { setError(e.message); } finally { setBusy(false); } }}><Play size={15} />{busy ? 'Starting…' : 'Run'}</button>
      </>}
    </div>
  </div>;
  return <Modal title={run ? 'Run progress' : 'Run'} close={close} t={t} pending={busy} footer={footer}>
    {run ? <>
      <div className="run-current"><TawdheefMark size={32} busy={working && Boolean(current)} /><ProviderLogo provider={run.assistant} size={24} /><strong>{working ? (current?.name || run.currentName ? `Working on ${current?.name || run.currentName}` : 'Starting your assistant…') : run.status === 'completed' ? 'Finished this pass' : 'Run stopped'}</strong></div>
      <p className="dialog-intro">{run.completed} of {run.total ?? run.companyIds?.length ?? 0} companies checked. {run.targets ? run.targets.filter(target => target.status === 'applied').length : run.appliedCount ?? 'Loading'} with confirmed submissions.</p>
      {run.companyTypes?.length > 0 && <p className="field-hint">Company types: {COMPANY_TYPES.filter(type => run.companyTypes.includes(type.id)).map(type => t(type.label)).join(', ')}.</p>}
      {run.locations?.length > 0 && <p className="field-hint">City / location: {run.locations.length} selected.</p>}
      <p className="field-hint">{working ? 'You can close this panel. The run continues while the local app and computer are running.' : run.notes || 'Press Run again to retry unfinished companies.'}</p>
      <ol className="run-targets">{run.targets?.map(target => <li key={target.companyId}><span>{target.name || target.companyId}</span><strong>{({ pending: working ? 'Waiting' : 'Not attempted', working: working ? 'Working…' : 'Needs you', applied: 'Applied', checked: 'Checked', failed: 'Try again', needs_you: 'Needs you', uncertain: 'Check submission', skipped: 'Skipped' })[target.status]}</strong>{target.reason && <small>{target.reason}</small>}</li>)}</ol>
    </> : <>
      <p className="dialog-intro" role="status"><strong>{selected.size ? 'Selected companies' : companyTypes.length || locations.length ? 'Matching remaining companies' : 'All remaining companies'}</strong> in {directory.name}. {count === null ? previewError ? 'Count unavailable.' : 'Checking the list…' : `${count} to check.`}</p>
      <fieldset className="run-type-filters" disabled={busy} aria-describedby="run-types-help">
        <legend>{t('Company type')}</legend>
        <div className="run-types-heading"><p id="run-types-help">{companyTypes.length ? 'Include any of the selected types.' : 'All types included. Select any to narrow the run.'}</p><button type="button" className="run-types-reset" disabled={!companyTypes.length || busy} onClick={() => chooseTypes([])}>All types</button></div>
        <div className="run-type-options">{COMPANY_TYPES.map(type => <label className="checkbox-label run-type-option" key={type.id}>
            <input type="checkbox" checked={companyTypes.includes(type.id)} onChange={e => chooseTypes(e.target.checked ? [...companyTypes, type.id] : companyTypes.filter(id => id !== type.id))} />
            <span>{t(type.label)}</span>
          </label>)}</div>
        {companyTypes.includes('unknown') && <p className="field-hint run-types-unknown">Unknown type means ownership has not been verified.</p>}
      </fieldset>
      <details className="run-location-filters">
        <summary>{t('City / location')}<span>{locations.length ? `${locations.length} selected` : 'All'}</span></summary>
        <fieldset disabled={busy}>
          <legend className="sr-only">Choose locations</legend>
          <div className="run-types-heading"><p>Choose one or more locations from {directory.name}.</p><button type="button" className="run-types-reset" disabled={!locations.length || busy} onClick={() => chooseLocations([])}>All locations</button></div>
          {locationOptions.length > 8 && <label className="run-location-search">Search locations<input type="search" value={locationSearch} onChange={event => setLocationSearch(event.target.value)} /></label>}
          <div className="run-location-options">{visibleLocations.map(item => <label className="checkbox-label run-type-option" key={item.id}>
            <input type="checkbox" checked={locations.includes(item.id)} onChange={event => chooseLocations(event.target.checked ? [...locations, item.id] : locations.filter(id => id !== item.id))} />
            <span>{item.label}</span>
          </label>)}</div>
          {!locationOptions.length && <p className="field-hint">{currentFacets ? 'No locations recorded in this selection.' : 'Loading locations…'}</p>}
          {locationOptions.length > 0 && !visibleLocations.length && <p className="field-hint">No locations match your search.</p>}
        </fieldset>
      </details>
      {count === 0 && <p className="field-hint">No remaining companies match. Change the company types or locations.</p>}
      <div className="assistant-choices" role="group" aria-label="Choose assistant">{(assistants || [{ id: 'codex', name: 'Codex' }, { id: 'claude-code', name: 'Claude Code' }]).map(client => <button type="button" key={client.id} aria-pressed={assistant === client.id} onClick={() => setAssistant(client.id)}><ProviderLogo provider={client.id} size={22} decorative /><span>{client.name}</span>{assistants && !client.installed && <small>Not installed</small>}</button>)}</div>
      {assistants && !assistants.find(client => client.id === assistant)?.installed && <p className="field-hint">Install and sign in to {assistant === 'codex' ? 'Codex' : 'Claude Code'} on this computer. Open Connections for install and sign-in instructions.</p>}
      <label>What work are you looking for?<textarea rows={3} placeholder="e.g. Product roles in Dubai, hybrid or remote" value={instructions} onChange={e => setInstructions(e.target.value)} /></label>
      <p className="field-hint">Run sends and submits suitable applications using your connected CV and accounts. It continues past individual blockers. Confirmed applications are skipped; unfinished companies can be retried on the next Run.</p>
    </>}
  </Modal>;
}
