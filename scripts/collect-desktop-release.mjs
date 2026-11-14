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
export function validateDesktopEvidence({ report, smoke, archive, version, target }) {
  if (!APP_TARGETS.includes(target)) throw new Error('Unexpected desktop target.');
  const [platform, arch] = target.split('-'), name = `tawdheef-${version}-${target}.zip`;
  if (report.archive !== name || report.version !== version || report.platform !== platform || report.arch !== arch || report.runtime?.version !== NODE_VERSION) throw new Error(`Package identity mismatch: ${target}`);
  if (report.sha256 !== sha256(archive) || report.bytes !== archive.length) throw new Error(`Package checksum mismatch: ${target}`);
  if (smoke.ok !== true || smoke.version !== version || smoke.platform !== platform || smoke.arch !== arch || smoke.node !== `v${NODE_VERSION}` || smoke.archive !== name || smoke.sha256 !== report.sha256 || smoke.tools !== EXPECTED_TOOL_COUNT) throw new Error(`Exact-archive verification missing or mismatched: ${target}`);
  if (Boolean(report.signed) !== Boolean(smoke.signing?.signed) || Boolean(report.osSigningVerified) !== Boolean(smoke.osSigningVerified)) throw new Error(`Signing evidence mismatch: ${target}`);
  if (report.signed && (!report.osSigningVerified || !smoke.osSigningVerified || (platform === 'darwin' && (!report.notarized || !smoke.signing?.notarized)))) throw new Error(`OS signing verification incomplete: ${target}`);
  return name;
}

export async function collectDesktopRelease({ artifacts, output, version }) {
  const entries = [];
  // Validate every target before changing the prepared draft.
  for (const target of APP_TARGETS) {
    const directory = join(artifacts, `desktop-${target}`);
    const report = JSON.parse(await readFile(join(directory, 'package-report.json'), 'utf8'));
    const smoke = JSON.parse(await readFile(join(directory, 'smoke-verification.json'), 'utf8'));
    const name = `tawdheef-${version}-${target}.zip`;
    const archive = await readFile(join(directory, name));
    validateDesktopEvidence({ report, smoke, archive, version, target });
    for (const [source, destination] of [[name, name], ['package-report.json', `${name.slice(0, -4)}-package-report.json`], ['smoke-verification.json', `${name.slice(0, -4)}-smoke-verification.json`]]) {
      const path = join(output, destination);
      try { await access(path); throw new Error(`Release asset already exists: ${destination}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      entries.push({ source: join(directory, source), path, name: destination });
    }
  }
  const manifestPath = join(output, 'manifest.json'), sumsPath = join(output, 'SHA256SUMS.txt');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.version !== version || manifest.published !== false) throw new Error('Use a matching, unpublished prepared release directory.');
  const sums = [await readFile(sumsPath, 'utf8')];
  for (const entry of entries) {
    await copyFile(entry.source, entry.path, constants.COPYFILE_EXCL);
    sums.push(`${sha256(await readFile(entry.path))}  ${entry.name}\n`);
  }
  await writeFile(sumsPath, sums.join(''));
  manifest.assets.push(...entries.map(entry => entry.name));
  manifest.desktop = { targets: [...APP_TARGETS], validation: 'Exact archive SHA256 matches the target OS/architecture launcher and MCP smoke receipt. Signing status is recorded separately for each package.' };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return { targets: APP_TARGETS.length, assets: entries.length };
}

if (isDirectInvocation(import.meta.url)) {
  try {
    const args = process.argv.slice(2), flags = new Map();
    for (let i = 0; i < args.length; i += 2) {
      if (!['--artifacts', '--output'].includes(args[i]) || !args[i + 1] || flags.has(args[i])) throw new Error('Use --artifacts DOWNLOADED_ARTIFACTS --output PREPARED_RELEASE.');
      flags.set(args[i], args[i + 1]);
    }
    if (flags.size !== 2) throw new Error('Use --artifacts DOWNLOADED_ARTIFACTS --output PREPARED_RELEASE.');
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    console.log(JSON.stringify(await collectDesktopRelease({ artifacts: resolve(flags.get('--artifacts')), output: resolve(flags.get('--output')), version: pkg.version })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
