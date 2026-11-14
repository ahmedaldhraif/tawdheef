/* Sun/moon arc adapted from dhxwhy's user-supplied 21st component.
 * https://21st.dev/@dhxwhy/components/sun-moon-theme-toggle
 * The supplied source does not state a licence. See website/theme-toggle-source.json.
 * This decorates existing native controls; docs-theme.js remains the state owner. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const forced = matchMedia('(forced-colors: active)');
  const duration = 260;
  const easeOut = 'cubic-bezier(.16,1,.3,1)';
  const bodies = { moon: { side: -1, spin: 25 }, sun: { side: 1, spin: 120 } };
  const stars = [[24,22,3.2],[66,16,2.4],[80,42,3.6],[38,58,2.2],[58,74,2.8],[14,72,2.4]];
  const sun = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>';
  const moon = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.5A9 9 0 0 1 9.5 3.5a9 9 0 1 0 11 11Z"/></svg>';
  const controls = [];
  const currentTheme = () => document.documentElement.dataset.docsTheme === 'dark' ? 'dark' : 'light';
  const point = (side, angle) => ({ x: side * 115 * Math.sin(angle), y: 115 * (1 - Math.cos(angle)) });
  function frames(body, rising) {
    return Array.from({ length: 31 }, (_, i) => {
      const t = i / 30;
      // Both bodies follow the supplied shared-circle path, with a short ease-out.
      const travel = rising ? (1 - t) ** 3 : 1 - (1 - t) ** 3;
      const p = point(body.side, travel * Math.PI / 2);
      return {
        offset: t,
        transform: `translate(${p.x}%, ${p.y}%) rotate(${body.side * body.spin * travel}deg) scale(${rising ? 1 - .28 * travel : 1})`,
        opacity: rising ? Math.min(1, t / .3) : t < .55 ? 1 : (1 - t) / .45,
      };
    });
  }
  function cancel(state) {
    const flight = state.flight;
    state.flight = null;
    flight?.animations.forEach(animation => animation.cancel());
  }
  function swap(state, next) {
    const before = state.theme;
    state.theme = next;
    state.button.dataset.state = next;
    if (before === next) return;
    if (reduced.matches || forced.matches || document.hidden || !state.button.getClientRects().length || typeof state.sun.animate !== 'function') {
      cancel(state);
      return;
    }
    if (state.flight) {
      // Reverse the same flight from its current position; rapid clicks never queue.
      for (const animation of state.flight.animations) {
        if ((next === state.flight.to) !== (animation.playbackRate > 0)) animation.reverse();
      }
      return;
    }
    const toLight = next === 'light';
    const setting = toLight ? state.moon : state.sun;
    const rising = toLight ? state.sun : state.moon;
    const animations = [
      setting.animate(frames(bodies[toLight ? 'moon' : 'sun'], false), { duration: duration * .65, fill: 'both' }),
      rising.animate(frames(bodies[toLight ? 'sun' : 'moon'], true), { duration: duration * .64, delay: duration * .36, fill: 'both' }),
      state.night.animate([{ opacity: toLight ? 1 : 0 }, { opacity: toLight ? 0 : 1 }], { duration, easing: easeOut, fill: 'both' }),
      state.day.animate([{ opacity: toLight ? 0 : 1 }, { opacity: toLight ? 1 : 0 }], { duration, easing: easeOut, fill: 'both' }),
    ];
    const flight = { from: before, to: next, animations };
    state.flight = flight;
    Promise.all(animations.map(animation => animation.finished)).then(() => {
      if (state.flight === flight) cancel(state);
    }, () => {
      // A cancelled/reversed visual must never affect the committed document theme.
      if (state.flight === flight) cancel(state);
    });
  }
  for (const button of document.querySelectorAll('.docs-theme-toggle')) {
    if (button.dataset.sunMoonReady) continue;
    const label = button.classList.contains('docs-menu-theme') ? button.querySelector('span')?.textContent : '';
    const disc = document.createElement('span');
    disc.className = 'sun-moon-disc';
    disc.setAttribute('aria-hidden', 'true');
    disc.innerHTML = '<span class="sun-moon-sky sun-moon-night">' + stars.map(([x,y,size]) => `<span class="sun-moon-star" style="left:${x}%;top:${y}%;width:${size}px;height:${size}px"></span>`).join('') + '</span><span class="sun-moon-sky sun-moon-day"></span><span class="sun-moon-body sun-moon-moon">' + moon + '</span><span class="sun-moon-body sun-moon-sun">' + sun + '</span>';
    button.replaceChildren(disc);
    if (label) {
      const text = document.createElement('span');
      text.className = 'sun-moon-label';
      text.textContent = label;
      button.append(text);
    }
    button.dataset.sunMoonReady = 'true';
    button.dataset.state = currentTheme();
    controls.push({ button, theme: currentTheme(), flight: null, moon: disc.querySelector('.sun-moon-moon'), sun: disc.querySelector('.sun-moon-sun'), night: disc.querySelector('.sun-moon-night'), day: disc.querySelector('.sun-moon-day') });
  }
  addEventListener('tawdheef:themechange', () => controls.forEach(state => swap(state, currentTheme())));
  const cancelAll = () => controls.forEach(cancel);
  for (const media of [reduced, forced]) {
    const changed = () => { if (media.matches) cancelAll(); };
    if (media.addEventListener) media.addEventListener('change', changed);
    else media.addListener(changed);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAll(); });
  addEventListener('pagehide', cancelAll);
})();
