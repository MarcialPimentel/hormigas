// Writes the ant SVGs and a preview sheet from the game's own ant art (client/src/art/ants.ts).
//   npx tsx art/ants/build.ts
// Edit client/src/art/ants.ts, not the SVGs.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASTES, antSvg, type Caste } from '../../client/src/art/ants';

const OUT = dirname(fileURLToPath(import.meta.url));
const castes = Object.keys(CASTES) as Caste[];
for (const c of castes) {
  writeFileSync(join(OUT, `${c}-sprite.svg`), antSvg(c, { lod: 'sprite' }) + '\n');
  writeFileSync(join(OUT, `${c}-portrait.svg`), antSvg(c, { lod: 'portrait' }) + '\n');
}

const w = (c: Caste) => CASTES[c].vb[2];
const portraits = castes.map((c) => `<figure><div>${antSvg(c, { lod: 'portrait' }, `width="${w(c) * 4.2}"`)}</div><figcaption>${c}</figcaption></figure>`).join('');
const sizes = castes.map((c) => `<div class="row"><span>${c}</span>${[48, 24, 16, 12].map((px) => antSvg(c, { lod: 'sprite' }, `width="${Math.round((px * w(c)) / 60)}"`)).join('')}</div>`).join('');
const walkers = ([['worker', 0], ['worker', 2.4], ['soldier', 5.3], ['worker', 7.6], ['queen', 10.4], ['worker', 13]] as [Caste, number][])
  .map(([c, d]) => `<div class="walker" style="animation-delay:-${d}s">${antSvg(c, { lod: 'sprite', walk: true }, `width="${Math.round((18 * w(c)) / 60)}"`)}</div>`)
  .join('');
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
