import { spawn } from 'node:child_process';
import { access, mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, delimiter } from 'node:path';
import { homedir } from 'node:os';
import { AppError } from './store.mjs';
import { createClientConfig, integrationPresets } from './integrations.mjs';
import { OPERATOR_TOOLS, operatorPrompt } from './operator-contract.mjs';

export async function discoverAssistants({ env = process.env, platform = process.platform, home = homedir() } = {}) {
  const dirs = [...new Set([...(env.PATH || env.Path || '').split(delimiter), join(home, '.local', 'bin'), ...(env.APPDATA ? [join(env.APPDATA, 'npm')] : [])].filter(Boolean))];
  return Promise.all(['codex', 'claude-code'].map(async id => {
    const binary = id === 'codex' ? 'codex' : 'claude';
    const candidates = dirs.flatMap(dir => [
      { command: join(dir, binary + (platform === 'win32' ? '.exe' : '')), args: [] },
      { command: process.execPath, args: [join(dir, 'node_modules', id === 'codex' ? '@openai/codex/bin/codex.js' : '@anthropic-ai/claude-code/cli.js')] },
      ...(platform === 'win32' ? [] : [{ command: process.execPath, args: [join(dir, '..', 'lib', 'node_modules', id === 'codex' ? '@openai/codex/bin/codex.js' : '@anthropic-ai/claude-code/cli.js')] }]),
    ]);
    for (const candidate of candidates) {
      try { await access(candidate.args[0] || candidate.command, platform === 'win32' || candidate.args.length ? constants.R_OK : constants.X_OK); return { id, name: id === 'codex' ? 'Codex' : 'Claude Code', installed: true, ...candidate }; } catch { /* Try the next standard local installation. */ }
    }
    return { id, name: id === 'codex' ? 'Codex' : 'Claude Code', installed: false };
  }));
}

export function launchArguments(assistant, config, cwd) {
  if (assistant === 'claude-code') return ['-p', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--strict-mcp-config', '--mcp-config', JSON.stringify({ mcpServers: config }), '--tools', 'Read,WebFetch,WebSearch', '--allowedTools', [...OPERATOR_TOOLS.map(name => `mcp__apply-tracker__${name}`), ...(config.playwright ? ['mcp__playwright__*'] : [])].join(','), '--permission-mode', 'default'];
  const args = ['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check', '--cd', cwd];
  for (const [name, server] of Object.entries(config)) for (const [key, value] of Object.entries(server)) {
    if (key === 'env') for (const [envKey, envValue] of Object.entries(value)) args.push('-c', `mcp_servers.${name}.env.${envKey}=${JSON.stringify(envValue)}`);
    else args.push('-c', `mcp_servers.${name}.${key}=${JSON.stringify(value)}`);
  }
  return [...args, '-'];
}

export async function checkAssistantAuthentication(executable) {
  const result = await executeAssistant({ executable: executable.command, args: [...executable.args, ...(executable.id === 'codex' ? ['login', 'status'] : ['auth', 'status'])], cwd: homedir(), env: process.env, timeoutMs: 15000 });
  if (result.status !== 'finished') throw new AppError(result.configurationError ? result.reason : `Open ${executable.name || executable.id}, finish signing in, then press Run again. If it is already signed in, update its CLI to a version that supports local runs.`);
}

/** One owned subprocess per company. No shell, raw agent log, hidden model or automatic retry. */
export function executeAssistant({ executable, args, prompt, cwd, env, signal, timeoutMs = 20 * 60_000, terminationMs = 3000, spawnProcess = spawn, onSpawn = async () => {} }) {
  return new Promise(resolve => {
    let child, timer, watchdog, escalation, settled = false, failed = false, authError = false, configError = false, limited = false, pending = '';
    const finish = result => { if (settled) return; settled = true; clearTimeout(timer); clearTimeout(watchdog); clearTimeout(escalation); signal?.removeEventListener('abort', abort); resolve(result); };
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
    const classify = text => { if (/error loading configuration|invalid config|unknown variant|unknown option|unrecognized (?:argument|option)/i.test(text)) configError = true; if (/not logged in|authentication failed|invalid_api_key|please (log|sign) in|login required|authentication_error/i.test(text)) authError = true; if (/rate_limit_error|usage limit|quota exceeded|rate limit exceeded/i.test(text)) limited = true; };
    // Inspect error envelopes only. Application text and model reasoning never become UI logs.
    child.stdout.on('data', chunk => {
      pending = (pending + chunk.toString()).slice(-256_000);
      const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) { try { const e = JSON.parse(line); if (e.type === 'error' || e.type === 'turn.failed' || e.is_error) { failed = true; classify(JSON.stringify(e.error || e.message || e.result || e)); } } catch { /* Non-JSON progress is not evidence. */ } }
    });
    child.stderr.on('data', chunk => classify(chunk.toString().slice(0,10000)));
    child.stdin.on('error', () => {});
    child.once('error', () => finish({ status: 'failed', reason: 'The assistant could not start. Check its installation.' }));
    child.once('close', code => finish(signal?.aborted ? { status: 'stopped' } : configError ? { status: 'needs_you', global: true, configurationError: true, reason: 'The assistant CLI cannot load its current configuration or run options. Update that CLI or correct its reported settings, then press Run again.' } : authError ? { status: 'needs_you', global: true, reason: 'Sign in to this assistant on this computer, then press Run again.' } : limited ? { status: 'needs_you', global: true, reason: 'The assistant reached its provider limit. Wait for it to reset, then press Run again.' } : timedOut ? { status: 'failed', reason: 'This company took too long. Check for a submission receipt before retrying.' } : code !== 0 || failed ? { status: 'failed', reason: 'The assistant could not finish this company. Check its application history, then retry with Run.' } : { status: 'finished' }));
    // Record ownership before the assistant receives any work. Restart can detect a stranded process.
    Promise.resolve(onSpawn(child.pid)).then(() => { if (signal?.aborted) kill(); else child.stdin.end(prompt); }).catch(() => { failed = true; kill(); });
  });
}

export function createAgentRunner({ store, port, discover = discoverAssistants, execute = executeAssistant, makeConfig = createClientConfig, presets = integrationPresets, checkReady = async () => {} }) {
  let active = null, starting = false;
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
      await writeFile(join(cwd, 'AGENTS.md'), 'Operate Tawdheef through its scoped MCP tools. Never change application source, configuration or private files. Follow the explicit company prompt.\n', { mode: 0o600 });
      for (const target of run.targets) {
        if (signal.aborted || store.getRun(run.id).status !== 'running') break;
        const companyId = target.companyId;
        store.beginRunTarget(run.id, companyId);
        const latestCompany = store.getCompany(companyId);
        if (latestCompany.archived || !['not_started', 'ready'].includes(latestCompany.status) || store.listApplications(companyId).some(a => a.appliedAt)) {
          store.finishRunTarget(run.id, companyId, { status: 'skipped', reason: 'Already submitted, completed or archived since this run began.' }); continue;
        }
        let result;
        try {
          const available = await presets({ dataDir: store.dataDir, port });
          const browser = available.find(p => p.id === 'playwright' && p.ready && p.browserInstalled);
          const config = await makeConfig({ dataDir: store.dataDir, port, include: browser ? ['playwright'] : [] });
          Object.assign(config.mcpServers['apply-tracker'].env, { APPLY_TRACKER_OPERATOR_RUN: run.id, APPLY_TRACKER_OPERATOR_COMPANY: companyId });
          if (run.assistant === 'codex') config.mcpServers['apply-tracker'].enabled_tools = OPERATOR_TOOLS;
          result = await execute({ executable: executable.command, args: [...executable.args, ...launchArguments(run.assistant, config.mcpServers, cwd)], prompt: operatorPrompt(run, companyId), cwd, env: { ...process.env, APPLY_TRACKER_DATA: store.dataDir, APPLY_TRACKER_PORT: String(port) }, signal, onSpawn: pid => writeFile(ownedProcess, JSON.stringify({ pid, runId: run.id }), { mode: 0o600 }) });
          if (!result.terminationUnconfirmed) await unlink(ownedProcess).catch(error => { if (error.code !== 'ENOENT') throw error; });
        } catch { result = { status: 'failed', reason: 'The assistant tools could not start. Check Connections and try again.' }; }
        const applications = store.listApplications(companyId);
        const current = applications.filter(a => a.runId === run.id);
        const uncertain = applications.some(a => ['sending', 'unknown'].includes(a.deliveryStatus) || /uncertain submission/i.test(a.notes || ''));
        const applied = applications.some(a => a.appliedAt);
        const needs = current.some(a => a.status === 'needs_user');
        const failure = current.some(a => a.status === 'error');
        const status = applied ? 'applied' : uncertain ? 'uncertain' : needs ? 'needs_you' : failure ? 'failed' : result.status === 'finished' && current.length ? 'checked' : result.status === 'finished' ? 'needs_you' : result.status === 'stopped' ? 'needs_you' : result.status;
        const reason = applied ? 'Submission recorded with evidence.' : uncertain ? 'Inspect the previous submission before retrying.' : needs || failure ? (current.find(a => a.status === (needs ? 'needs_user' : 'error'))?.notes || 'Check application history.') : result.reason || (result.status === 'stopped' ? 'Stopped. Inspect any open application before retrying.' : current.length ? 'Company checked. See application history.' : 'No outcome recorded. Check assistant access and try again.');
        store.finishRunTarget(run.id, companyId, { status, reason });
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
    preview: input => store.previewRun(input),
    async start(input) {
      if (active || starting) throw new AppError('A run is already starting or working. Stop it before starting another.');
      starting = true;
      try {
      if (input.explicit !== true || input.mode !== 'send_and_submit') throw new AppError('Press Run explicitly to authorize applications.');
      let previousProcess;
      try { previousProcess = JSON.parse(await readFile(ownedProcess, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw new AppError('Check the previous assistant process before starting another Run.'); }
      if (previousProcess && processAlive(previousProcess.pid)) throw new AppError(`The previous assistant process (${previousProcess.pid}) may still be running. Close it before starting another Run.`);
      const executable = (await discover()).find(a => a.id === input.assistant && a.installed);
      if (!executable) throw new AppError('Install and sign in to your chosen assistant, then press Run again.');
      await checkReady(executable);
      if (active) throw new AppError('A run is already working.');
      try { const owner = JSON.parse(await readFile(ownedProcess, 'utf8')); if (processAlive(owner.pid)) throw new AppError('The previous assistant is still running. Close it before another Run.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      const run = store.startManagedRun(input), controller = new AbortController();
      active = { id: run.id, controller, done: null };
      active.done = work(run, executable, controller.signal);
      return run;
      } finally { starting = false; }
    },
    async stop(id) {
      const run = store.getRun(id);
      if (run.status === 'running') store.updateRun(id, { status: 'cancelled', notes: 'Stopped. Run again to retry unfinished companies.' });
      if (active?.id === id) { const running = active; running.controller.abort(); await running.done; }
      return store.getRun(id);
    },
    async close() { if (active) await this.stop(active.id); },
    async settled() { await active?.done; },
  };
}
