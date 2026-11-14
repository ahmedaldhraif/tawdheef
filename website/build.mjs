import { contributionSection, contributionIssue } from './contributions.mjs';
/** Build the public-facing Tawdheef site beside the local tracker and as a
 * separate static release. No private tracker data is read by this build. */
import { readFile, writeFile, mkdir, cp, readdir, stat, unlink } from 'node:fs/promises';
import { resolve, dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import JSZip from 'jszip';
import { sourceArchive, checkPublicSource } from '../scripts/release-files.mjs';
import { packageBrand } from '../scripts/branding/package-assets.mjs';
import { loadGuides, createGuidePages, aboutPage, repositoryLinkResolver } from './guides.mjs';
import { renderMarkdown } from './markdown.mjs';
import { walkthrough } from './walkthrough.mjs';
import { pageLayout } from './layout.mjs';
import { skillsOverview } from './skills.mjs';
import { homeContent } from './home.mjs';
import { ui } from './i18n/ui.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
await packageBrand(root);
const config=JSON.parse(await readFile(join(root,'website/config.json'),'utf8'));
const firstRunGuide=await readFile(join(root,'docs/FIRST-RUN.md'),'utf8');
const guides=await loadGuides(root);
const guidesAr=await loadGuides(root,{locale:'ar'});
const guideSets={en:guides,ar:guidesAr};
const aboutMarkdown=await readFile(join(root,'website/about.md'),'utf8');
const exampleDefinitions=[
 {slug:'',source:'README.md',descriptions:{en:'Research companies with public Tawdheef directories before installing the app or connecting a CV. Copy one request, check sources and choose what to do next.',ar:'استكشف الشركات من أدلة Tawdheef العامة قبل تثبيت التطبيق أو ربط سيرة ذاتية. انسخ طلب البحث وتحقق من المصادر واختر خطوتك التالية.'}},
 {slug:'job-search-brief/',source:'job-search-brief.md',descriptions:{en:'A free, private job-search brief for your role, location and sector preferences. Copy the template and keep your completed notes private.',ar:'ملخص مجاني لتفضيلات بحثك عن عمل: الأدوار والمواقع والقطاعات. انسخ النموذج واحتفظ بالنسخة المكتملة في ملاحظاتك الخاصة.'}}
];
const exampleResources=await Promise.all(['en','ar'].flatMap(locale=>exampleDefinitions.map(async definition=>{
 const source=(locale==='ar'?'docs/i18n/ar/examples/':'docs/examples/')+definition.source;
 const markdown=await readFile(join(root,source),'utf8'),title=markdown.match(/^# (.+)$/m)?.[1].trim();
 if(!title)throw new Error('Each example resource needs one title: '+source);
 return{...definition,locale,source,path:(locale==='ar'?'/ar':'')+'/examples/'+definition.slug,markdown,title,description:definition.descriptions[locale]};
})));
const examplePaths=new Map(exampleResources.map(resource=>[resource.source,resource.path]));
const firstRunPrompt=firstRunGuide.match(/^> (Set up Tawdheef[^\r\n]+)$/m)?.[1];
if(!firstRunPrompt)throw new Error('The first-run guide must include its copyable setup request.');
const source=JSON.parse(await readFile(join(root,'data/uae-directory.json'),'utf8'));
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const count=source.records.length;
const date='10 November 2026';
const profile=config.githubProfile;
const catalog=JSON.parse(await readFile(join(root,'directories/catalog.json'),'utf8'));
const packs=catalog.packs;
// Download packs belong to the website build, never the working app build.
// A fresh checkout has no generated ZIPs, so prepare them explicitly here.
if ((await Promise.all(packs.map(async pack=>{try{await stat(join(root,'directories',pack.download));return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}}))).some(Boolean)) {
 const result=spawnSync(process.execPath,[join(root,'scripts/marketing/build-directory-pack.mjs')],{cwd:root,stdio:'inherit',windowsHide:true});
 if(result.error||result.status!==0)throw new Error('Website download packs could not be prepared. Run node scripts/marketing/build-directory-pack.mjs.');
}
const featuredPacks=packs.filter(pack=>pack.featured!==false&&!pack.historical);
const packIndices=new Map(await Promise.all(featuredPacks.map(async pack=>[pack.id,JSON.parse(await readFile(join(root,'directories',pack.id,pack.files.index),'utf8'))])));
const countryTitle=pack=>pack.country==='AE'?'UAE':pack.name;
const repository=config.intendedRepository;
const releaseTag=config.releaseTag;
if(!/^v\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(releaseTag))throw new Error('Set a reviewed releaseTag in website/config.json.');
const releaseUrl=repository+'/releases/tag/'+releaseTag;
const releaseDownload=file=>repository+'/releases/download/'+releaseTag+'/'+file;
const sourceDownload=config.repositoryPublished?releaseDownload('tawdheef-'+releaseTag.slice(1)+'-source.zip'):'/downloads/tawdheef-source.zip';
const repositoryHome=config.repositoryPublished?repository:profile;
const contributeUrl=config.repositoryPublished?repository+'/blob/main/CONTRIBUTING.md':'/downloads/directory-contributing.md';
const policyUrl=file=>config.repositoryPublished?repository+'/blob/main/'+file:'/downloads/policies/'+file.split('/').at(-1);
const packDownload=pack=>config.repositoryPublished?releaseDownload(pack.download.split('/').at(-1)):'/downloads/'+pack.download.split('/').at(-1);
const dataIssueUrl=repository+'/issues/new?template=directory-data.yml';
const countryIssueUrl=repository+'/issues/new?template=new-country-pack.yml';
const displayDate=value=>new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z'));

const prompts={
  discover:'Use Tawdheef. Read AGENTS.md and call get_agent_context and get_capabilities. Review my UAE directory and connected CV, then suggest a shortlist based on my role and location preferences. Do not send or submit anything.',
  apply:'Use Tawdheef. Read my selected companies and connected CV. Start an application run for these named targets, check for duplicates, and help me apply. Record each real outcome with its evidence. Hand off anything that needs my sign-in or approval.',
  review:'Use Tawdheef. Review my tracked applications and refresh replies for the relevant threads. Summarise real changes and next actions. Do not start new applications or send follow-ups.'
};
const codeFor=locale=>(id,text)=>`<div class="install-line" dir="ltr"><code id="${id}">${esc(text)}</code><button class="copy" type="button" data-copy="${id}" aria-label="${esc(ui[locale].copyCommand)}">${esc(ui[locale].copy)}</button></div>`;
const promptFor=locale=>(id,text,label=ui[locale].setupRequest)=>`<div class="prompt"><div class="prompt-header"><span>${esc(label)}</span><button class="copy" type="button" data-copy="${id}" aria-label="${esc(ui[locale].copy)} ${esc(label)}">${esc(ui[locale].copy)}</button></div><pre id="${id}" dir="ltr">${esc(text)}</pre></div>`;
const code=codeFor('en'),prompt=promptFor('en');
const cta=(text,href,secondary=false)=>`<a class="button${secondary?' secondary':''}" href="${href}">${text}</a>`;
const faq=entries=>`<div class="faq">${entries.map(([q,a])=>`<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>`;
const directoryRow=pack=>`<article class="directory-row"><img class="flag" src="/flags/${esc(pack.country)}.svg" width="38" height="25" alt=""/><div class="directory-text"><h3><a href="/directories/${pack.id}/">${esc(pack.name)}</a></h3><p>${new Intl.NumberFormat('en').format(pack.recordCount)} companies &amp; sources · ${displayDate(pack.snapshotDate)}</p></div><div class="pack-actions"><a href="${packDownload(pack)}">Download</a><a href="${config.repositoryPublished?repository+'/tree/main/directories/'+pack.id:'/downloads/'+pack.id+'-source.json'}">${config.repositoryPublished?'GitHub':'Source'}</a></div></article>`;
const costCopy='Tawdheef is free and MIT licensed. Your AI client, model usage and connected providers may have their own plans or costs. Tawdheef does not require its own model API key.';
const tabbioCopy='Tabbio’s free plan lets you build, share and export a digital CV. Connect it to your agent so it can work from your current information. Tawdheef’s CV connection reads the CV you authorise; CV edits and analytics depend on the tools and permissions Tabbio exposes.';
const guidePages=createGuidePages({guides,config,firstRunPrompt,prompt,code,sourceDownload,releaseUrl});
const guidePagesAr=createGuidePages({guides:guidesAr,config,firstRunPrompt,prompt:promptFor('ar'),code:codeFor('ar'),sourceDownload,releaseUrl,locale:'ar'});
const guidePageSets={en:guidePages,ar:guidePagesAr};

function layout(options){const locale=options.path?.startsWith('/ar/')?'ar':'en';return pageLayout({...options,locale},{config,repositoryHome,cta,guidePages:guidePageSets[locale],guides:guideSets[locale],resourcePages:exampleResources.filter(resource=>resource.locale===locale)});}

function homePage(locale='en'){return homeContent({locale,config,sourceDownload,featuredPacks,packDownload,contributeUrl,code:codeFor(locale),cta});}

// Reuse the GitHub examples verbatim, including their copyable requests. Only
// navigation and displayed heading anchors are adapted for the public website.
function examplePage(resource){
 const {locale,source}=resource,t=ui[locale],p=locale==='ar'?'/ar':'',repositoryPrefix=repository+'/blob/main/';
 const resolveLink=href=>{
  if(href.startsWith('#')||href.startsWith('/')||(/^[a-z][a-z0-9+.-]*:/i.test(href)&&!href.startsWith(repositoryPrefix)))return href;
  const [file,hash]=href.split('#'),target=href.startsWith(repositoryPrefix)?file.slice(repositoryPrefix.length):posix.normalize(posix.join(posix.dirname(source),file));
  if(target.startsWith('../'))throw new Error('Example link must stay inside public sources: '+href);
  const fragment=hash?'#'+hash:'',native=examplePaths.get(target);
  if(native)return native+fragment;
  const targetLocale=target.startsWith('docs/i18n/ar/')?'ar':'en';
  return repositoryLinkResolver(config,targetLocale)(repositoryPrefix+target+fragment);
 };
 let headingIndex=0;
 const sectionIds=['research-request','next-steps'];
 const markdown=resource.markdown.replace(/^\[(?:العربية|English)\]\([^\r\n]+\)\r?\n/m,'').replace(/^## (.+)$/gm,(_,heading)=>'## '+heading.trim()+' {#'+(sectionIds[headingIndex++]||'resource-section-'+headingIndex)+'}');
 const title=resource.markdown.match(/^# (.+)$/m)?.[1].trim();
 if(!title)throw new Error('Each example resource needs one title: '+source);
 const copyAria=resource.slug?(locale==='ar'?'انسخ ملخص البحث عن عمل':'Copy job-search brief'):(locale==='ar'?'انسخ طلب البحث':'Copy research request');
 const content=renderMarkdown(markdown,{prefix:'resource-'+(resource.slug?'brief':'research'),resolveLink,copyLabel:t.copy,copyAria});
 content.html=content.html.replace(/(<pre\b[^>]*?) dir="ltr"/g,'$1 dir="auto"');
 const back=resource.slug?p+'/examples/':'/directories/',backLabel=resource.slug?(locale==='ar'?'البحث عن الشركات':'Company research'):t.navDirectories;
 return `<article class="guide-article resource-article"><nav class="breadcrumbs" aria-label="${esc(backLabel)}"><a href="${back}">${esc(backLabel)}</a><span aria-hidden="true">/</span><span>${esc(title)}</span></nav><header class="guide-head"><h1>${esc(title)}</h1></header><div class="docs-content guide-body">${content.html}</div><div class="guide-source"><div class="guide-source-actions"><a href="${repositoryPrefix+source}">${esc(t.guideSource)}</a><a href="${p}/skills/#get-started">${esc(t.getStarted)}</a></div></div></article>`;
}

function directoryPage(){return `<div class="page-head"><h1>Country directories.<br/>Shared on GitHub.</h1><p>Free directory packs for Tawdheef. Start with the GCC, add your country or help keep a list current.</p></div>
<section class="section pack-list"><h2>Choose a pack.</h2><p>Each download comes from GitHub Releases and includes import files and original sources.</p><p><a href="/examples/">Research companies before setup</a>.</p>${featuredPacks.map(directoryRow).join('')}<p class="note">Dated research lists, not live job feeds. <a href="/directories/uae/">Original UAE starter snapshot</a>.</p></section>
<section class="section" id="how-packs-work"><h2>A pack adds a company list.</h2><p>It adds organisations, careers links and source notes to your local tracker. It does not install code or apply to jobs.</p><div class="workflow"><article><span class="step">1</span><div><h3>Download and extract</h3><p>Choose a country above and extract its ZIP from GitHub.</p></div></article><article><span class="step">2</span><div><h3>Add it to Tawdheef</h3><p>Create or select a directory, then choose <strong>List options → Import list</strong>. Select a CSV from the pack and review the preview.</p></div></article><article><span class="step">3</span><div><h3>Use it with your agent</h3><p>Import every numbered CSV part into the same directory. Your agent can now read the list, match it to your CV and help you apply.</p></div></article></div><p><a href="${repository}/blob/main/docs/AGENT-DIRECTORIES.md">Agent and CLI instructions</a> · <a href="/guides/use-the-skill/#cv">Connect your Tabbio CV</a>.</p></section>
${contributionSection({repository})}
<section class="section"><h2>Already have a list?</h2><p>Import your own CSV or Excel file through <strong>List options → Import list</strong>. Keep it private, or contribute public recruitment data on GitHub.</p>${cta('Get Tawdheef','/skills/#get-started',true)}</section>`;}

function countryPackPage(pack){
 const index=packIndices.get(pack.id);
 const roleRows=Object.entries(pack.sourceRoleCounts).sort((a,b)=>b[1]-a[1]).map(([role,n])=>`<li><span>${esc(role)}</span><span>${new Intl.NumberFormat('en').format(n)}</span></li>`).join('');
 const examples=index.records.slice(0,30).map(record=>{const url=[record.careersUrl,record.website].find(value=>/^https?:\/\//i.test(value||''));return `<tr><td>${esc(record.name)}</td><td>${esc(record.sourceRole)}</td><td>${url?`<a href="${esc(url)}" target="_blank" rel="noreferrer">${record.careersUrl===url?'Careers page':'Website'}</a>`:'See source notes'}</td><td><a aria-label="${esc('Suggest edit for '+record.name)}" href="${esc(contributionIssue(repository,'directory-data.yml','[Directory] '+pack.name+' / '+record.id+': '+record.name))}">Suggest edit</a></td></tr>`;}).join('');
 const indexUrl=config.repositoryPublished?`https://raw.githubusercontent.com/ahmedaldhraif/tawdheef/main/directories/${pack.id}/index.json`:`/downloads/${pack.id}-index.json`;
 const fullSource=config.repositoryPublished?repository+'/tree/main/directories/'+pack.id:`/downloads/${pack.id}-source.json`;
 return `<div class="page-head"><a class="back" href="/directories/">‹ All directories</a><h1>${esc(countryTitle(pack))} company directory.</h1><p>${new Intl.NumberFormat('en').format(pack.recordCount)} organisations and recruitment sources for your job search. Free to use with Tawdheef and your agent.</p></div><div class="pack-meta"><div><strong>${new Intl.NumberFormat('en').format(pack.recordCount)}</strong>company &amp; source records</div><div><strong>${displayDate(pack.snapshotDate)}</strong>research snapshot</div><div><strong>Free</strong>country directory pack</div></div><div class="actions country-actions">${cta('Download pack',packDownload(pack))}${cta('View on GitHub',fullSource,true)}</div><p class="note">Research leads, not live job offers. Campuses, branches and unresolved sources may appear separately.</p><section class="section"><h2>What’s inside</h2><p>Company names, careers routes, published contacts and dated source notes. Each record keeps its original source ID and evidence.</p><details class="pack-coverage"><summary>Source types and coverage</summary><ul>${roleRows}</ul></details><p class="note">Import the CSV files in Tawdheef through <strong>List options → Import list</strong>. Preview first. If the pack has numbered parts, import each into the same directory.</p></section><section class="section"><h2>A look at the directory</h2><div class="data-preview"><table><thead><tr><th scope="col">Organisation / source</th><th scope="col">Source role</th><th scope="col">Published route</th><th scope="col">Contribute</th></tr></thead><tbody>${examples}</tbody></table></div><p class="note">Showing ${Math.min(30,index.records.length)} of ${new Intl.NumberFormat('en').format(pack.recordCount)} records. The download includes the full directory.</p></section><section class="section"><h2>For your agent</h2><p>Read the compact JSON index, then follow the source ID to the full evidence. The pack includes a manifest, checksums and import files.</p><div class="actions">${cta('Read JSON index',indexUrl,true)}${cta('Get Tawdheef','/skills/#get-started',true)}</div><p><a href="/examples/#research-request">Try public research</a> · <a href="${repository}/blob/main/docs/AGENT-DIRECTORIES.md">Agent download and CLI import steps</a> · <a href="/guides/use-the-skill/#cv">Create or connect your free Tabbio CV</a>.</p></section>${contributionSection({repository,pack})}`;
}

function policiesPage(){return `<div class="page-head"><h1>About this project.</h1><p>Tawdheef is an independent open-source project maintained by Ahmed AlDhraif. The Tabbio integration connects to its separate CV service.</p></div><div class="docs-content"><h2>Free and open source</h2><p>The code is MIT licensed. You can use, modify, fork and redistribute it, including commercially, while keeping the licence and copyright notice. The licence includes warranty and liability disclaimers; it does not guarantee immunity from legal claims.</p><p><a href="/downloads/LICENSE.txt">Read the MIT licence</a> · <a href="${policyUrl('docs/policies/PROJECT.md')}">Project policy</a></p><h2 id="privacy">Your data</h2><p>The tracker keeps local records, reports and an optional original CV file on your computer. In native mode, external sign-ins, tokens, browser sessions and website passwords stay with your actual Codex or Claude Code client and its services. Explicit local-adapter compatibility can keep separate provider credentials in private local files; the app does not encrypt those files. Local-first does not mean offline: your client and connected AI, CV, email, calendar and websites process authorised data online under their own terms and permissions.</p><p>The website has no first-party analytics scripts or tracking pixels. Hosting services may keep access logs. Links to Tabbio include readable referral parameters.</p><p><a href="${policyUrl('docs/policies/PRIVACY.md')}">Privacy details</a></p><h2>Directory sources</h2><p>Directories are dated research lists, not job offers or verified vacancies. Check the source before acting. Use public recruitment information and respect the rights attached to each source.</p><p><a href="${policyUrl('docs/policies/DATA.md')}">Data and corrections</a> · <a href="${contributeUrl}">Suggest a correction or removal</a></p><h2>Names and logos</h2><p>A fork is your own project. Do not present it as an official Tawdheef, Ahmed AlDhraif or Tabbio service, or imply their endorsement. Third-party brands keep their own rights.</p><p><a href="${policyUrl('docs/policies/TRADEMARKS.md')}">Brand use</a></p><h2>Responsible use</h2><p>Use accounts and information you are authorised to access. Follow applicable law and provider rules. Do not use project spaces for spam, impersonation, harassment or publishing private information.</p><p>These community and service policies do not add restrictions to the MIT code licence. Forks and connected services have their own operators.</p><p><a href="${policyUrl('docs/policies/RESPONSIBLE-USE.md')}">Responsible use</a> · <a href="${config.repositoryPublished?repository+'/blob/main/CODE_OF_CONDUCT.md':'/downloads/code-of-conduct.md'}">Community conduct</a></p><h2>Security</h2><p>Report vulnerabilities privately through the repository’s Security page. Do not post CVs, credentials or private tracking records in public issues.</p><p><a href="${config.repositoryPublished?repository+'/security/advisories/new':'/downloads/security.md'}">Report a vulnerability</a></p></div>`;}

function uaePage(){
 const roles=[...new Set(source.records.map(r=>r.sourceRole).filter(Boolean))].sort();
 const rows=source.records.map(record=>`<tr data-directory-row data-role="${esc(record.sourceRole)}"><td>${esc(record.name)}</td><td>${esc(record.sourceRole||'Not classified')}</td><td>${record.careersUrl&&/^https?:\/\//i.test(record.careersUrl)?`<a href="${esc(record.careersUrl)}" target="_blank" rel="noreferrer">Careers page</a>`:'Route not confirmed'}</td></tr>`).join('');
 return `<div class="page-head"><a class="back" href="/directories/">‹ All directories</a><h1>UAE careers directory.<br/>Ready for your agent.</h1><p>A free, open-source research pack of ${count} organisations and recruitment sources. Use it with Tawdheef to plan your search and track what happens.</p></div><div class="pack-meta"><div><strong>${count}</strong>organisation & source records</div><div><strong>10 Nov 2026</strong>research snapshot</div><div><strong>Free</strong>included in Tawdheef</div></div><div class="actions">${cta('Get the app & directory','/skills/#get-started')}${cta('Download from GitHub',packDownload(packs.find(pack=>pack.id==='uae')),true)}</div><div class="notice">This is a dated source directory, not a live list of vacancies. It includes employers, agencies, portals and programmes. Published links may be untested; inclusion does not confirm hiring, eligibility or permission to automate.</div><section class="section"><h2>Explore the sources.</h2><p>Search the directory and filter by source role. The full pack retains stable source IDs, original hyperlinks, evidence and missing-data notes.</p><div class="directory-tools"><input type="search" id="directory-search" placeholder="Search organisations or source types" aria-label="Search UAE directory"/><select id="source-role" aria-label="Filter by source role"><option value="">All source roles</option>${roles.map(role=>`<option value="${esc(role)}">${esc(role)}</option>`).join('')}</select></div><div class="data-preview"><table><thead><tr><th scope="col">Organisation / source</th><th scope="col">Source role</th><th scope="col">Published route</th></tr></thead><tbody>${rows}</tbody></table><p class="pack-empty" id="directory-empty" hidden>No sources match. Try another name or source role.</p></div><p class="count-label" id="directory-count" role="status">${count} source records</p></section><section class="section"><h2>Use it with Tawdheef.</h2><p>The UAE pack is bundled with a fresh install. Your agent can review the sources alongside your authorised CV and preferences, then suggest useful starting points.</p>${prompt('uae-prompt',prompts.discover,'UAE research prompt')}<p class="note">Adding the pack does not apply to any organisation. Start a named application run when you want your agent to act.</p><div class="actions">${cta('Set up Tawdheef','/guides/use-the-skill/')}${cta('Read the skill guide','/guides/use-the-skill/',true)}</div></section><section class="section"><h2>Use your current CV.</h2><p>Keep a digital CV in Tabbio and connect it when you want your agent to use it. The directory provides leads; your CV provides the context.</p><a class="tabbio-link" href="${config.tabbioSignupUrl}?utm_source=tawdheef&utm_medium=directory&utm_campaign=uae"><img src="/brands/tabbio.svg" width="22" height="22" alt=""/>Build your free Tabbio CV</a></section>`;
}

const pages=[
 ['/skills/','Tawdheef Skills | Set up your local job-search app','Connect Tawdheef’s local CLI and MCP tools to Codex or Claude Code. Find matching jobs, build career profiles and track real outcomes.',()=>skillsOverview({guides,config,sourceDownload,releaseUrl,firstRunPrompt,code,prompt}),'skills',true],
 ['/guides/','Tawdheef guides | Setup, matching jobs and career profiles','Set up Tawdheef with Codex or Claude Code, connect your CV and use local CLI and MCP tools for matching jobs, career profiles and tracking.',guidePages.hub,'guides'],
 ['/about/','About Tawdheef | Built by Ahmed AlDhraif','Why Tawdheef exists: a free, open-source local app for matching jobs and career profiles, with CLI and MCP access for your agent.',()=>aboutPage(aboutMarkdown,config),''],
 ['/', 'Tawdheef | Find matching jobs. Build career profiles.', 'Find matching jobs, build career profiles and connect Gmail, Outlook or iCloud Mail. Free local app with CLI + MCP for Codex and Claude Code.', homePage, ''],
 ['/directories/','Free community directory packs for Tawdheef','Free country packs for Tawdheef. Use the GCC directories, fix an entry or contribute any country on GitHub.',directoryPage,'directories'],
 ['/policies/','Tawdheef project, privacy and policies','An independent open-source project by Ahmed AlDhraif. Code licence, data sources, privacy, responsible use and brand guidance.',policiesPage,''],
 ['/directories/uae/','UAE careers directory | 772 organisation & source records | Tawdheef','A free UAE research directory for your job search and AI agent: 772 organisation/source records, original evidence and published careers routes. Snapshot 10 November 2026.',uaePage,'directories']
];
for(const guide of guides)pages.push(['/guides/'+guide.slug+'/',guide.title+' | Tawdheef guides',guide.description,()=>guidePages.detail(guide),'guides',true]);
for(const pack of featuredPacks)pages.push(['/directories/'+pack.id+'/',countryTitle(pack)+' company and careers directory | Tawdheef',new Intl.NumberFormat('en').format(pack.recordCount)+' researched companies and recruitment sources in '+pack.name+'. Free Tawdheef directory pack for your AI job search. Snapshot '+displayDate(pack.snapshotDate)+'.',()=>countryPackPage(pack),'directories']);
pages.push(['/ar/','Tawdheef | وظائف تناسبك وملفات مهنية','اعثر على وظائف تناسبك، وأنشئ ملفاتك المهنية واربط Gmail أو Outlook أو iCloud Mail. تطبيق محلي مجاني مع CLI وMCP لـ Codex وClaude Code.',()=>homePage('ar'),'']);
pages.push(['/ar/skills/','مهارات Tawdheef | الإعداد والعمل مع مساعدك','ثبّت مهارة Tawdheef واربط التطبيق المحلي بمساعدك وسيرتك الذاتية. أوامر واضحة وأدلة عملية بالعربية.',()=>skillsOverview({guides:guidesAr,config,sourceDownload,releaseUrl,firstRunPrompt,code:codeFor('ar'),prompt:promptFor('ar'),locale:'ar'}),'skills',true]);
pages.push(['/ar/guides/',ui.ar.guidesTitle+' | Tawdheef',ui.ar.guidesDescription,guidePagesAr.hub,'guides']);
for(const guide of guidesAr)pages.push(['/ar/guides/'+guide.slug+'/',guide.title+' | Tawdheef',guide.description,()=>guidePagesAr.detail(guide),'guides',true]);
for(const resource of exampleResources)pages.push([resource.path,resource.title+' | Tawdheef',resource.description,()=>examplePage(resource),'examples',true]);
function structuredData(path,title,description){
 const locale=path.startsWith('/ar/')?'ar':'en',plain=locale==='ar'?path.slice(3):path;
 const graph=[{'@type':'WebPage','@id':config.domain+path,name:title,description,url:config.domain+path,inLanguage:locale,isPartOf:{'@id':config.domain+'/#website'}},{'@type':'WebSite','@id':config.domain+'/#website',name:'Tawdheef',alternateName:'توظيف',url:config.domain}];
 if(plain==='/')graph.push({'@type':'SoftwareApplication',name:'Tawdheef',alternateName:'توظيف',applicationCategory:'BusinessApplication',operatingSystem:'Node.js 24+',description,softwareRequirements:'Node.js 24 or newer; your own compatible agent client for agent workflows',license:config.domain+'/downloads/LICENSE.txt',author:{'@type':'Person',name:config.author,url:config.authorUrl,sameAs:[config.authorLinkedInUrl,config.githubProfile]},offers:{'@type':'Offer',price:'0',priceCurrency:'USD',description:'The app is free. AI clients and connected providers may have their own costs.'}});
 if(path==='/directories/uae/')graph.push({'@type':'Dataset',name:'UAE careers directory | 10 November 2026 research snapshot',description:`${count} organisation/source records with stable source IDs, original evidence and missing-data notes. Not a current vacancy feed.`,url:config.domain+path,temporalCoverage:'2026-11-10',spatialCoverage:{'@type':'Place',name:'United Arab Emirates'},distribution:{'@type':'DataDownload',encodingFormat:'application/zip',contentUrl:packDownload(packs.find(pack=>pack.id==='uae'))}});
 const currentPack=featuredPacks.find(pack=>path==='/directories/'+pack.id+'/');
 const datasets=path==='/directories/'?featuredPacks:currentPack?[currentPack]:[];
 for(const pack of datasets)graph.push({'@type':'Dataset','@id':config.domain+'/directories/'+pack.id+'/#dataset',name:pack.name+' company and careers directory',description:pack.recordCount+' dated organisation/source records with public recruitment routes and retained evidence. Not a live vacancy feed.',url:config.domain+'/directories/'+pack.id+'/',temporalCoverage:pack.snapshotDate,spatialCoverage:{'@type':'Country',name:pack.name},creator:{'@type':'Person',name:config.author,url:config.authorUrl},distribution:[{'@type':'DataDownload',encodingFormat:'application/zip',contentUrl:config.repositoryPublished?packDownload(pack):config.domain+packDownload(pack)},{'@type':'DataDownload',encodingFormat:'application/json',contentUrl:config.repositoryPublished?'https://raw.githubusercontent.com/ahmedaldhraif/tawdheef/main/directories/'+pack.id+'/index.json':config.domain+'/downloads/'+pack.id+'-index.json'}]});
 if(plain!=='/'){const crumbs=[{'@type':'ListItem',position:1,name:'Tawdheef',item:config.domain+(locale==='ar'?'/ar/':'/')}];for(const[parent,label]of[['/guides/','Guides'],['/directories/','Directories'],['/examples/',locale==='ar'?'البحث عن الشركات':'Company research']])if(plain.startsWith(parent)&&plain!==parent)crumbs.push({'@type':'ListItem',position:2,name:label,item:config.domain+(locale==='ar'?'/ar':'')+parent});crumbs.push({'@type':'ListItem',position:crumbs.length+1,name:title,item:config.domain+path});graph.push({'@type':'BreadcrumbList',itemListElement:crumbs});}
 if(plain.startsWith('/guides/')&&plain!=='/guides/')graph.push({'@type':'TechArticle',headline:title,description,url:config.domain+path,inLanguage:locale,isPartOf:{'@id':config.domain+(locale==='ar'?'/ar':'')+'/skills/'},author:{'@type':'Person',name:config.author,url:config.authorUrl}});
 if(path==='/about/')graph.push({'@type':'AboutPage',name:title,url:config.domain+path,about:{'@type':'SoftwareApplication',name:'Tawdheef'},author:{'@type':'Person',name:config.author,url:config.authorUrl,sameAs:[config.authorLinkedInUrl,config.githubProfile]}});
 return '<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@graph':graph}).replaceAll('<','\\u003c')+'</script>';
}
const staticOut=join(root,'site-dist'); await mkdir(staticOut,{recursive:true});
for(const preview of [true,false]){
 const base=preview?join(root,'public'):staticOut;
 for(const [path,title,description,body,active,wide] of pages){
  const folder=join(base,preview&&(path==='/'||path==='/ar/')?(path==='/ar/'?'welcome/ar':'welcome'):path.slice(1)); await mkdir(folder,{recursive:true});
  const html=layout({title,description,path,body:body(),active,preview,home:preview?(path.startsWith('/ar/')?'/welcome/ar/':'/welcome/'):(path.startsWith('/ar/')?'/ar/':'/'),wide});
  await writeFile(join(folder,'index.html'),html.replace('</head>',structuredData(path,title,description)+'</head>'));
 }
}
const legacySetupPaths=['en','ar'].flatMap(locale=>['skills/tawdheef','get-started','guides/get-started'].map(path=>({path:(locale==='ar'?'ar/':'')+path,locale,target:(locale==='ar'?'/ar':'')+'/guides/use-the-skill/'})));
for(const base of [join(root,'public'),staticOut])for(const{path,locale,target}of legacySetupPaths){
 const folder=join(base,path);await mkdir(folder,{recursive:true});
 const title=locale==='ar'?'أعدّ Tawdheef مع مساعدك':'Set up Tawdheef with your agent',continueLabel=locale==='ar'?'متابعة إلى الدليل':'Continue to the guide';
 await writeFile(join(folder,'index.html'),`<!doctype html><html lang="${locale}" dir="${locale==='ar'?'rtl':'ltr'}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${esc(title)}</title><link rel="canonical" href="${config.domain+target}"/><meta name="robots" content="noindex,follow"/><meta http-equiv="refresh" content="0;url=${target}"/></head><body><h1>${esc(title)}</h1><p><a href="${target}">${esc(continueLabel)}</a>.</p></body></html>`);
}
await writeFile(join(staticOut,'_redirects'),legacySetupPaths.flatMap(({path,target})=>['/'+path+' '+target+' 301','/'+path+'/ '+target+' 301']).join('\n')+'\n');
const downloads=join(root,'public/downloads');await mkdir(downloads,{recursive:true});
await cp(join(root,'LICENSE'),join(downloads,'LICENSE.txt'));
await writeFile(join(downloads,'directory-template.csv'),'Name,Source ID,Source role,Website,Careers URL,Apply URL,LinkedIn URL,Email,Sector,Location,Route status,Checked at,Source URL,Notes\r\n');
for(const dir of ['site-assets','brand','brands','downloads']) await cp(join(root,'public',dir),join(staticOut,dir),{recursive:true});
await mkdir(join(staticOut,'brands'),{recursive:true});await cp(join(root,'public/brands/tabbio.svg'),join(staticOut,'brands/tabbio.svg'));
await mkdir(join(staticOut,'flags'),{recursive:true});for(const country of new Set(packs.map(pack=>pack.country))){await cp(join(root,'public/flags',country+'.svg'),join(staticOut,'flags',country+'.svg'));}
const urls=pages.map(([path])=>config.domain+path);
await writeFile(join(staticOut,'sitemap.xml'),'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(url=>`<url><loc>${url}</loc><lastmod>${config.siteDate}</lastmod></url>`).join('')+'</urlset>');
await writeFile(join(staticOut,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${config.domain}/sitemap.xml\n`);
const agentIndex=(await readFile(join(root,'llms.txt'),'utf8')).trimEnd()+'\n\n## Website pages\n'+pages.map(([path,title])=>`- [${title}](${config.domain}${path})`).join('\n')+'\n';
await writeFile(join(staticOut,'llms.txt'),agentIndex);
await writeFile(join(root,'public/llms.txt'),agentIndex);
await writeFile(join(root,'public/robots.txt'),'User-agent: *\nDisallow: /\n');
console.log(`Built ${pages.length} pages for the local app and site-dist; tracking database was not accessed.`);

// Source archives use an explicit allowlist. No .local, .git, environment files,
// node_modules or private user configuration is included. Public, MIT-licensed
// Emil skill copies are included exactly where AGENTS.md references them.
await checkPublicSource(root, {git:false});
async function addTree(zip,folder,prefix){
 for(const entry of await readdir(folder,{withFileTypes:true})){
  if(entry.name==='__pycache__'||entry.name==='downloads'||/\.(zip|log|sqlite(?:-wal|-shm)?)$/i.test(entry.name)||entry.name.startsWith('.env')) continue;
  const relative=prefix+'/'+entry.name;
  if(entry.isDirectory()) await addTree(zip,join(folder,entry.name),relative);
  else zip.file('tawdheef/'+relative,await readFile(join(folder,entry.name)));
 }
}
await writeFile(join(downloads,'tawdheef-source.zip'),await sourceArchive(root));
const skillZip=new JSZip();try{await addTree(skillZip,join(root,'skills/tawdheef'),'skills/tawdheef');for(const file of ['LICENSE','AGENTS.md','docs/FIRST-RUN.md','docs/AGENT-GUIDE.md','docs/DIRECTORY-CONTRIBUTING.md'])skillZip.file('tawdheef/'+file,await readFile(join(root,file)));await writeFile(join(downloads,'tawdheef-skill.zip'),await skillZip.generateAsync({type:'nodebuffer',compression:'DEFLATE'}));}catch(error){if(error.code!=='ENOENT')throw error;}
for(const pack of packs){
 await cp(join(root,'directories',pack.download),join(downloads,pack.download.split('/').at(-1)));
 const manifest=JSON.parse(await readFile(join(root,'directories',pack.path),'utf8'));
 if(!config.repositoryPublished)await cp(join(root,'directories',dirname(pack.path),manifest.files.original),join(downloads,pack.id+'-source.json'));
 else for(const target of [join(downloads,pack.id+'-source.json'),join(staticOut,'downloads',pack.id+'-source.json')]){try{await unlink(target);}catch(error){if(error.code!=='ENOENT')throw error;}}
 await cp(join(root,'directories',dirname(pack.path),manifest.files.index),join(downloads,pack.id+'-index.json'));
}
await cp(join(root,'docs/DIRECTORY-CONTRIBUTING.md'),join(downloads,'directory-contributing.md'));
await cp(join(root,'SECURITY.md'),join(downloads,'security.md'));
await cp(join(root,'CODE_OF_CONDUCT.md'),join(downloads,'code-of-conduct.md'));
await cp(join(root,'docs/policies'),join(downloads,'policies'),{recursive:true});
await cp(downloads,join(staticOut,'downloads'),{recursive:true});
console.log('Built source archive from the public allowlist; prepared downloadable assets.');
