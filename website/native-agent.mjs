import { readFileSync } from 'node:fs';
import { escapeHtml as esc } from './markdown.mjs';

// The working app imports this same canonical Brand Studio artwork.
const artwork = readFileSync(new URL('../public/brand/states/state-coding-animated.svg', import.meta.url), 'utf8');

/** Decorative, still by default. Only an explicit working state enables motion. */
export function nativeAgentMarkup({ id, className = '', size = 48 }) {
  return artwork
    .replace('<svg ', `<svg id="${esc(id)}" data-agent-artwork="native-coding" aria-hidden="true" focusable="false" `)
    .replace('class="tawdheef-mascot"', `class="tawdheef-mascot native-agent ${esc(className)}"`)
    .replace('data-busy="true"', 'data-busy="false"')
    .replace('data-playing="true"', 'data-playing="false"')
    .replace('width="400" height="400"', `width="${size}" height="${size}"`)
    .replace(/ role="img" aria-label="[^"]*"/, '')
    .replace(/<title>.*?<\/title>/, '')
    .replace(/style="color:[^"]*"/, 'style="color:var(--native-agent-color,currentColor)"')
    .replaceAll('tawdheef-wink-coding', id);
}
