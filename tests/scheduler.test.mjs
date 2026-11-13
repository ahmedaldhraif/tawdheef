import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openStore } from '../server/store.mjs';
import { createScheduler, isReportDue, normalizedReplies } from '../server/scheduler.mjs';

async function setup(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'apply-schedule-'));
  const store = openStore({ dataDir, seed: false });
  t.after(async () => {
    store.close();
    assert.ok(resolve(dataDir).startsWith(resolve(tmpdir(), 'apply-schedule-')));
    await rm(dataDir, { recursive: true, force: true });
  });
  store.createDirectory({ id: 'test', name: 'Test' });
  const company = store.addCompanies('test', [{ name: 'Example', email: 'careers@example.com' }]).ids[0];
  store.updateSettings({ refreshFrequency: 'manual', reportFrequency: 'off', timezone: 'UTC' });
  return { store, company };
}

function application(store, company, patch = {}) {
  const run = store.startRun({ companyIds: [company], explicit: true, mode: 'send_and_submit' });
  return store.logApplication({ companyId: company, runId: run.id, method: 'email', role: 'Designer', status: 'applied', threadId: 'thread-1', evidence: { providerMessageId: 'sent-1' }, to: 'careers@example.com', ...patch });
}

test('report schedules use the selected timezone and catch up once after sleep', () => {
  const settings = { reportFrequency: 'daily', reportTime: '08:00', timezone: 'Asia/Dubai', lastReportAt: '2026-11-12T04:00:00.000Z' };
  assert.equal(isReportDue(settings, new Date('2026-11-13T03:59:00Z')), false);
  assert.equal(isReportDue(settings, new Date('2026-11-13T04:00:00Z')), true);
  assert.equal(isReportDue(settings, new Date('2026-11-16T01:00:00Z')), true);
  assert.equal(isReportDue({ ...settings, lastReportAt: '2026-11-16T01:00:00Z' }, new Date('2026-11-16T01:01:00Z')), false);
  assert.equal(isReportDue({ ...settings, lastReportAt: null }, new Date('2026-11-13T03:59:00Z')), false);
});

test('weekly and custom intervals retain their calendar meaning', () => {
  const weekly = { reportFrequency: 'weekly', reportTime: '08:00', reportDay: 1, timezone: 'UTC', lastReportAt: '2026-11-02T08:00:00Z' };
  assert.equal(isReportDue(weekly, new Date('2026-11-09T07:59:00Z')), false);
  assert.equal(isReportDue(weekly, new Date('2026-11-13T09:00:00Z')), true);
  assert.equal(isReportDue({ ...weekly, lastReportAt: null }, new Date('2026-11-13T09:00:00Z')), false);
  const custom = { ...weekly, reportFrequency: 'custom', reportEveryDays: 3, lastReportAt: '2026-11-10T09:00:00Z' };
  assert.equal(isReportDue(custom, new Date('2026-11-13T07:59:00Z')), false);
  assert.equal(isReportDue(custom, new Date('2026-11-13T08:00:00Z')), true);
});

test('reply matching ignores sent messages, unknown senders and other threads', () => {
  const app = { threadId: 'thread-1', to: 'careers@example.com', appliedAt: '2026-11-13T08:00:00Z' };
  const reply = { id: 'reply-1', threadId: 'thread-1', from: 'Recruiting <careers@example.com>', body: 'Please choose a time.', receivedAt: '2026-11-13T09:00:00Z', isReply: true };
  const messages = [null, reply, { ...reply, id: 'sent', isReply: false }, { ...reply, id: 'stranger', from: 'unknown@example.net' }, { ...reply, id: 'other', threadId: 'other-thread' }];
  const normalized = normalizedReplies({ structuredContent: { messages } }, app, {}, new Date('2026-11-13T09:01:00Z'));
  assert.deepEqual(normalized.map(item => item.id), ['reply-1']);
  assert.deepEqual(normalizedReplies({ content: [{ type: 'text', text: 'You have a reply' }] }, app, {}, new Date('2026-11-13T09:01:00Z')), []);
});

test('refresh updates a recorded application once and does not start new applications', async t => {
  const { store, company } = await setup(t);
  const app = application(store, company);
  const current = new Date(Date.now() + 2_000);
  let calls = 0;
  const scheduler = createScheduler({ store, clock: () => current, connections: { async callMapped(kind, action, context) {
    calls++;
    assert.equal(kind, 'email'); assert.equal(action, 'readThread'); assert.equal(context.threadId, app.threadId);
    return { structuredContent: { replies: [{ id: 'reply-1', threadId: app.threadId, from: 'careers@example.com', body: 'Let us meet.', receivedAt: current.toISOString() }] } };
  } } });
  const result = await scheduler.refresh();
  assert.equal(result.updated, 1);
  assert.equal(result.status, 'checked');
  assert.match(result.message, /1 email thread checked/);
  assert.equal(store.getCompany(company).status, 'replied');
  assert.equal(store.listApplications().length, 1);
  assert.equal((await scheduler.refresh()).updated, 0);
  assert.equal(calls, 2);
});

test('refresh failure stays visible and does not imply a company replied', async t => {
  const { store, company } = await setup(t);
  application(store, company);
  const scheduler = createScheduler({ store, connections: { async callMapped() { throw new Error('Reconnect the mailbox.'); } } });
  const result = await scheduler.refresh();
  assert.equal(result.updated, 0);
  assert.equal(result.errors.length, 1);
  assert.equal(result.status, 'failed');
  assert.match(store.getSettings().lastRefreshError, /Reconnect the mailbox/);
  assert.equal(store.getCompany(company).status, 'applied');
});

test('an empty refresh reports no threads and makes no mailbox or directory-check claim', async t => {
  const { store } = await setup(t);
  let calls = 0;
  const scheduler = createScheduler({ store, connections: { async callMapped() { calls++; throw new Error('Should not be called'); } } });
  const result = await scheduler.refresh();
  assert.equal(calls, 0);
  assert.equal(result.checked, 0);
  assert.equal(result.status, 'no_threads');
  assert.match(result.message, /No sent email threads/);
  assert.match(result.message, /Directory links have not been rechecked/);
  assert.equal(store.listActivity()[0].action, 'refresh_skipped');
});

test('report delivery is reserved before send and an uncertain result is not retried in the same slot', async t => {
  const { store } = await setup(t);
  const current = new Date('2026-11-13T09:00:00Z');
  store.updateSettings({ reportFrequency: 'daily', reportTime: '08:00', emailReports: true, reportEmail: 'owner@example.com' });
  let calls = 0;
  const scheduler = createScheduler({ store, clock: () => current, connections: { async callMapped(kind, action, context) {
    calls++;
    assert.equal(action, 'sendEmail'); assert.equal(context.to, 'owner@example.com');
    assert.equal(store.getSettings().lastReportAt, current.toISOString());
    assert.equal(store.listReports()[0].delivery.status, 'pending');
    return { structuredContent: { status: 'approval_required', id: 'queued-1' } };
  } } });
  await scheduler.tick();
  assert.equal(calls, 1);
  assert.equal(store.listReports().length, 1);
  assert.equal(store.listReports()[0].delivery.status, 'unconfirmed');
  assert.match(store.getSettings().lastReportError, /confirmed sent receipt/);
  await scheduler.tick();
  assert.equal(calls, 1);
});

test('confirmed report sends keep the provider receipt', async t => {
  const { store } = await setup(t);
  store.updateSettings({ emailReports: true, reportEmail: 'owner@example.com' });
  const scheduler = createScheduler({ store, connections: { async callMapped() { return { structuredContent: { status: 'sent', messageId: 'message-1' } }; } } });
  const report = await scheduler.generateReport();
  assert.equal(report.delivery.status, 'sent');
  assert.equal(store.listReports()[0].delivery.messageId, 'message-1');
  assert.equal(store.getSettings().lastReportError, null);
});

test('report sends honour configured receipt paths and reject pending acknowledgements', async t => {
  const { store } = await setup(t);
  store.updateSettings({ emailReports: true, reportEmail: 'owner@example.com' });
  const scheduler = createScheduler({ store, connections: {
    getMappings() { return { sendEmail: { receipt: { messageIdPath: 'mail.receipt', statusPath: 'mail.completed', successValues: [true] } } }; },
    async callMapped() { return { structuredContent: { mail: { receipt: 'custom-message-1', completed: true } } }; },
  } });
  const report = await scheduler.generateReport();
  assert.equal(report.delivery.status, 'sent');
  assert.equal(report.delivery.messageId, 'custom-message-1');
});
