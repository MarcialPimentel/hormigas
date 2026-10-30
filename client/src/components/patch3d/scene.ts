// The 3D Patch (docs/art/sunlit-microcosm.md, "The big idea"; docs/11-world.md, Missions screen): one patch of the
// garden as a sunlit diorama, the "solar system" level of the scale ladder. Spots keep the drawn patch's order
// left to right: the five terrains, then the wilds and its wild sites. Every party walks its scent trail as a
// column of real 3D ants at its real size (up to a cap), timed by the server's own departure and arrival times.
// Like every view, it only shows what the server says; tapping a spot opens the same card as the 2D patch.
//
// Scale: 1 unit ≈ 14 mm. An ant is 0.36 units (5 mm); the whole patch is about a metre across.
import * as THREE from 'three';
import { MISSION_TYPES, TERRAIN, WILDS_SPOT, isSiteSpot, roleCount, type ResourceId, type ScentHint, type TerrainId } from '@hormigas/shared';
import type { ServerColony, ServerState } from '../../game';
import type { Caste } from '../../art/ants';
import { fmtDuration } from '../../format';
import { CHITIN, antUniforms, createAnts, type CargoKind } from '../nest3d/ants3d';
import { leftOf } from '../nestScene';
import type { Spot, SpotColony } from '../Patch';
import { moveKeys } from './keys';
import { TIMING, drawnFor, momentAt, planBattle, replayLength, type BattlePlan } from './battle';

export interface PatchData {
  colony: ServerColony | null;
  state: ServerState | null;
  now: number;
}
export interface PatchScene {
  /** The patch being shown and what's on it (from /api/map). */
  setSpots(region: number, patch: number, spots: Spot[] | null): void;
  setSelected(spot: number | null): void;
  setReduced(r: boolean): void;
  /** Act out a battle report's data where it was fought (once that patch is shown). False if it has nothing to show. */
  playBattle(data: unknown): boolean;
  /** Room at the edges that floating cards cover, in CSS pixels: the patch is framed in what's left. */
  setInset(i: { left: number; right: number; top: number; bottom: number }): void;
  /** The order being written in Deploy: a dotted route from the sending colony to the target, tagged From and To. */
  setOrder(o: { from: { region: number; patch: number; spot: number }; to: { region: number; patch: number; spot: number }; label: string } | null): void;
  /** Fly the camera to a party's column ('m12' for mission 12, 'i7' for incoming 7), if it's on this patch. */
  focusParty(key: string): boolean;
  /** Drop the camera to ant height beside your own mound (or the middle of the patch). */
  antsEye(): void;
  resetView(): void;
  /** `fn` hears the scale bar text whenever it changes. */
  setOnScale(fn: (text: string) => void): void;
  dispose(): void;
}

const MM = 14; // millimetres per unit
const ANT = 0.36;
const HALF_W = 36; // the patch runs x = −36…36
const HALF_D = 15; // and z = −15…15
const EDGE = HALF_W + 4; // where parties from other patches enter
/** The drawn patch's x (0…690 px) in units. */
const pxToX = (px: number) => (px - 345) / 9.6;
const SPOT_PX = 45;
const spotPx = (n: number) => (n === WILDS_SPOT ? 562 : n > WILDS_SPOT ? 562 + (n - WILDS_SPOT) * 38 : (n - 0.5) * SPOT_PX);
/** Where a spot sits: the drawn patch's order left to right, staggered front and back so neighbours don't crowd. */
export function spotPos(n: number) {
  const x = pxToX(spotPx(n));
  const z = n === WILDS_SPOT ? 1 : isSiteSpot(n) ? (n % 2 ? -5.5 : 4) : n % 2 ? -2.8 : 3.2;
  return { x, z };
}
const TERRAIN_COL: Record<TerrainId, string> = {
  sunny_meadow: '#A9C450', sandy_soil: '#D9BE84', grassland: '#6FA83E', rotting_log: '#8A6A44', creek_bank: '#8FB0A0',
};
const WILDS_COL = '#4F7A36';
const FLAG = { mine: '#E8B23A', ally: '#2F9C95', wild: '#C4473A', other: '#C98B52', inactive: '#9A9184' };
const HINT_COLOR: Record<ScentHint, string> = { nest: '#C4473A', herd: '#B9D25A', mound: '#B07A44', den: '#9B5BD0' };
const CARGO: Record<ResourceId, string> = { foliage: '#8DCB4A', protein: '#D06A6A', nectar: '#F2B93B' };
const LOAD: Record<ResourceId, CargoKind> = { foliage: 'leaf', protein: 'chunk', nectar: 'drop' };

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const hash = (i: number, k: number) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/** Gentle ground, with a dip where the creek runs. */
const CREEK_X = (() => {
  const s = TERRAIN.creek_bank.spots;
  return pxToX(((Math.min(...s) - 1 + Math.max(...s)) / 2) * SPOT_PX);
})();
function gH(x: number, z: number) {
  const base = 0.22 * Math.sin(x * 0.13 + 0.7) + 0.18 * Math.cos(z * 0.21 + x * 0.05) + 0.08 * Math.sin(x * 0.5 + z * 0.4);
  const creek = Math.exp(-(((x - CREEK_X - 0.6 * Math.sin(z * 0.25)) / 1.3) ** 2));
  return base - 0.45 * creek;
}
function terrainAt(x: number): TerrainId | 'wilds' {
  for (const t of Object.keys(TERRAIN) as TerrainId[]) {
    const s = TERRAIN[t].spots;
    if (x >= pxToX((Math.min(...s) - 1) * SPOT_PX) && x < pxToX(Math.max(...s) * SPOT_PX)) return t;
  }
  return x < 0 ? 'sunny_meadow' : 'wilds';
}

/** Sky colours through the day, by the player's own clock (the same hours as the 3D nest). */
function skyFor(hour: number) {
  if (hour >= 6 && hour < 8) return { sky: '#C7A7A0', night: 0.35 };
  if (hour >= 8 && hour < 17) return { sky: '#B8DCEA', night: 0 };
  if (hour >= 17 && hour < 20) return { sky: '#9C7A8A', night: 0.45 };
  return { sky: '#0E1630', night: 1 };
}

export async function createPatchScene(
  host: HTMLElement,
  labelsEl: HTMLElement,
  get: () => PatchData,
  cb: { onPick: (spot: number) => void; onRise?: () => void },
  initiallyReduced: boolean,
): Promise<PatchScene> {
  const canvas = document.createElement('canvas');
  canvas.className = 'p3-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  // throws without WebGL: the caller falls back to the drawn patch
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  host.prepend(canvas);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const coarse = matchMedia('(pointer: coarse)').matches;
  let reduced = initiallyReduced;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#B8DCEA', 70, 190);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 600);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (hex: string, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const key = hex + JSON.stringify(extra);
    if (!matCache.has(key)) matCache.set(key, keep(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, ...extra })));
    return matCache.get(key)!;
  };
  const rnd = seeded(29);
  const rr = (a: number, b: number) => a + (b - a) * rnd();
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const shadow = <T extends THREE.Object3D>(o: T, cast = true, recv = true) => {
    o.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) {
        m.castShadow = cast && !coarse;
        m.receiveShadow = recv;
      }
    });
    return o;
  };

  // ---------- light: a low warm sun behind the scene, so chitin and grass glow at the edges ----------
  const hemi = new THREE.HemisphereLight('#E4F2FF', '#A0824C', 1.1);
  const sun = new THREE.DirectionalLight('#FFE2A6', 2.2);
  sun.position.set(-34, 30, -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 30, bottom: -30, near: 1, far: 140 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(hemi, sun, sun.target);
  const fill = new THREE.DirectionalLight('#FFF4E0', 0.55);
  fill.position.set(10, 20, 40);
  scene.add(fill);
  scene.background = new THREE.Color('#B8DCEA');

  // ---------- the ground: terrain bands blended into each other, a creek and the wilds ----------
  {
    const geo = keep(new THREE.PlaneGeometry(220, 140, coarse ? 160 : 260, coarse ? 90 : 150));
    geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color(), c2 = new THREE.Color();
    const out = new THREE.Color('#5E8A3A');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, gH(x, z));
      // each band's colour, softened into its neighbours
      c.setRGB(0, 0, 0);
      for (const dx of [-1.5, 0, 1.5]) {
        const t = terrainAt(x + dx);
        c.add(c2.set(t === 'wilds' ? WILDS_COL : TERRAIN_COL[t]).multiplyScalar(1 / 3));
      }
      // beyond the patch, it all fades into lawn
      const outside = Math.max(smooth(HALF_W - 2, HALF_W + 8, Math.abs(x)), smooth(HALF_D - 2, HALF_D + 6, Math.abs(z)));
      c.lerp(out, outside);
      c.multiplyScalar(0.92 + 0.12 * hash(Math.round(x * 3), Math.round(z * 3)));
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));
    ground.receiveShadow = true;
    scene.add(ground);
    // the creek: a glossy ribbon in its dip
    const pts: THREE.Vector3[] = [];
    for (let z = -70; z <= 70; z += 2) pts.push(new THREE.Vector3(CREEK_X + 0.6 * Math.sin(z * 0.25), 0, z));
    const water = new THREE.Mesh(
      keep(new THREE.PlaneGeometry(1.9, 140, 1, 70)),
      keep(new THREE.MeshStandardMaterial({ color: '#5E9FC0', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85 })),
    );
    water.rotation.x = -Math.PI / 2;
    const wp = water.geometry.attributes.position;
    for (let i = 0; i < wp.count; i++) {
      const z = -wp.getY(i);
      wp.setX(i, wp.getX(i) + CREEK_X + 0.6 * Math.sin(z * 0.25));
      wp.setZ(i, gH(CREEK_X, z) + 0.22);
    }
    water.geometry.computeVertexNormals();
    water.receiveShadow = true;
    scene.add(water);
  }

  // ---------- grass: instanced blades, swaying in the shader, lit from behind ----------
  // uFade: 0 solid, 1 see-through (while you move around the zoomed-out patch, so the ants show)
  const grassU = { uTime: { value: 0 }, uWind: { value: 0.1 }, uGlow: { value: 0.22 }, uRim: { value: new THREE.Color(0.28, 0.36, 0.05) }, uFade: { value: 0 } };
  const bladeGeo = (() => {
    const g = keep(new THREE.PlaneGeometry(1, 1, 1, 5));
    const p = g.attributes.position, col: number[] = [];
    const c0 = new THREE.Color('#2E5E25'), c1 = new THREE.Color('#BCE35C'), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + 0.5;
      p.setXYZ(i, p.getX(i) * (1 - y * 0.92), y, y * y * 0.28);
      c.copy(c0).lerp(c1, Math.pow(y, 0.8));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  })();
  // two looks of the same grass: solid, and see-through (blended, writing no depth so ants and trails show behind it)
  const grassMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.72 }));
  const grassSeeThrough = keep(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.72, transparent: true, depthWrite: false }));
  const GRASS_MIN_OPACITY = 0.18;
  const grassShader = (see: boolean) => (sh: Parameters<THREE.Material['onBeforeCompile']>[0]) => {
    Object.assign(sh.uniforms, grassU);
    sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      float wp = uTime * 1.5 + instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
      float bend = position.y * position.y * uWind;
      transformed.x += sin(wp) * bend;
      transformed.z += (0.5 + 0.5 * cos(wp * 0.73)) * bend * 0.6;`);
    sh.fragmentShader = 'uniform vec3 uRim;\nuniform float uGlow;\nuniform float uFade;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `
      gl_FragColor.rgb += vColor * uGlow;
      float rimG = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
      gl_FragColor.rgb += uRim * rimG * rimG;
      ${see ? `gl_FragColor.a *= 1.0 - uFade * ${(1 - GRASS_MIN_OPACITY).toFixed(2)};` : ''}
      #include <dithering_fragment>`);
  };
  grassMat.onBeforeCompile = grassShader(false);
  grassSeeThrough.onBeforeCompile = grassShader(true);
  grassSeeThrough.customProgramCacheKey = () => 'grass-see-through';
  grassMat.customProgramCacheKey = () => 'grass-solid';
  let grassInst: THREE.InstancedMesh | null = null;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), cl = new THREE.Color();
  /** Blades are kept off the spots' centres so mounds and sites stay clear. */
  const nearSpot = (x: number, z: number, r: number) => {
    for (let n = 1; n <= WILDS_SPOT + 4; n++) {
      const s = spotPos(n);
      if ((s.x - x) ** 2 + (s.z - z) ** 2 < r * r) return true;
    }
    return false;
  };
  {
    const blades: { x: number; z: number; h: number; w: number; tint: string }[] = [];
    const want = coarse ? 2200 : 4600;
    for (let tries = 0; blades.length < want && tries < want * 4; tries++) {
      const far = rnd() < 0.3;
      const x = far ? rr(-80, 80) : rr(-HALF_W - 2, HALF_W + 2);
      const z = far ? (rnd() < 0.5 ? rr(-60, -HALF_D - 1) : rr(HALF_D + 4, 40)) : rr(-HALF_D, HALF_D);
      if (!far && nearSpot(x, z, 3)) continue;
      if (Math.abs(x - CREEK_X) < 1.4 && !far) continue;
      const t = far ? 'wilds' : terrainAt(x);
      // how much grass each ground grows: lush grassland and wilds, sparse sand
      const dens = { sunny_meadow: 0.5, sandy_soil: 0.12, grassland: 0.75, rotting_log: 0.3, creek_bank: 0.45, wilds: 0.9 }[t];
      if (rnd() > dens) continue;
      const tall = t === 'wilds' ? 1.5 : t === 'grassland' ? 1.25 : 1;
      const h = (far ? rr(2.5, 6) : rr(0.6, 1.9) * tall) * (z < -HALF_D ? 1.5 : 1);
      blades.push({ x, z, h, w: rr(0.1, 0.2), tint: t === 'sandy_soil' ? '#E8E2B0' : t === 'wilds' ? '#D2E2B0' : pick(['#FFFFFF', '#F2F7E0', '#E6F0C8', '#FFF6D8']) });
    }
    const inst = (grassInst = new THREE.InstancedMesh(bladeGeo, grassMat, blades.length));
    blades.forEach((b, i) => {
      q.setFromEuler(e.set(rr(-0.15, 0.15), rnd() * 6.28, rr(-0.12, 0.12)));
      m4.compose(v3.set(b.x, gH(b.x, b.z) - 0.02, b.z), q, s3.set(b.w, b.h, b.w * 1.5));
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, cl.set(b.tint));
    });
    inst.castShadow = !coarse;
    inst.receiveShadow = true;
    scene.add(inst);
  }

  // ---------- life and things at true size: flowers, pebbles, reeds, the log, a marble, a bottle cap, a leaf ----------
  {
    const range = (t: TerrainId) => {
      const s = TERRAIN[t].spots;
      return [pxToX((Math.min(...s) - 1) * SPOT_PX), pxToX(Math.max(...s) * SPOT_PX)] as const;
    };
    const FL: [string, string][] = [['#FFD23F', '#E39B12'], ['#F6B6D2', '#F7E9A6'], ['#FF6B4F', '#2B1D13'], ['#FBF7EE', '#F2B92B'], ['#B49BFF', '#F7E9A6']];
    const petal = keep(new THREE.SphereGeometry(1, 10, 6).scale(0.55, 0.08, 0.24).translate(0.55, 0, 0));
    const heart = keep(new THREE.SphereGeometry(0.26, 12, 8).scale(1, 0.55, 1));
    const flower = (x: number, z: number, h: number) => {
      const [pc, hc] = pick(FL), y = gH(x, z);
      const stem = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.05, 0.07, h, 5).translate(0, h / 2, 0)), mat('#4F8A35'));
      stem.position.set(x, y, z);
      scene.add(shadow(stem));
      const head = new THREE.Group();
      head.position.set(x, y + h, z);
      head.rotation.set(rr(-0.3, 0.3), rr(0, 6), rr(-0.3, 0.3));
      for (let k = 0; k < 7; k++) {
        const p = new THREE.Mesh(petal, mat(pc, { side: THREE.DoubleSide, roughness: 0.55 }));
        p.rotation.set(0, (k / 7) * 6.28, 0.2);
        head.add(p);
      }
      head.add(new THREE.Mesh(heart, mat(hc)));
      scene.add(shadow(head));
    };
    const [m0, m1] = range('sunny_meadow');
    for (let i = 0; i < 14; i++) {
      const x = rr(m0 + 0.5, m1 - 0.5), z = rr(-HALF_D + 1, HALF_D - 2);
      if (!nearSpot(x, z, 2.2)) flower(x, z, rr(2.5, 6));
    }
    for (let i = 0; i < 10; i++) flower(rr(-60, 60), rr(-40, -HALF_D - 3), rr(5, 10));
    // pebbles on the sand
    const [s0, s1] = range('sandy_soil');
    const stone = keep(new THREE.IcosahedronGeometry(1, 0));
    for (let i = 0; i < 40; i++) {
      const x = rr(s0, s1), z = rr(-HALF_D, HALF_D);
      if (nearSpot(x, z, 1.6)) continue;
      const p = new THREE.Mesh(stone, mat(pick(['#E2D6C4', '#C9BBA8', '#B98A6A', '#A79A8C']), { flatShading: true }));
      const s = rr(0.12, 0.5);
      p.position.set(x, gH(x, z) + s * 0.3, z);
      p.scale.set(s, s * 0.6, s * 0.9);
      p.rotation.y = rr(0, 6);
      scene.add(shadow(p));
    }
    // reeds by the creek
    const reed = keep(new THREE.CylinderGeometry(0.04, 0.06, 1, 4).translate(0, 0.5, 0));
    for (let i = 0; i < 60; i++) {
      const z = rr(-HALF_D - 6, HALF_D + 3), x = CREEK_X + 0.6 * Math.sin(z * 0.25) + (rnd() < 0.5 ? -1 : 1) * rr(1, 1.7);
      const r = new THREE.Mesh(reed, mat(pick(['#5E8A3A', '#7FA048', '#4F7A36'])));
      r.position.set(x, gH(x, z), z);
      r.scale.y = rr(3, 7);
      r.rotation.set(rr(-0.1, 0.1), 0, rr(-0.1, 0.1));
      scene.add(shadow(r));
    }
    // the rotting log across the back of its band, with orange bracket fungus
    const [l0, l1] = range('rotting_log');
    const lx = (l0 + l1) / 2;
    const log = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.9, 2.1, 13, 18, 1)), mat('#7A5234', { roughness: 1 }));
    log.rotation.set(0, 0.25, Math.PI / 2);
    log.position.set(lx, 1.5, -10.5);
    scene.add(shadow(log));
    const bracket = keep(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.7, 0.18, 0.5));
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Mesh(bracket, mat(pick(['#E07B39', '#F2A04E', '#D96A2A'])));
      const t = rr(-5, 5), a = rr(-0.5, 0.9);
      b.position.set(lx + t * Math.cos(0.25), 1.5 + Math.cos(a) * 1.6, -10.5 - t * Math.sin(0.25) + Math.sin(a) * 2);
      b.rotation.set(0, 0.25, -a * 0.5);
      scene.add(shadow(b));
    }
    // a lost marble (16 mm) and a bottle cap (30 mm), at true size, in the front of the patch
    const marble = new THREE.Mesh(
      keep(new THREE.SphereGeometry(8 / MM, 32, 20)),
      keep(new THREE.MeshPhysicalMaterial({ color: '#7FC4E8', roughness: 0.05, transmission: 0.6, thickness: 1, ior: 1.5, clearcoat: 1 })),
    );
    const mp = spotPos(2);
    marble.position.set(mp.x + 2.4, gH(mp.x + 2.4, 9) + 8 / MM, 9);
    scene.add(shadow(marble));
    const swirl = new THREE.Mesh(keep(new THREE.TorusGeometry(0.3, 0.06, 6, 20)), mat('#F2B93B', { emissive: '#8A5A10', emissiveIntensity: 0.3 }));
    swirl.position.copy(marble.position);
    swirl.rotation.set(0.6, 0.3, 0);
    scene.add(swirl);
    const cp = spotPos(5);
    const cap = new THREE.Group();
    const capTop = new THREE.Mesh(keep(new THREE.CylinderGeometry(15 / MM, 15 / MM, 6 / MM, 28, 1, true)), mat('#D0492E', { metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide }));
    const capFace = new THREE.Mesh(keep(new THREE.CircleGeometry(15 / MM, 28)), mat('#E25A3C', { metalness: 0.6, roughness: 0.3 }));
    capFace.rotation.x = -Math.PI / 2;
    capFace.position.y = -3 / MM + 0.01;
    cap.add(capTop, capFace);
    cap.position.set(cp.x - 1.8, gH(cp.x - 1.8, 9.5) + 3 / MM, 9.5);
    cap.rotation.set(Math.PI, 0, 0.12); // lying upside down, a little bowl
    scene.add(shadow(cap));
    // a fallen leaf in the grassland
    const ls = new THREE.Shape();
    ls.moveTo(0, -2.2);
    ls.quadraticCurveTo(1.9, -0.4, 0, 2.2);
    ls.quadraticCurveTo(-1.9, -0.4, 0, -2.2);
    const lg = keep(new THREE.ExtrudeGeometry(ls, { depth: 0.05, bevelEnabled: false }));
    lg.rotateX(-Math.PI / 2);
    const [g0, g1] = range('grassland');
    const leaf = new THREE.Mesh(lg, mat('#E0A33A', { side: THREE.DoubleSide }));
    leaf.position.set((g0 + g1) / 2 + 1, gH((g0 + g1) / 2 + 1, 8.5) + 0.06, 8.5);
    leaf.rotation.y = 1.1;
    scene.add(shadow(leaf));
  }

  // ---------- the spots: mounds with flags, scent plumes, wild sites ----------
  const spotGroup = new THREE.Group();
  scene.add(spotGroup);
  const spotDisposables: { dispose(): void }[] = [];
  /** Kept until the next patch is shown. */
  const sk = <T extends { dispose(): void }>(x: T) => (spotDisposables.push(x), x);
  const holeGeo = keep(new THREE.CircleGeometry(0.22, 12));
  const bareGeo = keep(new THREE.CircleGeometry(2.6, 28));
  const bareMat = keep(new THREE.MeshStandardMaterial({ color: '#B89A6A', roughness: 1, transparent: true, opacity: 0.75, depthWrite: false }));
  // a dotted circle on the ground where you can act but nothing stands: empty spots and the wilds.
  // Drawn over the grass (no depth test), so you can always see where to tap.
  const dottedTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.lineCap = 'round';
    // 16 bold round dots, light with a dark edge, so they survive being drawn small
    g.setLineDash([0.1, (2 * Math.PI * 104) / 16]);
    g.beginPath();
    g.arc(128, 128, 104, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(43, 29, 19, 0.6)';
    g.lineWidth = 30;
    g.stroke();
    g.strokeStyle = 'rgba(255, 249, 232, 1)';
    g.lineWidth = 21;
    g.stroke();
    g.setLineDash([]);
    g.beginPath();
    g.arc(128, 128, 96, 0, Math.PI * 2);
    g.fillStyle = 'rgba(255, 249, 232, 0.16)';
    g.fill();
    const t = keep(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  })();
  const dottedGeo = keep(new THREE.PlaneGeometry(1, 1));
  let openRings: { spot: number; mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
  let hoverSpot: number | null = null;
  let taps: THREE.Mesh[] = [];
  let shown: { region: number; patch: number; spots: Spot[] } | null = null;
  const plumes: { line: THREE.Mesh; base: THREE.Vector3; phase: number }[] = [];
  const hitMat = keep(new THREE.MeshBasicMaterial({ visible: false }));
  const tapGeo = keep(new THREE.CylinderGeometry(2.1, 2.1, 3.5, 12));
  const moundPts: THREE.Vector2[] = [];
  const moundProfile = (d: number) => (d < 0.62 ? -0.05 + 0.85 * smooth(0.3, 0.62, d) : 0.8 * Math.exp(-(((d - 0.62) / 1.05) ** 2)));
  for (let d = 0.3; d <= 2.8; d += 0.1) moundPts.push(new THREE.Vector2(d * 0.75, moundProfile(d) * 0.9));
  const moundGeo = keep(new THREE.LatheGeometry(moundPts, 28));
  const flagGeo = (() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(1.1, 0);
    s.lineTo(0.85, -0.3);
    s.lineTo(1.1, -0.6);
    s.lineTo(0, -0.6);
    return keep(new THREE.ShapeGeometry(s));
  })();
  const pole = keep(new THREE.CylinderGeometry(0.035, 0.035, 3.2, 5).translate(0, 1.6, 0));
  const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(2, 0.07, 6, 48)), keep(new THREE.MeshBasicMaterial({ color: '#FFC93C', transparent: true, opacity: 0.9 })));
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  scene.add(ring);

  const flagColor = (c: SpotColony) =>
    c.mine ? FLAG.mine : c.relation === 'ally' ? FLAG.ally : c.kind === 'wild' ? (c.hint ? HINT_COLOR[c.hint] : FLAG.wild) : c.inactive ? FLAG.inactive : FLAG.other;

  function addMound(x: number, z: number, color: string, flag: string | null, scale = 1) {
    const y = gH(x, z);
    // the ground the colony has cleared around its entrance
    const bare = new THREE.Mesh(bareGeo, bareMat);
    bare.rotation.x = -Math.PI / 2;
    bare.position.set(x, y + 0.02, z);
    bare.scale.setScalar(scale);
    spotGroup.add(bare);
    const m = new THREE.Mesh(moundGeo, mat(color, { roughness: 1, flatShading: true }));
    m.position.set(x, y - 0.05, z);
    m.scale.setScalar(scale);
    spotGroup.add(shadow(m));
    const hole = new THREE.Mesh(holeGeo, mat('#140E0A'));
    hole.scale.setScalar(scale);
    hole.rotation.x = -Math.PI / 2;
    hole.position.set(x, y - 0.02, z);
    spotGroup.add(hole);
    if (flag) {
      const p = new THREE.Mesh(pole, mat('#3A2A1C'));
      p.position.set(x + 0.9 * scale, y + 0.2, z - 0.4);
      spotGroup.add(shadow(p));
      const f = new THREE.Mesh(flagGeo, mat(flag, { side: THREE.DoubleSide, roughness: 0.6 }));
      f.position.set(x + 0.9 * scale, y + 3.4, z - 0.4);
      spotGroup.add(shadow(f));
    }
  }
  function addPlume(x: number, z: number, color: string) {
    const y = gH(x, z);
    const stain = new THREE.Mesh(sk(new THREE.CircleGeometry(1.2, 20)), sk(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false })));
    stain.rotation.x = -Math.PI / 2;
    stain.position.set(x, y + 0.03, z);
    spotGroup.add(stain);
    for (let k = 0; k < 3; k++) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 16; i++) pts.push(new THREE.Vector3(Math.sin(i * 0.7 + k) * 0.25, i * 0.22, 0));
      const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.07, 5);
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false });
      spotDisposables.push(g, m);
      const line = new THREE.Mesh(g, m);
      const base = new THREE.Vector3(x + (k - 1) * 0.55, y, z + (k - 1) * 0.2);
      line.position.copy(base);
      spotGroup.add(line);
      plumes.push({ line, base, phase: k * 2.1 + x });
    }
  }
  function addSite(c: SpotColony, x: number, z: number) {
    const y = gH(x, z);
    if (c.herd) {
      // aphids on a stem
      const stem = new THREE.Mesh(sk(new THREE.CylinderGeometry(0.08, 0.12, 5, 6).translate(0, 2.5, 0)), mat('#5E8A2E'));
      stem.position.set(x, y, z);
      stem.rotation.z = 0.08;
      spotGroup.add(shadow(stem));
      const leaf = new THREE.Mesh(sk(new THREE.SphereGeometry(1, 10, 6).scale(1.1, 0.06, 0.5).translate(1.1, 0, 0)), mat('#7DB043', { side: THREE.DoubleSide }));
      leaf.position.set(x, y + 3.2, z);
      leaf.rotation.set(0, 0.6, 0.3);
      spotGroup.add(shadow(leaf));
      const aphid = sk(new THREE.SphereGeometry(0.15, 10, 8).scale(1, 0.75, 0.75));
      for (let i = 0; i < 12; i++) {
        const a = new THREE.Mesh(aphid, mat('#B5E04A', { roughness: 0.35, emissive: '#5C8E1A', emissiveIntensity: 0.2 }));
        a.position.set(x + Math.sin(i) * 0.12, y + 0.8 + i * 0.33, z + Math.cos(i * 1.7) * 0.12);
        spotGroup.add(a);
      }
      if (c.herd.tended) addMound(x + 1.6, z + 1, '#C8A06A', c.herd.yours ? FLAG.mine : FLAG.other, 0.4);
      return;
    }
    if (c.wild?.kind === 'mound') {
      // a termite tower, cracked and lumpy
      const tower = new THREE.Mesh(sk(new THREE.ConeGeometry(1.5, 6, 9, 5)), mat('#A47E55', { flatShading: true, roughness: 1 }));
      tower.position.set(x, y + 3, z);
      const tp = tower.geometry.attributes.position;
      for (let i = 0; i < tp.count; i++) tp.setX(i, tp.getX(i) * (1 + 0.15 * Math.sin(tp.getY(i) * 3 + i)));
      tower.geometry.computeVertexNormals();
      spotGroup.add(shadow(tower));
      const spire = new THREE.Mesh(sk(new THREE.ConeGeometry(0.6, 2.4, 7)), mat('#B58C5E', { flatShading: true }));
      spire.position.set(x + 0.9, y + 1.2, z + 0.4);
      spotGroup.add(shadow(spire));
      return;
    }
    if (c.wild?.kind === 'den') {
      // a silk-lidded burrow
      const hole = new THREE.Mesh(sk(new THREE.CircleGeometry(1.1, 18)), mat('#120C08'));
      hole.rotation.x = -Math.PI / 2;
      hole.position.set(x, y + 0.02, z);
      spotGroup.add(hole);
      const lid = new THREE.Mesh(sk(new THREE.CylinderGeometry(1.15, 1.15, 0.12, 18)), mat('#7A5C40', { roughness: 1 }));
      lid.position.set(x - 0.5, y + 0.55, z - 0.6);
      lid.rotation.set(-1.0, 0, 0.3);
      spotGroup.add(shadow(lid));
      const silk = mat('#F2EEE6', { roughness: 0.4, transparent: true, opacity: 0.7 });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * 6.28;
        const s = new THREE.Mesh(sk(new THREE.CylinderGeometry(0.015, 0.015, 2.2, 3)), silk);
        s.position.set(x + Math.cos(a) * 1.6, y + 0.05, z + Math.sin(a) * 1.6);
        s.rotation.set(Math.PI / 2, 0, -a + Math.PI / 2);
        spotGroup.add(s);
      }
      return;
    }
    addMound(x, z, '#8C6A48', c.wild ? FLAG.wild : null, 0.9);
  }

  let spotsKey = '';
  const dead: { x: number; z: number; yaw: number; caste: Caste; color: string }[] = [];
  function setSpots(region: number, patch: number, spots: Spot[] | null) {
    // the map is fetched again every few seconds: rebuild only when something on it changed
    const key = JSON.stringify([region, patch, spots]);
    if (key === spotsKey) return;
    spotsKey = key;
    for (const d of spotDisposables.splice(0)) d.dispose();
    spotGroup.clear();
    plumes.length = 0;
    taps = [];
    shown = spots ? { region, patch, spots } : null;
    dead.length = 0;
    if (!spots) return;
    for (const s of spots) {
      const { x, z } = spotPos(s.spot);
      const c = s.colony;
      const scent = !!c && (c.known === 'scent' || c.known === 'familiar');
      if (c && scent) addPlume(x, z, flagColor(c));
      else if (c && isSiteSpot(s.spot)) addSite(c, x, z);
      else if (c) addMound(x, z, c.mine ? '#C8A06A' : c.kind === 'wild' ? '#8C6A48' : '#B08A5C', flagColor(c), c.mine ? 1.45 : 1.25);
      if (s.corpses > 0) {
        // the dead of an old fight, on their backs where they fell (protein for whoever hauls them)
        for (let i = 0; i < Math.min(60, 4 + Math.round(Math.log2(s.corpses + 1) * 3)); i++) {
          const a = hash(s.spot, i) * 6.28, r = 1.4 + hash(i, s.spot) * 2;
          dead.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, yaw: hash(i, 21) * 6.28, caste: hash(i, 22) < 0.5 ? 'soldier' : 'worker', color: hash(i, 23) < 0.5 ? '#8E4A2E' : '#6E3A22' });
        }
      }
      const t = new THREE.Mesh(tapGeo, hitMat);
      t.position.set(x, gH(x, z) + 1.5, z);
      t.userData.spot = s.spot;
      spotGroup.add(t);
      taps.push(t);
    }
    // empty spots (where a colony could go) and the wilds (where foragers go): a dotted circle to tap
    openRings = [];
    for (let n = 1; n <= WILDS_SPOT; n++) {
      if (spots.find((s) => s.spot === n)?.colony) continue;
      const { x, z } = spotPos(n);
      const mat = sk(new THREE.MeshBasicMaterial({ map: dottedTex, transparent: true, opacity: 0.75, depthWrite: false, depthTest: false }));
      const ring = new THREE.Mesh(dottedGeo, mat);
      ring.rotation.x = -Math.PI / 2;
      ring.scale.setScalar(n === WILDS_SPOT ? 4.6 : 3.2);
      ring.position.set(x, gH(x, z) + 0.06, z);
      ring.renderOrder = 2;
      spotGroup.add(ring);
      openRings.push({ spot: n, mesh: ring, mat });
    }
    applySelected();
    buildOrder();
    if (pendingReplay && inView(pendingReplay.target)) {
      startReplay(pendingReplay);
      pendingReplay = null;
    }
  }
  let selected: number | null = null;
  function applySelected() {
    if (selected == null || !shown) {
      ring.visible = false;
      return;
    }
    const { x, z } = spotPos(selected);
    ring.position.set(x, gH(x, z) + 0.12, z);
    ring.visible = true;
  }

  // ---------- parties: every mission and incoming party touching this patch, walking its scent trail ----------
  const CAP = coarse ? 0.5 : 1;
  const ants = createAnts(scene, {
    worker: Math.round(1400 * CAP), soldier: Math.round(900 * CAP), queen: 4, alate: 8,
    army: Math.round(1300 * CAP), army_major: Math.round(330 * CAP),
  }, !coarse);
  disposables.push(ants);
  const SWARM_CAP = Math.round(1500 * CAP), PARTY_CAP = Math.round(300 * CAP);
  interface Trail { key: string; mesh: THREE.Mesh; pts: THREE.Vector3[]; lens: number[]; total: number; lead?: THREE.Vector3 }
  const trails = new Map<string, Trail>();
  const trailGroup = new THREE.Group();
  scene.add(trailGroup);
  const inView = (c: { region: number; patch: number } | null | undefined) => !!c && !!shown && c.region === shown.region && c.patch === shown.patch;
  /** Where a party starts or ends in this patch: its spot if it's here, else the patch edge on the side it comes from. */
  const endAt = (c: { region: number; patch: number; spot: number }, other: { region: number; patch: number; spot: number }) => {
    if (inView(c)) return spotPos(c.spot);
    return { x: leftOf(c, other) ? -EDGE : EDGE, z: hash(c.patch, c.spot) * 10 - 5 };
  };
  function trailFor(key: string, a: { x: number; z: number }, b: { x: number; z: number }, color: string, bend: number) {
    const k = `${key}|${a.x.toFixed(1)},${a.z.toFixed(1)}|${b.x.toFixed(1)},${b.z.toFixed(1)}|${color}`;
    const old = trails.get(key);
    if (old?.key === k) return old;
    if (old) {
      trailGroup.remove(old.mesh);
      old.mesh.geometry.dispose();
      (old.mesh.material as THREE.Material).dispose();
    }
    // a gentle curve, sampled along the ground
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
    const cx = (a.x + b.x) / 2 - (dz / len) * len * 0.12 * bend, cz = (a.z + b.z) / 2 + (dx / len) * len * 0.12 * bend;
    const pts: THREE.Vector3[] = [];
    const n = Math.max(12, Math.round(len * 1.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const x = u * u * a.x + 2 * u * t * cx + t * t * b.x, z = u * u * a.z + 2 * u * t * cz + t * t * b.z;
      pts.push(new THREE.Vector3(x, gH(x, z), z));
    }
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
    // the scent trail itself: a faint ribbon on the ground in the party's colour
    const pos: number[] = [], idx: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q2 = pts[Math.min(i + 1, pts.length - 1)], p0 = pts[Math.max(i - 1, 0)];
      const tx = q2.x - p0.x, tz = q2.z - p0.z, tl = Math.hypot(tx, tz) || 1;
      const nx = (-tz / tl) * 0.35, nz = (tx / tl) * 0.35;
      pos.push(p.x + nx, p.y + 0.05, p.z + nz, p.x - nx, p.y + 0.05, p.z - nz);
      if (i) idx.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
    trailGroup.add(mesh);
    const t: Trail = { key: k, mesh, pts, lens, total: lens[lens.length - 1] };
    trails.set(key, t);
    return t;
  }
  const at = new THREE.Vector3(), dir = new THREE.Vector3();
  function along(t: Trail, d: number) {
    d = Math.max(0, Math.min(t.total, d));
    let i = 1;
    while (i < t.lens.length - 1 && t.lens[i] < d) i++;
    const a = t.pts[i - 1], b = t.pts[i];
    const k = (d - t.lens[i - 1]) / ((t.lens[i] - t.lens[i - 1]) || 1);
    at.lerpVectors(a, b, k);
    dir.subVectors(b, a);
    return at;
  }

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  interface Column {
    key: string;
    from: { x: number; z: number };
    to: { x: number; z: number };
    /** 0 at `from`, 1 at `to` */
    k: number;
    n: number;
    units: number;
    caste: (i: number) => Caste;
    color?: string;
    trail: string;
    cargo: ResourceId[];
    label: string;
    tone: string;
    endsAt: number;
    holding?: boolean;
  }
  function columns(d: PatchData): Column[] {
    const st = d.state, out: Column[] = [];
    if (!st || !shown) return out;
    const mine = new Map((st.colonies ?? []).map((c) => [c.id, c.coords]));
    for (const m of (st.missions ?? []) as any[]) {
      const home = mine.get(m.originColonyId);
      if (!home || (!inView(home) && !inView(m.target))) continue;
      const units = Object.values(m.units as Record<string, number>).reduce((a, b) => a + (b ?? 0), 0);
      const soldiers = roleCount(m.units, 'soldier') / Math.max(1, units);
      const homeAt = endAt(home, m.target), there = endAt(m.target, home);
      const ob = m.status === 'outbound', hold = m.status === 'holding';
      const k = hold ? 1 : ob ? clamp01((d.now - m.departAt) / (m.arriveAt - m.departAt)) : 1 - clamp01((d.now - m.arriveAt) / (m.returnAt - m.arriveAt));
      const label = (MISSION_TYPES as Record<string, { label: string }>)[m.type]?.label ?? m.type;
      out.push({
        key: `m${m.id}`, from: homeAt, to: there, k, n: Math.min(PARTY_CAP, units), units,
        caste: (i) => (m.type === 'colonize' ? (i === 0 ? 'alate' : 'worker') : hash(i, m.id) < soldiers ? 'soldier' : 'worker'),
        trail: FLAG.mine, cargo: ob || hold ? [] : (Object.keys(CARGO) as ResourceId[]).filter((r) => (m.cargo?.[r] ?? 0) > 0),
        label: `${label}${ob || hold ? '' : ' home'}`, tone: 'ours', endsAt: hold ? 0 : ob ? m.arriveAt : m.returnAt, holding: hold,
      });
    }
    for (const i of (st.incoming ?? []) as any[]) {
      const target = i.herd ?? mine.get(i.targetColonyId);
      if (!target || (!inView(target) && !inView(i.origin))) continue;
      const swarm = i.type === 'swarm', hostile = !!i.hostile;
      const k = i.departAt ? clamp01((d.now - i.departAt) / (i.arriveAt - i.departAt)) : 0.5;
      const units = Math.max(1, i.unitCount ?? 1);
      const what = swarm ? 'Swarm' : i.type === 'raid' ? 'Raid' : i.type === 'scout' ? 'Scouts' : i.type === 'hold' ? 'Allied soldiers' : 'Delivery';
      out.push({
        key: `i${i.id}`, from: endAt(i.origin, target), to: endAt(target, i.origin), k, units,
        n: Math.min(swarm ? SWARM_CAP : PARTY_CAP, units),
        caste: (n) => (swarm ? (n % 5 === 2 ? 'army_major' : 'army') : i.type === 'raid' || i.type === 'hold' ? 'soldier' : 'worker'),
        color: swarm ? undefined : hostile ? CHITIN.raider : i.type === 'hold' ? '#3FA79E' : FLAG.other,
        trail: hostile ? '#C4473A' : i.type === 'hold' ? FLAG.ally : FLAG.other, cargo: [],
        label: what, tone: hostile ? 'raid' : 'ours', endsAt: i.arriveAt,
      });
    }
    return out;
  }

  function drawColumns(d: PatchData) {
    const live = new Set<string>();

    for (const c of columns(d)) {
      live.add(c.key);
      const t = trailFor(c.key, c.from, c.to, c.trail, hash(c.key.length, Number(c.key.slice(1))) < 0.5 ? 1 : -1);
      const swarm = c.caste(0) === 'army' || c.caste(2) === 'army_major';
      const lanes = Math.min(swarm ? 9 : 4, Math.max(1, Math.round(Math.sqrt(c.n / (swarm ? 5 : 12)))));
      const gap = swarm ? 0.3 : 0.46;
      const lead = c.k * t.total;
      if (swarm) {
        // an army-ant swarm is a fan: a wide front that thins into the column behind it (docs/20-swarms.md)
        for (let i = 0; i < c.n; i++) {
          const dep = Math.min(32, -Math.log(1 - 0.995 * hash(i, 11)) * 5.2);
          const dd = lead - dep;
          if (dd < 0) continue;
          along(t, dd);
          const half = 5.6 * Math.exp(-dep / 5) + 0.55;
          const wob = reduced ? 0 : Math.sin(clock * 3.3 + i * 1.37) * 0.14;
          const tl = Math.hypot(dir.x, dir.z) || 1, nx = -dir.z / tl, nz = dir.x / tl;
          const side = (hash(i, 12) * 2 - 1) * half + wob;
          const x = at.x + nx * side, z = at.z + nz * side;
          const caste = c.caste(i);
          ants.ant(caste, x, gH(x, z), z, {
            scale: (ANT / 0.9) * (caste === 'army_major' ? 1.3 : 1),
            yaw: Math.atan2(-dir.z, dir.x) + wob * 2 + (hash(i, 13) - 0.5) * 0.6, step: reduced ? 0 : 19,
          });
        }
        flushAhead(t, lead);
      } else for (let i = 0; i < c.n; i++) {
        const row = Math.floor(i / lanes), lane = i % lanes;
        // holding parties mill about the spot; others string out behind their leader, the rest still in the nest
        let dd = lead - row * gap - hash(i, 3) * gap * 0.7;
        if (c.holding) dd = t.total - (row % 12) * 0.3;
        if (dd < 0) continue;
        along(t, dd);
        const side = (lane - (lanes - 1) / 2) * (swarm ? 0.34 : 0.3) + (hash(i, 4) - 0.5) * 0.18;
        const wob = reduced ? 0 : Math.sin(clock * (swarm ? 3.3 : 1.8) + i * 1.37) * (swarm ? 0.12 : 0.05);
        const tl = Math.hypot(dir.x, dir.z) || 1, nx = -dir.z / tl, nz = dir.x / tl;
        const x = at.x + nx * (side + wob), z = at.z + nz * (side + wob);
        // heading home when the party is on its way back (k falls), else toward the target
        const back = c.label.endsWith(' home');
        const yaw = Math.atan2(-(back ? -dir.z : dir.z), back ? -dir.x : dir.x) + wob;
        const caste = c.caste(i);
        const r = c.cargo.length ? c.cargo[i % c.cargo.length] : null;
        ants.ant(caste, x, gH(x, z), z, {
          // ants3d's body is about 0.9 long: scale it to 5 mm
          scale: (ANT / 0.9) * (caste === 'soldier' ? 1.15 : caste === 'army_major' ? 1.3 : caste === 'alate' ? 1.5 : 1),
          yaw, step: reduced || c.holding ? 0 : swarm ? 19 : 15, color: c.color,
          cargo: r ? { kind: LOAD[r], color: CARGO[r] } : null,
        });
      }
      along(t, Math.max(0, lead));
      t.lead = (t.lead ?? new THREE.Vector3()).copy(at);
      const time = c.endsAt ? ` · ${fmtDuration(Math.max(0, c.endsAt - d.now))}` : '';
      label(`party-${c.key}`, `nest-trip p3-trip ${c.tone}`, at.x, at.y + 1.4, at.z, `${esc(c.label)} · ${c.units.toLocaleString()}${time}`);
    }
    for (const [k, t] of trails) {
      if (live.has(k)) continue;
      trailGroup.remove(t.mesh);
      t.mesh.geometry.dispose();
      (t.mesh.material as THREE.Material).dispose();
      trails.delete(k);
    }
  }

  // ---------- battles: a report acted out where it was fought (the live clash, and Replay from a report) ----------
  // The server fought it already; this only shows its numbers: each side's ants, the front line, the dead
  // falling on their backs round by round, then the winners pressing on or the losers walking away.
  const BATTLE_CAP = Math.round(320 * CAP);
  interface Replay { plan: BattlePlan; t: number; startedAt: number; at: { x: number; z: number }; dx: number; dz: number; na: number; nd: number }
  let replay: Replay | null = null;
  let pendingReplay: BattlePlan | null = null;
  const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const DUST = 90;
  const dustPos = new Float32Array(DUST * 3), dustLife = new Float32Array(DUST).fill(1);
  const dustGeo = keep(new THREE.BufferGeometry());
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return keep(new THREE.CanvasTexture(c));
  })();
  const dust = new THREE.Points(dustGeo, keep(new THREE.PointsMaterial({ map: dustTex, color: '#D8C29A', size: 1.8, transparent: true, opacity: 0.32, depthWrite: false })));
  dust.visible = false;
  scene.add(dust);

  function startReplay(plan: BattlePlan) {
    const at = spotPos(plan.target.spot);
    const from = plan.origin && !(plan.origin.region === plan.target.region && plan.origin.patch === plan.target.patch && plan.origin.spot === plan.target.spot)
      ? endAt(plan.origin, plan.target)
      : { x: at.x + 20, z: at.z };
    let dx = from.x - at.x, dz = from.z - at.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    // timed by the real clock, so a slow frame rate doesn't stretch the fight
    replay = { plan, t: reduced ? replayLength(plan) : 0, startedAt: performance.now(), at, dx, dz, na: Math.min(BATTLE_CAP, Math.max(1, plan.attacker.start)), nd: Math.min(BATTLE_CAP, Math.max(1, plan.defender.start)) };
    dustLife.fill(1);
    // frame the fight: close enough to see ants, far enough to see both sides
    Object.assign(goal, { tx: at.x + dx * 3, tz: at.z + dz * 3 + 1, dist: Math.min(homeDist, 22) });
    clampGoal();
  }
  function playBattle(data: unknown) {
    const plan = planBattle(data);
    if (!plan) return false;
    if (inView(plan.target)) startReplay(plan);
    else pendingReplay = plan; // the patch it was fought on is still loading
    return true;
  }

  const ATT_MINE = CHITIN.worker, ENEMY = CHITIN.raider, THEIRS = '#A85A3A';
  function drawReplay(dt: number) {
    if (!replay) {
      dust.visible = false;
      return;
    }
    const r = replay, p = r.plan;
    r.t = reduced ? replayLength(p) : (performance.now() - r.startedAt) / 1000;
    const m = momentAt(p, r.t);
    if (m.phase === 'done' && r.t > replayLength(p) + TIMING.linger) {
      replay = null;
      dust.visible = false;
      return;
    }
    const aliveA = drawnFor(m.attackers, p.attacker.start, r.na), aliveD = drawnFor(m.defenders, p.defender.start, r.nd);
    // the front line sits between the mound and the attackers; lateral runs across it
    const fx = r.at.x + r.dx * 2.8, fz = r.at.z + r.dz * 2.8, nx = -r.dz, nz = r.dx;
    const attackersWon = p.winner === 'attacker' && p.fellBackAfter == null;
    const attackersLeave = !attackersWon && p.winner !== 'draw';
    const ko = m.phase === 'outcome' || m.phase === 'done' ? ease(Math.min(1, m.k)) : 0;
    const youAttack = p.perspective === 'attacker';
    const attColor = p.attacker.swarm ? undefined : youAttack ? ATT_MINE : ENEMY;
    const defColor = p.defender.wild || youAttack ? (youAttack ? THEIRS : ENEMY) : undefined;
    const faceIn = Math.atan2(r.dz, -r.dx), faceOut = Math.atan2(-r.dz, r.dx);
    const fighting = m.phase === 'fight';
    const sideAnts = (n: number, alive: number, attacker: boolean) => {
      const side = attacker ? p.attacker : p.defender;
      const wide = side.swarm ? 5.2 : 3.2;
      for (let j = 0; j < n; j++) {
        // the last ants in the list stand at the front, so they fall first
        const u = 1 - (j + 0.5) / n;
        const dep = -Math.log(1 - 0.99 * u) * (side.swarm ? 1.8 : 1.3);
        const lat = (hash(j, attacker ? 7 : 8) * 2 - 1) * (wide * Math.exp(-dep / 4) + 0.6);
        const dead = j >= alive;
        let off = 0, yaw = attacker ? faceIn : faceOut;
        if (!dead) {
          if (m.phase === 'approach') off = (1 - ease(m.k)) * (attacker ? 9 : -(2.8 + dep));
          if (attacker && attackersWon) off = -ko * 3.5;
          if (attacker && attackersLeave) {
            off = ko * 9;
            yaw = faceOut;
          }
          if (!attacker && attackersWon) off = -ko * (2.8 + dep); // survivors pull back into the nest
        }
        const along = (attacker ? 1 : -1) * (0.3 + dep) + off;
        const lunge = fighting && !dead && dep < 1.5 && !reduced ? Math.sin(clock * 9 + j) * 0.12 * (attacker ? -1 : 1) : 0;
        const x = fx + r.dx * (along + lunge) + nx * lat, z = fz + r.dz * (along + lunge) + nz * lat;
        // defenders who made it back inside disappear down the entrance
        if (!attacker && !dead && attackersWon && ko > 0.85) continue;
        const caste: Caste = side.swarm ? (j % 5 === 2 ? 'army_major' : 'army') : hash(j, 9) < side.soldiers ? 'soldier' : 'worker';
        ants.ant(caste, x, gH(x, z), z, {
          scale: (ANT / 0.9) * (caste === 'soldier' ? 1.15 : caste === 'army_major' ? 1.3 : 1),
          yaw: yaw + (dead ? hash(j, 10) * 2 - 1 : lunge * 2), flip: dead,
          step: dead || reduced ? 0 : 17, color: attacker ? attColor : defColor,
        });
      }
    };
    sideAnts(r.na, aliveA, true);
    sideAnts(r.nd, aliveD, false);
    // dust over the front line while they fight
    dust.visible = fighting && !reduced;
    if (dust.visible) {
      for (let i = 0; i < DUST; i++) {
        dustLife[i] += dt * (0.6 + hash(i, 1) * 0.6);
        if (dustLife[i] >= 1) {
          dustLife[i] = 0;
          const lat = (hash(i, Math.floor(performance.now() / 300)) * 2 - 1) * 4.5;
          const fwd = (hash(i, 31) - 0.5) * 1.6;
          dustPos[i * 3] = fx + nx * lat + r.dx * fwd;
          dustPos[i * 3 + 2] = fz + nz * lat + r.dz * fwd;
          dustPos[i * 3 + 1] = gH(fx, fz) + 0.1;
        }
        dustPos[i * 3 + 1] += dt * 0.25;
      }
      dustGeo.attributes.position.needsUpdate = true;
    }
    const n = (x: number) => Math.max(0, Math.round(x)).toLocaleString();
    const text =
      m.phase === 'approach' ? `${p.attacker.name} attacks ${p.defender.name}`
        : m.phase === 'fight' ? `Round ${m.round} of ${p.rounds} · ${p.attacker.name} ${n(m.attackers)} · ${p.defender.name} ${n(m.defenders)}`
          : p.fellBackAfter != null ? `The raiders fell back · ${p.defender.name} held`
            : p.winner === 'attacker' ? `${p.attacker.name} broke through`
              : p.winner === 'defender' ? `${p.defender.name} held`
                : 'A draw: both sides still standing';
    label('battle', 'nest-trip p3-trip raid', fx, gH(fx, fz) + 2.6, fz, esc(text));
  }

  // ---------- an army-ant swarm flushes the small things ahead of it ----------
  const BUGS = 34;
  const bugs = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(1, 8, 6).scale(0.16, 0.07, 0.07)), mat('#8A84BC', { roughness: 0.4 }), BUGS);
  bugs.frustumCulled = false;
  bugs.count = 0;
  scene.add(bugs);
  const bm = new THREE.Matrix4(), bq = new THREE.Quaternion(), bs = new THREE.Vector3(1, 1, 1), bp = new THREE.Vector3();
  /** Springtails and beetles hopping away ahead of the swarm's front, along its trail. */
  function flushAhead(t: Trail, lead: number) {
    let n = 0;
    for (let b = 0; b < BUGS && lead < t.total - 0.5; b++) {
      const cyc = reduced ? hash(b, 2) : (clock * (0.35 + hash(b, 3) * 0.3) + hash(b, 4)) % 1;
      const ahead = 1.2 + cyc * 7 + hash(b, 5) * 2;
      if (lead + ahead > t.total) continue;
      along(t, lead + ahead);
      const tl = Math.hypot(dir.x, dir.z) || 1;
      const lat = (hash(b, 1) * 2 - 1) * (4 + cyc * 5);
      const x = at.x + (-dir.z / tl) * lat, z = at.z + (dir.x / tl) * lat;
      // short ballistic hops
      const hop = Math.abs(Math.sin(cyc * Math.PI * 4)) * 0.7;
      bq.setFromAxisAngle(Y_AXIS, Math.atan2(-dir.z, dir.x));
      bm.compose(bp.set(x, gH(x, z) + 0.06 + hop, z), bq, bs);
      bugs.setMatrixAt(n++, bm);
    }
    bugs.count = Math.max(bugs.count, n);
    bugs.instanceMatrix.needsUpdate = true;
  }

  // ---------- the order being written: From, To, and a dotted route that marches the way the ants will go ----------
  type C3 = { region: number; patch: number; spot: number };
  let order: { from: C3; to: C3; label: string } | null = null;
  const ORDER_DOTS = 160;
  const orderDots = new THREE.InstancedMesh(
    keep(new THREE.CircleGeometry(0.17, 10).rotateX(-Math.PI / 2)),
    keep(new THREE.MeshBasicMaterial({ color: '#FFC93C', transparent: true, opacity: 0.95, depthTest: false, depthWrite: false })),
    ORDER_DOTS,
  );
  orderDots.renderOrder = 3;
  orderDots.frustumCulled = false;
  orderDots.count = 0;
  scene.add(orderDots);
  let orderPath: { pts: THREE.Vector3[]; lens: number[]; total: number } | null = null;
  function buildOrder() {
    orderPath = null;
    if (!order || (!inView(order.from) && !inView(order.to))) return;
    const a = endAt(order.from, order.to), b = endAt(order.to, order.from);
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    if (len < 0.5) return;
    const cx = (a.x + b.x) / 2 - (dz / len) * len * 0.12, cz = (a.z + b.z) / 2 + (dx / len) * len * 0.12;
    const pts: THREE.Vector3[] = [];
    const n = Math.max(12, Math.round(len * 1.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      const x = u * u * a.x + 2 * u * t * cx + t * t * b.x, z = u * u * a.z + 2 * u * t * cz + t * t * b.z;
      pts.push(new THREE.Vector3(x, gH(x, z) + 0.08, z));
    }
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
    orderPath = { pts, lens, total: lens[lens.length - 1] };
  }
  const om = new THREE.Matrix4(), oq = new THREE.Quaternion(), os = new THREE.Vector3(1, 1, 1), op = new THREE.Vector3();
  function drawOrder() {
    if (!orderPath || !order) {
      orderDots.count = 0;
      return;
    }
    const { pts, lens, total } = orderPath;
    // dots grow as the camera backs off, so the route stays readable from the whole-patch view
    const big = Math.max(1, view.dist / 22);
    os.setScalar(big);
    const gap = 0.75 * big, shift = reduced ? 0 : (clock * 1.4 * big) % gap;
    let n = 0;
    for (let d = shift; d < total && n < ORDER_DOTS; d += gap) {
      let i = 1;
      while (i < lens.length - 1 && lens[i] < d) i++;
      const k = (d - lens[i - 1]) / ((lens[i] - lens[i - 1]) || 1);
      op.lerpVectors(pts[i - 1], pts[i], k);
      orderDots.setMatrixAt(n++, om.compose(op, oq, os));
    }
    orderDots.count = n;
    orderDots.instanceMatrix.needsUpdate = true;
    const tag = (c: C3, key: string, html: string) => {
      if (!inView(c)) return;
      const { x, z } = spotPos(c.spot);
      label(key, 'p3-label order', x, gH(x, z) + 2.4, z, html);
    };
    tag(order.from, 'order-from', '<span><b>From</b></span>');
    tag(order.to, 'order-to', `<span><b>To</b> · ${esc(order.label)}</span>`);
  }

  // ---------- labels (HTML over the canvas) ----------
  const labelEls = new Map<string, HTMLDivElement>();
  const seen = new Set<string>();
  const placed: { x: number; y: number; w: number }[] = [];
  const pv = new THREE.Vector3();
  function label(key: string, cls: string, x: number, y: number, z: number, html: string) {
    let el = labelEls.get(key);
    if (!el) {
      el = document.createElement('div');
      labelsEl.appendChild(el);
      labelEls.set(key, el);
    }
    seen.add(key);
    pv.set(x, y, z).project(camera);
    const ok = pv.z < 1 && Math.abs(pv.x) < 1.05 && Math.abs(pv.y) < 1.05;
    el.style.display = ok ? '' : 'none';
    if (!ok) return;
    el.className = cls;
    // labels that would cover one already placed this frame move up above it
    const sx = ((pv.x + 1) / 2) * host.clientWidth, w = html.replace(/<[^>]+>/g, '').length * 6 + 18;
    let sy = ((1 - pv.y) / 2) * host.clientHeight;
    for (let moved = true, guard = 0; moved && guard < 8; guard++) {
      moved = false;
      for (const p of placed) {
        if (Math.abs(p.x - sx) < (p.w + w) / 2 && Math.abs(p.y - sy) < 19) {
          sy = p.y - 20;
          moved = true;
        }
      }
    }
    placed.push({ x: sx, y: sy, w });
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
    if (el.innerHTML !== html) el.innerHTML = html;
  }
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  const short = (s: string, n = 16) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  function spotLabels() {
    if (!shown) return;
    const close = view.dist < homeDist * 0.6;
    // the open spots: brighter under the pointer, which also names them; the wilds are always named
    for (const o of openRings) {
      const hot = o.spot === hoverSpot || o.spot === selected;
      o.mat.opacity = hot ? 1 : reduced ? 0.8 : 0.72 + 0.12 * Math.sin(clock * 1.6 + o.spot);
      const { x, z } = spotPos(o.spot);
      const y = gH(x, z) + 1.2;
      if (o.spot === WILDS_SPOT) label('open-wilds', 'p3-label open', x, y + 0.6, z, '<span>The wilds</span>');
      else if (hot) label(`open-${o.spot}`, 'p3-label open', x, y, z, `<span>Spot ${o.spot} · empty</span>`);
    }
    for (const s of shown.spots) {
      const c = s.colony;
      if (!c) continue;
      const { x, z } = spotPos(s.spot);
      const scent = c.known === 'scent' || c.known === 'familiar';
      const site = isSiteSpot(s.spot);
      const name = site && !scent ? (c.herd ? 'Aphids' : c.wild?.kind === 'den' ? 'Spider' : c.wild?.kind === 'mound' ? 'Termites' : c.name) : c.name;
      const cls = `p3-label${c.mine ? ' mine' : c.relation === 'ally' ? ' ally' : c.kind === 'wild' ? ' wild' : ''}${scent ? ' scent' : ''}`;
      const sub = close && !scent && c.owner && !c.mine ? `<small>${esc(short(c.owner, 18))}</small>` : '';
      label(`spot-${s.spot}`, cls, x, gH(x, z) + (site && !scent ? 6.2 : scent ? 4.4 : 4.2), z, `<span>${esc(short(name))}</span>${sub}`);
    }
  }

  // ---------- camera: zooming in also lowers it, down to ant height ----------
  const view = { tx: 0, tz: 1, yaw: 0, pitch: 0.75, dist: 60 }, goal = { ...view };
  let homeDist = 60;
  const MIN_DIST = 3;
  const TANH = Math.tan(THREE.MathUtils.degToRad(20));
  let inset = { left: 0, right: 0, top: 0, bottom: 0 };
  const pitchFor = (dist: number) => THREE.MathUtils.lerp(0.1, 0.78, smooth(MIN_DIST, homeDist, dist));
  function fit() {
    const w = host.clientWidth, h = host.clientHeight;
    // a hidden or collapsed host has no size yet: wait for the next resize
    if (w < 2 || h < 2) return;
    sized = [w, h];
    renderer.setSize(w, h, false);
    // frame the patch in the part of the view the floating cards leave free, then widen back to the whole canvas
    const fw = Math.max(200, w - inset.left - inset.right), fh = Math.max(200, h - inset.top - inset.bottom);
    camera.aspect = fw / fh;
    if (inset.left || inset.right || inset.top || inset.bottom) camera.setViewOffset(fw, fh, -inset.left, -inset.top, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    // the whole patch, left to right, in view
    const wasHome = goal.dist >= homeDist * 0.999;
    homeDist = Math.max((HALF_W + 5) / (TANH * camera.aspect), 18 / TANH);
    // the haze stays behind the patch however far back the whole-patch view has to stand
    const fog = scene.fog as THREE.Fog;
    fog.near = Math.max(70, homeDist * 0.85);
    fog.far = Math.max(190, homeDist * 2);
    if (wasHome || goal.dist > homeDist) goal.dist = homeDist;
    goal.pitch = pitchFor(goal.dist);
  }
  let sized = [0, 0];
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  fit();
  const reset = () => Object.assign(goal, { tx: 0, tz: 1, yaw: 0, pitch: pitchFor(homeDist), dist: homeDist });
  reset();
  Object.assign(view, goal);
  function placeCamera() {
    const cp = Math.cos(view.pitch);
    const ty = gH(view.tx, view.tz) + (view.dist < 8 ? 0.15 : 0);
    camera.position.set(view.tx + view.dist * cp * Math.sin(view.yaw), ty + view.dist * Math.sin(view.pitch), view.tz + view.dist * cp * Math.cos(view.yaw));
    // never into the ground
    const floor = gH(camera.position.x, camera.position.z) + 0.25;
    if (camera.position.y < floor) camera.position.y = floor;
    camera.lookAt(view.tx, ty, view.tz);
  }
  const clampGoal = () => {
    goal.dist = THREE.MathUtils.clamp(goal.dist, MIN_DIST, homeDist);
    const k = 1 - smooth(MIN_DIST, homeDist, goal.dist) * 0.85;
    goal.tx = THREE.MathUtils.clamp(goal.tx, -HALF_W * k - 4, HALF_W * k + 4);
    goal.tz = THREE.MathUtils.clamp(goal.tz, -HALF_D + 2, HALF_D - 2);
    goal.pitch = pitchFor(goal.dist);
  };

  // keys: WASD or the arrows slide across the patch the way the camera faces, Q/E turn, Shift for faster
  const keys = moveKeys({ turn: true, listening: () => visible && !document.hidden && host.clientWidth > 1 });
  function keyMove(dt: number) {
    if (!keys.active()) return;
    const { right, forward, turn, fast } = keys.read();
    const sp = fast ? 2.5 : 1;
    // the same as dragging the ground, about two thirds of the view's height a second
    const h = Math.max(200, host.clientHeight);
    const px = 0.7 * h * dt * sp, u = (2 * goal.dist * TANH) / h;
    const dx = -right * px, dy = forward * px;
    const c = Math.cos(goal.yaw), s = Math.sin(goal.yaw);
    goal.tx -= (dx * c + dy * s) * u;
    goal.tz -= ((-dx * s + dy * c) * u) / Math.max(0.35, Math.sin(goal.pitch));
    goal.yaw += turn * 1.6 * sp * dt;
    clampGoal();
  }

  // grass: see-through while the camera moves over the zoomed-out patch, so the columns show; it grows back
  // half a second after the camera settles. At ant height the grass stays solid: there, it's the point.
  let grassFade = 0, settled = 1;
  const lastCam = new THREE.Vector3().copy(camera.position);
  function fadeGrass(dt: number) {
    const moved = camera.position.distanceTo(lastCam) > view.dist * 0.0004;
    lastCam.copy(camera.position);
    settled = moved || keys.active() ? 0 : settled + dt;
    const high = smooth(12, homeDist * 0.5, view.dist);
    const want = settled < 0.5 ? high : 0;
    grassFade = reduced ? want : want > grassFade ? Math.min(want, grassFade + dt * 6) : Math.max(want, grassFade - dt * 2.5);
    grassU.uFade.value = grassFade;
    if (!grassInst) return;
    grassInst.material = grassFade > 0.01 ? grassSeeThrough : grassMat;
    grassInst.castShadow = !coarse && grassFade < 0.5;
  }

  // pointer: drag to move across the patch (or turn, with the right button or shift), wheel or pinch to zoom, tap a spot
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  const setNdc = (cx: number, cy: number) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };
  const pickAt = (e: PointerEvent) => {
    setNdc(e.clientX, e.clientY);
    return (ray.intersectObjects(taps, false)[0]?.object as THREE.Mesh | undefined) ?? null;
  };
  // keep zooming out past the whole patch and you rise to the Garden (the scale ladder)
  let rise = 0;
  function zoomAt(f: number, cx: number, cy: number) {
    if (f > 1 && goal.dist >= homeDist * 0.999) {
      rise += f - 1;
      if (rise > 0.45 && cb.onRise) {
        rise = 0;
        cb.onRise();
      }
      return;
    }
    rise = 0;
    const d = THREE.MathUtils.clamp(goal.dist * f, MIN_DIST, homeDist);
    if (d === goal.dist) return;
    setNdc(cx, cy);
    if (ray.ray.intersectPlane(groundPlane, hit)) {
      const k = 1 - d / goal.dist;
      goal.tx += (hit.x - goal.tx) * k;
      goal.tz += (hit.z - goal.tz) * k;
    }
    goal.dist = d;
    if (d >= homeDist * 0.999) Object.assign(goal, { tx: 0, tz: 1, yaw: 0 });
    clampGoal();
  }
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    zoomAt(Math.exp(e.deltaY * (e.ctrlKey ? 0.012 : 0.0015)), e.clientX, e.clientY);
    if (reduced) step(0);
  };
  canvas.addEventListener('wheel', onWheel, { passive: false });
  const pointers = new Map<number, { x: number; y: number }>();
  let drag: { x: number; y: number; sx: number; sy: number; t: number; turn: boolean } | null = null;
  let pinch = 0;
  const onDown = (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
    drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), turn: e.button === 2 || e.shiftKey };
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) zoomAt(pinch / d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = d;
      return;
    }
    if (!drag) {
      if (e.pointerType === 'mouse') {
        const o = pickAt(e);
        canvas.classList.toggle('pointing', !!o);
        hoverSpot = (o?.userData.spot as number | undefined) ?? null;
      }
      return;
    }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (drag.turn) goal.yaw -= dx * 0.005;
    else {
      // move the ground with the pointer, turned to the way the camera faces
      const u = (2 * goal.dist * TANH) / Math.max(200, host.clientHeight);
      const c = Math.cos(goal.yaw), s = Math.sin(goal.yaw);
      goal.tx -= (dx * c + dy * s) * u;
      goal.tz -= (-dx * s + dy * c) * u / Math.max(0.35, Math.sin(goal.pitch));
    }
    clampGoal();
    drag.x = e.clientX;
    drag.y = e.clientY;
  };
  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = 0;
    if (drag && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8 && performance.now() - drag.t < 500) {
      const o = pickAt(e);
      if (o) cb.onPick(o.userData.spot as number);
    }
    drag = null;
  };
  const onCtx = (e: Event) => e.preventDefault();
  const onLeave = () => {
    hoverSpot = null;
    canvas.classList.remove('pointing');
  };
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('contextmenu', onCtx);
  canvas.addEventListener('dblclick', reset);

  // ---------- day and night by the player's clock ----------
  let hourShown = -1;
  function applySky(hour: number) {
    hourShown = hour;
    const s = skyFor(hour);
    const L = (a: number, b: number) => a + (b - a) * s.night;
    (scene.background as THREE.Color).set(s.sky);
    (scene.fog as THREE.Fog).color.set(s.sky);
    hemi.color.set('#E4F2FF').lerp(new THREE.Color('#6475B5'), s.night);
    hemi.groundColor.set('#A0824C').lerp(new THREE.Color('#251C2C'), s.night);
    hemi.intensity = L(1.1, 0.5);
    sun.intensity = L(2.2, 0.55);
    sun.color.set('#FFE2A6').lerp(new THREE.Color('#A9BCFF'), s.night);
    fill.intensity = L(0.55, 0.15);
    antUniforms.uRim.value.setRGB(L(0.55, 0.1), L(0.38, 0.13), L(0.12, 0.3));
    grassU.uRim.value.setRGB(L(0.28, 0.04), L(0.36, 0.07), L(0.05, 0.14));
    grassU.uGlow.value = L(0.22, 0.02);
    host.style.background = s.sky;
  }

  // ---------- the scale bar: how much of the garden is in view ----------
  const scaleCb: { fn?: (t: string) => void } = {};
  let scaleShown = '';
  function scaleText() {
    const across = 2 * view.dist * TANH * camera.aspect;
    const cm = (across * MM) / 10;
    const lengths = Math.round(across / ANT / 10) * 10;
    return `View ≈ ${cm >= 100 ? `${(cm / 100).toFixed(1)} m` : `${Math.round(cm)} cm`} across · ${Math.max(10, lengths)} ant lengths`;
  }

  // ---------- loop ----------
  let clock = 0;
  let visible = true;
  const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting));
  io.observe(host);
  let raf = 0, last = performance.now(), sinceStill = 1;
  function step(dt: number) {
    const d = get();
    seen.clear();
    clock += reduced ? 0 : dt;
    antUniforms.uTime.value = clock;
    grassU.uTime.value = clock;
    // a view that opened hidden or at zero size measures itself again once it has one
    if (host.clientWidth !== sized[0] || host.clientHeight !== sized[1]) fit();
    const hour = new Date(d.now).getHours();
    if (hour !== hourShown) applySky(hour);
    keyMove(dt);
    const k = reduced ? 1 : Math.min(1, dt * 8);
    view.tx += (goal.tx - view.tx) * k;
    view.tz += (goal.tz - view.tz) * k;
    view.yaw += (goal.yaw - view.yaw) * k;
    view.dist += (goal.dist - view.dist) * k;
    view.pitch = pitchFor(view.dist);
    placeCamera();
    fadeGrass(dt);
    for (const p of plumes) {
      p.line.position.set(p.base.x + (reduced ? 0 : Math.sin(clock * 0.9 + p.phase) * 0.12), p.base.y, p.base.z);
      p.line.rotation.y = reduced ? 0 : Math.sin(clock * 0.5 + p.phase) * 0.4;
    }
    ring.material.opacity = reduced ? 0.9 : 0.65 + 0.3 * Math.sin(clock * 3);
    placed.length = 0;
    spotLabels();
    ants.begin();
    bugs.count = 0;
    for (const c of dead) ants.ant(c.caste, c.x, gH(c.x, c.z), c.z, { scale: ANT / 0.9, yaw: c.yaw, flip: true, color: c.color });
    drawColumns(d);
    drawReplay(dt);
    ants.end();
    drawOrder();
    for (const [key, el] of labelEls) if (!seen.has(key)) { el.remove(); labelEls.delete(key); }
    const st = scaleText();
    if (st !== scaleShown) {
      scaleShown = st;
      scaleCb.fn?.(st);
    }
    renderer.render(scene, camera);
  }
  function frame(t: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (!visible || document.hidden) return;
    // still: draw about once a second so columns and timers stay current (but every frame while a key moves the view)
    if (reduced && !keys.active()) {
      sinceStill += dt;
      if (sinceStill < 1) return;
      sinceStill = 0;
    }
    step(dt);
  }
  raf = requestAnimationFrame(frame);
  const still = () => reduced && step(0);

  return {
    setSpots(region, patch, spots) {
      setSpots(region, patch, spots);
      still();
    },
    setSelected(spot) {
      selected = spot;
      applySelected();
      still();
    },
    setReduced(r) {
      reduced = r;
    },
    playBattle(data) {
      const ok = playBattle(data);
      still();
      return ok;
    },
    setInset(i) {
      inset = i;
      fit();
      still();
    },
    setOrder(o) {
      const fresh = !!o && (!order || JSON.stringify([order.from, order.to]) !== JSON.stringify([o.from, o.to]));
      order = o;
      buildOrder();
      // frame both ends of the order in the room Deploy leaves, rather than the whole patch
      if (fresh && orderPath) {
        const a = orderPath.pts[0], b = orderPath.pts[orderPath.pts.length - 1];
        const span = Math.hypot(b.x - a.x, b.z - a.z);
        Object.assign(goal, { tx: (a.x + b.x) / 2, tz: (a.z + b.z) / 2 + 2, yaw: 0, dist: Math.min(homeDist, Math.max(20, (span + 8) / (TANH * camera.aspect))) });
        clampGoal();
      }
      if (!o) reset();
      still();
    },
    focusParty(key) {
      const t = trails.get(key);
      if (!t) return false;
      // frame the head of the column from a middle height, close enough to see the ants
      const p = t.lead ?? t.pts[Math.floor(t.pts.length / 2)];
      Object.assign(goal, { tx: p.x, tz: p.z + 3, dist: Math.min(homeDist, 30) });
      clampGoal();
      still();
      return true;
    },
    antsEye() {
      const d = get();
      const home = d.colony && inView(d.colony.coords) ? spotPos(d.colony.coords.spot) : { x: 0, z: 1 };
      // just in front of your mound, low, looking across it toward the back of the patch
      Object.assign(goal, { tx: home.x + 1.5, tz: home.z + 3.5, yaw: 0.35, dist: MIN_DIST });
      clampGoal();
      still();
    },
    resetView() {
      reset();
      still();
    },
    setOnScale(fn) {
      scaleCb.fn = fn;
      if (scaleShown) fn(scaleShown);
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      keys.dispose();
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('contextmenu', onCtx);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('dblclick', reset);
      for (const el of labelEls.values()) el.remove();
      for (const t of trails.values()) {
        t.mesh.geometry.dispose();
        (t.mesh.material as THREE.Material).dispose();
      }
      for (const d of [...spotDisposables, ...disposables]) d.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
