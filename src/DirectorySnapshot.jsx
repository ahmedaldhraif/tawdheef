import React, { useEffect, useRef, useState } from 'react';
import './directory-snapshot.css';

const METRICS = [
  { key: 'applications', label: 'Applications sent', description: 'Confirmed job applications.', empty: 'No confirmed applications for this period.' },
  { key: 'profiles', label: 'Profiles created', description: 'Companies with a completed career profile. An account alone does not count.', empty: 'No completed career profiles for this period.' },
  { key: 'emails', label: 'Emails sent', description: 'Confirmed application and CV emails. An emailed application also appears under Applications sent.', empty: 'No confirmed emails for this period.' },
];
const PAGE_SIZE = 20;
const receiptNote = 'Some earlier emails have no saved receipt and aren’t included.';

function validResponse(value, directoryId, period, metric = null, offset = 0) {
  return value?.directoryId === directoryId && value.period === period &&
    (value.metric ?? null) === metric &&
    METRICS.every(({ key }) => Number.isSafeInteger(value.counts?.[key]) && value.counts[key] >= 0) &&
    (!metric || (Array.isArray(value.items) && Number.isSafeInteger(value.total) && value.total >= 0 && value.offset === offset && value.limit === PAGE_SIZE));
}

function dateLabel(value, locale, timeZone, detailed = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', ...(detailed ? { timeStyle: 'short' } : {}), ...(timeZone ? { timeZone } : {}) }).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));
  }
}

/** A directory-wide view of confirmed outcomes, independent of table filters. */
export default function DirectorySnapshot({ directoryId, directoryName, revision, api, Dialog, onOpenCompany, t = value => value, timeZone, locale = 'en' }) {
  const [period, setPeriod] = useState('all_time');
  const [retry, setRetry] = useState(0);
  const [summary, setSummary] = useState({ scope: '', data: null, loading: true, error: false });
  const [selection, setSelection] = useState(null);
  const [records, setRecords] = useState({ key: '', data: null, loading: false, error: false });
  const [recordsRetry, setRecordsRetry] = useState(0);
  const list = useRef(null), focusRecords = useRef(false);
  const scope = JSON.stringify([directoryId, period, timeZone]);
  const detail = selection?.scope === scope ? selection : null;
  const recordKey = detail ? JSON.stringify([scope, detail.metric, detail.offset]) : '';
  const summaryCurrent = summary.scope === scope;
  const summaryData = summaryCurrent && !summary.error ? summary.data : null;
  const recordData = records.key === recordKey && !records.error ? records.data : null;
  const recordsLoading = !recordData || records.loading;
  const metric = METRICS.find(item => item.key === detail?.metric);
  const periodLabel = t(period === 'this_week' ? 'This week' : 'All time');
  const number = value => new Intl.NumberFormat(locale).format(value);

  useEffect(() => { setSelection(null); focusRecords.current = false; }, [scope]);

  useEffect(() => {
    if (!directoryId) return;
    let active = true;
    setSummary(previous => ({ scope, data: previous.scope === scope ? previous.data : null, loading: true, error: false }));
    const query = new URLSearchParams({ directoryId, period });
    api(`/snapshot?${query}`).then(data => {
      if (!active) return;
      if (!validResponse(data, directoryId, period)) throw new Error('Snapshot scope changed.');
      setSummary({ scope, data, loading: false, error: false });
    }).catch(() => {
      if (active) setSummary({ scope, data: null, loading: false, error: true });
    });
    return () => { active = false; };
  }, [directoryId, period, timeZone, revision, retry, api]);

  useEffect(() => {
    if (!detail) return;
    let active = true;
    setRecords(previous => ({ key: recordKey, data: previous.key === recordKey ? previous.data : null, loading: true, error: false }));
    const query = new URLSearchParams({ directoryId, period, metric: detail.metric, offset: String(detail.offset), limit: String(PAGE_SIZE) });
    api(`/snapshot?${query}`).then(data => {
      if (!active) return;
      if (!validResponse(data, directoryId, period, detail.metric, detail.offset)) throw new Error('Snapshot scope changed.');
      if (data.total > 0 && detail.offset >= data.total) {
        setSelection(previous => previous?.scope === scope && previous.metric === detail.metric ? { ...previous, offset: Math.floor((data.total - 1) / PAGE_SIZE) * PAGE_SIZE } : previous);
        return;
      }
      if (!data.total && detail.offset > 0) {
        setSelection(previous => previous?.scope === scope && previous.metric === detail.metric ? { ...previous, offset: 0 } : previous);
        return;
      }
      setRecords({ key: recordKey, data, loading: false, error: false });
    }).catch(() => {
      if (active) setRecords({ key: recordKey, data: null, loading: false, error: true });
    });
    return () => { active = false; };
  }, [directoryId, period, timeZone, recordKey, revision, recordsRetry, api]);

  useEffect(() => {
    if (recordData && !records.loading && focusRecords.current) {
      focusRecords.current = false;
      list.current?.focus();
    }
  }, [recordData, records.loading]);

  function openMetric(key) {
    focusRecords.current = false;
    setSelection({ scope, metric: key, offset: 0 });
  }
  function movePage(offset) {
    focusRecords.current = true;
    setSelection(previous => ({ ...previous, offset }));
  }
  function openCompany(companyId) {
    setSelection(null);
    onOpenCompany(companyId);
  }

  if (!directoryId) return null;
  return <>
    <section className="directory-snapshot" aria-label={t('Directory snapshot')} aria-busy={!summaryCurrent || summary.loading}>
      <div className="snapshot-totals">
        {METRICS.map(item => {
          const count = summaryData?.counts[item.key];
          const missingReceipts = item.key === 'emails' && summaryData?.unverifiedEmails > 0;
          const description = item.key === 'emails' ? `${t('Confirmed email receipts')}${missingReceipts ? `. ${t(receiptNote)}` : ''}` : t(item.description);
          return <button key={item.key} type="button" className="snapshot-total" disabled={!summaryData} onClick={() => openMetric(item.key)}
            aria-label={`${t(item.label)}: ${count == null ? t(summaryCurrent && summary.error ? 'Unavailable' : 'Loading') : number(count)}`}
            aria-description={description} title={description}>
            <strong aria-hidden="true">{count == null ? '—' : number(count)}{missingReceipts && <sup className="snapshot-count-note">*</sup>}</strong>
            <span>{t(item.label)}</span>
          </button>;
        })}
      </div>
      <div className="snapshot-scope">
        <p><span className="sr-only"><span dir="auto">{directoryName}</span> · </span>{t('All companies')}</p>
        <select aria-label={t('Snapshot period')} value={period} onChange={event => { setSelection(null); setPeriod(event.target.value); }}>
          <option value="all_time">{t('All time')}</option>
          <option value="this_week">{t('This week')}</option>
        </select>
      </div>
      {summaryCurrent && summary.error && <p className="snapshot-error" role="alert">{t('Couldn’t load totals.')} <button type="button" onClick={() => setRetry(value => value + 1)}>{t('Retry')}</button></p>}
    </section>
    {detail && metric && <Dialog title={t(metric.label)} close={() => setSelection(null)} t={t} footer={recordData?.total > PAGE_SIZE && <div className="snapshot-pagination">
      <span aria-live="polite">{number(detail.offset + 1)}–{number(Math.min(detail.offset + PAGE_SIZE, recordData.total))} {t('of')} {number(recordData.total)}</span>
      <div><button type="button" aria-label={t('Previous records')} disabled={recordsLoading || detail.offset === 0} onClick={() => movePage(Math.max(0, detail.offset - PAGE_SIZE))}>{t('Previous')}</button>
        <button type="button" aria-label={t('Next records')} disabled={recordsLoading || detail.offset + PAGE_SIZE >= recordData.total} onClick={() => movePage(detail.offset + PAGE_SIZE)}>{t('Next')}</button></div>
    </div>}>
      <div className="snapshot-detail">
        <p className="snapshot-detail-scope"><span dir="auto">{directoryName}</span> · {t('All companies')} · {periodLabel}</p>
        <p className="snapshot-description">{t(metric.description)}</p>
        {detail.metric === 'emails' && (recordData?.unverifiedEmails ?? summaryData?.unverifiedEmails) > 0 && <p className="snapshot-receipt-note">* {t(receiptNote)}</p>}
        {records.key === recordKey && records.error ? <p className="snapshot-error" role="alert">{t('Couldn’t load records.')} <button type="button" onClick={() => setRecordsRetry(value => value + 1)}>{t('Retry')}</button></p>
          : !recordData ? <p className="snapshot-empty" role="status">{t('Loading records…')}</p>
            : <ul className="snapshot-records" aria-label={t('Snapshot records')} aria-busy={records.loading} tabIndex={-1} ref={list}>
              {recordData.items.length ? recordData.items.map(item => <li key={item.id}>
                <button type="button" className="snapshot-company" onClick={() => openCompany(item.companyId)}><span dir="auto">{item.companyName}</span></button>
                <time dateTime={item.at} title={dateLabel(item.at, locale, recordData.timeZone, true)}>{dateLabel(item.at, locale, recordData.timeZone)}</time>
                {(item.role || item.recipient) && <p dir="auto">{[item.role, item.recipient].filter(Boolean).join(' · ')}</p>}
              </li>) : <li className="snapshot-empty">{t(metric.empty)}</li>}
            </ul>}
      </div>
    </Dialog>}
  </>;
}
