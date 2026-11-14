/** Explicit receipt recovery only. No provider, credential, browser or send access. */
export function createHistoricalReconciliation({ store, tx, now, ErrorType = Error }) {
  const require = (condition, message) => { if (!condition) throw new ErrorType(message); };
  const object = (value, allowed) => require(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key)), 'Use only the supported historical receipt fields.');
  const text = (value, label, max = 4000) => {
    require(typeof value === 'string' && value.trim() && value.length <= max && !/[\0\r\n]/.test(value), `Supply bounded one-line ${label}.`);
    require(!/\bbearer\s+\S+|\b(?:password|secret|token|authorization|cookie|api[_ -]?key)["']?\s*[:=]/i.test(value), 'Keep credentials and tokens out of receipt evidence.');
    return value;
  };
  const same = (actual, expected, label) => require(String(actual ?? '') === String(expected ?? ''), `Keep the exact original historical ${label}.`);
  return input => tx(() => {
    object(input, ['id', 'assistant', 'explicit', 'identity', 'outcome', 'evidence', 'sourceRead', 'receipt']);
    require(input.explicit === true, 'Historical recovery requires an explicit user request; it never permits sending or retrying.');
    require(['codex', 'claude-code'].includes(input.assistant), 'Use the actual selected Codex or Claude Code client.');
    require(['confirmed', 'not_sent'].includes(input.outcome), 'Choose an inspected confirmed receipt or verified not_sent; uncertainty stays unresolved.');
    const evidence = text(input.evidence, 'actual inspected receipt or verified non-delivery evidence');
    object(input.identity, ['companyId', 'runId', 'idempotencyKey', 'method', 'purpose', 'role', 'url', 'to', 'subject', 'createdAt']);
    text(input.identity.companyId, 'original company ID', 500);
    const application = store.listApplications(input.identity.companyId).find(item => item.id === input.id);
    require(application?.idempotencyKey && ['form', 'email'].includes(application.method), 'Choose the original reserved historical form or email intent.');
    const run = store.getRun(application.runId);
    require(!run.native && !application.nativePlan && !application.nativeAssistant, 'Native intents must use their original Native assistant and receipt tools.');
    require(run.status !== 'running', 'Stop the historical Run before reconciling its existing outcome.');
    require(['unknown', 'sending'].includes(application.deliveryStatus), 'Only unresolved historical intents can be reconciled; confirmed or cleared history stays immutable.');
    for (const key of ['companyId', 'runId', 'idempotencyKey', 'method', 'role', 'url', 'to', 'subject', 'createdAt']) same(input.identity[key], application[key], key);
    same(input.identity.purpose, application.purpose || 'application', 'purpose');
    object(input.sourceRead, ['method', 'url', 'sourceId', 'provider', 'accountId', 'observedAt', 'evidence']);
    text(input.sourceRead.evidence, 'fresh source-backed read evidence');
    text(input.sourceRead.observedAt, 'actual observation timestamp', 100);
    const current = Date.parse(now()), observed = Date.parse(input.sourceRead.observedAt);
    require(Number.isFinite(observed) && observed <= current + 300_000 && observed >= current - 900_000, 'Inspect the original source now and supply its actual fresh observedAt.');
    const provenance = { reportingAssistant: input.assistant, observedAt: new Date(observed).toISOString(), clientReported: true, independentlyVerified: false, evidence };
    let saved;
    if (application.method === 'form') {
      require(input.receipt === undefined, 'Record form confirmation in evidence; do not attach an email receipt.');
      require(input.sourceRead.method === 'native_browser', 'Inspect the original form outcome with the actual client browser.');
      same(input.sourceRead.url, application.url, 'form URL');
      saved = store.resolveFormSubmission({ id: application.id, outcome: input.outcome === 'confirmed' ? 'confirmed' : 'not_submitted', explicit: true, evidence: JSON.stringify({ confirmation: evidence, sourceRead: input.sourceRead, reconciliation: provenance }) }, { transaction: false });
    } else {
      const original = application.evidence && typeof application.evidence === 'object' ? application.evidence : {};
      require(original.provider && /^sha256:[a-f0-9]{64}$/.test(original.accountId || ''), 'Needs you: this old intent has no saved original mailbox identity. Keep it unresolved; inspect the original mailbox and ask the person for recovery help. Never assign it to the current mailbox or resend.');
      const mailbox = store.getNativeClientStatus({ assistant: input.assistant }).capabilities.email;
      require(mailbox.status === 'reported' && !mailbox.stale, 'Inspect and report the actual original mailbox in this client before historical recovery.');
      same(mailbox.provider, original.provider, 'mail provider'); same(mailbox.accountId, original.accountId, 'mailbox account');
      require(input.sourceRead.method === 'native_email', 'Inspect the original sent intent with the actual client mailbox tools.');
      same(input.sourceRead.sourceId, application.id, 'source ID'); same(input.sourceRead.provider, original.provider, 'source provider'); same(input.sourceRead.accountId, original.accountId, 'source mailbox');
      let receipt;
      if (input.outcome === 'confirmed') {
        object(input.receipt, ['providerMessageId', 'threadId', 'provider', 'accountId', 'from', 'to', 'subject', 'sentAt']);
        text(input.receipt.providerMessageId, 'actual sent message ID', 1000);
        same(input.receipt.provider, original.provider, 'receipt provider'); same(input.receipt.accountId, original.accountId, 'receipt mailbox');
        same(input.receipt.to, application.to, 'receipt recipient'); same(input.receipt.subject, application.subject, 'receipt subject');
        if (mailbox.accountEmail) same(input.receipt.from, mailbox.accountEmail, 'receipt sender');
        const sent = Date.parse(input.receipt.sentAt);
        require(Number.isFinite(sent) && sent >= Date.parse(application.createdAt) - 300_000 && sent <= current + 300_000, 'Use the actual message send time from the original receipt.');
        if (input.receipt.threadId !== undefined) text(input.receipt.threadId, 'actual thread ID', 2048);
        receipt = { ...input.receipt, provider: original.provider, accountId: original.accountId, reconciliation: provenance, clientReported: true };
      } else require(input.receipt === undefined, 'Verified non-delivery cannot include a sent receipt.');
      saved = store.finishEmailSend(application.id, { deliveryStatus: input.outcome === 'confirmed' ? 'confirmed' : 'failed', receipt, notes: JSON.stringify({ evidence, sourceRead: input.sourceRead, reconciliation: provenance }) }, { transaction: false });
    }
    return { application: saved, actionsAuthorized: false, maySend: false, clientReported: true, independentlyVerified: false, nextStep: 'The original outcome was recorded only. Any new work still needs a fresh explicit Native Run and claim.' };
  });
}
