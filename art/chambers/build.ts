// Writes the stand-in chamber SVGs and a preview sheet from the game's chamber art (client/src/art/chambers.ts).
//   npx tsx art/chambers/build.ts
// Edit client/src/art/chambers.ts, not the SVGs.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAMBERS, CHAMBER_IDS } from '../../shared/src/index';
import { SIGNATURE, VIEW, chamberBody, chamberSvg } from '../../client/src/art/chambers';

const OUT = dirname(fileURLToPath(import.meta.url));
for (const id of CHAMBER_IDS) writeFileSync(join(OUT, `${id}.svg`), chamberSvg(id) + '\n');

const svg = (id: (typeof CHAMBER_IDS)[number], w: number, uid: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW.w} ${VIEW.h}" width="${w}" height="${Math.round((w * VIEW.h) / VIEW.w)}">${chamberBody(id, uid)}</svg>`;
const cards = CHAMBER_IDS.map(
  (id) => `<figure>${svg(id, 400, `${id}-big`)}<figcaption><b>${CHAMBERS[id].name}</b><span>${SIGNATURE[id]}</span></figcaption></figure>`,
).join('');
const small = CHAMBER_IDS.map((id) => `<div class="mini">${svg(id, 90, `${id}-mini`)}<span>${CHAMBERS[id].name}</span></div>`).join('');
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Hormigas chambers</title>
<style>
body{margin:0;background:#231a14;color:#efe4d2;font:14px system-ui,sans-serif;padding:24px}
h2{font-weight:600;margin:28px 0 12px;color:#a8957e;font-size:13px;letter-spacing:.06em;text-transform:uppercase}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
figure{margin:0;background:#30241b;border-radius:12px;padding:10px}
figure svg{display:block;width:100%;height:auto;border-radius:8px;background:#33261b}
figcaption{display:flex;justify-content:space-between;gap:12px;margin-top:6px}figcaption span{color:#a8957e}
.minis{display:flex;flex-wrap:wrap;gap:18px;background:#33261b;padding:16px;border-radius:12px}
.mini{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;color:#a8957e}
</style></head><body>
<h2>Level 1 stand-ins</h2><div class="grid">${cards}</div>
<h2>At nest size (about 90px wide)</h2><div class="minis">${small}</div>
</body></html>`;
writeFileSync(join(OUT, 'preview.html'), html);
console.log(`wrote ${CHAMBER_IDS.length} svgs + preview.html to ${OUT}`);
