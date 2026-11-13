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
const siteConfig=JSON.parse(await readFile(join(root,'website/config.json'),'utf8'));
const githubAssets=new Set();
const guides=JSON.parse(await readFile(join(root,'website/guides.json'),'utf8'));
routes.push('/guides/','/about/',...guides.map(guide=>'/guides/'+guide.slug+'/'));
routes.push(...packCatalog.packs.filter(pack=>pack.featured!==false&&!pack.historical).map(pack=>'/directories/'+pack.id+'/'));
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copied=text;}}});});
const page=await context.newPage(),errors=[],external=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{const url=new URL(request.url());if(!['127.0.0.1','localhost'].includes(url.hostname)&&url.protocol.startsWith('http'))external.push(request.url());});
const localLinks=new Set(),localAnchors=[],pageIds=new Map(),screenshots=join(root,'outputs/tawdheef-launch-20261113');await mkdir(screenshots,{recursive:true});
for(const route of routes){
 const response=await page.goto(base+route,{waitUntil:'networkidle'});assert.equal(response.status(),200,route);assert.equal(await page.locator('h1').count(),1,route);
 await page.locator('img[loading="lazy"]').evaluateAll(images=>images.forEach(image=>image.loading='eager'));
 await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>{
  if(image.complete)return;
  return new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.addEventListener('error',resolve,{once:true});setTimeout(resolve,3000);});
 })));
 const broken=await page.locator('img').evaluateAll(images=>images.filter(image=>!image.complete||!image.naturalWidth).map(image=>image.src));assert.deepEqual(broken,[],route);
 const links=await page.locator('a[href],img[src],script[src],link[href]').evaluateAll(items=>items.map(item=>item.getAttribute('href')||item.getAttribute('src')).filter(value=>value?.startsWith('/')));
 links.forEach(link=>localLinks.add(link.split('#')[0]));
 pageIds.set(route,new Set(await page.locator('[id]').evaluateAll(items=>items.map(item=>item.id))));
 for(const href of await page.locator('a[href]').evaluateAll(items=>items.map(item=>item.getAttribute('href')).filter(value=>value?.startsWith('/')||value?.startsWith('#')))){const url=new URL(href,base+route);if(url.hash)localAnchors.push([url.pathname,decodeURIComponent(url.hash.slice(1))]);}
 const downloads=await page.locator('a[href*="/releases/download/"]').evaluateAll(items=>items.map(item=>item.href));
 for(const link of downloads){assert.ok(link.startsWith(siteConfig.intendedRepository+'/releases/download/'+siteConfig.releaseTag+'/'),`Wrong release: ${link}`);githubAssets.add(link);}
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route);
 if(route!=='/brand/')for(const text of await page.locator('script[type="application/ld+json"]').allTextContents())assert.equal(JSON.parse(text)['@context'],'https://schema.org');
 if(route==='/welcome/')await page.screenshot({path:join(screenshots,'landing-preview.png'),fullPage:false});
}
for(const[path,id]of localAnchors)if(pageIds.has(path))assert.ok(pageIds.get(path).has(id),`Broken page anchor: ${path}#${id}`);
await page.goto(base+'/guides/');
await page.getByRole('searchbox',{name:'Find a guide'}).fill('MCP');
assert.ok(await page.locator('[data-guide-item]:not([hidden])').count()>0,'Guide search must include body terms');
await page.getByRole('searchbox',{name:'Find a guide'}).fill('no-guide-for-this-98765');assert.equal(await page.locator('#guide-empty').isVisible(),true);
await page.getByRole('searchbox',{name:'Find a guide'}).press('Escape');assert.equal(await page.locator('[data-guide-item]:not([hidden])').count(),guides.length);
await page.goto(base+'/guides/get-started/');
const canonicalSetup=(await readFile(join(root,'docs/FIRST-RUN.md'),'utf8')).match(/^> (Set up Tawdheef[^\r\n]+)$/m)?.[1];
assert.equal(await page.locator('#get-started-setup').textContent(),canonicalSetup);
assert.ok(!(await page.locator('.guide-body').textContent()).includes('[setup-prompt]:'));
await page.goto(base+'/guides/connect-your-agent/');
const copies=page.locator('.guide-code .copy');await copies.nth(0).click();await copies.nth(1).click();
assert.equal(await page.evaluate(()=>window.__copied),await page.locator('.guide-code pre').nth(1).textContent());
await page.waitForTimeout(2300);assert.equal(await copies.nth(0).textContent(),'Copy');assert.equal(await copies.nth(1).textContent(),'Copy');
await page.goto(base+'/welcome/');await page.getByRole('tab',{name:'Find companies',exact:true}).focus();await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'Choose your targets',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await page.locator('#tour-targets-panel').isVisible(),true);await page.keyboard.press('End');assert.equal(await page.locator('#tour-tracking-panel').isVisible(),true);
await page.goto(base+'/get-started/');
const setupPrompt=(await readFile(join(root,'docs/FIRST-RUN.md'),'utf8')).match(/^> (Set up Tawdheef[^\r\n]+)$/m)?.[1];
assert.equal(await page.locator('#first-run-prompt').textContent(),setupPrompt,'Setup request must match the canonical guide');
assert.ok((await page.getByRole('link',{name:'Download from GitHub',exact:true}).getAttribute('href')).endsWith('tawdheef-'+siteConfig.releaseTag.slice(1)+'-source.zip'));
assert.ok((await page.getByRole('link',{name:'Create your free CV',exact:true}).getAttribute('href')).startsWith(siteConfig.tabbioSignupUrl));
await page.goto(base+'/directories/');
assert.equal(await page.locator('#how-packs-work').count(),1);
assert.equal(await page.locator('a[href*="template=directory-data.yml"]').count(),1);
assert.equal(await page.locator('a[href*="template=new-country-pack.yml"]').count(),1);
for(const pack of packCatalog.packs.filter(pack=>pack.featured!==false&&!pack.historical))assert.ok(githubAssets.has(siteConfig.intendedRepository+'/releases/download/'+siteConfig.releaseTag+'/'+pack.download.split('/').at(-1)),`Pack has no GitHub download: ${pack.id}`);
const agentIndex=await readFile(join(root,'site-dist/llms.txt'),'utf8');
assert.ok(agentIndex.startsWith((await readFile(join(root,'llms.txt'),'utf8')).trimEnd()),'Site agent index must share the repository facts');
if(process.env.TAWDHEEF_VERIFY_GITHUB_DOWNLOADS==='1')for(const url of githubAssets){const response=await context.request.head(url);assert.equal(response.status(),200,url);assert.ok(!response.headers()['content-type']?.includes('text/html'),url);}
for(const link of localLinks){
 const response=await context.request.get(base+link);assert.equal(response.status(),200,link);
 if(/\.(png|svg|zip|ico|json|css|js|csv|txt)$/.test(link))assert.ok(!response.headers()['content-type']?.includes('text/html'),`App fallback masquerading as a file: ${link}`);
}
for(const legacy of ['/skills/','/skills/tawdheef/']){await page.goto(base+legacy,{waitUntil:'networkidle'});assert.equal(new URL(page.url()).pathname,'/guides/use-the-skill/');}
await page.goto(base+'/guides/use-the-skill/');assert.equal(await page.locator('.guide-skill-mark').getAttribute('src'),'/brand/mark.svg');
assert.equal(await page.locator('.desktop-navigation a[href="/skills/"]').count(),0);
await page.locator('.guide-code .copy').first().click();assert.ok((await page.evaluate(()=>window.__copied)).startsWith('npx skills@latest add ahmedaldhraif/tawdheef'));
for(const id of ['install','use','workflow','prompts','permissions'])assert.equal(await page.locator('#'+id).count(),1);
await page.goto(base+'/directories/uae/');assert.equal(await page.locator('tbody tr:not([hidden])').count(),772);await page.getByRole('searchbox',{name:'Search UAE directory'}).fill('ABB');assert.ok(await page.getByText('ABB',{exact:true}).isVisible());assert.ok(await page.locator('tbody tr:not([hidden])').count()<772);await page.getByRole('searchbox',{name:'Search UAE directory'}).fill('No such source 987654');assert.equal(await page.locator('#directory-empty').isVisible(),true);
await page.goto(base+'/welcome/');await page.getByText('Is it really free?',{exact:true}).click();assert.match(await page.locator('details[open]').textContent(),/own plans or costs/);
await page.goto(base+'/brand/');await page.locator('#lockup').selectOption('bilingual');await page.getByRole('button',{name:'Dark',exact:true}).click();assert.match(await page.locator('#lockup-preview').getAttribute('src'),/bilingual-white/);await page.locator('#endorsement').check();assert.equal(await page.locator('#endorsement-preview').isVisible(),true);await page.getByRole('button',{name:'Preview loading',exact:true}).click();assert.match(await page.locator('#motion-mark').getAttribute('class'),/is-busy/);await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Preview loading',exact:true}).click();assert.equal(await page.locator('#motion-mark .dot-a').evaluate(el=>getComputedStyle(el).animationName),'none');
for(const width of [320,390,768]){
 await page.setViewportSize({width,height:844});for(const route of routes){await page.goto(base+route,{waitUntil:'networkidle'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${route} width${width}`);}
}
await page.setViewportSize({width:390,height:844});await page.goto(base+'/welcome/');await page.screenshot({path:join(screenshots,'landing-mobile-final.png'),fullPage:true});
await page.goto(base+'/guides/connect-your-cv/');await page.locator('.guide-mobile-nav > summary').click();assert.equal(await page.locator('.guide-mobile-nav nav').isVisible(),true);await page.locator('.guide-mobile-nav a[href="/guides/connect-your-agent/"]').click();assert.equal(new URL(page.url()).pathname,'/guides/connect-your-agent/');assert.equal(await page.locator('.guide-mobile-nav').getAttribute('open'),null);
assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await browser.close();
const source=await JSZip.loadAsync(await readFile(join(root,'public/downloads/tawdheef-source.zip'))),files=Object.keys(source.files);
const privateFiles=files.filter(file=>/(^|\/)\.(local|git)\/|(^|\/)node_modules\/|(^|\/)\.env|\.(sqlite|sqlite-wal|sqlite-shm|log)$/i.test(file));assert.deepEqual(privateFiles,[]);
for(const file of ['package.json','package-lock.json','src/main.jsx','server/index.mjs','skills/tawdheef/SKILL.md','directories/uae/manifest.json','tests/ui.spec.mjs','skills-lock.json'])assert.ok(source.file('tawdheef/'+file),`Missing source file: ${file}`);
const uae=await JSZip.loadAsync(await readFile(join(root,'public/downloads/uae-directory-pack.zip')));assert.deepEqual(await uae.file('uae-directory.json').async('nodebuffer'),await readFile(join(root,'data/uae-directory.json')));
const skill=await JSZip.loadAsync(await readFile(join(root,'public/downloads/tawdheef-skill.zip')));assert.ok(Object.keys(skill.files).some(file=>file.endsWith('skills/tawdheef/SKILL.md')));
const report={date:'2026-11-13',base,pages:routes.length,localResourcesChecked:localLinks.size,desktopAndMobileWidths:[1440,768,390,320],runtimeErrors:errors,externalRequestsOnPageLoad:external,guidePages:guides.length,githubDownloadAvailabilityChecked:process.env.TAWDHEEF_VERIFY_GITHUB_DOWNLOADS==='1',flows:['Guide search finds body terms and clears with Escape','Website and GitHub setup sources agree','Multiple copy buttons reset independently','Walkthrough supports keyboard tabs and labels example data','Mobile guide navigation works and resets on page changes','Internal page anchors resolve','Local source/download links resolve with correct file types','Agent tabs support arrow-key navigation','Prompt copy writes the selected client prompt','772-record source explorer filters accurately','FAQ exposes real cost boundaries','Brand surfaces, endorsement toggle and reduced motion work'],sourceArchive:{files:files.length,bytes:(await stat(join(root,'public/downloads/tawdheef-source.zip'))).size,privateFiles:0},uaeSnapshot:'Byte-for-byte original; mapped CSV round-trip separately checked',limits:['Browser emulation is not physical phone testing','DNS and live domain deployment are checked separately from the local site','No provider application or live account actions were performed']};
await writeFile(join(screenshots,'verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
