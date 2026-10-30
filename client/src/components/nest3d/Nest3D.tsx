// The 3D nest on the Colony screen (docs/12-ui-nest-view.md, "The 3D slab"). Loaded only when it's shown, so
// Three.js never reaches players on the 2D nest. Tapping a chamber opens the same sheet as the 2D nest; scrolling
// in (or double-clicking a chamber) glides close enough to meet the ants at work in it, in the same view; tapping
// the entrance opens Missions. If WebGL can't start, the parent falls back to the 2D nest.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CHAMBERS, CHAMBER_IDS, isUnlocked, lvl, roleCount, type ChamberId } from '@hormigas/shared';
import { useGame } from '../../game';
import { setMotionPref, useMotion, type MotionPref } from '../../motion';
import type { Nav } from '../../nav';
import { ChamberPopover, ChamberSheet } from '../ChamberSheet';
import { MAX_ZOOM, PICK_ZOOM, createNestScene, type Inset, type Layout, type NestScene } from './scene';

const NEXT_MOTION: Record<MotionPref, MotionPref> = { auto: 'on', on: 'off', off: 'auto' };
const nearFive = (n: number) => (n <= 20 ? n : Math.round(n / 5) * 5);

/** `fill`: the nest fills its box (the Colony screen on a computer) and `inset` is the room its floating cards cover. */
export function Nest3D({ nav, onFail, onSwitch, fill, inset }: { nav: Nav; onFail: () => void; onSwitch: () => void; fill?: boolean; inset?: Inset }) {
  const { colony, state, now } = useGame();
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<NestScene | null>(null);
  const dataRef = useRef({ colony, state, now });
  dataRef.current = { colony, state, now };
  const { pref: motion, reduced } = useMotion();
  const [selected, setSelected] = useState<ChamberId | null>(null);
  const [height, setHeight] = useState(480);
  const [zoom, setZoom] = useState(1);
  // the ant you clicked (docs/12-ui-nest-view.md, "Meeting the ants"); Esc lets her go
  const [ant, setAnt] = useState<{ name: string; caste: string; job: string } | null>(null);
  useEffect(() => {
    if (!ant) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && sceneRef.current?.release();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ant]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(Math.max(440, Math.min(640, Math.round(el.clientWidth * 0.62)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // the scene lives as long as the view
  useEffect(() => {
    let dead = false;
    createNestScene(
      host.current!,
      labels.current!,
      () => dataRef.current,
      {
        onChamber: (id) => setSelected((s) => (s === id ? null : id)),
        onEntrance: () => nav('missions'),
        onAnt: setAnt,
      },
      reduced,
    )
      .then((s) => {
        if (dead) return s.dispose();
        sceneRef.current = s;
        if (insetRef.current) s.setInset(insetRef.current);
        s.setOnZoom(setZoom);
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

  const insetRef = useRef(inset);
  insetRef.current = inset;
  const insetKey = JSON.stringify(inset ?? null);
  useEffect(() => sceneRef.current?.setInset(inset ?? { left: 0, right: 0, top: 0, bottom: 0 }), [insetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const where = useCallback(() => (selected && sceneRef.current ? sceneRef.current.where(selected) : null), [selected]);

  // what the slab is carved from: built chambers, ones you could dig next, how many ants there are
  const research = state?.player.research ?? {};
  const totalUnits = colony ? Object.values(colony.units).reduce((a, b) => a + (b ?? 0), 0) : 0;
  const soldiers = colony ? roleCount(colony.units, 'soldier') : 0;
  const layout: Layout | null = colony
    ? {
        chambers: Object.fromEntries(CHAMBER_IDS.map((id) => [id, lvl(colony.chambers, id)])),
        unlocked: CHAMBER_IDS.filter((id) => lvl(colony.chambers, id) === 0 && isUnlocked(CHAMBERS[id].unlock, colony.chambers, research)),
        // one drawn ant per ant up to a cap (rounded to fives past 20, so a hatching doesn't re-carve the slab)
        workers: nearFive(Math.min(160, Math.max(0, totalUnits - soldiers))),
        soldiers: nearFive(Math.min(30, soldiers)),
      }
    : null;
  const layoutKey = JSON.stringify(layout);
  useEffect(() => {
    if (!layout) return;
    // the scene may still be loading: try again shortly until it's there
    let tries = 0;
    const apply = () => {
      if (sceneRef.current) sceneRef.current.setLayout(layout);
      else if (tries++ < 50) t = window.setTimeout(apply, 100);
    };
    let t = 0;
    apply();
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  if (!colony) return null;
  // the hint follows what you can do at this zoom: ants can be met once they're big enough to point at
  const hint = !fill
    ? 'Drag to turn the nest · tap a chamber · tap the entrance to send a party'
    : ant
      ? 'Click her again, or Esc, to let her go'
      : zoom >= PICK_ZOOM
        ? 'Point at an ant for her name · click to meet her · drag to move · scroll out'
        : zoom > 1.02
          ? 'Scroll in closer to meet the ants · drag to move · double-click for the whole nest'
          : 'Scroll in to watch the ants work · double-click a chamber · drag to turn · tap the entrance to send a party';
  return (
    <>
      <div className={`nest n3${fill ? ' fill' : ''}`} ref={host} style={{ height: fill ? '100%' : height }}>
        <div className="n3-labels" ref={labels} aria-hidden="true" />
        <button
          type="button"
          className="nest-motion"
          onClick={() => setMotionPref(NEXT_MOTION[motion])}
          title="Auto follows your device's reduce-motion setting"
          aria-label={`Animation: ${motion}${motion === 'auto' ? (reduced ? ' (still)' : ' (moving)') : ''}. Click to change.`}
        >
          Motion: {motion}
        </button>
        <button type="button" className="nest-motion nest-switch" onClick={onSwitch} title="Show the flat 2D nest instead">
          2D view
        </button>
        {/* the scale ladder: up out of the entrance to the patch, where every mission walks */}
        <button type="button" className="nest-motion nest-up" onClick={() => nav('missions')} title="Up to the patch: every mission, full screen">
          ↑ Up to the patch
        </button>
        <p className="n3-hint">{hint}</p>
        <p className="sr-only" aria-live="polite">
          {ant ? `${ant.name}, ${ant.caste}: ${ant.job}` : ''}
        </p>
        {fill && (
          <div className="n3-zoom" role="group" aria-label="Zoom">
            <button type="button" onClick={() => sceneRef.current?.zoomBy(1.4)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in" title="Zoom in (or scroll)">
              +
            </button>
            <button type="button" onClick={() => sceneRef.current?.zoomBy(1 / 1.4)} disabled={zoom <= 1} aria-label="Zoom out" title="Zoom out (or scroll)">
              −
            </button>
            {zoom > 1.02 && (
              <button type="button" className="n3-fit" onClick={() => sceneRef.current?.resetView()} title="Show the whole nest (or double-click)">
                Whole nest
              </button>
            )}
          </div>
        )}
        {/* keyboard and screen readers: every chamber as a button */}
        <ul className="sr-only">
          {CHAMBER_IDS.filter((id) => lvl(colony.chambers, id) > 0 || isUnlocked(CHAMBERS[id].unlock, colony.chambers, research)).map((id) => (
            <li key={id}>
              <button type="button" onClick={() => setSelected(id)}>
                {CHAMBERS[id].name}
                {lvl(colony.chambers, id) ? `, level ${lvl(colony.chambers, id)}` : ', not dug yet'}
              </button>
            </li>
          ))}
        </ul>
        {fill && selected && <ChamberPopover at={where} id={selected} onClose={() => setSelected(null)} onAllChambers={() => nav('chambers')} />}
      </div>
      {!fill && selected && <ChamberSheet id={selected} onClose={() => setSelected(null)} onAllChambers={() => nav('chambers')} />}
    </>
  );
}
