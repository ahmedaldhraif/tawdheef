import React, { useEffect, useState } from 'react';

export function useNativeReadiness({ api, assistant, actions, revision = '', enabled = true }) {
  const [retry, setRetry] = useState(0);
  const actionsKey = actions ? JSON.stringify(actions) : '';
  const key = JSON.stringify([assistant, actionsKey, revision, retry, enabled]);
  const [state, setState] = useState({ key: '', value: null, error: '', loading: true });
  useEffect(() => {
    let current = true;
    if (!enabled) { setState({ key, value: null, error: '', loading: false }); return () => { current = false; }; }
    setState({ key, value: null, error: '', loading: true });
    const request = actionsKey
      ? api('/native/readiness', 'POST', { assistant, actions: JSON.parse(actionsKey) })
      : api(`/native/readiness?${new URLSearchParams({ assistant })}`);
    request.then(value => {
      if (!current) return;
      if (value?.assistant !== assistant || !['ready', 'needs_you', 'unknown'].includes(value.status) || typeof value.ready !== 'boolean' || !Array.isArray(value.checks)) throw new Error('Setup could not be checked. Try again.');
      if (value.ready !== (value.status === 'ready') || value.clientReported !== true || value.independentlyVerified !== false) throw new Error('Setup could not be checked. Try again.');
      if (actionsKey && value.actions && Object.entries(JSON.parse(actionsKey)).some(([name, enabled]) => value.actions[name] !== enabled)) throw new Error('Setup could not be checked. Try again.');
      setState({ key, value, error: '', loading: false });
    }).catch(error => { if (current) setState({ key, value: null, error: error.message, loading: false }); });
    return () => { current = false; };
  }, [api, key]);
  return { ...(state.key === key ? state : { value: null, error: '', loading: true }), refresh: () => setRetry(value => value + 1) };
}

export function readinessLabel(status, t = value => value) {
  return t(({ ready: 'Ready', needs_you: 'Needs you', unknown: 'Not checked', optional: 'Optional' })[status] || 'Not checked');
}

export function ReadinessSummary({ readiness, assistantName, t = value => value, children, compact = false }) {
  const { value, error, loading, refresh } = readiness;
  const checked = value?.checkedAt && Number.isFinite(Date.parse(value.checkedAt)) ? new Date(value.checkedAt).toLocaleString() : '';
  const nextStep = ({ assistant: 'Connect your assistant to Tawdheef.', cv: 'Ask your assistant to read your CV.', email: 'Check the intended mailbox in your assistant.', browser: 'Check browser access in your assistant.' })[value?.nextStep?.id] || value?.nextStep?.title;
  return <section className={`native-readiness${compact ? ' native-readiness-compact' : ''}`} aria-label={t('Setup readiness')}>
    <div className="native-readiness-heading"><div role="status">
      <strong>{t(loading ? 'Checking setup…' : error ? 'Setup check unavailable' : value?.ready ? 'Ready to start' : value?.status === 'needs_you' ? 'Needs you' : 'Setup not checked')}</strong>
      {checked && <span className="connection-checked-at">{t('Reported by')} {assistantName} · {checked}</span>}
    </div>{children}</div>
    {error ? <p className="form-error" role="alert">{error} <button type="button" className="text-button" onClick={refresh}>{t('Try again')}</button></p>
      : !loading && !value?.ready && nextStep ? <p className="native-readiness-next">{t(nextStep)}</p> : null}
  </section>;
}
