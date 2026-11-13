/** Package existing original artwork; no browser or font rendering required. */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';
import { sourceFiles } from '../release-files.mjs';
export async function packageBrand(root) {
  const zip = new JSZip();
  for (const file of (await sourceFiles(root)).filter(path => path.startsWith('public/brand/'))) zip.file(file.slice('public/brand/'.length), await readFile(join(root, file)), { date: new Date('2026-01-01T00:00:00Z') });
  for (const file of ['LICENSE', 'THIRD-PARTY-NOTICES.md', 'public/site.webmanifest', 'scripts/branding/build-assets.py', 'scripts/branding/export-assets.mjs', 'src/TawdheefBrand.jsx', 'src/tawdheef-brand.css']) zip.file(`source/${file}`, await readFile(join(root, file)), { date: new Date('2026-01-01T00:00:00Z') });
  await writeFile(join(root, 'public/brand/tawdheef-brand-kit.zip'), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
}
