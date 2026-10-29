// The Hormigas ant set (docs/18-art-direction.md): every caste is one body plan with different
// proportions, drawn side-on, facing right. Pure string building, no DOM, so the game and
// art/ants/build.ts (the preview sheet) share it.
//
//   lod 'sprite'   flat two-tone silhouette for play; reads at 12px
//   lod 'portrait' ink outline and detail for close-ups
//   swing          leg angle in degrees for one walk pose (tripod gait)
//   walk           animate the legs with SMIL (close-ups and the preview sheet)

export type Caste = 'worker' | 'soldier' | 'queen' | 'alate';
export type Lod = 'sprite' | 'portrait';

export interface Palette { base: string; light: string; shade: string; far: string; ink: string }
interface Ellipse { cx: number; cy: number; rx: number; ry: number }
interface CasteSpec {
  gaster: Ellipse;
  pet: Ellipse;
  front: { x: number; s: number };
  head: Ellipse;
  mand: number;
  scars?: boolean;
  wings?: boolean;
  pal: Palette;
  /** viewBox: x, y, width, height */
  vb: [number, number, number, number];
}

// "Amber chitin": light enough to read against the dark soil.
const AMBER: Palette = { base: '#c98b52', light: '#f2d3a2', shade: '#8c5730', far: '#6e4325', ink: '#2b1d13' };
const RUST: Palette = { base: '#a95f2f', light: '#e0a46e', shade: '#713c1c', far: '#552c14', ink: '#24170e' };
/** Other colonies' raiders: same anatomy, blood-red chitin. */
const ENEMY: Palette = { base: '#c4473a', light: '#ef9a8a', shade: '#86281f', far: '#64201a', ink: '#2b1210' };

export const CASTES: Record<Caste, CasteSpec> = {
  worker: {
    gaster: { cx: 15, cy: 17, rx: 10, ry: 7.5 },
    pet: { cx: 27, cy: 15.5, rx: 2, ry: 3 },
    front: { x: 29, s: 1 },
    head: { cx: 46, cy: 12.5, rx: 5.8, ry: 5 },
    mand: 1,
    pal: AMBER,
    vb: [-1, -2, 62, 33],
  },
  soldier: {
    gaster: { cx: 15, cy: 17, rx: 9.5, ry: 7.2 },
    pet: { cx: 27, cy: 15.5, rx: 2.2, ry: 3.2 },
    front: { x: 29, s: 1.05 },
    head: { cx: 49, cy: 11.5, rx: 9.2, ry: 8 },
    mand: 2.1,
    pal: { base: '#b06a38', light: '#e6b37f', shade: '#7a4524', far: '#5c341b', ink: '#2b1d13' },
    vb: [-1, -5, 74, 37],
  },
  queen: {
    gaster: { cx: 17, cy: 17, rx: 14.5, ry: 9.2 },
    pet: { cx: 33.5, cy: 16, rx: 2.3, ry: 3.4 },
    front: { x: 35.5, s: 1.2 },
    head: { cx: 46, cy: 12.5, rx: 5.6, ry: 4.9 },
    mand: 1,
    scars: true,
    pal: RUST,
    vb: [0, -3, 78, 37],
  },
  alate: {
    gaster: { cx: 17, cy: 17, rx: 14, ry: 8.8 },
    pet: { cx: 33.5, cy: 16, rx: 2.3, ry: 3.4 },
    front: { x: 35.5, s: 1.2 },
    head: { cx: 46, cy: 12.5, rx: 5.6, ry: 4.9 },
    mand: 1,
    wings: true,
    pal: RUST,
    vb: [0, -5, 78, 39],
  },
};

type Pt = [number, number];
interface Leg { pts: Pt[]; set: 'a' | 'b' }

// Legs in front-section coordinates: hip → knee → foot → toe.
// Tripod gait: set "a" (near front, near hind, far middle) swings against set "b".
const NEAR_LEGS: Leg[] = [
  { pts: [[32, 17], [26, 20.5], [20, 28], [17, 28.4]], set: 'a' },
  { pts: [[35, 17.5], [34, 21.8], [30.5, 28], [28.5, 28.4]], set: 'b' },
  { pts: [[38, 16.5], [43, 20], [46, 28], [48.5, 28.3]], set: 'a' },
];
const FAR_LEGS: Leg[] = [
  { pts: [[31, 16], [27, 19.2], [23, 27.2]], set: 'b' },
  { pts: [[34, 16.5], [37, 21], [37.5, 27.5]], set: 'a' },
  { pts: [[39, 15.5], [45, 18.5], [51, 27]], set: 'b' },
];
const MESO = 'M29,17 C29,11 33,9.5 37,10.5 C40,11 41.5,12.5 41.5,14.2 C40.5,17 34,18.5 29,17Z';
/** Where the feet touch the ground, in body units (for standing ants on a line). */
export const FOOT_Y = 28.4;

const f = (n: number) => +n.toFixed(2);
const P = (pts: Pt[]) => pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');

export interface AntOptions {
  lod?: Lod;
  walk?: boolean;
  swing?: number;
  /** Seconds per stride when walking. */
  stride?: number;
  /** Seconds to offset the walk, so ants side by side don't step in sync. */
  phase?: number;
  /** Colour of food held in the jaws. */
  load?: string;
  /** Draw as another colony's ant. */
  enemy?: boolean;
  /** Override the caste's colours (e.g. a darker Major Soldier, a black Bullet Ant). */
  palette?: Partial<Palette>;
}

function leg(l: Leg, color: string, width: number, portrait: boolean, pal: Palette, o: AntOptions) {
  const [cx, cy] = l.pts[0];
  const sign = l.set === 'a' ? 1 : -1;
  const stride = o.stride ?? 0.42;
  const begin = (o.phase ?? 0) + (l.set === 'a' ? 0 : stride / 2);
  const anim = o.walk
    ? `<animateTransform attributeName="transform" type="rotate" values="-13 ${cx} ${cy};13 ${cx} ${cy};-13 ${cx} ${cy}" dur="${stride}s" begin="${begin ? `-${f(begin)}s` : '0s'}" repeatCount="indefinite"/>`
    : '';
  const pose = !o.walk && o.swing ? ` transform="rotate(${f(o.swing * sign)} ${cx} ${cy})"` : '';
  const ink = portrait ? `<polyline points="${P(l.pts)}" stroke="${pal.ink}" stroke-width="${width + 1}"/>` : '';
  return `<g${pose}>${anim}${ink}<polyline points="${P(l.pts)}" stroke="${color}" stroke-width="${width}"/></g>`;
}

function antenna(h: Ellipse, color: string, width: number, portrait: boolean, pal: Palette, far = false) {
  const o = far ? 1.6 : 0;
  const x0 = h.cx - h.rx * 0.1 - o, y0 = h.cy - h.ry * 0.75;
  const ex = x0 + 3.5, ey = y0 - 5.5;
  const tx = ex + 8 - o, ty = ey + 3.5;
  const d = `M${f(x0)},${f(y0)} L${f(ex)},${f(ey)} Q${f(ex + 4.5)},${f(ey - 0.6)} ${f(tx)},${f(ty)}`;
  const ink = portrait ? `<path d="${d}" stroke="${pal.ink}" stroke-width="${width + 0.9}"/>` : '';
  return `${ink}<path d="${d}" stroke="${color}" stroke-width="${width}"/><circle cx="${f(tx)}" cy="${f(ty)}" r="${f(width * 0.75)}" fill="${color}"/>`;
}

/** The ant's shapes (no <svg> wrapper), in body units. */
export function antBody(caste: Caste, o: AntOptions = {}) {
  const c = CASTES[caste];
  const { gaster: g, pet, head: h } = c;
  const pal = { ...(o.enemy ? ENEMY : c.pal), ...o.palette };
  const portrait = o.lod === 'portrait';
  const line = portrait ? `stroke="${pal.ink}" stroke-width="0.9"` : '';
  const ft = `translate(${c.front.x} 16) scale(${c.front.s}) translate(-29 -16)`;
  const tf = (x: number, y: number): Pt => [c.front.x + (x - 29) * c.front.s, 16 + (y - 16) * c.front.s];
  const legW = portrait ? 1.5 : 2.2;
  const out: string[] = [];

  // far side: legs and antenna in shadow colour, behind the body
  out.push(`<g transform="${ft}" fill="none" stroke-linecap="round" stroke-linejoin="round">`);
  for (const l of FAR_LEGS) out.push(leg(l, pal.far, legW * 0.85, portrait, pal, o));
  out.push(antenna(h, pal.far, portrait ? 1 : 1.4, portrait, pal, true));
  out.push('</g>');

  // gaster + petiole
  out.push(`<g transform="rotate(-12 ${g.cx} ${g.cy})">`);
  out.push(`<ellipse cx="${g.cx}" cy="${g.cy}" rx="${g.rx}" ry="${g.ry}" fill="${pal.base}" ${line}/>`);
  if (portrait) {
    for (const k of [-0.2, 0.3]) {
      const x = g.cx + g.rx * k;
      const hh = g.ry * Math.sqrt(1 - k * k) * 0.94;
      out.push(`<path d="M${f(x)},${f(g.cy - hh)} Q${f(x - 2.6)},${g.cy} ${f(x)},${f(g.cy + hh)}" fill="none" stroke="${pal.shade}" stroke-width="0.8"/>`);
    }
    out.push(`<ellipse cx="${f(g.cx)}" cy="${f(g.cy + g.ry * 0.42)}" rx="${f(g.rx * 0.8)}" ry="${f(g.ry * 0.38)}" fill="${pal.shade}" opacity="0.45"/>`);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * (0.62 + i * 0.09);
      const x = g.cx + Math.cos(a) * g.rx, y = g.cy + Math.sin(a) * g.ry;
      out.push(`<line x1="${f(x)}" y1="${f(y)}" x2="${f(x - 0.9)}" y2="${f(y + 1.1)}" stroke="${pal.ink}" stroke-width="0.4"/>`);
    }
  }
  out.push(`<ellipse cx="${f(g.cx - g.rx * 0.12)}" cy="${f(g.cy - g.ry * 0.47)}" rx="${f(g.rx * 0.55)}" ry="${f(g.ry * 0.26)}" fill="${pal.light}"/>`);
  out.push('</g>');
  out.push(`<ellipse cx="${pet.cx}" cy="${pet.cy}" rx="${pet.rx}" ry="${pet.ry}" fill="${pal.base}" ${line}/>`);

  // front section: mesosoma, head, mouthparts, near antenna, near legs
  out.push(`<g transform="${ft}" stroke-linecap="round" stroke-linejoin="round">`);
  out.push(`<path d="${MESO}" fill="${pal.base}" ${line}/>`);
  out.push(`<ellipse cx="34.5" cy="11.6" rx="3.2" ry="1.05" fill="${pal.light}" transform="rotate(-8 34.5 11.6)"/>`);
  if (c.scars) out.push(`<path d="M34.6,10.3 l0.5,1.2 M37,10.6 l0.4,1.1" stroke="${pal.ink}" stroke-width="0.7"/>`);
  out.push(`<g transform="rotate(14 ${h.cx} ${h.cy})">`);
  out.push(`<ellipse cx="${h.cx}" cy="${h.cy}" rx="${h.rx}" ry="${h.ry}" fill="${pal.base}" ${line}/>`);
  out.push(`<ellipse cx="${f(h.cx - h.rx * 0.12)}" cy="${f(h.cy - h.ry * 0.5)}" rx="${f(h.rx * 0.5)}" ry="${f(h.ry * 0.24)}" fill="${pal.light}"/>`);
  out.push('</g>');
  // jaws: two curved blades (far one behind) that hook down at the tip
  const mx = h.cx + h.rx * 0.78, my = h.cy + h.ry * 0.5, m = c.mand;
  const jaw = (dx: number, dy: number) => `M${f(mx + dx)},${f(my + dy)} q${f(3 * m)},${f(-1 * m)} ${f(4 * m)},${f(1.6 * m)}`;
  const jw = (portrait ? 1.1 : 1.5) * Math.sqrt(m);
  out.push(`<g fill="none" stroke-linecap="round">`);
  out.push(`<path d="${jaw(-0.6, 1)}" stroke="${pal.far}" stroke-width="${f(jw)}"/>`);
  if (portrait) out.push(`<path d="${jaw(0, 0)}" stroke="${pal.ink}" stroke-width="${f(jw + 0.9)}"/>`);
  out.push(`<path d="${jaw(0, 0)}" stroke="${portrait ? pal.shade : pal.base}" stroke-width="${f(jw)}"/>`);
  if (portrait && m > 1.5) {
    for (const t of [0.35, 0.6]) out.push(`<path d="M${f(mx + 2.4 * m * t)},${f(my + 0.3 * m * t)} l0.2,0.9" stroke="${pal.ink}" stroke-width="0.5"/>`);
  }
  out.push('</g>');
  // a morsel held in the jaws
  if (o.load) out.push(`<circle cx="${f(mx + 3.6 * m)}" cy="${f(my + 0.4 * m)}" r="3.4" fill="${o.load}" stroke="${pal.ink}" stroke-width="${portrait ? 0.6 : 0}"/>`);
  // eye (small: ants see poorly)
  const ex = h.cx + h.rx * 0.28, ey = h.cy - h.ry * 0.12;
  out.push(`<ellipse cx="${f(ex)}" cy="${f(ey)}" rx="${f(Math.min(1.5, h.rx * 0.22))}" ry="${f(Math.min(1.2, h.ry * 0.2))}" fill="${pal.ink}"/>`);
  if (portrait) out.push(`<circle cx="${f(ex - 0.35)}" cy="${f(ey - 0.35)}" r="0.35" fill="${pal.light}"/>`);
  out.push(`<g fill="none">${antenna(h, pal.base, portrait ? 1.1 : 1.6, portrait, pal)}</g>`);
  out.push(`<g fill="none">`);
  for (const l of NEAR_LEGS) out.push(leg(l, pal.base, legW, portrait, pal, o));
  if (portrait) for (const l of NEAR_LEGS) out.push(`<circle cx="${l.pts[1][0]}" cy="${l.pts[1][1]}" r="0.8" fill="${pal.shade}"/>`);
  out.push('</g></g>');

  // wings lie over the back of a winged queen
  if (c.wings) {
    const [rx, ry] = tf(36.5, 10.5);
    const veins = portrait ? `stroke="#c9b89c" stroke-width="0.45"` : '';
    out.push(`<g fill="#f6eedf" fill-opacity="0.5" ${veins}>`);
    out.push(`<path d="M${f(rx)},${f(ry)} C${f(rx - 10)},${f(ry - 8)} 9,${f(ry - 6.5)} 2,${f(ry - 2)} C7,${f(ry + 2)} ${f(rx - 14)},${f(ry + 2)} ${f(rx)},${f(ry + 0.6)}Z"/>`);
    out.push(`<path d="M${f(rx - 1)},${f(ry + 0.5)} C${f(rx - 9)},${f(ry - 2)} 15,${f(ry + 1)} 10,${f(ry + 4.5)} C16,${f(ry + 6)} ${f(rx - 10)},${f(ry + 3)} ${f(rx - 1)},${f(ry + 1.5)}Z"/>`);
    if (portrait) out.push(`<path d="M${f(rx)},${f(ry)} Q20,${f(ry - 4.5)} 5,${f(ry - 2.2)} M${f(rx - 4)},${f(ry - 2.6)} L18,${f(ry + 0.6)}" fill="none"/>`);
    out.push('</g>');
  }
  return out.join('');
}

/** A standalone SVG document for one ant. `attrs` go on the <svg> element. */
export function antSvg(caste: Caste, o: AntOptions = {}, attrs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${CASTES[caste].vb.join(' ')}" ${attrs}>${antBody(caste, o)}</svg>`;
}

/** Walk poses for sprite frames: legs back, centred, forward, centred. */
export const WALK_SWINGS = [-12, 0, 12, 0];
