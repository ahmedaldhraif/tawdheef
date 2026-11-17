import { normalizeRunActions } from '../src/run-actions.js';

/** Dated client observations only. This module never reads an external service. */
export function nativeReadiness({ client, settings = {}, actions: input, localCvFile } = {}) {
  const actions = normalizeRunActions(input === undefined ? { applyMatchingJobs: true, createProfiles: true, sendCvEmails: false } : input);
  const capabilities = client.capabilities || {}, cv = capabilities.cv, mail = capabilities.email;
  const intendedEmail = settings.applicationEmail?.trim().toLowerCase() || null;
  const observedEmail = client.primaryEmail || null;
  const cvReady = cv?.status === 'reported' && Boolean(cv.cv?.id || cv.cv?.url) && /^[a-f0-9]{64}$/i.test(cv.cv?.versionHash || '');
  const browser = capabilities.browser?.status === 'reported' ? capabilities.browser : capabilities.computer?.status === 'reported' ? capabilities.computer : null;
  const emailMismatch = intendedEmail && observedEmail && intendedEmail !== observedEmail;
  const nativeFile = cvReady && cv.cv.uploadFile?.cvSourceId === (cv.cv.id || cv.cv.url) && cv.cv.uploadFile?.cvVersionHash === cv.cv.versionHash ? cv.cv.uploadFile : null;
  const localFile = localCvFile?.available === true ? localCvFile : null;
  const checks = [];
  function add(id, label, required, ready, capability, detail, nextStep, action = id) {
    const status = ready ? 'ready' : !required ? 'optional' : capability?.status === 'needs_you' ? 'needs_you' : 'unknown';
    checks.push({ id, label, required, status, detail, observedAt: capability?.observedAt || null, ...(ready ? {} : { nextStep }), action });
  }
  add('assistant', 'Assistant', true, capabilities.assistant?.localToolUseObserved === true && capabilities.assistant?.status === 'reported', capabilities.assistant,
    'Local tracker tool use only; external accounts remain in your assistant.', 'Ask the selected assistant to call get_agent_context and get_capabilities.');
  add('cv', 'Readable CV', Object.values(actions).some(Boolean), cvReady, cv,
    cvReady ? `${cv.cv.label || 'Current CV'} · ${cv.accessMethod || 'client access'}` : 'CV facts and a current source version have not been reported.',
    'Read the real CV through the selected assistant, then report its source ID and SHA-256 version hash.', 'cv');
  add('email', 'Intended mailbox', actions.createProfiles || actions.sendCvEmails,
    mail?.status === 'reported' && Boolean(observedEmail) && !emailMismatch, mail,
    emailMismatch ? `Selected ${intendedEmail}; observed ${observedEmail}.` : observedEmail ? `${observedEmail} · ${mail.accessMethod || 'client access'}` : 'Mailbox identity has not been reported.',
    emailMismatch ? `Select ${intendedEmail} in the actual assistant and report that observed mailbox. Keep existing career accounts on their original sign-in.` : 'Inspect the intended mailbox in the actual assistant and report its observed address.', 'email');
  if (emailMismatch) checks.at(-1).status = 'needs_you';
  add('browser', 'Browser access', actions.applyMatchingJobs || actions.createProfiles, Boolean(browser), capabilities.browser,
    browser ? `${browser.provider || 'Client browser'} · ${browser.accessMethod || 'client access'}` : 'Browser or computer access has not been reported.',
    'Use an existing authorized browser session in the selected assistant; report browser and computer access separately.', 'browser');
  add('uploadFile', 'CV upload file', false, Boolean(nativeFile || localFile), cv,
    nativeFile ? `${nativeFile.name} · reported for the current CV version` : localFile ? `${localFile.filename} · exact selected file; correspondence to current CV facts is not verified` : 'Check an original PDF or DOCX before a site requests an upload.',
    'Export or select an original PDF/DOCX through the actual client. Verify the exact file before uploading; do not manufacture one from CV text.', 'cv');
  checks.at(-1).source = nativeFile ? 'native-client' : localFile ? 'user_selected_file' : null;
  checks.at(-1).contentVerified = false;
  add('passwordManager', 'Career sign-in', false, capabilities.passwordManager?.status === 'reported', capabilities.passwordManager,
    capabilities.passwordManager?.status === 'reported' ? 'Use the client’s permitted credential support; individual sites may still need you.' : 'Only needed when a career site requires sign-in or registration.',
    'Check the actual client’s supported browser/password manager when a site needs credentials. Preserve its normal approval rules.', 'passwords');
  const missing = checks.find(check => check.required && check.status !== 'ready');
  const checkedTimes = checks.filter(check => check.required && check.observedAt).map(check => Date.parse(check.observedAt));
  return { assistant: client.assistant, status: missing ? missing.status : 'ready', ready: !missing, actions,
    clientReported: true, independentlyVerified: false, checkedAt: checkedTimes.length ? new Date(Math.min(...checkedTimes)).toISOString() : null,
    intendedEmail, observedEmail, checks, nextStep: missing ? { id: missing.id, title: missing.label, detail: missing.nextStep, action: missing.action }
      : { id: 'run', title: 'Ready for the selected work', detail: 'Continue in your selected assistant. Individual sites may require a specific handoff.', action: 'run' },
    readyForMatching: cvReady, readyForUploads: Boolean(nativeFile || localFile), discoveryRequiresMailbox: false, readyForNewRegistration: mail?.status === 'reported' && Boolean(observedEmail) && !emailMismatch && Boolean(browser),
    note: 'These are dated reports from your assistant, not independently verified account access or submission authority.' };
}
