// Generates the Hormigas ant set from one shared body plan.
//   node art/ants/build.mjs
// Writes <caste>-sprite.svg (in-game, flat silhouette), <caste>-portrait.svg
// (close-ups: ink outline + detail) and preview.html next to this file.
//
// Every caste is the same parts (gaster, petiole, mesosoma, head, mandibles,
// elbowed antenna, six legs) with different proportions, so the game can later
// draw and animate them part by part, and colour palettes are plain swaps.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = dirname(fileURLToPath(import.meta.url));

// "Amber chitin": light enough to read against the dark soil (#231a14).
const AMBER = { base: '#c98b52', light: '#f2d3a2', shade: '#8c5730', far: '#6e4325', ink: '#2b1d13' };

const CASTES = {
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
    pal: { base: '#a95f2f', light: '#e0a46e', shade: '#713c1c', far: '#552c14', ink: '#24170e' },
    vb: [0, -3, 78, 37],
  },
  alate: {
    gaster: { cx: 17, cy: 17, rx: 14, ry: 8.8 },
    pet: { cx: 33.5, cy: 16, rx: 2.3, ry: 3.4 },
    front: { x: 35.5, s: 1.2 },
    head: { cx: 46, cy: 12.5, rx: 5.6, ry: 4.9 },
    mand: 1,
    wings: true,
    pal: { base: '#a95f2f', light: '#e0a46e', shade: '#713c1c', far: '#552c14', ink: '#24170e' },
    vb: [0, -5, 78, 39],
  },
};

// Legs in front-section coordinates: coxa → knee → foot → tarsus tip.
// Tripod gait: set "a" (near front, near hind, far mid) swings against set "b".
const NEAR_LEGS = [
  { pts: [[32, 17], [26, 20.5], [20, 28], [17, 28.4]], set: 'a' },
  { pts: [[35, 17.5], [34, 21.8], [30.5, 28], [28.5, 28.4]], set: 'b' },
  { pts: [[38, 16.5], [43, 20], [46, 28], [48.5, 28.3]], set: 'a' },
];
const FAR_LEGS = [
  { pts: [[31, 16], [27, 19.2], [23, 27.2]], set: 'b' },
  { pts: [[34, 16.5], [37, 21], [37.5, 27.5]], set: 'a' },
  { pts: [[39, 15.5], [45, 18.5], [51, 27]], set: 'b' },
];
const MESO = 'M29,17 C29,11 33,9.5 37,10.5 C40,11 41.5,12.5 41.5,14.2 C40.5,17 34,18.5 29,17Z';

const f = (n) => +n.toFixed(2);
const P = (pts) => pts.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');

function leg(l, color, width, lod, pal, walk) {
  const [cx, cy] = l.pts[0];
  const anim = walk
    ? `<animateTransform attributeName="transform" type="rotate" values="-13 ${cx} ${cy};13 ${cx} ${cy};-13 ${cx} ${cy}" dur="0.42s" begin="${l.set === 'a' ? '0s' : '-0.21s'}" repeatCount="indefinite"/>`
    : '';
  const ink = lod === 'portrait' ? `<polyline points="${P(l.pts)}" stroke="${pal.ink}" stroke-width="${width + 1}"/>` : '';
  return `<g>${anim}${ink}<polyline points="${P(l.pts)}" stroke="${color}" stroke-width="${width}"/></g>`;
}

function antenna(h, color, width, lod, pal, far = false) {
  const o = far ? 1.6 : 0;
  const x0 = h.cx - h.rx * 0.1 - o, y0 = h.cy - h.ry * 0.75;
  const ex = x0 + 3.5, ey = y0 - 5.5;
  const tx = ex + 8 - o, ty = ey + 3.5;
  const d = `M${f(x0)},${f(y0)} L${f(ex)},${f(ey)} Q${f(ex + 4.5)},${f(ey - 0.6)} ${f(tx)},${f(ty)}`;
  const ink = lod === 'portrait' ? `<path d="${d}" stroke="${pal.ink}" stroke-width="${width + 0.9}"/>` : '';
  return `${ink}<path d="${d}" stroke="${color}" stroke-width="${width}"/><circle cx="${f(tx)}" cy="${f(ty)}" r="${f(width * 0.75)}" fill="${color}"/>`;
}

export function ant(caste, { lod = 'sprite', walk = false } = {}) {
  const c = CASTES[caste];
  const { pal, gaster: g, pet, head: h } = c;
  const portrait = lod === 'portrait';
  const line = portrait ? `stroke="${pal.ink}" stroke-width="0.9"` : '';
  const ft = `translate(${c.front.x} 16) scale(${c.front.s}) translate(-29 -16)`;
  const tf = (x, y) => [c.front.x + (x - 29) * c.front.s, 16 + (y - 16) * c.front.s];
  const legW = portrait ? 1.5 : 2.2;
  const out = [];

  // far side: legs and antenna in shadow colour, behind the body
  out.push(`<g transform="${ft}" fill="none" stroke-linecap="round" stroke-linejoin="round">`);
  for (const l of FAR_LEGS) out.push(leg(l, pal.far, legW * 0.85, lod, pal, walk));
  out.push(antenna(h, pal.far, portrait ? 1 : 1.4, lod, pal, true));
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
  if (c.scars) {
    out.push(`<path d="M34.6,10.3 l0.5,1.2 M37,10.6 l0.4,1.1" stroke="${pal.ink}" stroke-width="0.7"/>`);
  }
  out.push(`<g transform="rotate(14 ${h.cx} ${h.cy})">`);
  out.push(`<ellipse cx="${h.cx}" cy="${h.cy}" rx="${h.rx}" ry="${h.ry}" fill="${pal.base}" ${line}/>`);
  out.push(`<ellipse cx="${f(h.cx - h.rx * 0.12)}" cy="${f(h.cy - h.ry * 0.5)}" rx="${f(h.rx * 0.5)}" ry="${f(h.ry * 0.24)}" fill="${pal.light}"/>`);
  out.push('</g>');
  // mandibles
  // jaws: two curved blades (far one behind) that hook down at the tip
  const mx = h.cx + h.rx * 0.78, my = h.cy + h.ry * 0.5, m = c.mand;
  const jaw = (dx, dy) => `M${f(mx + dx)},${f(my + dy)} q${f(3 * m)},${f(-1 * m)} ${f(4 * m)},${f(1.6 * m)}`;
  const jw = (portrait ? 1.1 : 1.5) * Math.sqrt(m);
  out.push(`<g fill="none" stroke-linecap="round">`);
  out.push(`<path d="${jaw(-0.6, 1)}" stroke="${pal.far}" stroke-width="${f(jw)}"/>`);
  if (portrait) out.push(`<path d="${jaw(0, 0)}" stroke="${pal.ink}" stroke-width="${f(jw + 0.9)}"/>`);
  out.push(`<path d="${jaw(0, 0)}" stroke="${portrait ? pal.shade : pal.base}" stroke-width="${f(jw)}"/>`);
  if (portrait && m > 1.5) {
    for (const t of [0.35, 0.6]) out.push(`<path d="M${f(mx + 2.4 * m * t)},${f(my + 0.3 * m * t)} l0.2,0.9" stroke="${pal.ink}" stroke-width="0.5"/>`);
  }
  out.push('</g>');
  // eye (small: ants see poorly)
  const ex = h.cx + h.rx * 0.28, ey = h.cy - h.ry * 0.12;
  out.push(`<ellipse cx="${f(ex)}" cy="${f(ey)}" rx="${f(Math.min(1.5, h.rx * 0.22))}" ry="${f(Math.min(1.2, h.ry * 0.2))}" fill="${pal.ink}"/>`);
  if (portrait) out.push(`<circle cx="${f(ex - 0.35)}" cy="${f(ey - 0.35)}" r="0.35" fill="${pal.light}"/>`);
  out.push(`<g fill="none">${antenna(h, pal.base, portrait ? 1.1 : 1.6, lod, pal)}</g>`);
  out.push(`<g fill="none">`);
  for (const l of NEAR_LEGS) out.push(leg(l, pal.base, legW, lod, pal, walk));
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

export function svg(caste, opts = {}, attrs = '') {
  const vb = CASTES[caste].vb.join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" ${attrs}>${ant(caste, opts)}</svg>`;
}

const castes = Object.keys(CASTES);
for (const c of castes) {
  writeFileSync(join(OUT, `${c}-sprite.svg`), svg(c, { lod: 'sprite' }) + '\n');
  writeFileSync(join(OUT, `${c}-portrait.svg`), svg(c, { lod: 'portrait' }) + '\n');
}

// ---------- preview sheet ----------
const w = (c) => CASTES[c].vb[2];
const portraits = castes.map((c) => `<figure><div class="pv">${svg(c, { lod: 'portrait' }, `width="${w(c) * 4.2}"`)}</div><figcaption>${c}</figcaption></figure>`).join('');
const sizes = castes.map((c) => `<div class="row"><span>${c}</span>${[48, 24, 16, 12].map((px) => svg(c, { lod: 'sprite' }, `width="${Math.round(px * w(c) / 60)}"`)).join('')}</div>`).join('');
const walkers = [['worker', 0], ['worker', 2.4], ['soldier', 5.3], ['worker', 7.6], ['queen', 10.4], ['worker', 13]]
  .map(([c, d]) => `<div class="walker" style="animation-delay:-${d}s">${svg(c, { lod: 'sprite', walk: true }, `width="${Math.round(18 * w(c) / 60)}"`)}</div>`).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Hormigas ants</title>
<style>
body{margin:0;background:#231a14;color:#efe4d2;font:14px system-ui,sans-serif;padding:24px}
h2{font-weight:600;margin:28px 0 12px;color:#a8957e;font-size:13px;letter-spacing:.06em;text-transform:uppercase}
.grid{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;background:#30241b;border-radius:12px;padding:16px}
figcaption{color:#a8957e;margin-top:6px;text-transform:capitalize}
.row{display:flex;align-items:center;gap:28px;margin:8px 0}.row span{width:70px;color:#a8957e;text-transform:capitalize}
.tunnel{position:relative;height:44px;background:#140e0a;border-radius:22px;overflow:hidden;max-width:640px}
.walker{position:absolute;top:13px;left:-40px;animation:walk 16s linear infinite}
@keyframes walk{to{transform:translateX(700px)}}
</style></head><body>
<h2>Portraits (close-ups, cards)</h2><div class="grid">${portraits}</div>
<h2>Sprites at 48 / 24 / 16 / 12 px</h2>${sizes}
<h2>In a tunnel at 18 px, walking</h2><div class="tunnel">${walkers}</div>
</body></html>`;
writeFileSync(join(OUT, 'preview.html'), html);
console.log(`wrote ${castes.length * 2} svgs + preview.html to ${OUT}`);
