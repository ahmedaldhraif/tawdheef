import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function buildFingerprint(directory = root) {
  const hash = createHash('sha256');
  async function walk(path) {
    for (const entry of (await readdir(join(directory, path), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = `${path}/${entry.name}`;
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) { hash.update(name); hash.update(await readFile(join(directory, name))); }
    }
  }
  for (const path of ['src', 'public']) await walk(path);
  for (const path of ['index.html', 'vite.config.mjs', 'package.json', 'package-lock.json']) { hash.update(path); hash.update(await readFile(join(directory, path))); }
  return hash.digest('hex');
}

export async function ensureBuild({ directory = root, force = false } = {}) {
  // ZIP downloads are generated locally, never recursively committed inside source.
  try { await access(join(directory, 'public/downloads/tawdheef-source.zip')); }
  catch {
    for (const script of ['scripts/marketing/build-directory-pack.mjs', 'website/build.mjs']) {
      try { await access(join(directory, script)); } catch { continue; }
      const result = spawnSync(process.execPath, [join(directory, script)], { cwd: directory, stdio: 'inherit', windowsHide: true });
      if (result.error || result.status !== 0) throw new Error(`Could not prepare local downloads: ${script}`);
    }
  }
  const fingerprint = await buildFingerprint(directory);
  const marker = join(directory, 'dist', '.tawdheef-build');
  if (!force) try {
    await access(join(directory, 'dist', 'index.html'));
    if ((await readFile(marker, 'utf8')).trim() === fingerprint) return { built: false };
  } catch { /* Missing build; generate it below. */ }
  const result = spawnSync(process.execPath, [join(directory, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: directory, stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('Build failed. Review the output above; the app was not started.');
  await writeFile(marker, `${fingerprint}\n`);
  return { built: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) ensureBuild({ force: true }).catch(error => { console.error(error.message); process.exitCode = 1; });
