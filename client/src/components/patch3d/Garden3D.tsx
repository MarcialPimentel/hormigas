// The Garden on the Missions screen (docs/11-world.md, docs/art/sunlit-microcosm.md): the whole world as one back
// garden, opened with World or by zooming out past the whole patch. Tap a light to dive into that patch. The
// region grid is one button away for picking a patch by number.
import { useEffect, useRef, useState } from 'react';
import { WORLD } from '@hormigas/shared';
import { api } from '../../api';
import { useGame } from '../../game';
import { useMotion } from '../../motion';
import { createGardenScene, type GardenScene } from './garden';

export function Garden3D({ region, patch, onPick, onFail, onBack, onGrid, inset }: {
  region: number;
  patch: number;
  onPick: (region: number, patch: number) => void;
  onFail: () => void;
  onBack: () => void;
  onGrid: () => void;
  inset?: { left: number; right: number; top: number; bottom: number };
}) {
  const { state, now } = useGame();
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GardenScene | null>(null);
  const dataRef = useRef({ state, now });
  dataRef.current = { state, now };
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const { reduced } = useMotion();
  const [scale, setScale] = useState('');

  useEffect(() => {
    let dead = false;
    createGardenScene(host.current!, labels.current!, () => dataRef.current, { onPick: (r, p) => pickRef.current(r, p) }, reduced)
      .then((s) => {
        if (dead) return s.dispose();
        sceneRef.current = s;
        s.setOnScale(setScale);
        if (insetRef.current) s.setInset(insetRef.current);
        s.setCurrent(region, patch);
        // every region's patches: where colonies live, never who or how strong
        for (let r = 1; r <= WORLD.regions; r++)
          api.get(`/api/map/region?region=${r}`).then((x) => !dead && s.setRegion(r, x.patches)).catch(() => {});
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
  useEffect(() => sceneRef.current?.setCurrent(region, patch), [region, patch]);
  const insetRef = useRef(inset);
  insetRef.current = inset;
  const insetKey = JSON.stringify(inset ?? null);
  useEffect(() => {
    if (inset) sceneRef.current?.setInset(inset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insetKey]);

  return (
    <div className="patch3d garden" ref={host}>
      <div className="p3-labels" ref={labels} aria-hidden="true" />
      <div className="p3-tools">
        <button type="button" className="btn small" onClick={onBack} title="Back down to the patch you were looking at">
          ↓ Back to the patch
        </button>
        <button type="button" className="btn ghost small" onClick={onGrid} title="Pick a patch by number">
          Region grid
        </button>
      </div>
      {scale && (
        <div className="p3-scale" aria-live="off">
          <i aria-hidden="true" />
          {scale}
        </div>
      )}
      <p className="p3-hint" aria-hidden="true">Each light is a patch where colonies live · honey is you, teal your supercolony · tap one to go there</p>
    </div>
  );
}
