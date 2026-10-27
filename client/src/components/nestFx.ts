// Nest View effects (docs/12-ui-nest-view.md, "Showing what happens"): everything that moves because
// something is going on. Two layers: `under` sits below the walking ants (storage, eggs, digging,
// research), `over` sits above them (parties on the surface, raid alarm, one-off moments).
import { Graphics } from 'pixi.js';
import { lvl, storageCapacity, workforce, type ChamberId, type ChamberLevels, type ResourceId, type Resources } from '@hormigas/shared';
import type { ServerColony, ServerState } from '../game';
import type { Moment } from '../moments';
import { C, LAYOUT, SURFACE, sampler, type Geo, type Pt } from './nestScene';

const FX = {
  enemy: 0xd0453a,
  scoutEnemy: 0xe08a7a,
  soil: 0x8a6a4a,
  egg: 0xf3ead8,
  scent: 0xb58ad8,
  beetle: 0x8a5a30,
  rain: 0x9fb7c9,
  wing: 0xdfe8f0,
};
const RES_COLOR: Record<ResourceId, number> = { foliage: C.leaf, protein: C.protein, nectar: C.honey };
const STORE_FOR: Record<ResourceId, ChamberId> = { foliage: 'granary', protein: 'larder', nectar: 'nectar_cellar' };
const PRODUCERS: ChamberId[] = ['leaf_garden', 'hunting_grounds', 'aphid_pasture'];

export interface FxData {
  colony: ServerColony | null;
  state: ServerState | null;
  now: number;
}

interface Transient {
  t: number;
  dur: number;
  draw: (g: Graphics, t: number, k: number) => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const ease = (k: number) => k * k * (3 - 2 * k);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Is `a` to the left of `b` in world order (region, patch, spot)? */
function leftOf(a: { region: number; patch: number; spot: number }, b: { region: number; patch: number; spot: number }) {
  if (a.region !== b.region) return a.region < b.region;
  if (a.patch !== b.patch) return a.patch < b.patch;
  return a.spot < b.spot;
}

export function createFx(w: number, h: number, geo: Geo, chambers: ChamberLevels, reduced: boolean) {
  const under = new Graphics();
  const over = new Graphics();
  const surfaceY = SURFACE * h - 2;
  const entrance: Pt = [geo.shaftX(SURFACE * h), surfaceY];
  const built = (id: ChamberId) => lvl(chambers, id) > 0;
  const first = (...ids: ChamberId[]): ChamberId => ids.find(built) ?? 'queen_chamber';
  const centre = (id: ChamberId): Pt => [LAYOUT[id].x * w, LAYOUT[id].y * h];
  const sz = (id: ChamberId) => geo.size(id, lvl(chambers, id));
  /** From the entrance down to a chamber. */
  const down = (id: ChamberId) => sampler([entrance, ...geo.pathTo(id)]);
  /** From a chamber up to the entrance. */
  const up = (id: ChamberId) => sampler([...geo.pathTo(id)].reverse().concat([entrance]));

  let clock = 0;
  const transients: Transient[] = [];
  const particles: Particle[] = [];
  let dustTimer = 0;
  let hatching = false;

  const add = (dur: number, draw: Transient['draw']) => {
    if (!reduced) transients.push({ t: 0, dur, draw });
  };

  // ---------- one-off moments ----------

  /** A line of ants walking a path, one after another; optional coloured load above each. */
  const column = (path: ReturnType<typeof sampler>, n: number, ms: number, load?: (i: number) => number | null, gap = 110) => {
    add(ms + n * gap + 200, (g, t) => {
      for (let i = 0; i < n; i++) {
        const k = clamp01((t - i * gap) / ms);
        if (k <= 0 || k >= 1) continue;
        const [x, y] = path.at(path.total * ease(k));
        g.circle(x, y, 2).fill(C.ant);
        const col = load?.(i);
        if (col != null) g.circle(x, y - 2.6, 1.4).fill(col);
      }
    });
  };

  const ring = (id: ChamberId, color: number, delay = 0, dur = 1500, grow = 14) => {
    const [x, y] = centre(id);
    const { rx, ry } = sz(id);
    add(dur + delay, (g, t) => {
      const k = clamp01((t - delay) / dur);
      if (k <= 0 || k >= 1) return;
      g.ellipse(x, y, rx + 2 + grow * k, ry + 2 + grow * 0.6 * k).stroke({ width: 2.5 * (1 - k) + 0.5, color, alpha: 1 - k });
    });
  };

  function push(m: Moment) {
    switch (m.kind) {
      case 'depart':
        column(up(first('brood_hall', 'queen_chamber')), Math.min(10, Math.max(3, Math.ceil(m.units / 6))), 1500);
        break;
      case 'return': {
        const kinds = (Object.keys(m.cargo) as ResourceId[]).filter((r) => m.cargo[r] > 0);
        if (kinds.length === 0) {
          column(down(first('brood_hall', 'queen_chamber')), Math.min(8, Math.max(3, Math.ceil(m.units / 6))), 1800);
          break;
        }
        // one line per resource, each to its storage chamber
        kinds.forEach((r, j) => {
          const n = Math.min(8, Math.max(3, Math.ceil(m.units / 6 / kinds.length)));
          const path = down(first(STORE_FOR[r]));
          setTimeout(() => column(path, n, 2000, () => RES_COLOR[r]), j * 500);
        });
        break;
      }
      case 'levelup':
        if (LAYOUT[m.chamber as ChamberId]) {
          ring(m.chamber as ChamberId, C.honey);
          ring(m.chamber as ChamberId, C.honey, 350);
        }
        break;
      case 'units': {
        if (hatching) break; // one at a time, however fast they hatch
        hatching = true;
        const from = first('brood_hall', 'queen_chamber');
        const path = up(from);
        ring(from, FX.egg, 0, 700, 6);
        add(1200, (g, t, k) => {
          const [x, y] = path.at(path.total * 0.35 * ease(k));
          g.circle(x, y, 2).fill(C.ant);
          if (k >= 0.99 || t >= 1190) hatching = false;
        });
        setTimeout(() => (hatching = false), 1400);
        break;
      }
      case 'nest_event':
        nestEvent(m.event);
        break;
    }
  }

  function nestEvent(id: string) {
    switch (id) {
      case 'lost_beetle': {
        // walks in from the side, then gets dragged down to the larder
        const side = Math.random() < 0.5 ? -12 : w + 12;
        const path = down(first('larder', 'hunting_grounds'));
        add(5200, (g, t) => {
          let x: number, y: number;
          if (t < 1300) {
            x = lerp(side, entrance[0], ease(t / 1300));
            y = surfaceY - 1;
          } else {
            [x, y] = path.at(path.total * ease(clamp01((t - 1300) / 3600)));
          }
          if (t > 4900) return;
          g.ellipse(x, y, 5.5, 3.6).fill(FX.beetle).stroke({ width: 1, color: 0xc89060 });
          if (t >= 1300) for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 + t / 300;
            g.circle(x + Math.cos(a) * 7, y + Math.sin(a) * 4.5, 1.8).fill(C.ant);
          }
        });
        break;
      }
      case 'aphid_boom': {
        const where = first('aphid_pasture', 'nectar_cellar');
        const [cx, cy] = centre(where);
        const { rx, ry } = sz(where);
        const pts = Array.from({ length: 16 }, () => [cx + (Math.random() - 0.5) * rx * 1.8, cy + (Math.random() - 0.5) * ry * 1.4, Math.random() * 1200] as const);
        add(3800, (g, t) => {
          for (const [x, y, d] of pts) {
            const k = clamp01((t - d) / 2400);
            if (k <= 0 || k >= 1) continue;
            g.circle(x, y - k * 10, 1.6 + Math.sin(k * Math.PI) * 1.2).fill({ color: C.honey, alpha: Math.sin(k * Math.PI) });
          }
        });
        break;
      }
      case 'leaf_fall': {
        const leaves = Array.from({ length: 10 }, (_, i) => ({ x: entrance[0] + (Math.random() - 0.5) * 90, d: i * 120, sway: Math.random() * 6 }));
        add(2400, (g, t) => {
          for (const l of leaves) {
            const k = clamp01((t - l.d) / 1500);
            if (k <= 0) continue;
            const y = lerp(-6, surfaceY - 1, ease(k));
            g.ellipse(l.x + Math.sin(t / 180 + l.sway) * (1 - k) * 6, y, 2.6, 1.4).fill(C.leaf);
          }
        });
        setTimeout(() => column(down(first('granary', 'leaf_garden')), 5, 2000, () => C.leaf), 2000);
        break;
      }
      case 'rain_drums': {
        const drops = Array.from({ length: 70 }, () => ({ x: Math.random() * w, d: Math.random() * 5000, s: 0.12 + Math.random() * 0.08 }));
        add(5800, (g, t) => {
          const k = Math.sin(clamp01(t / 5800) * Math.PI);
          g.rect(0, SURFACE * h, w, h - SURFACE * h).fill({ color: 0x000000, alpha: 0.12 * k });
          for (const dr of drops) {
            const y = ((t - dr.d) * dr.s) % (surfaceY + 10);
            if (t < dr.d || y < 0) continue;
            g.moveTo(dr.x, y).lineTo(dr.x - 1, y + 5).stroke({ width: 1, color: FX.rain, alpha: 0.7 * k });
          }
        });
        break;
      }
      case 'nuptial_flight': {
        const side = Math.random() < 0.5 ? 0.2 : 0.8;
        const fliers = Array.from({ length: 12 }, (_, i) => ({ x: side * w + (Math.random() - 0.5) * 50, d: i * 180, drift: (Math.random() - 0.5) * 50 }));
        add(4400, (g, t) => {
          for (const f of fliers) {
            const k = clamp01((t - f.d) / 2400);
            if (k <= 0 || k >= 1) continue;
            const x = f.x + f.drift * k + Math.sin(t / 90 + f.d) * 1.5;
            const y = lerp(surfaceY, -8, k);
            const flap = 1 + Math.abs(Math.sin(t / 50 + f.d)) * 1.6;
            g.ellipse(x - 2, y - 1, 2.2, flap).fill({ color: FX.wing, alpha: 0.7 });
            g.ellipse(x + 2, y - 1, 2.2, flap).fill({ color: FX.wing, alpha: 0.7 });
            g.circle(x, y, 1.6).fill(C.soldier);
          }
        });
        break;
      }
      case 'old_tunnel': {
        const from = first('excavation_works', 'nursery', 'queen_chamber');
        const [x0, y0] = centre(from);
        const dir = x0 < w / 2 ? -1 : 1;
        const pts = Array.from({ length: 18 }, (_, i) => [x0 + dir * i * 6, y0 + Math.sin(i * 0.6) * 6 + i * 0.8] as const);
        add(4200, (g, t) => {
          const alpha = Math.sin(clamp01(t / 4200) * Math.PI);
          const shown = Math.min(pts.length, Math.floor(t / 90));
          for (let i = 0; i < shown; i++) g.circle(pts[i][0], pts[i][1], 1.6).fill({ color: C.rim, alpha });
          const scout = pts[Math.min(shown, pts.length - 1)];
          if (scout) g.circle(scout[0], scout[1], 2).fill({ color: C.ant, alpha });
        });
        break;
      }
    }
  }

  // ---------- every frame ----------

  function draw(dt: number, d: FxData) {
    clock += reduced ? 0 : dt;
    under.clear();
    over.clear();
    const c = d.colony;
    if (!c || !d.state) return;
    const t = clock;

    // storage chambers fill up with what they hold, and glow when full
    const cap = storageCapacity(c.chambers);
    for (const r of Object.keys(STORE_FOR) as ResourceId[]) {
      const id = STORE_FOR[r];
      if (!built(id)) continue;
      const f = clamp01(c.resources[r] / cap[r]);
      const [x, y] = centre(id);
      const { rx, ry } = sz(id);
      fillEllipse(under, x, y, rx - 1.5, ry - 1.5, f, RES_COLOR[r], 0.38);
      if (f >= 0.999) under.ellipse(x, y, rx + 2, ry + 2).stroke({ width: 2, color: RES_COLOR[r], alpha: reduced ? 0.8 : 0.45 + 0.4 * Math.sin(t / 280) });
    }

    // short of workers: production chambers go dim
    const wf = workforce(c.chambers);
    if (wf.ratio < 1) {
      for (const id of PRODUCERS) {
        if (!built(id)) continue;
        const [x, y] = centre(id);
        const { rx, ry } = sz(id);
        under.ellipse(x, y, rx, ry).fill({ color: 0x000000, alpha: (1 - wf.ratio) * 0.55 });
      }
    }

    // eggs in the Brood Hall while units are being raised
    const left = c.unitQueue.reduce((s, i) => s + i.count - i.done, 0);
    if (left > 0) {
      const id = first('brood_hall', 'queen_chamber');
      const [x, y] = centre(id);
      const { ry } = sz(id);
      const n = Math.min(9, left);
      for (let i = 0; i < n; i++) {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const ex = x + (col - 1) * 6 + (row % 2) * 3;
        const ey = y + ry * 0.35 - row * 4;
        under.ellipse(ex, ey, 2.4, 1.7).fill({ color: FX.egg, alpha: reduced ? 0.9 : 0.7 + 0.3 * Math.sin(t / 380 + i) });
      }
    }

    // research: scent rings from the Pheromone Chamber
    if (d.state.player.researchJob && built('pheromone_chamber')) {
      const [x, y] = centre('pheromone_chamber');
      const { rx, ry } = sz('pheromone_chamber');
      for (const off of [0, 0.5]) {
        const k = reduced ? 0.5 : ((t / 2000 + off) % 1);
        under.ellipse(x, y, rx * (0.3 + 0.9 * k), ry * (0.3 + 0.9 * k)).stroke({ width: 1.5, color: FX.scent, alpha: (1 - k) * 0.7 });
      }
    }

    // digging: diggers on the rim, soil flying
    const job = c.buildJob;
    if (job && LAYOUT[job.chamber as ChamberId]) {
      const id = job.chamber as ChamberId;
      const [x, y] = centre(id);
      const { rx, ry } = geo.size(id, job.level);
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i - 1) * 0.9 + (reduced ? 0 : Math.sin(t / 260 + i * 2) * 0.35);
        under.circle(x + Math.cos(a) * (rx + 1), y + Math.sin(a) * (ry + 1), 2).fill(C.ant);
      }
      if (!reduced) {
        dustTimer += dt;
        while (dustTimer > 180) {
          dustTimer -= 180;
          const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
          particles.push({ x: x + Math.cos(a) * rx, y: y + Math.sin(a) * ry, vx: Math.cos(a) * 25, vy: -25 - Math.random() * 20, life: 700 });
        }
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += 90 * (dt / 1000);
      p.x += p.vx * (dt / 1000);
      p.y += p.vy * (dt / 1000);
      under.circle(p.x, p.y, 1.3).fill({ color: FX.soil, alpha: Math.min(1, p.life / 300) });
    }

    // parties on the surface: ours heading out and coming home, others heading for us
    const home = c.coords;
    let lane = 0;
    for (const m of d.state.missions ?? []) {
      if (m.originColonyId !== c.id) continue;
      const toLeft = leftOf(m.target, home);
      const edge = toLeft ? -8 : w + 8;
      const out = m.status === 'outbound';
      const k = out ? clamp01((d.now - m.departAt) / (m.arriveAt - m.departAt)) : clamp01((d.now - m.arriveAt) / (m.returnAt - m.arriveAt));
      const x = out ? lerp(entrance[0] + 10 * (toLeft ? -1 : 1), edge, k) : lerp(edge, entrance[0], k);
      const heading = out === toLeft ? -1 : 1;
      const units = Object.values(m.units as Record<string, number>).reduce((a, b) => a + b, 0);
      const cargo = (m.cargo ?? {}) as Resources;
      const loads = out ? [] : (Object.keys(RES_COLOR) as ResourceId[]).filter((r) => (cargo[r] ?? 0) > 0).map((r) => RES_COLOR[r]);
      party(over, x, surfaceY - (lane++ % 3) * 1.5, heading, Math.min(8, Math.max(2, Math.ceil(units / 8))), C.ant, loads, t);
    }
    let raid = false;
    for (const i of d.state.incoming ?? []) {
      if (i.targetColonyId !== c.id) continue;
      const fromLeft = leftOf(i.origin, home);
      const edge = fromLeft ? -8 : w + 8;
      const k = i.departAt ? clamp01((d.now - i.departAt) / (i.arriveAt - i.departAt)) : 0.5;
      const x = lerp(edge, entrance[0] + 12 * (fromLeft ? -1 : 1), k);
      const color = i.type === 'raid' ? FX.enemy : i.type === 'scout' ? FX.scoutEnemy : C.ant;
      const n = i.type === 'raid' ? Math.min(10, Math.max(3, Math.ceil(i.unitCount / 6))) : 2;
      party(over, x, surfaceY - (lane++ % 3) * 1.5, fromLeft ? 1 : -1, n, color, [], t);
      if (i.type === 'raid') raid = true;
    }
    if (raid) {
      const pulse = reduced ? 0.6 : 0.4 + 0.35 * Math.sin(t / 220);
      over.ellipse(entrance[0], entrance[1] + 3, 15, 7).stroke({ width: 2, color: FX.enemy, alpha: pulse });
    }

    // one-off moments
    for (let i = transients.length - 1; i >= 0; i--) {
      const tr = transients[i];
      tr.t += dt;
      if (tr.t >= tr.dur) {
        transients.splice(i, 1);
        continue;
      }
      tr.draw(over, tr.t, tr.t / tr.dur);
    }
  }

  return { under, over, push, draw };
}

/** A small group walking along the surface; the leader is at x. */
function party(g: Graphics, x: number, y: number, heading: number, n: number, color: number, loads: number[], t: number) {
  for (let i = 0; i < n; i++) {
    const px = x - heading * i * 5;
    const py = y + Math.sin(t / 110 + i * 1.7) * 0.6;
    g.circle(px, py, 2).fill(color);
    if (loads.length) g.circle(px, py - 2.6, 1.3).fill(loads[i % loads.length]);
  }
}

/** Fill the bottom fraction `f` of an ellipse. */
function fillEllipse(g: Graphics, x: number, y: number, rx: number, ry: number, f: number, color: number, alpha: number) {
  if (f <= 0.01) return;
  const top = y + ry - 2 * ry * f;
  // half-width of the ellipse at the fill line: points above the line are pulled onto it, inside the shape
  const hw = rx * Math.sqrt(Math.max(0, 1 - ((top - y) / ry) ** 2));
  const pts: number[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const px = x + Math.cos(a) * rx;
    const py = y + Math.sin(a) * ry;
    if (py >= top) pts.push(px, py);
    else pts.push(Math.max(x - hw, Math.min(x + hw, px)), top);
  }
  g.poly(pts).fill({ color, alpha });
}
