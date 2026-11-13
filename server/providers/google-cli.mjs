import { runGws } from '../integrations.mjs';
import { buildGmailRawMessage, normalizeGmailThread, gmailMessageIdForIntent, gmailSendFingerprint, gmailSentReceipt } from './gmail.mjs';

const result = data => ({ structuredContent: data, content: [{ type: 'text', text: JSON.stringify(data) }] });
export const GOOGLE_CLI_MAPPINGS = {
  sendEmail: { tool: 'google_cli_send_email', arguments: { to: '{{to}}', subject: '{{subject}}', body: '{{body}}', idempotencyKey: '{{idempotencyKey}}' } },
  readThread: { tool: 'google_cli_read_thread', arguments: { threadId: '{{threadId}}' } },
  profile: { tool: 'google_cli_profile', arguments: {} },
  reconcileSend: { tool: 'google_cli_reconcile_send', arguments: { idempotencyKey: '{{idempotencyKey}}' } },
};
const inputSchema = properties => ({ type: 'object', properties, additionalProperties: false, required: Object.keys(properties) });
const text = { type: 'string', minLength: 1 };
const TOOLS = [
  { name: 'google_cli_profile', description: 'Read the signed-in Gmail address through the local Google CLI.', inputSchema: inputSchema({}), annotations: { readOnlyHint: true } },
  { name: 'google_cli_read_thread', description: 'Read one recorded Gmail application thread through Google CLI.', inputSchema: inputSchema({ threadId: text }), annotations: { readOnlyHint: true } },
  { name: 'google_cli_send_email', description: 'Send one scoped application/report through Google CLI. Never retry an uncertain result.', inputSchema: inputSchema({ to: text, subject: text, body: text, idempotencyKey: text }) },
  { name: 'google_cli_reconcile_send', description: 'Read Gmail Sent for one original tracked send. Never sends or retries.', inputSchema: inputSchema({ idempotencyKey: text }), annotations: { readOnlyHint: true } },
];

export function createGoogleCliProvider({ dataDir, auth = {}, saveAuth = async () => {}, execute = runGws }) {
  let account = null;
  const command = (args, allowWrite = false) => execute(args, { dataDir, allowWrite });
  const api = (path, params, body) => command(['gmail', 'users', ...path, '--params', JSON.stringify({ userId: 'me', ...params }), ...(body ? ['--json', JSON.stringify(body)] : []), '--format', 'json'], Boolean(body));
  const profile = async () => {
    const data = await api(['getProfile'], {});
    if (typeof data?.emailAddress !== 'string' || !data.emailAddress.includes('@')) throw new Error('Google CLI did not return a Gmail account. Run npm run connect -- google-cli, then connect again.');
    if (account && data.emailAddress.toLowerCase() !== account.toLowerCase()) throw new Error('The Google CLI account changed. Reconnect the tracker to choose that mailbox before sending or checking tracked messages.');
    account = data.emailAddress;
    return { email: account };
  };
  return {
    mappings: GOOGLE_CLI_MAPPINGS,
    tools: () => structuredClone(TOOLS),
    async connect() {
      try { await profile(); return { status: 'connected', account }; }
      catch { throw new Error('Sign in to Google CLI first: npm run connect -- google-cli. Its sign-in stays on this computer. Then choose Connect again.'); }
    },
    async oauthCallback() { throw new Error('Google CLI owns this sign-in. Run npm run connect -- google-cli.'); },
    async call(name, args = {}) {
      if (name === 'google_cli_profile') return result(await profile());
      if (!account || ['google_cli_send_email', 'google_cli_reconcile_send'].includes(name)) await profile();
      if (name === 'google_cli_reconcile_send') {
        const intent = Object.hasOwn(auth.googleCliOutbox || {}, args.idempotencyKey) && auth.googleCliOutbox[args.idempotencyKey];
        if (!intent || intent.account !== account) throw new Error('No tracked send intent exists for this Google CLI account.');
        if (intent.receipt) return result(intent.receipt);
        const found = await api(['messages', 'list'], { q: `in:sent rfc822msgid:${intent.messageHeaderId}`, maxResults: 10 });
        if (found.nextPageToken || found.messages?.length !== 1) return result({ status: 'unknown', nextStep: 'Inspect Gmail Sent. No email was resent.' });
        const actual = await api(['messages', 'get'], { id: found.messages[0].id, format: 'metadata', metadataHeaders: ['From', 'To', 'Message-ID'] });
        const receipt = gmailSentReceipt(actual, intent);
        if (!receipt) return result({ status: 'unknown', nextStep: 'Inspect Gmail Sent. No matching receipt was found.' });
        intent.receipt = { ...receipt, provider: 'google-cli' }; await saveAuth(auth); return result(intent.receipt);
      }
      if (name === 'google_cli_read_thread') {
        if (typeof args.threadId !== 'string' || !/^[a-zA-Z0-9_-]{1,256}$/.test(args.threadId)) throw new Error('Choose one recorded Gmail thread ID.');
        const data = await api(['threads', 'get'], { id: args.threadId, format: 'full' });
        return result({ ...normalizeGmailThread(data, { account, threadId: args.threadId }), provider: 'google-cli' });
      }
      if (name !== 'google_cli_send_email') throw new Error('Unknown Google CLI action.');
      if (typeof args.idempotencyKey !== 'string' || !args.idempotencyKey || args.idempotencyKey.length > 300 || ['__proto__', 'prototype', 'constructor'].includes(args.idempotencyKey)) throw new Error('A tracked send key is required.');
      auth.googleCliOutbox ||= {};
      const raw = buildGmailRawMessage({ ...args, from: account });
      const fingerprint = gmailSendFingerprint({ ...args, from: account });
      if (Object.hasOwn(auth.googleCliOutbox, args.idempotencyKey)) {
        const intent = auth.googleCliOutbox[args.idempotencyKey];
        if (intent.fingerprint !== fingerprint || intent.account !== account) throw new Error('This send key belongs to a different Google CLI message.');
        return result(intent.receipt || { status: 'unknown', nextStep: 'Inspect Gmail Sent before retrying. This key will not be resent.' });
      }
      auth.googleCliOutbox[args.idempotencyKey] = { status: 'pending', account, to: args.to, fingerprint, messageHeaderId: gmailMessageIdForIntent(args.idempotencyKey, account), nextStep: 'Check Gmail Sent before retrying. The tracker will not resend this key.' };
      await saveAuth(auth);
      const data = await api(['messages', 'send'], {}, { raw });
      if (typeof data?.id !== 'string' || !data.id.trim() || typeof data?.threadId !== 'string' || !data.threadId.trim()
        || data.error || data.isError || data.success === false || data.requiresApproval || data.approvalRequired || data.pendingApproval
        || data.labelIds?.includes('DRAFT') || ['draft', 'pending', 'queued', 'approval_required', 'failed', 'error'].includes(String(data.status || data.state || '').toLowerCase())) return result(auth.googleCliOutbox[args.idempotencyKey]);
      const receipt = { status: 'accepted', messageId: data.id, threadId: data.threadId, provider: 'google-cli' };
      auth.googleCliOutbox[args.idempotencyKey].receipt = receipt;
      await saveAuth(auth);
      return result(receipt);
    },
    async close() {},
  };
}
