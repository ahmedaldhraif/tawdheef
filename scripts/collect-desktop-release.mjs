/** Attach only the six exact, successfully smoke-tested downloads to a prepared draft. */
import { readFile, writeFile, copyFile, access } from 'node:fs/promises';
import { constants, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { APP_TARGETS, NODE_VERSION } from './package-app.mjs';
import { isDirectInvocation } from './is-direct.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const EXPECTED_TOOL_COUNT = JSON.parse(readFileSync(new URL('../docs/tools.json', import.meta.url), 'utf8')).tools.length;
export function validateDesktopEvidence({ report, smoke, archive, version, target, sourceCommit, requireSigned = false }) {
  if (!APP_TARGETS.includes(target)) throw new Error('Unexpected desktop target.');
  if (!/^[a-f0-9]{40}$/.test(sourceCommit || '') || report.sourceCommit !== sourceCommit || smoke.sourceCommit !== sourceCommit) throw new Error(`Source commit evidence missing or mismatched: ${target}`);
  const [platform, arch] = target.split('-'), name = `tawdheef-${version}-${target}.zip`;
  if (report.archive !== name || report.version !== version || report.platform !== platform || report.arch !== arch || report.runtime?.version !== NODE_VERSION) throw new Error(`Package identity mismatch: ${target}`);
  if (report.sha256 !== sha256(archive) || report.bytes !== archive.length) throw new Error(`Package checksum mismatch: ${target}`);
  if (smoke.ok !== true || smoke.version !== version || smoke.platform !== platform || smoke.arch !== arch || smoke.node !== `v${NODE_VERSION}` || smoke.archive !== name || smoke.sha256 !== report.sha256 || smoke.tools !== EXPECTED_TOOL_COUNT) throw new Error(`Exact-archive verification missing or mismatched: ${target}`);
  if ([report.signed, smoke.signing?.signed, report.osSigningVerified, smoke.osSigningVerified].some(value => typeof value !== 'boolean') || report.signed !== smoke.signing.signed || report.osSigningVerified !== smoke.osSigningVerified) throw new Error(`Signing evidence mismatch: ${target}`);
  if ([report.notarized, smoke.signing?.notarized].some(value => value !== undefined && typeof value !== 'boolean')) throw new Error(`OS signing verification incomplete: ${target}`);
  if (report.signed === true && (report.osSigningVerified !== true || smoke.osSigningVerified !== true || (platform === 'darwin' && (report.notarized !== true || smoke.signing?.notarized !== true)))) throw new Error(`OS signing verification incomplete: ${target}`);
  if ((!report.signed && (report.osSigningVerified || report.notarized || smoke.signing?.notarized)) || (platform === 'linux' && report.signed)) throw new Error(`Unsupported or inconsistent OS signing evidence: ${target}`);
  if (requireSigned && platform !== 'linux' && report.signed !== true) throw new Error(`Verified publisher signing required: ${target}`);
  return name;
}

export async function collectDesktopRelease({ artifacts, signedArtifacts, output, version, sourceCommit, signing = 'unsigned-preview' }) {
  if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(version || '')) throw new Error('Use a valid release version.');
  if (!['unsigned-preview', 'required'].includes(signing)) throw new Error('Choose unsigned-preview or required signing.');
  if (!/^[a-f0-9]{40}$/.test(sourceCommit || '')) throw new Error('Pin the full source commit before collecting release assets.');
  const manifestPath = join(output, 'manifest.json'), sumsPath = join(output, 'SHA256SUMS.txt');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.version !== version || manifest.published !== false || manifest.sourceCommit !== sourceCommit || !Array.isArray(manifest.assets)) throw new Error('Use a matching unpublished prepared release and pinned source commit.');
  const sourceName = `tawdheef-${version}-source.zip`;
  const sourceSmoke = JSON.parse(await readFile(join(output, 'smoke-verification.json'), 'utf8'));
  if (manifest.sourceArchive?.name !== sourceName || sourceSmoke.ok !== true || sourceSmoke.version !== version || sourceSmoke.sourceCommit !== sourceCommit || sourceSmoke.tools !== EXPECTED_TOOL_COUNT || sourceSmoke.archive !== sourceName || sourceSmoke.sha256 !== manifest.sourceArchive.sha256 || sha256(await readFile(join(output, sourceName))) !== sourceSmoke.sha256) throw new Error('Verify the exact prepared source archive before collecting desktop assets.');
  const entries = [];
  const verified = [];
  // Validate every target before changing the prepared draft.
  for (const target of APP_TARGETS) {
    const signedTarget = signing === 'required' && !target.startsWith('linux-');
    const directory = join(signedTarget ? signedArtifacts || artifacts : artifacts, `${signedTarget ? 'signed-desktop' : 'desktop'}-${target}`);
    const reportBytes = await readFile(join(directory, 'package-report.json'));
    const smokeBytes = await readFile(join(directory, 'smoke-verification.json'));
    const report = JSON.parse(reportBytes), smoke = JSON.parse(smokeBytes);
    const name = `tawdheef-${version}-${target}.zip`;
    const archive = await readFile(join(directory, name));
    validateDesktopEvidence({ report, smoke, archive, version, target, sourceCommit, requireSigned: signing === 'required' });
    verified.push({ target, signed: report.signed === true, osSigningVerified: report.osSigningVerified === true, notarized: report.notarized === true });
    for (const [source, destination, bytes] of [[name, name, archive], ['package-report.json', `${name.slice(0, -4)}-package-report.json`, reportBytes], ['smoke-verification.json', `${name.slice(0, -4)}-smoke-verification.json`, smokeBytes]]) {
      const path = join(output, destination);
      try { await access(path); throw new Error(`Release asset already exists: ${destination}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      entries.push({ source: join(directory, source), path, name: destination, sha256: sha256(bytes) });
    }
  }
  const sums = [await readFile(sumsPath, 'utf8')];
  for (const entry of entries) {
    await copyFile(entry.source, entry.path, constants.COPYFILE_EXCL);
    if (sha256(await readFile(entry.path)) !== entry.sha256) throw new Error(`Release source changed during collection: ${entry.name}`);
    sums.push(`${entry.sha256}  ${entry.name}\n`);
  }
  await writeFile(sumsPath, sums.join(''));
  manifest.assets.push(...entries.map(entry => entry.name));
  if (signing === 'required') manifest.stage = 'publisher-verified desktop release candidate; Linux checksum verified';
  manifest.desktop = { sourceCommit, signing, targets: [...APP_TARGETS], verified, validation: 'Exact source commit and archive SHA256 match every target OS/architecture launcher and MCP smoke receipt. Linux uses checksums; publisher signing is recorded separately for Mac/Windows.' };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return { targets: APP_TARGETS.length, assets: entries.length };
}

if (isDirectInvocation(import.meta.url)) {
  try {
    const args = process.argv.slice(2), flags = new Map();
    for (let i = 0; i < args.length; i += 2) {
      if (!['--artifacts', '--signed-artifacts', '--output', '--source-commit', '--signing'].includes(args[i]) || !args[i + 1] || flags.has(args[i])) throw new Error('Use --artifacts DIR --output PREPARED_RELEASE --source-commit SHA [--signing required --signed-artifacts DIR].');
      flags.set(args[i], args[i + 1]);
    }
    if (!flags.has('--artifacts') || !flags.has('--output') || !flags.has('--source-commit')) throw new Error('Use --artifacts DIR --output PREPARED_RELEASE --source-commit SHA [--signing required --signed-artifacts DIR].');
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    console.log(JSON.stringify(await collectDesktopRelease({ artifacts: resolve(flags.get('--artifacts')), ...(flags.has('--signed-artifacts') ? { signedArtifacts: resolve(flags.get('--signed-artifacts')) } : {}), output: resolve(flags.get('--output')), version: pkg.version, sourceCommit: flags.get('--source-commit'), signing: flags.get('--signing') || 'unsigned-preview' })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
