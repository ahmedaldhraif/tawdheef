import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { signingSecretsMissing, prepareNotaryKey, cleanupNotaryKey } from '../scripts/signing-secrets.mjs';

test('signing preflight names missing inputs without exposing values or accepting unrelated credentials', () => {
  assert.equal(signingSecretsMissing('darwin', {}).length, 6);
  assert.equal(signingSecretsMissing('win32', { MACOS_SIGN_IDENTITY: 'fixture' }).length, 3);
  assert.deepEqual(signingSecretsMissing('win32', { WINDOWS_CERTIFICATE_PFX_BASE64: 'fixture', WINDOWS_CERTIFICATE_PASSWORD: 'private fixture', WINDOWS_CERT_SHA1: 'fixture hash' }), []);
  assert.throws(() => signingSecretsMissing('linux', {}), /Windows or macOS/);
});
test('notary keys are prepared privately under runner temp and cleanup refuses foreign paths', async t => {
  const root = await mkdtemp(join(tmpdir(), 'tawdheef-signing-fixture-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }));
  const output = join(root, 'job-env'); await writeFile(output, '');
  const key = [['-----BEGIN', 'PRIVATE KEY-----'].join(' '), 'not a real key', ['-----END', 'PRIVATE KEY-----'].join(' ')].join('\n');
  const env = { RUNNER_TEMP: root, GITHUB_ENV: output, MACOS_CERTIFICATE_P12_BASE64: 'fixture', MACOS_CERTIFICATE_PASSWORD: 'fixture', MACOS_SIGN_IDENTITY: 'fixture', APPLE_NOTARY_KEY_BASE64: Buffer.from(key).toString('base64'), APPLE_NOTARY_KEY_ID: 'fixture', APPLE_NOTARY_ISSUER_ID: 'fixture' };
  assert.deepEqual(await prepareNotaryKey(env), { prepared: true });
  const metadata = await readFile(output, 'utf8'); assert.ok(!metadata.includes(key) && !metadata.includes(env.APPLE_NOTARY_KEY_BASE64));
  const file = metadata.trim().split('=').slice(1).join('='); assert.equal(await readFile(file, 'utf8'), key);
  await cleanupNotaryKey({ RUNNER_TEMP: root, TAWDHEEF_MAC_NOTARY_KEY: file });
  await assert.rejects(readFile(file), { code: 'ENOENT' });
  const foreign = join(root, 'foreign.p8'); await writeFile(foreign, 'keep');
  await assert.rejects(cleanupNotaryKey({ RUNNER_TEMP: root, TAWDHEEF_MAC_NOTARY_KEY: foreign }), /unexpected/);
  assert.equal(await readFile(foreign, 'utf8'), 'keep');
  await assert.rejects(prepareNotaryKey({ ...env, APPLE_NOTARY_KEY_BASE64: 'invalid' }), /base64-encoded/);
});
