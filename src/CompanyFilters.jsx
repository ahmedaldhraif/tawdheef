import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X } from 'lucide-react';
import { COMPANY_TYPES } from './company-types.js';
import './company-filters.css';

function FilterPopover({ label, name, count, children, onClose, firstFocus }) {
  const id = useId(), trigger = useRef(null), panel = useRef(null), opened = useRef(false);
  const [open, setOpen] = useState(false);
  function position() {
    if (!panel.current || !opened.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const width = panel.current.getBoundingClientRect().width;
    const left = getComputedStyle(trigger.current).direction === 'rtl' ? anchor.right - width : anchor.left;
    panel.current.style.left = `${Math.max(12, Math.min(left, innerWidth - width - 12))}px`;
    panel.current.style.top = `${Math.max(12, Math.min(anchor.bottom + 6, innerHeight - 220))}px`;
    panel.current.style.maxHeight = `${Math.max(180, innerHeight - parseFloat(panel.current.style.top) - 12)}px`;
  }
  function close(restore = false) {
    if (panel.current?.matches(':popover-open')) panel.current.hidePopover();
    opened.current = false; setOpen(false); onClose?.();
    if (restore) trigger.current?.focus();
  }
  function show() {
    panel.current.showPopover(); opened.current = true; setOpen(true); position();
    (panel.current.querySelector(firstFocus || 'input,button') || panel.current)?.focus();
  }
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', position); window.addEventListener('scroll', position, true);
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [open]);
  useEffect(() => () => onClose?.(), []);
  return <>
    <button ref={trigger} id={`${id}-trigger`} type="button" className="company-filter-trigger" aria-label={name} aria-controls={`${id}-panel`} aria-expanded={open} onClick={() => opened.current ? close(true) : show()} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); show(); } }}>
      {label}{count > 0 && <span className="company-filter-count">{count}</span>}<ChevronDown size={14} aria-hidden="true" />
    </button>
    {createPortal(<div ref={panel} id={`${id}-panel`} popover="auto" role="group" tabIndex={-1} aria-label={label} className="company-filter-panel" onToggle={event => {
      const isOpen = (event.newState || event.nativeEvent?.newState) === 'open';
      opened.current = isOpen; setOpen(isOpen); if (!isOpen) onClose?.();
    }} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
      if (event.key === 'Tab') {
        const controls = [...panel.current.querySelectorAll('input:not([disabled]),button:not([disabled])')].filter(element => element.getClientRects().length);
        if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); close(true); }
        else if (!event.shiftKey && document.activeElement === controls.at(-1)) {
          event.preventDefault(); close(true);
          const outside = [...document.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href]')].filter(element => !panel.current.contains(element) && element.getClientRects().length && element.tabIndex >= 0);
          outside[outside.indexOf(trigger.current) + 1]?.focus();
        }
      }
    }}>
      {children(() => close(true))}
    </div>, document.body)}
  </>;
}

export default function CompanyFilters({ directory, facets, companyTypes = [], locations = [], onCompanyTypesChange, onLocationsChange, onPendingChange, t = value => value, pending = false }) {
  const [search, setSearch] = useState('');
  const locationOptions = facets?.locations || [];
  const displayed = locationOptions.filter(item => item.label.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a, b) => a.id === 'unknown' ? 1 : b.id === 'unknown' ? -1 : b.count - a.count || a.label.localeCompare(b.label));
  const selectedLocations = locations.map(id => locationOptions.find(item => item.id === id) || { id, label: id === 'unknown' ? 'Unknown location' : id.replace(/^location:/, '') });
  const selectedTypes = COMPANY_TYPES.filter(type => companyTypes.includes(type.id));
  function clearSearch() { setSearch(''); onPendingChange?.(false); }
  useEffect(() => { clearSearch(); }, [directory?.id]);
  function chooseLocation(id, checked) {
    onLocationsChange((checked ? [...locations, id] : locations.filter(value => value !== id)).sort());
    clearSearch();
  }
  return <div className="company-filters" aria-label="Company filters" aria-busy={pending}>
    <div className="company-filter-controls">
      <FilterPopover label={t('City')} name={t('Filter by city')} count={locations.length} firstFocus="input[type=search]" onClose={clearSearch}>
        {close => <>
          <label className="company-filter-search">{t('Search cities')}<input type="search" placeholder={`Search cities in ${directory?.name || 'this directory'}`} value={search} onChange={event => { setSearch(event.target.value); onPendingChange?.(Boolean(event.target.value.trim())); }} /></label>
          <p className="company-filter-hint">{search.trim() ? 'Choose a location below to filter the list.' : locations.length ? 'You can choose more than one.' : `Any location in ${directory?.name || 'this directory'}.`}</p>
          <div className="company-filter-options">
            {displayed.map(item => <label className="company-filter-option" key={item.id}><input type="checkbox" checked={locations.includes(item.id)} onChange={event => chooseLocation(item.id, event.target.checked)} /><span>{item.label}</span></label>)}
            {!locationOptions.length && <p className="company-filter-hint">{pending ? 'Loading locations…' : 'No recorded locations.'}</p>}
            {locationOptions.length > 0 && !displayed.length && <p className="company-filter-hint">No locations match. Try another search.</p>}
          </div>
          <div className="company-filter-actions"><button type="button" disabled={!locations.length && !search} onClick={() => { onLocationsChange([]); clearSearch(); }}>Any city</button><button type="button" onClick={close}>Done</button></div>
        </>}
      </FilterPopover>
      <FilterPopover label={t('Company type')} name={t('Filter by company type')} count={companyTypes.length}>
        {close => <>
          <p className="company-filter-hint">{companyTypes.length ? 'Include any of the selected types.' : 'All company types. Choose any to narrow the list.'}</p>
          <div className="company-filter-options">
            {COMPANY_TYPES.map(type => <label className="company-filter-option" key={type.id}><input type="checkbox" checked={companyTypes.includes(type.id)} onChange={event => onCompanyTypesChange(COMPANY_TYPES.filter(item => (event.target.checked ? [...companyTypes, type.id] : companyTypes.filter(id => id !== type.id)).includes(item.id)).map(item => item.id))} /><span>{t(type.label)}</span></label>)}
          </div>
          <div className="company-filter-actions"><button type="button" disabled={!companyTypes.length} onClick={() => onCompanyTypesChange([])}>All types</button><button type="button" onClick={close}>Done</button></div>
        </>}
      </FilterPopover>
    </div>
    {(selectedLocations.length > 0 || selectedTypes.length > 0) && <div className="company-filter-chips" aria-label="Active filters">
      {selectedLocations.map(item => <button type="button" key={item.id} aria-label={`Remove city filter ${item.label}`} onClick={() => onLocationsChange(locations.filter(id => id !== item.id))}>{item.label}<X size={12} aria-hidden="true" /></button>)}
      {selectedTypes.map(item => <button type="button" key={item.id} aria-label={`Remove company type filter ${item.label}`} onClick={() => onCompanyTypesChange(companyTypes.filter(id => id !== item.id))}>{t(item.label)}<X size={12} aria-hidden="true" /></button>)}
    </div>}
  </div>;
}
