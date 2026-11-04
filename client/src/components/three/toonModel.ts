// Meshy models drawn like the ants: three flat toon bands, a gloss spot, the warm rim and a dark ink outline.
// Each model was made with Meshy and coloured per part in Blender (art/meshy/<name>/), then stored as parts in a
// JSON file here. A part flagged `wing` (thin and see-through) is two-sided and gets no outline.
//  - the dead grasshopper windfall (docs/25-windfalls.md): on its back, legs in the air, X eyes
//  - the termite mound (docs/24-npcs.md): a tall clay spire with buttress ridges and arched entrances
//  - the aphid herd (docs/24-npcs.md) builds on the helpers here in aphidHerd.ts: a poppy with aphids on it
import * as THREE from 'three';
import grasshopper from './grasshopper.json';
import termiteMound from './termite-mound.json';
import { antUniforms, toonBands } from '../nest3d/ants3d';

export type PropPart = { name: string; color: string; p: number[]; i: number[] };

/** Merge parts into one geometry with a colour per vertex; normals are smoothed within each part only. */
export function mergeParts(parts: PropPart[]) {
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

/** GLSL run on `transformed` before projection, shared by a prop's toon and ink materials so both move together. */
export type VertexBend = { uniforms: Record<string, THREE.IUniform>; glsl: string; key: string };

function bend(sh: THREE.WebGLProgramParametersWithUniforms, b?: VertexBend) {
  if (!b) return;
  Object.assign(sh.uniforms, b.uniforms);
  const decl = Object.keys(b.uniforms).map((u) => `uniform float ${u};`).join('\n');
  sh.vertexShader = decl + '\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + b.glsl);
}

export function toonPropMaterial(bands: THREE.Texture, side: THREE.Side, key: string, b?: VertexBend) {
  const m = new THREE.MeshToonMaterial({ gradientMap: bands, vertexColors: true, side });
  m.onBeforeCompile = (sh) => {
    bend(sh, b);
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
  m.customProgramCacheKey = () => key + '-toon' + (b ? '|' + b.key : '');
  return m;
}

/** The ink outline: the back faces pushed out a little along their normals. `width` is in the model's own units. */
export function inkPropMaterial(key: string, width = 0.012, b?: VertexBend) {
  const m = new THREE.MeshBasicMaterial({ color: '#1c0f08', side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    bend(sh, b);
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normalize(normal) * ${width.toFixed(4)};`);
  };
  m.customProgramCacheKey = () => key + '-ink' + (b ? '|' + b.key : '');
  return m;
}

type Part = PropPart & { wing: boolean };
type ModelData = { parts: Part[] };
type Wrap = <M extends THREE.Material>(m: M) => M;

/**
 * One set of geometry and materials per scene; `make()` hands out a copy of the model standing on y = 0.
 * `wrap` lets a scene add its own shader bits (the Whole Yard's fog of war) to every material.
 */
function createToonModel(data: ModelData, wrap: Wrap) {
  const parts = data.parts;
  const body = mergeParts(parts.filter((p) => !p.wing));
  const wings = mergeParts(parts.filter((p) => p.wing));
  const bands = toonBands();
  const bodyMat = wrap(toonPropMaterial(bands, THREE.FrontSide, 'toon-model'));
  const wingMat = wrap(toonPropMaterial(bands, THREE.DoubleSide, 'toon-model-wing'));
  const ink = wrap(inkPropMaterial('toon-model'));
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
