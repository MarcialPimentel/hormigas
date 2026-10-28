// Schematic cross-section of the nest (docs/12-ui-nest-view.md), drawn with PixiJS.
// Chambers grow with level, tunnels link them to the entrance, and ants (docs/18-art-direction.md) go about
// their work. Tapping a chamber opens a close-up of it.
import { useEffect, useRef, useState } from 'react';
import { setMotionPref, useMotion, type MotionPref } from '../motion';
import { Application, Graphics } from 'pixi.js';
import { C, FLECK, LAYOUT, SURFACE, dottedEllipse, drawPolyline, geometry, lerpColor, seeded, skyAt, surfaceParties, type Pt, type SurfaceParty } from './nestScene';
import { ChamberSheet, STORE_OF } from './ChamberSheet';
import { fmtDuration } from '../format';
import { MISSION_LABEL, type MissionType } from '../nav';
import { createFx } from './nestFx';
import { antTextures, drawAnt, walkFrame } from './antSprites';
import { ChamberCloseUp } from './ChamberCloseUp';
import { onMoment } from '../moments';
import { CHAMBERS, CHAMBER_IDS, RESEARCH, isUnlocked, lvl, queueEndsAt, storageCapacity, type ChamberId, type ResearchId } from '@hormigas/shared';
import { useGame } from '../game';
import type { Nav } from '../nav';

interface Ant {
  path: Pt[];
  lens: number[];
  total: number;
  d: number;
  dir: 1 | -1;
  speed: number;
  pause: number;
  soldier: boolean;
  home: Pt;
}

function makeAnt(path: Pt[], soldier: boolean, rnd: () => number): Ant {
  const lens = [0];
  for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const total = lens[lens.length - 1];
  return { path, lens, total, d: rnd() * total, dir: rnd() < 0.5 ? 1 : -1, speed: 14 + rnd() * 16, pause: 0, soldier, home: path[0] };
}

/** Position on the path and heading (radians) in the direction the ant is walking. */
function antPos(a: Ant): [number, number, number] {
  const { path, lens } = a;
  let i = 1;
  while (i < lens.length - 1 && lens[i] < a.d) i++;
  const seg = lens[i] - lens[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (a.d - lens[i - 1]) / seg));
  const dx = (path[i][0] - path[i - 1][0]) * a.dir;
  const dy = (path[i][1] - path[i - 1][1]) * a.dir;
  return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t, Math.atan2(dy, dx)];
}

const NEXT_MOTION: Record<MotionPref, MotionPref> = { auto: 'on', on: 'off', off: 'auto' };

function destroyApp(app: Application) {
  if ((app as any).__dead) return;
  (app as any).__dead = true;
  try {
    if ((app as any).__iv) clearInterval((app as any).__iv);
    app.destroy(true, { children: true });
    (app as any).__art?.destroy();
  } catch {
    /* not initialised yet */
  }
}

export function NestView({ nav }: { nav: Nav }) {
  const { colony, state, now } = useGame();
  const host = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const dataRef = useRef({ colony, state, now });
  dataRef.current = { colony, state, now };
  const { pref: motion, reduced } = useMotion();
  const [closeUp, setCloseUp] = useState<ChamberId | null>(null);
  const [selected, setSelected] = useState<ChamberId | null>(null);
  const hour = new Date(now).getHours();

  // tear down whatever scene is on screen when the view goes away
  useEffect(
    () => () => {
      if (appRef.current) destroyApp(appRef.current);
      appRef.current = null;
    },
    [],
  );

  // track container size
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      // the nest is the home screen: tall enough to see the colony at work
      setSize({ w, h: w < 520 ? 380 : Math.max(440, Math.min(540, Math.round(w * 0.5))) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const research = state?.player.research ?? {};
  const chambersKey = JSON.stringify(colony?.chambers ?? {});
  const buildKey = colony?.buildJob ? `${colony.buildJob.chamber}:${colony.buildJob.startAt}:${colony.buildJob.endAt}` : '';
  const totalUnits = colony ? Object.values(colony.units).reduce((a, b) => a + (b ?? 0), 0) : 0;
  const soldiers = colony ? (colony.units.minor_soldier ?? 0) + (colony.units.major_soldier ?? 0) : 0;
  const antBucket = `${Math.min(60, Math.ceil(totalUnits / 3))}:${Math.min(18, Math.ceil(soldiers / 4))}`;

  // (re)build the scene
  useEffect(() => {
    if (!host.current || size.w === 0 || !colony) return;
    let disposed = false;
    const app = new Application();
    let tickFn: ((t: { deltaMS: number }) => void) | null = null;
    let offMoments: (() => void) | null = null;
    (async () => {
      await app.init({ width: size.w, height: size.h, background: C.soilDeep, antialias: true, resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true });
      const art = await antTextures();
      if (disposed) {
        app.destroy(true);
        art.destroy();
        return;
      }
      (app as any).__art = art;
      // keep showing the previous scene until this one has drawn, so a rebuild never flashes blank
      const previous = appRef.current;
      appRef.current = app;
      host.current!.prepend(app.canvas);
      app.canvas.setAttribute('aria-hidden', 'true');
      const { w, h } = size;
      const geo = geometry(w, h);
      const chambers = colony.chambers;
      const built = CHAMBER_IDS.filter((id) => lvl(chambers, id) > 0);
      const next = CHAMBER_IDS.filter((id) => lvl(chambers, id) === 0 && isUnlocked(CHAMBERS[id].unlock, chambers, research));

      // soil with strata
      const bg = new Graphics();
      const bands = 7;
      for (let i = 0; i < bands; i++) {
        const t = i / (bands - 1);
        const col = lerpColor(C.soilTop, C.soilDeep, t);
        const y0 = SURFACE * h + ((h - SURFACE * h) * i) / bands;
        bg.rect(0, y0, w, (h - SURFACE * h) / bands + 1).fill(col);
      }
      // sky by the player's own clock: stars and moon at night, sun by day, hills on the horizon
      const sky = skyAt(hour);
      const top = SURFACE * h;
      bg.rect(0, 0, w, top).fill(sky.sky);
      const sr = seeded(3);
      if (sky.stars) for (let i = 0; i < w / 22; i++) bg.circle(sr() * w, sr() * top * 0.7, 0.5 + sr() * 0.8).fill({ color: 0xf3ead8, alpha: 0.35 + sr() * 0.5 });
      const arc = sky.body === 'sun' ? (hour - 6) / 14 : ((hour + 4) % 24) / 10;
      bg.circle(w * (0.88 - 0.76 * Math.max(0, Math.min(1, arc))), top * 0.34, Math.max(5, top * 0.11)).fill({ color: sky.bodyColor, alpha: 0.9 });
      const hills: number[] = [0, top];
      for (let x = 0; x <= w + 20; x += 20) hills.push(x, top - 5 - (Math.sin(x / 95) + 1) * top * 0.1 - (Math.sin(x / 37 + 1) + 1) * top * 0.03);
      hills.push(w, top);
      bg.poly(hills).fill(sky.hills);
      bg.rect(0, SURFACE * h - 3, w, 4).fill(C.grass);
      const rng = seeded(7);
      for (let i = 0; i < w / 9; i++) {
        const x = rng() * w;
        bg.moveTo(x, SURFACE * h - 2).lineTo(x + (rng() - 0.5) * 4, SURFACE * h - 6 - rng() * 7).stroke({ width: 1.4, color: C.grass, alpha: 0.85 });
      }
      for (let i = 0; i < 40; i++) bg.circle(rng() * w, SURFACE * h + 8 + rng() * (h - SURFACE * h - 10), 1 + rng() * 2).fill({ color: C.strata, alpha: 0.7 });
      app.stage.addChild(bg);

      // tunnels
      const tunnels = new Graphics();
      const deepest = Math.max(SURFACE + 0.05, ...built.map((id) => LAYOUT[id].y));
      const shaft: Pt[] = [];
      for (let yy = SURFACE * h - 4; yy <= deepest * h; yy += 4) shaft.push([geo.shaftX(yy), yy]);
      drawPolyline(tunnels, shaft, 8, C.hollow);
      for (const id of built) drawPolyline(tunnels, geo.pathTo(id).slice(-15), 7, C.hollow);
      for (const id of next) drawPolyline(tunnels, geo.pathTo(id).slice(-15), 2, C.rim, 0.6);
      tunnels.ellipse(geo.shaftX(SURFACE * h), SURFACE * h, 9, 5).fill(C.hollow);
      app.stage.addChild(tunnels);

      // chambers
      const ch = new Graphics();
      for (const id of built) {
        const { x, y } = LAYOUT[id];
        const { rx, ry } = geo.size(id, lvl(chambers, id));
        ch.ellipse(x * w, y * h, rx, ry).fill(C.hollow);
        ch.ellipse(x * w, y * h, rx, ry).stroke({ width: 1.5, color: C.rim });
        const fleck = FLECK[id];
        if (fleck) {
          const r2 = seeded(id.length * 13);
          const n = Math.min(14, 3 + lvl(chambers, id));
          for (let i = 0; i < n; i++) {
            const a = r2() * Math.PI * 2;
            const d = Math.sqrt(r2()) * 0.7;
            ch.circle(x * w + Math.cos(a) * rx * d, y * h + Math.sin(a) * ry * d * 0.8 + ry * 0.25, 1.6).fill({ color: fleck, alpha: 0.85 });
          }
        }
        if (id === 'queen_chamber') dottedEllipse(ch, x * w, y * h, rx + 3, ry + 3, C.honey, 22);
      }
      for (const id of next) {
        const { x, y } = LAYOUT[id];
        const { rx, ry } = geo.size(id, 0);
        dottedEllipse(ch, x * w, y * h, rx, ry, C.rim, 18);
      }
      app.stage.addChild(ch);

      // things happening: storage, eggs, digging, research (under the ants); parties and moments (over them)
      const fx = createFx(w, h, geo, chambers, reduced, art.frames);
      app.stage.addChild(fx.under);

      // construction progress
      const build = new Graphics();
      app.stage.addChild(build);

      // ants
      const antsG = new Graphics();
      app.stage.addChild(antsG);
      app.stage.addChild(fx.over);
      // replay the last few seconds too: a level-up rebuilds this scene, and the new one should still show it
      offMoments = onMoment((s) => fx.push(s.m), 3000);
      const r3 = seeded(42);
      const workerTargets = built.length ? built : (['queen_chamber'] as ChamberId[]);
      const [nWorkers, nSoldiers] = antBucket.split(':').map(Number);
      const ants: Ant[] = [];
      for (let i = 0; i < Math.max(6, nWorkers); i++) ants.push(makeAnt(geo.pathTo(workerTargets[Math.floor(r3() * workerTargets.length)]), false, r3));
      const entrance: Pt = [geo.shaftX(SURFACE * h + 14), SURFACE * h + 14];
      for (let i = 0; i < nSoldiers; i++) {
        const a = makeAnt([entrance, [entrance[0] + (r3() - 0.5) * 30, entrance[1] + 6 + r3() * 18]], true, r3);
        ants.push(a);
      }

      const draw = (dt: number) => {
        // build ring
        build.clear();
        const { colony: c, now: t } = dataRef.current;
        if (c?.buildJob && LAYOUT[c.buildJob.chamber as ChamberId]) {
          const id = c.buildJob.chamber as ChamberId;
          const { x, y } = LAYOUT[id];
          const { rx, ry } = geo.size(id, c.buildJob.level);
          const p = Math.max(0, Math.min(1, (t - c.buildJob.startAt) / (c.buildJob.endAt - c.buildJob.startAt)));
          const steps = Math.max(2, Math.round(48 * p));
          for (let i = 0; i <= steps; i++) {
            const a = -Math.PI / 2 + (i / 48) * Math.PI * 2;
            const px = x * w + Math.cos(a) * (rx + 5);
            const py = y * h + Math.sin(a) * (ry + 5);
            if (i === 0) build.moveTo(px, py);
            else build.lineTo(px, py);
          }
          build.stroke({ width: 2.5, color: C.honey });
        }
        antsG.clear();
        for (const a of ants) {
          if (!reduced) {
            if (a.pause > 0) a.pause -= dt;
            else {
              a.d += a.dir * a.speed * (dt / 1000) * (a.soldier ? 0.35 : 1);
              if (a.d >= a.total) { a.d = a.total; a.dir = -1; a.pause = a.soldier ? 400 : 600 + Math.random() * 1200; }
              if (a.d <= 0) { a.d = 0; a.dir = 1; a.pause = a.soldier ? 400 : 300; }
            }
          }
          const [px, py, heading] = antPos(a);
          const still = reduced || a.pause > 0;
          drawAnt(antsG, art.frames, a.soldier ? 'soldier' : 'worker', px, py, heading, { frame: still ? 1 : walkFrame(a.d) });
        }
        fx.draw(dt, dataRef.current);
      };
      draw(0);
      if (!reduced) {
        tickFn = (tk) => draw(Math.min(100, tk.deltaMS));
        app.ticker.add(tickFn);
      } else {
        const iv = setInterval(() => draw(0), 1000);
        app.ticker.add(() => {}); // keep renderer alive
        (app as any).__iv = iv;
      }
      if (previous && previous !== app) destroyApp(previous);
    })();
    return () => {
      disposed = true;
      offMoments?.();
      // the scene on screen stays until its replacement is ready (or the view unmounts)
      if (appRef.current !== app && app.renderer) destroyApp(app);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, chambersKey, buildKey, antBucket, JSON.stringify(research), colony?.id, reduced, hour]);

  if (!colony) return null;
  const { w, h } = size;
  const geo = w ? geometry(w, h) : null;
  const visible = CHAMBER_IDS.filter((id) => lvl(colony.chambers, id) > 0 || isUnlocked(CHAMBERS[id].unlock, colony.chambers, research));
  const entranceX = geo ? geo.shaftX(SURFACE * h) : 0;
  const cap = storageCapacity(colony.chambers);
  const qEnd = queueEndsAt(colony.unitQueue);
  const raising = colony.unitQueue.reduce((s, i) => s + i.count - i.done, 0);
  const rj = state?.player.researchJob;

  /** What a chamber is busy with, shown under its name. */
  const chamberTag = (id: ChamberId, level: number): { text: string; tone: string } | null => {
    const job = colony.buildJob;
    if (job?.chamber === id) return { text: `Digging · ${fmtDuration(job.endAt - now)}`, tone: 'dig' };
    if (level === 0) return null;
    if (id === 'pheromone_chamber' && rj) return { text: `${RESEARCH[rj.research as ResearchId].name} · ${fmtDuration(rj.endAt - now)}`, tone: 'learn' };
    if (id === 'brood_hall' && qEnd) return { text: `Raising ${raising} · ${fmtDuration(qEnd - now)}`, tone: 'brood' };
    const r = STORE_OF[id];
    if (r) {
      const pct = Math.floor((colony.resources[r] / cap[r]) * 100);
      return pct >= 100 ? { text: 'Full', tone: 'full' } : { text: `${pct}% full`, tone: 'store' };
    }
    return null;
  };

  // timers float over the parties on the surface; parties close together take turns on two rows
  const parties: (SurfaceParty & { row: number; tx: number })[] = [];
  if (geo && state) {
    let lastX = -1e9;
    let lastRow = 1;
    for (const p of surfaceParties(w, entranceX, colony, state, now).sort((a, b) => a.x - b.x)) {
      const tx = Math.max(56, Math.min(w - 56, p.x));
      const row = tx - lastX < 120 ? 1 - lastRow : 0;
      parties.push({ ...p, row, tx });
      lastX = tx;
      lastRow = row;
    }
  }
  const partyLabel = (p: SurfaceParty) =>
    p.kind === 'raid' ? 'Raid' : p.kind === 'scout' ? 'Scouts' : p.kind === 'delivery' ? 'Delivery' : `${MISSION_LABEL[p.type as MissionType] ?? p.type}${p.outbound ? '' : ' home'}`;

  return (
    <>
    <div className="nest" ref={host} style={{ height: h || 380 }}>
      {geo &&
        visible.map((id) => {
          const level = lvl(colony.chambers, id);
          const { x, y } = LAYOUT[id];
          const { rx, ry } = geo.size(id, level);
          const building = colony.buildJob?.chamber === id;
          const tag = chamberTag(id, level);
          return (
            <button
              key={id}
              className={`nest-chamber${level === 0 ? ' ghost' : ''}${building ? ' building' : ''}${selected === id ? ' selected' : ''}`}
              style={{ left: x * w - rx, top: y * h - ry, width: rx * 2, height: ry * 2 }}
              onClick={() => setSelected(selected === id ? null : id)}
              aria-label={`${CHAMBERS[id].name}${level ? `, level ${level}` : ', not built yet'}${tag ? `, ${tag.text}` : ''}. Show details.`}
              aria-expanded={selected === id}
            >
              <span className="nest-label">
                <span>
                  {CHAMBERS[id].name.replace("Queen's Chamber", 'Queen')}
                  {level > 0 ? ` ${level}` : ''}
                </span>
                {tag && <span className={`nest-tag ${tag.tone}`}>{tag.text}</span>}
              </span>
            </button>
          );
        })}
      <button
        type="button"
        className="nest-motion"
        onClick={() => setMotionPref(NEXT_MOTION[motion])}
        title="Auto follows your device's reduce-motion setting"
        aria-label={`Animation: ${motion}${motion === 'auto' ? (reduced ? ' (still)' : ' (moving)') : ''}. Click to change.`}
      >
        Motion: {motion}
      </button>
      {geo && (
        <span className="nest-sign" style={{ left: entranceX + 14, top: SURFACE * h + 6 }} title={colony.name}>
          {colony.name}
        </span>
      )}
      {parties.map((p) => (
        <span key={p.key} className={`nest-trip ${p.kind}`} style={{ left: p.tx, top: SURFACE * h - 30 - p.row * 20 }}>
          {partyLabel(p)} · {fmtDuration(p.endAt - now)}
        </span>
      ))}
      {closeUp && <ChamberCloseUp id={closeUp} onClose={() => setCloseUp(null)} onOpenChambers={() => setCloseUp(null)} />}
    </div>
    {selected && !closeUp && (
      <ChamberSheet id={selected} onClose={() => setSelected(null)} onLookInside={() => setCloseUp(selected)} onAllChambers={() => nav('chambers')} />
    )}
    </>
  );
}

