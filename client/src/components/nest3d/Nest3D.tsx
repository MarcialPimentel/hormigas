// The 3D nest on the Colony screen (docs/12-ui-nest-view.md, "The 3D slab"). Loaded only when it's shown, so
// Three.js never reaches players on the 2D nest. Tapping a chamber opens the same sheet as the 2D nest, and its
// Look inside (or a double-click) dives into the chamber to meet the ants at work there; tapping the entrance
// opens Missions. If WebGL can't start, the parent falls back to the 2D nest.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CHAMBERS, CHAMBER_IDS, isUnlocked, lvl, roleCount, storageCapacity, type ChamberId } from '@hormigas/shared';
import { useGame } from '../../game';
import { setMotionPref, useMotion, type MotionPref } from '../../motion';
import type { Nav } from '../../nav';
import { ChamberPopover, ChamberSheet, STORE_OF } from '../ChamberSheet';
import { RESOURCE_LABEL } from '../../describe';
import { MAX_ZOOM, createNestScene, type Inset, type Layout, type NestScene } from './scene';

const NEXT_MOTION: Record<MotionPref, MotionPref> = { auto: 'on', on: 'off', off: 'auto' };
const nearFive = (n: number) => (n <= 20 ? n : Math.round(n / 5) * 5);
const coarseHint = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

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
  // inside a chamber (docs/12-ui-nest-view.md, "Inside a chamber"), and the ant being looked at there
  const [inside, setInside] = useState<ChamberId | null>(null);
  const [ant, setAnt] = useState<{ name: string; caste: string; job: string } | null>(null);
  const goInside = useCallback((id: ChamberId) => {
    setSelected(null);
    setInside(id);
    sceneRef.current?.focus(id);
  }, []);
  const insideRef = useRef(inside);
  insideRef.current = inside;
  const leave = useCallback(() => {
    // back on the nest with the chamber's card open, as from the 2D close-up
    if (insideRef.current) setSelected(insideRef.current);
    setInside(null);
    setAnt(null);
    sceneRef.current?.focus(null);
  }, []);
  // Esc lets go of the ant first, then leaves the chamber
  const antRef = useRef(ant);
  antRef.current = ant;
  useEffect(() => {
    if (!inside) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (antRef.current) sceneRef.current?.release();
      else leave();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inside, leave]);

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
        onLookInside: (id) => goInsideRef.current(id),
        onLeave: () => leaveRef.current(),
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

  const goInsideRef = useRef(goInside);
  goInsideRef.current = goInside;
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
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
  const insideLevel = inside ? lvl(colony.chambers, inside) : 0;
  const store = inside ? STORE_OF[inside] : undefined;
  const cap = store ? storageCapacity(colony.chambers, colony.research)[store] : 0;
  return (
    <>
      <div className={`nest n3${fill ? ' fill' : ''}${inside ? ' inside' : ''}`} ref={host} style={{ height: fill ? '100%' : height }}>
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
        {inside ? (
          <>
            {/* inside a chamber: its name, what it holds, and the way back out */}
            <div className="n3-inside-bar" role="group" aria-label={`Inside the ${CHAMBERS[inside].name}`}>
              <span className="closeup-title">
                {CHAMBERS[inside].name} <span className="muted">level {insideLevel}</span>
              </span>
              {store && (
                <span className="n3-inside-store">
                  {RESOURCE_LABEL[store]}: {Math.floor(colony.resources[store]).toLocaleString()} / {Math.floor(cap).toLocaleString()}
                </span>
              )}
              <button type="button" className="btn closeup-btn" onClick={leave} aria-label="Back to the whole nest">
                ← Back to the nest
              </button>
            </div>
            <p className="n3-hint">{ant ? 'Click her again, or Esc, to let her go' : coarseHint ? 'Tap an ant to meet her' : 'Point at an ant to see her name · click to meet her · scroll out to leave'}</p>
            <p className="sr-only" aria-live="polite">
              {ant ? `${ant.name}, ${ant.caste}: ${ant.job}` : ''}
            </p>
          </>
        ) : (
          <>
            <button type="button" className="nest-motion nest-switch" onClick={onSwitch} title="Show the flat 2D nest instead">
              2D view
            </button>
            {/* the scale ladder: up out of the entrance to the patch, where every mission walks */}
            <button type="button" className="nest-motion nest-up" onClick={() => nav('missions')} title="Up to the patch: every mission, full screen">
              ↑ Up to the patch
            </button>
            <p className="n3-hint">
              {!fill
                ? 'Drag to turn the nest · tap a chamber · tap the entrance to send a party'
                : zoom > 1.02
                  ? 'Drag to move around · double-click to see the whole nest'
                  : 'Scroll to zoom · drag to turn · tap a chamber · double-click to look inside'}
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
          </>
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
        {fill && selected && !inside && (
          <ChamberPopover at={where} id={selected} onClose={() => setSelected(null)} onLookInside={() => goInside(selected)} onAllChambers={() => nav('chambers')} />
        )}
      </div>
      {!fill && selected && !inside && (
        <ChamberSheet id={selected} onClose={() => setSelected(null)} onLookInside={() => goInside(selected)} onAllChambers={() => nav('chambers')} />
      )}
    </>
  );
}
