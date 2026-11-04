// The dead grasshopper windfall (docs/25-windfalls.md): on its back, legs in the air, X eyes. Made with Meshy and
// coloured in Blender (art/meshy/grasshopper/), stored as parts in grasshopper.json. Drawn like the ants: three
// flat toon bands, a gloss spot, the warm rim and a dark ink outline; the see-through wings get no outline.
import * as THREE from 'three';
import data from './grasshopper.json';
import { antUniforms, toonBands } from '../nest3d/ants3d';

type Part = { name: string; color: string; wing: boolean; p: number[]; i: number[] };

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
  m.customProgramCacheKey = () => 'grasshopper-toon';
  return m;
}

function inkMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: '#1c0f08', side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * 0.012;');
  };
  m.customProgramCacheKey = () => 'grasshopper-ink';
  return m;
}

/**
 * One set of geometry and materials per scene; `make()` hands out a model 1 unit nose to tail, lying on y = 0 with
 * its head towards +z. `wrap` lets a scene add its own shader bits (the Whole Yard's fog of war) to every material.
 */
export function createGrasshoppers(wrap: <M extends THREE.Material>(m: M) => M = (m) => m) {
  const parts = data.parts as Part[];
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
