import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateDesktopEvidence, collectDesktopRelease, EXPECTED_TOOL_COUNT } from '../scripts/collect-desktop-release.mjs';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { APP_TARGETS } from '../scripts/package-app.mjs';
const sourceCommit = 'a'.repeat(40);

function fixture() {
  const archive = Buffer.from('fixture ZIP identity'), hash = createHash('sha256').update(archive).digest('hex');
  const report = { archive: 'tawdheef-1.2.3-darwin-arm64.zip', sourceCommit, version: '1.2.3', platform: 'darwin', arch: 'arm64', runtime: { version: '26.13.1' }, sha256: hash, bytes: archive.length, signed: false, osSigningVerified: false };
  const smoke = { ok: true, ...report, node: 'v26.13.1', tools: EXPECTED_TOOL_COUNT, signing: { signed: false } };
  return { report, smoke, archive, version: '1.2.3', target: 'darwin-arm64', sourceCommit };
}
test('release evidence binds a real OS/architecture result to the exact archive bytes', () => {
  const input = fixture();
  assert.equal(validateDesktopEvidence(input), input.report.archive);
  assert.throws(() => validateDesktopEvidence({ ...input, archive: Buffer.from('modified archive') }), /checksum/);
  assert.throws(() => validateDesktopEvidence({ ...input, smoke: { ...input.smoke, sha256: 'different download' } }), /verification/);
  assert.throws(() => validateDesktopEvidence({ ...input, smoke: { ...input.smoke, arch: 'x64' } }), /verification/);
  assert.throws(() => validateDesktopEvidence({ ...input, smoke: { ...input.smoke, tools: EXPECTED_TOOL_COUNT - 1 } }), /verification/);
  assert.throws(() => validateDesktopEvidence({ ...input, report: { ...input.report, archive: '../other.zip' } }), /identity/);
});

test('same-version packages cannot substitute another source commit or unsigned publisher targets', () => {
  const input = fixture();
  assert.throws(() => validateDesktopEvidence({ ...input, sourceCommit: undefined }), /Source commit/);
  assert.throws(() => validateDesktopEvidence({ ...input, report: { ...input.report, sourceCommit: 'b'.repeat(40) } }), /Source commit/);
  assert.throws(() => validateDesktopEvidence({ ...input, smoke: { ...input.smoke, sourceCommit: 'b'.repeat(40) } }), /Source commit/);
  assert.throws(() => validateDesktopEvidence({ ...input, requireSigned: true }), /publisher signing/);
  const report = { ...input.report, platform: 'linux', archive: 'tawdheef-1.2.3-linux-arm64.zip' };
  const smoke = { ...input.smoke, platform: 'linux', archive: report.archive };
  assert.equal(validateDesktopEvidence({ ...input, report, smoke, target: 'linux-arm64', requireSigned: true }), report.archive);
  assert.throws(() => validateDesktopEvidence({ ...input, report: { ...report, signed: true, osSigningVerified: true }, smoke: { ...smoke, osSigningVerified: true, signing: { signed: true } }, target: 'linux-arm64', requireSigned: true }), /Unsupported/);
});

test('collector validates all six pinned archives and exact source smoke before copying any asset', async t => {
  const root = await mkdtemp(join(tmpdir(), 'tawdheef-collection-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 5 }));
  const artifacts = join(root, 'artifacts'), output = join(root, 'prepared'); await mkdir(output);
  const source = Buffer.from('Synthetic source ZIP bytes'), sourceName = 'tawdheef-1.2.3-source.zip', sourceHash = createHash('sha256').update(source).digest('hex');
  const manifest = { version: '1.2.3', sourceCommit, published: false, assets: [sourceName], sourceArchive: { name: sourceName, sha256: sourceHash } };
  await writeFile(join(output, sourceName), source); await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest)); await writeFile(join(output, 'SHA256SUMS.txt'), `${sourceHash}  ${sourceName}\n`);
  const sourceSmoke = { ok: true, version: '1.2.3', sourceCommit, tools: EXPECTED_TOOL_COUNT, archive: sourceName, sha256: sourceHash };
  await writeFile(join(output, 'smoke-verification.json'), JSON.stringify(sourceSmoke));
  let last;
  for (const target of APP_TARGETS) {
    const base = fixture(), [platform, arch] = target.split('-'), directory = join(artifacts, 'desktop-' + target); await mkdir(directory, { recursive: true });
    const name = `tawdheef-1.2.3-${target}.zip`, report = { ...base.report, archive: name, platform, arch }, smoke = { ...base.smoke, archive: name, platform, arch };
    await writeFile(join(directory, name), base.archive); await writeFile(join(directory, 'package-report.json'), JSON.stringify(report)); await writeFile(join(directory, 'smoke-verification.json'), JSON.stringify(smoke)); last = { directory, report };
  }
  await writeFile(join(last.directory, 'package-report.json'), JSON.stringify({ ...last.report, sourceCommit: 'b'.repeat(40) }));
  await assert.rejects(collectDesktopRelease({ artifacts, output, version: '1.2.3', sourceCommit }), /Source commit/);
  await assert.rejects(readFile(join(output, 'tawdheef-1.2.3-win32-x64.zip')), { code: 'ENOENT' });
  await writeFile(join(last.directory, 'package-report.json'), JSON.stringify(last.report));
  await writeFile(join(output, 'smoke-verification.json'), JSON.stringify({ ...sourceSmoke, sha256: 'wrong' }));
  await assert.rejects(collectDesktopRelease({ artifacts, output, version: '1.2.3', sourceCommit }), /exact prepared source/);
  await writeFile(join(output, 'smoke-verification.json'), JSON.stringify(sourceSmoke));
  const signedArtifacts = join(root, 'signed'), signedOutput = join(root, 'signed-prepared'); await mkdir(signedOutput);
  for (const [name, bytes] of [[sourceName, source], ['manifest.json', JSON.stringify(manifest)], ['SHA256SUMS.txt', `${sourceHash}  ${sourceName}\n`], ['smoke-verification.json', JSON.stringify(sourceSmoke)]]) await writeFile(join(signedOutput, name), bytes);
  for (const target of APP_TARGETS.filter(target => !target.startsWith('linux-'))) {
    const directory = join(signedArtifacts, 'signed-desktop-' + target); await mkdir(directory, { recursive: true });
    const sourceDirectory = join(artifacts, 'desktop-' + target), report = JSON.parse(await readFile(join(sourceDirectory, 'package-report.json'), 'utf8')), smoke = JSON.parse(await readFile(join(sourceDirectory, 'smoke-verification.json'), 'utf8'));
    await writeFile(join(directory, report.archive), await readFile(join(sourceDirectory, report.archive)));
    await writeFile(join(directory, 'package-report.json'), JSON.stringify({ ...report, signed: true, osSigningVerified: true, notarized: report.platform === 'darwin' }));
    await writeFile(join(directory, 'smoke-verification.json'), JSON.stringify({ ...smoke, osSigningVerified: true, signing: { signed: true, notarized: report.platform === 'darwin' } }));
  }
  assert.deepEqual(await collectDesktopRelease({ artifacts, signedArtifacts, output: signedOutput, version: '1.2.3', sourceCommit, signing: 'required' }), { targets: 6, assets: 18 });
  const signedManifest = JSON.parse(await readFile(join(signedOutput, 'manifest.json'), 'utf8'));
  assert.equal(signedManifest.desktop.verified.filter(target => target.signed).length, 4);
  assert.ok(signedManifest.desktop.verified.filter(target => target.target.startsWith('linux-')).every(target => !target.signed));
  assert.deepEqual(await collectDesktopRelease({ artifacts, output, version: '1.2.3', sourceCommit }), { targets: 6, assets: 18 });
  const result = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')); assert.equal(result.desktop.sourceCommit, sourceCommit); assert.equal(result.desktop.signing, 'unsigned-preview'); assert.equal(result.desktop.verified.length, 6);
  await assert.rejects(collectDesktopRelease({ artifacts, output, version: '1.2.3', sourceCommit }), /already exists/);
});
test('release evidence cannot claim notarized signing from only a build receipt', () => {
  const input = fixture();
  const report = { ...input.report, signed: true, osSigningVerified: true, notarized: true };
  assert.throws(() => validateDesktopEvidence({ ...input, report }), /Signing evidence/);
  const smoke = { ...input.smoke, osSigningVerified: true, signing: { signed: true } };
  assert.throws(() => validateDesktopEvidence({ ...input, report, smoke }), /incomplete/);
  assert.equal(validateDesktopEvidence({ ...input, report, smoke: { ...smoke, signing: { signed: true, notarized: true } } }), report.archive);
  assert.throws(() => validateDesktopEvidence({ ...input, report: { ...report, osSigningVerified: 'false', notarized: 'false' }, smoke: { ...smoke, osSigningVerified: 'false', signing: { signed: true, notarized: 'false' } }, requireSigned: true }), /Signing evidence/);
  assert.throws(() => validateDesktopEvidence({ ...input, report: { ...report, notarized: 'true' }, smoke: { ...smoke, signing: { signed: true, notarized: 'true' } }, requireSigned: true }), /incomplete/);
});
