import{readFile,lstat,realpath}from'node:fs/promises';
import{join,dirname}from'node:path';
import{escapeHtml as esc,renderMarkdown}from'./markdown.mjs';
import{ui}from'./i18n/ui.mjs';
const groupKeys=['Start','Use','Fix','Reference'];
export function repositoryLinkResolver(config,locale='en'){const p=locale==='ar'?'/ar':'';return href=>{
 const prefix=config.intendedRepository+'/blob/main/';if(!href.startsWith(prefix))return href;
 if(href===prefix+'docs/guides/README.md'||href===prefix+'docs/i18n/ar/guides/README.md')return p+'/guides/';
 const[source,hash]=href.slice(prefix.length).split('#');const guide=source.match(/^docs\/(?:i18n\/ar\/)?guides\/([a-z-]+)\.md$/);
 if(guide)return guide[1]==='README'?p+'/guides/':p+'/guides/'+(guide[1]==='get-started'?'use-the-skill':guide[1])+'/'+(hash?'#'+hash:'');
 if(source==='docs/FIRST-RUN.md'){const anchors={'give-your-agent-one-setup-request':'agent','agent-checklist':'agent','get-the-folder':'install','your-part':'cv'};return p+'/guides/use-the-skill/'+(anchors[hash]?'#'+anchors[hash]:'');}
 if(source==='directories/README.md')return'/directories/';if(source==='website/about.md')return'/about/';return href;
};}
export async function loadGuides(root,{locale='en'}={}){
 const canonicalRoot=await realpath(root),folder=locale==='ar'?'docs/i18n/ar/guides':'docs/guides';
 const metadata=JSON.parse(await readFile(join(root,locale==='ar'?'website/i18n/guides-ar.json':'website/guides.json'),'utf8'));
 if(!Array.isArray(metadata)||!metadata.length)throw new Error('Add guide metadata.');const slugs=new Set();
 for(const guide of metadata){if(!/^[a-z]+(?:-[a-z]+)*$/.test(guide.slug)||slugs.has(guide.slug))throw new Error('Use unique readable guide slugs.');slugs.add(guide.slug);if(guide.source!==folder+'/'+guide.slug+'.md'||!groupKeys.includes(guide.category))throw new Error('Guide sources must stay in the locale guide folder.');if(!guide.title||!guide.description)throw new Error('Each guide needs a title and description.');}
 for(const guide of metadata){for(const slug of[guide.next,...(guide.related||[])].filter(Boolean))if(!slugs.has(slug))throw new Error('Unknown guide link: '+slug);const file=join(root,guide.source),info=await lstat(file);if(!info.isFile()||info.isSymbolicLink()||dirname(await realpath(file))!==join(canonicalRoot,folder))throw new Error('Guide sources must be ordinary files in this checkout.');guide.markdown=await readFile(file,'utf8');if((guide.markdown.match(/^# /gm)||[]).length!==1)throw new Error('Each guide needs one title: '+guide.slug);}
 return metadata;
}
export function createGuidePages({guides,config,firstRunPrompt,prompt,code,sourceDownload,releaseUrl,locale='en'}){
 const t=ui[locale],p=locale==='ar'?'/ar':'',resolveLink=repositoryLinkResolver(config,locale),path=guide=>p+'/guides/'+guide.slug+'/';
 const items=(key,current)=>guides.filter(guide=>guide.category===key).map(guide=>`<a href="${path(guide)}" ${current===guide.slug?'aria-current="page"':''}>${guide.slug==='connect-your-cv'?'<img class="nav-cv-brand" src="/brands/tabbio.svg" width="18" height="18" alt=""/>':''}${esc(t.labels[guide.slug]||guide.title)}</a>`).join('');
 const nav=current=>`<nav aria-label="${esc(t.searchTitle)}"><div class="guide-nav-group"><span>${esc(t.groups.Start)}</span><a href="${p}/skills/" ${current==='overview'?'aria-current="page"':''}>${esc(t.overview)}</a><a href="${p}/skills/#get-started">${esc(t.quickStart)}</a>${items('Start',current)}</div>${groupKeys.filter(key=>key!=='Start').map(key=>`<div class="guide-nav-group"><span>${esc(t.groups[key])}</span>${items(key,current)}</div>`).join('')}<a class="guide-all" href="${p}/guides/">${esc(t.allGuides)}</a></nav>`;
 const render=guide=>renderMarkdown(guide.markdown,{prefix:guide.slug,resolveLink,copyLabel:t.copy,copyAria:t.copyCode,widget:token=>{
  if(token==='[setup-prompt]: #')return prompt(guide.slug+'-setup',firstRunPrompt,t.setupRequest);
  if(token==='[app-download]: #')return`<div class="actions"><a class="button" href="${sourceDownload}">${esc(t.downloadGithub)}</a><a href="${releaseUrl}">${esc(t.releaseNotes)}</a></div>`;
  if(token==='{{skill-install}}')return code(guide.slug+'-skill','npx skills@latest add ahmedaldhraif/tawdheef --skill tawdheef');return null;
 }});
 function hub(){return`<div class="page-head"><h1>${esc(t.guidesTitle)}</h1><p>${esc(t.guidesDescription)}</p></div><div class="guide-search"><label for="guide-search">${esc(t.findGuide)}</label><input id="guide-search" type="search" placeholder="${esc(t.guideSearchPlaceholder)}" autocomplete="off" aria-describedby="guide-search-status"/><p id="guide-search-status" role="status">${esc(t.guideOther.replace('{count}',guides.length))}</p></div><div class="guide-categories">${groupKeys.map(key=>`<section class="guide-category" data-guide-category><h2>${esc(t.groups[key])}</h2><div>${guides.filter(guide=>guide.category===key).map(guide=>`<a class="guide-link" href="${path(guide)}" data-guide-item data-guide-search="${esc([guide.slug,guide.title,guide.description,guide.markdown].join(' '))}"><h3>${esc(guide.title)}</h3><p>${esc(guide.description)}</p></a>`).join('')}</div></section>`).join('')}</div><p id="guide-empty" class="note" hidden>${esc(t.guideEmpty)}</p><section class="guide-support"><h2>${esc(t.sourceSupportTitle)}</h2><p><a href="${config.intendedRepository}/issues/new?template=bug.yml">${esc(t.reportProblem)}</a> · <a href="/directories/#contribute">${esc(t.helpDirectory)}</a></p></section>`;}
 function detail(guide){const content=render(guide),toc=content.headings.filter(item=>item.level===2);
  if(guide.slug==='use-the-skill')for(const[alias,target]of[['manual','if-you-prefer-the-terminal'],['first-run','workflow'],['tabbio-agent','cv'],['help','privacy']])content.html=content.html.replace(new RegExp(`(<h[23] id="${target}")`),`<span id="${alias}" class="anchor-alias" aria-hidden="true"></span>$1`);
  const contents=`<nav aria-label="${esc(t.onThisPage)}">${toc.map(item=>`<a href="#${item.id}">${esc(item.title)}</a>`).join('')}</nav>`,next=guides.find(item=>item.slug===guide.next),related=guides.filter(item=>(guide.related||[]).includes(item.slug));
  return`<div class="guide-layout"><aside class="guide-sidebar">${nav(guide.slug)}</aside><article class="guide-article"><details class="guide-mobile-nav"><summary>${esc(t.browseGuides)}</summary>${nav(guide.slug)}</details><nav class="breadcrumbs" aria-label="${esc(t.allGuides)}"><a href="${p}/skills/">${esc(t.navSkills)}</a><span aria-hidden="true">/</span><span>${esc(guide.title)}</span></nav><header class="guide-head"><div class="guide-title-row">${guide.slug==='use-the-skill'?'<img class="guide-skill-mark" src="/brand/mark.svg" alt="" width="44" height="44" aria-hidden="true"/>':''}<h1>${esc(guide.title)}</h1></div><p>${esc(guide.description)}</p></header>${toc.length?`<details class="guide-mobile-contents"><summary>${esc(t.onThisPage)}</summary>${contents}</details>`:''}<div class="docs-content guide-body">${content.html}</div>${next?`<a class="guide-next" href="${path(next)}"><span>${esc(t.nextGuide)}</span><strong>${esc(next.title)} <span aria-hidden="true">${locale==='ar'?'←':'→'}</span></strong></a>`:''}${related.length?`<div class="guide-related"><span>${esc(t.relatedGuides)}</span>${related.map(item=>`<a href="${path(item)}">${esc(item.title)}</a>`).join('')}</div>`:''}<div class="guide-source"><a href="${config.intendedRepository}/blob/main/${guide.source}">${esc(t.guideSource)}</a></div></article><aside class="guide-page-contents">${toc.length?'<span>'+esc(t.onThisPage)+'</span>'+contents:''}</aside></div>`;
 }
 return{hub,detail,nav};
}

export function aboutPage(markdown,config){
 const content=renderMarkdown(markdown,{prefix:'about',resolveLink:repositoryLinkResolver(config)});
 content.html=content.html.replace('<p><a href="/guides/use-the-skill/">Get started</a></p>','<p class="about-start"><a class="button" href="/guides/use-the-skill/">Get started</a></p>');
 const title=markdown.match(/^# (.+)$/m)?.[1]||'About Tawdheef';
 return `<div class="page-head about-head"><h1>${esc(title)}</h1></div><div class="about-author"><a href="${config.authorLinkedInUrl}" class="about-author-link"><img src="/site-assets/people/ahmed-aldhraif.png" alt="Ahmed AlDhraif" width="64" height="64"/><span><strong>Ahmed AlDhraif</strong><span>Creator of Tawdheef</span></span><img class="about-linkedin" src="/brands/linkedin-original.ico" alt="LinkedIn" width="20" height="20"/></a></div><article class="docs-content about-body">${content.html}</article>`;
}
