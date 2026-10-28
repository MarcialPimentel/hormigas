// The 3D nest's layout (docs/12-ui-nest-view.md, "The 3D slab"): where each chamber sits on the cut face of
// the block, how big its hollow is at its level, the outlines carved into the face (chambers, the shaft and
// the tunnels), and the paths ants walk. Plain numbers in slab units, no Three.js.
//
// The face is W wide and H deep, with the surface at y = 0 and the block going down to y = -H. Hollows are
// carved D deep. Chambers below the top of the Queen's Chamber hang off the queen's sides; the rest branch
// off the shaft. The layout keeps every hollow and tunnel clear of the others at any level.
import type { ChamberId } from '@hormigas/shared';

export const W = 52;
export const H = 28;
export const D = 2.4;
export const BACK = 13;
export const SHAFT_HW = 0.7;
export const TUN_H = 0.55;
const GAP = 0.06;
/** Where ants walk inside the hollows (mid-depth). */
export const ZS = -D / 2;

export const shaftX = (y: number) => 0.55 * Math.sin(y * 0.23);

export interface Spot {
  x: number;
  y: number;
  /** reached through the Queen's Chamber (deeper than its top) */
  viaQueen?: boolean;
}
export const SPOTS: Record<ChamberId, Spot> = {
  leaf_garden: { x: -16, y: -4.6 },
  hunting_grounds: { x: 16.5, y: -4.6 },
  excavation_works: { x: 8.5, y: -8.6 },
  nursery: { x: -9, y: -9.4 },
  pheromone_chamber: { x: 15.5, y: -13.4 },
  aphid_pasture: { x: -18, y: -14.2 },
  brood_hall: { x: 7.5, y: -16.8 },
  granary: { x: -9, y: -18.6 },
  larder: { x: 17.5, y: -19.8 },
  nectar_cellar: { x: -18.5, y: -23.4, viaQueen: true },
  queen_chamber: { x: 0, y: -23 },
  honeypot_gallery: { x: 13, y: -25.2, viaQueen: true },
};

export interface Room extends Spot {
  id: ChamberId;
  rx: number;
  ry: number;
}

/** A chamber's hollow grows with level, quickly at first, and stops before it could touch a neighbour. */
export function room(id: ChamberId, level: number): Room {
  const s = SPOTS[id];
  const lv = Math.max(1, level);
  if (id === 'queen_chamber') return { id, ...s, rx: 3.9 + Math.min(0.6, lv * 0.05), ry: 2.0 + Math.min(0.4, lv * 0.03) };
  return { id, ...s, rx: 2.9 + Math.min(1.0, lv * 0.08), ry: 1.5 + Math.min(0.5, lv * 0.04) };
}

export const halfWidth = (r: Room, y: number) => {
  const k = 1 - ((y - r.y) / r.ry) ** 2;
  return k > 0 ? r.rx * Math.sqrt(k) : 0;
};
/** The floor of a hollow under x. */
export const floorAt = (r: Room, x: number) => r.y - r.ry * Math.sqrt(Math.max(0, 1 - ((x - r.x) / r.rx) ** 2));

type Pt = [number, number];

function ellipse(r: Room): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const k = 0.975 + 0.025 * Math.sin(a * 5 + r.x); // hand-dug, only ever inward
    pts.push([r.x + Math.cos(a) * r.rx * k, r.y + Math.sin(a) * r.ry * k]);
  }
  return pts;
}

function shaft(q: Room): Pt[] {
  const top = (x: number) => q.y + q.ry * Math.sqrt(Math.max(0, 1 - ((x - q.x) / q.rx) ** 2));
  const xc = shaftX(q.y + q.ry);
  const xl = xc - SHAFT_HW, xr = xc + SHAFT_HW, yl = top(xl) + GAP, yr = top(xr) + GAP;
  const left: Pt[] = [], right: Pt[] = [];
  for (let y = -0.08; y > yl + 0.3; y -= 0.5) left.push([shaftX(y) - SHAFT_HW, y]);
  left.push([xl, yl]);
  const arc: Pt[] = [];
  for (let i = 1; i < 8; i++) {
    const x = xl + ((xr - xl) * i) / 8;
    arc.push([x, top(x) + GAP]);
  }
  for (let y = -0.08; y > yr + 0.3; y -= 0.5) right.push([shaftX(y) + SHAFT_HW, y]);
  right.push([xr, yr]);
  return [...left, ...arc, ...right.reverse()];
}

/** A level tunnel from the shaft to a chamber's side, its ends shaped to the shaft and the hollow. */
function branch(r: Room): Pt[] {
  const s = Math.sign(r.x - shaftX(r.y)), top = r.y + TUN_H, bot = r.y - TUN_H;
  const startX = (y: number) => shaftX(y) + s * (SHAFT_HW + GAP);
  const endX = (y: number) => r.x - s * (halfWidth(r, y) + GAP);
  const pts: Pt[] = [[startX(top), top], [endX(top), top]];
  for (let i = 1; i < 6; i++) {
    const y = top - ((top - bot) * i) / 6;
    pts.push([endX(y), y]);
  }
  pts.push([endX(bot), bot], [startX(bot), bot]);
  return pts;
}

/** A sloping tunnel from the side of the Queen's Chamber to a deeper chamber. */
function queenBranch(q: Room, r: Room): Pt[] {
  const s = Math.sign(r.x), ya = q.y + 0.2, yb = r.y;
  const qx = (y: number) => q.x + s * (halfWidth(q, y) + GAP), cx = (y: number) => r.x - s * (halfWidth(r, y) + GAP);
  const pts: Pt[] = [[qx(ya + TUN_H), ya + TUN_H], [cx(yb + TUN_H), yb + TUN_H]];
  for (let i = 1; i < 6; i++) {
    const y = yb + TUN_H - (2 * TUN_H * i) / 6;
    pts.push([cx(y), y]);
  }
  pts.push([cx(yb - TUN_H), yb - TUN_H], [qx(ya - TUN_H), ya - TUN_H]);
  for (let i = 1; i < 6; i++) {
    const y = ya - TUN_H + (2 * TUN_H * i) / 6;
    pts.push([qx(y), y]);
  }
  return pts;
}

/** Every outline carved into the face for these built chambers (the Queen's Chamber is always built). */
export function carve(rooms: Room[]): Pt[][] {
  const q = rooms.find((r) => r.id === 'queen_chamber') ?? room('queen_chamber', 1);
  const out: Pt[][] = [shaft(q), ellipse(q)];
  for (const r of rooms) {
    if (r.id === 'queen_chamber') continue;
    out.push(ellipse(r), r.viaQueen ? queenBranch(q, r) : branch(r));
  }
  return out;
}

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** The walk from the entrance down the shaft, along the tunnel, onto a chamber's floor. */
export function pathTo(r: Room, q: Room, surfaceY: number, z = ZS): P3[] {
  const P = (x: number, y: number): P3 => ({ x, y, z });
  const pts: P3[] = [P(shaftX(0), surfaceY), P(shaftX(-0.4), -0.4)];
  const toQueen = r.viaQueen || r.id === 'queen_chamber';
  const shaftEnd = toQueen ? q.y + q.ry - 0.3 : r.y - TUN_H + 0.12;
  for (let y = -1; y > shaftEnd; y -= 1) pts.push(P(shaftX(y), y));
  if (r.id === 'queen_chamber') {
    pts.push(P(shaftX(shaftEnd), floorAt(q, shaftX(shaftEnd)) + 0.08), P(q.x + 1.6, floorAt(q, q.x + 1.6) + 0.06));
    return pts;
  }
  if (r.viaQueen) {
    const s = Math.sign(r.x), ex = q.x + s * (halfWidth(q, q.y + 0.2 - TUN_H) + 0.2);
    pts.push(P(shaftX(shaftEnd), floorAt(q, shaftX(shaftEnd)) + 0.08), P(q.x + s * 2, floorAt(q, q.x + s * 2) + 0.06), P(ex, q.y + 0.2 - TUN_H + 0.1));
  } else pts.push(P(shaftX(shaftEnd), shaftEnd));
  const s = Math.sign(r.x - shaftX(r.y));
  pts.push(P(r.x - s * r.rx, r.y - TUN_H + 0.12));
  const mid = r.x - s * r.rx * 0.1;
  pts.push(P(mid, floorAt(r, mid) + 0.06));
  return pts;
}
