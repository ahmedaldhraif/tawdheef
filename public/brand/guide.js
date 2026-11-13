(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  let surface = 'light';
  const formats = { latin: 'English', arabic: 'Arabic', bilingual: 'bilingual', stacked: 'stacked' };
  function updateLogo() {
    const format = $('#lockup').value;
    const source = `logo-${format}-${surface === 'light' ? 'purple' : 'white'}.svg`;
    $('#lockup-preview').src = source;
    $('#lockup-preview').alt = `Tawdheef ${formats[format]} logo`;
    $('#lockup-download').href = source;
    $('#logo-stage').dataset.surface = surface;
  }
  $('#lockup').addEventListener('change', updateLogo);
  document.querySelectorAll('[data-surface]').forEach(button => {
    if (button.tagName !== 'BUTTON') return;
    button.addEventListener('click', () => {
      surface = button.dataset.surface;
      document.querySelectorAll('button[data-surface]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      updateLogo();
    });
  });
  $('#endorsement').addEventListener('change', event => { $('#endorsement-preview').hidden = !event.target.checked; });
  let statusTimer;
  document.querySelectorAll('[data-hex]').forEach(button => {
    button.addEventListener('click', async () => {
      clearTimeout(statusTimer);
      try {
        await navigator.clipboard.writeText(button.dataset.hex);
        $('#copy-status').textContent = `${button.dataset.hex} copied`;
      } catch {
        $('#copy-status').textContent = `Hex value: ${button.dataset.hex}`;
      }
      statusTimer = setTimeout(() => { $('#copy-status').textContent = ''; }, 2600);
    });
  });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mark = $('#motion-mark');
  const dots = [...mark.querySelectorAll('.dot')];
  let animations = [], loading = false;
  function stop() {
    animations.forEach(animation => animation.cancel()); animations = [];
    mark.classList.remove('is-busy'); loading = false;
    $('#busy').setAttribute('aria-pressed', 'false');
    $('#motion-state').textContent = reduced.matches ? 'Reduced motion · static mark' : 'Idle · static mark';
  }
  $('#settle').addEventListener('click', async event => {
    stop();
    if (reduced.matches || event.detail === 0) return;
    $('#motion-state').textContent = 'Entrance demonstration';
    animations = dots.map((dot, index) => dot.animate(
      [{ transform: 'translateY(-4px)', opacity: .65 }, { transform: 'translateY(0)', opacity: 1 }],
      { duration: 240, delay: index * 45, easing: 'cubic-bezier(.23,1,.32,1)', fill: 'backwards' }
    ));
    const current = animations;
    await Promise.allSettled(current.map(animation => animation.finished));
    if (animations === current) stop();
  });
  $('#busy').addEventListener('click', () => {
    const wasLoading = loading; stop();
    if (wasLoading) return;
    loading = true; $('#busy').setAttribute('aria-pressed', 'true');
    if (!reduced.matches) mark.classList.add('is-busy');
    $('#motion-state').textContent = reduced.matches ? 'Loading demonstration · motion reduced' : 'Loading demonstration · dots pulse';
  });
  $('#stop').addEventListener('click', stop);
  reduced.addEventListener('change', stop);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  stop();
})();
