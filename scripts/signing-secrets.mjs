/** CI-only secret preflight and temporary notarization key handling. Never prints values. */
import { mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises';
import { join, resolve, dirname, basename, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

export function signingSecretsMissing(platform, env = {}) {
  const required = platform === 'darwin'
    ? ['MACOS_CERTIFICATE_P12_BASE64', 'MACOS_CERTIFICATE_PASSWORD', 'MACOS_SIGN_IDENTITY', 'APPLE_NOTARY_KEY_BASE64', 'APPLE_NOTARY_KEY_ID', 'APPLE_NOTARY_ISSUER_ID']
    : platform === 'win32' ? ['WINDOWS_CERTIFICATE_PFX_BASE64', 'WINDOWS_CERTIFICATE_PASSWORD', 'WINDOWS_CERT_SHA1'] : [];
  if (!required.length) throw new Error('Choose a Windows or macOS signing target.');
  return required.filter(name => typeof env[name] !== 'string' || !env[name].trim());
}
export async function prepareNotaryKey(env = process.env) {
  if (!env.RUNNER_TEMP || !env.GITHUB_ENV || !isAbsolute(env.RUNNER_TEMP) || !isAbsolute(env.GITHUB_ENV)) throw new Error('This key preparation runs only in the configured CI environment.');
  const missing = signingSecretsMissing('darwin', env);
  if (missing.length) throw new Error(`Signing secrets missing: ${missing.join(', ')}. Enter them directly in GitHub Actions secrets.`);
  const key = Buffer.from(env.APPLE_NOTARY_KEY_BASE64, 'base64');
  if (!key.toString('utf8').includes(['-----BEGIN', 'PRIVATE KEY-----'].join(' ')) || !key.toString('utf8').includes(['-----END', 'PRIVATE KEY-----'].join(' '))) throw new Error('The notarization key must be the base64-encoded App Store Connect .p8 key.');
  const folder = await mkdtemp(join(env.RUNNER_TEMP, 'tawdheef-notary-key-'));
  const path = join(folder, 'AuthKey.p8');
  await writeFile(path, key, { mode: 0o600, flag: 'wx' });
  await appendFile(env.GITHUB_ENV, `TAWDHEEF_MAC_NOTARY_KEY=${path}\n`);
  return { prepared: true };
}
export async function cleanupNotaryKey(env = process.env) {
  if (!env.TAWDHEEF_MAC_NOTARY_KEY) return;
  const root = resolve(env.RUNNER_TEMP || ''), file = resolve(env.TAWDHEEF_MAC_NOTARY_KEY), folder = dirname(file);
  if (dirname(folder) !== root || !basename(folder).startsWith('tawdheef-notary-key-') || basename(file) !== 'AuthKey.p8') throw new Error('Refusing an unexpected signing-key cleanup path.');
  await rm(folder, { recursive: true, force: true, maxRetries: 5 });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'cleanup') await cleanupNotaryKey();
    else {
      const missing = signingSecretsMissing(process.platform, process.env);
      if (missing.length) throw new Error(`Signing secrets missing: ${missing.join(', ')}. Configure the publisher credentials in GitHub; no signing was attempted.`);
      if (process.platform === 'darwin') await prepareNotaryKey();
      console.log('Signing prerequisites are present; actual signing and OS verification remain required.');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
