// Stand-in chamber art (docs/18-art-direction.md, "Chambers"): each chamber is drawn side-on as a
// hand-dug hollow in three layers, all as plain SVG strings (no DOM) so the game and the preview
// sheet (art/chambers/build.ts) share them.
//
//   shell      packed-soil wall, the hollow, its floor, roots, the tunnel mouth
//   contents   what the chamber holds or does
//   signature  the one thing that names it at a glance
//
// Level 1 only for now. The viewBox is 200 × 120; the floor sits at FLOOR.

import type { ChamberId } from '@hormigas/shared';
import { CASTES, FOOT_Y, antBody, type Caste } from './ants';

export const VIEW = { w: 200, h: 120 };
const CX = 100;
const CY = 64;
const RX = 78;
const RY = 40;
/** Where things stand inside the hollow. */
export const FLOOR = CY + RY * 0.72;
/** The hollow's centre and radii in art units (to fit the art onto a chamber in the nest). */
export const HOLLOW = { cx: CX, cy: CY, rx: RX, ry: RY };

const SOIL = { wall: '#3a2b1f', wallDark: '#2e2218', hollow: '#1a130e', back: '#20170f', floor: '#2a1e14', rim: '#4c3a2b', root: '#5a4029', pebble: '#4a3828' };
const FOOD = { leaf: '#8db255', leafDark: '#5f7d36', protein: '#d06a6a', proteinDark: '#8f4141', honey: '#e8b23a', honeyDark: '#b9861d', honeyLight: '#fbe3a0' };

const f = (n: number) => +n.toFixed(2);

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** A closed, wobbly outline around (cx, cy): hand-dug, with a flattened floor. */
function blob(rnd: () => number, cx: number, cy: number, rx: number, ry: number, wobble: number, floorAt?: number) {
  const n = 26;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (rnd() - 0.5) * wobble;
    let x = cx + Math.cos(a) * rx * k;
    let y = cy + Math.sin(a) * ry * k;
    if (floorAt != null && y > floorAt) y = floorAt + (y - floorAt) * 0.25;
    pts.push([x, y]);
  }
  // Catmull-Rom through the points, as cubic Béziers
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + 'Z';
}

// ---------- small things ----------

/** Ants drawn so far in the chamber being drawn: each gets a stable key (its caste and order) so it can be named. */
let antCount = 0;

/**
 * An ant portrait standing on (x, y), `len` units long, facing right (or left). It carries
 * `data-ant` (caste) and `data-key` so the close-up can name it, and an invisible box to hover.
 */
export function ant(caste: Caste, x: number, y: number, len: number, left = false, extra = '') {
  const [vx, vy, vw, vh] = CASTES[caste].vb;
  const k = len / vw;
  const key = `${caste}-${antCount++}`;
  return `<g data-ant="${caste}" data-key="${key}" transform="translate(${f(x)} ${f(y)}) scale(${f(left ? -k : k)} ${f(k)}) translate(${f(-(vx + vw / 2))} ${-FOOT_Y})"><rect x="${vx}" y="${vy}" width="${vw}" height="${vh}" fill="transparent"/>${antBody(caste, { lod: 'portrait' })}${extra}</g>`;
}

const leafBit = (x: number, y: number, r: number, s = 1) =>
  `<path d="M${f(x - 6 * s)},${f(y)} Q${f(x)},${f(y - 6 * s)} ${f(x + 6 * s)},${f(y)} Q${f(x)},${f(y - 2.4 * s)} ${f(x - 6 * s)},${f(y)}Z" fill="${FOOD.leaf}" stroke="${FOOD.leafDark}" stroke-width="0.6" transform="rotate(${f(r)} ${f(x)} ${f(y)})"/>`;

const egg = (x: number, y: number, r = 0) =>
  `<g transform="rotate(${f(r)} ${f(x)} ${f(y)})"><ellipse cx="${f(x)}" cy="${f(y)}" rx="2.6" ry="1.8" fill="#f3ead8" stroke="#bfb29a" stroke-width="0.4"/><ellipse cx="${f(x - 0.8)}" cy="${f(y - 0.6)}" rx="0.9" ry="0.5" fill="#fffaf0"/></g>`;

/** A C-shaped grub, curled, lying on its side. */
const larva = (x: number, y: number, s = 1, flip = false) => {
  const sx = flip ? -s : s;
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(sx)} ${f(s)})"><path d="M-5,0 C-6,-6 2,-8 5,-4 C6,-2 5,0 3,0" fill="none" stroke="#efe6d2" stroke-width="4.2" stroke-linecap="round"/><path d="M-3.2,-4.6 l0.9,1.5 M-0.4,-5.8 l0.3,1.7 M2.4,-5 l-0.5,1.6" stroke="#cdbf9f" stroke-width="0.6"/><circle cx="3.4" cy="-0.6" r="1.3" fill="#c49a5a"/></g>`;
};

/** A cocoon (pupa), pale tan with a seam. */
const pupa = (x: number, y: number, r = 0) =>
  `<g transform="rotate(${f(r)} ${f(x)} ${f(y)})"><ellipse cx="${f(x)}" cy="${f(y)}" rx="5" ry="2.8" fill="#d9c39a" stroke="#a88f63" stroke-width="0.5"/><path d="M${f(x - 4)},${f(y)} Q${f(x)},${f(y - 1)} ${f(x + 4)},${f(y)}" stroke="#b9a175" stroke-width="0.5" fill="none"/><circle cx="${f(x + 3.6)}" cy="${f(y)}" r="0.7" fill="#7a5a33"/></g>`;

const drop = (x: number, y: number, s = 1) =>
  `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s)})"><path d="M0,-5 C1.6,-2.4 3,-1 3,0.6 A3,3 0 0 1 -3,0.6 C-3,-1 -1.6,-2.4 0,-5Z" fill="${FOOD.honey}" stroke="${FOOD.honeyDark}" stroke-width="0.5"/><ellipse cx="-1" cy="0" rx="0.7" ry="1.1" fill="${FOOD.honeyLight}"/></g>`;

const pebble = (x: number, y: number, r: number, c = SOIL.pebble) => `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(r)}" ry="${f(r * 0.75)}" fill="${c}"/>`;

/** A dead beetle on its back, legs up: food for the colony. */
const beetle = (x: number, y: number, s = 1) =>
  `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s)})"><g stroke="#4e3626" stroke-width="1" stroke-linecap="round" fill="none"><path d="M-5,-4 l-2,-4 l-1.5,-1"/><path d="M-1,-5 l0,-4.5 l1,-1"/><path d="M3,-4.5 l2,-4 l1.5,-0.5"/></g><ellipse cx="0" cy="-2.2" rx="8" ry="4.4" fill="#6b4a33" stroke="#2a1d14" stroke-width="0.6"/><path d="M0,-6.4 L0,2" stroke="#3b2a1e" stroke-width="0.7"/><ellipse cx="-2.8" cy="-4.2" rx="3.2" ry="1.1" fill="#a07a58"/><ellipse cx="3" cy="-4" rx="2" ry="0.7" fill="#8a6548"/><circle cx="8.2" cy="-1.6" r="2.4" fill="#4e3626" stroke="#2a1d14" stroke-width="0.5"/></g>`;

/** A bit of prey: a severed cricket leg. */
const preyLeg = (x: number, y: number, r: number) =>
  `<g transform="rotate(${f(r)} ${f(x)} ${f(y)})"><path d="M${f(x - 8)},${f(y)} L${f(x + 2)},${f(y - 1)} L${f(x + 8)},${f(y + 2)}" stroke="${FOOD.proteinDark}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M${f(x - 8)},${f(y)} L${f(x + 2)},${f(y - 1)}" stroke="${FOOD.protein}" stroke-width="1" fill="none" stroke-linecap="round"/></g>`;

const meat = (x: number, y: number, r: number, s = 1) =>
  `<g transform="rotate(${f(r)} ${f(x)} ${f(y)})"><path d="M${f(x - 4.4 * s)},${f(y + 1 * s)} Q${f(x - 3 * s)},${f(y - 3.2 * s)} ${f(x + 1 * s)},${f(y - 2.8 * s)} Q${f(x + 4.6 * s)},${f(y - 2 * s)} ${f(x + 4 * s)},${f(y + 1.6 * s)} Q${f(x)},${f(y + 2.8 * s)} ${f(x - 4.4 * s)},${f(y + 1 * s)}Z" fill="#b65a50" stroke="${FOOD.proteinDark}" stroke-width="0.6"/><path d="M${f(x - 2 * s)},${f(y - 1.6 * s)} q${f(1.6 * s)},${f(-0.8 * s)} ${f(3 * s)},0" stroke="#d98a80" stroke-width="${f(0.8 * s)}" fill="none" stroke-linecap="round"/></g>`;

/** An aphid: plump green body, two little tail-pipes (cornicles), tiny legs. */
const aphid = (x: number, y: number, r = 0, s = 1) =>
  `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(r)}) scale(${f(s)})"><path d="M-3,1.5 l-1,1.6 M-0.5,2 l-0.4,1.8 M2,1.6 l0.6,1.6" stroke="#5f7d36" stroke-width="0.5"/><ellipse cx="0" cy="0" rx="3.6" ry="2.4" fill="#9cc25a" stroke="#6a8a35" stroke-width="0.4"/><path d="M-3,-1 l-1.6,-1.4 M-2.4,-1.6 l-1,-1.8" stroke="#6a8a35" stroke-width="0.6"/><circle cx="3.4" cy="-0.2" r="1.1" fill="#7fa344"/><ellipse cx="-0.8" cy="-0.9" rx="1.3" ry="0.6" fill="#c5e08f"/></g>`;

/** A honeypot ant (replete) hanging from the ceiling, its gaster swollen with honeydew. */
const replete = (x: number, y: number, s = 1) =>
  `<g transform="translate(${f(x)} ${f(y)}) scale(${f(s)})"><g stroke="#6e4325" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M-1.6,4 l-3.4,-2 l-1,-4"/><path d="M0,4 l0,-4.2"/><path d="M1.6,4 l3.4,-2 l1,-4"/></g><ellipse cx="0" cy="5" rx="2.2" ry="2.6" fill="#a95f2f"/><circle cx="0" cy="1.4" r="1.9" fill="#a95f2f"/><circle cx="0" cy="8.4" r="1" fill="#a95f2f"/><ellipse cx="0" cy="19" rx="9.4" ry="10.4" fill="${FOOD.honey}" fill-opacity="0.9" stroke="${FOOD.honeyDark}" stroke-width="0.7"/><path d="M-5.6,11.4 Q0,8.6 5.6,11.4" stroke="#6e4325" stroke-width="1.3" fill="none" opacity="0.75" stroke-linecap="round"/><path d="M-8.4,15.4 Q0,12.6 8.4,15.4" stroke="#8a5a2a" stroke-width="0.7" fill="none" opacity="0.45" stroke-linecap="round"/><path d="M-5.6,13 Q-7.6,19 -4.2,25" stroke="${FOOD.honeyLight}" stroke-width="2" fill="none" opacity="0.65" stroke-linecap="round"/></g>`;

/** Leafcutter fungus garden: a spongy pale mound with leaf bits worked into it. */
function fungus(rnd: () => number, cx: number, w: number, h: number) {
  const out: string[] = [`<path d="M${f(cx - w / 2)},${f(FLOOR + 1)} C${f(cx - w * 0.4)},${f(FLOOR - h * 1.1)} ${f(cx + w * 0.4)},${f(FLOOR - h * 1.1)} ${f(cx + w / 2)},${f(FLOOR + 1)}Z" fill="#cbbfa6"/>`];
  for (let i = 0; i < 110; i++) {
    const t = rnd();
    const x = cx + (t - 0.5) * w;
    const top = FLOOR - h * Math.sqrt(Math.max(0, 1 - ((x - cx) / (w / 2)) ** 2));
    const y = top + 2 + rnd() * (FLOOR - top - 2);
    const r = 1.8 + rnd() * 2.2;
    out.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${rnd() < 0.35 ? '#cbbfa6' : '#e6dccb'}"/>`);
  }
  for (let i = 0; i < 7; i++) {
    const x = cx + (rnd() - 0.5) * w * 0.7;
    out.push(`<path d="M${f(x)},${f(FLOOR - h * 0.4 - rnd() * h * 0.4)} l3,-1.4 l-1,2.4Z" fill="${FOOD.leaf}" opacity="0.85"/>`);
  }
  for (let i = 0; i < 18; i++) out.push(`<circle cx="${f(cx + (rnd() - 0.5) * w * 0.85)}" cy="${f(FLOOR - rnd() * h * 0.9)}" r="0.7" fill="#fffaf0"/>`);
  return out.join('');
}

// ---------- each chamber at level 1 ----------

type Contents = (rnd: () => number) => string;

/** Roughly where the ceiling is above x (the hollow is wobbly, so stay a little inside). */
const ceiling = (x: number) => CY - RY * Math.sqrt(Math.max(0, 1 - ((x - CX) / RX) ** 2)) * 0.9;

/** Parts that run through the soil wall, outside the hollow (drawn behind it). */
const IN_WALL: Partial<Record<ChamberId, string>> = {
  // the new tunnel being dug, heading off to the right
  excavation_works: `<path d="M160,${f(FLOOR - 12)} C176,${f(FLOOR - 16)} 186,${f(FLOOR - 8)} 199,${f(FLOOR - 12)}" stroke="${SOIL.hollow}" stroke-width="12" fill="none" stroke-linecap="round"/><circle cx="199" cy="${f(FLOOR - 12)}" r="2" fill="#6b4f35"/>`,
  // the root the aphids feed on comes down through the soil
  aphid_pasture: `<path d="M120,0 C119,10 118,20 117,30" stroke="#7a5a3a" stroke-width="5" fill="none" stroke-linecap="round"/>`,
};

const CONTENTS: Record<ChamberId, Contents> = {
  queen_chamber: () =>
    [egg(52, FLOOR - 1, -10), egg(57, FLOOR - 2, 15), egg(55, FLOOR - 4.2, 0), egg(61, FLOOR - 1, 5), egg(146, FLOOR - 1, 10), egg(150, FLOOR - 3, -5),
      ant('worker', 140, FLOOR, 24, true), ant('queen', 104, FLOOR + 1, 72)].join(''),

  leaf_garden: (rnd) => [fungus(rnd, 100, 72, 28), leafBit(146, FLOOR - 13, -20, 0.9), ant('worker', 146, FLOOR, 22, true), ant('worker', 54, FLOOR, 20)].join(''),

  hunting_grounds: () =>
    [beetle(92, FLOOR, 1.5), preyLeg(140, FLOOR - 2, -8), ant('soldier', 62, FLOOR, 28), ant('worker', 130, FLOOR, 22, true)].join(''),

  nursery: () =>
    [larva(76, FLOOR), larva(91, FLOOR, 1.1, true), larva(106, FLOOR), larva(121, FLOOR, 0.9, true), larva(84, FLOOR - 6, 0.85),
      ant('worker', 144, FLOOR, 22, true), ant('worker', 56, FLOOR, 20)].join(''),

  granary: (rnd) => {
    const out: string[] = [];
    for (let i = 0; i < 30; i++) {
      const x = 70 + rnd() * 56;
      const hgt = 11 * Math.sqrt(Math.max(0, 1 - ((x - 98) / 30) ** 2));
      const y = FLOOR - rnd() * hgt;
      out.push(
        rnd() < 0.35
          ? `<ellipse cx="${f(x)}" cy="${f(y)}" rx="3.6" ry="1.5" fill="${rnd() < 0.5 ? FOOD.leaf : '#7aa046'}" stroke="${FOOD.leafDark}" stroke-width="0.5" transform="rotate(${f(rnd() * 50 - 25)} ${f(x)} ${f(y)})"/>`
          : leafBit(x, y + 2, rnd() * 50 - 25, 0.8 + rnd() * 0.3),
      );
    }
    out.push(ant('worker', 142, FLOOR, 24, true), leafBit(131, FLOOR - 12, -15, 0.9));
    return out.join('');
  },

  larder: (rnd) => {
    const out: string[] = [preyLeg(88, FLOOR - 1, 12), preyLeg(112, FLOOR - 2, -10)];
    for (let i = 0; i < 7; i++) out.push(meat(84 + rnd() * 34, FLOOR - 2 - rnd() * 5, rnd() * 60 - 30, 0.9 + rnd() * 0.4));
    out.push(`<path d="M122,${f(FLOOR - 3)} q8,-9 14,-2 q-6,1 -14,2Z" fill="#d8d0c0" opacity="0.7"/>`); // a torn wing
    out.push(ant('worker', 60, FLOOR, 22));
    return out.join('');
  },

  brood_hall: () =>
    [egg(52, FLOOR - 1), egg(57, FLOOR - 1.4, 20), egg(54.5, FLOOR - 4), egg(62, FLOOR - 1),
      larva(82, FLOOR), larva(96, FLOOR, 1, true),
      pupa(118, FLOOR - 2, -5), pupa(130, FLOOR - 2, 8), pupa(124, FLOOR - 6.5, 0),
      ant('worker', 146, FLOOR, 22, true)].join(''),

  pheromone_chamber: () => {
    const trail = (d: string, o = 1) => `<path d="${d}" fill="none" stroke="#b58ad8" stroke-width="1.4" stroke-dasharray="0.1 3.2" stroke-linecap="round" opacity="${o}"/>`;
    return [
      `<ellipse cx="100" cy="${FLOOR - 26}" rx="34" ry="16" fill="#b58ad8" opacity="0.07"/>`,
      `<ellipse cx="100" cy="${FLOOR - 26}" rx="20" ry="9" fill="#b58ad8" opacity="0.09"/>`,
      trail(`M34,${FLOOR - 6} C60,${FLOOR - 40} 92,${FLOOR - 8} 120,${FLOOR - 34} S166,${FLOOR - 24} 172,${FLOOR - 40}`),
      trail(`M40,${FLOOR - 26} C70,${FLOOR - 14} 104,${FLOOR - 48} 150,${FLOOR - 12}`, 0.6),
      ant('worker', 84, FLOOR, 26),
      ant('worker', 128, FLOOR, 24, true),
    ].join('');
  },

  aphid_pasture: () => {
    // a root comes down through the ceiling; aphids feed on it and drip honeydew
    const root = `<path d="M118,0 C116,26 108,40 110,${FLOOR - 26} C111,${FLOOR - 18} 106,${FLOOR - 12} 104,${FLOOR - 8}" stroke="#7a5a3a" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M110,${FLOOR - 30} C120,${FLOOR - 26} 128,${FLOOR - 28} 136,${FLOOR - 22}" stroke="#7a5a3a" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    return [root, aphid(107, 44, 80), aphid(114, 52, 100), aphid(108, 60, 70, 0.9), aphid(124, FLOOR - 28, 20, 0.9), aphid(133, FLOOR - 25, 30, 0.8),
      drop(104, FLOOR - 1, 0.7), drop(96, FLOOR, 0.6),
      ant('worker', 82, FLOOR, 24), ant('worker', 150, FLOOR, 22, true)].join('');
  },

  nectar_cellar: () =>
    [`<ellipse cx="100" cy="${FLOOR + 0.5}" rx="34" ry="3.2" fill="${FOOD.honey}" opacity="0.55"/>`,
      `<ellipse cx="94" cy="${FLOOR}" rx="12" ry="1" fill="${FOOD.honeyLight}" opacity="0.6"/>`,
      drop(82, FLOOR - 2, 1.2), drop(96, FLOOR - 3, 1.5), drop(110, FLOOR - 2, 1.1), drop(122, FLOOR - 1.5, 0.9), drop(89, FLOOR - 9, 0.9),
      ant('worker', 144, FLOOR, 24, true), ant('worker', 58, FLOOR, 22)].join(''),

  excavation_works: (rnd) => {
    const out: string[] = [];
    // spoil from the new tunnel heaped on the floor
    for (let i = 0; i < 22; i++) {
      const x = 72 + rnd() * 36;
      const hgt = 12 * Math.sqrt(Math.max(0, 1 - ((x - 90) / 19) ** 2));
      out.push(pebble(x, FLOOR - rnd() * hgt, 1.6 + rnd() * 1.6, rnd() < 0.5 ? '#6b4f35' : '#5a4029'));
    }
    out.push(pebble(130, FLOOR - 1.5, 2.6, '#6b4f35'), pebble(137, FLOOR - 1.2, 2, '#5a4029'));
    out.push(ant('worker', 150, FLOOR, 24, false), pebble(161, FLOOR - 4.5, 2.4, '#6b4f35'));
    out.push(ant('worker', 60, FLOOR, 22));
    return out.join('');
  },

  honeypot_gallery: () =>
    [replete(76, ceiling(76), 1), replete(102, ceiling(102), 1.15), replete(128, ceiling(128), 0.95),
      drop(100, FLOOR - 1, 0.6), ant('worker', 150, FLOOR, 22, true)].join(''),
};

/** What each chamber is, in a phrase (for the preview sheet). */
export const SIGNATURE: Record<ChamberId, string> = {
  queen_chamber: 'The queen and her eggs',
  leaf_garden: 'Fungus garden grown on cut leaves',
  hunting_grounds: 'A beetle hauled in, soldiers on guard',
  nursery: 'Larvae being fed',
  granary: 'Cut leaves piled up',
  larder: 'Prey cut into pieces',
  brood_hall: 'Eggs, larvae and cocoons, sorted',
  pheromone_chamber: 'Scent trails being learned',
  aphid_pasture: 'Aphids herded on a root',
  nectar_cellar: 'Pooled honeydew',
  excavation_works: 'A new tunnel being dug',
  honeypot_gallery: 'Honeypot ants hanging from the ceiling',
};

/**
 * The chamber's art, without an <svg> wrapper. `uid` keeps clip ids unique when several share a page.
 * `nest` leaves out the soil wall, roots and tunnel mouth: the whole-nest view draws its own tunnels.
 */
export function chamberBody(id: ChamberId, uid: string = id, opts: { nest?: boolean } = {}) {
  const rnd = seeded([...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7));
  antCount = 0;
  const out: string[] = [];
  const hollow = blob(rnd, CX, CY, RX, RY, 0.12, FLOOR + 2);
  const wall = blob(rnd, CX, CY + 2, RX + 13, RY + 11, 0.14);

  // the random draws below happen in the same order either way, so both versions match
  const grit = Array.from({ length: 26 }, () => {
    const a = rnd() * Math.PI * 2;
    return pebble(CX + Math.cos(a) * (RX + 4 + rnd() * 7), CY + 2 + Math.sin(a) * (RY + 4 + rnd() * 6), 0.7 + rnd() * 1.3, rnd() < 0.5 ? SOIL.pebble : SOIL.wallDark);
  });
  const roots = [
    `<path d="M${f(40 + rnd() * 20)},0 C${f(48 + rnd() * 10)},14 ${f(36 + rnd() * 10)},18 ${f(44 + rnd() * 8)},28" stroke="${SOIL.root}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
    `<path d="M${f(150 + rnd() * 20)},0 C${f(150 + rnd() * 10)},10 ${f(164 + rnd() * 6)},14 ${f(158 + rnd() * 8)},24" stroke="${SOIL.root}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
  ];
  if (!opts.nest) {
    // packed-soil wall around the hollow, flecked with grit; roots reaching in from above
    out.push(`<path d="${wall}" fill="${SOIL.wall}"/>`, ...grit, ...roots);
    // tunnel mouth: the way in from the shaft
    out.push(`<path d="M70,${f(CY - RY + 6)} C64,16 54,8 44,0" stroke="${SOIL.hollow}" stroke-width="13" fill="none" stroke-linecap="round"/>`);
    if (IN_WALL[id]) out.push(IN_WALL[id]!);
  }
  // the hollow, its back wall and packed floor
  out.push(`<clipPath id="ch-${uid}"><path d="${hollow}"/></clipPath>`);
  out.push(`<path d="${hollow}" fill="${SOIL.hollow}"/>`);
  out.push(`<g clip-path="url(#ch-${uid})">`);
  out.push(`<ellipse cx="${CX}" cy="${CY - 6}" rx="${RX * 0.7}" ry="${RY * 0.55}" fill="${SOIL.back}"/>`);
  out.push(`<rect x="0" y="${f(FLOOR - 1)}" width="${VIEW.w}" height="${VIEW.h}" fill="${SOIL.floor}"/>`);
  for (let i = 0; i < 9; i++) out.push(pebble(CX + (rnd() - 0.5) * RX * 1.6, FLOOR + 1 + rnd() * 3, 0.6 + rnd() * 0.8, SOIL.wallDark));
  out.push(CONTENTS[id](rnd));
  out.push('</g>');
  out.push(`<path d="${hollow}" fill="none" stroke="${SOIL.rim}" stroke-width="1.6"/>`);
  return out.join('');
}

export function chamberSvg(id: ChamberId, attrs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW.w} ${VIEW.h}" ${attrs}>${chamberBody(id)}</svg>`;
}
