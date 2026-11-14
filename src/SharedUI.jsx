import React, { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import './shared-ui.css';

const ModalState = React.createContext(null);
export const ModalNotification = React.createContext(null);

export function Editable({ value, label, placeholder, onSave, display }) {
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(value),
    [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const committed = useRef(false), trigger = useRef(null), input = useRef(null), restore = useRef(false), correct = useRef(false);
  const errorId = useId();
  useEffect(() => { if (!editing) { setDraft(value); if (restore.current) trigger.current?.focus(); restore.current = false; } }, [value, editing]);
  useEffect(() => { if (!saving && error && correct.current) { input.current?.focus(); correct.current = false; } }, [saving, error]);
  async function save(returnFocus = false) {
    if (committed.current) return;
    restore.current = returnFocus;
    if (draft === value) { setEditing(false); return; }
    committed.current = true; setSaving(true);
    try { await onSave(draft); setEditing(false); }
    catch (e) { setError(e.message); committed.current = false; correct.current = returnFocus; }
    finally { setSaving(false); }
  }
  return editing ? <div className="inline-editor">
    <input ref={input} autoFocus aria-label={label} value={draft} disabled={saving}
      aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}
      onChange={e => { setDraft(e.target.value); setError(''); }} onBlur={() => save()}
      onKeyDown={e => {
        if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); committed.current = true; restore.current = true; setDraft(value); setEditing(false); }
        if (e.key === 'Enter') { e.preventDefault(); save(true); }
      }} />
    {error && <span id={errorId} role="alert" className="inline-error">{error}</span>}
  </div> : <button ref={trigger} className={'editable ' + (!value ? 'placeholder' : '')}
    title={value || label} aria-label={'Edit ' + label}
    onClick={() => { committed.current = false; setError(''); setEditing(true); }}>
    {display || value || placeholder}
  </button>;
}

export function Modal({ title, close, children, t, narrow = false, wide = false, footer, pending = false, dirty = false }) {
  const ref = useRef(null), previousEditing = useRef(null), state = useRef({});
  const [saving, setSaving] = useState(false), [formDirty, setFormDirty] = useState(false), [discard, setDiscard] = useState(false);
  const titleId = useId(), notification = React.useContext(ModalNotification);
  const wasPending = useRef(false);
  state.current = { close, pending: pending || saving, dirty: dirty || formDirty, discard };
  const requestClose = () => {
    if (state.current.pending) return;
    if (state.current.discard) { setDiscard(false); return; }
    if (state.current.dirty) { previousEditing.current = document.activeElement; setDiscard(true); }
    else state.current.close();
  };
  const closeRef = useRef(requestClose); closeRef.current = requestClose;
  useLayoutEffect(() => {
    const previous = document.activeElement, node = ref.current;
    const items = () => [...node.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')]
      .filter(e => e.getClientRects().length && !e.closest('[hidden],[inert]'));
    const focusFirst = () => (items()[0] || node).focus();
    focusFirst();
    // Isolate every sibling on the path to body, preserving any existing inert state.
    const isolated = [];
    for (let branch = node.parentElement; branch && branch !== document.body; branch = branch.parentElement) {
      for (const sibling of branch.parentElement.children) if (sibling !== branch && !['SCRIPT', 'STYLE'].includes(sibling.tagName)) {
        isolated.push([sibling, sibling.inert]); sibling.inert = true;
      }
    }
    const handle = e => {
      // The inline editor owns Escape; React handles it after this native
      // listener. Let it cancel the edit without closing the containing dialog.
      if (e.key === 'Escape' && e.target.closest?.('.inline-editor')) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!state.current.pending) closeRef.current(); }
      if (e.key === 'Tab') {
        const list = items(), active = document.activeElement;
        if (!list.length) { e.preventDefault(); node.focus(); }
        else if (!node.contains(active) || active === node || (e.shiftKey && active === list[0])) { e.preventDefault(); (e.shiftKey ? list.at(-1) : list[0]).focus(); }
        else if (!e.shiftKey && active === list.at(-1)) { e.preventDefault(); list[0].focus(); }
      }
    };
    const contain = e => { if (!node.contains(e.target)) focusFirst(); };
    const observer = new MutationObserver(() => {
      const active = document.activeElement;
      if (!node.contains(active) || active.matches?.(':disabled') || active.closest?.('[hidden],[inert]')) focusFirst();
    });
    observer.observe(node, { subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'inert'] });
    node.addEventListener('keydown', handle); document.addEventListener('focusin', contain);
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => {
      observer.disconnect(); node.removeEventListener('keydown', handle); document.removeEventListener('focusin', contain);
      isolated.forEach(([element, wasInert]) => { element.inert = wasInert; });
      document.body.style.overflow = overflow;
      if (previous?.isConnected && previous !== document.body) previous.focus?.();
      else document.querySelector('[data-connections-trigger]')?.focus();
    };
  }, []);
  useLayoutEffect(() => {
    if (discard) ref.current?.querySelector('[data-keep-editing]')?.focus();
    else if (previousEditing.current?.isConnected) { previousEditing.current.focus(); previousEditing.current = null; }
  }, [discard]);
  useEffect(() => {
    const busy = pending || saving, node = ref.current;
    if (wasPending.current && !busy && document.activeElement === node) {
      (node.querySelector('.dialog-footer button:not(:disabled)') || node.querySelector('button:not(:disabled)'))?.focus();
    }
    wasPending.current = busy;
  }, [pending, saving]);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) { e.preventDefault(); requestClose(); } }}>
    <section ref={ref} tabIndex={-1} className={'dialog ' + (narrow ? 'narrow ' : '') + (wide ? 'wide' : '')}
      role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={pending || saving}
      onClickCapture={e => { if (e.target.closest('[data-modal-close]')) { e.preventDefault(); e.stopPropagation(); requestClose(); } }}>
      <header className="dialog-header"><h2 id={titleId}>{discard ? t('Discard unsaved changes?') : title}</h2>
        {!discard && <button className="icon-button" aria-label={t('Close')} onClick={requestClose} disabled={pending || saving}><X /></button>}
      </header>
      {discard && <div className="dialog-content discard-changes"><p>{t('Your changes have not been saved.')}</p><div className="form-actions">
        <button type="button" data-keep-editing onClick={() => setDiscard(false)}>{t('Keep editing')}</button>
        <button type="button" className="primary" onClick={() => state.current.close()}>{t('Discard changes')}</button>
      </div></div>}
      <div className="dialog-content" hidden={discard}>
        <ModalState.Provider value={{ setSaving, setDirty: setFormDirty, requestClose }}>{children}</ModalState.Provider>
      </div>
      {footer && <footer className="dialog-footer" hidden={discard}>{footer}</footer>}
      {!discard && notification && <fieldset className="form-fields dialog-notification" disabled={pending || saving}>{notification}</fieldset>}
    </section>
  </div>;
}

function formSnapshot(node) {
  return JSON.stringify([...node.querySelectorAll('input,select,textarea')].map(e => [e.type, e.value, e.checked]));
}

export function Form({ children, save, label = 'Save changes', close, t, extra, pending = false, onBusyChange, trackDirty = true }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const context = React.useContext(ModalState), ref = useRef(null), baseline = useRef(''), inFlight = useRef(false);
  useLayoutEffect(() => { baseline.current = formSnapshot(ref.current); }, []);
  async function perform(action) {
    if (inFlight.current || pending) return;
    inFlight.current = true;
    setBusy(true); context?.setSaving(true); onBusyChange?.(true); setError('');
    try { await action(); if (ref.current) baseline.current = formSnapshot(ref.current); context?.setDirty(false); }
    catch (err) { setError(err.message); }
    finally { inFlight.current = false; setBusy(false); context?.setSaving(false); onBusyChange?.(false); }
  }
  return <form ref={ref} onChangeCapture={() => { if (trackDirty) context?.setDirty(formSnapshot(ref.current) !== baseline.current); }}
    onSubmit={e => { e.preventDefault(); perform(save); }}>
    <fieldset className="form-fields" disabled={busy || pending}>{children}
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="form-actions">
        {React.isValidElement(extra) ? React.cloneElement(extra, { onClick: event => perform(() => extra.props.onClick?.(event)) }) : extra}
        <button type="button" onClick={context?.requestClose || close}>{t('Cancel')}</button>
        <button type="submit" className="primary">{busy ? t('Saving…') : t(label)}</button>
      </div>
    </fieldset>
  </form>;
}
