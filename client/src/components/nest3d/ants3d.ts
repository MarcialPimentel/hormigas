// Real 3D ants for the 3D nest (docs/art/sunlit-microcosm.md, "The swarm look"): one body plan, built from
// simple shapes, with the castes' proportions from docs/18-art-direction.md. Every ant of a caste is one
// instance of one mesh, so a few thousand cost one draw call each. Legs swing in the vertex shader in a
// tripod gait (nothing is simulated per ant). The look is cartoon: flat toon bands, a glossy highlight, dark
// eyes and an ink outline drawn as a slightly bigger inside-out copy of the same ants (one more draw call).
import * as THREE from 'three';
import type { Caste } from '../../art/ants';
import ANT from './ant.json';

const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/**
 * The ant's parts, built in Blender (art/meshy/hero-ant/build_ant.py, exported by export_ant.py): game axes, ×10000
 * positions, ×1000 normals, triangles, and a tone per vertex (eyes dark, gaster bands pale). `close` is the finer
 * one for the few ants seen up close in a chamber, `crowd` the light one for everything else.
 */
type PartData = { p: number[]; n: number[]; i: number[]; t?: number[] };
const PARTS = ANT as unknown as Record<'close' | 'crowd', Record<string, PartData>>;

interface Shape {
  head?: number;
  gaster?: number;
  jaw?: number;
  slim?: number;
  legs?: number;
  nodes?: 1 | 2;
  sickle?: boolean;
}
// the points the castes stretch about (they match the Blender layout)
const NECK = V3(0.13, 0.16, 0);
const GASTER_C = V3(-0.275, 0.175, 0), GASTER_PIVOT = V3(-0.175, 0.11, 0);
const JAW_BASE_X = 0.255;
const HIP_X = [0.085, 0.03, -0.025], HIP_Y = 0.13, HIP_Z = 0.035;

/** Gaster, petiole, mesosoma, head, mandibles, elbowed antennae, six legs. Faces +x, feet at y = 0, about 0.9 long. */
export function antGeometry(o: Shape = {}, detail = 1) {
  const head = o.head ?? 1, gas = o.gaster ?? 1, jaw = o.jaw ?? 1, slim = o.slim ?? 1, legK = o.legs ?? 1;
  const parts = PARTS[detail > 1 ? 'close' : 'crowd'];
  const pos: number[] = [], nor: number[] = [], leg: number[] = [], tone: number[] = [];
  const gc = GASTER_PIVOT.clone().lerp(GASTER_C, gas); // the gaster's centre once it has grown
  const v = new THREE.Vector3(), n = new THREE.Vector3(), sc = new THREE.Vector3();
  for (const [name, d] of Object.entries(parts)) {
    if (o.nodes === 2 ? name === 'petiole' : name.startsWith('petiole_')) continue;
    if (o.sickle ? name.startsWith('mandible_') : name.startsWith('sickle_')) continue;
    const inHead = /^(head|eye_|mandible_|sickle_|antenna_)/.test(name);
    const legM = /^leg(\d)_([LR])$/.exec(name);
    const k = legM ? +legM[1] - 1 : 0, s = legM?.[2] === 'R' ? -1 : 1;
    const hip = V3(HIP_X[k], HIP_Y, s * HIP_Z);
    // where a vertex goes for this caste; sc is the part's stretch, so its normals can follow
    sc.set(1, 1, 1);
    if (name.startsWith('mandible_')) sc.x *= jaw;
    if (name === 'gaster') sc.set(1, slim, slim);
    if (name === 'mesosoma') sc.z = slim;
    if (legM) sc.set(legK, 1, legK);
    const place = () => {
      if (name.startsWith('mandible_')) v.x = JAW_BASE_X + (v.x - JAW_BASE_X) * jaw;
      if (inHead) v.sub(NECK).multiplyScalar(head).add(NECK);
      else if (name === 'gaster') {
        v.sub(GASTER_PIVOT).multiplyScalar(gas).add(GASTER_PIVOT);
        v.y = gc.y + (v.y - gc.y) * slim;
        v.z *= slim;
      } else if (name === 'mesosoma') v.z *= slim;
      else if (legM) {
        v.x = hip.x + (v.x - hip.x) * legK;
        v.z = hip.z + (v.z - hip.z) * legK;
      }
    };
    const P = d.p, N = d.n;
    const at: number[] = [];
    let reach = 0;
    for (let i = 0; i < P.length; i += 3) {
      v.set(P[i] / 1e4, P[i + 1] / 1e4, P[i + 2] / 1e4);
      place();
      if (legM) reach = Math.max(reach, v.distanceTo(hip));
      n.set(N[i] / sc.x, N[i + 1] / sc.y, N[i + 2] / sc.z).normalize();
      at.push(v.x, v.y, v.z, n.x, n.y, n.z);
    }
    // tripod: near front, far middle and near hind legs swing together; the swing grows from hip to foot
    const grp = k % 2 === 0 ? s : -s;
    for (const j of d.i) {
      const a = j * 6;
      pos.push(at[a], at[a + 1], at[a + 2]);
      nor.push(at[a + 3], at[a + 4], at[a + 5]);
      tone.push(d.t ? d.t[j] : 1);
      if (legM) leg.push(grp, clamp(Math.hypot(at[a] - hip.x, at[a + 1] - hip.y, at[a + 2] - hip.z) / reach, 0, 1));
      else leg.push(0, 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aLeg', new THREE.Float32BufferAttribute(leg, 2));
  geo.setAttribute('aTone', new THREE.Float32BufferAttribute(tone, 1));
  geo.computeBoundingSphere();
  return geo;
}

const SHAPES: Record<Caste, Shape> = {
  worker: {},
  soldier: { head: 1.45, jaw: 1.3 },
  queen: { gaster: 1.75, head: 1.1 },
  alate: { gaster: 1.3 },
  army: { slim: 0.8, nodes: 2, legs: 1.15 },
  army_major: { slim: 0.85, nodes: 2, legs: 1.1, head: 1.35, sickle: true },
};

/**
 * Chitin colours (docs/art/sunlit-microcosm.md, Palette): warm red-brown ours, deeper rust soldiers, raider red,
 * army-ant crimson. Deep enough that the toon bands and the gloss spot read, like the 2D concept art.
 */
export const CHITIN = {
  worker: '#B8612F',
  soldier: '#96472A',
  queen: '#8E4527',
  alate: '#B06A3C',
  raider: '#C4473A',
  army: '#8E2216',
  army_major: '#B23A26',
} as const;

/** Shared by every ant: the clock for the legs and the rim colour (warm by day, cool by night). */
export const antUniforms = {
  uTime: { value: 0 },
  uRim: { value: new THREE.Color(0.55, 0.38, 0.12) },
};

// Legs: aSpeed > 0 cycles them on the clock; < 0 means aPhase is the gait itself (tied to the distance walked).
const LEGS_HEAD = 'attribute vec2 aLeg;\nattribute float aPhase;\nattribute float aSpeed;\nuniform float uTime;\n';
const LEGS = `vec3 transformed = vec3(position);
        float on = step(0.001, abs(aSpeed));
        float ph = aSpeed < 0.0 ? aPhase : uTime * aSpeed + aPhase;
        transformed.x += sin(ph) * aLeg.x * 0.07 * aLeg.y * on;
        transformed.y += max(0.0, cos(ph) * aLeg.x) * 0.045 * aLeg.y * on;
        transformed.y += (1.0 - abs(aLeg.x)) * abs(sin(ph)) * 0.006 * on;`;

/** Three hard light bands for the cartoon look: shadow side, mid, lit. */
export function toonBands() {
  const t = new THREE.DataTexture(new Uint8Array([95, 175, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

function antMaterial(bands: THREE.Texture) {
  const m = new THREE.MeshToonMaterial({ gradientMap: bands });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = antUniforms.uTime;
    sh.uniforms.uRim = antUniforms.uRim;
    sh.vertexShader =
      LEGS_HEAD + 'attribute float aTone;\nvarying float vTone;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', LEGS + '\nvTone = aTone;');
    sh.fragmentShader =
      'uniform vec3 uRim;\nvarying float vTone;\n' +
      sh.fragmentShader
        // tone below 1 darkens (the eyes); above 1 pales toward cream (the gaster's bands)
        .replace(
          '#include <color_fragment>',
          '#include <color_fragment>\ndiffuseColor.rgb = vTone > 1.0 ? mix(diffuseColor.rgb, vec3(1.0, 0.86, 0.72), (vTone - 1.0) * 1.6) : diffuseColor.rgb * vTone;',
        )
        .replace(
          '#include <dithering_fragment>',
          `vec3 nV = normalize(normal);
        // a hard gloss spot up and to the left of every body part, as if lit from above the camera
        float gloss = smoothstep(0.84, 0.87, dot(nV, normalize(vec3(-0.35, 0.8, 0.5))));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 1.45 + vec3(0.14, 0.09, 0.05), gloss * 0.85);
        float rimF = 1.0 - clamp(dot(nV, normalize(vViewPosition)), 0.0, 1.0);
        gl_FragColor.rgb += uRim * rimF * rimF * 0.5;
        #include <dithering_fragment>`,
        );
  };
  return m;
}

/**
 * The ink line: the same ants pushed out along their normals, inside-out and dark, so only the edge shows. It thins
 * down each leg (aLeg.y runs hip to foot) so the feet and claws keep their shape.
 */
function inkMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: '#1c0f08', side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader =
      LEGS_HEAD +
      sh.vertexShader.replace('#include <begin_vertex>', LEGS + '\ntransformed += normalize(normal) * 0.013 * (1.0 - 0.6 * aLeg.y);');
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
  readonly ink: THREE.InstancedMesh;
  private speed: THREE.InstancedBufferAttribute;
  private phase: THREE.InstancedBufferAttribute;
  private base: Float32Array;
  private used = 0;
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, ink: THREE.Material, readonly cap: number, seed: () => number) {
    const g = geo.clone();
    const ph = new Float32Array(cap);
    for (let i = 0; i < cap; i++) ph[i] = seed() * 6.283;
    this.base = ph.slice();
    this.phase = new THREE.InstancedBufferAttribute(ph, 1);
    this.phase.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPhase', this.phase);
    this.speed = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    this.speed.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aSpeed', this.speed);
    this.mesh = new THREE.InstancedMesh(g, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _c.set('#ffffff'));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    // same geometry and matrices, no colours: it only ever draws the dark edge
    this.ink = new THREE.InstancedMesh(g, ink, cap);
    this.ink.instanceMatrix = this.mesh.instanceMatrix;
    this.ink.frustumCulled = false;
    this.ink.count = 0;
  }
  begin() {
    this.used = 0;
  }
  /** Add one instance; returns its matrix (for cargo) or null when the pool is full. */
  put(m: THREE.Matrix4, color: THREE.Color, step: number, gait?: number) {
    if (this.used >= this.cap) return false;
    const i = this.used++;
    this.mesh.setMatrixAt(i, m);
    this.mesh.setColorAt(i, color);
    const walking = gait !== undefined;
    (this.speed.array as Float32Array)[i] = walking ? -1 : step;
    (this.phase.array as Float32Array)[i] = walking ? gait : this.base[i];
    return true;
  }
  end() {
    this.mesh.count = this.ink.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.speed.needsUpdate = true;
    this.phase.needsUpdate = true;
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
    this.ink.dispose();
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
  /** the gait itself, in radians (overrides `step`): tie it to the distance walked so the feet don't slide */
  gait?: number;
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
  const bands = toonBands();
  const mat = antMaterial(bands);
  const ink = inkMaterial();
  const pools = {} as Record<Caste, Pool>;
  for (const c of Object.keys(SHAPES) as Caste[]) {
    const geo = antGeometry(SHAPES[c], detail);
    pools[c] = new Pool(geo, mat, ink, caps[c] ?? 8, seed);
    geo.dispose();
    pools[c].mesh.castShadow = shadows;
    parent.add(pools[c].mesh, pools[c].ink);
  }
  const loadCap = (caps.worker ?? 8) + (caps.soldier ?? 8);
  const leaf = new THREE.CylinderGeometry(0.17, 0.17, 0.025, 7).scale(1, 1, 0.75);
  const cargoMat = new THREE.MeshToonMaterial({ gradientMap: bands });
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
      if (!pools[caste].put(_m, col, o.step ?? 0, o.flip ? undefined : o.gait)) return;
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
        parent.remove(p.mesh, p.ink);
        p.dispose();
      }
      for (const im of Object.values(loads)) {
        parent.remove(im);
        im.geometry.dispose();
        im.dispose();
      }
      cargoMat.dispose();
      mat.dispose();
      ink.dispose();
      bands.dispose();
    },
  };
}
export type Ants = ReturnType<typeof createAnts>;
