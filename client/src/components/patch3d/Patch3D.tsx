// The 3D Patch on the Missions screen (docs/11-world.md, docs/art/sunlit-microcosm.md). Loaded only when it's
// shown, so Three.js never reaches players on the drawn patch. Tapping a spot picks it, exactly like the drawn
// patch: the spot card under it does the rest. If WebGL can't start, the parent falls back to the drawn patch.
import { useEffect, useRef, useState } from 'react';
import { WILDS_SPOT } from '@hormigas/shared';
import { api } from '../../api';
import { useGame } from '../../game';
import { useMotion } from '../../motion';
import type { Spot } from '../Patch';
import { createPatchScene, type PatchScene } from './scene';

export type Inset = { left: number; right: number; top: number; bottom: number };

export function Patch3D({ region, patch, spots, selected, onPick, onFail, replay, onRise, onNest, inset, focus, order }: {
  region: number;
  patch: number;
  spots: Spot[] | null;
  selected: number | null;
  onPick: (spot: number) => void;
  onFail: () => void;
  /** a battle report's data to act out on the patch (Replay on the patch, from Reports) */
  replay?: unknown;
  /** zoomed out past the whole patch: rise to the Garden */
  onRise?: () => void;
  /** down into your own nest (the Colony screen) */
  onNest?: () => void;
  /** the room floating cards cover (the war room on computers) */
  inset?: Inset;
  /** fly to this party's column ('m12', 'i7'); `n` changes to ask again */
  focus?: { key: string; n: number } | null;
  /** the order being written in Deploy, drawn as From → To */
  order?: { from: { region: number; patch: number; spot: number }; to: { region: number; patch: number; spot: number }; label: string } | null;
}) {
  const { colony, state, now } = useGame();
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PatchScene | null>(null);
  const dataRef = useRef({ colony, state, now });
  dataRef.current = { colony, state, now };
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const riseRef = useRef(onRise);
  riseRef.current = onRise;
  const { reduced } = useMotion();
  const [scale, setScale] = useState('');
  const [ready, setReady] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const latest = useRef({ region, patch, spots, selected });
  latest.current = { region, patch, spots, selected };

  useEffect(() => {
    let dead = false;
    createPatchScene(host.current!, labels.current!, () => dataRef.current, { onPick: (s) => pickRef.current(s), onRise: () => riseRef.current?.() }, reduced)
      .then((s) => {
        if (dead) return s.dispose();
        sceneRef.current = s;
        const l = latest.current;
        s.setSpots(l.region, l.patch, l.spots);
        s.setSelected(l.selected);
        s.setOnScale(setScale);
        if (insetRef.current) s.setInset(insetRef.current);
        setReady(true);
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
  const orderKey = JSON.stringify(order ?? null);
  useEffect(() => {
    if (ready) sceneRef.current?.setOrder(order ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey, ready]);
  const insetRef = useRef(inset);
  insetRef.current = inset;
  const insetKey = JSON.stringify(inset ?? null);
  useEffect(() => {
    if (inset) sceneRef.current?.setInset(inset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insetKey]);
  // a party may only appear on the patch once the map and state have caught up: try for a few seconds
  useEffect(() => {
    if (!focus || !ready) return;
    let tries = 0;
    const t = window.setInterval(() => {
      if (sceneRef.current?.focusParty(focus.key) || ++tries > 12) window.clearInterval(t);
    }, 250);
    return () => window.clearInterval(t);
  }, [focus, ready]);

  // Replay from a report: as soon as the scene is up (it waits for the battle's patch to load)
  useEffect(() => {
    if (ready && replay) sceneRef.current?.playBattle(replay);
  }, [ready, replay]);

  // The live clash: when a raid or swarm lands on something in view while you're watching, act out its report.
  const pending = useRef(new Map<string, { arriveAt: number; target: { region: number; patch: number; spot: number } }>());
  const played = useRef(new Set<number>());
  useEffect(() => {
    if (!state || !ready) return;
    const cur = new Map<string, { arriveAt: number; target: { region: number; patch: number; spot: number } }>();
    const home = new Map((state.colonies ?? []).map((c) => [c.id, c.coords]));
    for (const i of (state.incoming ?? []) as any[]) {
      const target = i.herd ?? home.get(i.targetColonyId);
      if (i.hostile && target) cur.set(`i${i.id}`, { arriveAt: i.arriveAt, target });
    }
    for (const m of (state.missions ?? []) as any[]) if (m.type === 'raid' && m.status === 'outbound') cur.set(`m${m.id}`, { arriveAt: m.arriveAt, target: m.target });
    const landed = [...pending.current].filter(([k, v]) => !cur.has(k) && Math.abs(now - v.arriveAt) < 120_000 && v.target.region === region && v.target.patch === patch);
    pending.current = cur;
    if (!landed.length) return;
    const same = (a: any, b: any) => a && b && a.region === b.region && a.patch === b.patch && a.spot === b.spot;
    // the server writes the report as it resolves the fight: give it a moment
    timers.current.push(window.setTimeout(() => {
      api.get('/api/reports?limit=10').then((r) => {
        for (const [, v] of landed) {
          const rep = (r.reports ?? []).find((x: any) => x.type === 'battle' && !played.current.has(x.id) && same(x.data?.target, v.target));
          if (rep) {
            played.current.add(rep.id);
            sceneRef.current?.playBattle(rep.data);
            break;
          }
        }
      }).catch(() => {});
    }, 1500));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, ready]);

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
        {onRise && (
          <button type="button" className="btn ghost small" onClick={onRise} title="Rise to the whole garden (or keep zooming out)">
            ↑ Garden
          </button>
        )}
        {onNest && (
          <button type="button" className="btn ghost small" onClick={onNest} title="Down into your nest">
            ↓ Your nest
          </button>
        )}
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
            {s.colony ? `${s.colony.name}${s.colony.mine ? ', your colony' : ''}` : s.spot === WILDS_SPOT ? 'The wilds' : `Spot ${s.spot}, empty`}
          </button>
        ))}
      </div>
      <p className="p3-hint" aria-hidden="true">Drag to move · scroll to zoom (out past the patch to rise to the garden) · right-drag to turn · tap a mound</p>
    </div>
  );
}
