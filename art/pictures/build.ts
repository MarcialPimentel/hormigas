// Writes a preview sheet of every picture (client/src/art/icons.ts): all chambers, units, defenses and
// research on their light tiles, at list size and phone size.
//   npx tsx art/pictures/build.ts
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASTES, CHAMBERS, DEFENSES, RESEARCH } from '../../shared/src/index';
import { PIC_IDS, picSvg, type PicKind } from '../../client/src/art/icons';

const OUT = dirname(fileURLToPath(import.meta.url));
const NAME: Record<PicKind, (id: string) => string> = {
  chamber: (id) => (CHAMBERS as any)[id].name, unit: (id) => (CASTES as any)[id].name,
  defense: (id) => (DEFENSES as any)[id].name, research: (id) => (RESEARCH as any)[id].name,
};
const section = (kind: PicKind, title: string) =>
  `<h2>${title} (${PIC_IDS[kind].length})</h2><div class="grid">${PIC_IDS[kind]
    .map((id) => `<figure><span class="tile">${picSvg(kind, id)}</span><span class="tile s">${picSvg(kind, id)}</span><figcaption>${NAME[kind](id)}</figcaption></figure>`)
    .join('')}</div>`;
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Hormigas pictures</title>
<style>
body{margin:0;padding:24px;background:#e9ece0;color:#2b1d13;font:14px system-ui,sans-serif}
@media (prefers-color-scheme:dark){body{background:#231a14;color:#efe4d2}}
h2{font-size:13px;letter-spacing:.06em;text-transform:uppercase;opacity:.75;margin:26px 0 10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
figure{margin:0;display:grid;grid-template-columns:auto auto;gap:6px 10px;align-items:end;justify-content:start}
figcaption{grid-column:1/-1;font-weight:600}
.tile{width:64px;height:64px;border-radius:12px;background:#f7f4ea;border:2px solid #2b1d13;box-shadow:inset 0 0 0 3px #f7f4ea,inset 0 0 0 4.5px #c9d8a6;display:grid;place-items:center}
.tile svg{width:88%;height:88%}.tile.s{width:40px;height:40px;border-radius:9px}
</style></head><body>
${section('chamber', 'Chambers')}${section('unit', 'Units')}${section('defense', 'Defenses')}${section('research', 'Research')}
</body></html>`;
writeFileSync(join(OUT, 'preview.html'), html);
console.log('wrote preview.html');
