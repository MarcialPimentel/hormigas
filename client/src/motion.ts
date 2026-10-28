// Motion preference: 'auto' follows the system's reduced-motion setting, 'on' and 'off' override it.
// Saved per browser. The choice is mirrored onto <html data-motion> so the CSS can follow it too.
import { useEffect, useState } from 'react';

export type MotionPref = 'auto' | 'on' | 'off';
const KEY = 'hormigas.motion';
const EVENT = 'hormigas:motion';
const QUERY = '(prefers-reduced-motion: reduce)';

export function motionPref(): MotionPref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'on' || v === 'off' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

const systemReduced = () => typeof matchMedia !== 'undefined' && matchMedia(QUERY).matches;

export function applyMotionPref() {
  document.documentElement.dataset.motion = motionPref();
}

export function setMotionPref(p: MotionPref) {
  try {
    if (p === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, p);
  } catch {
    /* not saved; still applies until reload */
  }
  document.documentElement.dataset.motion = p;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: p }));
}

/** Current preference and whether motion is reduced; updates when either the choice or the system setting changes. */
export function useMotion() {
  const [pref, setPref] = useState<MotionPref>(motionPref);
  const [sys, setSys] = useState(systemReduced);
  useEffect(() => {
    const onPref = (e: Event) => setPref((e as CustomEvent<MotionPref>).detail);
    window.addEventListener(EVENT, onPref);
    const mq = typeof matchMedia !== 'undefined' ? matchMedia(QUERY) : null;
    const onSys = () => setSys(!!mq?.matches);
    mq?.addEventListener('change', onSys);
    return () => {
      window.removeEventListener(EVENT, onPref);
      mq?.removeEventListener('change', onSys);
    };
  }, []);
  return { pref, reduced: pref === 'off' || (pref === 'auto' && sys) };
}
