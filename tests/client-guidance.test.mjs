import test from 'node:test';
import assert from 'node:assert/strict';
import { registrationContext, capabilityRecipe, monitoringRecipe } from '../server/client-guidance.mjs';
import { nativeConnectionRequest } from '../server/native-guidance.mjs';

test('new registrations use only the selected client mailbox report, never old adapters or a contact hint', () => {
  let primaryEmail = 'main@example.test';
  const store = { getSettings: () => ({ preferredAssistant: 'codex', applicationEmail: 'hint@example.test' }), getNativeClientStatus: ({ assistant }) => { assert.equal(assistant, 'codex'); return { primaryEmail }; }, getCompany: id => ({ id, name: 'Fixture employer', progress: { accountCreated: true } }) };
  {
    const context = registrationContext({ store, companyId: 'fixture' });
    assert.equal(context.primaryEmail, 'main@example.test'); assert.equal(context.emailSource, 'native_client_report');
    assert.equal(context.clientReported, true); assert.equal(context.independentlyVerified, false);
    assert.match(context.instructions, /Reuse an existing career account and its original sign-in/);
    assert.equal(context.credentials.storedByTracker, false); assert.equal(context.credentials.availability, 'not_verified_by_tracker');
    assert.equal(context.company.id, 'fixture');
  }
  primaryEmail = null;
  for (const mailbox of [undefined, { status: 'connected', account: 'old-adapter@example.test' }]) {
    const context = registrationContext({ store, connections: { list: () => mailbox ? [{ kind: 'email', ...mailbox }] : [] } });
    assert.equal(context.primaryEmail, null); assert.equal(context.emailSource, null); assert.equal(context.company, null);
  }
});

test('browser/password setup requests do not claim access or authorize account and sending actions', () => {
  for (const assistant of ['codex', 'claude-code']) for (const kind of ['browser', 'passwords']) {
    const recipe = capabilityRecipe({ assistant, kind });
    assert.equal(recipe.connected, undefined); assert.match(recipe.prompt, /No applications, account registrations, CV uploads\/sharing, email sends or calendar writes/);
    assert.match(recipe.prompt, /Preserve my client permissions and existing settings/);
  }
  assert.throws(() => capabilityRecipe({ assistant: 'other', kind: 'browser' }));
  assert.throws(() => capabilityRecipe({ assistant: 'codex', kind: 'vault-export' }));
});

test('native assistant setup observes tracker tool use without reporting an assistant as an external provider', () => {
  const store = { getSettings: () => ({ preferredAssistant: 'codex' }) };
  const request = nativeConnectionRequest({ store, kind: 'assistant' });
  assert.match(request.prompt, /get_agent_context and get_capabilities/);
  assert.doesNotMatch(request.prompt, /report_native_connection/);
  assert.match(request.prompt, /do not verify external tools, account sign-in or model access/);
  assert.match(nativeConnectionRequest({ store, kind: 'browser' }).prompt, /Report browser and computer access separately/);
});

test('monitoring recipes always use the actual client even with an obsolete adapter preference', () => {
  const config = { revision: 7, enabled: true, assistant: 'codex', frequency: 'daily', time: '09:00', timezone: 'Asia/Dubai', channels: { jobs: true, profiles: true, email: true, calendar: true } };
  const store = { dataDir: '/fixture/private', getSettings: () => ({ connectionMode: 'native' }), getMonitoring: () => ({ config, status: { externalScheduleStatus: 'unknown' } }) };
  const recipe = monitoringRecipe({ store, assistant: 'codex', configurationRevision: 7 });
  assert.match(recipe.taskPrompt, /get_native_client_status/); assert.match(recipe.taskPrompt, /report_native_connection/);
  assert.match(recipe.taskPrompt, /returned readRequest/); assert.match(recipe.taskPrompt, /fresh sourceRead evidence/);
  assert.match(recipe.taskPrompt, /original tracked thread/); assert.match(recipe.taskPrompt, /fourteen-day window/);
  assert.match(recipe.taskPrompt, /empty or unchanged result requires the same real source proof/);
  assert.doesNotMatch(recipe.taskPrompt, /Email\/calendar are read by the local app|bypass the local provider reader/);
  assert.equal(recipe.creation, 'requested_only'); assert.equal(recipe.nextRunAt, null);
  store.getSettings = () => ({ connectionMode: 'local-adapters' });
  assert.equal(monitoringRecipe({ store, assistant: 'codex', configurationRevision: 7 }).taskPrompt, recipe.taskPrompt);
});
