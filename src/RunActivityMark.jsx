import React, { useEffect, useId, useState } from 'react';
import './run-activity-mark.css';

/** A working-state variant; the header and canonical brand assets stay static. */
export default function RunActivityMark({ active = false, size = 32 }) {
  const [visible, setVisible] = useState(() => !document.hidden);
  const clipId = `run-mark-${useId().replace(/:/g, '')}`;
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return <svg
    className="run-activity-mark"
    data-active={active ? 'true' : 'false'}
    data-visible={visible ? 'true' : 'false'}
    viewBox="0 0 100 100"
    width={size}
    height={size}
    aria-hidden="true"
    focusable="false"
  >
    <defs><clipPath id={clipId}>
      <path d="M10 40.4H26V59.6H74V40.4H90V75.6H10Z" />
      <rect x="31.333333" y="24.4" width="16" height="16" />
      <rect x="52.666667" y="24.4" width="16" height="16" />
    </clipPath></defs>
    <path className="run-activity-body" d="M10 40.4H26V59.6H74V40.4H90V75.6H10Z" />
    <rect x="31.333333" y="24.4" width="16" height="16" />
    <rect x="52.666667" y="24.4" width="16" height="16" />
    <g clipPath={`url(#${clipId})`}>
      <path className="run-activity-sheen" d="M-16 20H0L-20 80H-36Z" />
    </g>
    <path className="run-activity-code" d="M63.5 28.4L59 32.4L63.5 36.4" />
  </svg>;
}
