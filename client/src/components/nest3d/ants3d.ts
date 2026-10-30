// Real 3D ants for the 3D nest (docs/art/sunlit-microcosm.md, "The swarm look"): one body plan, built from
// simple shapes, with the castes' proportions from docs/18-art-direction.md. Every ant of a caste is one
// instance of one mesh, so a few thousand cost one draw call each. Legs swing in the vertex shader in a
// tripod gait (nothing is simulated per ant), and a warm rim makes the chitin glow against the light.
import * as THREE from 'three';
import type { Caste } from '../../art/ants';

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

// how finely the shapes are cut: 1 for crowds, 2 for the few ants seen up close in a chamber
let fine = 1;
function ell(sx: number, sy: number, sz: number, x: number, y: number, z: number, rz = 0) {
  const g = new THREE.SphereGeometry(1, 9 * fine, 6 * fine);
  g.scale(sx, sy, sz);
  g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}
function seg(a: THREE.Vector3, b: THREE.Vector3, r: number, r2 = r * 0.75) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r2, r, d.length(), fine > 1 ? 8 : 5, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}
type LegFn = (x: number, y: number, z: number) => [number, number];
/** Merge the parts into one geometry; `aLeg` says which tripod a leg vertex swings with and how far from the hip it is. */
function merge(parts: { g: THREE.BufferGeometry; lf?: LegFn }[]) {
  const pos: number[] = [], nor: number[] = [], leg: number[] = [];
  for (const { g, lf } of parts) {
    const G = g.index ? g.toNonIndexed() : g;
    const P = G.attributes.position, N = G.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      pos.push(x, y, z);
      nor.push(N.getX(i), N.getY(i), N.getZ(i));
      const l = lf ? lf(x, y, z) : [0, 0];
      leg.push(l[0], l[1]);
    }
    G.dispose();
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aLeg', new THREE.Float32BufferAttribute(leg, 2));
  geo.computeBoundingSphere();
  return geo;
}

interface Shape {
  head?: number;
  gaster?: number;
  jaw?: number;
  slim?: number;
  legs?: number;
  nodes?: 1 | 2;
  sickle?: boolean;
}
/** Gaster, petiole, mesosoma, head, mandibles, elbowed antennae, six legs. Faces +x, feet at y = 0, about 0.9 long. */
export function antGeometry(o: Shape = {}, detail = 1) {
  fine = detail;
  try {
    return antParts(o);
  } finally {
    fine = 1;
  }
}
function antParts(o: Shape) {
  const head = o.head ?? 1, gas = o.gaster ?? 1, jaw = o.jaw ?? 1, slim = o.slim ?? 1, legK = o.legs ?? 1;
  const parts: { g: THREE.BufferGeometry; lf?: LegFn }[] = [];
  const body = (g: THREE.BufferGeometry) => parts.push({ g });
  body(ell(0.2 * gas, 0.14 * gas * slim, 0.15 * gas * slim, -0.27 - 0.1 * (gas - 1), 0.17 + 0.03 * (gas - 1), 0, 0.25));
  if (o.nodes === 2) {
    body(ell(0.04, 0.045, 0.035, -0.11, 0.15, 0));
    body(ell(0.036, 0.042, 0.033, -0.05, 0.15, 0));
  } else body(ell(0.04, 0.05, 0.035, -0.08, 0.15, 0));
  body(ell(0.12, 0.062, 0.06 * slim, 0.03, 0.155, 0, -0.15));
  const hx = 0.19 + 0.06 * (head - 1);
  body(ell(0.085 * head, 0.075 * head, 0.08 * head, hx, 0.17 + 0.012 * (head - 1), 0));
  for (const s of [1, -1]) {
    const jb = V3(hx + 0.07 * head, 0.14, s * 0.03 * head);
    const jt = o.sickle ? V3(hx + 0.07 * head + 0.13, 0.12, s * -0.01) : V3(hx + 0.07 * head + 0.09 * jaw, 0.13, s * 0.005);
    body(seg(jb, jt, 0.016 * Math.sqrt(head), 0.006));
    const a0 = V3(hx + 0.04 * head, 0.2 + 0.03 * (head - 1), s * 0.03), a1 = V3(hx + 0.08, 0.3 + 0.03 * (head - 1), s * 0.07), a2 = V3(hx + 0.22, 0.27, s * 0.12);
    body(seg(a0, a1, 0.009));
    body(seg(a1, a2, 0.008, 0.005));
  }
  const hips = [0.08, 0.025, -0.03], kneeDx = [0.07, 0, -0.07], footDx = [0.2, 0.03, -0.2];
  for (let k = 0; k < 3; k++) {
    for (const s of [1, -1]) {
      const hip = V3(hips[k], 0.13, s * 0.035);
      const knee = V3(hips[k] + kneeDx[k] * legK, 0.21, s * 0.15 * legK);
      const foot = V3(hips[k] + footDx[k] * legK, 0, s * 0.25 * legK);
      const grp = k % 2 === 0 ? s : -s; // tripod: near front, far middle and near hind swing together
      const reach = foot.distanceTo(hip);
      const lf: LegFn = (x, y, z) => [grp, clamp(Math.hypot(x - hip.x, y - hip.y, z - hip.z) / reach, 0, 1)];
      parts.push({ g: seg(hip, knee, 0.016, 0.012), lf });
      parts.push({ g: seg(knee, foot, 0.012, 0.006), lf });
    }
  }
  return merge(parts);
}

const SHAPES: Record<Caste, Shape> = {
  worker: {},
  soldier: { head: 1.45, jaw: 1.3 },
  queen: { gaster: 1.75, head: 1.1 },
  alate: { gaster: 1.3 },
  army: { slim: 0.8, nodes: 2, legs: 1.15 },
  army_major: { slim: 0.85, nodes: 2, legs: 1.1, head: 1.35, sickle: true },
};

/** Chitin colours (docs/art/sunlit-microcosm.md, Palette): amber ours, rust soldiers, raider red, army-ant crimson. */
export const CHITIN = {
  worker: '#D9934A',
  soldier: '#B5662F',
  queen: '#A95F2F',
  alate: '#C98B52',
  raider: '#C4473A',
  army: '#8E2216',
  army_major: '#B23A26',
} as const;

/** Shared by every ant: the clock for the legs and the rim colour (warm by day, cool by night). */
export const antUniforms = {
  uTime: { value: 0 },
  uRim: { value: new THREE.Color(0.55, 0.38, 0.12) },
};

function antMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.06 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = antUniforms.uTime;
    sh.uniforms.uRim = antUniforms.uRim;
    sh.vertexShader =
      'attribute vec2 aLeg;\nattribute float aPhase;\nattribute float aSpeed;\nuniform float uTime;\n' +
      sh.vertexShader.replace(
        '#include <begin_vertex>',
        `vec3 transformed = vec3(position);
        float on = step(0.001, aSpeed);
        float ph = uTime * aSpeed + aPhase;
        transformed.x += sin(ph) * aLeg.x * 0.07 * aLeg.y * on;
        transformed.y += max(0.0, cos(ph) * aLeg.x) * 0.045 * aLeg.y * on;
        transformed.y += (1.0 - abs(aLeg.x)) * abs(sin(ph)) * 0.006 * on;`,
      );
    sh.fragmentShader =
      'uniform vec3 uRim;\n' +
      sh.fragmentShader.replace(
        '#include <dithering_fragment>',
        `float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        gl_FragColor.rgb += uRim * rimF * rimF;
        #include <dithering_fragment>`,
      );
  };
  return m;
}

export type CargoKind = 'leaf' | 'chunk' | 'drop';

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const X = V3(1, 0, 0), Y = V3(0, 1, 0), Z = V3(0, 0, 1);
const CARGO_AT = new THREE.Matrix4().compose(V3(0.4, 0.22, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0.3, 0.25)), V3(1, 1, 1));

/** One caste's ants: fill it each frame with `put`, between `begin` and `end`. Unused instances aren't drawn. */
class Pool {
  readonly mesh: THREE.InstancedMesh;
  private speed: THREE.InstancedBufferAttribute;
  private used = 0;
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, readonly cap: number, seed: () => number) {
    const g = geo.clone();
    const ph = new Float32Array(cap);
    for (let i = 0; i < cap; i++) ph[i] = seed() * 6.283;
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
    this.speed = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    this.speed.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aSpeed', this.speed);
    this.mesh = new THREE.InstancedMesh(g, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set('#ffffff'));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }
  begin() {
    this.used = 0;
  }
  /** Add one instance; returns its matrix (for cargo) or null when the pool is full. */
  put(m: THREE.Matrix4, color: THREE.Color, step: number) {
    if (this.used >= this.cap) return false;
    const i = this.used++;
    this.mesh.setMatrixAt(i, m);
    this.mesh.setColorAt(i, color);
    (this.speed.array as Float32Array)[i] = step;
    return true;
  }
  end() {
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.speed.needsUpdate = true;
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

export interface AntOpts {
  /** body length multiplier */
  scale?: number;
  /** turn about the vertical (0 faces +x) */
  yaw?: number;
  /** nose up (+) or down (−), for climbing the shaft */
  pitch?: number;
  /** leg speed in radians per second; 0 stands still */
  step?: number;
  color?: string | THREE.Color;
  cargo?: { kind: CargoKind; color: string } | null;
  /** dead: on its back, legs in the air */
  flip?: boolean;
}

/**
 * Every ant in the nest scene: one pool per caste plus one per kind of load. Call `begin()`, then `ant()` for
 * each ant this frame, then `end()`. Pools are sized to the caps, so a busy frame simply draws the first `cap`.
 */
export function createAnts(parent: THREE.Object3D, caps: Partial<Record<Caste, number>>, shadows: boolean, detail = 1) {
  let s = 7;
  const seed = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const mat = antMaterial();
  const pools = {} as Record<Caste, Pool>;
  for (const c of Object.keys(SHAPES) as Caste[]) {
    const geo = antGeometry(SHAPES[c], detail);
    pools[c] = new Pool(geo, mat, caps[c] ?? 8, seed);
    geo.dispose();
    pools[c].mesh.castShadow = shadows;
    parent.add(pools[c].mesh);
  }
  const loadCap = (caps.worker ?? 8) + (caps.soldier ?? 8);
  const leaf = new THREE.CylinderGeometry(0.17, 0.17, 0.025, 7).scale(1, 1, 0.75);
  const cargoMat = new THREE.MeshStandardMaterial({ roughness: 0.55 });
  const loads: Record<CargoKind, THREE.InstancedMesh> = {
    leaf: new THREE.InstancedMesh(leaf, cargoMat, loadCap),
    chunk: new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.1), cargoMat, loadCap),
    drop: new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 10, 8), cargoMat, loadCap),
  };
  const loadUsed: Record<CargoKind, number> = { leaf: 0, chunk: 0, drop: 0 };
  for (const im of Object.values(loads)) {
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.setColorAt(0, _c.set('#ffffff'));
    im.frustumCulled = false;
    im.count = 0;
    parent.add(im);
  }
  const col = new THREE.Color();
  return {
    begin() {
      for (const p of Object.values(pools)) p.begin();
      for (const k of Object.keys(loadUsed) as CargoKind[]) loadUsed[k] = 0;
    },
    /** Draw one ant standing at (x, y, z). */
    ant(caste: Caste, x: number, y: number, z: number, o: AntOpts = {}) {
      _q.setFromAxisAngle(Y, o.yaw ?? 0);
      if (o.pitch) _q.multiply(_q2.setFromAxisAngle(Z, o.pitch));
      if (o.flip) _q.multiply(_q2.setFromAxisAngle(X, Math.PI));
      _m.compose(_p.set(x, y + (o.flip ? 0.24 * (o.scale ?? 1) : 0), z), _q, _s.setScalar(o.scale ?? 1));
      col.set(o.color ?? CHITIN[caste as keyof typeof CHITIN] ?? CHITIN.worker);
      if (!pools[caste].put(_m, col, o.step ?? 0)) return;
      const c = o.flip ? null : o.cargo;
      if (c && loadUsed[c.kind] < loadCap) {
        const im = loads[c.kind], i = loadUsed[c.kind]++;
        im.setMatrixAt(i, _m2.multiplyMatrices(_m, CARGO_AT));
        im.setColorAt(i, col.set(c.color));
      }
    },
    end() {
      for (const p of Object.values(pools)) p.end();
      for (const k of Object.keys(loads) as CargoKind[]) {
        const im = loads[k];
        im.count = loadUsed[k];
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
    },
    dispose() {
      for (const p of Object.values(pools)) {
        parent.remove(p.mesh);
        p.dispose();
      }
      for (const im of Object.values(loads)) {
        parent.remove(im);
        im.geometry.dispose();
        im.dispose();
      }
      cargoMat.dispose();
      mat.dispose();
    },
  };
}
export type Ants = ReturnType<typeof createAnts>;
