import { spawn } from 'node:child_process';
import { access, mkdir, writeFile, readFile, unlink, readdir, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, dirname, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { AppError } from './store.mjs';
import { createClientConfig, integrationPresets } from './integrations.mjs';
import { OPERATOR_TOOLS, operatorPrompt, operatorTools, MONITOR_BROWSER_TOOLS } from './operator-contract.mjs';
import { createAssistantUsageCollector, createAssistantEventReader, sanitizeAssistantUsage } from './assistant-usage.mjs';

const CLAUDE_TOOLS = 'Read,WebFetch,WebSearch,ToolSearch';

export async function discoverAssistants({ env = process.env, platform = process.platform, home = homedir() } = {}) {
  // Finder/Explorer launches do not necessarily inherit an interactive shell PATH.
  // Inspect known installation locations; never execute shell startup files.
  const dirs = [...(env.PATH || env.Path || '').split(platform === 'win32' ? ';' : ':'), join(home, '.local', 'bin'), join(home, '.volta', 'bin'), dirname(process.execPath)];
  if (env.VOLTA_HOME) dirs.push(join(env.VOLTA_HOME, 'bin'));
  if (env.NVM_BIN) dirs.push(env.NVM_BIN);
  if (platform === 'win32') {
    if (env.APPDATA) dirs.push(join(env.APPDATA, 'npm'));
    if (env.LOCALAPPDATA) dirs.push(join(env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links'));
    if (env.NVM_HOME) dirs.push(env.NVM_HOME);
    if (env.NVM_SYMLINK) dirs.push(env.NVM_SYMLINK);
  } else {
    dirs.push('/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin');
    const versions = join(env.NVM_DIR || join(home, '.nvm'), 'versions', 'node');
    try {
      const installed = (await readdir(versions, { withFileTypes: true })).filter(item => item.isDirectory() && /^v\d+\.\d+\.\d+$/.test(item.name)).sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true })).slice(0, 32);
      dirs.push(...installed.map(item => join(versions, item.name, 'bin')));
    } catch { /* nvm is optional. */ }
  }
  const locations = [...new Set(dirs.filter(Boolean).filter(isAbsolute))];
  return Promise.all(['codex', 'claude-code'].map(async id => {
    const binary = id === 'codex' ? 'codex' : 'claude';
    const override = env[id === 'codex' ? 'TAWDHEEF_CODEX_PATH' : 'TAWDHEEF_CLAUDE_PATH'];
    const candidates = override ? (isAbsolute(override) && !/\.(?:cmd|bat|ps1)$/i.test(override) ? [{ command: /\.[cm]?js$/i.test(override) ? process.execPath : override, args: /\.[cm]?js$/i.test(override) ? [override] : [] }] : []) : locations.flatMap(dir => [
      { command: join(dir, binary + (platform === 'win32' ? '.exe' : '')), args: [] },
      { command: process.execPath, args: [join(dir, 'node_modules', id === 'codex' ? '@openai/codex/bin/codex.js' : '@anthropic-ai/claude-code/cli.js')] },
      ...(platform === 'win32' ? [] : [{ command: process.execPath, args: [join(dir, '..', 'lib', 'node_modules', id === 'codex' ? '@openai/codex/bin/codex.js' : '@anthropic-ai/claude-code/cli.js')] }]),
    ]);
    for (const candidate of candidates) {
      try {
        const path = candidate.args[0] || candidate.command;
        if (!(await stat(path)).isFile()) continue;
        await access(path, platform === 'win32' || candidate.args.length ? constants.R_OK : constants.X_OK);
        return { id, name: id === 'codex' ? 'Codex' : 'Claude Code', installed: true, ...candidate };
      } catch { /* Try the next standard local installation. */ }
    }
    return { id, name: id === 'codex' ? 'Codex' : 'Claude Code', installed: false };
  }));
}

async function readAssistantCommand({ executable, args, timeoutMs = 15000, cwd = homedir() }) {
  return new Promise((accept, reject) => {
    execFile(executable, args, { cwd, env: process.env, windowsHide: true, shell: false, timeout: timeoutMs, maxBuffer: 256_000 }, (error, stdout) => {
      if (error) reject(new AppError('The assistant CLI cannot run the required local commands. Update its installation and check its settings.'));
      else accept(stdout);
    });
  });
}

/** Version/help only: no model task, sign-in, configuration write or permission change. */
export async function checkAssistantCompatibility(executable, { run = readAssistantCommand } = {}) {
  const invoke = args => run({ executable: executable.command, args: [...(executable.args || []), ...args], timeoutMs: 15000 });
  const versionOutput = await invoke(['--version']);
  const version = String(versionOutput).match(/\b\d+\.\d+\.\d+(?:[-+][\w.-]+)?/)?.[0];
  if (!version) throw new AppError('The assistant CLI did not report a supported version. Update its installation.');
  const args = executable.id === 'codex'
    ? ['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check', '--help']
    : ['--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--permission-mode', 'default', '--tools', CLAUDE_TOOLS, '--help'];
  const help = String(await invoke(args));
  const required = executable.id === 'codex' ? ['--json', '--sandbox', '--skip-git-repo-check', '--cd'] : ['--mcp-config', '--output-format', '--permission-mode'];
  if (!required.every(flag => help.includes(flag))) throw new AppError('The assistant CLI is missing required local-run capabilities. Update it before Run.');
  return { version, capabilitiesChecked: true, ...(executable.id === 'claude-code' ? { toolSearch: { requested: true, modelSupportVerified: false } } : {}) };
}

export function launchArguments(assistant, config, cwd, { inheritedServers = [], tools = OPERATOR_TOOLS, readOnlyBrowser = false } = {}) {
  const browserTools = readOnlyBrowser ? MONITOR_BROWSER_TOOLS.map(name => `mcp__playwright__${name}`) : ['mcp__playwright__*'];
  if (assistant === 'claude-code') return ['-p', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--strict-mcp-config', '--mcp-config', JSON.stringify({ mcpServers: config }), '--tools', readOnlyBrowser ? 'WebFetch,WebSearch' : CLAUDE_TOOLS, '--allowedTools', [...tools.map(name => `mcp__apply-tracker__${name}`), ...(config.playwright ? browserTools : [])].join(','), '--permission-mode', 'default'];
  const args = ['exec', '--json', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check', '--cd', cwd, '-c', 'features.apps=false', '-c', 'features.plugins=false', '-c', 'features.remote_plugin=false', '-c', 'features.shell_tool=false', '-c', 'features.shell_snapshot=false', '-c', 'features.multi_agent=false'];
  // Codex deep-merges MCP tables. Disable inherited servers without changing
  // the person's selected model, provider, authentication or managed policy.
  for (const name of inheritedServers) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(name)) throw new AppError('An inherited MCP server name cannot be isolated safely. Review the assistant configuration.');
    args.push('-c', `mcp_servers.${name}.enabled=false`);
  }
  for (const [name, server] of Object.entries(config)) for (const [key, value] of Object.entries(server)) {
    if (key === 'env') for (const [envKey, envValue] of Object.entries(value)) args.push('-c', `mcp_servers.${name}.env.${envKey}=${JSON.stringify(envValue)}`);
    else args.push('-c', `mcp_servers.${name}.${key}=${JSON.stringify(value)}`);
  }
  for (const name of Object.keys(config)) args.push('-c', `mcp_servers.${name}.enabled=true`);
  return [...args, '-'];
}

export async function inheritedMcpServers(executable, { run = readAssistantCommand, cwd = homedir() } = {}) {
  const output = await run({ executable: executable.command, args: [...(executable.args || []), 'mcp', 'list', '--json'], timeoutMs: 15000, cwd });
  let servers;
  try { servers = JSON.parse(output); } catch { throw new AppError('The assistant could not report its MCP catalog. Update its CLI before Run.'); }
  if (!Array.isArray(servers) || servers.length > 200 || servers.some(server => !server || typeof server.name !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(server.name))) throw new AppError('The assistant MCP catalog cannot be isolated safely. Review its settings.');
  return servers.map(server => server.name);
}

export async function checkAssistantAuthentication(executable) {
  const compatibility = await checkAssistantCompatibility(executable);
  const result = await executeAssistant({ executable: executable.command, args: [...executable.args, ...(executable.id === 'codex' ? ['login', 'status'] : ['auth', 'status'])], cwd: homedir(), env: process.env, timeoutMs: 15000 });
  if (result.status !== 'finished') throw new AppError(result.configurationError ? result.reason : `Open ${executable.name || executable.id}, finish signing in, then press Run again. If it is already signed in, update its CLI to a version that supports local runs.`);
  return compatibility;
}

/** One owned subprocess per company. No shell, raw agent log, hidden model or automatic retry. */
export function executeAssistant({ executable, args, prompt, cwd, env, signal, timeoutMs = 20 * 60_000, terminationMs = 3000, spawnProcess = spawn, onSpawn = async () => {}, clock = () => performance.now() }) {
  return new Promise(resolve => {
    const startedAt = clock(), usage = createAssistantUsageCollector();
    let child, timer, watchdog, escalation, settled = false, failed = false, authError = false, accessDenied = false, configError = false, reasoningConfig = false, limited = false;
    const finish = result => { if (settled) return; settled = true; clearTimeout(timer); clearTimeout(watchdog); clearTimeout(escalation); signal?.removeEventListener('abort', abort); const elapsed = clock() - startedAt; resolve({ ...result, usage: usage.snapshot(), durationMs: Number.isFinite(elapsed) && elapsed >= 0 ? Math.round(elapsed) : null }); };
    const force = () => { try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* Watchdog reports unconfirmed termination. */ } };
    const kill = () => {
      if (!child?.pid || watchdog) return;
      watchdog = setTimeout(() => finish({ status: 'needs_you', global: true, terminationUnconfirmed: true, pid: child.pid, reason: 'The assistant did not confirm it stopped. Close that assistant process before another Run; inspect any open submission.' }), terminationMs);
      escalation = setTimeout(force, Math.max(1, Math.floor(terminationMs / 2)));
      if (process.platform === 'win32') {
        try { const killer = spawnProcess('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' }); killer.on('error', force); killer.on('close', code => { if (code !== 0) force(); }); } catch { force(); }
      } else { try { process.kill(-child.pid, 'SIGTERM'); } catch { force(); } }
    };
    const abort = () => { kill(); };
    if (signal?.aborted) return finish({ status: 'stopped' });
    try { child = spawnProcess(executable, args, { cwd, env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch { return finish({ status: 'failed', reason: 'The assistant could not start. Check its installation.' }); }
    signal?.addEventListener('abort', abort, { once: true });
    let timedOut = false;
    timer = setTimeout(() => { timedOut = true; kill(); }, timeoutMs);
    const classify = (text, providerEnvelope = false) => {
      if (/error loading configuration|invalid config|unknown variant|unknown option|unrecognized (?:argument|option)|invalid tool name|unknown (?:built-in )?tool[^\n]{0,30}ToolSearch/i.test(text)) configError = true;
      if (/model_reasoning_effort/.test(text)) reasoningConfig = true;
      if (/not logged in|authentication failed|invalid_api_key|please (log|sign) in|login required|authentication_error/i.test(text)) authError = true;
      if (/rate_limit_error|usage limit|quota exceeded|rate limit exceeded/i.test(text)) limited = true;
      // Only a client error envelope can establish provider HTTP access errors.
      // Company text, ordinary model output and tool results cannot stop a queue.
      if (providerEnvelope) {
        if (/(?:API\s*Error|HTTP(?:\s*Error)?|status(?:Code|\s+code)?)[^\d\n]{0,16}401\b/i.test(text)) authError = true;
        if (/(?:API\s*Error|HTTP(?:\s*Error)?|status(?:Code|\s+code)?)[^\d\n]{0,16}403\b/i.test(text)) accessDenied = true;
      }
    };
    // Read only authoritative usage/error envelopes and tool IDs; retain no raw output.
    const events = createAssistantEventReader(e => {
      usage.observe(e);
      if (e.type === 'error' || e.type === 'turn.failed' || e.is_error === true) { failed = true; classify(JSON.stringify(e.error || e.message || e.result || e), true); }
    }, { onSkipped: () => usage.incomplete() });
    child.stdout.on('data', chunk => events.write(chunk));
    child.stderr.on('data', chunk => classify(chunk.toString().slice(0,10000)));
    child.stdin.on('error', () => {});
    child.once('error', () => finish({ status: 'failed', reason: 'The assistant could not start. Check its installation.' }));
    child.once('close', code => { events.end(); finish(signal?.aborted ? { status: 'stopped' } : configError ? { status: 'needs_you', global: true, configurationError: true, ...(reasoningConfig ? { configurationField: 'model_reasoning_effort' } : {}), reason: reasoningConfig ? 'The installed assistant CLI cannot load its saved reasoning setting. Update that CLI or choose a supported reasoning level in its settings, then try again.' : 'The assistant CLI cannot load its current configuration or run options. Update that CLI or correct its reported settings, then press Run again.' } : authError ? { status: 'needs_you', global: true, reason: "The assistant's configured model provider rejected authentication. Check that provider's sign-in or credentials in the assistant, then press Run again." } : accessDenied ? { status: 'needs_you', global: true, reason: "The assistant's configured model provider denied access (HTTP 403). Review its access or policy requirements before another Run." } : limited ? { status: 'needs_you', global: true, reason: 'The assistant reached its provider limit. Wait for it to reset, then press Run again.' } : timedOut ? { status: 'failed', reason: 'This company took too long. Check for a submission receipt before retrying.' } : code !== 0 || failed ? { status: 'failed', reason: 'The assistant could not finish this company. Check its application history, then retry with Run.' } : { status: 'finished' }); });
    // Record ownership before the assistant receives any work. Restart can detect a stranded process.
    Promise.resolve(onSpawn(child.pid)).then(() => { if (signal?.aborted) kill(); else child.stdin.end(prompt); }).catch(() => { failed = true; kill(); });
  });
}

export function createAgentRunner({ store, port, discover = discoverAssistants, execute = executeAssistant, makeConfig = createClientConfig, presets = integrationPresets, checkReady = async () => {}, readMcpServers = inheritedMcpServers }) {
  let active = null, starting = false, closed = false, preflight = null;
  const assertOpen = signal => {
    if (closed || signal?.aborted) throw new AppError('The local-adapter runner was closed. Use the selected connection mode and start a fresh explicit Run.');
  };
  const ownedProcess = join(store.dataDir, 'agent-process.json');
  const processAlive = pid => { if (!Number.isSafeInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } };
  // App restart never resumes sending without a fresh explicit Run.
  for (const run of store.listRuns()) if (run.managed && ['running', 'expired'].includes(run.status)) {
    store.updateRun(run.id, { status: 'cancelled', notes: 'The app stopped. Press Run to retry unfinished companies.' });
    if (run.activeCompanyId) store.finishRunTarget(run.id, run.activeCompanyId, { status: 'needs_you', reason: 'The app stopped during this company. Inspect any open submission before retrying.' });
  }
  async function assistants() { return (await discover()).map(({ id, name, installed }) => ({ id, name, installed })); }
  async function work(run, executable, signal) {
    try {
      const cwd = join(store.dataDir, 'agent-work');
      await mkdir(cwd, { recursive: true, mode: 0o700 });
      assertOpen(signal);
      await writeFile(join(cwd, 'AGENTS.md'), 'Operate Tawdheef through its scoped MCP tools. Never change application source, configuration or private files. Follow the explicit company prompt.\n', { mode: 0o600 });
      assertOpen(signal);
      for (const target of run.targets) {
        if (closed || signal.aborted || store.getRun(run.id).status !== 'running') break;
        const companyId = target.companyId;
        store.beginRunTarget(run.id, companyId);
        const latestCompany = store.getCompany(companyId);
        if (run.monitoringRuleId) {
          try { store.assertMonitoringRun(run.id, companyId); }
          catch (error) { store.finishRunTarget(run.id, companyId, { status: 'needs_you', reason: String(error.message || 'Review the monitoring scope.').slice(0, 500) }); continue; }
        }
        if (latestCompany.archived || (!run.monitoringRuleId && !store.isCompanyEligibleForRun(companyId, run.actions))) {
          store.finishRunTarget(run.id, companyId, { status: 'skipped', reason: 'Already submitted, completed or archived since this run began.' }); continue;
        }
        let result;
        try {
          const available = await presets({ dataDir: store.dataDir, port });
          assertOpen(signal);
          const browser = available.find(p => p.id === 'playwright' && p.ready && p.browserInstalled);
          const config = await makeConfig({ dataDir: store.dataDir, port, mode: 'local-adapters', assistant: run.assistant, include: browser ? ['playwright'] : [] });
          assertOpen(signal);
          Object.assign(config.mcpServers['apply-tracker'].env, { APPLY_TRACKER_OPERATOR_RUN: run.id, APPLY_TRACKER_OPERATOR_COMPANY: companyId });
          const tools = operatorTools(run);
          if (run.assistant === 'codex') {
            config.mcpServers['apply-tracker'].enabled_tools = tools;
            if (run.monitoringMode === 'notify' && config.mcpServers.playwright) config.mcpServers.playwright.enabled_tools = MONITOR_BROWSER_TOOLS;
          }
          const inheritedServers = run.assistant === 'codex' ? await readMcpServers(executable, { cwd }) : [];
          assertOpen(signal);
          if (run.monitoringRuleId) store.assertMonitoringRun(run.id, companyId);
          result = await execute({ executable: executable.command, args: [...executable.args, ...launchArguments(run.assistant, config.mcpServers, cwd, { inheritedServers, tools, readOnlyBrowser: run.monitoringMode === 'notify' })], prompt: operatorPrompt(run, companyId), cwd, env: { ...process.env, APPLY_TRACKER_DATA: store.dataDir, APPLY_TRACKER_PORT: String(port) }, signal, onSpawn: pid => writeFile(ownedProcess, JSON.stringify({ pid, runId: run.id }), { mode: 0o600 }) });
          if (!result.terminationUnconfirmed) await unlink(ownedProcess).catch(error => { if (error.code !== 'ENOENT') throw error; });
        } catch (error) { result = closed || signal.aborted ? { status: 'stopped', reason: 'Stopped. Inspect any open application before a fresh Run.' } : error instanceof AppError ? { status: 'needs_you', global: true, reason: error.message } : { status: 'failed', reason: 'The assistant tools could not start. Check Connections and try again.' }; }
        const applications = store.listApplications(companyId);
        const current = applications.filter(a => a.runId === run.id);
        const uncertain = applications.some(a => ['sending', 'unknown'].includes(a.deliveryStatus) || /uncertain submission/i.test(a.notes || ''));
        const applied = current.some(a => a.appliedAt && a.appliedAt >= run.createdAt);
        const checks = run.monitoringRuleId ? store.monitoringChecks(run.id, companyId) : [];
        const sourceBlocker = checks.find(check => check.status !== 'checked');
        const needs = current.some(a => a.status === 'needs_user');
        const failure = current.some(a => a.status === 'error');
        const progressLabels = { account_created: 'Account created', profile_created: 'Profile completed', cv_uploaded: 'CV uploaded', cv_sent: 'CV sent for future opportunities', talent_pool_joined: 'Talent pool joined' };
        const progress = [...new Set(current.flatMap(application => application.milestones || []).filter(milestone => milestone.at >= run.createdAt && progressLabels[milestone.event]).map(milestone => progressLabels[milestone.event]))];
        const status = applied ? 'applied' : uncertain ? 'uncertain' : sourceBlocker || needs ? 'needs_you' : failure ? 'failed' : result.status === 'finished' && (current.length || checks.length) ? 'checked' : result.status === 'finished' ? 'needs_you' : result.status === 'stopped' ? 'needs_you' : result.status;
        const reason = applied ? 'Submission recorded with evidence.' : uncertain ? 'Inspect the previous submission before retrying.' : sourceBlocker ? sourceBlocker.reason : needs || failure ? (current.find(a => a.status === (needs ? 'needs_user' : 'error'))?.notes || 'Check application history.') : result.reason || (result.status === 'stopped' ? 'Stopped. Inspect any open application before retrying.' : checks.length ? `${checks.reduce((sum, check) => sum + check.matches, 0)} matching jobs found. See monitored jobs.` : progress.length ? `${progress.join('; ')}. See application history.` : current.length ? 'Company checked. See application history.' : 'No outcome recorded. Check assistant access and try again.');
        store.finishRunTarget(run.id, companyId, { status, reason, usage: sanitizeAssistantUsage(result.usage), ...(typeof result.durationMs === 'number' && Number.isFinite(result.durationMs) && result.durationMs >= 0 ? { durationMs: result.durationMs } : {}) });
        if (!applied && status === 'checked') { const c = store.getCompany(companyId); store.updateCompany(companyId, { expectedRevision: c.revision, nextAction: reason }); }
        if (result.global && store.getRun(run.id).status === 'running') { store.updateRun(run.id, { status: 'failed', notes: reason }); break; }
      }
      if (store.getRun(run.id).status === 'running') store.updateRun(run.id, { status: 'completed', notes: 'Finished this pass. Run again to retry unfinished companies.' });
    } catch {
      if (store.getRun(run.id).status === 'running') store.updateRun(run.id, { status: 'failed', notes: 'The queue stopped unexpectedly. Press Run to retry unfinished companies.' });
    } finally { if (active?.id === run.id) active = null; }
  }
  return {
    assistants,
    busy: () => Boolean(active || starting),
    preview: input => store.previewRun(input),
    async start(input) {
      assertOpen();
      if (active || starting) throw new AppError('A run is already starting or working. Stop it before starting another.');
      starting = true;
      const controller = new AbortController(); preflight = controller;
      try {
      if (input.explicit !== true || input.mode !== 'send_and_submit') throw new AppError('Press Run explicitly to authorize applications.');
      let previousProcess;
      try { previousProcess = JSON.parse(await readFile(ownedProcess, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw new AppError('Check the previous assistant process before starting another Run.'); }
      assertOpen(controller.signal);
      if (previousProcess && processAlive(previousProcess.pid)) throw new AppError(`The previous assistant process (${previousProcess.pid}) may still be running. Close it before starting another Run.`);
      const executable = (await discover()).find(a => a.id === input.assistant && a.installed);
      assertOpen(controller.signal);
      if (!executable) throw new AppError('Install and sign in to your chosen assistant, then press Run again.');
      await checkReady(executable, { signal: controller.signal });
      assertOpen(controller.signal);
      if (active) throw new AppError('A run is already working.');
      try { const owner = JSON.parse(await readFile(ownedProcess, 'utf8')); if (processAlive(owner.pid)) throw new AppError('The previous assistant is still running. Close it before another Run.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      assertOpen(controller.signal);
      const run = store.startManagedRun(input);
      active = { id: run.id, controller, done: null };
      active.done = work(run, executable, controller.signal);
      return run;
      } finally { if (preflight === controller) preflight = null; starting = false; }
    },
    async startMonitoring(ruleId) {
      assertOpen();
      if (active || starting) throw new AppError('A run is already starting or working. Stop it before starting another.');
      starting = true;
      const controller = new AbortController(); preflight = controller;
      try {
        const rule = store.getMonitoringRule(ruleId);
        let previousProcess;
        try { previousProcess = JSON.parse(await readFile(ownedProcess, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw new AppError('Check the previous assistant process before monitoring.'); }
        assertOpen(controller.signal);
        if (previousProcess && processAlive(previousProcess.pid)) throw new AppError('The previous assistant may still be running. Close it before another check.');
        const executable = (await discover()).find(item => item.id === rule.assistant && item.installed);
        assertOpen(controller.signal);
        if (!executable) throw new AppError('Install and sign in to your chosen assistant before monitoring.');
        await checkReady(executable, { signal: controller.signal });
        assertOpen(controller.signal);
        try { const owner = JSON.parse(await readFile(ownedProcess, 'utf8')); if (processAlive(owner.pid)) throw new AppError('The previous assistant is still running. Close it before another check.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        assertOpen(controller.signal);
        const run = store.startMonitoringRun(ruleId);
        active = { id: run.id, controller, done: null };
        active.done = work(run, executable, controller.signal);
        return run;
      } finally { if (preflight === controller) preflight = null; starting = false; }
    },
    async stop(id) {
      const run = store.getRun(id);
      if (run.status === 'running') store.updateRun(id, { status: 'cancelled', notes: 'Stopped. Run again to retry unfinished companies.' });
      if (active?.id === id) { const running = active; running.controller.abort(); await running.done; }
      return store.getRun(id);
    },
    async close() { closed = true; preflight?.abort(); if (active) await this.stop(active.id); },
    async settled() { await active?.done; },
  };
}
