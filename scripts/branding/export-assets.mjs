/** Rasterise canonical SVGs in Chromium, then build the downloadable brand kit.
 * No image-generation API, remote resource, provider session or tracker data is used.
 */
import { chromium } from 'playwright';
import { readFile, writeFile, readdir, mkdir, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const brand = join(root, 'public/brand');
const output = join(root, 'outputs/tawdheef-brand-system-20261113');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function render(source, target, width, height) {
  const content = await readFile(join(brand, source), 'utf8');
  if (!height) {
    const box = content.match(/viewBox="[^"]*?([\d.]+) ([\d.]+)"/);
    if (!box) throw new Error(`Missing viewBox: ${source}`);
    height = Math.round(width * Number(box[2]) / Number(box[1]));
  }
  await page.setViewportSize({ width, height });
  const uri = 'data:image/svg+xml;base64,' + Buffer.from(content).toString('base64');
  await page.setContent(`<html><head><style>html,body{margin:0;background:transparent}img{display:block;width:${width}px;height:${height}px}</style></head><body><img src="${uri}" alt=""/></body></html>`);
  await page.locator('img').evaluate(img => img.decode());
  await page.screenshot({ path: join(brand,target), omitBackground: true });
}

for (const file of await readdir(brand)) {
  if (!file.endsWith('.svg') || ['mark-animated.svg','tabbio-original.svg','mark-current.svg','favicon.svg'].includes(file)) continue;
  const size = file.startsWith('mark-16') ? 16 : file.startsWith('mark-24') ? 24 : file.startsWith('mark-32') ? 32 : file==='github-social.svg' ? 1280 : file.startsWith('logo-') ? 1600 : file.startsWith('wordmark-') ? 1000 : file==='endorsement.svg' ? 600 : 512;
  await render(file,file.replace('.svg','.png'),size);
}
for (const size of [16,24,32,48,64,128,180,192,256,512,1024]) {
  await render('app-icon.svg',`app-icon-${size}.png`,size,size);
  await render([16,24,32].includes(size)?`mark-${size}.svg`:'mark.svg',`symbol-${size}.png`,size,size);
}
for (const size of [16,24,32,48,64]) {
  await render([16,24,32].includes(size)?`mark-${size}.svg`:'mark.svg',`favicon-${size}.png`,size,size);
}
await cp(join(brand,'app-icon-180.png'),join(brand,'apple-touch-icon.png'));
await browser.close();

// ICO container with the exact hand-hinted PNG frames, rather than resampling.
const frames = await Promise.all([16,24,32,48,64].map(async size=>({size,bytes:await readFile(join(brand,`favicon-${size}.png`))})));
const header = Buffer.alloc(6); header.writeUInt16LE(1,2); header.writeUInt16LE(frames.length,4);
let offset=6+16*frames.length;
const entries=frames.map(({size,bytes})=>{
  const entry=Buffer.alloc(16); entry[0]=size; entry[1]=size; entry.writeUInt16LE(1,4); entry.writeUInt16LE(32,6); entry.writeUInt32LE(bytes.length,8); entry.writeUInt32LE(offset,12); offset+=bytes.length; return entry;
});
await writeFile(join(brand,'favicon.ico'),Buffer.concat([header,...entries,...frames.map(frame=>frame.bytes)]));
await cp(join(brand,'favicon.ico'),join(root,'public/favicon.ico'));
const inventory=[];
async function addDirectory(zip, folder, prefix='') {
  for (const entry of await readdir(folder,{withFileTypes:true})) {
    if (['tawdheef-brand-kit.zip','asset-inventory.json'].includes(entry.name)) continue;
    const relative=prefix+entry.name;
    if(entry.isDirectory()) { await addDirectory(zip,join(folder,entry.name),relative+'/'); continue; }
    const bytes=await readFile(join(folder,entry.name)); zip.file(relative,bytes);
    inventory.push({file:relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
}
const zip=new JSZip(); await addDirectory(zip,brand);
zip.file('site.webmanifest',await readFile(join(root,'public/site.webmanifest')));
zip.file('source/build-assets.py',await readFile(join(root,'scripts/branding/build-assets.py')));
zip.file('source/export-assets.mjs',await readFile(join(root,'scripts/branding/export-assets.mjs')));
zip.file('source/TawdheefBrand.jsx',await readFile(join(root,'src/TawdheefBrand.jsx')));
zip.file('source/tawdheef-brand.css',await readFile(join(root,'src/tawdheef-brand.css')));
zip.file('asset-inventory.json',JSON.stringify(inventory,null,2)+'\n');
const bytes=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
await writeFile(join(brand,'tawdheef-brand-kit.zip'),bytes);
await writeFile(join(output,'tawdheef-brand-kit.zip'),bytes);
await writeFile(join(brand,'asset-inventory.json'),JSON.stringify(inventory,null,2)+'\n');
await cp(join(brand,'github-social.png'),join(output,'brand-preview.png'));
console.log(JSON.stringify({assets:inventory.length,kit:join(output,'tawdheef-brand-kit.zip'),bytes:bytes.length},null,2));
