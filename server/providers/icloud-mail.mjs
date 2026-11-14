import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { requireProviderDependency } from '../provider-dependencies.mjs';
import { buildGmailRawMessage, gmailMessageIdForIntent, gmailSendFingerprint } from './gmail.mjs';

export const ICLOUD_MAIL_MAPPINGS = {
  sendEmail: { tool: 'icloud_mail_send', arguments: { to: '{{to}}', subject: '{{subject}}', body: '{{body}}', idempotencyKey: '{{idempotencyKey}}' } },
  readThread: { tool: 'icloud_mail_thread', arguments: { threadId: '{{threadId}}' } },
  reconcileSend: { tool: 'icloud_mail_reconcile', arguments: { idempotencyKey: '{{idempotencyKey}}' } },
};
const result = value => ({ structuredContent: value, content: [{ type: 'text', text: JSON.stringify(value) }] });
const address = value => typeof value === 'string' && /^[^\s@<>,;:\r\n]+@[^\s@<>,;:\r\n]+\.[^\s@<>,;:\r\n]+$/.test(value) ? value.toLowerCase() : '';
const exactAddresses = (list, expected) => Array.isArray(list) && list.length === 1 && address(list[0].address) === address(expected);
const tools = [
  { name: 'icloud_mail_send', description: 'Send one tracker-authorized email through Apple SMTP. Acceptance is not delivery.', inputSchema: { type: 'object', properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }, idempotencyKey: { type: 'string' } }, required: ['to', 'subject', 'body', 'idempotencyKey'] } },
  { name: 'icloud_mail_thread', description: 'Read replies to one recorded application using exact reply headers.', inputSchema: { type: 'object', properties: { threadId: { type: 'string' } }, required: ['threadId'] }, annotations: { readOnlyHint: true } },
  { name: 'icloud_mail_reconcile', description: 'Inspect Sent for the original send intent. Never sends again.', inputSchema: { type: 'object', properties: { idempotencyKey: { type: 'string' } }, required: ['idempotencyKey'] }, annotations: { readOnlyHint: true } },
];

export function createICloudMailProvider({ config = {}, auth = {}, dataDir, saveAuth = async () => {}, createTransport = options => requireProviderDependency('nodemailer', { dataDir }).createTransport(options), createImap = options => new (requireProviderDependency('imapflow', { dataDir }).ImapFlow)(options), parse = source => { const module = requireProviderDependency('postal-mime', { dataDir }); return (module.default || module).parse(source); }, operationMs = 45000 } = {}) {
  const account = address(config.credentials?.username), password = config.credentials?.password;
  const ledgerPath = dataDir && join(dataDir, 'icloud-mail-intents.json');
  let saved = {};
  if (ledgerPath) { try { saved = JSON.parse(readFileSync(ledgerPath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw new Error('The iCloud tracking ledger could not be read. Restore it before sending.'); } }
  const outbox = { ...structuredClone(auth.icloudMailOutbox || {}), ...saved };
  const clients = new Set(), sockets = new Set(); let smtp, connected = false, closed = false;
  const abort = new AbortController();
  const alive = () => { if (closed) throw new Error('This email connection has closed.'); };
  const persist = async () => {
    alive();
    if (ledgerPath) {
      writeFileSync(ledgerPath + '.tmp', JSON.stringify(outbox), { mode: 0o600 });
      renameSync(ledgerPath + '.tmp', ledgerPath);
    } else await saveAuth({ ...auth, icloudMailOutbox: structuredClone(outbox) });
    alive();
  };
  const close = () => { closed = true; connected = false; abort.abort(); smtp?.close(); for (const socket of sockets) socket.destroy(); sockets.clear(); for (const client of clients) client.close(); clients.clear(); };
  // Own the TCP socket so a deadline also aborts SMTP verification/STARTTLS,
  // not only sendMail (whose pinned transport supports AbortSignal).
  function getSocket(_options, callback) {
    if (closed) return callback(new Error('Connection closed.'));
    const socket = createConnection({ host: 'smtp.mail.me.com', port: 587 });
    sockets.add(socket); let answered = false;
    const answer = (error, value) => { if (!answered) { answered = true; callback(error, value); } };
    socket.once('connect', () => closed ? answer(new Error('Connection closed.')) : answer(null, { connection: socket }));
    socket.once('error', error => answer(error));
    socket.once('close', () => { sockets.delete(socket); answer(new Error('Connection closed.')); });
  }
  async function bounded(action) {
    let timer;
    try { return await Promise.race([action(), new Promise((_, reject) => { timer = setTimeout(() => { close(); reject(new Error('iCloud Mail timed out. Reconnect, then inspect the original send before retrying.')); }, operationMs); })]); }
    finally { clearTimeout(timer); }
  }
  async function withImap(action) {
    alive();
    const client = createImap({ host: 'imap.mail.me.com', port: 993, secure: true, auth: { user: account, pass: password }, tls: { rejectUnauthorized: true }, logger: false, disableAutoIdle: true, connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 20000, maxLiteralSize: 300000, maxResponseSize: 1000000 });
    clients.add(client); client.on('error', () => {});
    try { await client.connect(); alive(); return await action(client); }
    finally { clients.delete(client); try { client.close(); } catch { /* Already disconnected. */ } }
  }
  async function connect() {
    alive();
    if (!account || !password || typeof password !== 'string') throw new Error('Enter your iCloud Mail address and an app-specific password from account.apple.com.');
    smtp ||= createTransport({ host: 'smtp.mail.me.com', port: 587, secure: false, requireTLS: true, auth: { user: account, pass: password }, tls: { rejectUnauthorized: true, servername: 'smtp.mail.me.com' }, getSocket, logger: false, debug: false, pool: false, connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 20000, disableFileAccess: true, disableUrlAccess: true });
    try { await smtp.verify(); await withImap(async () => {}); alive(); connected = true; return { status: 'connected', account }; }
    catch { throw new Error('iCloud Mail could not connect. Check your mail address, app-specific password and internet connection.'); }
  }
  const intent = key => {
    if (typeof key !== 'string' || !Object.hasOwn(outbox, key) || outbox[key].account !== account) throw new Error('No original iCloud send intent for this account. Do not send again.');
    return outbox[key];
  };
  async function sentMatches(original) {
    return withImap(async client => {
      const sent = (await client.list()).find(folder => folder.specialUse === '\\Sent');
      if (!sent) return [];
      const lock = await client.getMailboxLock(sent.path, { readOnly: true });
      try {
        const ids = await client.search({ header: { 'message-id': original.messageId } }, { uid: true });
        if (!Array.isArray(ids) || ids.length > 10) return [];
        if (!ids.length) return [];
        const messages = await client.fetchAll(ids, { uid: true, envelope: true, flags: true }, { uid: true });
        return messages.filter(m => m.envelope?.messageId === original.messageId && exactAddresses(m.envelope.from, account) && exactAddresses(m.envelope.to, original.to) && !m.flags?.has('\\Draft')).map(m => ({ uid: m.uid, folder: sent.path }));
      } finally { lock.release(); }
    });
  }
  async function send(args) {
    if (typeof args.idempotencyKey !== 'string' || !args.idempotencyKey || args.idempotencyKey.length > 1000 || ['__proto__', 'constructor', 'prototype'].includes(args.idempotencyKey)) throw new Error('Use the original tracker send key.');
    const fingerprint = gmailSendFingerprint({ from: account, ...args });
    const prior = Object.hasOwn(outbox, args.idempotencyKey) ? outbox[args.idempotencyKey] : null;
    if (prior) {
      if (prior.account !== account || prior.fingerprint !== fingerprint) throw new Error('This key belongs to a different email.');
      if (prior.receipt) return prior.receipt;
      return { status: 'unknown', reason: 'Inspect the original send. It will not be sent again.' };
    }
    const messageId = gmailMessageIdForIntent(args.idempotencyKey, account);
    const raw = Buffer.concat([Buffer.from(`Date: ${new Date().toUTCString()}\r\n`), Buffer.from(buildGmailRawMessage({ from: account, to: args.to, subject: args.subject, body: args.body, idempotencyKey: args.idempotencyKey }), 'base64url')]);
    const entry = { account, to: args.to, messageId, threadId: 'icloud:' + createHash('sha256').update(messageId).digest('hex'), fingerprint, createdAt: new Date().toISOString(), status: 'pending' };
    outbox[args.idempotencyKey] = entry;
    await persist(); // Never cross SMTP's write boundary before the durable intent.
    let receipt;
    try { alive(); receipt = await smtp.sendMail({ raw, envelope: { from: account, to: [args.to] }, disableFileAccess: true, disableUrlAccess: true, signal: abort.signal }); }
    catch { return { status: 'unknown', reason: 'iCloud did not return a send receipt. Inspect Sent before retrying.' }; }
    alive();
    if (!/^250[ -]/.test(receipt.response || '') || receipt.rejected?.length || receipt.accepted?.length !== 1 || address(receipt.accepted[0]) !== address(args.to)) return { status: 'unknown', reason: 'iCloud did not confirm this recipient. Inspect the original send.' };
    entry.receipt = { status: 'accepted', messageId, threadId: entry.threadId, provider: 'icloud-mail', smtpResponse: String(receipt.response).slice(0, 1000) };
    entry.status = 'accepted'; await persist();
    // SMTP has already accepted the email. A failed Sent copy must never cause a resend.
    try { await withImap(async client => { const sent = (await client.list()).find(folder => folder.specialUse === '\\Sent'); if (sent) await client.append(sent.path, raw, ['\\Seen']); }); } catch { /* The accepted receipt remains authoritative. */ }
    return entry.receipt;
  }
  async function thread(threadId) {
    const original = Object.values(outbox).find(entry => entry.account === account && entry.threadId === threadId && entry.receipt);
    if (!original) throw new Error('Read only a recorded iCloud application thread.');
    return withImap(async client => {
      const folders = await client.list(), replies = [];
      for (const folder of folders.filter(folder => folder.path.toUpperCase() === 'INBOX' || folder.specialUse === '\\Archive')) {
        const lock = await client.getMailboxLock(folder.path, { readOnly: true });
        try {
          const ids = await client.search({ since: new Date(original.createdAt), or: [{ header: { 'in-reply-to': original.messageId } }, { header: { references: original.messageId } }] }, { uid: true });
          if (!Array.isArray(ids) || ids.length > 50 || replies.length + ids.length > 50) throw new Error('This recorded thread has too many replies. Inspect it in iCloud Mail.');
          if (!ids.length) continue;
          const messages = await client.fetchAll(ids, { uid: true, envelope: true, size: true, internalDate: true, headers: ['in-reply-to', 'references'] }, { uid: true });
          for (const message of messages) {
            if (!exactAddresses(message.envelope?.from, original.to) || !message.envelope?.to?.some(to => address(to.address) === account)) continue;
            const headers = String(message.headers || '').replace(/\r?\n[ \t]+/g, ' ');
            const refs = [...headers.matchAll(/^(?:in-reply-to|references):\s*(.*)$/gmi)].flatMap(m => m[1].match(/<[^<>\s]+>/g) || []);
            if (!refs.includes(original.messageId)) continue;
            const date = new Date(message.internalDate || message.envelope.date);
            if (!Number.isFinite(+date) || +date < Date.parse(original.createdAt) || +date > Date.now() + 300000) continue;
            if (!Number.isFinite(message.size) || message.size > 256000) throw new Error('A reply has a large attachment. Inspect this application thread in iCloud Mail.');
            const fetched = await client.fetchOne(message.uid, { source: { start: 0, maxLength: 256000 } }, { uid: true });
            if (!fetched?.source || fetched.source.length > 256000 || fetched.source.length < message.size) throw new Error('The reply could not be read completely. Inspect it in iCloud Mail.');
            const parsed = await parse(fetched.source);
            replies.push({ id: `${folder.path}:${message.uid}`, threadId, from: original.to, receivedAt: date.toISOString(), body: String(parsed.text || '').slice(0, 100000) });
          }
        } finally { lock.release(); }
      }
      return { provider: 'icloud-mail', threadId, replies };
    });
  }
  return {
    mappings: ICLOUD_MAIL_MAPPINGS, tools: () => structuredClone(tools), connect: () => bounded(connect),
    async call(name, args = {}) { return bounded(async () => {
      alive(); if (!connected) await connect();
      if (name === 'icloud_mail_send') return result(await send(args));
      if (name === 'icloud_mail_thread') return result(await thread(args.threadId));
      if (name === 'icloud_mail_reconcile') {
        const original = intent(args.idempotencyKey);
        if (original.receipt) return result(original.receipt);
        const matches = await sentMatches(original);
        if (matches.length !== 1) return result({ status: 'unknown', reason: 'No single confirmed Sent message. Inspect the original email; do not resend.' });
        original.receipt = { status: 'sent', messageId: original.messageId, threadId: original.threadId, provider: 'icloud-mail', sentUid: matches[0].uid };
        await persist(); return result(original.receipt);
      }
      throw new Error('Unknown iCloud Mail action.');
    }); },
    close,
  };
}
