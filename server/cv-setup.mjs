const connected = record => record?.status === 'connected';
const STATUS_ACTIONS = Object.freeze({ ready: 'none', verification_required: 'verify_email', cv_required: 'choose_or_create_cv', facts_required: 'provide_facts', approval_required: 'review_approval' });
const MISSING_FIELDS = new Set(['name', 'contact', 'experience', 'education', 'skills', 'summary', 'preferred_roles', 'preferred_locations']);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const opaque = (value, max = 200) => typeof value === 'string' && value.length > 0 && value.length <= max && /^[a-z0-9_.:-]+$/i.test(value);

function statusPayload(response) {
  if (!plain(response) || response.isError === true || (Object.hasOwn(response, 'error') && response.error !== null)) return null;
  let payload = response;
  if (Object.hasOwn(response, 'structuredContent')) {
    payload = response.structuredContent;
  } else if (Array.isArray(response.content)) {
    const text = response.content.filter(block => plain(block) && block.type === 'text');
    if (text.length !== 1 || typeof text[0].text !== 'string' || text[0].text.length > 32768) return null;
    try { payload = JSON.parse(text[0].text); } catch { return null; }
  }
  for (let depth = 0; depth < 3; depth++) {
    if (!plain(payload) || payload.isError === true || (Object.hasOwn(payload, 'error') && payload.error !== null)) return null;
    if (Object.hasOwn(payload, 'schemaVersion')) return payload;
    if (!Object.hasOwn(payload, 'data')) return null;
    payload = payload.data;
  }
  return null;
}

/** Normalize only the agreed read-only v1 status contract; never return provider text or IDs. */
export function normalizeCvSetupStatus(response) {
  const payload = statusPayload(response);
  if (!payload || payload.schemaVersion !== 1 || !Object.hasOwn(STATUS_ACTIONS, payload.status) || payload.nextAction !== STATUS_ACTIONS[payload.status]) return null;
  const account = payload.account;
  if (!plain(account) || !opaque(account.id) || typeof account.emailVerified !== 'boolean' || !Object.hasOwn(account, 'email')) return null;
  const email = account.email === null ? null : setupEmailHint(account.email);
  if (account.email !== null && email === null) return null;
  let cv = null;
  if (payload.cv !== null) {
    const input = payload.cv;
    if (!plain(input) || !opaque(input.id) || !Object.hasOwn(input, 'revision') || ![true, false, null].includes(input.readable) || ![true, false, null].includes(input.ready) || !Array.isArray(input.missingFields) || input.missingFields.length > 20 || input.missingFields.some(field => !MISSING_FIELDS.has(field))) return null;
    const revision = input.revision === null ? null : typeof input.revision === 'number' && Number.isSafeInteger(input.revision) && input.revision >= 0 ? String(input.revision) : opaque(input.revision, 100) ? input.revision : undefined;
    if (revision === undefined) return null;
    cv = { revision, readable: input.readable, ready: input.ready, missingFields: [...new Set(input.missingFields)] };
  }
  if (payload.status === 'ready' && (!account.emailVerified || !cv || cv.readable !== true || cv.ready !== true || cv.missingFields.length)) return null;
  if (payload.status === 'verification_required' ? account.emailVerified : !account.emailVerified) return null;
  if (payload.status === 'cv_required' && cv !== null) return null;
  if (payload.status === 'facts_required' && (!cv || cv.ready === true)) return null;
  return { schemaVersion: 1, status: payload.status, account: { email, emailVerified: account.emailVerified }, cv, nextAction: payload.nextAction };
}

/** An email hint is contact information, never evidence of a Tabbio sign-in. */
export function setupEmailHint(value) {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const address = value.trim();
  if (address.length > 254 || !/^[^\s@<>"(),;:\\]+@[a-z0-9.-]+\.[a-z]{2,63}$/i.test(address)) return null;
  return address;
}

function observedMailboxEmail(record) {
  if (!connected(record)) return null;
  const account = record.account;
  return setupEmailHint(typeof account === 'string' ? account : account?.email);
}

function connectionState(record) {
  if (connected(record)) return 'connected';
  if (record?.status === 'auth_required') return 'authentication_required';
  if (record?.status === 'error') return 'needs_action';
  return 'not_connected';
}

/** Pure local projection: no provider discovery, sign-in, CV read or write. */
export function buildCvSetupContext({ records = [], settings = {}, cvReadState = 'not_checked', remoteStatus = null } = {}) {
  const list = Array.isArray(records) ? records : [];
  const email = list.find(record => record?.kind === 'email');
  const cv = list.find(record => record?.kind === 'tabbio');
  const calendar = list.find(record => record?.kind === 'calendar');
  const preferredEmail = setupEmailHint(settings.applicationEmail);
  const mailboxEmail = observedMailboxEmail(email);
  const readConfigured = connected(cv) && Boolean(cv.mappings?.readCV?.tool);
  const readAccess = readConfigured && ['ready', 'needs_action'].includes(cvReadState) ? cvReadState : 'not_checked';
  // This capability is a passive, sanitized snapshot maintained by the connection
  // owner. Do not call connections.tools(): that method can initiate sign-in.
  const setupStatusAvailable = connected(cv) && cv.capabilities?.setupStatus?.available === true;
  const providerAccountEmail = remoteStatus?.account?.email || null;
  const suggestedEmail = preferredEmail || mailboxEmail;
  return {
    email: {
      optional: true,
      connected: connected(email),
      suggestedEmail,
      source: preferredEmail ? 'preference' : mailboxEmail ? 'connected_mailbox' : null,
      verifiedForTabbio: false,
    },
    cv: {
      connectionState: connectionState(cv),
      readConfigured,
      readAccess,
      setupStatusCapability: setupStatusAvailable ? 'available' : 'unavailable',
      remoteStatus,
      providerAccountEmail,
      accountMismatch: suggestedEmail && providerAccountEmail ? suggestedEmail.toLowerCase() !== providerAccountEmail.toLowerCase() : null,
      authoring: 'provider_required',
      inputChoices: [
        { id: 'existing_tabbio_cv', label: 'Use my Tabbio CV' },
        { id: 'cv_file_or_profile', label: 'Use my CV file or profile text' },
        { id: 'career_facts', label: 'Use my career details' },
      ],
      nextAction: remoteStatus && remoteStatus.nextAction !== 'none' ? remoteStatus.nextAction
        : readAccess === 'ready' && (!setupStatusAvailable || remoteStatus?.status === 'ready') ? 'shortlist'
        : cv?.status === 'auth_required' ? 'finish_tabbio_sign_in'
          : !connected(cv) ? 'connect_tabbio'
            : !readConfigured ? 'choose_cv_read_tool' : 'check_connections',
    },
    calendar: { optional: true, connected: connected(calendar) },
  };
}
