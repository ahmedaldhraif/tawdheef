import React, { useEffect, useState } from 'react';

export default function CvFileControl({ api, t = value => value, disabled = false }) {
  const [file, setFile] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { let active = true; api('/cv/file').then(value => { if (active) setFile(value); }).catch(() => {}); return () => { active = false; }; }, []);
  async function choose(event) {
    const original = event.target.files?.[0]; if (!original || busy) return;
    setBusy(true); setError('');
    try {
      if (original.size > 10 * 1024 * 1024) throw new Error(t('Choose a PDF or DOCX file up to 10 MB.'));
      const encoded = await new Promise((accept, reject) => { const reader = new FileReader(); reader.onerror = () => reject(new Error(t('The file could not be read. Choose it again.'))); reader.onload = () => accept(String(reader.result).split(',')[1]); reader.readAsDataURL(original); });
      setFile(await api('/cv/file', 'POST', { filename: original.name, contentBase64: encoded }));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); event.target.value = ''; }
  }
  return <details className="advanced cv-original-file"><summary>{t('Original CV for uploads')}</summary>
    <p className="field-hint">{t('Choose your existing PDF or DOCX for sites that ask for a file. It stays on this computer until an authorized upload.')}</p>
    {file?.available && <p role="status">{file.filename} · {t('Saved on this computer')}</p>}
    {file && !file.available && file.code && file.code !== 'CV_ARTIFACT_MISSING' && <p className="field-hint">{t('Needs you')}: {file.nextStep}</p>}
    <label>{t('CV file')}<input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={disabled || busy} onChange={choose} /></label>
    {busy && <p role="status">{t('Saving…')}</p>}{error && <p className="form-error" role="alert">{error}</p>}
  </details>;
}
