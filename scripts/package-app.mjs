/** Build an offline-first user package. This command never publishes or signs in. */
import { mkdir, readFile, writeFile, cp, readdir, lstat, chmod, mkdtemp, rm } from 'node:fs/promises';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import JSZip from 'jszip';
import { checkPublicSource, sourceFiles } from './release-files.mjs';
import { ensureBuild } from './build.mjs';
import { findNpmCli } from './npm-cli.mjs';
import { runtimeEnvironment } from './runtime-env.mjs';
import { nativeLayout, buildNativeLauncher, nativeCommand } from './native-package.mjs';
import { signingConfiguration, signDesktop } from './sign-desktop.mjs';
import { isDirectInvocation } from './is-direct.mjs';

export const NODE_VERSION = '26.13.1';
export const APP_TARGETS = Object.freeze(['win32-x64', 'win32-arm64', 'darwin-x64', 'darwin-arm64', 'linux-x64', 'linux-arm64']);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function appSourceFile(file) {
  return /^(server|bin|skills\/tawdheef|docs)\//.test(file) || /^src\/[^/]+\.js$/.test(file) || /^scripts\/[^/]+\.mjs$/.test(file) ||
    ['data/uae-directory.json', 'AGENTS.md', 'CLAUDE.md', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'Start Tawdheef.cmd', 'Start Tawdheef.command', 'start-tawdheef.sh'].includes(file);
}
export async function directoryFiles(root) {
  const files = [];
  async function walk(folder = '') {
    for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isSymbolicLink()) continue; // npm's .bin links are unnecessary; all launchers use JS entrypoints.
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  await walk(); return files.sort();
}
async function run(command, args, cwd) {
  await new Promise((accept, reject) => {
    const child = spawn(command, args, { cwd, env: runtimeEnvironment(), stdio: 'inherit', shell: false, windowsHide: true });
    child.once('error', reject); child.once('exit', code => code === 0 ? accept() : reject(new Error(`Package step failed (${code}).`)));
  });
}
async function fetchBytes(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`Official runtime download failed: HTTP ${response.status}.`);
  return Buffer.from(await response.arrayBuffer());
}
async function addRuntime(directory, platform, arch) {
  const system = platform === 'win32' ? 'win' : platform;
  const archive = `node-v${NODE_VERSION}-${system}-${arch}.${platform === 'win32' ? 'zip' : 'tar.gz'}`;
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/`;
  const sums = (await fetchBytes(url + 'SHASUMS256.txt')).toString('utf8');
  const expected = sums.split(/\r?\n/).map(line => line.trim().split(/\s+/)).find(parts => parts[1] === archive)?.[0];
  if (!/^[a-f0-9]{64}$/.test(expected || '')) throw new Error('The official runtime checksum is missing.');
  const bytes = await fetchBytes(url + archive);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) throw new Error('Official runtime checksum did not match. Packaging stopped.');
  const unpack = await mkdtemp(join(tmpdir(), 'tawdheef-node-unpack-'));
  const prefix = archive.replace(/\.(zip|tar.gz)$/, '');
  try {
  if (platform === 'win32') {
    const zip = await JSZip.loadAsync(bytes);
    for (const entry of Object.values(zip.files)) {
      const file = entry.name.slice(prefix.length + 1);
      if (entry.dir || !entry.name.startsWith(prefix + '/') || !(file === 'node.exe' || file === 'LICENSE' || file.startsWith('node_modules/npm/'))) continue;
      if (file.split('/').some(part => part === '..')) throw new Error('Invalid runtime archive path.');
      const target = join(directory, 'runtime', file); await mkdir(dirname(target), { recursive: true }); await writeFile(target, await entry.async('nodebuffer'));
    }
  } else {
    const archivePath = join(unpack, archive); await writeFile(archivePath, bytes);
    await run('tar', ['-xzf', archivePath, '-C', unpack], ROOT);
    for (const file of ['bin/node', 'lib/node_modules/npm', 'LICENSE']) {
      const target = join(directory, 'runtime', file); await mkdir(dirname(target), { recursive: true });
      await cp(join(unpack, prefix, file), target, { recursive: true, dereference: true });
    }
    await chmod(join(directory, 'runtime/bin/node'), 0o755);
  }
  } finally { await rm(unpack, { recursive: true, force: true, maxRetries: 5 }); }
  return { version: NODE_VERSION, archive, sha256: actual, source: url + archive };
}
export async function packageApp({ root = ROOT, output, platform = process.platform, arch = process.arch, skipBuild = false } = {}) {
  if (!APP_TARGETS.includes(`${platform}-${arch}`)) throw new Error('Unsupported app target.');
  if (platform !== process.platform || arch !== process.arch) throw new Error('Build on the target OS and architecture so npm dependencies can be verified there.');
  if (!output) throw new Error('Choose a new --output folder. Existing packages are never overwritten.');
  const signing = signingConfiguration({ platform }); // Required signing fails before producing an unsigned download.
  output = resolve(output);
  try { await lstat(output); throw new Error('The package output already exists. Choose a new folder.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await checkPublicSource(root, { git: false });
  if (!skipBuild) await ensureBuild({ directory: root, force: true });
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const packageFolder = join(output, 'tawdheef');
  const layout = nativeLayout(platform);
  const folder = join(packageFolder, layout.codeRoot); await mkdir(folder, { recursive: true });
  for (const file of (await sourceFiles(root)).filter(appSourceFile)) {
    await mkdir(dirname(join(folder, file)), { recursive: true }); await cp(join(root, file), join(folder, file));
  }
  await cp(join(root, 'dist'), join(folder, 'dist'), { recursive: true });
  const runtimePackage = { name: pkg.name, version: pkg.version, private: true, type: 'module', license: pkg.license, engines: { node: '^26.13.1' },
    scripts: Object.fromEntries(Object.entries(pkg.scripts).filter(([key]) => ['start', 'serve', 'cli', 'mcp', 'setup', 'doctor', 'agent', 'background:start', 'background:stop', 'background:status'].includes(key))), dependencies: pkg.dependencies };
  await writeFile(join(folder, 'package.json'), JSON.stringify(runtimePackage, null, 2) + '\n');
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  lock.packages[''] = { name: pkg.name, version: pkg.version, license: pkg.license, engines: runtimePackage.engines, dependencies: pkg.dependencies };
  await writeFile(join(folder, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
  await run(process.execPath, [await findNpmCli(root), 'ci', '--omit=dev', '--omit=optional', '--no-fund', '--no-audit'], folder);
  const runtime = await addRuntime(folder, platform, arch);
  const manifest = { format: 1, name: 'Tawdheef', version: pkg.version, platform, arch, runtime, prebuilt: true, layout, published: false,
    signing: { requested: signing.requested, verification: 'See signing-verification.json outside the app bundle; the exact extracted download must be verified.' },
    validation: 'Run release:app:smoke on this exact extracted package. Account sign-in and other platforms are separate checks.' };
  await writeFile(join(folder, 'tawdheef-app.json'), JSON.stringify(manifest, null, 2) + '\n');
  for (const file of ['Start Tawdheef.command', 'start-tawdheef.sh']) await chmod(join(folder, file), 0o755);
  await buildNativeLauncher({ root, folder: packageFolder, version: pkg.version, platform, arch });
  const signature = await signDesktop({ folder: packageFolder, codeRoot: folder, layout, platform });
  await writeFile(join(packageFolder, 'signing-verification.json'), JSON.stringify(signature, null, 2) + '\n');
  await writeFile(join(packageFolder, 'OPEN-ME.txt'), `Tawdheef\n\nExtract the whole folder, then open ${platform === 'darwin' ? 'Tawdheef.app' : platform === 'win32' ? 'Tawdheef.exe' : 'start-tawdheef.sh'}. Node is included; no npm install or build is needed. The interface opens in your browser.\n\nOpen Connections to choose Codex or Claude Code. Your assistant still needs its own installation and sign-in. Browser tools and provider bridges install only when selected.\n\nNative Windows/Mac launchers preserve APPLY_TRACKER_DATA or an adjacent existing .local. New native installations store data in your user application-data folder; assistant settings live in its workspace subfolder. Nothing migrates automatically. Keep the same data path when updating.\n\n${signature.signed ? 'Platform signing was verified during packaging; retain the separate verification receipt and verify the extracted download.' : 'This is an unsigned candidate. Do not disable operating-system security to run it.'}\n`);
  const zip = new JSZip(); const files = await directoryFiles(packageFolder); let unpackedBytes = 0;
  for (const file of files) {
    if (platform === 'darwin') { unpackedBytes += (await lstat(join(packageFolder, file))).size; continue; }
    const bytes = await readFile(join(packageFolder, file)); unpackedBytes += bytes.length;
    const portablePath = file.replaceAll(sep, '/');
    const executable = /\.(command|sh)$/.test(file) || portablePath.endsWith('runtime/bin/node') || portablePath === layout.launcher;
    zip.file(`tawdheef/${file.replaceAll(sep, '/')}`, bytes, { unixPermissions: executable ? 0o100755 : 0o100644 });
  }
  const name = `tawdheef-${pkg.version}-${platform}-${arch}.zip`;
  let archive;
  if (platform === 'darwin') {
    // Apple's archive tool preserves signature/notarization extended metadata.
    await nativeCommand('ditto', ['-c', '-k', '--keepParent', '--sequesterRsrc', packageFolder, join(output, name)], { capture: true });
    archive = await readFile(join(output, name));
  } else {
    archive = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 }, platform: 'UNIX' });
    await writeFile(join(output, name), archive);
  }
  const report = { ...manifest, ...signature, signing: signature, archive: name, bytes: archive.length, unpackedBytes, files: files.length, sha256: createHash('sha256').update(archive).digest('hex') };
  await writeFile(join(output, 'package-report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(output, 'SHA256SUMS.txt'), `${report.sha256}  ${name}\n`);
  return { folder: packageFolder, appRoot: folder, report };
}
if (isDirectInvocation(import.meta.url)) {
  const args = process.argv.slice(2); const index = args.indexOf('--output');
  if (args.includes('--help')) console.log('Build a local user package: npm run release:app -- --output NEW_FOLDER\nBuild on each target OS/architecture. Bundles verified Node 26 LTS, npm, runtime dependencies and the prebuilt interface. Nothing is published.');
  else if (index < 0 || !args[index + 1] || args.some((arg, i) => i !== index && i !== index + 1)) { console.error('Use --output NEW_FOLDER.'); process.exitCode = 1; }
  else packageApp({ output: args[index + 1] }).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
