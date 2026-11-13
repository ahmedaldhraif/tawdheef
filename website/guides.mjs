import{readFile,lstat,realpath}from'node:fs/promises';
import{join,dirname}from'node:path';
import{escapeHtml as esc,renderMarkdown}from'./markdown.mjs';

const groups=[['Start','Get started'],['Use','Using Tawdheef'],['Fix','When you need help'],['Reference','For your agent']];

// GitHub-friendly Markdown stays the source; known page links stay on the website.
export function repositoryLinkResolver(config){return href=>{
 const prefix=config.intendedRepository+'/blob/main/';if(!href.startsWith(prefix))return href;
 const [source,hash]=href.slice(prefix.length).split('#');
 const guide=source.match(/^docs\/guides\/([a-z-]+)\.md$/);
 if(guide)return guide[1]==='README'?'/guides/':'/guides/'+guide[1]+'/'+(hash?'#'+hash:'');
 if(source==='docs/guides/README.md')return'/guides/';
 if(source==='docs/FIRST-RUN.md'){
  const anchors={'give-your-agent-one-setup-request':'agent','agent-checklist':'agent','get-the-folder':'install','your-part':'cv'};
  return'/get-started/'+(anchors[hash]?'#'+anchors[hash]:'');
 }
 if(source==='directories/README.md')return'/directories/';
 if(source==='website/about.md')return'/about/';
 return href;
};}

export async function loadGuides(root){
 const canonicalRoot=await realpath(root);
 const metadata=JSON.parse(await readFile(join(root,'website/guides.json'),'utf8'));
 if(!Array.isArray(metadata)||!metadata.length)throw new Error('Add guides to website/guides.json.');
 const slugs=new Set();
 for(const guide of metadata){
  if(!/^[a-z]+(?:-[a-z]+)*$/.test(guide.slug)||slugs.has(guide.slug))throw new Error('Use unique readable guide slugs.');
  slugs.add(guide.slug);
  if(guide.source!=='docs/guides/'+guide.slug+'.md'||!groups.some(([key])=>key===guide.category))throw new Error('Guide sources must stay in docs/guides with a known category.');
  if(!guide.title||!guide.description)throw new Error('Each guide needs a title and description.');
 }
 for(const guide of metadata){
  for(const slug of [guide.next,...(guide.related||[])].filter(Boolean))if(!slugs.has(slug))throw new Error('Unknown guide link: '+slug);
  const file=join(root,guide.source),info=await lstat(file);
  if(!info.isFile()||info.isSymbolicLink()||dirname(await realpath(file))!==join(canonicalRoot,'docs/guides'))throw new Error('Guide sources must be ordinary files in this checkout.');
  guide.markdown=await readFile(file,'utf8');
  if((guide.markdown.match(/^# /gm)||[]).length!==1)throw new Error('Each guide needs one Markdown title: '+guide.slug);
 }
 return metadata;
}

export function createGuidePages({guides,config,firstRunPrompt,prompt,code}){
 const resolveLink=repositoryLinkResolver(config);
 const path=guide=>'/guides/'+guide.slug+'/';
 const nav=current=>`<nav aria-label="Guides">${groups.map(([key,title])=>`<div class="guide-nav-group"><span>${title}</span>${guides.filter(guide=>guide.category===key).map(guide=>`<a href="${path(guide)}" ${current===guide.slug?'aria-current="page"':''}>${esc(guide.title)}</a>`).join('')}</div>`).join('')}</nav>`;
 const render=guide=>renderMarkdown(guide.markdown,{prefix:guide.slug,resolveLink,widget:(token,index)=>{
  if(token==='[setup-prompt]: #')return prompt(guide.slug+'-setup',firstRunPrompt,'Setup request');
  if(token==='{{skill-install}}')return code(guide.slug+'-skill','npx skills@latest add ahmedaldhraif/tawdheef --skill tawdheef');
  return null;
 }});
 function hub(){return `<div class="page-head"><h1>Guides.</h1><p>Set up Tawdheef, connect your CV and get on with your job search.</p></div><div class="guide-search"><label for="guide-search">Find a guide</label><input id="guide-search" type="search" placeholder="Try CV, packs or replies" autocomplete="off" aria-describedby="guide-search-status"/><p id="guide-search-status" role="status">${guides.length} guides</p></div><div class="guide-categories">${groups.map(([key,title])=>`<section class="guide-category" data-guide-category><h2>${title}</h2><div>${guides.filter(guide=>guide.category===key).map(guide=>`<a class="guide-link" href="${path(guide)}" data-guide-item data-guide-search="${esc([guide.slug,guide.title,guide.description,guide.markdown].join(' '))}"><h3>${esc(guide.title)}</h3><p>${esc(guide.description)}</p></a>`).join('')}</div></section>`).join('')}</div><p id="guide-empty" class="note" hidden>No guides match. Try another word or clear the search.</p><section class="guide-support"><h2>Something missing?</h2><p><a href="${config.intendedRepository}/issues/new?template=bug.yml">Report a problem on GitHub</a> or <a href="/directories/#contribute">help improve a directory</a>.</p></section>`;}
 function detail(guide){
  const content=render(guide),toc=content.headings.filter(item=>item.level===2);
  const contents=`<nav aria-label="On this page">${toc.map(item=>`<a href="#${item.id}">${esc(item.title)}</a>`).join('')}</nav>`;
  const next=guides.find(item=>item.slug===guide.next),related=guides.filter(item=>(guide.related||[]).includes(item.slug));
  return `<div class="guide-layout"><aside class="guide-sidebar">${nav(guide.slug)}</aside><article class="guide-article"><details class="guide-mobile-nav"><summary>Browse guides</summary>${nav(guide.slug)}</details><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/guides/">Guides</a><span aria-hidden="true">/</span><span>${esc(guide.title)}</span></nav><header class="guide-head"><div class="guide-title-row">${guide.slug==='use-the-skill'?'<img class="guide-skill-mark" src="/brand/mark.svg" alt="" width="44" height="44" aria-hidden="true"/>':''}<h1>${esc(guide.title)}</h1></div><p>${esc(guide.description)}</p></header>${toc.length?`<details class="guide-mobile-contents"><summary>On this page</summary>${contents}</details>`:''}<div class="docs-content guide-body">${content.html}</div>${next?`<a class="guide-next" href="${path(next)}"><span>Next guide</span><strong>${esc(next.title)} <span aria-hidden="true">→</span></strong></a>`:''}${related.length?`<div class="guide-related"><span>Related guides</span>${related.map(item=>`<a href="${path(item)}">${esc(item.title)}</a>`).join('')}</div>`:''}<div class="guide-source"><a href="${config.intendedRepository}/blob/main/${guide.source}">Read or improve this guide on GitHub</a></div></article><aside class="guide-page-contents">${toc.length?'<span>On this page</span>'+contents:''}</aside></div>`;
 }
 return{hub,detail,nav};
}

export function aboutPage(markdown,config){
 const content=renderMarkdown(markdown,{prefix:'about',resolveLink:repositoryLinkResolver(config)});
 content.html=content.html.replace('<p><a href="/get-started/">Get started</a></p>','<p class="about-start"><a class="button" href="/get-started/">Get started</a></p>');
 const title=markdown.match(/^# (.+)$/m)?.[1]||'About Tawdheef';
 return `<div class="page-head about-head"><h1>${esc(title)}</h1></div><div class="about-author"><a href="${config.authorLinkedInUrl}" class="about-author-link"><img src="/site-assets/people/ahmed-aldhraif.png" alt="Ahmed AlDhraif" width="64" height="64"/><span><strong>Ahmed AlDhraif</strong><span>Creator of Tawdheef</span></span><img class="about-linkedin" src="/brands/linkedin-original.ico" alt="LinkedIn" width="20" height="20"/></a></div><article class="docs-content about-body">${content.html}</article>`;
}
