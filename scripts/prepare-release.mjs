/** Local preparation only. Never creates a Git tag, pushes, or publishes. */
import { readFile, writeFile, mkdir, cp, access } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { checkPublicSource, sourceArchive, sourceFiles } from './release-files.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(version)) throw new Error('Use a valid release version in package.json.');
const outputFlag = process.argv.indexOf('--output');
if (outputFlag >= 0 && !process.argv[outputFlag + 1]) throw new Error('--output needs a new destination folder.');
const output = outputFlag >= 0 ? resolve(root, process.argv[outputFlag + 1]) : join(root, 'release', `v${version}`);
try { await access(output); throw new Error(`Release folder already exists: ${output}. Review or move that version before rebuilding; it was not overwritten.`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
function run(script, args = []) {
  const result = spawnSync(process.execPath, [join(root, script), ...args], { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(`Release stopped at ${script}.`);
}
await checkPublicSource(root);
run('scripts/tool-catalog.mjs', ['--check']);
run('scripts/marketing/build-directory-pack.mjs');
run('website/build.mjs');
run('scripts/build.mjs');
const report = await checkPublicSource(root);
const files = await sourceFiles(root);
await mkdir(output, { recursive: true });
await writeFile(join(output, `tawdheef-${version}-source.zip`), await sourceArchive(root));
await cp(join(root, 'public/downloads/tawdheef-skill.zip'), join(output, 'tawdheef-skill.zip'));
const packs = JSON.parse(await readFile(join(root, 'directories/catalog.json'), 'utf8')).packs;
for (const pack of packs) await cp(join(root, 'directories', pack.download), join(output, pack.download.split('/').at(-1)));
await cp(join(root, 'public/brand/tawdheef-brand-kit.zip'), join(output, 'tawdheef-brand-kit.zip'));
await cp(join(root, `docs/releases/v${version}.md`), join(output, 'RELEASE-NOTES.md'));
const assets = [`tawdheef-${version}-source.zip`, 'tawdheef-skill.zip', 'tawdheef-brand-kit.zip', ...packs.map(pack => pack.download.split('/').at(-1))];
const sums = [];
for (const asset of assets) sums.push(`${createHash('sha256').update(await readFile(join(output, asset))).digest('hex')}  ${asset}`);
await writeFile(join(output, 'SHA256SUMS.txt'), sums.join('\n') + '\n');
await writeFile(join(output, 'manifest.json'), JSON.stringify({ name: 'Tawdheef', version, stage: 'public preview candidate', published: false, source: report, files, assets, validation: 'Run npm test, npm run test:ui and npm run release:smoke before publishing. Packaging does not claim live provider authentication.' }, null, 2) + '\n');
console.log(`Prepared ${output}\nSource, skill, ${packs.length} directory packs, brand kit, checksums and release notes are ready. Nothing was published.`);
