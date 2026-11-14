/** Real platform signing. No success flag is inferred from an external script. */
import { readFile, readdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { nativeCommand } from './native-package.mjs';

export function signingConfiguration({ platform = process.platform, env = process.env } = {}) {
  const mode = env.TAWDHEEF_SIGN || 'unsigned';
  if (!['unsigned', 'required'].includes(mode)) throw new Error('TAWDHEEF_SIGN must be unsigned or required.');
  if (mode === 'unsigned') return { requested: false, status: 'unsigned', reason: 'Platform signing was not requested.' };
  if (platform === 'darwin') {
    if (!env.TAWDHEEF_MAC_SIGN_IDENTITY) throw new Error('Signing is required: configure TAWDHEEF_MAC_SIGN_IDENTITY with an imported Developer ID Application identity.');
    if (env.TAWDHEEF_MAC_SIGN_IDENTITY === '-') throw new Error('Ad-hoc signatures do not satisfy required distribution signing.');
    const api = [env.TAWDHEEF_MAC_NOTARY_KEY, env.TAWDHEEF_MAC_NOTARY_KEY_ID, env.TAWDHEEF_MAC_NOTARY_ISSUER];
    if (!env.TAWDHEEF_MAC_NOTARY_PROFILE && !api.every(Boolean)) throw new Error('Signing is required: configure the notarization API key path, key ID and issuer, or a keychain profile.');
    if (api[0] && !isAbsolute(api[0])) throw new Error('The notarization key must use an absolute private path.');
    const notaryArgs = env.TAWDHEEF_MAC_NOTARY_PROFILE
      ? ['--keychain-profile', env.TAWDHEEF_MAC_NOTARY_PROFILE, ...(env.TAWDHEEF_MAC_KEYCHAIN ? ['--keychain', env.TAWDHEEF_MAC_KEYCHAIN] : [])]
      : ['--key', api[0], '--key-id', api[1], '--issuer', api[2]];
    return { requested: true, identity: env.TAWDHEEF_MAC_SIGN_IDENTITY, keychain: env.TAWDHEEF_MAC_KEYCHAIN, notaryArgs };
  }
  if (platform === 'win32') {
    const thumbprint = (env.TAWDHEEF_WIN_CERT_SHA1 || '').replace(/\s/g, '');
    if (!/^[a-f0-9]{40}$/i.test(thumbprint)) throw new Error('Signing is required: import a code-signing certificate and configure its TAWDHEEF_WIN_CERT_SHA1 thumbprint.');
    const timestamp = env.TAWDHEEF_WIN_TIMESTAMP || 'http://timestamp.digicert.com';
    if (!/^https?:\/\/[^\s]+$/.test(timestamp)) throw new Error('Configure an HTTP(S) RFC 3161 timestamp service.');
    return { requested: true, thumbprint, store: env.TAWDHEEF_WIN_CERT_STORE || 'My', tool: env.TAWDHEEF_WIN_SIGNTOOL || 'signtool.exe', timestamp };
  }
  throw new Error('Required signing is available for macOS and Windows distributions.');
}
export function isMachO(bytes) {
  if (bytes.length < 4) return false;
  return ['feedface', 'feedfacf', 'cefaedfe', 'cffaedfe', 'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca'].includes(bytes.subarray(0, 4).toString('hex'));
}
async function machOFiles(folder) {
  const result = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Native signing refuses linked package files.');
    if (entry.isDirectory()) result.push(...await machOFiles(path));
    else if (entry.isFile() && isMachO(await readFile(path))) result.push(path);
  }
  return result;
}
const options = { capture: true };
export async function verifyDesktopSigning({ folder, codeRoot, layout, platform = process.platform, env = process.env, run = nativeCommand } = {}) {
  if (platform === 'darwin') {
    const bundle = join(folder, layout.bundle);
    await run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', bundle], options);
    await run('xcrun', ['stapler', 'validate', bundle], options);
    await run('spctl', ['--assess', '--type', 'execute', '--verbose=2', bundle], options);
    return { status: 'verified', signed: true, osSigningVerified: true, notarized: true, stapled: true, scope: 'macOS app bundle', checks: ['codesign deep/strict', 'stapler validate', 'Gatekeeper spctl assessment'] };
  }
  if (platform === 'win32') {
    const tool = env.TAWDHEEF_WIN_SIGNTOOL || 'signtool.exe';
    await run(tool, ['verify', '/pa', '/all', '/tw', join(folder, layout.launcher)], options);
    await run(tool, ['verify', '/pa', '/all', '/tw', join(codeRoot, 'runtime', 'node.exe')], options);
    return { status: 'verified', signed: true, osSigningVerified: true, notarized: false, scope: 'Windows native launcher', runtimeSignatureVerified: true, checks: ['SignTool Authenticode policy', 'all signatures', 'timestamp required', 'bundled Node signature'], limitation: 'Authenticode covers the EXE; this ZIP is not a signed installer or a sealed application bundle.' };
  }
  throw new Error('No platform signature verifier is configured for this target.');
}
export async function signDesktop({ folder, codeRoot, layout, platform = process.platform, env = process.env, run = nativeCommand } = {}) {
  const config = signingConfiguration({ platform, env });
  if (!config.requested) return { ...config, signed: false, osSigningVerified: false, notarized: false };
  if (platform === 'win32') {
    await run(config.tool, ['sign', '/sha1', config.thumbprint, '/s', config.store, '/fd', 'SHA256', '/tr', config.timestamp, '/td', 'SHA256', '/d', 'Tawdheef', join(folder, layout.launcher)], options);
    return verifyDesktopSigning({ folder, codeRoot, layout, platform, env, run });
  }
  const temporary = await mkdtemp(join(tmpdir(), 'tawdheef-notarization-'));
  try {
    const bundle = join(folder, layout.bundle);
    const entitlements = join(temporary, 'node-entitlements.plist');
    await writeFile(entitlements, '<?xml version="1.0"?><plist version="1.0"><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>');
    for (const file of await machOFiles(bundle)) {
      await run('codesign', ['--force', '--timestamp', '--options', 'runtime', '--sign', config.identity,
        ...(config.keychain ? ['--keychain', config.keychain] : []),
        ...(file === join(codeRoot, 'runtime/bin/node') ? ['--entitlements', entitlements] : []), file], options);
    }
    await run('codesign', ['--force', '--timestamp', '--options', 'runtime', '--sign', config.identity, ...(config.keychain ? ['--keychain', config.keychain] : []), bundle], options);
    await run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', bundle], options);
    const upload = join(temporary, 'Tawdheef-notarization.zip');
    await run('ditto', ['-c', '-k', '--keepParent', '--sequesterRsrc', bundle, upload], options);
    const response = await run('xcrun', ['notarytool', 'submit', upload, ...config.notaryArgs, '--output-format', 'json', '--wait', '--timeout', '30m'], { ...options, timeout: 35 * 60_000 });
    let result; try { result = JSON.parse(response); } catch { throw new Error('Notarization did not return a valid verification receipt.'); }
    if (result.status !== 'Accepted' || !result.id) throw new Error('Apple did not accept notarization. Inspect the submission before another distribution attempt.');
    await run('xcrun', ['stapler', 'staple', bundle], options);
    return { ...await verifyDesktopSigning({ folder, codeRoot, layout, platform, env, run }), notarySubmissionId: result.id };
  } finally { await rm(temporary, { recursive: true, force: true, maxRetries: 5 }); }
}
