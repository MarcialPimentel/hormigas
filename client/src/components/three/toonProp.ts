// Props drawn like the ants (the Meshy grasshopper and aphid herd): flat parts coloured per vertex, three toon
// bands, a gloss spot, the warm rim and a dark ink outline. Each prop's data file is a list of parts made in Blender.
import * as THREE from 'three';
import { antUniforms } from '../nest3d/ants3d';

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
