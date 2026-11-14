/** Only assets used by the working tracker belong in its production build. */
import { readdir, mkdir, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const brandFiles = new Set(['wordmark-latin-ink.svg', 'wordmark-arabic-ink.svg', 'favicon-16.png', 'favicon-32.png', 'apple-touch-icon.png', 'app-icon-192.png', 'app-icon-512.png', 'mark.svg']);
export function isAppAsset(path) {
  const parts = path.replaceAll('\\', '/').split('/');
  if (parts.some(part => part.startsWith('.') || part === '..')) return false;
  if (parts.length === 1) return /\.(svg|png|ico|webmanifest)$/.test(path);
  if (parts[0] === 'brand') return parts.length === 2 && brandFiles.has(parts[1]);
  return ['flags', 'brands'].includes(parts[0]) && /\.(svg|png|jpg|jpeg|webp)$/.test(path);
}
export async function appAssets(root) {
  const files = [];
  async function walk(relative = '') {
    for (const entry of await readdir(join(root, 'public', relative), { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory() && (relative || ['brand', 'brands', 'flags'].includes(entry.name))) await walk(path);
      else if (entry.isFile() && isAppAsset(path)) files.push(path);
    }
  }
  await walk();
  return files.sort();
}
export async function copyAppAssets(root, output) {
  for (const file of await appAssets(root)) {
    const target = join(output, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(root, 'public', file), target);
  }
}
