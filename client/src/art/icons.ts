// Pictures for every chamber, unit, defense and research (docs/18-art-direction.md, "Pictures"): small
// 64 × 64 SVGs shown on a light tile beside their names in the lists. Placeholders in the house style,
// built from the same pieces as the ants and the chamber art, so each can be replaced on its own later.
//
//   rules: side view, like the nest · ant-ink outlines · one base colour and one shade · one highlight ·
//          always on the light tile (reads in both themes)
//   chambers: a little window into the hollow, showing the chamber's signature detail
//   units:    the field-guide ant portrait for the caste (the beetle is drawn here)
//   research and defenses: a simple symbol for what it does
import type { CasteId, ChamberId, DefenseId, ResearchId } from '@hormigas/shared';
import { CASTES, FOOT_Y, antBody, type AntOptions, type Caste } from './ants';
import { aphid, beetle, drop, egg, larva, leafBit, meat, preyLeg, pupa, replete } from './chambers';
const INK = '#2b1d13';
const SCENT = '#9b6be0';
const f = (n: number) => +n.toFixed(2);

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** A field-guide ant standing on (x, y), `len` long, facing right (or left). */
function ant(caste: Caste, x: number, y: number, len: number, o: AntOptions = {}, left = false) {
  const [vx, , vw] = CASTES[caste].vb;
  const k = len / vw;
  return `<g transform="translate(${f(x)} ${f(y)}) scale(${f(left ? -k : k)} ${f(k)}) translate(${f(-(vx + vw / 2))} ${-FOOT_Y})">${antBody(caste, { lod: 'portrait', ...o })}</g>`;
}

const ground = (y = 52) => `<path d="M6,${y} Q32,${y - 2} 58,${y}" stroke="#8a6a4a" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.7"/>`;

// ---------- chambers: a window into the hollow ----------

const FLOOR = 46;
/** A dark hollow with a rim; `inside` is drawn clipped to it. */
function hollow(id: string, inside: string) {
  const d = 'M8,34 C8,20 20,14 32,14 C46,14 57,21 57,34 C57,45 47,52 32,52 C18,52 8,46 8,34Z';
  return `<g transform="translate(32 33) scale(1.14) translate(-32 -33)"><path d="${d}" fill="#3a2b1f" transform="translate(32 33) scale(1.12) translate(-32 -33)"/><clipPath id="pic-${id}"><path d="${d}"/></clipPath><path d="${d}" fill="#1c140e"/><g clip-path="url(#pic-${id})"><rect x="0" y="${FLOOR}" width="64" height="20" fill="#2a1e14"/>${inside}</g><path d="${d}" fill="none" stroke="#5a4330" stroke-width="2"/></g>`;
}

function fungus(seed: number) {
  const r = seeded(seed), out: string[] = [`<path d="M14,${FLOOR + 1} C18,30 46,30 50,${FLOOR + 1}Z" fill="#cbbfa6"/>`];
  for (let i = 0; i < 36; i++) {
    const x = 16 + r() * 32, top = FLOOR - 13 * Math.sqrt(Math.max(0, 1 - ((x - 32) / 17) ** 2));
    out.push(`<circle cx="${f(x)}" cy="${f(top + 2 + r() * (FLOOR - top - 2))}" r="${f(1.5 + r() * 1.8)}" fill="${r() < 0.35 ? '#cbbfa6' : '#efe7d6'}"/>`);
  }
  out.push(`<path d="M24,36 l3,-1.4 l-1,2.4Z M38,38 l3,-1.4 l-1,2.4Z M31,33 l3,-1.4 l-1,2.4Z" fill="#8db255"/>`);
  return out.join('');
}

const CHAMBER: Record<ChamberId, () => string> = {
  queen_chamber: () => hollow('queen_chamber', egg(14, FLOOR - 1) + egg(18, FLOOR - 1.2, 20) + egg(16, FLOOR - 3.6) + ant('queen', 35, FLOOR + 1, 40)),
  leaf_garden: () => hollow('leaf_garden', fungus(7)),
  hunting_grounds: () => hollow('hunting_grounds', beetle(30, FLOOR, 1.7)),
  nursery: () => hollow('nursery', larva(19, FLOOR, 1.15) + larva(32, FLOOR, 1.25, true) + larva(45, FLOOR, 1.15)),
  granary: () => {
    const r = seeded(3), bits: string[] = [];
    for (let i = 0; i < 14; i++) { const x = 18 + r() * 28, h = 9 * Math.sqrt(Math.max(0, 1 - ((x - 32) / 15) ** 2)); bits.push(leafBit(x, FLOOR + 1 - r() * h, r() * 50 - 25, 1.1)); }
    return hollow('granary', bits.join(''));
  },
  larder: () => hollow('larder', preyLeg(30, FLOOR - 2, 10) + meat(22, FLOOR - 2, 10, 1.3) + meat(33, FLOOR - 4, -15, 1.4) + meat(43, FLOOR - 2, 25, 1.2)),
  brood_hall: () => hollow('brood_hall', egg(15, FLOOR - 1) + egg(19, FLOOR - 1.3, 15) + egg(17, FLOOR - 3.8) + larva(31, FLOOR, 1.05) + pupa(45, FLOOR - 2, -5) + pupa(46, FLOOR - 6.5, 6)),
  pheromone_chamber: () => hollow('pheromone_chamber', `<ellipse cx="32" cy="32" rx="18" ry="9" fill="#c59bff" opacity="0.18"/><path d="M10,44 C20,22 30,44 40,26 S52,30 56,22" fill="none" stroke="#c59bff" stroke-width="2.2" stroke-dasharray="0.1 4" stroke-linecap="round"/>`),
  aphid_pasture: () => hollow('aphid_pasture', `<path d="M36,8 C35,20 33,30 34,42" stroke="#7a5a3a" stroke-width="4" fill="none" stroke-linecap="round"/>` + aphid(34, 24, 80, 1.3) + aphid(36, 33, 100, 1.2) + drop(30, FLOOR - 1, 0.9)),
  nectar_cellar: () => hollow('nectar_cellar', `<ellipse cx="32" cy="${FLOOR + 0.5}" rx="17" ry="3" fill="#e8b23a" opacity="0.7"/>` + drop(24, FLOOR - 2, 1.5) + drop(33, FLOOR - 3, 1.9) + drop(42, FLOOR - 2, 1.4)),
  excavation_works: () => {
    const r = seeded(9), out: string[] = [];
    for (let i = 0; i < 16; i++) { const x = 16 + r() * 24, h = 10 * Math.sqrt(Math.max(0, 1 - ((x - 28) / 13) ** 2)); out.push(`<ellipse cx="${f(x)}" cy="${f(FLOOR - r() * h)}" rx="${f(1.8 + r() * 1.4)}" ry="${f(1.5 + r())}" fill="${r() < 0.5 ? '#7a5c40' : '#5a4029'}"/>`); }
    out.push(`<path d="M50,30 C56,30 60,33 66,32" stroke="#1c140e" stroke-width="9" fill="none"/>`);
    return hollow('excavation_works', out.join('') + ant('worker', 47, FLOOR, 20));
  },
  honeypot_gallery: () => hollow('honeypot_gallery', replete(23, 16, 0.85) + replete(41, 15, 0.95)),
};

// ---------- units ----------

const MAJOR = { base: '#8e4f28', light: '#cf9566', shade: '#5e3218', far: '#4a2712' };
// Formica wood ants: rusty red head and thorax, dark gaster
const FORMICA = { base: '#9a4a2c', light: '#d58a62', shade: '#62301c', far: '#4a2414' };
const TRAPJAW = { base: '#6e4a2a', light: '#b8885a', shade: '#46301a', far: '#36240f' };
const ACID_DROPS = (x: number, y: number) =>
  `<g fill="#c8d44a" stroke="#6f7a1a" stroke-width="0.8"><circle cx="${x}" cy="${y}" r="2.6"/><circle cx="${x - 5}" cy="${y - 6}" r="2.1"/><circle cx="${x - 8}" cy="${y - 13}" r="1.7"/><circle cx="${x - 2}" cy="${y - 10}" r="1.4"/></g>`;
const BULLET = { base: '#3a2420', light: '#8a5a48', shade: '#24140f', far: '#1a0e0a', ink: '#0f0806' };

const UNIT: Record<CasteId, () => string> = {
  worker: () => ground() + ant('worker', 32, 49, 62),
  minor_soldier: () => ground() + ant('soldier', 31, 49, 62),
  major_soldier: () => ground() + ant('soldier', 31, 51, 68, { palette: MAJOR }),
  scout: () =>
    ground() + `<path d="M4,34 h10 M2,40 h12 M6,46 h8" stroke="#8a6a4a" stroke-width="2" stroke-linecap="round"/>` + ant('worker', 37, 49, 52),
  hauler: () =>
    ground() + ant('worker', 30, 49, 54, { load: '#8db255' }) +
    `<g transform="rotate(-18 40 18)"><ellipse cx="40" cy="18" rx="15" ry="7" fill="#8db255" stroke="${INK}" stroke-width="1.6"/><path d="M26,18 L54,18" stroke="#5f7d36" stroke-width="1.2"/></g><path d="M44,32 L41,25" stroke="${INK}" stroke-width="1.4"/>`,
  winged_queen: () => ground() + ant('alate', 32, 49, 66),
  // Build 10 (docs/05-castes-units.md): a formicine soldier spraying acid from its gaster (left), and a
  // trap-jaw with its long jaws locked open at 180 degrees, ready to snap
  acid_sprayer: () => ground() + ant('soldier', 36, 49, 58, { palette: FORMICA }) + ACID_DROPS(12, 34),
  trap_jaw: () =>
    ground() + ant('worker', 28, 49, 56, { palette: TRAPJAW }) +
    `<g stroke="${INK}" stroke-width="2.2" stroke-linecap="round" fill="none"><path d="M51,33 L62,27"/><path d="M51,36 L62,41"/></g>` +
    `<g stroke="${TRAPJAW.light}" stroke-width="1" stroke-linecap="round" fill="none"><path d="M52,33 L61,28"/><path d="M52,36 L61,40"/></g>`,
  carrion_beetle: () =>
    ground() +
    `<g stroke="${INK}" stroke-width="1.6" stroke-linecap="round" fill="none"><path d="M20,42 l-4,8 M30,44 l0,7 M40,42 l4,8"/><path d="M49,32 l6,-6 M51,35 l8,-3"/></g>` +
    `<ellipse cx="30" cy="36" rx="19" ry="11" fill="#2a2420" stroke="${INK}" stroke-width="2"/>` +
    `<path d="M17,30 Q30,26 43,30 M16,37 Q30,33 44,37" stroke="#e08a2c" stroke-width="3.2" fill="none" stroke-linecap="round"/>` +
    `<circle cx="51" cy="35" r="5.5" fill="#2a2420" stroke="${INK}" stroke-width="2"/><circle cx="59" cy="31.5" r="1.8" fill="#e08a2c"/>` +
    `<path d="M18,30 a16,9 0 0 1 14,-4" stroke="#8a7a70" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  bullet_ant: () => ground() + ant('worker', 33, 51, 66, { palette: BULLET }) + `<path d="M6,38 l-4,2 l4,1" fill="${BULLET.base}" stroke="${INK}" stroke-width="1"/>`,
  // NPC-only (docs/24-npcs.md): termites have no waist, spiders have eight legs
  termite_worker: () => ground() + termite(false),
  termite_soldier: () => ground() + termite(true),
  spiderling: () => ground() + spider(32, 40, 0.55),
  trapdoor_spider: () =>
    `<path d="M2,50 Q32,44 62,50 L62,60 L2,60Z" fill="#7a5c40"/><path d="M8,47 L30,30 L34,32 L14,48Z" fill="#8f6d4c" stroke="${INK}" stroke-width="1.6"/>` +
    `<path d="M14,47 Q28,40 30,30" stroke="#e8e2d6" stroke-width="0.8" fill="none" opacity="0.8"/>` + spider(38, 42, 1),
};

/** A termite side-on: pale, soft, no waist. Soldiers carry a big amber head and long jaws. */
function termite(soldier: boolean) {
  const legs = `<g stroke="${INK}" stroke-width="1.4" stroke-linecap="round" fill="none"><path d="M22,42 l-4,7 M28,43 l-1,7 M34,43 l2,7 M40,42 l5,7"/></g>`;
  const body = [16, 23, 30, 37].map((x, i) => `<ellipse cx="${x}" cy="${38 - i * 0.3}" rx="7.5" ry="6.2" fill="#efe2c4" stroke="${INK}" stroke-width="1.6"/>`).join('');
  const head = soldier
    ? `<ellipse cx="47" cy="35" rx="8.5" ry="6.5" fill="#d08a3a" stroke="${INK}" stroke-width="1.8"/><path d="M54,33 q8,-3 9,-9 M54,37 q8,1 9,-4" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
    : `<circle cx="46" cy="36" r="5.6" fill="#e5c995" stroke="${INK}" stroke-width="1.8"/>`;
  return legs + body + head + `<path d="M${soldier ? 50 : 48},${soldier ? 30 : 31} l4,-7" stroke="${INK}" stroke-width="1.2"/>`;
}

/** A spider seen from the side and a little above: round abdomen, small head, eight bent legs. */
function spider(cx: number, cy: number, k: number) {
  const legs: string[] = [];
  for (let i = 0; i < 4; i++) {
    const dx = (i - 1.5) * 7 * k;
    legs.push(`<path d="M${f(cx + dx * 0.4)},${f(cy)} q${f(dx * 1.2)},${f(-14 * k)} ${f(dx * 2.4)},${f(10 * k)}" />`);
  }
  return (
    `<g stroke="${INK}" stroke-width="${f(1.8 * k + 0.4)}" fill="none" stroke-linecap="round">${legs.join('')}</g>` +
    `<ellipse cx="${f(cx - 9 * k)}" cy="${f(cy - 2 * k)}" rx="${f(12 * k)}" ry="${f(9 * k)}" fill="#3a2a22" stroke="${INK}" stroke-width="1.8"/>` +
    `<path d="M${f(cx - 15 * k)},${f(cy - 5 * k)} q${f(6 * k)},${f(-4 * k)} ${f(12 * k)},0" stroke="#a07a4a" stroke-width="${f(1.6 * k)}" fill="none"/>` +
    `<circle cx="${f(cx + 6 * k)}" cy="${f(cy)}" r="${f(6 * k)}" fill="#4a362a" stroke="${INK}" stroke-width="1.8"/>` +
    `<circle cx="${f(cx + 9 * k)}" cy="${f(cy - 2 * k)}" r="${f(1.3 * k)}" fill="#e8b23a"/>`
  );
}

// ---------- defenses ----------

const DEFENSE: Record<DefenseId, () => string> = {
  soil_wall: () => {
    const out: string[] = [ground(54)];
    for (let row = 0; row < 4; row++)
      for (let i = 0; i < 5 - (row % 2); i++) {
        const x = 12 + i * 10 + (row % 2) * 5, y = 48 - row * 8.5;
        out.push(`<ellipse cx="${x}" cy="${y}" rx="5.4" ry="4.4" fill="${(i + row) % 2 ? '#7a5c40' : '#8f6d4c'}" stroke="${INK}" stroke-width="1.6"/>`);
      }
    out.push(`<path d="M10,20 q4,-3 8,-2" stroke="#c8a77e" stroke-width="2" fill="none" stroke-linecap="round"/>`);
    return out.join('');
  },
  pit_trap: () =>
    `<path d="M2,30 L18,30 L32,52 L46,30 L62,30 L62,60 L2,60Z" fill="#c9a979" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="M18,30 L32,52 L46,30" fill="#a8885a"/><path d="M22,36 l2,1 M38,38 l2,-1 M28,44 l2,1 M10,40 l2,0 M52,44 l2,0" stroke="#7a5c40" stroke-width="1.4"/>` +
    `<path d="M18,30 L32,52 L46,30" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    ant('worker', 22, 36, 18, {}, false).replace('<g transform="', '<g transform="rotate(48 22 36) '),
  narrow_tunnel: () =>
    `<rect x="2" y="8" width="60" height="50" rx="6" fill="#7a5c40"/>` +
    `<path d="M2,26 C14,26 20,30 26,32 C30,33 34,33 38,32 C44,30 50,26 62,26 L62,44 C50,44 44,40 38,38 C34,37 30,37 26,38 C20,40 14,44 2,44Z" fill="#1c140e"/>` +
    `<path d="M26,32 C30,33 34,33 38,32 M26,38 C30,37 34,37 38,38" stroke="#c8a77e" stroke-width="1.6" fill="none"/>` +
    ant('soldier', 46, 41, 22) + ant('worker', 14, 41, 18),
  acid_sentry: () =>
    ground() + ant('worker', 38, 49, 54) +
    `<g fill="#c8d44a" stroke="#6f7a1a" stroke-width="0.8"><circle cx="14" cy="34" r="2.6"/><circle cx="9" cy="28" r="2.1"/><circle cx="6" cy="21" r="1.7"/><circle cx="12" cy="24" r="1.4"/></g>`,
};

// ---------- research ----------

const RESEARCH: Record<ResearchId, () => string> = {
  mandibles: () =>
    `<circle cx="24" cy="32" r="15" fill="#c98b52" stroke="${INK}" stroke-width="2.4"/><ellipse cx="20" cy="25" rx="7" ry="3" fill="#f2d3a2"/><ellipse cx="30" cy="28" rx="2.6" ry="2.2" fill="${INK}"/>` +
    `<g fill="none" stroke-linecap="round"><path d="M35,33 q18,-10 24,6" stroke="${INK}" stroke-width="7"/><path d="M35,33 q18,-10 24,6" stroke="#8c5730" stroke-width="4.6"/><path d="M34,43 q17,10 23,-4" stroke="${INK}" stroke-width="7"/><path d="M34,43 q17,10 23,-4" stroke="#6e4325" stroke-width="4.6"/></g>` +
    `<path d="M54,18 l1.6,4 l4,1.6 l-4,1.6 l-1.6,4 l-1.6,-4 l-4,-1.6 l4,-1.6Z" fill="#e8b23a" stroke="${INK}" stroke-width="1"/>`,
  chitin: () =>
    `<g stroke="${INK}" stroke-width="2.2"><path d="M10,44 Q32,6 54,44 Q32,52 10,44Z" fill="#a95f2f"/><path d="M15,36 Q32,26 49,36" fill="none"/><path d="M20,27 Q32,20 44,27" fill="none"/></g><path d="M18,34 Q24,22 32,18" stroke="#e0a46e" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  guard_formation: () => ground(56) + ant('soldier', 17, 42, 32) + ant('soldier', 47, 42, 32) + ant('soldier', 32, 54, 38),
  pheromone_trails: () =>
    `<path d="M6,52 C16,30 26,52 36,34 S50,26 54,18" fill="none" stroke="${SCENT}" stroke-width="3" stroke-dasharray="0.1 5" stroke-linecap="round"/>` + ant('worker', 44, 24, 32, {}, false),
  scent_reading: () =>
    `<path d="M8,56 L20,36 Q26,30 34,30" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M8,56 L20,36 Q26,30 34,30" stroke="#c98b52" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="35" cy="30" r="3.4" fill="#c98b52" stroke="${INK}" stroke-width="1.8"/>` +
    `<g fill="none" stroke="${SCENT}" stroke-width="2.4" stroke-linecap="round"><path d="M42,24 a8,8 0 0 1 0,12"/><path d="M48,19 a14,14 0 0 1 0,22"/><path d="M54,14 a20,20 0 0 1 0,32" opacity="0.6"/></g>`,
  colony_mind: () => {
    const head = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="7" fill="#c98b52" stroke="${INK}" stroke-width="2"/><circle cx="${x + 2.4}" cy="${y - 1}" r="1.4" fill="${INK}"/><path d="M${x - 2},${y - 6} l-2,-5 M${x + 2},${y - 6} l3,-5" stroke="${INK}" stroke-width="1.4"/>`;
    return `<circle cx="32" cy="36" r="10" fill="${SCENT}" opacity="0.15"/><path d="M32,20 L16,46 L48,46Z" fill="none" stroke="${SCENT}" stroke-width="2.2" stroke-dasharray="0.1 4" stroke-linecap="round"/>` + head(32, 22) + head(16, 46) + head(48, 46);
  },
  foraging_instinct: () =>
    `<g transform="rotate(-25 28 36)"><path d="M8,36 Q28,14 48,36 Q28,50 8,36Z" fill="#8db255" stroke="${INK}" stroke-width="2.2"/><path d="M10,36 L46,36" stroke="#5f7d36" stroke-width="1.6"/></g>` +
    `<path d="M50,10 l2.4,6 l6,2.4 l-6,2.4 l-2.4,6 l-2.4,-6 l-6,-2.4 l6,-2.4Z" fill="#e8b23a" stroke="${INK}" stroke-width="1.2"/>`,
  brood_science: () =>
    `<g transform="translate(32 36) scale(1.45) translate(-32 -36)">` + egg(10, 36, 0).replace(/rx="2.6" ry="1.8"/, 'rx="4" ry="2.8"') + `<path d="M17,36 h5 l-2,-2 M22,36 l-2,2" stroke="${INK}" stroke-width="1.4" fill="none"/>` +
    larva(32, 40, 1.4) + `<path d="M41,36 h5 l-2,-2 M46,36 l-2,2" stroke="${INK}" stroke-width="1.4" fill="none"/>` + pupa(54, 36, 0) + '</g>',
  deep_digging: () =>
    `<rect x="8" y="10" width="48" height="46" rx="6" fill="#6b4f37" stroke="${INK}" stroke-width="2"/><rect x="8" y="10" width="48" height="6" rx="3" fill="#6f9a3e"/>` +
    `<path d="M32,16 L32,48" stroke="#1c140e" stroke-width="8" stroke-linecap="round"/><path d="M24,40 L32,50 L40,40" fill="none" stroke="#e8b23a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="16" cy="28" r="2" fill="#4a3727"/><circle cx="47" cy="36" r="2.4" fill="#4a3727"/>`,
  nuptial_flight: () =>
    `<path d="M6,58 C14,48 20,52 26,40" fill="none" stroke="#8a6a4a" stroke-width="2" stroke-dasharray="0.1 4" stroke-linecap="round"/>` +
    ant('alate', 38, 34, 42).replace('<g transform="', '<g transform="rotate(-28 38 30) '),
  aphid_husbandry: () => aphid(28, 34, 0, 4.2) + drop(52, 46, 1.6),
  symbiosis: () =>
    ground() + ant('worker', 17, 49, 34) +
    `<g transform="translate(47 50) scale(-0.74 0.74) translate(-32 -50)"><ellipse cx="30" cy="36" rx="19" ry="11" fill="#2a2420" stroke="${INK}" stroke-width="2.6"/><path d="M17,30 Q30,26 43,30 M16,37 Q30,33 44,37" stroke="#e08a2c" stroke-width="4" fill="none"/><circle cx="51" cy="35" r="5.5" fill="#2a2420" stroke="${INK}" stroke-width="2.6"/><path d="M20,42 l-4,8 M30,44 l0,7 M40,42 l4,8" stroke="${INK}" stroke-width="2.2"/></g>` +
    `<path d="M28,28 Q32,22 36,28" stroke="${SCENT}" stroke-width="2" fill="none" stroke-dasharray="0.1 3.5" stroke-linecap="round"/>`,
  supercolony: () => {
    const mound = (x: number, y: number) => `<path d="M${x - 9},${y} Q${x},${y - 12} ${x + 9},${y}Z" fill="#8f6d4c" stroke="${INK}" stroke-width="1.8"/><ellipse cx="${x}" cy="${y - 4}" rx="2.4" ry="1.6" fill="#1c140e"/>`;
    return `<path d="M20,46 L32,24 L46,46 Z" fill="none" stroke="#8a6a4a" stroke-width="2" stroke-dasharray="0.1 4" stroke-linecap="round"/>` + mound(32, 26) + mound(18, 50) + mound(46, 50);
  },

  // Build 6 (docs/21-tech-tree.md)
  /** A pellet wall with a fat drop of acid over it: defenses that sting. */
  formic_acid: () =>
    pellets(54, 3, 4) +
    `<path d="M30,6 C36,16 44,22 44,31 A12,12 0 0 1 20,31 C20,22 26,16 30,6Z" fill="#c8d44a" stroke="${INK}" stroke-width="2.2"/><path d="M24,30 Q24,22 29,16" stroke="#eef39a" stroke-width="3" fill="none" stroke-linecap="round"/>` +
    `<g fill="#c8d44a" stroke="#6f7a1a" stroke-width="0.8"><circle cx="50" cy="20" r="2.4"/><circle cx="54" cy="12" r="1.7"/><circle cx="12" cy="18" r="1.8"/></g>`,
  /** Soldiers marching in a column along a trail. */
  raiding_columns: () =>
    `<g transform="rotate(-14 32 44)">${ground(50)}<path d="M2,42 L62,42" stroke="#8a6a4a" stroke-width="2" stroke-dasharray="0.1 4" stroke-linecap="round"/>` +
    ant('soldier', 9, 49, 29) + ant('soldier', 32, 49, 29) + ant('soldier', 55, 49, 29) + '</g>',
  /** The tunnel mouth plugged by a soldier's flat, armoured head. */
  nest_plugging: () =>
    `<rect x="6" y="8" width="52" height="50" rx="6" fill="#6b4f37" stroke="${INK}" stroke-width="2"/><rect x="6" y="8" width="52" height="6" rx="3" fill="#6f9a3e"/>` +
    `<circle cx="32" cy="36" r="15" fill="#1c140e"/><circle cx="32" cy="36" r="12" fill="#713c1c" stroke="${INK}" stroke-width="2"/>` +
    `<path d="M23,32 Q32,26 41,32 M22,38 Q32,33 42,38" stroke="#a95f2f" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M26,29 Q30,26 35,26" stroke="#e0a46e" stroke-width="2" fill="none" stroke-linecap="round"/>` +
    `<path d="M27,46 q-3,4 1,6 M37,46 q3,4 -1,6" stroke="#c98b52" stroke-width="2.2" fill="none" stroke-linecap="round"/>` +
    `<circle cx="13" cy="24" r="1.8" fill="#4a3727"/><circle cx="50" cy="50" r="2.2" fill="#4a3727"/>`,
  /** Two hunters bringing down a beetle far bigger than either. */
  group_hunting: () =>
    ground() + beetle(32, 50, 1.6) + ant('worker', 12, 49, 26) + ant('worker', 53, 49, 26, {}, true),
  /** A pale fungus garden with a cut leaf worked in. */
  fungus_farming: () =>
    ground(54) + fungusMound(32, 52, 20, 18, 4) +
    `<g transform="rotate(-30 46 18)"><path d="M34,18 Q46,8 58,18 Q46,25 34,18Z" fill="#8db255" stroke="${INK}" stroke-width="1.8"/><path d="M36,18 L56,18" stroke="#5f7d36" stroke-width="1.2"/></g>`,
  /** A honeypot ant hanging from the ceiling: living storage. */
  repletes: () =>
    `<path d="M4,8 Q32,13 60,8" stroke="#8a6a4a" stroke-width="3" fill="none" stroke-linecap="round"/>` + replete(32, 9, 1.6),
  /** A nurse feeding a larva. */
  nurse_workers: () =>
    ground() + ant('worker', 22, 49, 38) + larva(50, 49, 1.6, true).replace('stroke="#efe6d2" stroke-width="4.2"', `stroke="${INK}" stroke-width="5.8"`) + larva(50, 49, 1.6, true) + drop(41.5, 41, 0.6),
  /** A tunnel arch lined with packed pellets, and a quick-dig arrow. */
  tunnel_engineering: () =>
    `<rect x="6" y="8" width="52" height="50" rx="6" fill="#6b4f37" stroke="${INK}" stroke-width="2"/>` +
    `<path d="M14,58 L14,36 A18,18 0 0 1 50,36 L50,58Z" fill="#1c140e"/>` +
    [...Array(9)].map((_, i) => { const a = Math.PI * (i / 8); return `<ellipse cx="${f(32 - Math.cos(a) * 20)}" cy="${f(36 - Math.sin(a) * 20)}" rx="3.6" ry="3" fill="${i % 2 ? '#7a5c40' : '#8f6d4c'}" stroke="${INK}" stroke-width="1.2"/>`; }).join('') +
    `<path d="M22,48 L40,48 M34,42 L40,48 L34,54" fill="none" stroke="#e8b23a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  /** A leader and a follower, antenna to gaster: tandem running. */
  tandem_running: () =>
    ground() + `<path d="M6,40 C14,36 20,44 28,40" stroke="${SCENT}" stroke-width="2" fill="none" stroke-dasharray="0.1 3.5" stroke-linecap="round"/>` +
    ant('worker', 20, 49, 30) + ant('worker', 45, 49, 30) +
    `<path d="M54,14 l1.6,4 l4,1.6 l-4,1.6 l-1.6,4 l-1.6,-4 l-4,-1.6 l4,-1.6Z" fill="#e8b23a" stroke="${INK}" stroke-width="1"/>`,
  /** A scout wrapped in a borrowed smell, half hidden. */
  chemical_mimicry: () =>
    ground() + `<ellipse cx="32" cy="38" rx="27" ry="17" fill="${SCENT}" opacity="0.14"/>` +
    `<g opacity="0.55">${ant('worker', 32, 49, 50)}</g>` +
    `<ellipse cx="32" cy="38" rx="27" ry="17" fill="none" stroke="${SCENT}" stroke-width="2.2" stroke-dasharray="0.1 4.5" stroke-linecap="round"/>`,
};

/** A short wall of soil pellets, `rows` high, sitting on y. */
function pellets(y: number, rows: number, per: number) {
  const out: string[] = [];
  for (let row = 0; row < rows; row++)
    for (let i = 0; i < per - (row % 2); i++) {
      const x = 32 - ((per - 1) * 10) / 2 + i * 10 + (row % 2) * 5;
      out.push(`<ellipse cx="${x}" cy="${y - row * 8}" rx="5.4" ry="4.4" fill="${(i + row) % 2 ? '#7a5c40' : '#8f6d4c'}" stroke="${INK}" stroke-width="1.6"/>`);
    }
  return out.join('');
}

/** A spongy fungus mound outside the hollow, for research pictures. */
function fungusMound(cx: number, y: number, w: number, h: number, seed: number) {
  const r = seeded(seed), out: string[] = [`<path d="M${cx - w},${y} C${cx - w * 0.7},${y - h * 1.3} ${cx + w * 0.7},${y - h * 1.3} ${cx + w},${y}Z" fill="#cbbfa6" stroke="${INK}" stroke-width="2"/>`];
  for (let i = 0; i < 30; i++) {
    const x = cx - w * 0.8 + r() * w * 1.6, top = y - h * Math.sqrt(Math.max(0, 1 - ((x - cx) / w) ** 2));
    out.push(`<circle cx="${f(x)}" cy="${f(top + 3 + r() * (y - top - 4))}" r="${f(1.6 + r() * 1.8)}" fill="${r() < 0.35 ? '#d9cfb8' : '#efe7d6'}"/>`);
  }
  return out.join('');
}

export type PicKind = 'chamber' | 'unit' | 'defense' | 'research';
const TABLES: Record<PicKind, Record<string, () => string>> = { chamber: CHAMBER, unit: UNIT, defense: DEFENSE, research: RESEARCH };

const cache = new Map<string, string>();
/** The picture's SVG markup (64 × 64), or null if there isn't one for this id yet. */
export function picSvg(kind: PicKind, id: string): string | null {
  const key = `${kind}:${id}`;
  if (!cache.has(key)) {
    const draw = TABLES[kind][id];
    cache.set(key, draw ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true">${draw()}</svg>` : '');
  }
  return cache.get(key) || null;
}

/** Every id with a picture, for the preview sheet. */
export const PIC_IDS: Record<PicKind, string[]> = {
  chamber: Object.keys(CHAMBER),
  unit: Object.keys(UNIT),
  defense: Object.keys(DEFENSE),
  research: Object.keys(RESEARCH),
};
