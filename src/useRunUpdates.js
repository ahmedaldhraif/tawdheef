import { useEffect, useRef, useState } from 'react';

/** One reader for the banner and progress panel; the server owns the queue. */
export default function useRunUpdates({ run, api, onUpdate, onFinished }) {
  const callbacks = useRef({ api, onUpdate, onFinished });
  callbacks.current = { api, onUpdate, onFinished };
  const [failure, setFailure] = useState(null);
  const runId = run?.id;
  const status = run?.status;

  useEffect(() => {
    if (!runId) return;
    let active = true, timer, reading = false, refreshPending = false;
    const schedule = () => {
      clearTimeout(timer);
      if (active && status === 'running' && !document.hidden) timer = setTimeout(read, 2000);
    };
    const read = async () => {
      clearTimeout(timer);
      if (!active || document.hidden) return;
      if (reading) { refreshPending = true; return; }
      reading = true;
      let finished = false;
      try {
        const value = await callbacks.current.api(`/runs/${runId}`);
        if (!active) return;
        callbacks.current.onUpdate(value);
        setFailure(null);
        finished = status === 'running' && value.status !== 'running';
        if (finished) await callbacks.current.onFinished?.();
      } catch (error) {
        if (active) setFailure({ runId, message: error.message });
      } finally {
        reading = false;
        if (active && !finished && !document.hidden) {
          if (refreshPending) { refreshPending = false; read(); }
          else schedule();
        }
      }
    };
    const visibility = () => {
      clearTimeout(timer);
      if (!document.hidden) read();
    };
    document.addEventListener('visibilitychange', visibility);
    // A completed summary still needs its target history when opened.
    if (status === 'running' || !run.targets) read();
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [runId, status]);

  return failure && failure.runId === runId ? failure.message : '';
}
