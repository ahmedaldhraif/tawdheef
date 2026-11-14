import React, { useEffect, useRef, useState } from 'react';
import { Download, FileText, RefreshCw, Upload } from 'lucide-react';
import Flag from './Flag.jsx';
import './directory-packs.css';

const arabic = {
  'Directory packs': 'حزم الأدلة', 'Available': 'المتاحة', 'Installed': 'المضافة',
  'Loading directories…': 'جارٍ تحميل الأدلة…', 'Try again': 'حاول مجدداً',
  'Review': 'مراجعة', 'Update': 'تحديث', 'Details': 'التفاصيل', 'Back': 'رجوع',
  'Add directory': 'إضافة دليل', 'Update directory': 'تحديث الدليل', 'Cancel': 'إلغاء',
  'Created by': 'أنشأه', 'Maintained by': 'يشرف عليه', 'Version': 'الإصدار',
  'Source snapshot': 'تاريخ بيانات المصادر', 'Last updated': 'آخر تحديث',
  'Local preview': 'معاينة محلية', 'Published': 'منشور', 'Agent guide': 'دليل المساعد',
  'Community review not verified': 'لم تُتحقق مراجعة المجتمع',
  'Changes': 'التغييرات', 'Contributors': 'المساهمون', 'records': 'سجلاً',
  'Import a pack ZIP': 'استيراد حزمة ZIP', 'Create an empty directory': 'إنشاء دليل فارغ',
  'Remove from this directory': 'إزالة الحزمة من هذا الدليل', 'Remove pack?': 'إزالة الحزمة؟',
  'Your records and application history stay saved.': 'تبقى سجلاتك وتاريخ طلباتك محفوظة.',
  'Nothing installed in this directory yet.': 'لم تُضف حزمة إلى هذا الدليل بعد.',
  'Added': 'إضافات', 'Updated': 'تحديثات', 'Removed from pack': 'سجلات أُزيلت من الحزمة',
  'Keep your edits': 'تعديلاتك محفوظة', 'Shared organisations': 'جهات مشتركة',
  'Reviewing…': 'جارٍ المراجعة…', 'Saving…': 'جارٍ الحفظ…',
  'Choose a pack to review its sources and changes.': 'اختر حزمة لمراجعة مصادرها وتغييراتها.',
  'Importing does not start applications or monitoring.': 'إضافة الحزمة لا تبدأ التقديم أو المتابعة.',
  'No directories available. Import a reviewed pack ZIP or create your own directory.': 'لا توجد حزم متاحة. استورد حزمة ZIP بعد مراجعتها أو أنشئ دليلك الخاص.',
  'Suggest a directory': 'اقترح دليلاً', 'Contribution policy': 'سياسة المساهمة',
  'Before': 'قبل', 'After': 'بعد', 'Empty': 'فارغ', 'Current guide': 'الدليل الحالي',
  'New guide': 'الدليل الجديد', 'Your value will be kept': 'ستبقى قيمتك محفوظة',
  'Download published ZIP': 'تنزيل ZIP المنشور',
  'Import the downloaded ZIP to review its version.': 'استورد ملف ZIP الذي نزلته لمراجعة إصداره.',
  'Scanning does not establish that a pack is safe or that recruitment routes work. Installing never starts applications or schedules.': 'الفحص لا يثبت سلامة الحزمة أو عمل روابط التوظيف. إضافة الحزمة لا تبدأ التقديم أو الجداول.',
};
const fieldLabels = { name:'Name', arabicName:'Arabic name', type:'Type', sector:'Sector', location:'Location', website:'Website', careersUrl:'Careers page', applyUrl:'Application page', email:'Email', linkedinUrl:'LinkedIn', sourceRole:'Source role', routeStatus:'Route status', checkedAt:'Source checked' };

export default function DirectoryPacksDialog({ api, Modal, t, language = 'en', directory, close, installed, createEmpty }) {
  const l = value => language === 'ar' ? arabic[value] || t(value) : value;
  const [catalog, setCatalog] = useState(null), [preview, setPreview] = useState(null), [details, setDetails] = useState(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0), [removeId, setRemoveId] = useState(null);
  const request = useRef(0);
  useEffect(() => {
    const current = ++request.current;
    setError(''); setCatalog(null);
    api('/directory-packs').then(value => { if (current === request.current) setCatalog(value); }).catch(e => { if (current === request.current) setError(e.message); });
    return () => { request.current++; };
  }, [api, retry]);
  const local = (catalog?.installed || []).filter(item => !directory || item.directoryId === directory.id);
  async function review(input) {
    setBusy(true); setError(''); setDetails(null);
    try { setPreview(await api('/directory-packs/preview', 'POST', { ...input, ...(directory ? { directoryId: directory.id } : {}) })); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function inspect(pack) {
    setBusy(true); setError('');
    try { setDetails(await api('/directory-packs/' + encodeURIComponent(pack.id) + (directory ? '?directoryId=' + encodeURIComponent(directory.id) : ''))); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function importFile(event) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError('Choose a directory pack ZIP smaller than 20 MB.'); return; }
    setBusy(true); setError('');
    try {
      const bytes = new Uint8Array(await file.arrayBuffer()); let text = '';
      for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
      await review({ filename: file.name, content: btoa(text) });
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError('');
    try { const result = await api('/directory-packs/install', 'POST', { previewId: preview.previewId }); await installed(result); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError('');
    try { await api('/directory-packs/remove', 'POST', { id: removeId.id, directoryId: removeId.directoryId }); setRemoveId(null); setRetry(value => value + 1); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const pack = preview?.pack || details?.pack || details;
  const metadata = pack && <dl className="pack-metadata">
    {[[l('Version'), pack.version], [l('Created by'), pack.createdBy], [l('Maintained by'), pack.maintainers?.join(', ')], [l('Last updated'), pack.updatedAt], [l('Source snapshot'), pack.snapshotDate]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
  </dl>;
  const footer = <div className="career-dialog-footer"><div className="form-actions">
    {(preview || details || removeId) && <button type="button" disabled={busy} onClick={() => { setPreview(null); setDetails(null); setRemoveId(null); setError(''); }}>{l('Back')}</button>}
    <button type="button" disabled={busy} onClick={close}>{l('Cancel')}</button>
    {preview && <button type="button" className="primary" disabled={busy} onClick={save}><Download size={15}/>{l(busy ? 'Saving…' : preview.installed || preview.isUpdate ? 'Update directory' : 'Add directory')}</button>}
    {removeId && <button type="button" disabled={busy} onClick={remove}>{l('Remove from this directory')}</button>}
  </div></div>;
  return <Modal title={l(removeId ? 'Remove pack?' : 'Directory packs')} t={t} close={close} footer={footer} pending={busy}>
    {error && <p className="form-error" role="alert">{error} {!catalog && !busy && <button type="button" onClick={() => setRetry(value => value + 1)}>{l('Try again')}</button>}</p>}
    {removeId ? <p>{l('Your records and application history stay saved.')}</p> : preview ? <>
      <h3>{pack.name}</h3>{metadata}
      {pack.reviewStatus === 'local_unverified' && <p className="field-hint">{l('Community review not verified')}</p>}
      <dl className="pack-preview-counts">{[['Added','added'],['Updated','updated'],['Removed from pack','removed'],['Keep your edits','conflicts']].map(([label,key]) => <div key={key}><dt>{l(label)}</dt><dd>{preview.counts?.[key] ?? 0}</dd></div>)}</dl>
      {preview.duplicateMatches > 0 && <p>{l('Shared organisations')}: {preview.duplicateMatches}</p>}
      {(preview.warnings || []).map((warning, index) => <p className="notice" key={index}>{l(typeof warning === 'string' ? warning : warning.message)}</p>)}
      <p className="field-hint">{l('Your records and application history stay saved.')} {l('Importing does not start applications or monitoring.')}</p>
      {preview.changes?.length > 0 && <details><summary>{l('Changes')}</summary><ul className="pack-changes">{preview.changes.slice(0, 30).map((item,index) => <li key={index}><strong>{item.name || item.sourceId || item.id}</strong>{item.type === 'removed_from_pack' && <small>{l('Removed from pack')}</small>}{item.diffs?.length > 0 && <dl>{item.diffs.map(diff => <div key={diff.field}><dt>{l(fieldLabels[diff.field] || diff.field)}{diff.keptLocal && <small>{l('Your value will be kept')}</small>}</dt><dd><span>{l('Before')}: {diff.current || l('Empty')}</span><span>{l('After')}: {diff.proposed || l('Empty')}{diff.truncated ? '…' : ''}</span></dd></div>)}</dl>}</li>)}</ul></details>}
      {preview.guidance?.proposedText && <details><summary><FileText size={15}/> {l('Agent guide')}</summary>{preview.guidance.changed && preview.guidance.currentText && <><h4>{l('Current guide')}</h4><pre className="pack-guide">{preview.guidance.currentText}</pre><h4>{l('New guide')}</h4></>}<pre className="pack-guide">{preview.guidance.proposedText}</pre></details>}
    </> : details ? <>
      <h3>{pack.name}</h3><p>{pack.description}</p>{metadata}
      {pack.reviewStatus === 'local_unverified' && <p className="field-hint">{l('Community review not verified')}</p>}
      {pack.contributors?.length > 0 && <p>{l('Contributors')}: {pack.contributors.map(person => typeof person === 'string' ? person : person.login).join(', ')}</p>}
      {(details.guide || pack.guideContent) && <details><summary><FileText size={15}/> {l('Agent guide')}</summary><pre className="pack-guide">{details.guide || pack.guideContent}</pre></details>}
      {(details.changelog || pack.changelogContent) && <details><summary>{l('Changes')}</summary><pre className="pack-guide">{details.changelog || pack.changelogContent}</pre></details>}
    </> : <>
      <p className="dialog-intro">{l('Choose a pack to review its sources and changes.')}</p>
      {!catalog && !error && <p role="status">{l('Loading directories…')}</p>}
      {local.length > 0 && <section aria-label={l('Installed')}><h3>{l('Installed')}</h3><div className="pack-rows">{local.map(item => <article className="pack-row" key={`${item.id}:${item.directoryId}`}><div><strong>{item.name || item.packId || item.id}</strong><small>{item.version}{item.directoryName ? ` · ${item.directoryName}` : ''}</small></div><div className="pack-row-actions"><button disabled={busy} onClick={() => inspect(item)}>{l('Details')}</button>{item.updateAvailable && <button disabled={busy} onClick={() => review({ packId: item.packId || item.id })}><RefreshCw size={14}/>{l('Update')}</button>}<button disabled={busy} onClick={() => setRemoveId(item)}>{l('Remove from this directory')}</button></div></article>)}</div></section>}
      {catalog && <section aria-label={l('Available')}><h3>{l('Available')}</h3><div className="pack-rows">{catalog.available?.map(item => <article className="pack-row" key={item.id}><Flag value={item.country}/><div className="pack-row-description"><strong>{item.name}</strong><small>{(item.recordCount || 0).toLocaleString(language)} {l('records')} · {item.version || item.snapshotDate}</small><small>{item.published === false ? l('Local preview') : ''}{item.maintainers?.length ? ` · ${item.maintainers.join(', ')}` : ''}</small>{item.sourceAvailable === false && <small>{l('Import the downloaded ZIP to review its version.')}</small>}</div><div className="pack-row-actions"><button disabled={busy} onClick={() => inspect(item)}>{l('Details')}</button>{item.sourceAvailable === false ? /^https:\/\/github\.com\//.test(item.downloadUrl || '') && <a href={item.downloadUrl} target="_blank" rel="noreferrer">{l('Download published ZIP')}</a> : <button disabled={busy} onClick={() => review({ packId: item.id })}>{l(busy ? 'Reviewing…' : 'Review')}</button>}</div></article>)}</div>{!catalog.available?.length && <p>{l('No directories available. Import a reviewed pack ZIP or create your own directory.')}</p>}</section>}
      <div className="pack-other-actions"><label className="button"><Upload size={15}/>{l('Import a pack ZIP')}<input className="visually-hidden" type="file" accept=".zip" disabled={busy} aria-label={l('Import a pack ZIP')} onChange={importFile}/></label>{createEmpty && <button type="button" disabled={busy} onClick={createEmpty}>{l('Create an empty directory')}</button>}</div>
      <p className="field-hint">{l('Importing does not start applications or monitoring.')}</p>
      <div className="pack-community-links"><a href="https://github.com/ahmedaldhraif/tawdheef/issues/new?template=new-country-pack.yml" target="_blank" rel="noreferrer">{l('Suggest a directory')}</a><a href="https://github.com/ahmedaldhraif/tawdheef/blob/main/docs/policies/CONTRIBUTIONS.md" target="_blank" rel="noreferrer">{l('Contribution policy')}</a></div>
    </>}
  </Modal>;
}
