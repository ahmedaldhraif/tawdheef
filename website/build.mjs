/** Build the public-facing Tawdheef site beside the local tracker and as a
 * separate static release. No private tracker data is read by this build. */
import { readFile, writeFile, mkdir, cp, readdir, stat, unlink } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { sourceArchive, checkPublicSource } from '../scripts/release-files.mjs';
import { packageBrand } from '../scripts/branding/package-assets.mjs';
import { loadGuides, createGuidePages, aboutPage } from './guides.mjs';
import { walkthrough } from './walkthrough.mjs';
import { pageLayout } from './layout.mjs';
import { skillsOverview } from './skills.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
await packageBrand(root);
const config=JSON.parse(await readFile(join(root,'website/config.json'),'utf8'));
const firstRunGuide=await readFile(join(root,'docs/FIRST-RUN.md'),'utf8');
const guides=await loadGuides(root);
const aboutMarkdown=await readFile(join(root,'website/about.md'),'utf8');
const firstRunPrompt=firstRunGuide.match(/^> (Set up Tawdheef[^\r\n]+)$/m)?.[1];
if(!firstRunPrompt)throw new Error('The first-run guide must include its copyable setup request.');
const source=JSON.parse(await readFile(join(root,'data/uae-directory.json'),'utf8'));
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const count=source.records.length;
const date='10 November 2026';
const profile=config.githubProfile;
const catalog=JSON.parse(await readFile(join(root,'directories/catalog.json'),'utf8'));
const packs=catalog.packs;
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
const code=(id,text)=>`<div class="install-line"><code id="${id}">${esc(text)}</code><button class="copy" type="button" data-copy="${id}" aria-label="Copy command">Copy</button></div>`;
const prompt=(id,text,label='Example prompt')=>`<div class="prompt"><div class="prompt-header"><span>${label}</span><button class="copy" type="button" data-copy="${id}" aria-label="Copy ${label.toLowerCase()}">Copy</button></div><pre id="${id}">${esc(text)}</pre></div>`;
const cta=(text,href,secondary=false)=>`<a class="button${secondary?' secondary':''}" href="${href}">${text}</a>`;
const faq=entries=>`<div class="faq">${entries.map(([q,a])=>`<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>`;
const directoryRow=pack=>`<article class="directory-row"><img class="flag" src="/flags/${esc(pack.country)}.svg" width="38" height="25" alt=""/><div class="directory-text"><h3><a href="/directories/${pack.id}/">${esc(pack.name)}</a></h3><p>${new Intl.NumberFormat('en').format(pack.recordCount)} companies &amp; sources · ${displayDate(pack.snapshotDate)}</p></div><div class="pack-actions"><a href="${packDownload(pack)}">Download</a><a href="${config.repositoryPublished?repository+'/tree/main/directories/'+pack.id:'/downloads/'+pack.id+'-source.json'}">${config.repositoryPublished?'GitHub':'Source'}</a></div></article>`;
const costCopy='Tawdheef is free and MIT licensed. Your AI client, model usage and connected providers may have their own plans or costs. Tawdheef does not require its own model API key.';
const tabbioCopy='Tabbio’s free plan lets you build, share and export a digital CV. Connect it to your agent so it can work from your current information. Tawdheef’s CV connection reads the CV you authorise; CV edits and analytics depend on the tools and permissions Tabbio exposes.';
const guidePages=createGuidePages({guides,config,firstRunPrompt,prompt,code,sourceDownload,releaseUrl});

function layout(options){return pageLayout(options,{config,repositoryHome,cta,guidePages,guides});}

function homePage(){return `
<section class="hero">
<h1>Auto-apply to jobs.<br/>Track your applications.</h1>
<p class="subtitle">Free, open-source software for you and your <span class="agent-options"><span class="agent-name"><img src="/brands/chatgpt.svg" width="20" height="20" alt=""/>ChatGPT</span> or <span class="agent-name"><img src="/brands/claude.svg" width="22" height="22" alt=""/>Claude</span> agent.</span></p>
<div class="actions">${cta('Get the free app','/skills/#get-started')}<a class="hero-explainer" href="#walkthrough">See how it works</a></div>
<div class="creator-credit"><a class="creator-handle" href="${config.authorLinkedInUrl}" target="_blank" rel="noopener" aria-label="Built by Ahmed AlDhraif, view LinkedIn profile"><img class="credit-avatar" src="/site-assets/people/ahmed-aldhraif.png" width="32" height="32" alt="" decoding="async"/><span>Built by <strong>Ahmed AlDhraif</strong></span><img class="credit-linkedin" src="/brands/linkedin-original.ico" width="18" height="18" alt=""/></a></div>
</section>
${walkthrough()}
<div class="facts"><div><strong>Free & open source</strong><span>Open-source app.<br/>MIT licensed code.</span></div><div><strong>Saved locally</strong><span>Tracking is saved<br/>on your computer.</span></div><div><strong>${featuredPacks.length} country packs</strong><span>Use a directory.<br/>Help improve it.</span></div></div>
<section class="section" id="how-it-works"><h2>Set up once. Start applying.</h2><p>Connect your agent and CV, then choose where to apply.</p><div class="workflow"><article><span class="step">1</span><div><h3>Connect your agent</h3><p><a href="/guides/use-the-skill/#install">Download Tawdheef</a> and open the folder in Codex or Claude Code. Ask your agent to set it up, or use the <a href="#quick-setup">CLI quick start</a> below.</p></div></article><article><span class="step">2</span><div><h3>Connect your free CV</h3><p><a href="/guides/use-the-skill/#cv">Create a free Tabbio CV or connect yours</a> in Connections, then choose your assistant and check connections.</p></div></article><article><span class="step">3</span><div><h3>Choose companies. Start Run.</h3><p>Use the included directory or add a country pack. Choose your targets; your agent applies and Tawdheef tracks outcomes and replies.</p></div></article></div><div class="quick-setup" id="quick-setup" aria-labelledby="quick-setup-title"><h3 id="quick-setup-title">CLI quick start</h3><p>With <a href="https://nodejs.org/en/download">Node.js 24+</a>, run these in the downloaded folder:</p>${code('quick-cli','npm run setup -- --browser\nnpm run agent -- codex --browser\nnpm start')}<p>Using Claude Code? Replace the second command with <code>npm run agent -- claude-code --browser</code>. These prepare the app, MCP tools and skill. Complete sign-ins and connect your CV in the app.</p></div><div class="actions">${cta('Set up with your agent','/skills/#get-started')}<a href="/guides/">All guides</a></div></section>
<section class="section tabbio-section" id="tabbio" aria-labelledby="tabbio-title">
<div class="tabbio-heading"><a class="tabbio-brand" href="${config.tabbioUrl}" aria-label="Tabbio"><img src="/brands/tabbio-wordmark-violet-original.svg" width="144" height="35" alt="Tabbio"/></a><span class="free-label">Free digital CV</span></div>
<h2 id="tabbio-title">Your CV, ready for recruiters and agents.</h2>
<p class="tabbio-summary">Tabbio works worldwide.</p>
<ul class="cv-benefits">
<li><div class="benefit-heading"><span class="benefit-brands" aria-hidden="true"><img src="/brands/mcp-original.svg" width="22" height="22" alt=""/><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3m6 0h4"/></svg></span><h3>A CV your agent can update</h3></div><p>Read, update and share your latest CV <span class="keep-word">through <a href="https://www.tabbio.com/en/mcp">MCP</a> or <a href="https://www.tabbio.com/en/cli">CLI</a>.</span></p></li>
<li><div class="benefit-heading"><span class="benefit-brands" aria-hidden="true"><img src="/brands/google-original.ico" width="22" height="22" alt=""/><img src="/brands/bing-original.ico" width="22" height="22" alt=""/></span><h3>Made to be found</h3></div><p>Publish a CV that Google, Bing, AI search and other agents can read.</p></li>
<li><div class="benefit-heading"><span class="benefit-brands" aria-hidden="true"><img src="/brands/tabbio.svg" width="22" height="22" alt=""/></span><h3>Open to work on Tabbio</h3></div><p>Show Tabbio employers you’re open to work so they can reach out.</p></li>
</ul>
<div class="identity-option"><img src="/brands/uae-pass-original.png" width="28" height="23" alt=""/><p>Optional identity verification with UAE PASS. <span>For eligible users; Tabbio is available worldwide.</span></p></div>
<div class="tabbio-actions">${cta('Create your free CV',config.tabbioSignupUrl+'?utm_source=tawdheef&utm_medium=website&utm_campaign=live_cv')}<a class="connect-existing" href="/guides/use-the-skill/#cv">Connect your CV</a></div>
<p class="tabbio-detail">Public CVs are eligible for search indexing. <a href="https://docs.tabbio.com/en/career/search-preview">About visibility</a></p>
</section>
<section class="section"><h2>Country packs. Built to be shared.</h2><p>Download a directory from GitHub and import it into Tawdheef. Add companies, fix links or contribute any country for others to use.</p>${featuredPacks.map(directoryRow).join('')}<div class="actions">${cta('How packs work','/directories/#how-packs-work',true)}${cta('Contribute on GitHub',contributeUrl,true)}</div></section>
<section class="section"><h2>Questions before you start?</h2>${faq([
 ['Is it really free?',costCopy+' <a href="/guides/use-the-skill/#privacy">See costs and connections</a>.'],
 ['Do I need to know how to code?','No coding is needed. Open the downloaded folder in Codex or Claude Code and ask your agent to set it up. Node.js 24 or newer is required. <a href="/guides/use-the-skill/">Read the setup guide</a>.'],
 ['Does it apply for me?','Your agent can send emails and complete supported forms when you explicitly start a run for named targets. Sign-ins, CAPTCHAs, provider approvals and LinkedIn steps may need you. <a href="/guides/apply-to-jobs/">See how applications work</a>.'],
 ['Do I need Tabbio?','You can browse directories and track applications without Tabbio. Run requires a connected Tabbio CV. <a href="/guides/connect-your-cv/">Create or connect your free CV</a>.'],
 ['What does Tawdheef mean?','Tawdheef (توظيف) means employment in Arabic. The app is for job seekers anywhere; <a href="/directories/#contribute">directory contributions from any country are welcome</a>.'],
 ['Can I use it on my phone?','The website works on your phone. The local app and agent run on your computer, and the default server is available only there. <a href="/guides/use-the-skill/#privacy">See local requirements</a>.'],
 ['Where does my data go?','Your tracking records stay in a local database. AI, CV and email services connect online under their own permissions. <a href="/policies/#privacy">Read the privacy guide</a>.'],
 ['Can I add a country or fix a company?','Yes. Use a pack, fix a link or contribute a directory for any country. Packs include dated sources, not live vacancies. <a href="/directories/#contribute">Find packs and contribute</a>.']
])}</section><section class="closing"><h2>Ready to start?</h2><p>Start with the free app. Add a directory. Bring your agent.</p>${cta('Get Tawdheef','/skills/#get-started')}</section>`;}

function directoryPage(){return `<div class="page-head"><h1>Country directories.<br/>Shared on GitHub.</h1><p>Free directory packs for Tawdheef. Start with the GCC, add your country or help keep a list current.</p></div>
<section class="section pack-list"><h2>Choose a pack.</h2><p>Each download comes from GitHub Releases and includes import files and original sources.</p>${featuredPacks.map(directoryRow).join('')}<p class="note">Dated research lists, not live job feeds. <a href="/directories/uae/">Original UAE starter snapshot</a>.</p></section>
<section class="section" id="how-packs-work"><h2>A pack adds a company list.</h2><p>It adds organisations, careers links and source notes to your local tracker. It does not install code or apply to jobs.</p><div class="workflow"><article><span class="step">1</span><div><h3>Download and extract</h3><p>Choose a country above and extract its ZIP from GitHub.</p></div></article><article><span class="step">2</span><div><h3>Add it to Tawdheef</h3><p>Create or select a directory, then choose <strong>List options → Import list</strong>. Select a CSV from the pack and review the preview.</p></div></article><article><span class="step">3</span><div><h3>Use it with your agent</h3><p>Import every numbered CSV part into the same directory. Your agent can now read the list, match it to your CV and help you apply.</p></div></article></div><p><a href="${repository}/blob/main/docs/AGENT-DIRECTORIES.md">Agent and CLI instructions</a> · <a href="/guides/use-the-skill/#cv">Connect your Tabbio CV</a>.</p></section>
<section class="section" id="contribute"><h2>Your correction helps the next person.</h2><p>Add a company, fix a link or share a pack from any country. Open an issue with a public source; no coding needed. Developers can send a pull request.</p><div class="actions">${cta('Add or fix a company',dataIssueUrl)}${cta('Suggest a country pack',countryIssueUrl,true)}</div><p><a href="${contributeUrl}">Contribution guide</a> · <a href="${repository}/tree/main/directories/_template">Pack template on GitHub</a>.</p><p class="note">Initial research by Ahmed AlDhraif. Community contributions welcome. Accepted changes become available for everyone in the repository and a future pack release.</p></section>
<section class="section"><h2>Already have a list?</h2><p>Import your own CSV or Excel file through <strong>List options → Import list</strong>. Keep it private, or contribute public recruitment data on GitHub.</p>${cta('Get Tawdheef','/skills/#get-started',true)}</section>`;}

function countryPackPage(pack){
 const index=packIndices.get(pack.id);
 const roleRows=Object.entries(pack.sourceRoleCounts).sort((a,b)=>b[1]-a[1]).map(([role,n])=>`<li><span>${esc(role)}</span><span>${new Intl.NumberFormat('en').format(n)}</span></li>`).join('');
 const examples=index.records.slice(0,30).map(record=>{const url=[record.careersUrl,record.website].find(value=>/^https?:\/\//i.test(value||''));return `<tr><td>${esc(record.name)}</td><td>${esc(record.sourceRole)}</td><td>${url?`<a href="${esc(url)}" target="_blank" rel="noreferrer">${record.careersUrl===url?'Careers page':'Website'}</a>`:'See source notes'}</td></tr>`;}).join('');
 const indexUrl=config.repositoryPublished?`https://raw.githubusercontent.com/ahmedaldhraif/tawdheef/main/directories/${pack.id}/index.json`:`/downloads/${pack.id}-index.json`;
 const fullSource=config.repositoryPublished?repository+'/tree/main/directories/'+pack.id:`/downloads/${pack.id}-source.json`;
 return `<div class="page-head"><a class="back" href="/directories/">‹ All directories</a><h1>${esc(countryTitle(pack))} company directory.</h1><p>${new Intl.NumberFormat('en').format(pack.recordCount)} organisations and recruitment sources for your job search. Free to use with Tawdheef and your agent.</p></div><div class="pack-meta"><div><strong>${new Intl.NumberFormat('en').format(pack.recordCount)}</strong>company &amp; source records</div><div><strong>${displayDate(pack.snapshotDate)}</strong>research snapshot</div><div><strong>Free</strong>country directory pack</div></div><div class="actions country-actions">${cta('Download pack',packDownload(pack))}${cta('View on GitHub',fullSource,true)}</div><p class="note">Research leads, not live job offers. Campuses, branches and unresolved sources may appear separately.</p><section class="section"><h2>What’s inside</h2><p>Company names, careers routes, published contacts and dated source notes. Each record keeps its original source ID and evidence.</p><details class="pack-coverage"><summary>Source types and coverage</summary><ul>${roleRows}</ul></details><p class="note">Import the CSV files in Tawdheef through <strong>List options → Import list</strong>. Preview first. If the pack has numbered parts, import each into the same directory.</p></section><section class="section"><h2>A look at the directory</h2><div class="data-preview"><table><thead><tr><th scope="col">Organisation / source</th><th scope="col">Source role</th><th scope="col">Published route</th></tr></thead><tbody>${examples}</tbody></table></div><p class="note">Showing ${Math.min(30,index.records.length)} of ${new Intl.NumberFormat('en').format(pack.recordCount)} records. The download includes the full directory.</p></section><section class="section"><h2>For your agent</h2><p>Read the compact JSON index, then follow the source ID to the full evidence. The pack includes a manifest, checksums and import files.</p><div class="actions">${cta('Read JSON index',indexUrl,true)}${cta('Get Tawdheef','/skills/#get-started',true)}</div><p><a href="${repository}/blob/main/docs/AGENT-DIRECTORIES.md">Agent download and CLI import steps</a> · <a href="/guides/use-the-skill/#cv">Create or connect your free Tabbio CV</a>.</p></section><section class="section"><h2>Help keep it useful.</h2><p>Add a company, fix a link or contribute another country.</p>${cta('Add or fix a company',dataIssueUrl,true)}<p><a href="${contributeUrl}">Contribution guide</a> · <a href="${countryIssueUrl}">Suggest a country pack</a>.</p></section>`;
}

function policiesPage(){return `<div class="page-head"><h1>About this project.</h1><p>Tawdheef is an independent open-source project maintained by Ahmed AlDhraif. The Tabbio integration connects to its separate CV service.</p></div><div class="docs-content"><h2>Free and open source</h2><p>The code is MIT licensed. You can use, modify, fork and redistribute it, including commercially, while keeping the licence and copyright notice. The licence includes warranty and liability disclaimers; it does not guarantee immunity from legal claims.</p><p><a href="/downloads/LICENSE.txt">Read the MIT licence</a> · <a href="${policyUrl('docs/policies/PROJECT.md')}">Project policy</a></p><h2 id="privacy">Your data</h2><p>The tracker stores your records and credentials locally. They are not encrypted by the app. Connected AI, email and CV services process data under their own terms and permissions.</p><p>The website has no first-party analytics scripts or tracking pixels. Hosting services may keep access logs. Links to Tabbio include readable referral parameters.</p><p><a href="${policyUrl('docs/policies/PRIVACY.md')}">Privacy details</a></p><h2>Directory sources</h2><p>Directories are dated research lists, not job offers or verified vacancies. Check the source before acting. Use public recruitment information and respect the rights attached to each source.</p><p><a href="${policyUrl('docs/policies/DATA.md')}">Data and corrections</a> · <a href="${contributeUrl}">Suggest a correction or removal</a></p><h2>Names and logos</h2><p>A fork is your own project. Do not present it as an official Tawdheef, Ahmed AlDhraif or Tabbio service, or imply their endorsement. Third-party brands keep their own rights.</p><p><a href="${policyUrl('docs/policies/TRADEMARKS.md')}">Brand use</a></p><h2>Responsible use</h2><p>Use accounts and information you are authorised to access. Follow applicable law and provider rules. Do not use project spaces for spam, impersonation, harassment or publishing private information.</p><p>These community and service policies do not add restrictions to the MIT code licence. Forks and connected services have their own operators.</p><p><a href="${policyUrl('docs/policies/RESPONSIBLE-USE.md')}">Responsible use</a> · <a href="${config.repositoryPublished?repository+'/blob/main/CODE_OF_CONDUCT.md':'/downloads/code-of-conduct.md'}">Community conduct</a></p><h2>Security</h2><p>Report vulnerabilities privately through the repository’s Security page. Do not post CVs, credentials or private tracking records in public issues.</p><p><a href="${config.repositoryPublished?repository+'/security/advisories/new':'/downloads/security.md'}">Report a vulnerability</a></p></div>`;}

function uaePage(){
 const roles=[...new Set(source.records.map(r=>r.sourceRole).filter(Boolean))].sort();
 const rows=source.records.map(record=>`<tr data-directory-row data-role="${esc(record.sourceRole)}"><td>${esc(record.name)}</td><td>${esc(record.sourceRole||'Not classified')}</td><td>${record.careersUrl&&/^https?:\/\//i.test(record.careersUrl)?`<a href="${esc(record.careersUrl)}" target="_blank" rel="noreferrer">Careers page</a>`:'Route not confirmed'}</td></tr>`).join('');
 return `<div class="page-head"><a class="back" href="/directories/">‹ All directories</a><h1>UAE careers directory.<br/>Ready for your agent.</h1><p>A free, open-source research pack of ${count} organisations and recruitment sources. Use it with Tawdheef to plan your search and track what happens.</p></div><div class="pack-meta"><div><strong>${count}</strong>organisation & source records</div><div><strong>10 Nov 2026</strong>research snapshot</div><div><strong>Free</strong>included in Tawdheef</div></div><div class="actions">${cta('Get the app & directory','/skills/#get-started')}${cta('Download from GitHub',packDownload(packs.find(pack=>pack.id==='uae')),true)}</div><div class="notice">This is a dated source directory, not a live list of vacancies. It includes employers, agencies, portals and programmes. Published links may be untested; inclusion does not confirm hiring, eligibility or permission to automate.</div><section class="section"><h2>Explore the sources.</h2><p>Search the directory and filter by source role. The full pack retains stable source IDs, original hyperlinks, evidence and missing-data notes.</p><div class="directory-tools"><input type="search" id="directory-search" placeholder="Search organisations or source types" aria-label="Search UAE directory"/><select id="source-role" aria-label="Filter by source role"><option value="">All source roles</option>${roles.map(role=>`<option value="${esc(role)}">${esc(role)}</option>`).join('')}</select></div><div class="data-preview"><table><thead><tr><th scope="col">Organisation / source</th><th scope="col">Source role</th><th scope="col">Published route</th></tr></thead><tbody>${rows}</tbody></table><p class="pack-empty" id="directory-empty" hidden>No sources match. Try another name or source role.</p></div><p class="count-label" id="directory-count" role="status">${count} source records</p></section><section class="section"><h2>Use it with Tawdheef.</h2><p>The UAE pack is bundled with a fresh install. Your agent can review the sources alongside your authorised CV and preferences, then suggest useful starting points.</p>${prompt('uae-prompt',prompts.discover,'UAE research prompt')}<p class="note">Adding the pack does not apply to any organisation. Start a named application run when you want your agent to act.</p><div class="actions">${cta('Set up Tawdheef','/guides/use-the-skill/')}${cta('Read the skill guide','/guides/use-the-skill/',true)}</div></section><section class="section"><h2>Use your current CV.</h2><p>Keep a digital CV in Tabbio and connect it when you want your agent to use it. The directory provides leads; your CV provides the context.</p><a class="tabbio-link" href="${config.tabbioSignupUrl}?utm_source=tawdheef&utm_medium=directory&utm_campaign=uae"><img src="/brands/tabbio.svg" width="22" height="22" alt=""/>Build your free Tabbio CV</a></section>`;
}

const pages=[
 ['/skills/','Tawdheef Skills — Install, set up and apply with your agent','Install the Tawdheef job-search skill, connect the local app through CLI or MCP and follow practical guides for CVs, directories and applications.',()=>skillsOverview({guides,config,sourceDownload,releaseUrl,firstRunPrompt,code,prompt}),'skills',true],
 ['/guides/','Tawdheef guides — Setup, CVs, directories and applications','Practical guides for setting up Tawdheef, connecting your agent and CV, importing country packs and tracking applications.',guidePages.hub,'guides'],
 ['/about/','About Tawdheef — Built by Ahmed AlDhraif','Why Tawdheef exists, how the free open-source job application app works and how the separate Tabbio CV service fits.',()=>aboutPage(aboutMarkdown,config),''],
 ['/', 'Tawdheef — Auto Job Apply & Application Tracker', 'Free, open-source software to auto-apply for jobs with your agent and track applications and replies. Country directory packs, MCP and CLI. By Ahmed AlDhraif.', homePage, ''], ['/directories/','Free community directory packs for Tawdheef','Free country packs for Tawdheef. Use the GCC directories, fix an entry or contribute any country on GitHub.',directoryPage,'directories'],
 ['/policies/','Tawdheef project, privacy and policies','An independent open-source project by Ahmed AlDhraif. Code licence, data sources, privacy, responsible use and brand guidance.',policiesPage,''],
 ['/directories/uae/','UAE careers directory — 772 organisation & source records | Tawdheef','A free UAE research directory for your job search and AI agent: 772 organisation/source records, original evidence and published careers routes. Snapshot 10 November 2026.',uaePage,'directories']
];
for(const guide of guides)pages.push(['/guides/'+guide.slug+'/',guide.title+' | Tawdheef guides',guide.description,()=>guidePages.detail(guide),'guides',true]);
for(const pack of featuredPacks)pages.push(['/directories/'+pack.id+'/',countryTitle(pack)+' company and careers directory | Tawdheef',new Intl.NumberFormat('en').format(pack.recordCount)+' researched companies and recruitment sources in '+pack.name+'. Free Tawdheef directory pack for your AI job search. Snapshot '+displayDate(pack.snapshotDate)+'.',()=>countryPackPage(pack),'directories']);
function structuredData(path,title,description){
 const graph=[{'@type':'WebPage','@id':config.domain+path,name:title,description,url:config.domain+path,inLanguage:'en',isPartOf:{'@id':config.domain+'/#website'}},{'@type':'WebSite','@id':config.domain+'/#website',name:'Tawdheef',alternateName:'توظيف',url:config.domain}];
 if(path==='/')graph.push({'@type':'SoftwareApplication',name:'Tawdheef',alternateName:'توظيف',applicationCategory:'BusinessApplication',operatingSystem:'Node.js 24+',description,softwareRequirements:'Node.js 24 or newer; your own compatible agent client for agent workflows',license:config.domain+'/downloads/LICENSE.txt',author:{'@type':'Person',name:config.author,url:config.authorUrl,sameAs:[config.authorLinkedInUrl,config.githubProfile]},offers:{'@type':'Offer',price:'0',priceCurrency:'USD',description:'The app is free. AI clients and connected providers may have their own costs.'}});
 if(path==='/directories/uae/')graph.push({'@type':'Dataset',name:'UAE careers directory — 10 November 2026 research snapshot',description:`${count} organisation/source records with stable source IDs, original evidence and missing-data notes. Not a current vacancy feed.`,url:config.domain+path,temporalCoverage:'2026-11-10',spatialCoverage:{'@type':'Place',name:'United Arab Emirates'},distribution:{'@type':'DataDownload',encodingFormat:'application/zip',contentUrl:packDownload(packs.find(pack=>pack.id==='uae'))}});
 const currentPack=featuredPacks.find(pack=>path==='/directories/'+pack.id+'/');
 const datasets=path==='/directories/'?featuredPacks:currentPack?[currentPack]:[];
 for(const pack of datasets)graph.push({'@type':'Dataset','@id':config.domain+'/directories/'+pack.id+'/#dataset',name:pack.name+' company and careers directory',description:pack.recordCount+' dated organisation/source records with public recruitment routes and retained evidence. Not a live vacancy feed.',url:config.domain+'/directories/'+pack.id+'/',temporalCoverage:pack.snapshotDate,spatialCoverage:{'@type':'Country',name:pack.name},creator:{'@type':'Person',name:config.author,url:config.authorUrl},distribution:[{'@type':'DataDownload',encodingFormat:'application/zip',contentUrl:config.repositoryPublished?packDownload(pack):config.domain+packDownload(pack)},{'@type':'DataDownload',encodingFormat:'application/json',contentUrl:config.repositoryPublished?'https://raw.githubusercontent.com/ahmedaldhraif/tawdheef/main/directories/'+pack.id+'/index.json':config.domain+'/downloads/'+pack.id+'-index.json'}]});
 if(path!=='/'){const crumbs=[{'@type':'ListItem',position:1,name:'Tawdheef',item:config.domain+'/'}];for(const[parent,label]of[['/guides/','Guides'],['/directories/','Directories']])if(path.startsWith(parent)&&path!==parent)crumbs.push({'@type':'ListItem',position:2,name:label,item:config.domain+parent});crumbs.push({'@type':'ListItem',position:crumbs.length+1,name:title,item:config.domain+path});graph.push({'@type':'BreadcrumbList',itemListElement:crumbs});}
 if(path.startsWith('/guides/')&&path!=='/guides/')graph.push({'@type':'TechArticle',headline:title,description,url:config.domain+path,inLanguage:'en',isPartOf:{'@id':config.domain+'/skills/'},author:{'@type':'Person',name:config.author,url:config.authorUrl}});
 if(path==='/about/')graph.push({'@type':'AboutPage',name:title,url:config.domain+path,about:{'@type':'SoftwareApplication',name:'Tawdheef'},author:{'@type':'Person',name:config.author,url:config.authorUrl,sameAs:[config.authorLinkedInUrl,config.githubProfile]}});
 return '<script type="application/ld+json">'+JSON.stringify({'@context':'https://schema.org','@graph':graph}).replaceAll('<','\\u003c')+'</script>';
}
const staticOut=join(root,'site-dist'); await mkdir(staticOut,{recursive:true});
for(const preview of [true,false]){
 const base=preview?join(root,'public'):staticOut;
 for(const [path,title,description,body,active,wide] of pages){
  const folder=join(base,preview&&path==='/'?'welcome':path.slice(1)); await mkdir(folder,{recursive:true});
  const html=layout({title,description,path,body:body(),active,preview,home:preview?'/welcome/':'/',wide});
  await writeFile(join(folder,'index.html'),html.replace('</head>',structuredData(path,title,description)+'</head>'));
 }
}
const legacySetupPaths=['skills/tawdheef','get-started','guides/get-started'];
for(const base of [join(root,'public'),staticOut])for(const path of legacySetupPaths){
 const folder=join(base,path);await mkdir(folder,{recursive:true});
 await writeFile(join(folder,'index.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Set up Tawdheef with your agent</title><link rel="canonical" href="'+config.domain+'/guides/use-the-skill/"/><meta name="robots" content="noindex,follow"/><meta http-equiv="refresh" content="0;url=/guides/use-the-skill/"/></head><body><h1>Set up Tawdheef with your agent</h1><p><a href="/guides/use-the-skill/">Continue to the guide</a>.</p></body></html>');
}
await writeFile(join(staticOut,'_redirects'),legacySetupPaths.flatMap(path=>['/'+path+' /guides/use-the-skill/ 301','/'+path+'/ /guides/use-the-skill/ 301']).join('\n')+'\n');
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
