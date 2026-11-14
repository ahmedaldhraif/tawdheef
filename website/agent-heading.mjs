import { escapeHtml as esc } from './markdown.mjs';
import { readFileSync } from 'node:fs';
const nativeAgent=readFileSync(new URL('../public/brand/states/state-speaking-animated.svg',import.meta.url),'utf8');

/** Shared decorative studio agent and readable two-line marketing heading. */
export function agentHeading(line1,line2){
 const agent=nativeAgent.replace('<svg ','<svg id="hero-native-agent" ').replace(/style="color:[^"]*"/,'style="color:currentColor"');
 return `<div class="hero-title-group agent-heading"><span class="hero-native-agent" aria-hidden="true">${agent}</span><h1 aria-label="${esc(line1)} ${esc(line2)}"><span class="agent-phrase-slot" data-first="${esc(line1)}" data-second="${esc(line2)}" aria-hidden="true"><span class="agent-phrase-measure">${esc(line1)}</span><span class="agent-phrase-measure">${esc(line2)}</span><span class="agent-phrase-text">${esc(line1)}</span></span></h1></div><script type="module" src="/site-assets/hero-native-agent.js"></script>`;
}
