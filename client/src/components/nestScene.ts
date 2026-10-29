// Shared layout, colours and geometry for the Nest View and its effects layer (nestFx.ts).
import { Graphics } from 'pixi.js';
import type { ChamberId, Resources } from '@hormigas/shared';
import type { ServerColony, ServerState } from '../game';

/** Where the soil starts, as a fraction of the view's height. Above it: the sky and the surface. */
export const SURFACE = 0.15;
export const LAYOUT: Record<ChamberId, { x: number; y: number }> = {
  leaf_garden: { x: 0.17, y: 0.25 },
  hunting_grounds: { x: 0.83, y: 0.25 },
  excavation_works: { x: 0.66, y: 0.353 },
  nursery: { x: 0.3, y: 0.4 },
  pheromone_chamber: { x: 0.8, y: 0.466 },
  aphid_pasture: { x: 0.11, y: 0.531 },
  brood_hall: { x: 0.66, y: 0.588 },
  granary: { x: 0.3, y: 0.663 },
  larder: { x: 0.87, y: 0.7 },
  nectar_cellar: { x: 0.12, y: 0.794 },
  queen_chamber: { x: 0.5, y: 0.803 },
  honeypot_gallery: { x: 0.8, y: 0.86 },
};

/** The sky over the nest follows the player's own clock. */
export function skyAt(hour: number) {
  if (hour >= 6 && hour < 8) return { sky: 0x5a4a63, hills: 0x3f3447, body: 'sun' as const, bodyColor: 0xf0c27a, stars: false };
  if (hour >= 8 && hour < 17) return { sky: 0x4d6a86, hills: 0x3b5266, body: 'sun' as const, bodyColor: 0xf6e3b0, stars: false };
  if (hour >= 17 && hour < 20) return { sky: 0x4a3a52, hills: 0x34293b, body: 'sun' as const, bodyColor: 0xe89a5a, stars: false };
  return { sky: 0x1d2438, hills: 0x161b2a, body: 'moon' as const, bodyColor: 0xf3ead8, stars: true };
}

export const C = {
  soilTop: 0x3a2a1e,
  soilDeep: 0x271c14,
  strata: 0x45331f,
  grass: 0x8db255,
  hollow: 0x1a130e,
  rim: 0x4c3a2b,
  honey: 0xe8b23a,
  leaf: 0x8db255,
  protein: 0xd06a6a,
  ant: 0xefe4d2,
  soldier: 0xd8b48a,
};

export type Pt = [number, number];

export function geometry(w: number, h: number) {
  const shaftX = (y: number) => w * 0.5 + Math.sin(y * 0.045) * 5;
  const size = (id: ChamberId, level: number) => {
    const base = id === 'queen_chamber' ? 1.25 : 1;
    const grow = level > 0 ? 1 + Math.min(0.7, Math.sqrt(level) * 0.12) : 1;
    return { rx: Math.min(w * 0.075, 34) * base * grow, ry: Math.min(h * 0.042, 15) * base * grow };
  };
  const pathTo = (id: ChamberId): Pt[] => {
    const { x, y } = LAYOUT[id];
    const cx = x * w;
    const cy = y * h;
    const pts: Pt[] = [];
    for (let yy = SURFACE * h; yy < cy; yy += 6) pts.push([shaftX(yy), yy]);
    const sx = shaftX(cy);
    pts.push([sx, cy]);
    if (Math.abs(cx - sx) > 4) {
      // drooping branch from the shaft to the chamber
      const mx = (sx + cx) / 2;
      const my = cy + 10;
      for (let i = 1; i <= 14; i++) {
        const t = i / 14;
        const px = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * mx + t * t * cx;
        const py = (1 - t) * (1 - t) * cy + 2 * (1 - t) * t * my + t * t * cy;
        pts.push([px, py]);
      }
    }
    return pts;
  };
  return { shaftX, size, pathTo };
}

export type Geo = ReturnType<typeof geometry>;

/** Walk along a polyline by distance. */
export function sampler(path: Pt[]) {
  const lens = [0];
  for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const total = lens[lens.length - 1] || 1;
  const at = (d: number): Pt => {
    if (path.length === 1) return path[0];
    let i = 1;
    while (i < lens.length - 1 && lens[i] < d) i++;
    const seg = lens[i] - lens[i - 1] || 1;
    const t = Math.max(0, Math.min(1, (d - lens[i - 1]) / seg));
    return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t];
  };
  return { total, at };
}

// ---------- drawing helpers ----------

export function drawPolyline(g: Graphics, pts: Pt[], width: number, color: number, alpha = 1) {
  if (pts.length < 2) return;
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
}

export function dottedEllipse(g: Graphics, x: number, y: number, rx: number, ry: number, color: number, dots: number) {
  for (let i = 0; i < dots; i++) {
    const a = (i / dots) * Math.PI * 2;
    g.circle(x + Math.cos(a) * rx, y + Math.sin(a) * ry, 1.2).fill(color);
  }
}

export function lerpColor(a: number, b: number, t: number) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ---------- parties on the surface ----------

type Coords = { region: number; patch: number; spot: number };
/** Is `a` to the left of `b` in world order (region, patch, spot)? */
export function leftOf(a: Coords, b: Coords) {
  if (a.region !== b.region) return a.region < b.region;
  if (a.patch !== b.patch) return a.patch < b.patch;
  return a.spot < b.spot;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export interface SurfaceParty {
  key: string;
  /** leader's x on the surface */
  x: number;
  lane: number;
  heading: 1 | -1;
  kind: 'ours' | 'raid' | 'scout' | 'delivery';
  /** ants to draw */
  n: number;
  /** cargo when coming home */
  cargo: Resources | null;
  type: string;
  outbound: boolean;
  endAt: number;
}

/** Our parties out and back, and others heading for us: where they are on the surface right now. */
export function surfaceParties(w: number, entranceX: number, c: ServerColony, state: ServerState, now: number): SurfaceParty[] {
  const out: SurfaceParty[] = [];
  const home = c.coords;
  let lane = 0;
  for (const m of state.missions ?? []) {
    if (m.originColonyId !== c.id) continue;
    const toLeft = leftOf(m.target, home);
    const edge = toLeft ? -8 : w + 8;
    const ob = m.status === 'outbound';
    const k = ob ? clamp01((now - m.departAt) / (m.arriveAt - m.departAt)) : clamp01((now - m.arriveAt) / (m.returnAt - m.arriveAt));
    const x = ob ? lerp(entranceX + 10 * (toLeft ? -1 : 1), edge, k) : lerp(edge, entranceX, k);
    const units = Object.values(m.units as Record<string, number>).reduce((a, b) => a + b, 0);
    out.push({
      key: `m${m.id}`, x, lane: lane++, heading: ob === toLeft ? -1 : 1, kind: 'ours',
      n: Math.min(8, Math.max(2, Math.ceil(units / 8))), cargo: ob ? null : ((m.cargo ?? {}) as Resources),
      type: m.type, outbound: ob, endAt: ob ? m.arriveAt : m.returnAt,
    });
  }
  for (const i of state.incoming ?? []) {
    if (i.targetColonyId !== c.id) continue;
    const fromLeft = leftOf(i.origin, home);
    const edge = fromLeft ? -8 : w + 8;
    const k = i.departAt ? clamp01((now - i.departAt) / (i.arriveAt - i.departAt)) : 0.5;
    const x = lerp(edge, entranceX + 12 * (fromLeft ? -1 : 1), k);
    // an army-ant swarm (docs/20-swarms.md) walks in like a raid, only longer
    const kind = i.type === 'raid' || i.type === 'swarm' ? 'raid' : i.type === 'scout' ? 'scout' : 'delivery';
    out.push({
      key: `i${i.id}`, x, lane: lane++, heading: fromLeft ? 1 : -1, kind,
      n: kind === 'raid' ? Math.min(i.type === 'swarm' ? 16 : 10, Math.max(3, Math.ceil(i.unitCount / 6))) : 2, cargo: null,
      type: i.type, outbound: true, endAt: i.arriveAt,
    });
  }
  return out;
}
