import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCvSetupContext, cvSetupSelectionMatches, normalizeCvSetupStatus, setupEmailHint } from '../server/cv-setup.mjs';

const providerReady = () => ({ schemaVersion: 1, status: 'ready', account: { id: 'account_fixture', email: 'cv@example.test', emailVerified: true }, cv: { id: 'cv_fixture', revision: 3, readable: true, ready: true, missingFields: [] }, nextAction: 'none' });

test('setup suggests only an explicit preference or an observed connected mailbox identity', () => {
  const mailbox = { kind: 'email', status: 'connected', account: { email: 'mailbox@example.test', displayName: 'Private fixture name', privateToken: 'NEVER-RETURN-THIS' } };
  const result = buildCvSetupContext({ records: [mailbox], settings: { applicationEmail: ' chosen@example.test ', reportEmail: 'reports@example.test' } });
  assert.equal(result.email.suggestedEmail, 'chosen@example.test');
  assert.equal(result.email.source, 'preference');
  assert.equal(result.email.verifiedForTabbio, false);
  assert.equal(buildCvSetupContext({ records: [mailbox] }).email.suggestedEmail, 'mailbox@example.test');
  assert.doesNotMatch(JSON.stringify(result), /Private fixture name|NEVER-RETURN-THIS|reports@example/);
  mailbox.status = 'auth_required';
  assert.equal(buildCvSetupContext({ records: [mailbox] }).email.suggestedEmail, null);
  assert.equal(buildCvSetupContext({ settings: { reportEmail: 'reports@example.test', cvText: 'email@cv.example' } }).email.suggestedEmail, null);
});

test('credential fields, display names and unsafe strings never become email hints', () => {
  for (const value of ['Name <owner@example.test>', 'owner@example.test\r\nsecret', 'https://owner@example.test', 'owner@example.test/path', 'not an address', 'a'.repeat(255) + '@example.test']) {
    assert.equal(setupEmailHint(value), null);
  }
  const result = buildCvSetupContext({ records: [{ kind: 'email', status: 'connected', credentialUsername: 'private@example.test', account: { displayName: 'name@example.test', profile: { email: 'nested@example.test' } } }] });
  assert.equal(result.email.suggestedEmail, null);
  assert.equal(buildCvSetupContext({ records: [{ kind: 'email', status: 'connected', account: 'gmail@example.test' }] }).email.suggestedEmail, 'gmail@example.test');
});

test('CV setup state reports read access separately from provider authoring and observed capability', () => {
  const cv = { kind: 'tabbio', status: 'connected', mappings: { readCV: { tool: 'fixture_read' } }, capabilities: { setupStatus: { available: true, tool: 'fixture_status' } }, url: 'https://private.example/cv' };
  const passive = buildCvSetupContext({ records: [cv] });
  assert.equal(passive.cv.readAccess, 'not_checked');
  assert.equal(passive.cv.setupStatusCapability, 'available');
  assert.equal(passive.cv.authoring, 'provider_required');
  assert.equal(passive.cv.nextAction, 'check_connections');
  assert.equal(buildCvSetupContext({ records: [cv], cvReadState: 'ready' }).cv.nextAction, 'check_connections');
  const unverified = buildCvSetupContext({ records: [cv], cvReadState: 'ready', remoteStatus: normalizeCvSetupStatus(providerReady()) });
  assert.equal(unverified.cv.nextAction, 'check_connections');
  assert.equal(unverified.cv.readSelection, 'unverified');
  const verified = buildCvSetupContext({ records: [cv], cvReadState: 'ready', remoteStatus: normalizeCvSetupStatus(providerReady()), readSelection: 'matched' });
  assert.equal(verified.cv.nextAction, 'shortlist');
  assert.equal(verified.cv.readSelection, 'matched');
  assert.doesNotMatch(JSON.stringify(passive), /private\.example|fixture_status|fixture_read/);
  cv.status = 'auth_required';
  const needsAuth = buildCvSetupContext({ records: [cv], cvReadState: 'ready' });
  assert.equal(needsAuth.cv.readAccess, 'not_checked');
  assert.equal(needsAuth.cv.setupStatusCapability, 'unavailable');
  assert.equal(needsAuth.cv.nextAction, 'finish_tabbio_sign_in');
  assert.equal(needsAuth.email.optional, true);
  assert.equal(needsAuth.calendar.optional, true);
});

test('ready setup binds the actual read to the same opaque account, CV and revision', () => {
  const snapshot = { schemaVersion: 1, accountId: 'account_fixture', cvId: 'cv_fixture', revision: '3' };
  const read = value => ({ _meta: { tabbioCvSnapshot: value } });
  const response = { structuredContent: { data: providerReady(), error: null } };
  assert.equal(cvSetupSelectionMatches(read(snapshot), response), true);
  assert.equal(cvSetupSelectionMatches(read({ ...snapshot, revision: 3 }), response), true);
  for (const value of [
    { ...snapshot, cvId: 'cv_different' },
    { ...snapshot, accountId: 'account_different' },
    { ...snapshot, revision: '4' },
    { ...snapshot, revision: null },
    { ...snapshot, revision: -1 },
    { ...snapshot, revision: '3 '.repeat(100) },
    { ...snapshot, schemaVersion: 2 },
    { ...snapshot, accountId: ' account_fixture' },
    { ...snapshot, cvId: 'cv_fixture/path' },
    { ...snapshot, cvId: 'x'.repeat(201) },
  ]) assert.equal(cvSetupSelectionMatches(read(value), response), false);
  for (const missing of [null, {}, { structuredContent: read(snapshot) }, { _meta: {} }, { isError: true, ...read(snapshot) }]) {
    assert.equal(cvSetupSelectionMatches(missing, response), false);
  }
  assert.equal(cvSetupSelectionMatches(read(snapshot), { isError: true, structuredContent: providerReady() }), false);
});

test('profile-backed master snapshots permit matching null revisions without widening selection', () => {
  const status = providerReady();
  status.cv = { ...status.cv, id: 'master', revision: null };
  const snapshot = { schemaVersion: 1, accountId: status.account.id, cvId: 'master', revision: null };
  assert.equal(cvSetupSelectionMatches({ _meta: { tabbioCvSnapshot: snapshot } }, { content: [{ type: 'text', text: JSON.stringify(status) }] }), true);
  assert.equal(cvSetupSelectionMatches({ _meta: { tabbioCvSnapshot: { ...snapshot, revision: 'null' } } }, status), false);
  assert.equal(cvSetupSelectionMatches({ _meta: { tabbioCvSnapshot: { ...snapshot, cvId: 'cv_fixture' } } }, status), false);
});

test('future setup status accepts only the agreed bounded v1 snapshot and strips provider IDs and extra data', () => {
  const input = providerReady();
  input.account.privateText = 'NEVER-RETURN-ACCOUNT';
  input.cv.summary = 'NEVER-RETURN-CV';
  const normalized = normalizeCvSetupStatus({ structuredContent: { data: input, error: null, meta: { privateUrl: 'https://private.example' } } });
  assert.equal(normalized.status, 'ready');
  assert.equal(normalized.cv.revision, '3');
  assert.equal(normalized.account.email, 'cv@example.test');
  assert.doesNotMatch(JSON.stringify(normalized), /account_fixture|cv_fixture|NEVER-RETURN|private\.example/);
  assert.deepEqual(normalizeCvSetupStatus({ content: [{ type: 'text', text: JSON.stringify(input) }] }), normalized);
  assert.equal(normalizeCvSetupStatus({ content: [{ type: 'text', text: '{"schemaVersion":1' }] }), null);
  assert.equal(normalizeCvSetupStatus({ content: [{ type: 'text', text: 'x'.repeat(32769) }] }), null);
});

test('inconsistent, failed and unrecognized setup states never normalize to ready', () => {
  const invalid = [
    { isError: true, structuredContent: providerReady() },
    { status: 'pending_approval', structuredContent: providerReady() },
    { state: 'waiting_for_user', structuredContent: providerReady() },
    { status: 'authentication_required', structuredContent: providerReady() },
    { structuredContent: providerReady(), content: [{ type: 'text', text: JSON.stringify({ status: 'pending_approval' }) }] },
    { structuredContent: { success: false, data: providerReady(), error: null } },
    { ...providerReady(), approvalRequired: true },
    { structuredContent: { data: providerReady(), error: { message: 'private provider failure' } } },
    { ...providerReady(), schemaVersion: 2 },
    { ...providerReady(), status: 'processing' },
    { ...providerReady(), nextAction: 'provide_facts' },
    { ...providerReady(), account: { id: 'account_fixture', email: 'cv@example.test', emailVerified: false } },
    { ...providerReady(), account: null },
    { ...providerReady(), cv: { ...providerReady().cv, ready: null } },
    { ...providerReady(), cv: { ...providerReady().cv, readable: false } },
    { ...providerReady(), cv: { ...providerReady().cv, missingFields: ['name'] } },
    { ...providerReady(), cv: { ...providerReady().cv, missingFields: ['Private resume text'] } },
    { ...providerReady(), account: { id: 'account_fixture', email: 'Name <cv@example.test>', emailVerified: true } },
  ];
  for (const response of invalid) assert.equal(normalizeCvSetupStatus(response), null);
  const facts = normalizeCvSetupStatus({ ...providerReady(), status: 'facts_required', nextAction: 'provide_facts', cv: { ...providerReady().cv, ready: false, missingFields: ['experience'] } });
  assert.equal(facts.status, 'facts_required');
  assert.deepEqual(facts.cv.missingFields, ['experience']);
  const pending = normalizeCvSetupStatus({ schemaVersion: 1, status: 'approval_required', account: null, cv: null, nextAction: 'review_approval' });
  assert.deepEqual(pending, { schemaVersion: 1, status: 'approval_required', account: null, cv: null, nextAction: 'review_approval' });
});
