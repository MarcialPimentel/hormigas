// Ant sprites for the Nest View: each caste's walk poses (client/src/art/ants.ts) rasterised once
// to canvases, then wrapped as Pixi textures for each scene.
import { CanvasSource, Graphics, Texture } from 'pixi.js';
import { CASTES, FOOT_Y, WALK_SWINGS, antSvg, type Caste } from '../art/ants';

/** Pixels per body unit when rasterising: sharp at 2× screens for ants up to ~25px long. */
const RASTER = 1.25;
const CASTE_LIST = Object.keys(CASTES) as Caste[];

let canvases: Promise<Record<Caste, HTMLCanvasElement[]>> | null = null;

async function rasterise(svg: string, w: number, h: number) {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w);
  canvas.height = Math.ceil(h);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function loadCanvases() {
  canvases ??= (async () => {
    const out = {} as Record<Caste, HTMLCanvasElement[]>;
    for (const c of CASTE_LIST) {
      const [, , w, h] = CASTES[c].vb;
      out[c] = await Promise.all(WALK_SWINGS.map((swing) => rasterise(antSvg(c, { lod: 'sprite', swing }, `width="${w * RASTER}" height="${h * RASTER}"`), w * RASTER, h * RASTER)));
    }
    return out;
  })();
  return canvases;
}

export type AntFrames = Record<Caste, Texture[]>;

/** Fresh textures for one Pixi scene (textures belong to a renderer); call `destroy` with the scene. */
export async function antTextures(): Promise<{ frames: AntFrames; destroy: () => void }> {
  const src = await loadCanvases();
  const all: Texture[] = [];
  const frames = {} as AntFrames;
  for (const c of CASTE_LIST) {
    frames[c] = src[c].map((canvas) => {
      const t = new Texture({ source: new CanvasSource({ resource: canvas }) });
      all.push(t);
      return t;
    });
  }
  return { frames, destroy: () => all.forEach((t) => t.destroy(true)) };
}

/** Body length on screen, in px, for each caste in the whole-nest view. */
export const NEST_LEN: Record<Caste, number> = { worker: 11, soldier: 13, queen: 15, alate: 15 };

/**
 * Draw one ant centred on (x, y) (or standing on it, with `feet`), heading at `angle` (radians, 0 = right).
 * Ants heading left are mirrored rather than turned upside down. `len` is the sprite width in px.
 */
export function drawAnt(g: Graphics, frames: AntFrames, caste: Caste, x: number, y: number, angle: number, opts: { len?: number; frame?: number; tint?: number; feet?: boolean } = {}) {
  const tex = frames[caste][(opts.frame ?? 1) % WALK_SWINGS.length];
  const [, vy, vw, vh] = CASTES[caste].vb;
  const len = opts.len ?? NEST_LEN[caste];
  const k = len / vw;
  const left = Math.cos(angle) < -0.01;
  g.save();
  g.translateTransform(x, y);
  g.rotateTransform(left ? angle + Math.PI : angle);
  if (left) g.scaleTransform(-1, 1);
  const oy = opts.feet ? FOOT_Y - vy : vh / 2;
  g.texture(tex, opts.tint ?? 0xffffff, -(vw / 2) * k, -oy * k, vw * k, vh * k);
  g.restore();
}

/** Walk pose for an ant that has travelled `d` px: one frame every couple of px, so legs match speed. */
export const walkFrame = (d: number, len = 11) => Math.floor(Math.abs(d) / (len * 0.18)) % WALK_SWINGS.length;
