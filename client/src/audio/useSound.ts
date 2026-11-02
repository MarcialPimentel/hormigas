// React side of the sound: wakes audio on the first click or key press (browsers require one), pauses it while
// the tab is hidden, and tells the march what the colony is doing.
import { useEffect, useState } from 'react';
import { engine, SOUND_EVENT, type SoundPrefs } from './engine';
import { march, type MarchMode } from './march';

/** The saved sound settings; updates when they change anywhere. */
export function useSoundPrefs(): SoundPrefs {
  const [prefs, setPrefs] = useState<SoundPrefs>(() => ({ ...engine.prefs }));
  useEffect(() => {
    const on = (e: Event) => setPrefs((e as CustomEvent<SoundPrefs>).detail);
    window.addEventListener(SOUND_EVENT, on);
    return () => window.removeEventListener(SOUND_EVENT, on);
  }, []);
  return prefs;
}

/** Which march fits the colony right now (docs/sound.md). Holding parties stand still, so they don't count. */
export function marchFor(state: any): Exclude<MarchMode, 'off'> {
  const raid = (state?.incoming ?? []).some((i: any) => i.hostile && (i.type === 'raid' || i.type === 'swarm'));
  if (raid) return 'tense';
  const moving = (state?.missions ?? []).some((m: any) => m.status === 'outbound' || m.status === 'returning');
  return moving ? 'march' : 'idle';
}

/** Play the march for this game state (null = not in the game yet: silence). */
export function useMarch(state: any) {
  const prefs = useSoundPrefs();
  const mode: MarchMode = !state || !prefs.on || prefs.music <= 0 ? 'off' : marchFor(state);

  useEffect(() => {
    march.set(mode);
  }, [mode]);

  useEffect(() => {
    const wake = () => engine.wake();
    const onVis = () => {
      if (document.visibilityState === 'hidden') engine.sleep();
      else if (engine.ctx) engine.wake();
    };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);
    document.addEventListener('visibilitychange', onVis);
    if (import.meta.env.DEV) (window as any).__march = { march, engine };
    return () => {
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
}
