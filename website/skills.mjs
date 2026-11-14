import { escapeHtml as esc } from './markdown.mjs';
import skillsEn from './i18n/skills-en.mjs';
import skillsAr from './i18n/skills-ar.mjs';
import homeEn from './i18n/en.mjs';
import homeAr from './i18n/ar.mjs';

const groups = [
  ['Start', 'Get started'],
  ['Use', 'Using Tawdheef'],
  ['Fix', 'When you need help'],
  ['Reference', 'For your agent'],
];

function guideIcon(slug,t) {
  if(slug==='use-the-skill')return '<img class="skills-guide-icon" src="/brand/mark.svg" width="48" height="48" alt=""/>';
  if(slug==='connect-your-agent')return '<span class="skills-guide-brand skills-guide-brand-agents" aria-hidden="true"><img src="/brands/chatgpt.svg" width="32" height="32" alt=""/><img src="/brands/claude.svg" width="32" height="32" alt=""/></span>';
  if(slug==='connect-your-cv')return '<span class="skills-guide-brand skills-guide-brand-tabbio" aria-hidden="true"><img src="/brands/tabbio-wordmark-violet-original.svg" width="144" height="35" alt=""/></span>';
  if(slug==='use-directory-packs')return `<span class="skills-guide-brand skills-guide-brand-flags" aria-hidden="true">${['AE','SA','QA','OM','KW','BH'].map(country=>`<img src="/flags/${country}.svg" width="26" height="18" alt=""/>`).join('')}</span>`;
  const label = {
    'apply-to-jobs': t.cardLabels.run,
    'replies-and-reports': t.cardLabels.replies,
    'troubleshoot': t.cardLabels.doctor,
    'for-agents': t.cardLabels.agents,
  }[slug];
  return label ? `<span class="skills-guide-command" aria-hidden="true">${esc(label)}</span>` : '';
}

/** Content only. The shared layout supplies the header and docs navigation. */
export function skillsOverview({guides,config,sourceDownload,releaseUrl,firstRunPrompt,code,prompt,locale='en'}){
 const t=locale==='ar'?skillsAr:skillsEn,p=locale==='ar'?'/ar':'',repository=config.intendedRepository,setup=p+'/guides/use-the-skill/',cv=setup+'#cv';
 const commandField=`<div class="skills-command-field" aria-hidden="true" inert>${t.commandRows.map(row=>`<div class="skills-command-row"><span class="skills-command-request">${esc(row.request)}</span><span class="skills-command-arrow">${locale==='ar'?'←':'→'}</span><code class="skills-command-tool" dir="ltr" lang="en">${esc(row.tool)}</code></div>`).join('')}</div>`;
 const pasteCaption=(locale==='ar'?homeAr:homeEn).workflow.pasteCaption;
 const signup=new URL(config.tabbioSignupUrl);signup.searchParams.set('utm_source','tawdheef');signup.searchParams.set('utm_medium','skills');signup.searchParams.set('utm_campaign','free_cv');
 const install='npx skills@latest add ahmedaldhraif/tawdheef --skill tawdheef',quickStart='npm start\nnpm run agent -- codex';
 const linkPhrase=(text,phrase,href)=>esc(text).replace(esc(phrase),`<a href="${href}">${esc(phrase)}</a>`);
 const tiles=groups.map(([category])=>{const items=guides.filter(guide=>guide.category===category);return items.length?`<section class="skills-guide-group" id="guides-${category.toLowerCase()}"><h2>${esc(t.guideGroups[category])}</h2><div class="skills-guide-grid">${items.map(guide=>`<a class="skills-guide-card" href="${p}/guides/${esc(guide.slug)}/"><span class="skills-guide-art">${guideIcon(guide.slug,t)}</span><h3>${esc(guide.title)}</h3><p>${esc(guide.description)}</p></a>`).join('')}</div></section>`:'';}).join('');
 return`<div class="skills-overview"><header class="skills-hero" id="install-skill">${commandField}<h1>${esc(t.hero.line1)}<br/>${esc(t.hero.line2)}</h1><p class="skills-subtitle">${esc(t.hero.subtitle)}</p>${code('skills-install',install)}<p class="skills-install-note">${linkPhrase(t.hero.installNote,t.hero.setupLink,'#get-started')}</p><figure class="agent-install-demo"><div class="agent-demo-frame" dir="ltr"><img id="skills-agent-paste-preview" class="agent-demo-image" src="/site-assets/agent-setup/claude-paste-poster.png" data-demo-gif="/site-assets/agent-setup/claude-paste.gif" data-demo-poster="/site-assets/agent-setup/claude-paste-poster.png" width="584" height="210" loading="lazy" alt="${esc(pasteCaption)}"/></div><figcaption>${esc(pasteCaption)}</figcaption></figure><div class="skills-meta"><a href="${repository}/blob/main/skills/tawdheef/SKILL.md">${esc(t.hero.source)}</a><span aria-hidden="true">·</span><span>${esc(t.hero.license)}</span><span aria-hidden="true">·</span><a href="${releaseUrl}">${esc(t.hero.release)} <bdi dir="ltr">${esc(config.releaseTag)}</bdi></a></div></header>
 <section class="skills-start" id="get-started" aria-labelledby="skills-start-title"><h2 id="skills-start-title">${esc(t.start.title)}</h2><p>${esc(t.start.body)}</p><div class="skills-start-actions"><a class="button" href="${sourceDownload}">${esc(t.start.download)}</a><a href="${repository}">${esc(t.start.repository)}</a></div><ol class="skills-setup-steps"><li><span class="skills-step-number" aria-hidden="true">1</span><h3>${esc(t.start.steps[0].title)}</h3><p>${esc(t.start.steps[0].body)} <a href="https://nodejs.org/en/download">${esc(t.start.nodeRequirement)}</a></p></li><li><span class="skills-step-number" aria-hidden="true">2</span><h3>${esc(t.start.steps[1].title)}</h3><p>${linkPhrase(t.start.steps[1].body,t.start.setupPrompt,setup+'#agent')}</p>${code('skills-quick-cli',quickStart)}<p class="skills-client-alternative">${esc(t.start.claudeAlternative)} <code dir="ltr">npm run agent -- claude-code</code></p><p>${esc(t.start.cliNote)}</p></li><li class="skills-cv-step" id="create-or-connect-cv"><span class="skills-step-number" aria-hidden="true">3</span><a class="skills-cv-brand" href="${config.tabbioUrl}" aria-label="Tabbio"><img class="skills-tabbio-wordmark" src="/brands/tabbio-wordmark-violet-original.svg" width="144" height="35" alt="Tabbio"/></a><h3>${esc(t.start.steps[2].title)}</h3><p>${esc(t.start.steps[2].body)}</p><div class="skills-cv-actions"><a class="button" href="${esc(signup.href)}">${esc(t.start.cvCreate)}</a><a class="button secondary" href="${cv}">${esc(t.start.cvConnect)}</a></div><p>${esc(t.start.cvPath)} ${esc(t.start.cvCheck)}</p><p>${esc(t.start.cvReadNote)}</p></li></ol></section>
 <div class="skills-guide-groups"><header class="skills-section-head"><h2>${esc(t.guides.title)} <span>${guides.length}</span></h2><p>${esc(t.guides.body)}</p></header>${tiles}</div></div>`;
}
