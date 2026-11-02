// The phone 3D test's frame-rate meter (?preview=phone3d, .claude/handoff/phone-experience.md). Counts the frames
// the browser draws each second: about 60 is smooth, under 30 feels choppy. "low" is the worst second of the last
// ten, so a stutter while zooming shows even after it has passed.
import { useEffect, useState } from 'react';
import { leavePhone3dPreview } from '../preview';

export function FpsMeter() {
  const [fps, setFps] = useState<{ now: number; low: number } | null>(null);
  useEffect(() => {
    let raf = 0, frames = 0, start = performance.now();
    const seconds: number[] = [];
    const tick = (t: number) => {
      frames++;
      if (t - start >= 1000) {
        const now = Math.round((frames * 1000) / (t - start));
        // a hidden tab stops drawing: don't count that as a stutter
        if (document.visibilityState === 'visible') seconds.push(now);
        if (seconds.length > 10) seconds.shift();
        setFps({ now, low: Math.min(...seconds, now) });
        frames = 0;
        start = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const tone = !fps ? '' : fps.now >= 45 ? ' good' : fps.now >= 28 ? ' ok' : ' bad';
  return (
    <div className={`fps-meter${tone}`} role="status" aria-label="Phone 3D test: frames per second">
      <b>{fps ? fps.now : '…'}</b> fps
      {fps && <span> · low {fps.low}</span>}
      <span className="fps-meta">
        {coarse ? 'phone setting' : 'full setting'} · {window.innerWidth}×{window.innerHeight} @{Math.round(devicePixelRatio * 10) / 10}x
      </span>
      <button type="button" onClick={leavePhone3dPreview}>
        End test
      </button>
    </div>
  );
}
