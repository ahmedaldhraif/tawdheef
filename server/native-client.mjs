/** Pure local guidance and domain calls. All external tools belong to the AI client. */
export const sameCalendar = (a, b) => a === b || ['primary', 'default'].includes(a) && ['primary', 'default'].includes(b);
export function calendarTime(value) {
  let raw = typeof value === 'string' ? value : value?.dateTime || value?.date;
  if (typeof raw !== 'string' || raw.length > 100) return null;
  const day = raw.slice(0, 10), midnight = Date.parse(`${day}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day) return null;
  if (raw === day) { const offset = 14 * 60 * 60_000; return { value: midnight, earliest: midnight - offset, latest: midnight + offset }; }
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw) && ['UTC', 'Etc/UTC', 'GMT'].includes(value?.timeZone)) raw += 'Z';
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) return null;
  const instant = Date.parse(raw); return Number.isFinite(instant) ? { value: instant, earliest: instant, latest: instant } : null;
}
export function nativeRunPrompt(run) {
  return `Continue the user's explicitly authorized Tawdheef Run ${run.id} with ${run.assistant}. Read get_native_run and its saved actions before acting. Claim one company with claim_native_target, keep its claimToken, and work only on that target. Read the actual CV and preferences through your own authorized tools; Tawdheef stores guidance and local results only. Use your own browser/computer, mailbox, calendar and password-manager tools under their own permissions. Inspect existing accounts and uncertain intents before any action. Matching applications=${run.actions.applyMatchingJobs}; career profiles=${run.actions.createProfiles}; future CV emails=${run.actions.sendCvEmails}. Record real evidence and finish_native_target, then claim the next target. A blocker on one company does not authorize another action or a duplicate send. No nested Run, schedule creation or calendar write is authorized. Stop when the saved Run expires/stops. No application count cap applies.`;
}
export function createNativeClient({ store }) {
  return {
    get: input => store.getNativeClientStatus(input),
    report: input => store.reportNativeConnection(input),
    start(input) { const result = store.startNativeRun(input); return { ...result, handoff: { prompt: nativeRunPrompt(result.run) } }; },
    claim: input => store.claimNativeTarget(input),
    finish: input => store.finishNativeTarget(input),
    stop: input => store.stopNativeRun(input),
    recover: () => store.recoverNativeRuns(),
    check: input => store.beginNativeMonitoringCheck(input),
    record: input => store.recordNativeMonitoringCheck(input),
    getMonitoring: () => store.getMonitoring(),
    list: input => store.listMonitoringUpdates(input),
    connectionRequest({ assistant, kind, provider = '' } = {}) {
      assistant = store.getNativeClientStatus({ assistant }).assistant;
      if (!['assistant', 'cv', 'email', 'calendar', 'browser', 'computer', 'passwordManager'].includes(kind) || typeof provider !== 'string' || provider.length > 100 || /[\r\n\0]/.test(provider)) throw Object.assign(new Error('Choose a supported native connection and bounded provider name.'), { status: 400 });
      return { prompt: `In ${assistant}, check your own ${kind}${provider ? ` (${provider})` : ''} tools and connection. Sign-in, credentials, CV contents and password-manager access stay in your client. Read actual source metadata, then call report_native_connection for this assistant with a dated available/needs_you/unknown report. Never put passwords, tokens, cookies, raw CV text or credential files into Tawdheef. Report only observed identifiers, provider/account metadata and bounded evidence. This setup request does not authorize applications, sends, calendar writes or schedules.` };
    },
    async close() {},
  };
}
