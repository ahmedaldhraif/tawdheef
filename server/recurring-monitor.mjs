/** The running local app is the single monitoring scheduler and agent owner. */
export function createMonitoring({ store, agentRunner, clock = () => new Date(), refreshApplications = null }) {
  let active = null;
  let applicationRefresher = refreshApplications;
  store.interruptMonitoringRules();
  const cancel = async id => {
    const rule = store.getMonitoringRule(id);
    if (rule.activeRunId) await agentRunner.stop(rule.activeRunId);
  };
  const check = async (id, { explicit = false, scheduled = false } = {}) => {
    if (!scheduled && explicit !== true) throw new Error('Explicitly request this monitoring check.');
    if (active) throw new Error('A monitoring check is already working.');
    const previous = store.getMonitoringRule(id);
    const run = await agentRunner.startMonitoring(id);
    active = run.id;
    const stillAuthorized = () => { const rule = store.getMonitoringRule(id); return rule.enabled && rule.revision === run.monitoringRuleRevision && (!rule.expiresAt || Date.parse(rule.expiresAt) > new Date(clock()).getTime()); };
    const applicationRefresh = Promise.resolve().then(async () => {
      if (applicationRefresher) return applicationRefresher(run.companyIds, { shouldContinue: stillAuthorized });
      const outcomes = store.listApplications().filter(application => run.companyIds.includes(application.companyId) && (application.appliedAt || application.cvSentAt)).map(application => ({ applicationId: application.id, companyId: application.companyId, role: application.role || '', method: application.method, applicationStatus: application.status, status: 'unavailable', reason: 'Application thread refresh is not connected. The recorded outcome is unchanged.', checkedAt: null }));
      return { status: outcomes.length ? 'unavailable' : 'no_threads', message: outcomes.length ? 'Application thread refresh is not connected; recorded statuses are not freshly verified.' : 'No tracked submissions exist for these companies yet.', checked: 0, updated: 0, skipped: 0, unavailable: outcomes.length, errors: [], outcomes };
    }).catch(error => ({ status: 'failed', message: String(error.message || error).slice(0, 600), checked: 0, updated: 0, skipped: 0, unavailable: 0, errors: [{ error: 'Application status checks failed.' }], outcomes: [] }));
    const done = Promise.all([agentRunner.settled(), applicationRefresh]).then(([, updates]) => {
      store.recordMonitoringApplicationRefresh(run.id, updates);
      const rule = store.finishMonitoringRun(run.id);
      const generatedAt = new Date(clock()).toISOString(), since = previous.lastCheckAt || run.createdAt;
      store.saveReport({ ...store.report({ since }), generatedAt, trackingScope: 'all_companies', monitoringRuleId: id, monitoringRuleName: rule.name, monitoring: store.monitoringReport({ since, until: generatedAt, ruleId: id }), delivery: { status: 'local' } });
      return rule;
    }).finally(() => { if (active === run.id) active = null; });
    // Persist a failure without exposing private CLI output or creating a retry loop.
    void done.catch(() => {});
    return run;
  };
  return {
    setApplicationRefresher(callback) { if (typeof callback !== 'function') throw new Error('Use the local application-thread refresher.'); applicationRefresher = callback; },
    list: input => store.listMonitoringRules(input),
    async save(input) { const previous = input.id ? store.getMonitoringRule(input.id) : null; const saved = store.saveMonitoringRule(input); if (previous?.activeRunId) await agentRunner.stop(previous.activeRunId); return saved; },
    async pause(id) { const saved = store.setMonitoringRuleStatus({ id, enabled: false }); await cancel(id); return saved; },
    async setStatus(input) { const previous = store.getMonitoringRule(input.id); const saved = store.setMonitoringRuleStatus(input); if (previous.activeRunId) await agentRunner.stop(previous.activeRunId); return saved; },
    check,
    getResults: input => store.getMonitoringResults(input),
    async tick() {
      if (active || agentRunner.busy?.()) return { started: false, reason: 'Another run is working.' };
      const current = new Date(clock()).getTime();
      const rule = store.listMonitoringRules().find(item => item.enabled && !item.expired && item.nextCheckAt && Date.parse(item.nextCheckAt) <= current);
      if (!rule) return { started: false };
      try { return { started: true, run: await check(rule.id, { scheduled: true }) }; }
      catch (error) { const reason = String(error.message || error).slice(0, 600); store.recordMonitoringFailure(rule.id, reason); return { started: false, reason }; }
    },
  };
}
