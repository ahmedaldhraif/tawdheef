/** Timeline preview and exports. Samples the same SVG/CSS as the live ت. */
import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.mjs';

export const TIMELINE_VERSION = 1;
export const TIMELINE_LIMITS = Object.freeze({ steps: 24, durationMs: 60_000, stepMinMs: 100, stepMaxMs: 10_000, gifSize: 512, fps: 24 });
const terminalFaces = new Set(['idle', 'agent', 'ready', 'rest', 'resting', 'sleep', 'sleeping', 'approval', 'attention', 'success', 'complete', 'partial', 'error', 'cancelled', 'offline', 'disconnected', 'celebrating']);
const svgTextCache = new Map(), rendererCache = new Map(), paintVersions = new WeakMap();
let activityManifest;
const hex = value => /^#[\da-f]{6}$/i.test(value || '');
const abortError = () => new DOMException('Export cancelled.', 'AbortError');
const throwIfAborted = signal => { if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : abortError(); };
const yieldBrowser = () => new Promise(resolve => setTimeout(resolve, 0));

export function validateTimeline(input) {
  if (typeof input === 'string') {
    if (input.length > 50_000) throw new Error('The timeline JSON is too large.');
    try { input = JSON.parse(input); } catch { throw new Error('Choose valid timeline JSON.'); }
  }
  if (input && !Array.isArray(input) && input.version !== TIMELINE_VERSION) throw new Error('This timeline version is not supported.');
  const steps = Array.isArray(input) ? input : input?.steps;
  if (!Array.isArray(steps) || !steps.length || steps.length > TIMELINE_LIMITS.steps) throw new Error('Use between 1 and 24 timeline steps.');
  const ids = new Set();
  let total = 0;
  const normalized = steps.map((step, index) => {
    if (!step || typeof step !== 'object' || !/^[a-z][a-z0-9-]{0,39}$/.test(step.state || '')) throw new Error(`Choose a valid state for step ${index + 1}.`);
    if (!Number.isFinite(step.durationMs) || step.durationMs < 100 || step.durationMs > 10_000) throw new Error('Each step must last between 0.1 and 10 seconds.');
    const durationMs = Math.round(step.durationMs);
    const id = typeof step.id === 'string' && /^[a-zA-Z0-9_-]{1,60}$/.test(step.id) ? step.id : `step-${index + 1}`;
    if (ids.has(id)) throw new Error('Timeline step IDs must be unique.');
    ids.add(id); total += durationMs;
    const label = step.label == null ? '' : String(step.label).slice(0, 160);
    return { id, state: step.state, durationMs, ...(label ? { label } : {}) };
  });
  if (total > TIMELINE_LIMITS.durationMs) throw new Error('Keep an exported journey under 60 seconds.');
  return normalized;
}

export function serializeTimeline(steps) {
  return JSON.stringify({ version: TIMELINE_VERSION, steps: validateTimeline(steps) }, null, 2) + '\n';
}

export function timelinePosition(input, timeMs = 0) {
  const steps = validateTimeline(input), totalMs = steps.reduce((sum, step) => sum + step.durationMs, 0);
  const time = Math.max(0, Math.min(totalMs, Number.isFinite(Number(timeMs)) ? Number(timeMs) : 0));
  let start = 0, index = steps.length - 1;
  for (let cursor = 0; cursor < steps.length; cursor++) {
    if (time < start + steps[cursor].durationMs || cursor === steps.length - 1) { index = cursor; break; }
    start += steps[cursor].durationMs;
  }
  const step = steps[index];
  return { state: step.state, label: step.label || '', index, localMs: Math.min(step.durationMs, time - start), durationMs: step.durationMs, totalMs, progress: totalMs ? time / totalMs : 0 };
}

async function defaultGetSVG(state) {
  if (!svgTextCache.has(state)) {
    const promise = (async () => {
      activityManifest ||= fetch(new URL('../activity.json', import.meta.url)).then(response => response.ok ? response.json() : null).catch(() => null);
      const manifest = await activityManifest;
      const phase = manifest?.phases?.find(item => item.id === state);
      const path = phase?.animated || `../faces/face-${encodeURIComponent(state)}-animated.svg`;
      const url = new URL(path.startsWith('/brand/') ? path : phase?.animated ? `../${path.replace(/^\.\//, '')}` : path, import.meta.url);
      if (url.origin !== location.origin) throw new Error('Use local mascot artwork.');
      return fetch(url);
    })().then(async response => {
      if (!response.ok) throw new Error(`Could not load the ${state} animation.`);
      return response.text();
    }).catch(error => { svgTextCache.delete(state); throw error; });
    svgTextCache.set(state, promise);
  }
  return svgTextCache.get(state);
}

function checkedOptions(options = {}) {
  const steps = validateTimeline(options.steps);
  const size = Math.round(Number(options.size) || 320);
  if (size < 64 || size > 1024) throw new Error('Choose an export size between 64 and 1024 pixels.');
  const background = options.background || 'transparent';
  if (!['transparent', 'light', 'dark'].includes(background)) throw new Error('Choose Light, Dark or Transparent.');
  const color = options.color || (background === 'dark' ? '#FFFFFF' : '#5A2AFF');
  if (!hex(color)) throw new Error('Choose a valid six-digit brand colour.');
  if (options.getSVG != null && typeof options.getSVG !== 'function') throw new Error('The SVG renderer is not available.');
  const reducedMotion = options.reducedMotion ?? (typeof matchMedia === 'function' && (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(forced-colors: active)').matches));
  return { ...options, steps, size, color, background, reducedMotion, showLabel: !!options.showLabel, getSVG: options.getSVG || defaultGetSVG };
}

function safeSVG(text) {
  const parsed = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = parsed.documentElement;
  if (svg.localName !== 'svg' || parsed.querySelector('parsererror')) throw new Error('The mascot SVG could not be read.');
  if (svg.querySelector('script,foreignObject,iframe,object,embed')) throw new Error('Use self-contained mascot SVG artwork.');
  for (const element of [svg, ...svg.querySelectorAll('*')]) for (const attribute of [...element.attributes]) {
    if (/^on/i.test(attribute.name)) throw new Error('Use self-contained mascot SVG artwork.');
    if (/^(?:href|xlink:href)$/i.test(attribute.name) && !/^(?:#|data:image\/(?:png|jpeg|gif|webp);)/i.test(attribute.value)) throw new Error('External SVG resources cannot be exported.');
  }
  if (/@import/i.test(text)) throw new Error('External SVG resources cannot be exported.');
  for (const reference of text.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) if (!/^(?:#|data:image\/(?:png|jpeg|gif|webp);)/i.test(reference[2].trim())) throw new Error('External SVG resources cannot be exported.');
  return document.importNode(svg, true);
}

let namespace = 0;
function namespaceIDs(svg) {
  const prefix = `timeline-${++namespace}-`, replacements = [];
  for (const node of [svg, ...svg.querySelectorAll('[id]')]) if (node.id) { const prior = node.id; node.id = prefix + prior; replacements.push([prior, node.id]); }
  for (const node of [svg, ...svg.querySelectorAll('*')]) {
    for (const attribute of [...node.attributes]) {
      let value = attribute.value;
      for (const [prior, next] of replacements) value = value.replaceAll(`#${prior}`, `#${next}`);
      if (value !== attribute.value) node.setAttribute(attribute.name, value);
    }
    if (node.localName === 'style') for (const [prior, next] of replacements) node.textContent = node.textContent.replaceAll(`#${prior}`, `#${next}`);
  }
}

async function rendererFor(state, options) {
  let bySource = rendererCache.get(options.getSVG);
  if (!bySource) { bySource = new Map(); rendererCache.set(options.getSVG, bySource); }
  const speechLevel = typeof options.audioLevel === 'number' && Number.isFinite(options.audioLevel) ? Math.max(0, Math.min(1, options.audioLevel)) : null;
  const key = `${state}|${options.color}|${!!options.reducedMotion}|${options.shimmer !== false}|${speechLevel}`;
  if (bySource.has(key)) return bySource.get(key);
  const promise = (async () => {
    let text = await options.getSVG(state);
    if (typeof text !== 'string' || text.length > 1_000_000) throw new Error('The mascot artwork is unavailable or too large.');
    if (!options.reducedMotion) text = text.replace(/\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/gi, '(width:0px)').replace(/\(\s*forced-colors\s*:\s*active\s*\)/gi, '(width:0px)');
    const svg = safeSVG(text); namespaceIDs(svg);
    svg.setAttribute('width', '100'); svg.setAttribute('height', '100');
    svg.style.setProperty('width', '100px', 'important'); svg.style.setProperty('height', '100px', 'important');
    svg.style.setProperty('color', options.color, 'important');
    if (speechLevel !== null) svg.style.setProperty('--speech-intensity', String(.15 + .85 * speechLevel));
    // Phase artwork can use a canonical face alias, such as success -> happy.
    // Keep that resolved face while the timeline reports the real phase.
    svg.dataset.state ||= state; svg.dataset.phase ||= state; svg.dataset.playing = String(!options.reducedMotion);
    if (options.shimmer === false) {
      svg.dataset.shimmer = 'false';
      svg.querySelectorAll('.mascot-sheen').forEach(element => element.style.setProperty('display', 'none', 'important'));
    }
    const mount = document.createElement('div');
    mount.setAttribute('aria-hidden', 'true');
    Object.assign(mount.style, { position: 'fixed', left: '-10000px', top: '0', width: '100px', height: '100px', opacity: '0', pointerEvents: 'none', contain: 'layout paint' });
    mount.attachShadow({ mode: 'closed' }).append(svg); document.body.append(mount);
    getComputedStyle(svg).width;
    return { svg, mount };
  })();
  bySource.set(key, promise);
  try { return await promise; } catch (error) { bySource.delete(key); throw error; }
}

const computedProperties = ['color', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'transform', 'transform-origin', 'transform-box', 'filter', 'clip-path', 'mask', 'visibility', 'display', 'stop-color', 'stop-opacity'];
function fragmentURLs(value) { return value.replace(/url\(["']?[^\s)"']*#([^\s)"']+)["']?\)/g, 'url(#$1)'); }
function flattenSVG(svg, timeMs) {
  for (const animation of svg.getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = Math.max(0, timeMs); }
  const clone = svg.cloneNode(true), originals = [svg, ...svg.querySelectorAll('*')], copies = [clone, ...clone.querySelectorAll('*')];
  for (let index = 0; index < originals.length; index++) {
    const source = originals[index], target = copies[index];
    if (source.localName === 'style' || source.localName === 'title') continue;
    const computed = getComputedStyle(source);
    // CSS path morphs must become concrete path data in each exported frame.
    // Keeping only the original d attribute would silently export a still eye.
    if (source.localName === 'path') {
      const path = computed.getPropertyValue('d').match(/^path\(\s*(["'])(.*?)\1\s*\)$/s);
      if (path) target.setAttribute('d', path[2]);
      target.style.removeProperty('d');
    }
    for (const property of computedProperties) {
      const value = computed.getPropertyValue(property);
      if (value) target.style.setProperty(property, fragmentURLs(value));
    }
    target.style.setProperty('animation', 'none', 'important'); target.style.setProperty('transition', 'none', 'important');
  }
  clone.querySelectorAll('style,animate,animateTransform,set').forEach(node => node.remove());
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return new XMLSerializer().serializeToString(clone);
}

async function rasterImage(text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' })), image = new Image();
  try { image.src = url; await image.decode(); return image; } finally { URL.revokeObjectURL(url); }
}

function textLabel(position, options) {
  if (position.label) return position.label;
  if (typeof options.labelByState === 'function') return String(options.labelByState(position.state)).slice(0, 160);
  return options.labelByState?.[position.state] || position.state.replaceAll('-', ' ').replace(/^./, character => character.toUpperCase());
}
function drawLabel(context, text, position, options, size) {
  const dark = options.background === 'dark', muted = dark ? '#B7B7C2' : '#62626B', ink = dark ? '#FFFFFF' : '#252525';
  const fontSize = Math.max(11, Math.round(size * .045));
  context.font = `500 ${fontSize}px system-ui, sans-serif`; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.direction = /[\u0600-\u06FF]/.test(text) ? 'rtl' : 'ltr';
  const maxWidth = size * .88, words = String(text).split(/\s+/), lines = [''];
  for (const word of words) {
    const index = lines.length - 1, next = `${lines[index]} ${word}`.trim();
    if (context.measureText(next).width > maxWidth && lines[index] && lines.length < 2) lines.push(word); else lines[index] = next;
  }
  while (context.measureText(lines[lines.length - 1]).width > maxWidth && lines[lines.length - 1].length > 1) lines[lines.length - 1] = lines[lines.length - 1].slice(0, -2) + '…';
  const active = !terminalFaces.has(position.state) && !options.reducedMotion && options.shimmer !== false;
  context.fillStyle = muted;
  if (active) {
    const sweep = (position.localMs % 1400) / 1400, x = -size + sweep * size * 2;
    const gradient = context.createLinearGradient(x, 0, x + size, 0);
    gradient.addColorStop(0, muted); gradient.addColorStop(.35, muted); gradient.addColorStop(.5, ink); gradient.addColorStop(.65, muted); gradient.addColorStop(1, muted);
    context.fillStyle = gradient;
  }
  lines.forEach((line, index) => context.fillText(line, size / 2, size * .84 + index * fontSize * 1.4, maxWidth));
}

/** Draws a deterministic frame of the real CSS animation. Canvas remains transparent by default. */
export async function paintTimeline(canvas, input = {}) {
  const options = checkedOptions(input), position = timelinePosition(options.steps, options.timeMs || 0);
  const version = (paintVersions.get(canvas) || 0) + 1; paintVersions.set(canvas, version);
  const renderer = await rendererFor(position.state, options);
  const image = await rasterImage(flattenSVG(renderer.svg, options.reducedMotion ? 0 : position.localMs));
  if (paintVersions.get(canvas) !== version) return { ...position, superseded: true };
  if (canvas.width !== options.size || canvas.height !== options.size) { canvas.width = options.size; canvas.height = options.size; }
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas export is unavailable in this browser.');
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (options.background !== 'transparent') { context.fillStyle = options.background === 'dark' ? '#18181B' : '#F5F5F7'; context.fillRect(0, 0, canvas.width, canvas.height); }
  const artSize = options.showLabel ? options.size * .82 : options.size;
  context.drawImage(image, (options.size - artSize) / 2, options.showLabel ? -options.size * .025 : 0, artSize, artSize);
  if (options.showLabel) drawLabel(context, textLabel(position, options), position, options, options.size);
  return position;
}

export async function exportTimelineGif(input = {}, { signal, onProgress = () => {} } = {}) {
  const options = checkedOptions({ ...input, size: input.size || 320, reducedMotion: false });
  if (options.size > TIMELINE_LIMITS.gifSize) throw new Error('GIF export supports up to 512 pixels.');
  const fps = Math.round(Number(input.fps) || 12);
  if (fps < 1 || fps > TIMELINE_LIMITS.fps) throw new Error('GIF export supports 1 to 24 frames per second.');
  throwIfAborted(signal);
  const canvas = document.createElement('canvas'), encoder = GIFEncoder(), total = options.steps.reduce((sum, step) => sum + step.durationMs, 0);
  const count = Math.max(1, Math.ceil(total / 1000 * fps)), transparent = options.background === 'transparent';
  onProgress(0);
  for (let frame = 0; frame < count; frame++) {
    throwIfAborted(signal);
    await paintTimeline(canvas, { ...options, timeMs: Math.min(total - 1, frame * 1000 / fps) });
    throwIfAborted(signal);
    const context = canvas.getContext('2d', { willReadFrequently: true }), rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const format = transparent ? 'rgba4444' : 'rgb565';
    const palette = quantize(rgba, 256, transparent ? { format, oneBitAlpha: true } : { format });
    const pixels = applyPalette(rgba, palette, format), transparentIndex = transparent ? palette.findIndex(color => color[3] === 0) : -1;
    // GIF delay is centiseconds. Round cumulative boundaries so 12 fps and a
    // partial last frame keep the journey's duration instead of drifting.
    const startMs = frame * 1000 / fps, endMs = Math.min(total, (frame + 1) * 1000 / fps);
    const delay = Math.max(10, Math.round(endMs / 10) * 10 - Math.round(startMs / 10) * 10);
    encoder.writeFrame(pixels, canvas.width, canvas.height, { palette, delay, repeat: 0, transparent: transparentIndex >= 0, transparentIndex: Math.max(0, transparentIndex), dispose: 2 });
    onProgress((frame + 1) / count);
    if (frame % 3 === 0) await yieldBrowser();
  }
  throwIfAborted(signal); encoder.finish();
  return new Blob([Uint8Array.from(encoder.bytes()).buffer], { type: 'image/gif' });
}

export function availableVideoFormats() {
  if (typeof MediaRecorder === 'undefined') return [];
  return [{ name: 'WebM', extension: 'webm', types: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'] }, { name: 'MP4', extension: 'mp4', types: ['video/mp4;codecs=avc1.42E01E', 'video/mp4'] }].flatMap(format => {
    const mime = format.types.find(type => MediaRecorder.isTypeSupported(type));
    return mime ? [{ name: format.name, extension: format.extension, mime }] : [];
  });
}

export async function recordTimelineVideo(input = {}, { signal, onProgress = () => {}, mime } = {}) {
  const options = checkedOptions({ ...input, size: input.size || 512, reducedMotion: false });
  if (options.background === 'transparent') throw new Error('Choose GIF for a transparent animation.');
  const format = availableVideoFormats().find(item => !mime || item.mime === mime);
  if (!format) throw new Error('Video export is unavailable in this browser. Choose GIF.');
  throwIfAborted(signal);
  const canvas = document.createElement('canvas'); await paintTimeline(canvas, { ...options, timeMs: 0 });
  const stream = canvas.captureStream(30), chunks = [], total = options.steps.reduce((sum, step) => sum + step.durationMs, 0);
  let recorder;
  try { recorder = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: 3_000_000 }); } catch { stream.getTracks().forEach(track => track.stop()); throw new Error('The browser could not start video export. Choose GIF.'); }
  return new Promise((resolve, reject) => {
    let settled = false, timer, started = performance.now();
    const cleanup = () => { clearTimeout(timer); stream.getTracks().forEach(track => track.stop()); signal?.removeEventListener('abort', cancel); document.removeEventListener('visibilitychange', visibility); };
    const fail = error => { if (settled) return; settled = true; cleanup(); if (recorder.state !== 'inactive') recorder.stop(); reject(error); };
    const cancel = () => fail(abortError());
    const visibility = () => { if (document.hidden) fail(new Error('Recording stopped because the studio was hidden. Keep this tab visible.')); };
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => fail(new Error('The browser could not encode this video. Choose GIF.'));
    recorder.onstop = () => { if (settled) return; settled = true; cleanup(); onProgress(1); resolve(new Blob(chunks, { type: format.mime })); };
    signal?.addEventListener('abort', cancel, { once: true }); document.addEventListener('visibilitychange', visibility);
    const tick = async () => {
      try {
        throwIfAborted(signal); if (settled) return;
        const elapsed = performance.now() - started;
        await paintTimeline(canvas, { ...options, timeMs: Math.min(total - 1, elapsed) });
        if (settled) return;
        onProgress(Math.min(.999, elapsed / total));
        if (elapsed >= total) recorder.stop(); else timer = setTimeout(tick, 1000 / 30);
      } catch (error) { fail(error); }
    };
    try { recorder.start(); started = performance.now(); onProgress(0); void tick(); } catch (error) { fail(error); }
  });
}

/** Dispose offscreen SVGs when a studio is unmounted. */
export function clearTimelineCache() {
  for (const cache of rendererCache.values()) for (const promise of cache.values()) Promise.resolve(promise).then(renderer => renderer.mount.remove()).catch(() => {});
  rendererCache.clear(); svgTextCache.clear(); activityManifest = undefined;
}
