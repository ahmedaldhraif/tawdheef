import test from 'node:test';
import assert from 'node:assert/strict';
import { registrationContext, capabilityRecipe } from '../server/client-guidance.mjs';

test('new registrations use only the observed connected mailbox, never a configured or CV email guess', () => {
  const store = { getCompany: id => ({ id, name: 'Fixture employer', progress: { accountCreated: true } }) };
  for (const account of ['Main@Example.test', { email: 'Main@Example.test', id: 'verified-account' }]) {
    const context = registrationContext({ store, companyId: 'fixture', connections: { list: () => [{ kind: 'email', status: 'connected', provider: 'outlook', account }] } });
    assert.equal(context.primaryEmail, 'main@example.test'); assert.equal(context.emailSource, 'observed_connected_mailbox');
    assert.match(context.instructions, /Reuse an existing career account and its original sign-in/);
    assert.equal(context.credentials.storedByTracker, false); assert.equal(context.credentials.availability, 'not_verified_by_tracker');
    assert.equal(context.company.id, 'fixture');
  }
  for (const mailbox of [undefined, { status: 'disconnected', account: 'stale@example.test' }, { status: 'connected', credentialUsername: 'configured@example.test' }, { status: 'connected', account: { email: 'not-an-address' } }]) {
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
