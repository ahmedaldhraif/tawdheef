import { AppError } from './store.mjs';
import { expandMapping } from './connections.mjs';
import { assertRunPurpose } from '../src/run-actions.js';
import { createHash } from 'node:crypto';

function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }

export function unwrapToolResult(result) {
  if (object(result?.structuredContent)) return result.structuredContent;
  const blocks = (result?.content || []).filter(c => c.type === 'text').map(c => c.text);
  for (const text of [blocks.join('\n'), ...blocks]) {
    try { const value = JSON.parse(text); if (object(value)) return value; } catch { /* Plain text is not a machine receipt. */ }
  }
  return null;
}

function field(value, path) {
  if (typeof path !== 'string' || !path) return undefined;
  const keys = path.split('.');
  if (keys.some(k => ['__proto__', 'prototype', 'constructor'].includes(k))) return undefined;
  for (const key of keys) value = value?.[key];
  return value;
}

const SENT_STATES = ['sent', 'accepted', 'submitted'];
const PENDING_STATES = ['draft', 'pending', 'queued', 'approval_required', 'awaiting_approval', 'requires_approval'];
const FAILED_STATES = ['error', 'failed', 'rejected', 'cancelled', 'canceled', 'not_sent'];
const textId = value => (typeof value === 'string' && value.trim()) || (typeof value === 'number' && Number.isFinite(value) ? String(value) : null);

function emailReceiptScope(connection) {
  if (!connection || connection.status !== 'connected') return null;
  const provider = ({ 'google-cli': 'gmail', 'outlook-mcp': 'outlook' })[connection.provider] || connection.provider;
  const account = connection.account;
  const accountId = object(account) ? textId(account.id) : null;
  const email = object(account) ? textId(account.email) : textId(account);
  const identity = accountId ? `id:${accountId}` : email ? `email:${email.toLowerCase()}` : null;
  if (typeof provider !== 'string' || !provider.trim() || !identity) return null;
  return { provider: provider.trim().slice(0, 100), accountId: 'sha256:' + createHash('sha256').update(JSON.stringify([provider.trim(), identity])).digest('hex') };
}

function connectedReceiptScope(connections) {
  // Public observed identity only. Never inspect auth, tokens, credentials or
  // connection URLs; custom bridges without an identity remain unnamespaced.
  return typeof connections.list === 'function' ? emailReceiptScope(connections.list().find(item => item.kind === 'email')) : null;
}

function retainedReceiptScope(application) {
  const receipt = object(application.evidence) ? application.evidence : {};
  return typeof receipt.provider === 'string' && typeof receipt.accountId === 'string' && receipt.accountId.startsWith('sha256:')
    ? { provider: receipt.provider, accountId: receipt.accountId } : null;
}

/** An arbitrary `id` is not enough: drafts and approval requests also have IDs. */
export function confirmedEmailReceipt(result, mapping = {}) {
  if (result?.isError) return null;
  const data = unwrapToolResult(result);
  if (!data) return null;
  const envelope = object(data.data) ? data.data : data;
  for (const item of [result, data, envelope]) {
    const status = String(item?.status || item?.state || '').trim().toLowerCase();
    if (item?.error || item?.isError || item?.success === false || item?.approvalRequired || item?.requiresApproval || item?.pendingApproval || PENDING_STATES.includes(status) || FAILED_STATES.includes(status)) return null;
  }
  const receipt = mapping.receipt;
  if (object(receipt)) {
    const messageId = textId(field(data, receipt.messageIdPath));
    const observed = field(data, receipt.statusPath);
    const accepted = Array.isArray(receipt.successValues) ? receipt.successValues : ['sent', 'accepted', 'submitted', true];
    if (!messageId || !receipt.statusPath || !accepted.some(v => v === observed)) return null;
    return { providerMessageId: messageId, ...(textId(field(data, receipt.threadIdPath)) ? { threadId: textId(field(data, receipt.threadIdPath)) } : {}), source: 'mapped_mailbox_receipt' };
  }
  const explicitMessageId = textId(envelope.messageId || envelope.message_id || data.messageId || data.message_id);
  const messageId = explicitMessageId || textId(envelope.id);
  const status = String(envelope.status || envelope.state || data.status || data.state || '').toLowerCase();
  const hasSentLabel = Array.isArray(envelope.labelIds) && envelope.labelIds.includes('SENT');
  const confirmed = envelope.sent === true || data.sent === true || hasSentLabel || SENT_STATES.includes(status) || (explicitMessageId && (envelope.success === true || data.success === true));
  if (!messageId || !confirmed) return null;
  return { providerMessageId: messageId, ...(textId(envelope.threadId || envelope.thread_id) ? { threadId: textId(envelope.threadId || envelope.thread_id) } : {}), source: 'mailbox_send_receipt' };
}

/** Shared HTTP/MCP/CLI send path. No provider write happens before reservation. */
export async function sendEmailForRun({ store, connections, runId, input = {} }) {
  const { companyId, role, to, subject, body } = input;
  if (typeof companyId !== 'string' || typeof to !== 'string' || typeof subject !== 'string' || typeof body !== 'string' || !to.trim() || !subject.trim() || !body.trim()) {
    throw new AppError('Email needs a company, recipient, subject and body.');
  }
  if (/[\r\n]/.test(to) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new AppError('Choose one valid careers email address.');
  if (/[\r\n]/.test(subject)) throw new AppError('The email subject must be one line.');
  if (body.length > 20000 || subject.length > 1000 || (role != null && (typeof role !== 'string' || role.length > 500))) throw new AppError('Keep the role under 500 characters, subject under 1,000 and email under 20,000.');
  const intent = store.beginEmailSend({ runId, companyId, role, to: to.trim(), subject, body, ...(input.purpose !== undefined ? { purpose: input.purpose } : {}) });
  if (intent.reused) return { application: intent.application, reused: true, status: intent.application.status };
  const pending = intent.application;
  let providerCallStarted = false;
  try {
    const mapping = connections.getMappings('email').sendEmail;
    if (!mapping?.tool) throw new AppError('Choose the sendEmail tool in email connection settings first.');
    const args = expandMapping(mapping.arguments || {}, {
      to: to.trim(), recipient: to.trim(), subject, body, role: pending.role,
      companyId, applicationId: pending.id, runId, idempotencyKey: pending.idempotencyKey, purpose: pending.purpose || 'application',
    });
    const tools = await connections.tools('email');
    if (!tools.some(tool => tool.name === mapping.tool)) throw new AppError('The configured sendEmail tool is no longer available. Choose a tool from the connected mailbox.');
    // Discovery may require sign-in. Recheck authorization immediately before the write.
    const run = store.getRun(runId);
    if (run.status !== 'running' || !run.companyIds.includes(companyId) || (run.managed && run.activeCompanyId !== companyId)) throw new AppError('This run is no longer active. Start a new run before sending.');
    assertRunPurpose(run, pending.purpose || 'application');
    const receiptScope = connectedReceiptScope(connections);
    providerCallStarted = true;
    const result = await connections.call('email', mapping.tool, args);
    const receipt = confirmedEmailReceipt(result, mapping);
    if (!receipt) {
      const application = store.finishEmailSend(pending.id, {
        deliveryStatus: 'unknown',
        notes: 'The mailbox did not return a confirmed send receipt. Check Sent and any provider approval before retrying. This tracker will not resend automatically.',
      });
      return { application, status: 'needs_user', result };
    }
    const application = store.finishEmailSend(pending.id, {
      deliveryStatus: 'confirmed', receipt: { ...receipt, ...receiptScope },
      notes: pending.purpose === 'cv_share' ? 'The connected mailbox confirmed the CV email for future opportunities.' : 'The connected mailbox confirmed submission.',
    });
    return { application, status: application.status, result };
  } catch (error) {
    const application = store.finishEmailSend(pending.id, {
      deliveryStatus: providerCallStarted ? 'unknown' : 'failed',
      notes: providerCallStarted
        ? 'Sending did not return a confirmed result. Check Sent before retrying. This tracker will not resend automatically.'
        : `No email was sent. ${String(error.message || 'Review the email connection.').slice(0, 400)}`,
    });
    return { application, status: 'needs_user', error: String(error.message || 'The email could not be confirmed.').slice(0, 600) };
  }
}

/** Inspect the existing provider intent. This operation never sends or retries. */
export async function reconcileApplicationEmail({ store, connections, applicationId }) {
  const application = store.listApplications().find(item => item.id === applicationId);
  if (!application || application.method !== 'email' || !application.idempotencyKey) throw new AppError('Choose a recorded email application with a send intent.');
  if (application.deliveryStatus === 'confirmed') return { application, status: application.status, reused: true };
  const mapping = connections.getMappings('email').reconcileSend;
  if (!mapping?.tool) throw new AppError('This email connection cannot reconcile automatically. Inspect Sent and record the actual receipt; do not resend the application.');
  const tool = (await connections.tools('email')).find(item => item.name === mapping.tool);
  if (tool?.annotations?.readOnlyHint !== true) throw new AppError('Choose a discovered read-only reconciliation tool. This action cannot call a sending tool.');
  const result = await connections.call('email', mapping.tool, expandMapping(mapping.arguments || {}, { idempotencyKey: application.idempotencyKey, applicationId: application.id }));
  const receipt = confirmedEmailReceipt(result, mapping);
  if (!receipt) return { application, status: 'needs_user', result };
  // A current connection may be a different mailbox from an older intent.
  // Retain known original provenance; do not assign historical sends to whoever
  // happens to be connected when an old receipt is reconciled.
  const updated = store.finishEmailSend(application.id, { deliveryStatus: 'confirmed', receipt: { ...receipt, ...retainedReceiptScope(application) }, notes: 'The existing send was reconciled from the connected mailbox. No new email was sent.' });
  return { application: updated, status: updated.status, result };
}
