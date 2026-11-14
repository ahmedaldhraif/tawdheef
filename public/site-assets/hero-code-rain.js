// Adapted from the user-supplied MatrixRainCursor. Hero-scoped and dependency-free.
const canvas = document.querySelector('.hero-code-rain');
if (canvas) {
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const hero = canvas.parentElement;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const chars = Array.from('ابتثجحخدذرزسشصضطظعغفقكلمنهوي0123456789<>/{}[]=>');
    const size = 16, spacing = 26;
    let width = 0, height = 0, columns = [], frame = 0, last = 0;
    let visible = true, pointer = -1000;
    const randomChar = () => chars[Math.floor(Math.random() * chars.length)];
    function resize() {
      const rect = hero.getBoundingClientRect();
      width = rect.width; height = rect.height;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      columns = Array.from({length: Math.ceil(width / spacing)}, (_, i) => ({
        x: i * spacing, y: Math.random() * (height + 200), speed: 9 + Math.random() * 9,
        glyphs: Array.from({length: 7}, randomChar),
      }));
      paint(0);
    }
    function paint(dt) {
      ctx.clearRect(0, 0, width, height);
      ctx.font = `${size}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      const dark = document.documentElement.dataset.docsTheme === 'dark';
      const rgb = dark ? '173,150,255' : '96,53,255';
      for (const col of columns) {
        col.y += col.speed * dt;
        if (col.y - size * 7 > height) { col.y = -size; col.glyphs = Array.from({length: 7}, randomChar); }
        // Keep the central reading area quieter than the outer edges.
        const edge = Math.abs(col.x - width / 2) / (width / 2);
        const near = Math.abs(col.x - pointer) < 65;
        const alpha = (edge < .65 ? .055 : .32) + (near ? .035 : 0);
        col.glyphs.forEach((char, i) => {
          ctx.fillStyle = `rgba(${rgb},${alpha * (1 - i / 8)})`;
          ctx.fillText(char, col.x, col.y - i * size);
        });
      }
    }
    function tick(now) {
      frame = 0;
      if (!visible || document.hidden || motion.matches) return;
      if (now - last >= 50) { paint(last ? Math.min((now - last) / 1000, .1) : 0); last = now; }
      frame = requestAnimationFrame(tick);
    }
    function sync() {
      cancelAnimationFrame(frame); frame = 0; last = 0;
      if (visible && !document.hidden && !motion.matches) frame = requestAnimationFrame(tick);
      else paint(0);
    }
    new ResizeObserver(resize).observe(hero);
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }).observe(hero);
    new MutationObserver(() => paint(0)).observe(document.documentElement, {attributes: true, attributeFilter: ['data-docs-theme']});
    hero.addEventListener('pointermove', event => { if (event.pointerType === 'mouse') pointer = event.clientX - hero.getBoundingClientRect().left; });
    hero.addEventListener('pointerleave', () => { pointer = -1000; });
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', sync);
    resize(); sync();
  }
}
