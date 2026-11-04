// Top-bar speaker: opens a small card with the music volume and an on/off switch. Saved per browser.
import { useEffect, useRef, useState } from 'react';
import { engine } from '../audio/engine';
import { useSoundPrefs } from '../audio/useSound';

const speaker = (on: boolean) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9v6h4l5 4V5L8 9H4Z" />
    {on ? <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /> : <path d="m17 9 5 6M22 9l-5 6" />}
  </svg>
);

export function SoundButton() {
  const prefs = useSoundPrefs();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const audible = prefs.on && prefs.music > 0;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => !wrapRef.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <div className="sound-wrap" ref={wrapRef}>
      <button
        className="btn ghost small sound-btn"
        aria-label={audible ? 'Sound: on' : 'Sound: off'}
        aria-expanded={open}
        title="Sound"
        onClick={() => setOpen((o) => !o)}
      >
        {speaker(audible)}
      </button>
      {open && (
        <div className="sound-card" role="group" aria-label="Sound">
          <div className="sound-row">
            <label htmlFor="music-vol">Music</label>
            <button className="btn small" onClick={() => engine.setPrefs({ on: !prefs.on, music: !prefs.on && prefs.music <= 0 ? 0.5 : prefs.music })}>
              {prefs.on ? 'Turn off' : 'Turn on'}
            </button>
          </div>
          <input
            id="music-vol"
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(prefs.music * 100)}
            disabled={!prefs.on}
            onChange={(e) => engine.setPrefs({ music: Number(e.target.value) / 100 })}
          />
          <p className="muted small">The music follows your colony: Home in the Dirt while everyone's home, Ants on the March while your ants are out, Raid on the Nest when a raid is coming.</p>
        </div>
      )}
    </div>
  );
}
