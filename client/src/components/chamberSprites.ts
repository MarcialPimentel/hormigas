// Chamber art for the whole-nest view: each chamber's nest version (client/src/art/chambers.ts, no wall or
// tunnel mouth) rasterised once, then wrapped as Pixi textures for each scene and fitted to the chamber.
import { CanvasSource, Graphics, Texture } from 'pixi.js';
import { CHAMBER_IDS, type ChamberId } from '@hormigas/shared';
import { HOLLOW, VIEW, chamberBody } from '../art/chambers';
import { rasterise } from './antSprites';

/** Pixels per art unit: sharp on 2× screens for chambers up to ~100px wide. */
const RASTER = 2;
let canvases: Promise<Record<ChamberId, HTMLCanvasElement>> | null = null;

function loadCanvases() {
  canvases ??= (async () => {
    const out = {} as Record<ChamberId, HTMLCanvasElement>;
    await Promise.all(
      CHAMBER_IDS.map(async (id) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW.w} ${VIEW.h}" width="${VIEW.w * RASTER}" height="${VIEW.h * RASTER}">${chamberBody(id, `nest-${id}`, { nest: true })}</svg>`;
        out[id] = await rasterise(svg, VIEW.w * RASTER, VIEW.h * RASTER);
      }),
    );
    return out;
  })();
  return canvases;
}

export type ChamberTextures = Record<ChamberId, Texture>;

/** Fresh textures for one Pixi scene; call `destroy` with the scene. */
export async function chamberTextures(): Promise<{ rooms: ChamberTextures; destroy: () => void }> {
  const src = await loadCanvases();
  const rooms = {} as ChamberTextures;
  for (const id of CHAMBER_IDS) rooms[id] = new Texture({ source: new CanvasSource({ resource: src[id] }) });
  return { rooms, destroy: () => Object.values(rooms).forEach((t) => t.destroy(true)) };
}

/** Draw a chamber's art so its hollow fills the ellipse centred on (x, y) with radii (rx, ry). */
export function drawChamber(g: Graphics, rooms: ChamberTextures, id: ChamberId, x: number, y: number, rx: number, ry: number) {
  const sx = rx / HOLLOW.rx;
  const sy = ry / HOLLOW.ry;
  g.texture(rooms[id], 0xffffff, x - HOLLOW.cx * sx, y - HOLLOW.cy * sy, VIEW.w * sx, VIEW.h * sy);
}
