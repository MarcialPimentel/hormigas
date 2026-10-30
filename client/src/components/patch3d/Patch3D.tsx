// The 3D Patch on the Missions screen (docs/11-world.md, docs/art/sunlit-microcosm.md). Loaded only when it's
// shown, so Three.js never reaches players on the drawn patch. Tapping a spot picks it, exactly like the drawn
// patch: the spot card under it does the rest. If WebGL can't start, the parent falls back to the drawn patch.
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../game';
import { useMotion } from '../../motion';
import type { Spot } from '../Patch';
import { createPatchScene, type PatchScene } from './scene';

export function Patch3D({ region, patch, spots, selected, onPick, onFail }: {
  region: number;
  patch: number;
  spots: Spot[] | null;
  selected: number | null;
  onPick: (spot: number) => void;
  onFail: () => void;
}) {
  const { colony, state, now } = useGame();
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PatchScene | null>(null);
  const dataRef = useRef({ colony, state, now });
  dataRef.current = { colony, state, now };
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const { reduced } = useMotion();
  const [scale, setScale] = useState('');
  const latest = useRef({ region, patch, spots, selected });
  latest.current = { region, patch, spots, selected };

  useEffect(() => {
    let dead = false;
    createPatchScene(host.current!, labels.current!, () => dataRef.current, { onPick: (s) => pickRef.current(s) }, reduced)
      .then((s) => {
        if (dead) return s.dispose();
        sceneRef.current = s;
        const l = latest.current;
        s.setSpots(l.region, l.patch, l.spots);
        s.setSelected(l.selected);
        s.setOnScale(setScale);
      })
      .catch(() => !dead && onFail());
    return () => {
      dead = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => sceneRef.current?.setReduced(reduced), [reduced]);
  useEffect(() => sceneRef.current?.setSpots(region, patch, spots), [region, patch, spots]);
  useEffect(() => sceneRef.current?.setSelected(selected), [selected]);

  return (
    <div className="patch3d" ref={host}>
      <div className="p3-labels" ref={labels} aria-hidden="true" />
      <div className="p3-tools">
        <button type="button" className="btn small" onClick={() => sceneRef.current?.antsEye()} title="Drop down to ant height beside your mound">
          Ant's-eye view
        </button>
        <button type="button" className="btn ghost small" onClick={() => sceneRef.current?.resetView()} title="See the whole patch (or double-click)">
          Whole patch
        </button>
      </div>
      {scale && (
        <div className="p3-scale" aria-live="off">
          <i aria-hidden="true" />
          {scale}
        </div>
      )}
      {/* the canvas can't be tabbed to: the same spots as buttons, for keyboards and screen readers */}
      <div className="sr-only">
        {(spots ?? []).map((s) => (
          <button key={s.spot} type="button" aria-pressed={selected === s.spot} onClick={() => onPick(s.spot)}>
            {s.colony ? `${s.colony.name}${s.colony.mine ? ', your colony' : ''}` : `Spot ${s.spot}, empty`}
          </button>
        ))}
      </div>
      <p className="p3-hint" aria-hidden="true">Drag to move · scroll to zoom · right-drag to turn · tap a mound</p>
    </div>
  );
}
