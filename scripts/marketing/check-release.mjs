/** Meaningful release checks: complete local site flow, download integrity,
 * archive boundaries and keyboard/reduced-motion behaviour. Read-only to tracker. */
import { chromium } from 'playwright';
import { readFile, stat, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve,dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const base=process.env.TAWDHEEF_QA_URL||'http://127.0.0.1:4019';
const routes=['/welcome/','/skills/','/skills/tawdheef/','/get-started/','/directories/','/directories/uae/','/policies/','/brand/'];
const packCatalog=JSON.parse(await readFile(join(root,'directories/catalog.json'),'utf8'));
routes.push(...packCatalog.packs.filter(pack=>pack.featured!==false&&!pack.historical).map(pack=>'/directories/'+pack.id+'/'));
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text;}}});});
const page=await context.newPage(),errors=[],external=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{const url=new URL(request.url());if(!['127.0.0.1','localhost'].includes(url.hostname)&&url.protocol.startsWith('http'))external.push(request.url());});
const localLinks=new Set(), screenshots=join(root,'outputs/tawdheef-launch-20261113');await mkdir(screenshots,{recursive:true});
for(const route of routes){
 const response=await page.goto(base+route,{waitUntil:'networkidle'});assert.equal(response.status(),200,route);assert.equal(await page.locator('h1').count(),1,route);
 const broken=await page.locator('img').evaluateAll(images=>images.filter(image=>!image.complete||!image.naturalWidth).map(image=>image.src));assert.deepEqual(broken,[],route);
 const links=await page.locator('a[href],img[src],script[src],link[href]').evaluateAll(items=>items.map(item=>item.getAttribute('href')||item.getAttribute('src')).filter(value=>value?.startsWith('/')));
 links.forEach(link=>localLinks.add(link.split('#')[0]));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route);
 if(route!=='/brand/')for(const text of await page.locator('script[type="application/ld+json"]').allTextContents())assert.equal(JSON.parse(text)['@context'],'https://schema.org');
 if(route==='/welcome/')await page.screenshot({path:join(screenshots,'landing-preview.png'),fullPage:false});
}
for(const link of localLinks){
 const response=await context.request.get(base+link);assert.equal(response.status(),200,link);
 if(/\.(png|svg|zip|ico|json|css|js|csv|txt)$/.test(link))assert.ok(!response.headers()['content-type']?.includes('text/html'),`App fallback masquerading as a file: ${link}`);
}
await page.goto(base+'/skills/tawdheef/');await page.getByRole('tab',{name:'Codex',exact:true}).focus();await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'Claude Code',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await page.locator('#claude-panel').isVisible(),true);
await page.locator('#claude-panel .copy').click();assert.ok((await page.evaluate(()=>window.__copied)).startsWith('/tawdheef'));
await page.goto(base+'/directories/uae/');assert.equal(await page.locator('tbody tr:not([hidden])').count(),772);await page.getByRole('searchbox',{name:'Search UAE directory'}).fill('ABB');assert.ok(await page.getByText('ABB',{exact:true}).isVisible());assert.ok(await page.locator('tbody tr:not([hidden])').count()<772);await page.getByRole('searchbox',{name:'Search UAE directory'}).fill('No such source 987654');assert.equal(await page.locator('#directory-empty').isVisible(),true);
await page.goto(base+'/welcome/');await page.getByText('Is it really free?',{exact:true}).click();assert.match(await page.locator('details[open]').textContent(),/own plans or costs/);
await page.goto(base+'/brand/');await page.locator('#lockup').selectOption('bilingual');await page.getByRole('button',{name:'Dark',exact:true}).click();assert.match(await page.locator('#lockup-preview').getAttribute('src'),/bilingual-white/);await page.locator('#endorsement').check();assert.equal(await page.locator('#endorsement-preview').isVisible(),true);await page.getByRole('button',{name:'Preview loading',exact:true}).click();assert.match(await page.locator('#motion-mark').getAttribute('class'),/is-busy/);await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Preview loading',exact:true}).click();assert.equal(await page.locator('#motion-mark .dot-a').evaluate(el=>getComputedStyle(el).animationName),'none');
for(const width of [320,390,768]){
 await page.setViewportSize({width,height:844});for(const route of routes){await page.goto(base+route,{waitUntil:'networkidle'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${route} width${width}`);}
}
await page.setViewportSize({width:390,height:844});await page.goto(base+'/welcome/');await page.screenshot({path:join(screenshots,'landing-mobile-final.png'),fullPage:true});
assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await browser.close();
const source=await JSZip.loadAsync(await readFile(join(root,'public/downloads/tawdheef-source.zip'))),files=Object.keys(source.files);
const privateFiles=files.filter(file=>/(^|\/)\.(local|git)\/|(^|\/)node_modules\/|(^|\/)\.env|\.(sqlite|sqlite-wal|sqlite-shm|log)$/i.test(file));assert.deepEqual(privateFiles,[]);
for(const file of ['package.json','package-lock.json','src/main.jsx','server/index.mjs','skills/tawdheef/SKILL.md','directories/uae/manifest.json','tests/ui.spec.mjs','skills-lock.json'])assert.ok(source.file('tawdheef/'+file),`Missing source file: ${file}`);
const uae=await JSZip.loadAsync(await readFile(join(root,'public/downloads/uae-directory-pack.zip')));assert.deepEqual(await uae.file('uae-directory.json').async('nodebuffer'),await readFile(join(root,'data/uae-directory.json')));
const skill=await JSZip.loadAsync(await readFile(join(root,'public/downloads/tawdheef-skill.zip')));assert.ok(Object.keys(skill.files).some(file=>file.endsWith('skills/tawdheef/SKILL.md')));
const report={date:'2026-11-13',base,pages:routes.length,localResourcesChecked:localLinks.size,desktopAndMobileWidths:[1440,768,390,320],runtimeErrors:errors,externalRequestsOnPageLoad:external,flows:['Local source/download links resolve with correct file types','Agent tabs support arrow-key navigation','Prompt copy writes the selected client prompt','772-record source explorer filters accurately','FAQ exposes real cost boundaries','Brand surfaces, endorsement toggle and reduced motion work'],sourceArchive:{files:files.length,bytes:(await stat(join(root,'public/downloads/tawdheef-source.zip'))).size,privateFiles:0},uaeSnapshot:'Byte-for-byte original; mapped CSV round-trip separately checked',limits:['Browser emulation is not physical phone testing','No GitHub publication, DNS or live domain deployment tested','No provider application or live account actions were performed']};
await writeFile(join(screenshots,'verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
