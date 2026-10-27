// Shared layout, colours and geometry for the Nest View and its effects layer (nestFx.ts).
import { Graphics } from 'pixi.js';
import type { ChamberId } from '@hormigas/shared';

export const SURFACE = 0.11;
export const LAYOUT: Record<ChamberId, { x: number; y: number }> = {
  leaf_garden: { x: 0.17, y: 0.27 },
  hunting_grounds: { x: 0.83, y: 0.27 },
  excavation_works: { x: 0.66, y: 0.38 },
  nursery: { x: 0.3, y: 0.43 },
  pheromone_chamber: { x: 0.8, y: 0.5 },
  aphid_pasture: { x: 0.11, y: 0.57 },
  brood_hall: { x: 0.66, y: 0.63 },
  granary: { x: 0.3, y: 0.71 },
  larder: { x: 0.87, y: 0.75 },
  nectar_cellar: { x: 0.12, y: 0.85 },
  queen_chamber: { x: 0.5, y: 0.86 },
  honeypot_gallery: { x: 0.8, y: 0.92 },
};

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

export const FLECK: Partial<Record<ChamberId, number>> = {
  leaf_garden: C.leaf, granary: C.leaf, hunting_grounds: C.protein, larder: C.protein,
  aphid_pasture: C.honey, nectar_cellar: C.honey, honeypot_gallery: C.honey,
};

export type Pt = [number, number];

export function geometry(w: number, h: number) {
  const shaftX = (y: number) => w * 0.5 + Math.sin(y * 0.045) * 5;
  const size = (id: ChamberId, level: number) => {
    const base = id === 'queen_chamber' ? 1.25 : 1;
    const grow = level > 0 ? 1 + Math.min(0.7, Math.sqrt(level) * 0.12) : 1;
    return { rx: Math.min(w * 0.075, 30) * base * grow, ry: Math.min(h * 0.045, 13) * base * grow };
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
