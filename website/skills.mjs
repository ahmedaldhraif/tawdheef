import { escapeHtml as esc } from './markdown.mjs';

const groups = [
  ['Start', 'Get started'],
  ['Use', 'Using Tawdheef'],
  ['Fix', 'When you need help'],
  ['Reference', 'For your agent'],
];

function guideIcon(slug) {
  if(slug==='use-the-skill')return '<img class="skills-guide-icon" src="/brand/mark.svg" width="48" height="48" alt=""/>';
  if(slug==='connect-your-agent')return '<span class="skills-guide-brand skills-guide-brand-agents" aria-hidden="true"><img src="/brands/chatgpt.svg" width="32" height="32" alt=""/><img src="/brands/claude.svg" width="32" height="32" alt=""/></span>';
  if(slug==='connect-your-cv')return '<span class="skills-guide-brand skills-guide-brand-tabbio" aria-hidden="true"><img src="/brands/tabbio-wordmark-violet-original.svg" width="144" height="35" alt=""/></span>';
  if(slug==='use-directory-packs')return `<span class="skills-guide-brand skills-guide-brand-flags" aria-hidden="true">${['AE','SA','QA','OM','KW','BH'].map(country=>`<img src="/flags/${country}.svg" width="26" height="18" alt=""/>`).join('')}</span>`;
  const label = {
    'apply-to-jobs': 'Run',
    'replies-and-reports': 'Check replies',
    'troubleshoot': 'npm run doctor',
    'for-agents': 'MCP / CLI',
  }[slug];
  return label ? `<span class="skills-guide-command" aria-hidden="true">${esc(label)}</span>` : '';
}

/** Content only. The shared layout supplies the header and docs navigation. */
export function skillsOverview({ guides, config, sourceDownload, releaseUrl, firstRunPrompt, code, prompt }) {
  const repository = config.intendedRepository;
  const setup = '/guides/use-the-skill/';
  const cv = `${setup}#cv`;
  const signup = new URL(config.tabbioSignupUrl);
  signup.searchParams.set('utm_source', 'tawdheef');
  signup.searchParams.set('utm_medium', 'skills');
  signup.searchParams.set('utm_campaign', 'free_cv');
  const install = 'npx skills@latest add ahmedaldhraif/tawdheef --skill tawdheef';
  const quickStart = 'npm run setup -- --browser\nnpm run agent -- codex --browser\nnpm start';
  const tiles = groups.map(([category, title]) => {
    const items = guides.filter(guide => guide.category === category);
    if (!items.length) return '';
    return `<section class="skills-guide-group" id="guides-${category.toLowerCase()}"><h2>${esc(title)}</h2><div class="skills-guide-grid">${items.map(guide => `<a class="skills-guide-card" href="/guides/${esc(guide.slug)}/"><span class="skills-guide-art">${guideIcon(guide.slug)}</span><h3>${esc(guide.title)}</h3><p>${esc(guide.description)}</p></a>`).join('')}</div></section>`;
  }).join('');

  return `<div class="skills-overview">
    <header class="skills-hero">
      <h1>Find matching jobs.<br/>Build career profiles.</h1>
      <p class="skills-subtitle">Use your real CV with Codex or Claude Code. Tawdheef connects your agent to your local tracker through its built-in CLI and MCP.</p>
      ${code('skills-install', install)}
      <p class="skills-install-note"><a href="#get-started">App setup below</a> already installs this skill. Use this command if you only need its workflow guidance.</p>
      <div class="skills-cv-shortcut"><img src="/brands/tabbio-wordmark-violet-original.svg" width="100" height="24" alt="Tabbio"/><a href="#create-or-connect-cv">Create or connect your CV</a></div>
      <div class="skills-meta"><a href="${esc(repository)}/blob/main/skills/tawdheef/SKILL.md">Read the skill source</a><span aria-hidden="true">·</span><span>MIT licensed</span><span aria-hidden="true">·</span><a href="${esc(releaseUrl)}">Release ${esc(config.releaseTag)}</a></div>
    </header>

    <section class="skills-start" id="get-started" aria-labelledby="skills-start-title">
      <h2 id="skills-start-title">Get started</h2>
      <p>Download the app, let your agent set it up, then connect your CV.</p>
      <div class="skills-start-actions"><a class="button" href="${esc(sourceDownload)}">Download the app</a><a href="${esc(repository)}">View or clone on GitHub</a></div>
      <ol class="skills-setup-steps">
        <li><span class="skills-step-number" aria-hidden="true">1</span><h3>Open the app folder</h3><p>Extract the source ZIP and open its folder in your installed, signed-in Codex or Claude Code. You need <a href="https://nodejs.org/en/download">Node.js 24 or newer</a>.</p></li>
        <li><span class="skills-step-number" aria-hidden="true">2</span><h3>Connect your agent</h3><p><a href="${setup}#agent">Copy the setup request</a> into your agent, or run these commands for Codex:</p>${code('skills-quick-cli', quickStart)}<p class="skills-client-alternative">Using Claude Code? Replace the second command with <code>npm run agent -- claude-code --browser</code>.</p><p>These prepare the app, connect its local MCP tools and install the workflow skill.</p></li>
        <li class="skills-cv-step" id="create-or-connect-cv"><span class="skills-step-number" aria-hidden="true">3</span><a class="skills-cv-brand" href="${esc(config.tabbioUrl)}" aria-label="Tabbio"><img class="skills-tabbio-wordmark" src="/brands/tabbio-wordmark-violet-original.svg" width="144" height="35" alt="Tabbio"/></a><h3>Create or connect your CV</h3><p>Create your free digital CV on Tabbio, or connect the one you already have.</p><div class="skills-cv-actions"><a class="button" href="${esc(signup.href)}">Create your free CV</a><a class="button secondary" href="${cv}">Connect your CV</a></div><p>In Tawdheef, open <strong>Connections → Your CV → Tabbio CV</strong>, complete sign-in and use <strong>Check connections</strong> with your chosen assistant.</p><p>Your agent uses your connected CV when you start Run.</p></li>
      </ol>
    </section>

    <div class="skills-guide-groups"><header class="skills-section-head"><h2>Guides <span>${guides.length}</span></h2><p>Set up, find matching jobs and build career profiles for future opportunities.</p></header>${tiles}</div>

  </div>`;
}
