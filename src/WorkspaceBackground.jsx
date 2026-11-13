import React, { useEffect, useRef } from 'react';

// Adapted from ApplyMCP's BackgroundPattern. Upstream MIT notice:
// docs/licenses/background-pattern-MIT.txt. No per-frame React state or idle loop.
export default function WorkspaceBackground() {
  const highlight = useRef(null);
  useEffect(() => {
    const node = highlight.current;
    const preference = matchMedia('(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    let frame = 0, fade = null, x = 0, y = 0, listening = false;
    const flush = () => {
      frame = 0;
      node.style.setProperty('--pattern-x', `${x}px`);
      node.style.setProperty('--pattern-y', `${y}px`);
      if (fade) { fade.currentTime = 0; fade.play(); }
    };
    const move = event => {
      if (event.pointerType !== 'mouse' || document.hidden) return;
      x = event.clientX; y = event.clientY;
      if (!frame) frame = requestAnimationFrame(flush);
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      cancelAnimationFrame(frame); frame = 0;
      fade?.cancel(); fade = null; listening = false;
    };
    const update = () => {
      stop();
      if (!preference.matches || document.hidden || typeof node.animate !== 'function') return;
      fade = node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1200, easing: 'ease-out', fill: 'forwards' });
      fade.finish();
      window.addEventListener('pointermove', move, { passive: true });
      listening = true;
    };
    const leave = () => { if (listening) { cancelAnimationFrame(frame); frame = 0; fade?.finish(); } };
    update();
    preference.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('blur', leave);
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      stop();
      preference.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('blur', leave);
      document.documentElement.removeEventListener('pointerleave', leave);
    };
  }, []);
  return <div className="workspace-background" aria-hidden="true"><div className="workspace-dot-grid" /><div className="workspace-dot-spotlight" ref={highlight} /></div>;
}
