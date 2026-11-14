import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { importProviderDependency } from '../provider-dependencies.mjs';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
];
const AUTH_LIFETIME_MS = 10 * 60_000;
const REQUEST_OPTIONS = { timeout: 20_000, retry: false };
const MAX_REPLY_LENGTH = 100_000;

export const GMAIL_MAPPINGS = {
  sendEmail: {
    tool: 'gmail_send_email',
    arguments: { to: '{{to}}', subject: '{{subject}}', body: '{{body}}', idempotencyKey: '{{idempotencyKey}}' },
  },
  readThread: { tool: 'gmail_read_thread', arguments: { threadId: '{{threadId}}' } },
  reconcileSend: { tool: 'gmail_reconcile_send', arguments: { idempotencyKey: '{{idempotencyKey}}' } },
  profile: { tool: 'gmail_profile', arguments: {} },
};

const TOOLS = [
  {
    name: 'gmail_send_email',
    description: 'Submit one plain-text email through the signed-in Gmail account. Returns the actual provider message and thread IDs; acceptance is not delivery. Use the tracker application/report send operation so its authorization and duplicate guards run first.',
    inputSchema: {
      type: 'object', properties: {
        to: { type: 'string', description: 'One exact recipient email address.' },
        subject: { type: 'string', maxLength: 1000 },
        body: { type: 'string', maxLength: 20000 },
        idempotencyKey: { type: 'string', description: 'Tracker send intent, used for a diagnostic message header. Gmail does not deduplicate on this value.' },
      }, required: ['to', 'subject', 'body', 'idempotencyKey'], additionalProperties: false,
    },
  },
  {
    name: 'gmail_read_thread',
    description: 'Read one recorded Gmail thread and normalize incoming messages. Does not search the mailbox or change messages.',
    inputSchema: { type: 'object', properties: { threadId: { type: 'string', minLength: 1, maxLength: 256 } }, required: ['threadId'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'gmail_reconcile_send',
    description: 'Check Sent for one previously reserved tracker send intent. Read-only; never resends. Returns a confirmed receipt only when one actual SENT message matches its exact Message-ID, sender and recipient.',
    inputSchema: { type: 'object', properties: { idempotencyKey: { type: 'string', minLength: 1, maxLength: 1000 } }, required: ['idempotencyKey'], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'gmail_profile', description: 'Read the signed-in mailbox address. Does not read messages.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true },
  },
];

const clone = value => structuredClone(value);
const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });

function exactAddress(value) {
  if (typeof value !== 'string' || /[\r\n\0]/.test(value)) return '';
  const candidate = value.trim().match(/<([^<>]+)>\s*$/)?.[1] || value.trim();
  return /^[^\s@<>,;:]+@[^\s@<>,;:]+\.[^\s@<>,;:]+$/.test(candidate) ? candidate : '';
}

function rawAddress(value) {
  if (typeof value !== 'string' || value !== value.trim() || /[\r\n\0<>]/.test(value)) return '';
  return exactAddress(value);
}

function header(part, name) {
  const values = (Array.isArray(part?.headers) ? part.headers : []).filter(item => String(item?.name).toLowerCase() === name.toLowerCase());
  return values.length === 1 && typeof values[0].value === 'string' ? values[0].value : '';
}

function decodeBody(part) {
  const data = part?.body?.data;
  if (typeof data !== 'string' || !/^[a-zA-Z0-9_+/-]*={0,2}$/.test(data)) return '';
  const bytes = Buffer.from(data, 'base64url');
  const charset = header(part, 'content-type').match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1] || 'utf-8';
  try { return new TextDecoder(charset).decode(bytes); }
  catch { return bytes.toString('utf8'); }
}

function htmlText(value) {
  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\b[^>]*>|<\/(?:p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|nbsp|amp|lt|gt|quot|apos);/gi, (full, entity) => {
      if (entity[0] === '#') {
        const point = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : full;
      }
      return { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity.toLowerCase()] || full;
    })
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function messageBody(payload) {
  const plain = [], html = [];
  let visited = 0;
  function walk(part, depth = 0) {
    if (!part || depth > 30 || ++visited > 500) return;
    // Attachments and attached messages are not the incoming email body.
    if (part.filename || /^attachment\b/i.test(header(part, 'content-disposition')) || String(part.mimeType).toLowerCase() === 'message/rfc822') return;
    const mime = String(part.mimeType || '').toLowerCase();
    if (mime === 'text/plain') plain.push(decodeBody(part));
    else if (mime === 'text/html') html.push(htmlText(decodeBody(part)));
    for (const child of Array.isArray(part.parts) ? part.parts : []) walk(child, depth + 1);
  }
  walk(payload);
  return (plain.some(value => value.trim()) ? plain : html).filter(Boolean).join('\n').replace(/\r\n?/g, '\n').trim();
}

/** Gmail's full thread format to the tracker's exact-thread incoming reply contract. */
export function normalizeGmailThread(thread, { account, threadId } = {}) {
  if (!isObject(thread) || typeof threadId !== 'string' || thread.id !== threadId || !Array.isArray(thread.messages)) {
    throw new Error('Gmail did not return the requested thread. Check the recorded thread ID.');
  }
  const own = exactAddress(account)?.toLowerCase();
  if (!own) throw new Error('Read the connected Gmail profile before checking replies.');
  const replies = [];
  for (const message of thread.messages) {
    if (!isObject(message) || typeof message.id !== 'string' || !message.id || message.threadId !== threadId) continue;
    const labels = Array.isArray(message.labelIds) ? message.labelIds : [];
    if (labels.includes('SENT') || labels.includes('DRAFT')) continue;
    const from = exactAddress(header(message.payload, 'from'));
    if (!from || from.toLowerCase() === own) continue;
    const milliseconds = Number(message.internalDate);
    if (!/^\d+$/.test(String(message.internalDate)) || !Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > 8.64e15) continue;
    const body = messageBody(message.payload);
    replies.push({
      id: message.id, threadId, from,
      receivedAt: new Date(milliseconds).toISOString(),
      body: body.slice(0, MAX_REPLY_LENGTH),
      ...(body.length > MAX_REPLY_LENGTH ? { bodyTruncated: true } : {}),
    });
  }
  return { provider: 'gmail', threadId, replies: replies.sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt)) };
}

function encodedSubject(value) {
  const chunks = [];
  let chunk = '';
  for (const character of value) {
    if (Buffer.byteLength(chunk + character) > 42) { chunks.push(chunk); chunk = ''; }
    chunk += character;
  }
  if (chunk) chunks.push(chunk);
  return chunks.map(part => `=?UTF-8?B?${Buffer.from(part, 'utf8').toString('base64')}?=`).join('\r\n ');
}

export function gmailMessageIdForIntent(idempotencyKey, account) {
  if (typeof idempotencyKey !== 'string' || !idempotencyKey || idempotencyKey.length > 1000 || !rawAddress(account)) throw new Error('A tracked send key and connected Gmail account are required.');
  const hash = createHash('sha256').update(`${account.toLowerCase()}\0${idempotencyKey}`).digest('hex');
  return `<apply-tracker.${hash}@localhost>`;
}

export function gmailSendFingerprint({ to, from, subject, body }) {
  return createHash('sha256').update(JSON.stringify([from.toLowerCase(), to.toLowerCase(), subject, body])).digest('hex');
}

/** Verify actual Gmail Sent metadata, including the exact message generated for a reserved intent. */
export function gmailSentReceipt(message, { messageHeaderId, account, to } = {}) {
  if (typeof message?.id !== 'string' || !message.id || typeof message.threadId !== 'string' || !message.threadId || !message.labelIds?.includes('SENT')) return null;
  if (header(message.payload, 'message-id').trim() !== messageHeaderId) return null;
  if (rawAddress(header(message.payload, 'to').trim()).toLowerCase() !== String(to).toLowerCase()) return null;
  if (exactAddress(header(message.payload, 'from')).toLowerCase() !== String(account).toLowerCase()) return null;
  return { provider: 'gmail', status: 'sent', messageId: message.id, threadId: message.threadId, reconciled: true };
}

/** Header-safe RFC 5322/MIME message encoded as the Gmail API's base64url raw field. */
export function buildGmailRawMessage({ to, subject, body, from, idempotencyKey }) {
  if (!rawAddress(to) || !rawAddress(from)) throw new Error('Gmail needs one valid recipient and the connected mailbox address.');
  if (typeof subject !== 'string' || !subject.trim() || subject.length > 1000 || /[\r\n\0]/.test(subject)) throw new Error('The email subject must be one line, under 1,000 characters.');
  if (typeof body !== 'string' || !body.trim() || body.length > 20000 || body.includes('\0')) throw new Error('The email body must contain text under 20,000 characters.');
  if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || idempotencyKey.length > 1000)) throw new Error('The tracker send intent must be text under 1,000 characters.');
  const body64 = Buffer.from(body.replace(/\r\n?/g, '\n').replace(/\n/g, '\r\n'), 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || '';
  const intent = idempotencyKey ? createHash('sha256').update(idempotencyKey).digest('hex') : null;
  const message = [
    `From: ${from}`, `To: ${to}`, `Subject: ${encodedSubject(subject)}`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64',
    ...(intent ? [`Message-ID: ${gmailMessageIdForIntent(idempotencyKey, from)}`, `X-Apply-Tracker-Intent: ${intent}`] : []), '', body64, '',
  ].join('\r\n');
  return Buffer.from(message, 'utf8').toString('base64url');
}

function secureEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function publicError(error, operation) {
  const status = Number(error?.response?.status || error?.status || error?.code);
  const code = error?.response?.data?.error;
  if (status === 401 || code === 'invalid_grant' || error?.code === 'invalid_grant') return new Error('Gmail sign-in expired or was revoked. Choose Connect Gmail to sign in again.');
  if (status === 403) return new Error('Gmail denied this operation. Enable the Gmail API and reconnect with permission to read application replies and send email.');
  if (status === 429) return new Error('Gmail is temporarily limiting requests. Try again later; a send will not be retried automatically.');
  return new Error(operation === 'send'
    ? 'Gmail did not return a confirmed send result. Check Sent before retrying; the tracker will not resend automatically.'
    : 'Gmail could not complete this request. Check your connection and sign in again if needed.');
}

async function defaultOAuthClient(options, dataDir) {
  const { OAuth2Client } = await importProviderDependency('google-auth-library', { dataDir });
  return new OAuth2Client(options);
}

async function defaultGmailClient(auth, dataDir) {
  const { gmail } = await importProviderDependency('@googleapis/gmail', { dataDir });
  return gmail({ version: 'v1', auth });
}

/** Private native adapter. Browser opening and application authorization belong to the local manager/domain. */
export function createGmailProvider({
  config = {}, auth = {}, dataDir, redirectUrl, saveAuth = async () => {},
  createOAuthClient = options => defaultOAuthClient(options, dataDir), createGmailClient = auth => defaultGmailClient(auth, dataDir),
  now = Date.now,
} = {}) {
  let saved = clone(auth);
  let oauth, gmail, initialized, account, connectionJob, saveQueue = Promise.resolve();

  function persist() {
    const snapshot = clone(saved);
    saveQueue = saveQueue.catch(() => {}).then(() => saveAuth(snapshot));
    return saveQueue;
  }

  function mergeTokens(tokens) {
    const valid = Object.fromEntries(Object.entries(tokens || {}).filter(([, value]) => value !== undefined && value !== null && value !== ''));
    saved.tokens = { ...(saved.tokens || {}), ...valid };
    return persist();
  }

  async function initialize() {
    if (initialized) return initialized;
    initialized = (async () => {
      const clientId = config.oauth?.clientId || process.env.APPLY_TRACKER_GOOGLE_CLIENT_ID;
      const clientSecret = config.oauth?.clientSecret || process.env.APPLY_TRACKER_GOOGLE_CLIENT_SECRET;
      if (typeof clientId !== 'string' || !clientId.trim() || /[\r\n\0]/.test(clientId)) {
        throw new Error('Add a Google OAuth Desktop client ID in connection setup, or set APPLY_TRACKER_GOOGLE_CLIENT_ID.');
      }
      const redirect = new URL(redirectUrl);
      if (redirect.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(redirect.hostname) || redirect.username || redirect.password || redirect.search || redirect.hash) {
        throw new Error('Gmail sign-in needs an HTTP callback on this computer.');
      }
      oauth = await createOAuthClient({ clientId: clientId.trim(), clientSecret, redirectUri: redirect.href });
      oauth.setCredentials(saved.tokens || {});
      oauth.on?.('tokens', tokens => { void mergeTokens(tokens).catch(() => {}); });
      gmail = await createGmailClient(oauth);
    })().catch(error => { initialized = null; throw error; });
    return initialized;
  }

  async function beginAuthorization() {
    const verifier = randomBytes(64).toString('base64url');
    const state = randomBytes(32).toString('base64url');
    saved.pending = { state, verifier, createdAt: now() };
    await persist();
    const authUrl = oauth.generateAuthUrl({
      access_type: 'offline', prompt: 'consent', include_granted_scopes: true,
      scope: [...SCOPES], state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
    });
    return { status: 'auth_required', authUrl };
  }

  async function loadProfile() {
    let response;
    try { response = await gmail.users.getProfile({ userId: 'me' }, REQUEST_OPTIONS); await saveQueue; }
    catch (error) { throw publicError(error, 'read'); }
    const email = exactAddress(response?.data?.emailAddress);
    if (!email) throw new Error('Gmail did not return a mailbox address. Reconnect Gmail before continuing.');
    account = email;
    if (saved.account !== email) { saved.account = email; await persist(); }
    return { provider: 'gmail', email };
  }

  async function connectInternal() {
    await initialize();
    if (typeof saved.tokens?.refresh_token !== 'string' || !saved.tokens.refresh_token) return beginAuthorization();
    // The Google token response lists granted scopes when available. Never mark a known partial grant ready.
    if (typeof saved.tokens.scope === 'string' && SCOPES.some(scope => !saved.tokens.scope.split(/\s+/).includes(scope))) return beginAuthorization();
    try {
      const profile = await loadProfile();
      return { status: 'connected', account: profile.email };
    } catch (error) {
      if (error.message.startsWith('Gmail sign-in expired')) return beginAuthorization();
      throw error;
    }
  }

  async function connect() {
    if (!connectionJob) connectionJob = connectInternal().finally(() => { connectionJob = null; });
    return connectionJob;
  }

  async function oauthCallback(query = {}) {
    await initialize();
    const get = key => query instanceof URLSearchParams ? query.get(key) : query?.[key];
    const pending = saved.pending;
    if (!pending || !secureEqual(get('state'), pending.state)) throw new Error('Gmail sign-in did not match this connection. Choose Connect Gmail to try again.');
    if (!Number.isFinite(pending.createdAt) || now() - pending.createdAt > AUTH_LIFETIME_MS || now() < pending.createdAt) {
      delete saved.pending; await persist();
      throw new Error('Gmail sign-in expired. Choose Connect Gmail to try again.');
    }
    delete saved.pending;
    await persist();
    if (get('error')) throw new Error('Gmail sign-in was not completed. Choose Connect Gmail when you are ready.');
    if (typeof get('code') !== 'string' || !get('code') || get('code').length > 4096) throw new Error('Gmail did not return a sign-in code. Choose Connect Gmail to try again.');
    const priorAccount = saved.account;
    const priorRefresh = saved.tokens?.refresh_token;
    let tokens;
    try {
      ({ tokens } = await oauth.getToken({ code: get('code'), codeVerifier: pending.verifier, redirect_uri: redirectUrl }));
    } catch (error) { throw publicError(error, 'read'); }
    if (!isObject(tokens) || typeof tokens.access_token !== 'string' || !tokens.access_token) throw new Error('Gmail did not return sign-in credentials. Choose Connect Gmail to try again.');
    await mergeTokens(tokens);
    oauth.setCredentials(saved.tokens);
    if (typeof saved.tokens.refresh_token !== 'string' || !saved.tokens.refresh_token) throw new Error('Gmail did not grant background access. Reconnect Gmail and approve access to keep scheduled checks working.');
    const connected = await connect();
    if (!tokens.refresh_token && priorRefresh && priorAccount && connected.status === 'connected' && connected.account.toLowerCase() !== priorAccount.toLowerCase()) {
      // A refresh token belongs to one account. Never attach an old account's token to a new grant.
      delete saved.tokens; delete saved.account; account = undefined;
      oauth.setCredentials({});
      await persist();
      throw new Error('This Gmail account needs its own background access. Reconnect Gmail and approve access for the selected account.');
    }
    return connected;
  }

  async function call(name, args = {}) {
    if (!TOOLS.some(tool => tool.name === name)) throw new Error('Choose one of the built-in Gmail tools.');
    if (!isObject(args)) throw new Error('Gmail tool arguments must be an object.');
    if (!account) {
      const state = await connect();
      if (state.status !== 'connected') throw new Error('Finish signing in to Gmail before using this connection.');
    }
    if (name === 'gmail_profile') return result(await loadProfile());
    if (name === 'gmail_read_thread') {
      if (typeof args.threadId !== 'string' || !/^[a-zA-Z0-9_-]{1,256}$/.test(args.threadId)) throw new Error('Choose one recorded Gmail thread ID.');
      let response;
      try { response = await gmail.users.threads.get({ userId: 'me', id: args.threadId, format: 'full' }, REQUEST_OPTIONS); await saveQueue; }
      catch (error) { throw publicError(error, 'read'); }
      return result(normalizeGmailThread(response?.data, { account, threadId: args.threadId }));
    }
    if (name === 'gmail_reconcile_send') {
      const messageHeaderId = gmailMessageIdForIntent(args.idempotencyKey, account);
      const key = createHash('sha256').update(args.idempotencyKey).digest('hex');
      const intent = saved.gmailOutbox?.[key];
      if (!intent || intent.messageHeaderId !== messageHeaderId || intent.account.toLowerCase() !== account.toLowerCase()) throw new Error('No Gmail send intent exists for this key and account. Check Sent manually; this action never sends.');
      let response;
      try {
        response = await gmail.users.messages.list({ userId: 'me', q: `in:sent rfc822msgid:${messageHeaderId}`, maxResults: 10 }, REQUEST_OPTIONS);
        const candidates = Array.isArray(response?.data?.messages) ? response.data.messages : [];
        const matches = [];
        for (const candidate of candidates) {
          if (typeof candidate?.id !== 'string' || !/^[a-zA-Z0-9_-]{1,256}$/.test(candidate.id)) continue;
          const actual = await gmail.users.messages.get({ userId: 'me', id: candidate.id, format: 'metadata', metadataHeaders: ['Message-ID', 'From', 'To'] }, REQUEST_OPTIONS);
          const receipt = gmailSentReceipt(actual?.data, intent);
          if (receipt) matches.push(receipt);
        }
        await saveQueue;
        if (matches.length !== 1 || response?.data?.nextPageToken) return result({ provider: 'gmail', status: matches.length > 1 || response?.data?.nextPageToken ? 'ambiguous' : 'unconfirmed', nextStep: 'Check Gmail Sent before retrying. No email was sent by this reconciliation.' });
        intent.receipt = matches[0]; intent.status = 'sent';
        await persist();
        return result(matches[0]);
      } catch (error) { throw publicError(error, 'read'); }
    }
    const raw = buildGmailRawMessage({ ...args, from: account });
    if (typeof args.idempotencyKey !== 'string' || !args.idempotencyKey) throw new Error('A tracked send key is required before Gmail can send. Use the tracker application or report operation.');
    let intent;
    if (args.idempotencyKey) {
      const key = createHash('sha256').update(args.idempotencyKey).digest('hex');
      const fingerprint = gmailSendFingerprint({ ...args, from: account });
      saved.gmailOutbox ||= {};
      intent = saved.gmailOutbox[key];
      if (intent) {
        if (intent.fingerprint !== fingerprint || intent.account.toLowerCase() !== account.toLowerCase()) throw new Error('This Gmail send key belongs to different email content or another account. Check the tracked application before continuing.');
        return result(intent.receipt || { provider: 'gmail', status: 'pending', nextStep: 'Reconcile this Gmail send or check Sent before retrying. The tracker will not resend this key.' });
      }
      intent = { fingerprint, account, to: args.to, messageHeaderId: gmailMessageIdForIntent(args.idempotencyKey, account), createdAt: new Date(now()).toISOString(), status: 'pending' };
      saved.gmailOutbox[key] = intent;
      await persist();
    }
    let response;
    try {
      // Never retry a provider write: a lost response can still mean Gmail accepted the message.
      response = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } }, REQUEST_OPTIONS);
      await saveQueue;
    } catch (error) { throw publicError(error, 'send'); }
    const data = response?.data;
    if (typeof data?.id !== 'string' || !data.id) throw new Error('Gmail returned no message ID. Check Sent before retrying; the tracker will not resend automatically.');
    const receipt = {
      provider: 'gmail', status: 'accepted', messageId: data.id,
      ...(typeof data.threadId === 'string' && data.threadId ? { threadId: data.threadId } : {}),
    };
    if (intent) { intent.receipt = receipt; intent.status = 'accepted'; await persist(); }
    return result(receipt);
  }

  return { mappings: clone(GMAIL_MAPPINGS), connect, oauthCallback, tools: () => clone(TOOLS), call, close: async () => { await saveQueue; } };
}
