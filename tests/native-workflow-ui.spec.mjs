import { test, expect } from '@playwright/test';

const actions = { applyMatchingJobs: true, createProfiles: true, sendCvEmails: false };
const unknownClient = assistant => ({ assistant, mode: 'native', clientReported: true, independentlyVerified: false, primaryEmail: null,
  capabilities: Object.fromEntries(['cv', 'email', 'calendar', 'browser', 'computer', 'passwordManager'].map(kind => [kind, { status: 'unknown', observedAt: null, provider: '' }])) });
function readiness(assistant, patch = {}) {
  return { assistant, status: 'unknown', ready: false, actions, checkedAt: null, intendedEmail: 'intended@example.test', observedEmail: null,
    clientReported: true, independentlyVerified: false,
    checks: [{ id: 'cv', label: 'Readable CV', required: true, status: 'unknown', detail: 'Read the actual current CV first.' }, { id: 'uploadFile', label: 'CV upload file', required: false, status: 'optional', detail: 'Check the original file when an upload is required.' }],
    nextStep: { id: 'cv', title: 'Readable CV', detail: 'Read the actual current CV in the selected assistant.', action: 'cv' }, ...patch };
}
function nativeRun(patch = {}) {
  return { id: 'workflow-original', directoryId: 'uae', directoryName: 'UAE', native: true, mode: 'send_and_submit', executionOwner: 'native-client', assistant: 'codex',
    status: 'completed', total: 1, completed: 1, activeCompanyId: null, currentName: '', actions, targetCounts: { needs_you: 1 }, outcomes: { applicationsSent: 0, careerProfiles: 0, emailsSent: 0 }, ...patch };
}
function target(patch = {}) {
  return { runId: 'workflow-original', companyId: 'synthetic-ministry', name: 'Synthetic Ministry', status: 'needs_you',
    checkpoint: { stage: 'register', status: 'needs_you', reasonCode: 'credential', nextStep: 'Finish the one-time sign-in in the original browser tab.', url: 'https://careers.example.com/account/login', accountEmail: 'original@example.test', revision: 1, updatedAt: '2026-11-15T08:00:00Z' }, ...patch };
}

test.beforeEach(async ({ page }) => {
  page.__workflow = { assistant: 'codex', readiness: { codex: readiness('codex'), 'claude-code': readiness('claude-code') }, preferences: { revision: 1, roles: [], locations: [], notes: '' }, run: null, targets: [], writes: [], readinessInputs: [], errors: [], forbidden: [], setupError: false, gate: null };
  page.on('pageerror', error => page.__workflow.errors.push(error.message));
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__workflowClipboard = text; } } }); });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url()), state = page.__workflow;
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) { state.forbidden.push(request.url()); return route.abort(); }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/bootstrap') {
      if (state.failNextBootstrap) { state.failNextBootstrap = false; return route.fulfill({ status: 503, json: { error: 'Synthetic refresh failure after successful Resume.' } }); }
      const response = await route.fetch(), boot = await response.json();
      boot.settings = { ...boot.settings, language: 'en', preferredAssistant: state.assistant, connectionMode: 'native', applicationEmail: 'intended@example.test' };
      boot.connections = []; boot.nativeClient = unknownClient(state.assistant); boot.runs = state.run ? [state.run] : [];
      return route.fulfill({ response, json: boot });
    }
    if (url.pathname === '/api/native/client') return route.fulfill({ json: unknownClient(url.searchParams.get('assistant') || state.assistant) });
    if (url.pathname === '/api/discovery/preferences') {
      if (request.method() === 'PATCH') {
        const input = request.postDataJSON(); state.writes.push({ path: url.pathname, input });
        state.preferences = { ...state.preferences, ...input.patch, revision: state.preferences.revision + 1 };
      }
      return route.fulfill({ json: { preferences: state.preferences } });
    }
    if (url.pathname === '/api/native/readiness') {
      const input = request.method() === 'POST' ? request.postDataJSON() : { assistant: url.searchParams.get('assistant') };
      state.readinessInputs.push(input);
      if (state.setupError) return route.fulfill({ status: 503, json: { error: 'Synthetic setup check unavailable.' } });
      const value = structuredClone(state.readiness[input.assistant || state.assistant]);
      if (input.actions) value.actions = input.actions;
      if (state.gate && input.assistant === 'codex') { state.gate.entered = true; await state.gate.promise; }
      return route.fulfill({ json: value });
    }
    if (url.pathname === '/api/native/setup-request') {
      const input = request.postDataJSON(); state.writes.push({ path: url.pathname, input });
      return route.fulfill({ json: { assistant: input.assistant, prompt: `Synthetic ${input.assistant} setup: inspect existing connections once, report the actual mailbox, CV source/version, upload file and browser; no registration, send or schedule is authorized.` } });
    }
    if (url.pathname === '/api/settings' && request.method() === 'PATCH') {
      const input = request.postDataJSON(); state.writes.push({ path: url.pathname, input });
      if (input.preferredAssistant) state.assistant = input.preferredAssistant;
      return route.fulfill({ json: { language: 'en', preferredAssistant: state.assistant, connectionMode: 'native', applicationEmail: 'intended@example.test', ...input } });
    }
    const resume = url.pathname.match(/^\/api\/native\/runs\/([^/]+)\/resume$/);
    if (resume) {
      const input = request.postDataJSON(); state.writes.push({ path: url.pathname, input });
      state.run = nativeRun({ id: 'workflow-resumed', status: 'running', completed: 0, targetCounts: { pending: 1 } });
      state.targets = [target({ runId: state.run.id, status: 'pending' })];
      if (state.failResumeRefresh) state.failNextBootstrap = true;
      return route.fulfill({ json: { run: state.run, handoff: { prompt: 'Synthetic fresh workflow-resumed authority: inspect the original uncertain intent before any submit.' } } });
    }
    const targets = url.pathname.match(/^\/api\/runs\/([^/]+)\/targets$/);
    if (targets) return route.fulfill({ json: { runId: targets[1], offset: Number(url.searchParams.get('offset') || 0), limit: 50, total: state.targets.length, items: state.targets } });
    const run = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
    if (run && state.run) return route.fulfill({ json: state.run });
    const handoff = url.pathname.match(/^\/api\/native\/runs\/([^/]+)\/request$/);
    if (handoff) return route.fulfill({ json: { prompt: `Synthetic ${handoff[1]} run request.` } });
    if (url.pathname === '/api/native/runs' && request.method() === 'POST') {
      const input = request.postDataJSON(); state.writes.push({ path: url.pathname, input });
      state.run = nativeRun({ id: 'workflow-started', status: 'running', completed: 0, actions: input.actions, targetCounts: { pending: 1 } });
      state.targets = [target({ runId: state.run.id, status: 'pending', checkpoint: undefined })];
      return route.fulfill({ json: { run: state.run, handoff: { prompt: 'Synthetic workflow-started run request.' } } });
    }
    if (request.method() === 'POST' && url.pathname !== '/api/run-preview') { state.forbidden.push(`${request.method()} ${url.pathname}`); return route.abort(); }
    return route.continue();
  });
});

test.afterEach(async ({ page }) => {
  page.__workflow.gate?.release();
  await page.unrouteAll({ behavior: 'wait' });
  expect(page.__workflow.errors).toEqual([]);
  expect(page.__workflow.forbidden).toEqual([]);
});
async function open(page) { await page.goto('/'); await expect(page.locator('.company-name').first()).toBeVisible(); }
async function connections(page) { await open(page); await page.getByRole('button', { name: 'Connections', exact: true }).click(); return page.getByRole('dialog', { name: 'Connections', exact: true }); }

test('Connections offers one client-owned setup request and keeps missing upload readiness distinct from CV facts', async ({ page }) => {
  const dialog = await connections(page);
  await expect(dialog.locator('.native-readiness')).toContainText('Setup not checked');
  await expect(dialog).not.toContainText('Ready to start');
  await dialog.getByText('Setup details', { exact: true }).click();
  await expect(dialog.locator('.native-readiness-details')).toContainText('Readable CV');
  await expect(dialog.locator('.native-readiness-details')).toContainText('CV upload file');
  await dialog.getByRole('button', { name: 'Check setup', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Setup request copied', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__workflowClipboard)).toContain('Synthetic codex setup');
  expect(page.__workflow.writes).toEqual([{ path: '/api/native/setup-request', input: { assistant: 'codex' } }]);
  expect(await dialog.getByRole('textbox', { name: /password|token|secret/i }).count()).toBe(0);
});

test('a failed readiness read stays actionable and never turns unknown access into Ready', async ({ page }) => {
  page.__workflow.setupError = true;
  const dialog = await connections(page);
  await expect(dialog.locator('.native-readiness')).toContainText('Setup check unavailable');
  await expect(dialog.locator('.native-readiness').getByRole('alert')).toContainText('Synthetic setup check unavailable.');
  await expect(dialog).not.toContainText('Ready to start');
  page.__workflow.setupError = false;
  await dialog.locator('.native-readiness').getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(dialog.locator('.native-readiness')).toContainText('Setup not checked');
});

test('Connections links to one existing Job preferences form and returns with saved matching preferences', async ({ page }) => {
  const dialog = await connections(page);
  await dialog.getByRole('button', { name: 'Job preferences', exact: true }).click();
  let preferences = page.getByRole('dialog', { name: 'Preferences', exact: true });
  await expect(preferences.getByRole('textbox', { name: 'Roles', exact: true })).toBeFocused();
  await preferences.getByRole('textbox', { name: 'Roles', exact: true }).fill('HR Manager\nEmployee Relations');
  await preferences.getByRole('textbox', { name: 'Job locations', exact: true }).fill('Abu Dhabi, Dubai');
  await preferences.getByRole('textbox', { name: 'Job notes', exact: true }).fill('Government roles only.');
  await preferences.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toBeVisible();
  const saved = page.__workflow.writes.find(item => item.path === '/api/discovery/preferences');
  expect(saved.input).toEqual({ expectedRevision: 1, explicit: true, patch: { roles: ['HR Manager', 'Employee Relations'], locations: ['Abu Dhabi', 'Dubai'], notes: 'Government roles only.' } });
  await dialog.getByRole('button', { name: 'Job preferences', exact: true }).click();
  preferences = page.getByRole('dialog', { name: 'Preferences', exact: true });
  await expect(preferences.getByRole('textbox', { name: 'Roles', exact: true })).toHaveValue('HR Manager, Employee Relations');
  await preferences.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true })).toHaveCount(0);
  expect(page.__workflow.writes.filter(item => item.path === '/api/native/runs')).toEqual([]);
});

test('equivalent job preference separators close cleanly while actual unsaved changes stay protected', async ({ page }) => {
  page.__workflow.preferences = { revision: 3, roles: ['HR Manager', 'Employee Relations'], locations: ['Abu Dhabi', 'Dubai'], notes: 'Government roles only.' };
  const dialog = await connections(page);
  await dialog.getByRole('button', { name: 'Job preferences', exact: true }).click();
  let preferences = page.getByRole('dialog', { name: 'Preferences', exact: true });
  await expect(preferences.getByRole('textbox', { name: 'Roles', exact: true })).toHaveValue('HR Manager, Employee Relations');
  await preferences.getByRole('textbox', { name: 'Roles', exact: true }).fill(' HR Manager\nEmployee Relations ');
  await preferences.getByRole('textbox', { name: 'Job locations', exact: true }).fill('Abu Dhabi\nDubai');
  await preferences.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true })).toHaveCount(0);
  expect(page.__workflow.writes.filter(item => item.path === '/api/discovery/preferences')).toEqual([]);
  await dialog.getByRole('button', { name: 'Job preferences', exact: true }).click();
  preferences = page.getByRole('dialog', { name: 'Preferences', exact: true });
  await expect(preferences.getByRole('textbox', { name: 'Roles', exact: true })).toHaveValue('HR Manager, Employee Relations');
  await preferences.getByRole('textbox', { name: 'Roles', exact: true }).fill('People Partner');
  await preferences.getByRole('button', { name: 'Cancel', exact: true }).click();
  const discard = page.getByRole('dialog', { name: 'Discard unsaved changes?', exact: true });
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(preferences.getByRole('textbox', { name: 'Roles', exact: true })).toHaveValue('People Partner');
  await preferences.getByRole('button', { name: 'Cancel', exact: true }).click();
  await discard.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Job preferences', exact: true }).click();
  await expect(preferences.getByRole('textbox', { name: 'Roles', exact: true })).toHaveValue('HR Manager, Employee Relations');
});

test('an old readiness response cannot mark the newly selected assistant Ready', async ({ page }) => {
  page.__workflow.readiness.codex = readiness('codex', { ready: true, status: 'ready', checkedAt: '2026-11-15T08:00:00Z' });
  let release;
  page.__workflow.gate = { promise: new Promise(done => { release = done; }), release: () => release(), entered: false };
  const dialog = await connections(page);
  await expect.poll(() => page.__workflow.gate.entered).toBe(true);
  await dialog.getByRole('button', { name: 'Assistant — Codex', exact: true }).click();
  const assistantDialog = page.getByRole('dialog', { name: 'Assistant', exact: true });
  await assistantDialog.getByRole('radio', { name: 'Use Claude Code', exact: true }).check();
  await assistantDialog.getByRole('button', { name: 'Back to connections', exact: true }).click();
  page.__workflow.gate.release();
  await expect(dialog.getByRole('button', { name: 'Assistant — Claude Code', exact: true })).toBeVisible();
  await expect(dialog.locator('.native-readiness')).toContainText('Setup not checked');
  await expect(dialog.locator('.native-readiness')).not.toContainText('Ready to start');
});

test('Run checks the selected actions without making optional calendar or credential reports a global gate', async ({ page }) => {
  await open(page);
  await page.locator('.heading-actions').getByRole('button', { name: /^Run on/ }).click();
  let dialog = page.getByRole('dialog', { name: 'Run', exact: true });
  await dialog.getByRole('checkbox', { name: 'Apply to jobs that match my CV', exact: true }).uncheck();
  await expect.poll(() => page.__workflow.readinessInputs.at(-1)?.actions).toEqual({ applyMatchingJobs: false, createProfiles: true, sendCvEmails: false });
  await dialog.getByRole('checkbox', { name: 'Create an account or complete my profile', exact: true }).uncheck();
  await expect(dialog).toContainText('Choose at least one action to start.');
  await expect(dialog.getByRole('button', { name: /^Run on/ })).toBeDisabled();
  expect(page.__workflow.readinessInputs.some(input => input.actions && Object.values(input.actions).every(value => value === false))).toBe(false);
  await dialog.getByRole('checkbox', { name: 'Create an account or complete my profile', exact: true }).check();
  await expect(dialog.locator('.native-readiness')).toContainText('Setup not checked');
  await expect(dialog.getByRole('button', { name: /^Run on/ })).toBeEnabled();
  await dialog.getByRole('button', { name: /^Run on/ }).click();
  dialog = page.getByRole('dialog', { name: 'Run progress', exact: true });
  await expect(dialog).toContainText('Waiting for assistant');
  const request = page.__workflow.writes.find(item => item.path === '/api/native/runs');
  expect(request.input.actions).toEqual({ applyMatchingJobs: false, createProfiles: true, sendCvEmails: false });
  await expect(dialog).toContainText('0 with confirmed submissions.');
});

test('checking Connections from Run preserves the selected actions and unfinished note', async ({ page }) => {
  await open(page);
  await page.locator('.heading-actions').getByRole('button', { name: /^Run on/ }).click();
  let dialog = page.getByRole('dialog', { name: 'Run', exact: true });
  await dialog.getByRole('checkbox', { name: 'Apply to jobs that match my CV', exact: true }).uncheck();
  await dialog.getByText('Add a note', { exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Note (optional)', exact: true }).fill('Preserve this scope and unfinished note.');
  await dialog.locator('.native-readiness').getByRole('button', { name: 'Connections', exact: true }).click();
  await page.getByRole('dialog', { name: 'Connections', exact: true }).getByRole('button', { name: 'Done', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Run', exact: true });
  await expect(dialog.getByRole('checkbox', { name: 'Apply to jobs that match my CV', exact: true })).not.toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Create an account or complete my profile', exact: true })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'Email my CV for future opportunities', exact: true })).not.toBeChecked();
  await dialog.getByText('Add a note', { exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Note (optional)', exact: true })).toHaveValue('Preserve this scope and unfinished note.');
  expect(page.__workflow.writes.filter(item => item.path === '/api/native/runs')).toEqual([]);
});

test('Needs you resumes only the named original target and opens a fresh handoff without claiming a completed outcome', async ({ page }) => {
  page.__workflow.run = nativeRun(); page.__workflow.targets = [target()];
  await open(page);
  await page.getByRole('button', { name: 'View progress', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Run progress', exact: true });
  await expect(dialog.locator('.run-targets')).toContainText('Finish the one-time sign-in in the original browser tab.');
  await expect(dialog.getByRole('link', { name: 'Open page', exact: true })).toHaveAttribute('href', 'https://careers.example.com/account/login');
  await dialog.getByRole('button', { name: 'Resume Synthetic Ministry', exact: true }).click();
  expect(page.__workflow.writes.find(item => item.path.endsWith('/resume'))).toEqual({ path: '/api/native/runs/workflow-original/resume', input: { companyId: 'synthetic-ministry', assistant: 'codex', explicit: true } });
  await expect(dialog).toContainText('Waiting for assistant');
  await expect(dialog.getByRole('button', { name: 'Run request copied', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__workflowClipboard)).toContain('fresh workflow-resumed authority');
  await expect(dialog).toContainText('0 with confirmed submissions.');
});

test('a successful Resume keeps its fresh authority and handoff even if the subsequent screen refresh fails', async ({ page }) => {
  page.__workflow.run = nativeRun(); page.__workflow.targets = [target()]; page.__workflow.failResumeRefresh = true;
  await open(page);
  await page.getByRole('button', { name: 'View progress', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Run progress', exact: true });
  await dialog.getByRole('button', { name: 'Resume Synthetic Ministry', exact: true }).click();
  await expect(dialog).toContainText('Waiting for assistant');
  await expect(dialog.getByRole('button', { name: 'Run request copied', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__workflowClipboard)).toContain('fresh workflow-resumed authority');
  expect(page.__workflow.writes.filter(item => item.path.endsWith('/resume'))).toHaveLength(1);
});

test('an uncertain original intent overrides a stale Submit next step in Needs you', async ({ page }) => {
  page.__workflow.run = nativeRun();
  const saved = target();
  page.__workflow.targets = [{ ...saved, requiresInspection: true, nextStep: 'Inspect the original uncertain submission before any new Submit.', checkpoint: { ...saved.checkpoint, stage: 'application', status: 'working', nextStep: 'Submit this application once.' } }];
  await open(page);
  await page.getByRole('button', { name: 'View progress', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Run progress', exact: true });
  await expect(dialog.locator('.run-targets')).toContainText('Inspect the original uncertain submission before any new Submit.');
  await expect(dialog.locator('.run-targets')).not.toContainText('Submit this application once.');
});

test('an active blocked checkpoint shows Needs you without a working animation or a nested Resume', async ({ page }) => {
  page.__workflow.run = nativeRun({ status: 'running', completed: 0, activeCompanyId: 'synthetic-ministry', currentName: 'Synthetic Ministry', currentCheckpoint: target().checkpoint });
  page.__workflow.targets = [target({ status: 'working' })];
  await open(page);
  await expect(page.locator('.run-banner')).toContainText('Needs you');
  await expect(page.locator('.run-banner .run-activity-mark')).toHaveAttribute('data-active', 'false');
  await page.locator('.run-banner').getByRole('button', { name: 'View progress', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Run progress', exact: true });
  await expect(dialog.locator('.run-targets')).toContainText('Needs you');
  await expect(dialog.getByRole('button', { name: /^Resume/ })).toHaveCount(0);
  expect(page.__workflow.writes.filter(item => item.path.endsWith('/resume'))).toEqual([]);
});
