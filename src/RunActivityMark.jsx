import React, { useEffect, useId, useMemo, useState } from 'react';
import nativeAgent from '../public/brand/states/state-coding-animated.svg?raw';
import './run-activity-mark.css';

// Reuse the Brand Studio artwork and motion rather than drawing a second agent.
// Inline SVG lets reduced motion and actual run/visibility state stop its motion.
const agentContents = nativeAgent.slice(nativeAgent.indexOf('>') + 1, nativeAgent.lastIndexOf('</svg>'))
  .replace(/<title>.*?<\/title>/, '');

export default function RunActivityMark({ active = false, size = 32 }) {
  const [visible, setVisible] = useState(() => !document.hidden);
  const instanceId = `run-mark-${useId().replace(/:/g, '')}`;
  // Banner and dialog can coexist; their clip/gradient references must be unique.
  const markup = useMemo(() => agentContents.replaceAll('tawdheef-wink-coding', instanceId), [instanceId]);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return <svg
    className="tawdheef-mascot run-activity-mark"
    data-agent-artwork="native-coding"
    data-option="wink"
    data-state="coding"
    data-busy={active ? 'true' : 'false'}
    data-playing={active && visible ? 'true' : 'false'}
    data-active={active ? 'true' : 'false'}
    data-visible={visible ? 'true' : 'false'}
    viewBox="0 0 100 100"
    width={size}
    height={size}
    aria-hidden="true"
    focusable="false"
    dangerouslySetInnerHTML={{ __html: markup }}
  />;
}
