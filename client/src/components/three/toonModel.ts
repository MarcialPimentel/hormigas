// Meshy models drawn like the ants: three flat toon bands, a gloss spot, the warm rim and a dark ink outline.
// Each model was made with Meshy and coloured per part in Blender (art/meshy/<name>/), then stored as parts in a
// JSON file here. A part flagged `wing` (thin and see-through) is two-sided and gets no outline.
//  - the dead grasshopper windfall (docs/25-windfalls.md): on its back, legs in the air, X eyes
//  - the termite mound (docs/24-npcs.md): a tall clay spire with buttress ridges and arched entrances
//  - the colony mound (docs/art/whole-yard.md): a low dome of cocoa soil clods round a crater, three growth stages
import * as THREE from 'three';
import grasshopper from './grasshopper.json';
import termiteMound from './termite-mound.json';
import colonyMound from './colony-mound.json';
import { antUniforms, toonBands } from '../nest3d/ants3d';

type Part = { name: string; color: string; wing: boolean; p: number[]; i: number[] };
type ModelData = { parts: Part[] };
type Wrap = <M extends THREE.Material>(m: M) => M;

/** Merge parts into one geometry with a colour per vertex; normals are smoothed within each part only. */
function merge(parts: Part[]) {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = [];
  const c = new THREE.Color();
  for (const part of parts) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(part.p, 3));
    g.setIndex(part.i);
    g.computeVertexNormals();
    const base = pos.length / 3, N = g.attributes.normal;
    c.set(part.color);
    for (let k = 0; k < N.count; k++) {
      pos.push(part.p[k * 3], part.p[k * 3 + 1], part.p[k * 3 + 2]);
      nor.push(N.getX(k), N.getY(k), N.getZ(k));
      col.push(c.r, c.g, c.b);
    }
    for (const i of part.i) idx.push(base + i);
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

function toonMaterial(bands: THREE.Texture, side: THREE.Side) {
  const m = new THREE.MeshToonMaterial({ gradientMap: bands, vertexColors: true, side });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = antUniforms.uRim;
    sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace(
      '#include <dithering_fragment>',
      `vec3 nV = normalize(normal);
      float gloss = smoothstep(0.84, 0.87, dot(nV, normalize(vec3(-0.35, 0.8, 0.5))));
      gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 1.35 + vec3(0.1, 0.1, 0.04), gloss * 0.7);
      float rimF = 1.0 - clamp(dot(nV, normalize(vViewPosition)), 0.0, 1.0);
      gl_FragColor.rgb += uRim * rimF * rimF * 0.5;
      #include <dithering_fragment>`,
    );
  };
  m.customProgramCacheKey = () => 'toon-model';
  return m;
}

function inkMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: '#1c0f08', side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * 0.012;');
  };
  m.customProgramCacheKey = () => 'toon-model-ink';
  return m;
}

/**
 * One set of geometry and materials per scene; `make()` hands out a copy of the model standing on y = 0.
 * `wrap` lets a scene add its own shader bits (the Whole Yard's fog of war) to every material.
 */
function createToonModel(data: ModelData, wrap: Wrap) {
  const parts = data.parts;
  const body = merge(parts.filter((p) => !p.wing));
  const wings = merge(parts.filter((p) => p.wing));
  const bands = toonBands();
  const bodyMat = wrap(toonMaterial(bands, THREE.FrontSide));
  const wingMat = wrap(toonMaterial(bands, THREE.DoubleSide));
  const ink = wrap(inkMaterial());
  return {
    make(shadows = true) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(body, bodyMat), w = new THREE.Mesh(wings, wingMat), o = new THREE.Mesh(body, ink);
      b.castShadow = w.castShadow = shadows;
      b.receiveShadow = w.receiveShadow = shadows;
      g.add(b, w, o);
      return g;
    },
    dispose() {
      for (const d of [body, wings, bands, bodyMat, wingMat, ink]) d.dispose();
    },
  };
}

/** The dead grasshopper: 1 unit nose to tail, head towards +z. */
export const createGrasshoppers = (wrap: Wrap = (m) => m) => createToonModel(grasshopper as ModelData, wrap);
/** The termite mound: 1 unit tall, about 1.15 across its base. */
export const createTermiteMounds = (wrap: Wrap = (m) => m) => createToonModel(termiteMound as ModelData, wrap);

/** The colony mound's growth stages (small, medium, big): each 1 unit tall and 1 unit in radius, the entrance at the
 *  origin. Bigger stages carry more pebbles round the foot. Scenes stretch a stage to its radius and height. */
export const COLONY_MOUND_STAGES = (colonyMound as { stages: ModelData[] }).stages;

/** Every triangle of a colony mound stage as a flat [x, y, z, ...] list (three per triangle), for height maps. */
export function colonyMoundTriangles(stage: number) {
  const out: number[] = [];
  for (const part of COLONY_MOUND_STAGES[stage].parts) for (const i of part.i) out.push(part.p[i * 3], part.p[i * 3 + 1], part.p[i * 3 + 2]);
  return out;
}

/** Colony mounds, one model per stage. `lighten` lifts the soil colours (not the hole or pebbles), e.g. for your own. */
export function createColonyMounds(wrap: Wrap = (m) => m, lighten = 0) {
  const c = new THREE.Color();
  const stages = COLONY_MOUND_STAGES.map((d) =>
    createToonModel(
      {
        parts: d.parts.map((p) =>
          lighten && p.name.startsWith('soil_') && p.name !== 'soil_hole' ? { ...p, color: '#' + c.set(p.color).offsetHSL(0, 0, lighten).getHexString() } : p,
        ),
      },
      wrap,
    ),
  );
  return {
    make: (stage: number, shadows = true) => stages[stage].make(shadows),
    dispose() {
      for (const s of stages) s.dispose();
    },
  };
}

/**
 * Height of a colony mound stage over the ground, in model units (radius 1, height 1): a top-down height map of its
 * mesh, with a 3×3 median so a thin twig doesn't make the ants hop, and its steep foot eased into a ramp. Returns 0 off
 * the mound. Near the middle it drops
 * away down the entrance, so ants walk in and out of the hole.
 */
export function colonyMoundHeights(stage: number, n = 72) {
  const half = 1.2, cell = (half * 2) / n, hm = new Float32Array(n * n);
  const p = colonyMoundTriangles(stage);
  for (let t = 0; t + 8 < p.length; t += 9) {
    const ax = p[t], ay = p[t + 1], az = p[t + 2], bx = p[t + 3], by = p[t + 4], bz = p[t + 5], cx = p[t + 6], cy = p[t + 7], cz = p[t + 8];
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(det) < 1e-12) continue;
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) + half) / cell)), x1 = Math.min(n - 1, Math.ceil((Math.max(ax, bx, cx) + half) / cell));
    const z0 = Math.max(0, Math.floor((Math.min(az, bz, cz) + half) / cell)), z1 = Math.min(n - 1, Math.ceil((Math.max(az, bz, cz) + half) / cell));
    for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
      const x = ix * cell - half, z = iz * cell - half;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, w = 1 - u - v;
      if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;
      const k = iz * n + ix, y = u * ay + v * by + w * cy;
      if (y > hm[k]) hm[k] = y;
    }
  }
  const out = new Float32Array(n * n), nine: number[] = [];
  const at = (ix: number, iz: number) => hm[Math.min(n - 1, Math.max(0, iz)) * n + Math.min(n - 1, Math.max(0, ix))];
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    nine.length = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) nine.push(at(ix + dx, iz + dz));
    out[iz * n + ix] = nine.sort((a, b) => a - b)[4];
  }
  // the mound's sides bulge out near the foot: cap its height by the distance in from the bare ground round it (two
  // chamfer passes), so ants walk down a ramp of soil rather than stepping off a ledge; at worst their feet sink a hair
  // into the bulge. The entrance pit doesn't count as ground, so the crater keeps its shape.
  const dist = new Float32Array(n * n);
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    const k = iz * n + ix, r = Math.hypot(ix * cell - half, iz * cell - half);
    dist[k] = out[k] < 0.02 && r > 0.3 ? 0 : 1e9;
  }
  const diag = cell * Math.SQRT2;
  const relax = (k: number, jx: number, jz: number, w: number) => {
    if (jx < 0 || jz < 0 || jx >= n || jz >= n) return;
    const v = dist[jz * n + jx] + w;
    if (v < dist[k]) dist[k] = v;
  };
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    const k = iz * n + ix;
    relax(k, ix - 1, iz, cell); relax(k, ix, iz - 1, cell); relax(k, ix - 1, iz - 1, diag); relax(k, ix + 1, iz - 1, diag);
  }
  for (let iz = n - 1; iz >= 0; iz--) for (let ix = n - 1; ix >= 0; ix--) {
    const k = iz * n + ix;
    relax(k, ix + 1, iz, cell); relax(k, ix, iz + 1, cell); relax(k, ix + 1, iz + 1, diag); relax(k, ix - 1, iz + 1, diag);
  }
  for (let k = 0; k < n * n; k++) out[k] = Math.min(out[k], dist[k] * 4);
  return (x: number, z: number) => {
    const fx = (x + half) / cell, fz = (z + half) / cell, ix = Math.floor(fx), iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix >= n - 1 || iz >= n - 1) return 0;
    const tx = fx - ix, tz = fz - iz, k = iz * n + ix;
    let y = (out[k] * (1 - tx) + out[k + 1] * tx) * (1 - tz) + (out[k + n] * (1 - tx) + out[k + n + 1] * tx) * tz;
    const r = Math.hypot(x, z);
    if (r < 0.1) y -= (0.1 - r) * 2.5;
    return y;
  };
}
