import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { XMLParser } from 'fast-xml-parser';
import { nativeLayout, macInfoPlist } from '../scripts/native-package.mjs';
import { nativePaths } from '../scripts/native-start.mjs';
import { signingConfiguration, signDesktop, verifyDesktopSigning, isMachO } from '../scripts/sign-desktop.mjs';

async function fixture(t) {
  const folder = await mkdtemp(join(tmpdir(), 'Tawdheef native-تجربة-'));
  t.after(() => rm(folder, { recursive: true, force: true, maxRetries: 5 }));
  const layout = nativeLayout('darwin'), codeRoot = join(folder, layout.codeRoot);
  for (const file of [layout.launcher, `${layout.codeRoot}/runtime/bin/node`]) {
    await mkdir(dirname(join(folder, file)), { recursive: true }); await writeFile(join(folder, file), Buffer.from('cffaedfe00000000', 'hex'));
  }
  return { folder, layout, codeRoot };
}
const macEnv = { TAWDHEEF_SIGN: 'required', TAWDHEEF_MAC_SIGN_IDENTITY: 'Developer ID Application: Fixture', TAWDHEEF_MAC_NOTARY_PROFILE: 'fixture-profile' };

test('Mac package has a proper .app executable, icon and stable bundle identifier without a native UI claim', () => {
  const layout = nativeLayout('darwin');
  assert.equal(layout.codeRoot, 'Tawdheef.app/Contents/Resources/app');
  assert.equal(layout.launcher, 'Tawdheef.app/Contents/MacOS/Tawdheef');
  const info = new XMLParser({ parseTagValue: false }).parse(macInfoPlist('1.2.3')).plist.dict;
  assert.ok(info.string.includes('com.tawdheef.app') && info.string.includes('APPL') && info.string.includes('AppIcon'));
  assert.ok(info.string.includes('13.5'));
  assert.ok(info.key.includes('CFBundleExecutable') && info.key.includes('CFBundleVersion'));
  assert.throws(() => macInfoPlist('bad</string>'), /Invalid/);
  assert.equal(nativeLayout('win32').launcher, 'Tawdheef.exe');
});

test('native launches preserve explicit and adjacent legacy data, with a writable external assistant workspace', () => {
  const root = resolve('native-fixture', 'Tawdheef.app/Contents/Resources/app'), home = resolve('home-fixture');
  const explicit = resolve('existing private data');
  const paths = nativePaths({ root, home, platform: 'darwin', env: { APPLY_TRACKER_DATA: explicit }, isDirectory: () => true });
  assert.equal(paths.dataDir, explicit); assert.equal(paths.workspace, join(explicit, 'workspace'));
  const legacy = nativePaths({ root, home, platform: 'darwin', env: {}, isDirectory: () => true });
  assert.equal(legacy.dataDir, join(dirname(resolve(root, '../../..')), '.local')); assert.equal(legacy.legacy, true);
  const fresh = nativePaths({ root, home, platform: 'darwin', env: {}, isDirectory: () => false });
  assert.equal(fresh.dataDir, join(home, 'Library', 'Application Support', 'Tawdheef'));
  assert.throws(() => nativePaths({ root, home, platform: 'darwin', env: { APPLY_TRACKER_DATA: join(root, '..unsafe') }, isDirectory: () => false }), /outside Tawdheef.app/);
  assert.throws(() => nativePaths({ root, home, platform: 'darwin', env: { TAWDHEEF_WORKSPACE: root }, isDirectory: () => false }), /outside Tawdheef.app/);
  assert.equal(nativePaths({ root: resolve('windows app'), home, platform: 'win32', env: { LOCALAPPDATA: resolve('local app data') }, isDirectory: () => false }).dataDir, join(resolve('local app data'), 'Tawdheef'));
});

test('unsigned candidates invoke no signing command; required signing rejects missing identities or notarization credentials', async () => {
  let calls = 0;
  const result = await signDesktop({ platform: 'darwin', env: {}, run: async () => { calls++; } });
  assert.equal(result.signed, false); assert.equal(result.osSigningVerified, false); assert.equal(calls, 0);
  assert.throws(() => signingConfiguration({ platform: 'darwin', env: { TAWDHEEF_SIGN: 'required' } }), /SIGN_IDENTITY/);
  assert.throws(() => signingConfiguration({ platform: 'darwin', env: { TAWDHEEF_SIGN: 'required', TAWDHEEF_MAC_SIGN_IDENTITY: 'Fixture' } }), /notarization/);
  assert.throws(() => signingConfiguration({ platform: 'win32', env: { TAWDHEEF_SIGN: 'required' } }), /CERT_SHA1/);
  assert.throws(() => signingConfiguration({ platform: 'darwin', env: { ...macEnv, TAWDHEEF_MAC_SIGN_IDENTITY: '-' } }), /Ad-hoc/);
});

test('Mac signing requires nested/outer signatures, Accepted notarization, staple validation and Gatekeeper verification', async t => {
  const input = await fixture(t), calls = [];
  const run = async (command, args) => {
    calls.push({ command, args });
    return args[0] === 'notarytool' ? JSON.stringify({ status: 'Accepted', id: 'fixture-submission' }) : '';
  };
  const result = await signDesktop({ ...input, platform: 'darwin', env: macEnv, run });
  assert.equal(result.signed, true); assert.equal(result.notarized, true); assert.equal(result.osSigningVerified, true);
  assert.equal(result.notarySubmissionId, 'fixture-submission');
  const signatures = calls.filter(call => call.command === 'codesign' && call.args.includes('--sign'));
  assert.equal(signatures.length, 3);
  assert.ok(signatures.every(call => call.args.includes('--timestamp') && call.args.includes('runtime')));
  assert.ok(calls.some(call => call.command === 'xcrun' && call.args[0] === 'stapler' && call.args[1] === 'staple'));
  assert.ok(calls.some(call => call.command === 'xcrun' && call.args[0] === 'stapler' && call.args[1] === 'validate'));
  assert.equal(calls.at(-1).command, 'spctl');
  assert.ok(!JSON.stringify(result).includes('Fixture') && !JSON.stringify(result).includes('fixture-profile'));
});

test('rejected notarization or a failed final verifier never produces a verified result', async t => {
  const input = await fixture(t);
  await assert.rejects(signDesktop({ ...input, platform: 'darwin', env: macEnv, run: async (_, args) => args[0] === 'notarytool' ? JSON.stringify({ status: 'Invalid', id: 'fixture-rejected' }) : '' }), /did not accept/);
  await assert.rejects(signDesktop({ ...input, platform: 'darwin', env: macEnv, run: async (command, args) => {
    if (command === 'spctl') throw new Error('Fixture Gatekeeper rejection');
    return args[0] === 'notarytool' ? JSON.stringify({ status: 'Accepted', id: 'fixture-accepted' }) : '';
  } }), /Gatekeeper rejection/);
});

test('Windows uses SHA256, RFC3161 timestamps and Authenticode checks for launcher and bundled runtime', async () => {
  const calls = [], layout = nativeLayout('win32');
  const env = { TAWDHEEF_SIGN: 'required', TAWDHEEF_WIN_CERT_SHA1: 'a'.repeat(40) };
  const result = await signDesktop({ folder: 'fixture', codeRoot: 'fixture', layout, platform: 'win32', env, run: async (command, args) => { calls.push({ command, args }); } });
  assert.equal(result.signed, true); assert.equal(result.scope, 'Windows native launcher');
  assert.ok(calls[0].args.includes('/fd') && calls[0].args.includes('SHA256') && calls[0].args.includes('/tr') && calls[0].args.includes('/td'));
  assert.equal(calls.filter(call => call.args[0] === 'verify').length, 2);
  assert.ok(calls.slice(1).every(call => ['/pa', '/all', '/tw'].every(flag => call.args.includes(flag))));
  await assert.rejects(verifyDesktopSigning({ folder: 'fixture', codeRoot: 'fixture', layout, platform: 'win32', env, run: async () => { throw new Error('Fixture untrusted certificate'); } }), /untrusted/);
});

test('Mach-O discovery distinguishes native code from JavaScript and truncated input', () => {
  assert.equal(isMachO(Buffer.from('cffaedfe', 'hex')), true);
  assert.equal(isMachO(Buffer.from('cafebabe', 'hex')), true);
  assert.equal(isMachO(Buffer.from('export default {}')), false);
  assert.equal(isMachO(Buffer.from([0xcf])), false);
});
