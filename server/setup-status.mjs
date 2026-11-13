import { discoverAssistants, checkAssistantAuthentication } from './agent-runner.mjs';
import { integrationPresets } from './integrations.mjs';
import { readConnectedCv } from './cv-read.mjs';
import { AppError } from './store.mjs';

export const SETUP_PROMPT = `Set up Tawdheef for me in this folder. Read AGENTS.md and docs/FIRST-RUN.md. Check what already works, then install missing project dependencies, start the app, add browser tools, and connect this project to the assistant I am using. Keep existing settings and data. Guide me through only the sign-ins or choices that need me; I will enter credentials in the local connection form. Check setup again and tell me the next step. Use get_setup_status (verify:true for the final check), or the equivalent CLI command. Do not change the app's code or design, send applications, create calendar events, or enable schedules during setup.`;

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

/** Observations and bounded read-only probes. No credentials or provider text enter this result. */
export function createSetupStatus({ store, connections, port, discover = discoverAssistants, presets = integrationPresets, checkAuthentication = checkAssistantAuthentication, readCv = readConnectedCv, timeoutMs = 30000, clock = () => new Date() }) {
  const pendingChecks = new Map();
  let pendingCv;
  async function checkCv() {
    if (pendingCv?.controller.signal.aborted) throw new Error('The previous CV check is still finishing.');
    if (!pendingCv) {
      const entry = { controller: new AbortController() };
      entry.promise = Promise.resolve().then(() => readCv({ store, connections, signal: entry.controller.signal }))
        .then(result => { entry.controller.signal.throwIfAborted(); return result; })
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
    const selected = discovered.find(item => item.id === assistant) || discovered.find(item => item.installed) || discovered[0];
    const active = selected?.id || null;
    const records = connections.list();
    const cv = records.find(item => item.kind === 'tabbio');
    const email = records.find(item => item.kind === 'email');
    const calendar = records.find(item => item.kind === 'calendar');
    const browser = integrations.find(item => item.id === 'playwright');
    const browserReady = browser?.ready === true && browser.browserInstalled === true;
    const emailReady = mapped(email, 'sendEmail');
    const cvConfigured = mapped(cv, 'readCV');
    let assistantState = selected?.installed ? 'not_checked' : 'needs_action';
    let assistantDetail = selected?.installed ? 'Installed. Check connections to confirm sign-in.' : 'Install and sign in to Codex or Claude Code. You only need one.';
    let cvState = cvConfigured ? 'not_checked' : 'needs_action';
    let cvDetail = cvConfigured ? 'Connected. Check connections to confirm your CV can be read.' : 'Connect your Tabbio CV so the assistant can use your real experience.';
    if (verify) {
      await Promise.all([
        selected?.installed ? bounded(() => checkAuthentication(selected), timeoutMs).then(() => {
          assistantState = 'ready'; assistantDetail = `${selected.name} sign-in check passed.`;
        }).catch(() => {
          assistantState = 'needs_action'; assistantDetail = `Open ${selected.name}, check its sign-in and CLI settings, then check connections again. No application was started.`;
        }) : Promise.resolve(),
        cvConfigured ? checkCv().then(() => {
          cvState = 'ready'; cvDetail = 'Your connected CV was read successfully. Its contents stay out of this connection check.';
        }).catch(() => {
          cvState = 'needs_action'; cvDetail = 'Your CV could not be read. Open Tabbio CV in Connections, finish any sign-in or approval, then check again.';
        }) : Promise.resolve(),
      ]);
    }
    const directories = store.listDirectories();
    const directoryReady = directories.some(item => Number(item.count) > 0);
    const settings = store.getSettings();
    const steps = [
      step('assistant', 'Choose your assistant', assistantState, assistantDetail, 'assistant', true),
      step('cv', 'Connect your CV', cvState, cvDetail, 'cv', true),
      step('directory', 'Choose a directory', directoryReady ? 'ready' : 'needs_action', directoryReady ? 'Your company directory is available. Choose a tab before Run.' : 'Add a directory and at least one company.', 'directory', true),
      step('browser', 'Browser applications', browserReady ? 'ready' : emailReady ? 'optional' : 'needs_action', browserReady ? 'Browser tools and Chromium are installed. Website sign-ins may still need you.' : 'Let your agent run npm run setup -- --browser to enable website forms.', 'browser', !emailReady),
      step('email', 'Email applications', emailReady ? 'ready' : 'optional', emailReady ? 'Your mailbox is connected with a send mapping. Access is checked when used; no test email is sent.' : 'Connect one mailbox if you want email applications and reply checks.', 'email'),
      step('calendar', 'Calendar', connected(calendar) ? 'ready' : 'optional', connected(calendar) ? 'A calendar is connected. Events are added only when you ask.' : 'Connect later if you want to view or add interviews.', 'calendar'),
      step('schedule', 'Updates and reports', 'optional', `Reply checks: ${settings.refreshFrequency || 'manual'}. Reports: ${settings.reportFrequency || 'off'}. The computer must be awake. Review these whenever you are ready.`, 'schedule'),
    ];
    const ready = verify && assistantState === 'ready' && cvState === 'ready' && directoryReady && (browserReady || emailReady);
    const missing = steps.find(item => item.required && item.status === 'needs_action') || steps.find(item => item.required && item.status === 'not_checked');
    const nextStep = ready ? { id: 'run', title: 'Ready for your first run', detail: 'Choose your directory and describe the work you want. Only pressing Run authorizes applications.', action: 'run' }
      : missing ? { id: missing.id, title: missing.status === 'not_checked' ? 'Check connections' : missing.title, detail: missing.detail, action: missing.status === 'not_checked' ? 'check' : missing.action }
        : { id: 'check', title: 'Check connections', detail: 'Confirm assistant sign-in and read access to your CV.', action: 'check' };
    return {
      checkedAt: new Date(clock()).toISOString(), verified: verify, ready, assistant: active,
      assistants: discovered.map(({ id, name, installed }) => ({ id, name, installed, status: id === active ? assistantState : installed ? 'not_checked' : 'needs_action', detail: id === active ? assistantDetail : installed ? 'Installed; sign-in not checked.' : 'Not installed.' })),
      steps, nextStep, setupPrompt: SETUP_PROMPT,
      note: 'Setup never sends an application, email or calendar invitation. Readiness is a point-in-time check; provider permissions and website requirements still apply.',
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
