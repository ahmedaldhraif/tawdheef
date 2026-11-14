import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateDesktopEvidence } from '../scripts/collect-desktop-release.mjs';

function fixture() {
  const archive = Buffer.from('fixture ZIP identity'), hash = createHash('sha256').update(archive).digest('hex');
  const report = { archive: 'tawdheef-1.2.3-darwin-arm64.zip', version: '1.2.3', platform: 'darwin', arch: 'arm64', runtime: { version: '26.13.1' }, sha256: hash, bytes: archive.length, signed: false, osSigningVerified: false };
  const smoke = { ok: true, ...report, node: 'v26.13.1', tools: 44, signing: { signed: false } };
  return { report, smoke, archive, version: '1.2.3', target: 'darwin-arm64' };
}
test('release evidence binds a real OS/architecture result to the exact archive bytes', () => {
  const input = fixture();
  assert.equal(validateDesktopEvidence(input), input.report.archive);
  assert.throws(() => validateDesktopEvidence({ ...input, archive: Buffer.from('modified archive') }), /checksum/);
  assert.throws(() => validateDesktopEvidence({ ...input, smoke: { ...input.smoke, sha256: 'different download' } }), /verification/);
  assert.throws(() => validateDesktopEvidence({ ...input, smoke: { ...input.smoke, arch: 'x64' } }), /verification/);
  assert.throws(() => validateDesktopEvidence({ ...input, report: { ...input.report, archive: '../other.zip' } }), /identity/);
});
test('release evidence cannot claim notarized signing from only a build receipt', () => {
  const input = fixture();
  const report = { ...input.report, signed: true, osSigningVerified: true, notarized: true };
  assert.throws(() => validateDesktopEvidence({ ...input, report }), /Signing evidence/);
  const smoke = { ...input.smoke, osSigningVerified: true, signing: { signed: true } };
  assert.throws(() => validateDesktopEvidence({ ...input, report, smoke }), /incomplete/);
  assert.equal(validateDesktopEvidence({ ...input, report, smoke: { ...smoke, signing: { signed: true, notarized: true } } }), report.archive);
});
