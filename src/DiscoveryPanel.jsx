import React, { useEffect, useRef, useState } from 'react';
import { Modal } from './SharedUI.jsx';
import './discovery-panel.css';

export const DISCOVERY_AR = {
  'Jobs & updates': 'الوظائف والتحديثات', 'Review jobs': 'مراجعة الوظائف',
  'Loading jobs…': 'جارٍ تحميل الوظائف…', 'Loading job details…': 'جارٍ تحميل تفاصيل الوظيفة…',
  'Loading job updates…': 'جارٍ تحميل تحديثات الوظائف…', 'To review': 'للمراجعة',
  'Suitable': 'مناسبة', 'Needs review': 'تحتاج إلى مراجعة', 'Not suitable': 'غير مناسبة',
  'Details needed': 'التفاصيل مطلوبة', 'CV not reported': 'لم تُسجّل السيرة الذاتية',
  'No jobs to review yet.': 'لا توجد وظائف للمراجعة بعد.', 'No jobs in this view.': 'لا توجد وظائف في هذا العرض.',
  'Ask your assistant to check the saved sources.': 'اطلب من مساعدك التحقق من المصادر المحفوظة.',
  'Copy review request': 'نسخ طلب المراجعة', 'Review request copied': 'تم نسخ طلب المراجعة',
  'Copy this request into your assistant.': 'انسخ هذا الطلب إلى مساعدك.',
  'Review request': 'طلب المراجعة', 'Read-only review. This does not start applications.': 'مراجعة للقراءة فقط. لا تبدأ تقديم طلبات توظيف.',
  'Open posting': 'فتح إعلان الوظيفة', 'Back to jobs': 'العودة إلى الوظائف',
  'Client assessment': 'تقييم المساعد', 'Previous client assessment': 'تقييم سابق للمساعد',
  'No current CV-backed assessment.': 'لا يوجد تقييم حالي يستند إلى السيرة الذاتية.',
  'Assessment evidence': 'أدلة التقييم', 'Client reported': 'أبلغ عنه المساعد',
  'CV version': 'إصدار السيرة الذاتية', 'Posting details': 'تفاصيل الإعلان',
  'Changed fields': 'الحقول المتغيرة', 'Last seen': 'آخر ظهور', 'Last complete check': 'آخر تحقق مكتمل',
  'Source needs attention': 'المصدر يحتاج إلى انتباه', 'Previous jobs are kept when a source cannot be checked.': 'تُحفظ الوظائف السابقة عندما يتعذر التحقق من المصدر.',
  'Restart Tawdheef to load job discovery, then try again.': 'أعد تشغيل توظيف لتحميل اكتشاف الوظائف، ثم حاول مجددًا.',
  'Job updates could not load.': 'تعذر تحميل تحديثات الوظائف.', 'Jobs could not load.': 'تعذر تحميل الوظائف.',
  'Job details could not load.': 'تعذر تحميل تفاصيل الوظيفة.', 'Last job check': 'آخر تحقق من الوظائف',
  'New': 'جديدة', 'Changed': 'متغيرة', 'Job preferences': 'تفضيلات الوظائف',
  'Roles': 'المسميات الوظيفية', 'Job locations': 'مواقع الوظائف', 'Job notes': 'ملاحظات الوظائف',
  'Separate roles or locations with commas or new lines.': 'افصل المسميات أو المواقع بفواصل أو أسطر جديدة.',
  'Your assistant uses these preferences with your actual CV.': 'يستخدم مساعدك هذه التفضيلات مع سيرتك الذاتية الفعلية.',
  'Loading job preferences…': 'جارٍ تحميل تفضيلات الوظائف…',
  'Job preferences could not load.': 'تعذر تحميل تفضيلات الوظائف.',
  'CV source': 'مصدر السيرة الذاتية', 'Required': 'مطلوب', 'Preferred': 'مفضّل',
  'Supports': 'يدعمه', 'Contradicts': 'يتعارض معه', 'Unknown': 'غير معروف',
  'CV fact reference': 'مرجع المعلومة في السيرة الذاتية', 'Source evidence': 'أدلة المصدر',
  'Start from first page': 'العودة إلى الصفحة الأولى', 'jobs': 'وظائف',
  'Jobs': 'الوظائف', 'View': 'العرض', 'Back to company': 'العودة إلى الشركة',
  'Open source': 'فتح المصدر', 'Preparing…': 'جارٍ التحضير…', 'Untitled': 'بلا عنوان',
  'Preferences changed elsewhere. Your draft is kept. Reopen Settings to compare before saving.': 'تغيّرت التفضيلات في مكان آخر. حُفظت مسودتك. أعد فتح الإعدادات للمقارنة قبل الحفظ.',
};

export async function discoveryApi(path, method = 'GET', body) {
  const response = await fetch(`/api/discovery${path}`, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let value;
  try { value = await response.json(); } catch { value = null; }
  if (!response.ok) {
    const missingRoute = response.status === 404 && (!value?.error || value.error === 'This action was not found.');
    const error = new Error(missingRoute ? 'Restart Tawdheef to load job discovery, then try again.' : value?.error || 'This action could not finish.');
    error.status = response.status;
    throw error;
  }
  return value;
}
const validUrl = value => { try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; } };
const dateLabel = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : null;
const currentAssessment = item => item.matchState === 'current' && item.assessment?.isCurrent === true;
const stateLabel = item => item.matchState === 'closed' ? 'Closed' : item.matchState === 'cv_unknown' ? 'CV not reported' : item.matchState === 'needs_detail' ? 'Details needed' : item.matchState === 'needs_you' ? 'Needs you' : currentAssessment(item) ? item.assessment.decision === 'suitable' ? 'Suitable' : item.assessment.decision === 'not_suitable' ? 'Not suitable' : 'To review' : item.assessment ? 'Needs review' : 'To review';
const fieldLabels = { new: 'New', listing: 'Posting details', title: 'Title', description: 'Description', requirements: 'Requirements', locations: 'Locations', url: 'URL', status: 'Status' };

function CopyReview({ directoryId, companyId, jobId, assistant, t }) {
  const [busy, setBusy] = useState(false), [copied, setCopied] = useState(false), [fallback, setFallback] = useState(''), [error, setError] = useState('');
  const active = useRef(true);
  const scope = JSON.stringify([directoryId, companyId, jobId, assistant]), currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => () => { active.current = false; }, []);
  useEffect(() => { setCopied(false); setFallback(''); setError(''); setBusy(false); }, [scope]);
  async function copy() {
    const requestedScope = scope;
    const current = () => active.current && currentScope.current === requestedScope;
    setBusy(true); setError('');
    try {
      const query = new URLSearchParams({ directoryId, assistant: assistant || 'codex', ...(companyId ? { companyId } : {}), ...(jobId ? { jobId } : {}) });
      const result = await discoveryApi(`/request?${query}`);
      if (!current()) return;
      if (!result?.prompt || result.readOnly !== true || result.actionsAuthorized !== false) throw new Error('This action could not finish.');
      try { await navigator.clipboard.writeText(result.prompt); if (current()) setCopied(true); }
      catch { if (current()) setFallback(result.prompt); }
    } catch (error) { if (current()) setError(error.message); }
    finally { if (current()) setBusy(false); }
  }
  return <div className="discovery-copy">
    <button type="button" disabled={busy} onClick={copy}>{t(busy ? 'Preparing…' : copied ? 'Review request copied' : 'Copy review request')}</button>
    <span className="field-hint">{assistant === 'claude-code' ? 'Claude Code' : 'Codex'} · {t('Read-only review. This does not start applications.')}</span>
    {error && <p role="alert" className="form-error">{t(error)}</p>}
    {fallback && <label>{t('Copy this request into your assistant.')}<textarea aria-label={t('Review request')} readOnly value={fallback} onFocus={event => event.target.select()} /></label>}
  </div>;
}

function InlineReview({ title, close, children, t }) {
  return <section className="discovery-inline" aria-label={title}><h3>{title}</h3><button type="button" onClick={close}>{t('Back to company')}</button>{children}</section>;
}

export default function DiscoveryPanel({ directoryId, directoryName, companyId, revision, assistant, inline = false, t = value => value }) {
  const scope = JSON.stringify([directoryId, companyId || '', assistant || 'codex']);
  const [summary, setSummary] = useState(null), [summaryError, setSummaryError] = useState(''), [retry, setRetry] = useState(0);
  const [selection, setSelection] = useState(null), [view, setView] = useState('pending'), [cursors, setCursors] = useState(['']);
  const [list, setList] = useState(null), [listError, setListError] = useState(''), [listBusy, setListBusy] = useState(false);
  const [jobId, setJobId] = useState(null), [detail, setDetail] = useState(null), [detailError, setDetailError] = useState('');
  const jobList = useRef(null), focusPage = useRef(false), reviewTrigger = useRef(null), backToList = useRef(null);
  const Surface = inline ? InlineReview : Modal;
  const [visible, setVisible] = useState(!document.hidden), [wake, setWake] = useState(0);
  useEffect(() => {
    const changed = () => { setVisible(!document.hidden); if (!document.hidden) setWake(value => value + 1); };
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);
  const open = selection === scope, cursor = cursors.at(-1);
  const listKey = JSON.stringify([scope, view, cursor]);
  const listData = list?.key === listKey ? list.value : null;
  const detailData = detail?.key === `${scope}:${jobId}` ? detail.value : null;
  const currentSummary = summary?.scope === scope ? summary.value : null;
  useEffect(() => { if (!jobId && listData && !listBusy && focusPage.current) { focusPage.current = false; jobList.current?.focus(); } }, [listData, listBusy, jobId]);
  useEffect(() => { if (open && jobId) backToList.current?.focus(); }, [open, jobId]);
  useEffect(() => {
    let active = true;
    async function load() {
      if (document.hidden) return;
      try {
        const query = new URLSearchParams({ directoryId, assistant: assistant || 'codex', ...(companyId ? { companyIds: JSON.stringify([companyId]) } : {}) });
        const value = await discoveryApi(`/summary?${query}`);
        if (active) { setSummary({ scope, value }); setSummaryError(''); }
      } catch (error) { if (active) setSummaryError(error.message); }
    }
    load();
    return () => { active = false; };
  }, [scope, revision, retry, visible, wake]);
  useEffect(() => {
    if (!open || !visible) return;
    let active = true;
    setListBusy(true); setListError('');
    const query = new URLSearchParams({ directoryId, assistant: assistant || 'codex', review: view, limit: '20', ...(cursor ? { cursor } : {}), ...(companyId ? { companyIds: JSON.stringify([companyId]) } : {}) });
    discoveryApi(`/jobs?${query}`).then(value => { if (active) setList({ key: listKey, value }); }).catch(error => { if (active) setListError(error.message); }).finally(() => { if (active) setListBusy(false); });
    return () => { active = false; };
  }, [open, listKey, revision, retry, visible, wake]);
  useEffect(() => {
    if (!open || !jobId || !visible) return;
    let active = true;
    setDetailError('');
    const query = new URLSearchParams({ directoryId, assistant: assistant || 'codex', ...(companyId ? { companyIds: JSON.stringify([companyId]) } : {}) });
    discoveryApi(`/jobs/${encodeURIComponent(jobId)}?${query}`).then(value => { if (active) setDetail({ key: `${scope}:${jobId}`, value }); }).catch(error => { if (active) setDetailError(error.message); });
    return () => { active = false; };
  }, [open, scope, jobId, revision, retry, visible, wake]);
  function close() { setSelection(null); setJobId(null); if (inline) reviewTrigger.current?.focus(); }
  function openJobs() { setView('pending'); setCursors(['']); setJobId(null); setSelection(scope); }
  const problems = listData?.sourceProblems || currentSummary?.sourceProblems || [];
  return <>
    <details className="discovery-panel">
      <summary><span>{t('Jobs & updates')}</span>{currentSummary && <span className="discovery-counts">{t('New')} {currentSummary.new} · {t('Changed')} {currentSummary.changed} · {t('To review')} {currentSummary.pending}</span>}</summary>
      <div className="discovery-overview">
        {!currentSummary && !summaryError && <p className="field-hint" role="status">{t('Loading job updates…')}</p>}
        {summaryError && <div role="alert"><p className="form-error">{t(summaryError)}</p><button type="button" onClick={() => setRetry(value => value + 1)}>{t('Retry')}</button></div>}
        {currentSummary?.nextStep && <p className="discovery-needs"><strong>{t('Needs you')}: </strong>{currentSummary.nextStep}</p>}
        {dateLabel(currentSummary?.lastCheckAt) && <p className="field-hint">{t('Last job check')}: <time dateTime={currentSummary.lastCheckAt}>{dateLabel(currentSummary.lastCheckAt)}</time></p>}
        <button ref={reviewTrigger} type="button" onClick={event => { event.currentTarget.focus(); openJobs(); }}>{t('Review jobs')}</button>
        <CopyReview key={scope + assistant} directoryId={directoryId} companyId={companyId} assistant={assistant} t={t} />
      </div>
    </details>
    {open && <Surface title={jobId ? detailData?.job?.title || t('Posting details') : `${t('Jobs & updates')} · ${directoryName || ''}`} close={close} t={t} wide>
      {jobId ? <>
        <button ref={backToList} type="button" onClick={() => { focusPage.current = true; setJobId(null); }}>{t('Back to jobs')}</button>
        {detailError ? <p className="form-error" role="alert">{t(detailError)}</p> : !detailData ? <p role="status">{t('Loading job details…')}</p> : <JobDetail value={detailData} t={t} />}
        {detailError && <button type="button" onClick={() => setRetry(value => value + 1)}>{t('Retry')}</button>}
        <CopyReview key={scope + jobId + assistant} directoryId={directoryId} companyId={companyId} jobId={jobId} assistant={assistant} t={t} />
      </> : <>
        <label className="discovery-view">{t('View')}<select value={view} onChange={event => { setView(event.target.value); setCursors(['']); }}><option value="pending">{t('To review')}</option><option value="needs_you">{t('Needs you')}</option><option value="all">{t('All')}</option></select></label>
        {listBusy && <p role="status" className="field-hint">{t('Loading jobs…')}</p>}
        {listError && <div role="alert"><p className="form-error">{t(listError)}</p><button type="button" onClick={() => { setCursors(['']); setRetry(value => value + 1); }}>{t(cursors.length > 1 ? 'Start from first page' : 'Retry')}</button></div>}
        {listData && <>
          {!listData.items?.length && !listBusy && <p>{t(view === 'pending' ? 'No jobs to review yet.' : 'No jobs in this view.')} {t('Ask your assistant to check the saved sources.')}</p>}
          <ul className="discovery-jobs" aria-label={t('Jobs')} tabIndex={-1} ref={jobList}>{(listData.items || []).map(item => <li key={item.id}>
            <div className="discovery-job-heading"><button type="button" className="text-button" onClick={() => setJobId(item.id)}>{item.title || t('Untitled')}</button><span className="discovery-state">{t(stateLabel(item))}</span></div>
            <p className="field-hint">{(item.companyNames || []).join(', ')}{item.locations?.length ? ` · ${item.locations.join(', ')}` : ''}</p>
            {item.assessment?.reason && <p><span className="field-hint">{t(currentAssessment(item) ? 'Client assessment' : 'Previous client assessment')}: </span>{item.assessment.reason}</p>}
            {!item.assessment && <p className="field-hint">{t('No current CV-backed assessment.')}</p>}
            {item.changedFields?.length > 0 && <p className="field-hint">{t('Changed fields')}: {item.changedFields.map(field => t(fieldLabels[field] || field)).join(', ')}</p>}
            {dateLabel(item.lastSeenAt) && <p className="field-hint">{t('Last seen')}: <time dateTime={item.lastSeenAt}>{dateLabel(item.lastSeenAt)}</time></p>}
          </li>)}</ul>
          <div className="discovery-pagination"><span>{listData.total} {t('jobs')}</span><button type="button" disabled={listBusy || cursors.length < 2} onClick={() => { focusPage.current = true; setCursors(value => value.slice(0, -1)); }}>{t('Previous')}</button><button type="button" disabled={listBusy || !listData.nextCursor} onClick={() => { focusPage.current = true; setCursors(value => [...value, listData.nextCursor]); }}>{t('Next')}</button></div>
        </>}
        {problems.length > 0 && <section className="discovery-source-problems"><h3>{t('Source needs attention')}</h3><p className="field-hint">{t('Previous jobs are kept when a source cannot be checked.')}</p><ul>{problems.map((problem, index) => <li key={`${problem.companyId}:${index}`}><strong>{problem.companyName}</strong><p>{problem.nextStep || t('Needs you')}</p>{validUrl(problem.sourceUrl) && <a href={validUrl(problem.sourceUrl)} target="_blank" rel="noreferrer">{t('Open source')}</a>}{dateLabel(problem.observedAt) && <time dateTime={problem.observedAt}>{dateLabel(problem.observedAt)}</time>}</li>)}</ul></section>}
        <CopyReview key={scope + assistant} directoryId={directoryId} companyId={companyId} assistant={assistant} t={t} />
      </>}
    </Surface>}
  </>;
}

function JobDetail({ value, t }) {
  const { job, assessment, matchState, changedFields, nextStep, cv } = value;
  const current = currentAssessment({ matchState, assessment });
  const citations = Array.isArray(assessment?.citations) ? assessment.citations : [];
  return <article className="discovery-job-detail">
    <p className="field-hint">{(job.companyNames || []).join(', ')}{job.locations?.length ? ` · ${job.locations.join(', ')}` : ''}</p>
    <p><strong>{t(stateLabel({ matchState, assessment }))}</strong></p>
    {assessment?.reason ? <section><h3>{t(current ? 'Client assessment' : 'Previous client assessment')}</h3><p>{assessment.reason}</p></section> : <p>{t('No current CV-backed assessment.')}</p>}
    {nextStep && <p className="discovery-needs"><strong>{t('Next action')}: </strong>{nextStep}</p>}
    {changedFields?.length > 0 && <p>{t('Changed fields')}: {changedFields.map(field => t(fieldLabels[field] || field)).join(', ')}</p>}
    {validUrl(job.url) && <a href={validUrl(job.url)} target="_blank" rel="noreferrer">{t('Open posting')}</a>}
    <dl className="discovery-dates">{[['Last seen', job.lastSeenAt], ['Last complete check', job.lastCompleteAt]].map(([label, date]) => dateLabel(date) && <React.Fragment key={label}><dt>{t(label)}</dt><dd><time dateTime={date}>{dateLabel(date)}</time></dd></React.Fragment>)}</dl>
    {assessment && <details><summary>{t('Assessment evidence')}</summary><p>{t('Client reported')} · {assessment.assistant === 'claude-code' ? 'Claude Code' : 'Codex'}{dateLabel(assessment.assessedAt) ? ` · ${dateLabel(assessment.assessedAt)}` : ''}</p>{assessment.cvReference?.sourceId && <p className="field-hint">{t('CV source')}: {assessment.cvReference.sourceId}</p>}{assessment.cvReference?.versionHash && <p className="field-hint">{t('CV version')}: <code>{assessment.cvReference.versionHash}</code></p>}
      {(assessment.requirements || []).length > 0 && <ul className="discovery-requirements">{assessment.requirements.map((requirement, index) => <li key={index}><p><strong>{t(requirement.kind === 'required' ? 'Required' : 'Preferred')}: </strong>{requirement.jobQuote}</p><p className="field-hint">{t(requirement.relation === 'supports' ? 'Supports' : requirement.relation === 'contradicts' ? 'Contradicts' : 'Unknown')}{requirement.cvFactRef ? ` · ${t('CV fact reference')}: ${requirement.cvFactRef}` : ''}</p>{requirement.reason && <p>{requirement.reason}</p>}</li>)}</ul>}
      {citations.length > 0 && <ul>{citations.map((citation, index) => { const href = validUrl(typeof citation === 'string' ? citation : citation.url); return href ? <li key={index}><a href={href} target="_blank" rel="noreferrer">{typeof citation === 'object' && citation.title || href}</a></li> : null; })}</ul>}</details>}
    {job.evidence && <details><summary>{t('Source evidence')}</summary><p>{job.evidence}</p></details>}
    {(job.description || job.requirements) && <details><summary>{t('Posting details')}</summary>{job.description && <p className="discovery-description">{job.description}</p>}{job.requirements && <p className="discovery-description">{Array.isArray(job.requirements) ? job.requirements.join('\n') : job.requirements}</p>}</details>}
  </article>;
}
