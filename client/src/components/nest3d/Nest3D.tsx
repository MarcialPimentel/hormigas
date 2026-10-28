// The 3D nest on the Colony screen (docs/12-ui-nest-view.md, "The 3D slab"). Loaded only when it's shown, so
// Three.js never reaches players on the 2D nest. Tapping a chamber opens the same sheet as the 2D nest;
// tapping the entrance opens Missions. If WebGL can't start, the parent falls back to the 2D nest.
import { useEffect, useRef, useState } from 'react';
import { CHAMBERS, CHAMBER_IDS, isUnlocked, lvl, type ChamberId } from '@hormigas/shared';
import { useGame } from '../../game';
import { setMotionPref, useMotion, type MotionPref } from '../../motion';
import type { Nav } from '../../nav';
import { ChamberSheet } from '../ChamberSheet';
import { createNestScene, type Layout, type NestScene } from './scene';

const NEXT_MOTION: Record<MotionPref, MotionPref> = { auto: 'on', on: 'off', off: 'auto' };

export function Nest3D({ nav, onFail, onSwitch }: { nav: Nav; onFail: () => void; onSwitch: () => void }) {
  const { colony, state, now } = useGame();
  const host = useRef<HTMLDivElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<NestScene | null>(null);
  const dataRef = useRef({ colony, state, now });
  dataRef.current = { colony, state, now };
  const { pref: motion, reduced } = useMotion();
  const [selected, setSelected] = useState<ChamberId | null>(null);
  const [height, setHeight] = useState(480);

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
      { onChamber: (id) => setSelected((s) => (s === id ? null : id)), onEntrance: () => nav('missions') },
      reduced,
    )
      .then((s) => {
        if (dead) s.dispose();
        else sceneRef.current = s;
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

  // what the slab is carved from: built chambers, ones you could dig next, how many ants there are
  const research = state?.player.research ?? {};
  const totalUnits = colony ? Object.values(colony.units).reduce((a, b) => a + (b ?? 0), 0) : 0;
  const soldiers = colony ? (colony.units.minor_soldier ?? 0) + (colony.units.major_soldier ?? 0) : 0;
  const layout: Layout | null = colony
    ? {
        chambers: Object.fromEntries(CHAMBER_IDS.map((id) => [id, lvl(colony.chambers, id)])),
        unlocked: CHAMBER_IDS.filter((id) => lvl(colony.chambers, id) === 0 && isUnlocked(CHAMBERS[id].unlock, colony.chambers, research)),
        workers: Math.min(40, Math.ceil(totalUnits / 3)),
        soldiers: Math.min(10, Math.ceil(soldiers / 4)),
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
  return (
    <>
      <div className="nest n3" ref={host} style={{ height }}>
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
        <p className="n3-hint">Drag to turn the nest · tap a chamber · tap the entrance to send a party</p>
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
      </div>
      {selected && <ChamberSheet id={selected} onClose={() => setSelected(null)} onAllChambers={() => nav('chambers')} />}
    </>
  );
}
