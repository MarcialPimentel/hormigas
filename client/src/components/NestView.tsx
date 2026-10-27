// Schematic cross-section of the nest (docs/12-ui-nest-view.md), drawn with PixiJS.
// Chambers grow with level, tunnels link them to the entrance, and dots are ants going about their work.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Application, Graphics } from 'pixi.js';
import { C, FLECK, LAYOUT, SURFACE, dottedEllipse, drawPolyline, geometry, lerpColor, seeded, type Pt } from './nestScene';
import { createFx } from './nestFx';
import { onMoment } from '../moments';
import { CHAMBERS, CHAMBER_IDS, isUnlocked, lvl, type ChamberId } from '@hormigas/shared';
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

function antPos(a: Ant): Pt {
  const { path, lens } = a;
  let i = 1;
  while (i < lens.length - 1 && lens[i] < a.d) i++;
  const seg = lens[i] - lens[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (a.d - lens[i - 1]) / seg));
  return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t];
}

function destroyApp(app: Application) {
  if ((app as any).__dead) return;
  (app as any).__dead = true;
  try {
    if ((app as any).__iv) clearInterval((app as any).__iv);
    app.destroy(true, { children: true });
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
  const reduced = useMemo(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches, []);

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
      setSize({ w, h: w < 520 ? 280 : 330 });
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
      if (disposed) {
        app.destroy(true);
        return;
      }
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
      bg.rect(0, 0, w, SURFACE * h).fill(0x231a14);
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
      const fx = createFx(w, h, geo, chambers, reduced);
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
          const [px, py] = antPos(a);
          antsG.circle(px, py, a.soldier ? 2.6 : 2).fill(a.soldier ? C.soldier : C.ant);
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
  }, [size.w, size.h, chambersKey, buildKey, antBucket, JSON.stringify(research), colony?.id]);

  if (!colony) return null;
  const { w, h } = size;
  const geo = w ? geometry(w, h) : null;
  const visible = CHAMBER_IDS.filter((id) => lvl(colony.chambers, id) > 0 || isUnlocked(CHAMBERS[id].unlock, colony.chambers, research));
  const away = (state?.missions ?? []).reduce((s: number, m: any) => s + Object.values(m.units as Record<string, number>).reduce((a, b) => a + b, 0), 0);

  return (
    <div className="nest" ref={host} style={{ height: h || 280 }}>
      {geo &&
        visible.map((id) => {
          const level = lvl(colony.chambers, id);
          const { x, y } = LAYOUT[id];
          const { rx, ry } = geo.size(id, level);
          const building = colony.buildJob?.chamber === id;
          return (
            <button
              key={id}
              className={`nest-chamber${level === 0 ? ' ghost' : ''}${building ? ' building' : ''}`}
              style={{ left: x * w - rx, top: y * h - ry, width: rx * 2, height: ry * 2 }}
              onClick={() => nav('chambers')}
              aria-label={`${CHAMBERS[id].name}${level ? `, level ${level}` : ', not built yet'}${building ? ', being dug' : ''}. Open chambers.`}
            >
              <span className="nest-label">
                {CHAMBERS[id].name.replace("Queen's Chamber", 'Queen')}
                {level > 0 ? ` ${level}` : ''}
              </span>
            </button>
          );
        })}
      {away > 0 && <span className="nest-away">{away.toLocaleString()} away on missions</span>}
    </div>
  );
}

