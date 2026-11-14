import { discoverAssistants, checkAssistantAuthentication } from './agent-runner.mjs';
import { integrationPresets } from './integrations.mjs';
import { readConnectedCv } from './cv-read.mjs';
import { AppError } from './store.mjs';
import { checkTrackerMcp, checkBrowserMcp } from './setup-probes.mjs';
import { buildCvSetupContext, cvSetupSelectionMatches, normalizeCvSetupStatus } from './cv-setup.mjs';

export const SETUP_PROMPT = `Set up Tawdheef for me in this folder. Read AGENTS.md and docs/FIRST-RUN.md. Check my existing assistant, email, optional calendar and CV connections first, and reuse working settings and data. Install only missing project tools, start the app and connect this project to the assistant I am using. Suggest my default email for Tabbio, but let me choose another account; an email connection is not a Tabbio sign-in. Help me connect an existing CV, or prepare a private draft from my CV file, LinkedIn PDF or pasted profile text, or real career details using supported Tabbio tools. Ask only for necessary sign-ins, missing facts and choices. I will enter private credentials in the local connection form or provider page. Keep calendar optional. Use get_setup_status, with verify:true for the final check, then help me shortlist suitable companies without sending. Do not change the app's code or design, publish or share my CV, start applications or employer-profile work, create calendar events, or enable schedules during setup.`;

const CLIENTS = new Set(['codex', 'claude-code']);
const connected = item => item?.status === 'connected';
const mapped = (item, name) => connected(item) && Boolean(item.mappings?.[name]?.tool);
const step = (id, title, status, detail, action = id, required = false) => ({ id, title, status, detail, action, required });

async function bounded(task, timeoutMs, onTimeout = () => {}) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(task), new Promise((_, reject) => { timer = setTimeout(() => { onTimeout(); reject(new Error('Check timed out.')); }, timeoutMs); })]);
  } finally { clearTimeout(timer); }
}

/** Bounded read-only checks with safe metadata/contact hints; never credentials or raw provider text. */
export function createSetupStatus({ store, connections, port, discover = discoverAssistants, presets = integrationPresets, checkAuthentication = checkAssistantAuthentication, checkTracker = checkTrackerMcp, checkBrowser = checkBrowserMcp, readCv = readConnectedCv, readSetupStatus = () => connections.readCvSetupStatus?.() ?? null, timeoutMs = 30000, clock = () => new Date() }) {
  const pendingChecks = new Map();
  let pendingCv;
  async function checkCv({ readConfigured, setupStatusAvailable }) {
    if (pendingCv?.controller.signal.aborted) throw new Error('The previous CV check is still finishing.');
    if (!pendingCv) {
      const entry = { controller: new AbortController() };
      entry.promise = Promise.all([
        readConfigured ? Promise.resolve().then(() => readCv({ store, connections, signal: entry.controller.signal })).then(result => ({ result })).catch(() => null) : null,
        setupStatusAvailable ? Promise.resolve().then(() => readSetupStatus()).catch(() => null) : null,
      ])
        .then(([readResult, statusResult]) => {
          entry.controller.signal.throwIfAborted();
          const selectionMatches = setupStatusAvailable && Boolean(readResult) && cvSetupSelectionMatches(readResult.result, statusResult);
          const remoteStatus = setupStatusAvailable ? normalizeCvSetupStatus(statusResult) : null;
          const readSelection = setupStatusAvailable && readResult && remoteStatus?.status === 'ready' ? selectionMatches ? 'matched' : 'unverified' : 'not_checked';
          return { read: Boolean(readResult), remoteStatus, readSelection };
        })
        .finally(() => { if (pendingCv === entry) pendingCv = null; });
      pendingCv = entry;
    }
    const entry = pendingCv;
    return bounded(() => entry.promise, timeoutMs, () => entry.controller.abort());
  }
  async function inspect({ assistant, verify = false } = {}) {
    if (assistant !== undefined && !CLIENTS.has(assistant)) throw new AppError('Choose Codex or Claude Code.');
    if (typeof verify !== 'boolean') throw new AppError('verify must be true or false.');
    const [discovered, integrations] = await Promise.all([discover(), presets({ dataDir: store.dataDir, port })]);
    const preferred = assistant || store.getSettings().preferredAssistant;
    const selected = discovered.find(item => item.id === preferred) || discovered.find(item => item.installed) || discovered[0];
    const active = selected?.id || null;
    const records = connections.list();
    const cv = records.find(item => item.kind === 'tabbio');
    const email = records.find(item => item.kind === 'email');
    const calendar = records.find(item => item.kind === 'calendar');
    const browser = integrations.find(item => item.id === 'playwright');
    const browserInstalled = browser?.ready === true && browser.browserInstalled === true;
    let browserReady = false, trackerReady = false;
    let browserState = browserInstalled ? 'not_checked' : 'needs_action';
    let trackerState = 'not_checked';
    const emailReady = mapped(email, 'sendEmail');
    const cvConfigured = mapped(cv, 'readCV');
    const setupStatusAvailable = connected(cv) && cv.capabilities?.setupStatus?.available === true;
    let cvReadState = 'not_checked', remoteStatus = null, readSelection = 'not_checked';
    let assistantState = selected?.installed ? 'not_checked' : 'needs_action';
    let assistantDetail = selected?.installed ? 'Installed. Check connections to confirm sign-in.' : 'Install and sign in to Codex or Claude Code. You only need one.';
    let cvState = cvConfigured ? 'not_checked' : 'needs_action';
    let cvDetail = cvConfigured ? 'Connected. Check connections to confirm your CV can be read.' : 'Connect your Tabbio CV so the assistant can use your real experience.';
    if (verify) {
      await Promise.all([
        selected?.installed ? bounded(() => checkAuthentication(selected), timeoutMs).then(result => {
          const version = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(result?.version || '') ? ` ${result.version}` : '';
          assistantState = 'ready'; assistantDetail = `${selected.name}${version} local command and sign-in checks passed.`;
        }).catch(() => {
          assistantState = 'needs_action'; assistantDetail = `Open ${selected.name}, check its sign-in and CLI settings, then check connections again. No application was started.`;
        }) : Promise.resolve(),
        cvConfigured || setupStatusAvailable ? checkCv({ readConfigured: cvConfigured, setupStatusAvailable }).then(result => {
          cvReadState = result.read ? 'ready' : cvConfigured ? 'needs_action' : 'not_checked';
          remoteStatus = result.remoteStatus;
          readSelection = result.readSelection;
          if (setupStatusAvailable && !remoteStatus) {
            cvState = 'needs_action'; cvDetail = 'Tabbio could not verify your CV setup status. Check the connection and try again.';
          } else if (remoteStatus && remoteStatus.status !== 'ready') {
            cvState = 'needs_action';
            cvDetail = {
              verification_required: 'Finish account verification in Tabbio, then check connections again.',
              cv_required: 'Choose an existing Tabbio CV or prepare a private draft using your real information.',
              facts_required: 'Your Tabbio CV needs more career details. Continue with your real information, then check again.',
              approval_required: 'Review the pending step in Tabbio, then check connections again.',
            }[remoteStatus.status];
          } else if (result.read && setupStatusAvailable && readSelection !== 'matched') {
            cvState = 'needs_action'; cvDetail = 'Your CV was read, but Tabbio could not confirm that setup status describes the same selected CV. Check the CV connection and try again.';
          } else if (result.read) {
            cvState = 'ready'; cvDetail = 'Your connected CV was read successfully. Its contents stay out of this connection check.';
          } else {
            cvState = 'needs_action'; cvDetail = cvConfigured ? 'Your CV could not be read. Open Tabbio CV in Connections, finish any sign-in or approval, then check again.' : 'Choose a supported CV read tool in Tabbio CV connection settings.';
          }
        }).catch(() => {
          cvReadState = cvConfigured ? 'needs_action' : 'not_checked';
          cvState = 'needs_action'; cvDetail = 'Your CV could not be read. Open Tabbio CV in Connections, finish any sign-in or approval, then check again.';
        }) : Promise.resolve(),
        bounded(() => checkTracker({ timeoutMs: Math.min(timeoutMs, 20000) }), timeoutMs).then(() => {
          trackerReady = true; trackerState = 'ready';
        }).catch(() => { trackerState = 'needs_action'; }),
        browserInstalled ? bounded(() => checkBrowser({ browser, timeoutMs: Math.min(timeoutMs, 20000) }), timeoutMs).then(() => {
          browserReady = true; browserState = 'ready';
        }).catch(() => { browserState = 'needs_action'; }) : Promise.resolve(),
      ]);
    }
    const directories = store.listDirectories();
    const directoryReady = directories.some(item => Number(item.count) > 0);
    const settings = store.getSettings();
    const steps = [
      step('assistant', 'Choose your assistant', assistantState, assistantDetail, 'assistant', true),
      step('tools', 'Local assistant tools', trackerState, trackerReady ? 'The local MCP server started and exposed the required tracker tools.' : verify ? 'Local tracker tools could not start. Restart Tawdheef and check again; no application was started.' : 'Check connections to test the local tracker tools.', 'check', true),
      step('cv', 'Connect your CV', cvState, cvDetail, 'cv', true),
      step('directory', 'Choose a directory', directoryReady ? 'ready' : 'needs_action', directoryReady ? 'Your company directory is available. Choose a tab before Run.' : 'Add a directory and at least one company.', 'directory', true),
      step('browser', 'Browser applications', browserReady ? 'ready' : emailReady ? 'optional' : browserState, browserReady ? 'Browser tools opened an isolated blank page successfully. Website sign-ins may still need you.' : browserInstalled ? verify ? 'The browser smoke check failed. Let your agent check the browser installation, then try again.' : 'Browser tools are installed. Check connections to verify they can open a page.' : 'Let your agent run npm run setup -- --browser to enable website forms.', 'browser', !emailReady),
      step('email', 'Email applications', emailReady ? 'ready' : 'optional', emailReady ? 'Your mailbox is connected with a send mapping. Access is checked when used; no test email is sent.' : 'Connect one mailbox if you want email applications and reply checks.', 'email'),
      step('calendar', 'Calendar', connected(calendar) ? 'ready' : 'optional', connected(calendar) ? 'A calendar is connected. Events are added only when you ask.' : 'Connect later if you want to view or add interviews.', 'calendar'),
      step('schedule', 'Updates and reports', 'optional', `Reply checks: ${settings.refreshFrequency || 'manual'}. Reports: ${settings.reportFrequency || 'off'}. The computer must be awake. Review these whenever you are ready.`, 'schedule'),
    ];
    const ready = verify && assistantState === 'ready' && trackerReady && cvState === 'ready' && directoryReady && (browserReady || emailReady);
    const missing = steps.find(item => item.required && item.status === 'needs_action') || steps.find(item => item.required && item.status === 'not_checked');
    const nextStep = ready ? { id: 'run', title: 'Ready to review companies', detail: 'Review a shortlist and choose the actions you want before starting a run.', action: 'run' }
      : missing ? { id: missing.id, title: missing.status === 'not_checked' ? 'Check connections' : missing.title, detail: missing.detail, action: missing.status === 'not_checked' ? 'check' : missing.action }
        : { id: 'check', title: 'Check connections', detail: 'Confirm assistant sign-in and read access to your CV.', action: 'check' };
    return {
      checkedAt: new Date(clock()).toISOString(), verified: verify, ready, assistant: active,
      modelAccessVerified: active && store.getAssistantCheck ? store.getAssistantCheck({ assistant: active }).modelAccessVerified === true : false,
      modelCheck: active && store.getAssistantCheck ? store.getAssistantCheck({ assistant: active }) : null,
      assistants: discovered.map(({ id, name, installed }) => ({ id, name, installed, status: id === active ? assistantState : installed ? 'not_checked' : 'needs_action', detail: id === active ? assistantDetail : installed ? 'Installed; sign-in not checked.' : 'Not installed.' })),
      steps, nextStep, setupPrompt: SETUP_PROMPT,
      setupContext: buildCvSetupContext({ records, settings, cvReadState, remoteStatus, readSelection }),
      note: 'Setup never sends an application, email or calendar invitation. Connection checks do not run a model task; an explicit Test agent result is shown separately. Readiness is a point-in-time check; provider permissions and website requirements still apply.',
    };
  }
  return async function setupStatus(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('Supply setup options as an object.');
    if (Object.keys(input).some(key => !['assistant', 'verify'].includes(key))) throw new AppError('Only assistant and verify are accepted for setup checks.');
    if (!input.verify) return inspect(input);
    const key = input.assistant || 'default';
    if (pendingChecks.has(key)) return pendingChecks.get(key);
    const pending = inspect(input).finally(() => pendingChecks.delete(key));
    pendingChecks.set(key, pending);
    return pending;
  };
}
