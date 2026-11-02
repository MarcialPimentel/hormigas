// The Whole Yard (docs/art/whole-yard.md): the whole world on one map, from the back garden (≈30 m) down to ant
// height, with Civilization's map grammar on top: every patch a hex tile, scent borders, banners, mounds that grow.
// Like the other 3D views it only acts out server state: regions come from /api/map/region, a patch's spots from
// /api/map, parties from the game state. Picking a spot or diving into a mound is handed back to React.
//
// Units: 1 = 1 cm. A patch is a hex 1 m across; a region is 10 × 10 patches; the five regions sit as the yard's beds.
// Travel times don't change: the hexes are only how patches are drawn (docs/11-world.md, Coordinates).
import * as THREE from 'three';
import { WILDS_SPOT, WORLD } from '@hormigas/shared';
import moundsUrl from './mounds.json?url';
import { CHITIN, antUniforms, createAnts, type Ants } from '../nest3d/ants3d';
import { tripProgress } from '../UnderWay';
import type { Spot, Coords } from '../Patch';
import type { ServerState } from '../../game';

export interface RegionPatch { patch: number; colonies: number; wild: boolean; mine: boolean; ally?: boolean }
export type Rung = 'yard' | 'region' | 'patch' | 'ground';
export interface YardData { state: ServerState | null; now: number; colonyId: number | null }
export interface YardHandlers {
  /** a spot was tapped (a mound, a wild site, an empty spot) */
  onPick: (at: Coords) => void;
  /** double-click on one of your own mounds: the camera has dived into its crater */
  onDive: (at: Coords) => void;
  /** the camera is close over this patch: load its spots */
  onLook: (region: number, patch: number) => void;
  onRung: (r: Rung) => void;
}
export interface YardScene {
  setRegion(region: number, patches: RegionPatch[]): void;
  setSpots(region: number, patch: number, spots: Spot[]): void;
  setSelected(at: Coords | null): void;
  /** fly the camera to a place, at a level */
  flyTo(at: { region: number; patch: number; spot?: number }, rung: Rung): void;
  wholeYard(): void;
  setReduced(r: boolean): void;
  dispose(): void;
}

type MoundData = { pos: number[]; tri: number[][]; r: number; h: number };
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- layout: where each region, patch and spot sits
const HR = 50, HW = Math.sqrt(3) * HR, ROW = 1.5 * HR;
/** by region number (WORLD.regionNames order): The Backyard, The Old Garden, Creekside, The Woodpile, The Long Grass */
const REGIONS = [
  { ox: -980, oz: -1700, color: '#86BE4E', alt: '#7AB246', kind: 'lawn' },
  { ox: -1950, oz: -1700, color: '#9A7046', alt: '#86603C', kind: 'garden' },
  { ox: -1465, oz: -860, color: '#93B49C', alt: '#86A890', kind: 'creek' },
  { ox: -10, oz: -1700, color: '#8A6A44', alt: '#7D5F3C', kind: 'wood' },
  { ox: -495, oz: -860, color: '#6FA83E', alt: '#629A36', kind: 'grass' },
] as const;
const NREG = Math.min(WORLD.regions, REGIONS.length);
const PER = Math.min(100, WORLD.patchesPerRegion);
const SHIFT = { x: 1200, z: 1050 }; // centre the yard on the origin
function tileAt(region: number, patch: number) {
  const g = REGIONS[region - 1], row = Math.floor((patch - 1) / 10), col = (patch - 1) % 10;
  return { x: g.ox + col * HW + (row % 2) * HW / 2 + SHIFT.x, z: g.oz + row * ROW + SHIFT.z, row, col };
}
/** spots 1–12 in two rings; the wilds (13) and the wild sites (14+) round the edge */
function spotOffset(spot: number): [number, number] {
  if (spot >= 1 && spot <= 12) { const a = ((spot - 1) / 12) * Math.PI * 2 + 0.3, d = spot % 2 ? 20 : 34; return [Math.cos(a) * d, Math.sin(a) * d]; }
  const k = spot - WILDS_SPOT, a = -0.9 + k * 0.55;
  return [Math.cos(a) * 41, Math.sin(a) * 41];
}
function spotAt(c: { region: number; patch: number; spot: number }) {
  const t = tileAt(c.region, c.patch), [dx, dz] = spotOffset(c.spot);
  return new THREE.Vector3(t.x + dx, 0, t.z + dz);
}
function patchUnder(x: number, z: number): { region: number; patch: number } | null {
  let best: { region: number; patch: number } | null = null, bd = HR * HR;
  for (let r = 1; r <= NREG; r++) {
    const g = REGIONS[r - 1];
    const row = Math.round((z - SHIFT.z - g.oz) / ROW);
    for (const rr of [row - 1, row, row + 1]) {
      if (rr < 0 || rr > 9) continue;
      const col = Math.round((x - SHIFT.x - g.ox - (rr % 2) * HW / 2) / HW);
      for (const cc of [col - 1, col, col + 1]) {
        if (cc < 0 || cc > 9) continue;
        const p = rr * 10 + cc + 1;
        if (p > PER) continue;
        const t = tileAt(r, p), d = (t.x - x) ** 2 + (t.z - z) ** 2;
        if (d < bd) { bd = d; best = { region: r, patch: p }; }
      }
    }
  }
  return best;
}

const OWN = { you: '#F2B21F', ally: '#2F9C95', rival: '#9A6B45', wild: '#C4473A', inactive: '#9A9184' } as const;
type Owner = keyof typeof OWN;

export async function createYardScene(host: HTMLElement, labels: HTMLElement, data: () => YardData, h: YardHandlers, reducedStart: boolean): Promise<YardScene> {
  const MOUNDS: MoundData[] = await fetch(moundsUrl).then((r) => r.json());
  let reduced = reducedStart;
  const R = rng(42);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = 'yard-canvas';
  host.prepend(canvas);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#BFDDEB');
  scene.fog = new THREE.Fog('#BFDDEB', 3000, 9000);
  const camera = new THREE.PerspectiveCamera(42, 1, 1, 10000);
  const hemi = new THREE.HemisphereLight('#EAF4FF', '#6B5A3A', 1.2);
  const sun = new THREE.DirectionalLight('#FFF1D0', 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(hemi, sun, sun.target);
  const world = new THREE.Group();
  scene.add(world);
  const disposables: { dispose(): void }[] = [];
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (color: string) => {
    if (!mats.has(color)) mats.set(color, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 }));
    return mats.get(color)!;
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();

  // ---------- tiles
  const tiles: { region: number; patch: number; x: number; z: number }[] = [];
  for (let r = 1; r <= NREG; r++) for (let p = 1; p <= PER; p++) tiles.push({ region: r, patch: p, ...tileAt(r, p) });
  const hexGeo = new THREE.CylinderGeometry(HR, HR, 8, 6).translate(0, -4, 0);
  const tileMesh = new THREE.InstancedMesh(hexGeo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 }), tiles.length);
  tileMesh.receiveShadow = true;
  tiles.forEach((t, i) => {
    tileMesh.setMatrixAt(i, m4.makeTranslation(t.x, 0, t.z));
    const g = REGIONS[t.region - 1];
    tileMesh.setColorAt(i, col.set(R() < 0.5 ? g.color : g.alt).offsetHSL(0, 0, (R() - 0.5) * 0.04));
  });
  world.add(tileMesh);
  const bounds = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const t of tiles) { bounds.x0 = Math.min(bounds.x0, t.x); bounds.x1 = Math.max(bounds.x1, t.x); bounds.z0 = Math.min(bounds.z0, t.z); bounds.z1 = Math.max(bounds.z1, t.z); }
  const X0 = bounds.x0 - 170, X1 = bounds.x1 + 170, ZB = bounds.z0 - 190, ZF = bounds.z1 + 210;

  // ---------- the yard round the beds: gravel, the house wall and patio, a fence
  const under = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0 + 600, ZF - ZB + 900), mat('#C9B48E'));
  under.rotation.x = -Math.PI / 2; under.position.set((X0 + X1) / 2, -2.5, (ZB + ZF) / 2 - 150); under.receiveShadow = true;
  world.add(under);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0 + 600, 900, 120), mat('#E6D3B3'));
  wall.position.set((X0 + X1) / 2, 450, ZB - 420);
  world.add(wall);
  for (let j = 0; j < 12; j++) {
    const sl = new THREE.Mesh(new THREE.BoxGeometry(290, 6, 280), mat(j % 2 ? '#C7B9A3' : '#BCAE97'));
    sl.position.set(X0 - 200 + j * 300, 2, ZB - 210); sl.receiveShadow = true;
    world.add(sl);
  }
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(14, 160, 14), mat('#9B7B57'), 60);
  for (let i = 0; i < 30; i++) {
    const z = ZB - 300 + (i * (ZF - ZB + 300)) / 29;
    posts.setMatrixAt(i, m4.makeTranslation(X0 - 160, 80, z));
    posts.setMatrixAt(30 + i, m4.makeTranslation(X1 + 160, 80, z));
  }
  posts.castShadow = true;
  world.add(posts);

  // ---------- region dressing: what makes each bed read from far away
  const tilesOf = (r: number) => tiles.filter((t) => t.region === r);
  const onTile = (t: { x: number; z: number }, spread = 0.85): [number, number] => { const a = R() * Math.PI * 2, d = Math.sqrt(R()) * HR * spread; return [t.x + Math.cos(a) * d, t.z + Math.sin(a) * d]; };
  function scatter(geo: THREE.BufferGeometry, material: THREE.Material, n: number, pick: () => { x: number; z: number; region: number } | undefined, place: (t: { x: number; z: number; region: number }) => THREE.Matrix4 | null, shadow = true) {
    const im = new THREE.InstancedMesh(geo, material, n);
    let k = 0;
    for (let i = 0; i < n * 4 && k < n; i++) {
      const t = pick();
      if (!t) continue;
      const m = place(t);
      if (m) im.setMatrixAt(k++, m);
    }
    im.count = k;
    im.castShadow = shadow;
    world.add(im);
    return im;
  }
  const blade = new THREE.ConeGeometry(0.9, 1, 3).translate(0, 0.5, 0);
  const grassMat = new THREE.MeshStandardMaterial({ color: '#5E9A34', flatShading: true, roughness: 0.9 });
  // grass round the point you're looking at is pressed down, so it never hides the mound you came to see
  const grassU = { uTarget: { value: new THREE.Vector2() }, uClear: { value: 0 } };
  grassMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTarget = grassU.uTarget;
    sh.uniforms.uClear = grassU.uClear;
    sh.vertexShader = 'uniform vec2 uTarget;\nuniform float uClear;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec4 gOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float gK = mix(0.12, 1.0, smoothstep(uClear * 0.55, uClear, length(gOrigin.xz - uTarget)));
      transformed.y *= uClear > 0.0 ? gK : 1.0;`,
    );
  };
  const kindOf = (r: number) => REGIONS[r - 1].kind;
  const grass = scatter(blade, grassMat, 16000, () => tiles[Math.floor(R() * tiles.length)], (t) => {
    if (kindOf(t.region) === 'wood' && R() < 0.6) return null;
    const [x, z] = onTile(t, 0.95);
    const tall = kindOf(t.region) === 'grass' ? 13 : kindOf(t.region) === 'lawn' ? 6 : 10;
    return m4.compose(v.set(x, 0, z), q.setFromEuler(e3.set((R() - 0.5) * 0.4, R() * 6, (R() - 0.5) * 0.4)), s3.set(1 + R(), tall * (0.6 + R() * 0.8), 1 + R()));
  }, false);
  const reg = (r: number) => { const ts = tilesOf(r); return () => ts[Math.floor(R() * ts.length)]; };
  if (NREG >= 2) {
    for (const c of ['#F2A0C4', '#FFD84D', '#F7F4EA', '#B98CFF', '#FF8A5C'])
      scatter(new THREE.CylinderGeometry(4, 2, 1.5, 6).translate(0, 26, 0), mat(c), 70, reg(2), (t) => { const [x, z] = onTile(t); return m4.compose(v.set(x, 0, z), q.identity(), s3.set(1, 0.8 + R() * 0.6, 1)); });
    scatter(new THREE.CylinderGeometry(0.5, 0.5, 26, 4).translate(0, 13, 0), mat('#4F8A2E'), 350, reg(2), (t) => { const [x, z] = onTile(t); return m4.compose(v.set(x, 0, z), q.identity(), s3.set(1, 0.8 + R() * 0.6, 1)); });
    const g = tileAt(2, 1);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(70, 52, 110, 14), mat('#C46A3F'));
    pot.position.set(g.x - 120, 55, g.z - 140); pot.castShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(70, 8, 6, 18), mat('#B45E36'));
    rim.rotation.x = Math.PI / 2; rim.position.set(pot.position.x, 110, pot.position.z);
    world.add(pot, rim);
  }
  if (NREG >= 4) {
    const g = tileAt(4, 56);
    for (let i = 0; i < 9; i++) {
      const lg = new THREE.Mesh(new THREE.CylinderGeometry(18 + R() * 8, 20 + R() * 8, 240 + R() * 120, 9), mat(i % 2 ? '#7A5536' : '#6B4A2F'));
      lg.rotation.z = Math.PI / 2; lg.rotation.y = 0.2 + (R() - 0.5) * 0.3;
      lg.position.set(g.x - 120 + (i % 3) * 40, 20 + Math.floor(i / 3) * 34, g.z - 160 + (i % 3) * 46);
      lg.castShadow = true;
      world.add(lg);
    }
    scatter(new THREE.CylinderGeometry(5, 5, 0.6, 5), mat('#B5622E'), 500, reg(4), (t) => { const [x, z] = onTile(t); return m4.compose(v.set(x, 0.4, z), q.setFromEuler(e3.set(0, R() * 6, 0)), s3.set(1 + R(), 1, 0.6 + R() * 0.5)); }, false);
  }
  if (NREG >= 3) {
    const a = tileAt(3, 1), b = tileAt(3, 100);
    const curve = new THREE.CatmullRomCurve3(Array.from({ length: 41 }, (_, i) => { const k = i / 40; return new THREE.Vector3(lerp(a.x - 60, b.x + 60, k), 0.8, lerp(a.z + 120, b.z - 120, k) + Math.sin(k * 7) * 90); }));
    const pos: number[] = [], idx: number[] = [], N = 120;
    for (let i = 0; i <= N; i++) {
      const p = curve.getPoint(i / N), tg = curve.getTangent(i / N), w = 26 + Math.sin(i * 0.4) * 6;
      pos.push(p.x - tg.z * w, 0.8, p.z + tg.x * w, p.x + tg.z * w, 0.8, p.z - tg.x * w);
      if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    world.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#4FA3C7', roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide })));
    scatter(new THREE.DodecahedronGeometry(6), mat('#A8A299'), 160, reg(3), (t) => { const [x, z] = onTile(t); return m4.compose(v.set(x, 2, z), q.setFromEuler(e3.set(R(), R(), R())), s3.set(1 + R(), 0.6, 1 + R())); });
  }
  {
    const a = tileAt(1, 41);
    const pts = Array.from({ length: 13 }, (_, i) => new THREE.Vector3(a.x + i * 70, 3, a.z + Math.sin(i * 0.9) * 140));
    const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 3.2, 6), mat('#3E9E4F'));
    hose.castShadow = true;
    world.add(hose);
  }

  // ---------- hex lines: strong far out, gone up close
  const hexLines = (() => {
    const pos: number[] = [];
    for (const t of tiles) for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2;
      pos.push(t.x + Math.sin(a0) * HR, 0.5, t.z + Math.cos(a0) * HR, t.x + Math.sin(a1) * HR, 0.5, t.z + Math.cos(a1) * HR);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#2B1D13', transparent: true, opacity: 0.3 }));
  })();
  world.add(hexLines);

  // ---------- scent borders round the patches where someone lives
  const owners = new Map<string, Owner>(); // "r:p" → who holds the patch
  const regionData = new Map<number, RegionPatch[]>();
  const borderU = { uW: { value: 3 } };
  const borderMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  borderMat.onBeforeCompile = (sh) => {
    sh.uniforms.uW = borderU.uW;
    sh.vertexShader = 'attribute vec2 aOff;\nuniform float uW;\n' + sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + vec3(aOff.x, 0.0, aOff.y) * uW;');
  };
  const fillMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false });
  let borders: THREE.Mesh | null = null, fills: THREE.Mesh | null = null;
  function buildBorders() {
    if (borders && fills) { world.remove(borders, fills); borders.geometry.dispose(); fills.geometry.dispose(); }
    const pos: number[] = [], off: number[] = [], cols: number[] = [], fpos: number[] = [], fcols: number[] = [];
    for (const t of tiles) {
      const who = owners.get(`${t.region}:${t.patch}`);
      if (!who) continue;
      col.set(OWN[who]);
      for (let i = 0; i < 6; i++) {
        const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2, mid = ((i + 0.5) / 6) * Math.PI * 2;
        const ax = t.x + Math.sin(a0) * HR, az = t.z + Math.cos(a0) * HR, bx = t.x + Math.sin(a1) * HR, bz = t.z + Math.cos(a1) * HR;
        fpos.push(t.x, 0.6, t.z, ax, 0.6, az, bx, 0.6, bz);
        for (let k = 0; k < 3; k++) fcols.push(col.r, col.g, col.b);
        const nb = patchUnder(t.x + Math.sin(mid) * HW, t.z + Math.cos(mid) * HW);
        const nt = nb && tileAt(nb.region, nb.patch);
        if (nb && nt && Math.hypot(nt.x - t.x, nt.z - t.z) < HW * 1.1 && owners.get(`${nb.region}:${nb.patch}`) === who) continue;
        const ix = -Math.sin(mid) * 1.15, iz = -Math.cos(mid) * 1.15;
        pos.push(ax, 0.9, az, bx, 0.9, bz, ax, 0.9, az, bx, 0.9, bz, bx, 0.9, bz, ax, 0.9, az);
        off.push(0, 0, 0, 0, ix, iz, 0, 0, ix, iz, ix, iz);
        for (let k = 0; k < 6; k++) cols.push(col.r, col.g, col.b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aOff', new THREE.Float32BufferAttribute(off, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    borders = new THREE.Mesh(g, borderMat); borders.renderOrder = 2;
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
    fg.setAttribute('color', new THREE.Float32BufferAttribute(fcols, 3));
    fills = new THREE.Mesh(fg, fillMat); fills.renderOrder = 1;
    world.add(borders, fills);
  }

  // ---------- mounds (built in Blender: docs/art/whole-yard/mounds.blend.py), sites and spots
  const moundGeo = MOUNDS.map((m) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
    const c: number[] = [];
    for (const t of m.tri) for (let k = 0; k < 3; k++) { col.setRGB(t[0], t[1], t[2], THREE.SRGBColorSpace); c.push(col.r, col.g, col.b); }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    g.computeVertexNormals();
    return g;
  });
  const moundMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  // each mound's height map (soil, twigs, stones), so parties climb out of the crater and over the mound rather than
  // walking out of its middle at ground level. A 3×3 median keeps a thin twig from making the ants hop.
  const HM_CELL = 0.25, HM_N = 104, HM_HALF = (HM_N * HM_CELL) / 2;
  const moundHeights = MOUNDS.map((m) => {
    const hm = new Float32Array(HM_N * HM_N);
    const p = m.pos;
    for (let i = 0; i + 8 < p.length; i += 9) {
      const ax = p[i], ay = p[i + 1], az = p[i + 2], bx = p[i + 3], by = p[i + 4], bz = p[i + 5], cx = p[i + 6], cy = p[i + 7], cz = p[i + 8];
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) + HM_HALF) / HM_CELL)), x1 = Math.min(HM_N - 1, Math.ceil((Math.max(ax, bx, cx) + HM_HALF) / HM_CELL));
      const z0 = Math.max(0, Math.floor((Math.min(az, bz, cz) + HM_HALF) / HM_CELL)), z1 = Math.min(HM_N - 1, Math.ceil((Math.max(az, bz, cz) + HM_HALF) / HM_CELL));
      for (let iz = z0; iz <= z1; iz++) for (let ix = x0; ix <= x1; ix++) {
        const x = ix * HM_CELL - HM_HALF, z = iz * HM_CELL - HM_HALF;
        const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, w = 1 - u - v;
        if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;
        const y = u * ay + v * by + w * cy, k = iz * HM_N + ix;
        if (y > hm[k]) hm[k] = y;
      }
    }
    const out = new Float32Array(HM_N * HM_N), nine: number[] = [];
    for (let iz = 0; iz < HM_N; iz++) for (let ix = 0; ix < HM_N; ix++) {
      nine.length = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) nine.push(hm[clamp(iz + dz, 0, HM_N - 1) * HM_N + clamp(ix + dx, 0, HM_N - 1)]);
      out[iz * HM_N + ix] = nine.sort((a, b) => a - b)[4];
    }
    return out;
  });
  /** Height of mound `stage` at (lx, lz) from its centre; near the middle it drops away into the entrance. */
  function moundHeight(stage: number, lx: number, lz: number) {
    const hm = moundHeights[stage];
    const fx = (lx + HM_HALF) / HM_CELL, fz = (lz + HM_HALF) / HM_CELL;
    const ix = Math.floor(fx), iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix >= HM_N - 1 || iz >= HM_N - 1) return 0;
    const tx = fx - ix, tz = fz - iz, k = iz * HM_N + ix;
    let y = (hm[k] * (1 - tx) + hm[k + 1] * tx) * (1 - tz) + (hm[k + HM_N] * (1 - tx) + hm[k + HM_N + 1] * tx) * tz;
    const hole = MOUNDS[stage].r * 0.12, r = Math.hypot(lx, lz);
    if (r < hole) y -= (hole - r) * 2.5;
    return y;
  }
  /** Every mound on the loaded patches, by place key. */
  const moundSpots = new Map<string, { x: number; z: number; stage: number }>();
  /** Where an ant's feet go at (x, z): the ground, or a mound where there is one. */
  function footY(x: number, z: number) {
    let y = 0;
    for (const m of moundSpots.values()) {
      const R = MOUNDS[m.stage].r * 1.3;
      if (Math.abs(x - m.x) > R || Math.abs(z - m.z) > R) continue;
      y = Math.max(y, moundHeight(m.stage, x - m.x, z - m.z) + 0.04);
    }
    return y;
  }
  const stageFor = (points?: number) => ((points ?? 0) < 400 ? 0 : (points ?? 0) < 3000 ? 1 : 2);
  interface Place { key: string; at: Coords; group: THREE.Group; el?: HTMLDivElement; top: number; mine: boolean; big: boolean }
  const places = new Map<string, Place>(); // per patch "r:p" → its things
  const patchPlaces = new Map<string, Place[]>();
  const taps: THREE.Object3D[] = [];
  const dots = new Map<string, HTMLDivElement>(); // far-out squares, one per inhabited patch
  function tag(cls: string, html: string) { const el = document.createElement('div'); el.className = cls; el.innerHTML = html; labels.append(el); return el; }
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  function clearPatch(key: string) {
    for (const p of patchPlaces.get(key) ?? []) {
      world.remove(p.group);
      p.el?.remove();
      p.group.traverse((o) => { const i = taps.indexOf(o); if (i >= 0) taps.splice(i, 1); });
      places.delete(p.key);
      moundSpots.delete(p.key);
    }
    patchPlaces.delete(key);
  }
  function flagged(stage: number, color: string) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(moundGeo[stage], moundMat);
    m.castShadow = m.receiveShadow = true;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 14, 4), mat('#6B4A2F'));
    pole.position.set(MOUNDS[stage].r * 0.4, MOUNDS[stage].h * 0.5 + 7, 0);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.2), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, flatShading: true }));
    flag.position.set(pole.position.x + 2.5, pole.position.y + 5, 0);
    flag.userData.flag = true;
    g.add(m, pole, flag);
    return g;
  }
  function siteModel(c: NonNullable<Spot['colony']>): THREE.Group {
    const g = new THREE.Group();
    if (c.herd) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1, 30, 5).translate(0, 15, 0), mat('#5C9A33'));
      stem.castShadow = true; g.add(stem);
      for (let i = 0; i < 12; i++) { const a = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 4), mat('#A6D83A')); a.scale.set(1, 0.8, 1.3); a.position.set(Math.cos(i * 2.4) * 1.3, 8 + i * 1.4, Math.sin(i * 2.4) * 1.3); g.add(a); }
    } else if (c.wild?.kind === 'mound') {
      const t = new THREE.Mesh(new THREE.ConeGeometry(7, 26, 7), mat('#B07A44')); t.position.y = 13; t.castShadow = true; g.add(t);
    } else if (c.wild?.kind === 'den') {
      const d = new THREE.Mesh(new THREE.SphereGeometry(7, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#3A2E2A')); d.scale.y = 0.4; g.add(d);
      const silk = new THREE.Mesh(new THREE.CircleGeometry(6, 10), new THREE.MeshStandardMaterial({ color: '#EDE8E0', transparent: true, opacity: 0.8 })); silk.rotation.x = -Math.PI / 2; silk.position.y = 2.9; g.add(silk);
    } else if (c.windfall) {
      const k = c.windfall.kind;
      const m = k === 'fig' ? new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), mat('#7A3F6E'))
        : k === 'branch' ? new THREE.Mesh(new THREE.CylinderGeometry(1, 1.4, 30, 6), mat('#7A5536'))
        : k === 'lizard' ? new THREE.Mesh(new THREE.CapsuleGeometry(2.5, 16, 3, 8), mat('#6E8F3A'))
        : new THREE.Mesh(new THREE.CapsuleGeometry(1.4, 7, 3, 6), mat('#8DB83A'));
      if (k !== 'fig') m.rotation.z = Math.PI / 2;
      m.position.y = 2.5; m.castShadow = true; g.add(m);
    }
    return g;
  }
  let selected: string | null = null;
  const selRing = new THREE.Mesh(new THREE.RingGeometry(6.5, 7.6, 32), new THREE.MeshBasicMaterial({ color: '#F2B21F', transparent: true, opacity: 0.9, depthWrite: false }));
  selRing.rotation.x = -Math.PI / 2; selRing.visible = false; selRing.renderOrder = 3;
  world.add(selRing);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#FFF6DC', transparent: true, opacity: 0.85 });
  const dotGeo = new THREE.CircleGeometry(0.5, 6);

  function setSpots(region: number, patch: number, spots: Spot[]) {
    const key = `${region}:${patch}`;
    clearPatch(key);
    const list: Place[] = [];
    const d = data();
    for (const s of spots) {
      const at = { region, patch, spot: s.spot };
      const p = spotAt(at);
      const c = s.colony;
      let g: THREE.Group, html = '', cls = '', top = 8, mine = false, big = false, stage = -1;
      if (!c) {
        if (s.spot > 12 && s.spot !== WILDS_SPOT) continue;
        g = new THREE.Group();
        for (let k = 0; k < 14; k++) {
          const dm = new THREE.Mesh(dotGeo, ringMat); dm.rotation.x = -Math.PI / 2;
          const a = (k / 14) * Math.PI * 2; dm.position.set(Math.cos(a) * 4.2, 0.3, Math.sin(a) * 4.2);
          g.add(dm);
        }
        const hit = new THREE.Mesh(new THREE.CircleGeometry(5, 12), new THREE.MeshBasicMaterial({ visible: false }));
        hit.rotation.x = -Math.PI / 2; g.add(hit);
        if (s.spot === WILDS_SPOT) { cls = 'ybanner wilds'; html = '<b>The wilds</b>'; }
      } else if (c.kind === 'player' && !(c.known === 'scent' || c.known === 'familiar')) {
        mine = !!c.mine;
        const who: Owner = c.mine ? 'you' : c.relation === 'ally' ? 'ally' : c.inactive ? 'inactive' : 'rival';
        stage = stageFor(c.points);
        g = flagged(stage, OWN[who]);
        top = MOUNDS[stage].h + 16;
        big = true;
        const lvl = c.points !== undefined ? Math.max(1, Math.round(Math.log10(Math.max(10, c.points)) * 3)) : '?';
        cls = `ybanner ${who}`;
        html = `<i>${lvl}</i><b>${esc(c.name)}</b>${c.points !== undefined ? `<span>${c.points.toLocaleString('en')}</span>` : ''}`;
      } else if (c.known === 'scent' || c.known === 'familiar') {
        g = new THREE.Group();
        for (let k = 0; k < 3; k++) {
          const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4 - k * 0.5, 0), new THREE.MeshStandardMaterial({ color: '#B98CFF', transparent: true, opacity: 0.45, flatShading: true }));
          puff.position.set((k - 1) * 3, 6 + k * 3, 0); g.add(puff);
        }
        const stain = new THREE.Mesh(new THREE.CircleGeometry(6, 14), new THREE.MeshBasicMaterial({ color: '#6B4A6E', transparent: true, opacity: 0.25 }));
        stain.rotation.x = -Math.PI / 2; stain.position.y = 0.3; g.add(stain);
        cls = 'ybanner scent'; html = `<b>${c.kind === 'player' ? 'Ant scent' : 'Wild scent'}</b>`; top = 18;
      } else if (c.wild?.kind === 'nest' || (c.kind === 'wild' && !c.herd && !c.windfall && !c.wild?.kind)) {
        g = flagged(1, OWN.wild); top = MOUNDS[1].h + 16; big = true; stage = 1;
        cls = 'ybanner wild'; html = `<i>!</i><b>${esc(c.wild?.species ?? c.name)}</b>${c.wild ? `<span>Lv ${c.wild.level}</span>` : ''}`;
      } else {
        g = siteModel(c);
        top = c.herd ? 34 : c.wild?.kind === 'mound' ? 32 : 12;
        cls = `ybanner site${c.windfall ? ' windfall' : ''}`; html = `<b>${esc(c.windfall ? c.windfall.text?.split('.')[0] || c.name : c.name)}</b>`;
      }
      g.position.copy(p);
      g.traverse((o) => { o.userData.at = at; if ((o as THREE.Mesh).isMesh) taps.push(o); });
      world.add(g);
      const place: Place = { key: `${region}:${patch}:${s.spot}`, at, group: g, top, mine, big };
      if (stage >= 0) moundSpots.set(place.key, { x: p.x, z: p.z, stage });
      if (html) place.el = tag(cls, html);
      places.set(place.key, place);
      list.push(place);
    }
    patchPlaces.set(key, list);
    if (selected) setSelected(parse(selected));
    void d;
  }
  const parse = (k: string) => { const [region, patch, spot] = k.split(':').map(Number); return { region, patch, spot }; };
  function setSelected(at: Coords | null) {
    selected = at ? `${at.region}:${at.patch}:${at.spot}` : null;
    if (!at) { selRing.visible = false; return; }
    const p = spotAt(at);
    selRing.position.set(p.x, 0.7, p.z);
    selRing.visible = true;
  }

  // far-out squares and placeholder mounds for patches whose spots aren't loaded
  const farMounds = new Map<string, THREE.Group>();
  function setRegion(region: number, patches: RegionPatch[]) {
    regionData.set(region, patches);
    for (const [k, el] of dots) if (k.startsWith(`${region}:`)) { el.remove(); dots.delete(k); }
    for (const [k, g] of farMounds) if (k.startsWith(`${region}:`)) { world.remove(g); farMounds.delete(k); }
    for (const k of [...owners.keys()]) if (k.startsWith(`${region}:`)) owners.delete(k);
    for (const p of patches) {
      const key = `${region}:${p.patch}`;
      const who: Owner | null = p.mine ? 'you' : p.ally ? 'ally' : p.colonies > 0 ? 'rival' : null;
      if (who) owners.set(key, who);
      if (p.colonies > 0 || p.wild) dots.set(key, tag(`ydot ${who ?? 'wild'}`, ''));
      // a stand-in mound per colony, seen from afar until the patch's spots load
      if (p.colonies > 0) {
        const g = new THREE.Group();
        const pr = rng(region * 1000 + p.patch);
        for (let i = 0; i < Math.min(4, p.colonies); i++) {
          const m = new THREE.Mesh(moundGeo[1], moundMat);
          const [dx, dz] = spotOffset(1 + Math.floor(pr() * 12));
          m.position.set(dx, 0, dz); m.castShadow = true;
          g.add(m);
        }
        const t = tileAt(region, p.patch);
        g.position.set(t.x, 0, t.z);
        farMounds.set(key, g);
        world.add(g);
      }
    }
    buildBorders();
  }

  // ---------- parties: columns of real ants up close, a thread far out
  const ants: Ants = createAnts(world, { worker: 700, soldier: 400, army: 300, army_major: 20, queen: 4, alate: 10 }, true);
  interface Column { key: string; from: THREE.Vector3; to: THREE.Vector3; curve: THREE.QuadraticBezierCurve3; len: number; thread: THREE.Line; rib: THREE.Mesh; color: string; caste: 'worker' | 'soldier' | 'army'; n: number; el: HTMLDivElement; prog: (now: number) => { d: number; back: boolean } | null; cargo?: string }
  const columns = new Map<string, Column>();
  const sumUnits = (u?: Record<string, number>) => Object.values(u ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  function syncColumns() {
    const d = data();
    const st = d.state;
    if (!st) return;
    const want = new Map<string, Omit<Column, 'curve' | 'len' | 'thread' | 'rib' | 'el'> & { label: string }>();
    const home = new Map((st.colonies ?? []).map((c) => [c.id, c.coords]));
    for (const m of (st.missions ?? []) as any[]) {
      if (!m.origin || !m.target) continue;
      const soldiers = ['raid', 'hold', 'tend', 'claim'].includes(m.type);
      want.set(`m${m.id}`, {
        key: `m${m.id}`, from: spotAt(m.origin), to: spotAt(m.target), color: m.type === 'transport' || m.type === 'relocate' ? CHITIN.worker : soldiers ? CHITIN.soldier : CHITIN.worker,
        caste: soldiers ? 'soldier' : 'worker', n: Math.min(60, Math.max(3, Math.round(Math.sqrt(sumUnits(m.units)) * 3))),
        label: `${m.type[0].toUpperCase()}${m.type.slice(1)} · ${sumUnits(m.units).toLocaleString('en')}`,
        prog: (now) => { const p = tripProgress(m, now); return p.oneWay ? { d: p.x, back: false } : { d: p.x <= 0.5 ? p.x * 2 : 2 - p.x * 2, back: p.x > 0.5 }; },
        cargo: m.cargo && sumUnits(m.cargo) > 0 ? '#7FC24A' : undefined,
      });
    }
    for (const i of (st.incoming ?? []) as any[]) {
      const target = i.herd ?? home.get(i.targetColonyId);
      if (!i.origin || !target) continue;
      const swarm = i.type === 'swarm';
      want.set(`i${i.id}`, {
        key: `i${i.id}`, from: spotAt(i.origin), to: spotAt(target), color: swarm ? CHITIN.army : i.hostile ? CHITIN.raider : CHITIN.worker,
        caste: swarm ? 'army' : i.hostile ? 'soldier' : 'worker', n: Math.min(swarm ? 200 : 60, Math.max(4, Math.round(Math.sqrt(i.unitCount ?? 30) * 3))),
        label: swarm ? `Army ants · ${(i.unitCount ?? 0).toLocaleString('en')}` : i.hostile ? `${i.type === 'raid' ? 'Raid' : 'Scouts'} from ${i.from}` : `Delivery from ${i.from}`,
        prog: (now) => ({ d: clamp((now - i.departAt) / Math.max(1, i.arriveAt - i.departAt), 0, 1), back: false }),
      });
    }
    for (const [k, c] of columns) if (!want.has(k)) { world.remove(c.thread, c.rib); c.thread.geometry.dispose(); c.rib.geometry.dispose(); c.el.remove(); columns.delete(k); }
    for (const [k, w] of want) {
      if (columns.has(k)) { Object.assign(columns.get(k)!, { prog: w.prog }); continue; }
      const a = w.from, b = w.to;
      const mid = a.clone().lerp(b, 0.5);
      const dist = Math.max(1, a.distanceTo(b));
      const nrm = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize().multiplyScalar(dist * 0.12);
      const curve = new THREE.QuadraticBezierCurve3(a.clone(), mid.add(nrm), b.clone());
      const len = curve.getLength();
      const arc = new THREE.QuadraticBezierCurve3(a.clone().setY(4), a.clone().lerp(b, 0.5).setY(len * 0.25 + 10), b.clone().setY(4));
      const tg = new THREE.BufferGeometry().setFromPoints(arc.getPoints(40));
      const thread = new THREE.Line(tg, new THREE.LineDashedMaterial({ color: w.color, dashSize: 14, gapSize: 9, transparent: true, opacity: 0 }));
      thread.computeLineDistances();
      const rib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curve.getPoints(40)), 60, 0.5, 4), new THREE.MeshBasicMaterial({ color: w.color, transparent: true, opacity: 0.35, depthWrite: false }));
      rib.scale.y = 0.15; rib.position.y = 0.3;
      world.add(thread, rib);
      columns.set(k, { ...w, curve, len, thread, rib, el: tag('ybanner col', `<b>${esc(w.label)}</b>`) });
    }
  }

  // ---------- camera: one orbit rig, one zoom from the whole yard to ant height
  const view = { x: 0, z: 0, yaw: -0.3, dist: 2900 };
  const goal = { ...view };
  const DMIN = 4, DMAX = 4300;
  const pitchFor = (dd: number) => (dd < 160 ? lerp(0.2, 0.9, smooth(4, 160, dd)) : lerp(0.9, 1.02, smooth(160, 1500, dd)));
  const homeView = () => ({ x: (X0 + X1) / 2, z: (ZB + ZF) / 2 + 120, yaw: -0.3, dist: 2900 });
  Object.assign(view, homeView()); Object.assign(goal, view);
  type Tw = { t: number; dur: number; fn: (k: number) => void; done?: () => void };
  const tweens: Tw[] = [];
  const tween = (dur: number, fn: (k: number) => void, done?: () => void) => tweens.push({ t: 0, dur: reduced ? Math.min(dur, 0.25) : dur, fn, done });
  function fly(to: Partial<typeof view>, dur = 1.3, done?: () => void) {
    tweens.length = 0;
    const from = { ...goal };
    tween(dur, (k) => {
      const e = ease(k);
      for (const kk of ['x', 'z', 'yaw'] as const) if (to[kk] !== undefined) goal[kk] = lerp(from[kk], to[kk]!, e);
      if (to.dist !== undefined) goal.dist = Math.exp(lerp(Math.log(from.dist), Math.log(to.dist), e));
      Object.assign(view, goal);
    }, done);
  }
  const RUNG_D: Record<Rung, number> = { yard: 2900, region: 900, patch: 140, ground: 14 };
  const rungOf = (dd: number): Rung => (dd > 1500 ? 'yard' : dd > 330 ? 'region' : dd > 40 ? 'patch' : 'ground');

  // ---------- input
  let W = 1, H = 1;
  const ptrs = new Map<number, { x: number; y: number; b: number }>();
  let downAt: { x: number; y: number; t: number } | null = null, lastTap = { t: 0, key: '' }, pinch0 = 0, dist0 = 0;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(e: { clientX: number; clientY: number }): Coords | null {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return (ray.intersectObjects(taps, false)[0]?.object.userData.at as Coords | undefined) ?? null;
  }
  const onDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button });
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = goal.dist; }
  };
  const onMove = (e: PointerEvent) => {
    const p = ptrs.get(e.pointerId);
    if (!p) { canvas.style.cursor = pick(e) ? 'pointer' : 'grab'; return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; if (pinch0) goal.dist = clamp((dist0 * pinch0) / Math.hypot(a.x - b.x, a.y - b.y), DMIN, DMAX); return; }
    tweens.length = 0;
    if (p.b === 2 || e.shiftKey) { goal.yaw -= dx * 0.006; return; }
    const k = (goal.dist / H) * 1.25, c = Math.cos(goal.yaw), s = Math.sin(goal.yaw);
    goal.x -= (dx * c + dy * s) * k;
    goal.z -= (-dx * s + dy * c) * k;
  };
  const onUp = (e: PointerEvent) => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch0 = 0;
    if (!downAt) return;
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 9 && performance.now() - downAt.t < 500) {
      const hit = pick(e), now = performance.now();
      if (hit) {
        const key = `${hit.region}:${hit.patch}:${hit.spot}`;
        const place = places.get(key);
        if (now - lastTap.t < 380 && lastTap.key === key && place?.mine) dive(hit);
        else h.onPick(hit);
        lastTap = { t: now, key };
      }
    }
    downAt = null;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    tweens.length = 0;
    const f = Math.exp(e.deltaY * 0.0015);
    const r = canvas.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
    const nd = clamp(goal.dist * f, DMIN, DMAX), k = (goal.dist - nd) * 0.9, c = Math.cos(goal.yaw), s = Math.sin(goal.yaw);
    goal.x += (nx * c + ny * s * 1.4) * k;
    goal.z += (-nx * s + ny * c * 1.4) * k;
    goal.dist = nd;
  };
  const keys = new Set<string>();
  const onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]')) return;
    const k = e.key.toLowerCase();
    if (!['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k) || !host.matches(':hover')) return;
    if (e.type === 'keydown') keys.add(k); else keys.delete(k);
    e.preventDefault();
  };
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  addEventListener('keydown', onKey);
  addEventListener('keyup', onKey);
  const blur = () => keys.clear();
  addEventListener('blur', blur);

  function dive(at: Coords) {
    const p = spotAt(at);
    fly({ x: p.x, z: p.z + 2, dist: 5 }, 1.1, () => h.onDive(at));
  }

  // ---------- frame
  const tmp = new THREE.Vector3();
  function place(el: HTMLElement, x: number, y: number, z: number, show: boolean) {
    if (!show) { el.style.display = 'none'; return; }
    tmp.set(x, y, z).project(camera);
    if (tmp.z > 1 || Math.abs(tmp.x) > 1.15 || Math.abs(tmp.y) > 1.15) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.dataset.x = String((tmp.x * 0.5 + 0.5) * W);
    el.dataset.y = String((-tmp.y * 0.5 + 0.5) * H);
  }
  /** banners on the same patch would sit on top of each other: stack them */
  function unclutter(els: HTMLElement[]) {
    const shown = els.filter((el) => el.style.display !== 'none').map((el) => ({ el, x: +el.dataset.x!, y: +el.dataset.y!, w: el.offsetWidth, h: el.offsetHeight + 3 })).sort((a, b) => b.y - a.y);
    const done: typeof shown = [];
    for (const b of shown) {
      for (let g = 0; g < 8; g++) {
        const hit = done.find((p) => Math.abs(p.x - b.x) < (p.w + b.w) / 2 && Math.abs(p.y - b.y) < b.h);
        if (!hit) break;
        b.y = hit.y - b.h;
      }
      done.push(b);
      b.el.style.transform = `translate(-50%, -100%) translate(${b.x}px, ${b.y}px)`;
    }
  }
  function resize() {
    W = host.clientWidth; H = host.clientHeight;
    if (!W || !H) return false;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    return true;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  let lastRung: Rung | null = null, lastLook = '', lookT = 0, stateRef: unknown = null, raf = 0, time = 0;
  let last = performance.now(), nowAt = performance.now(), nowSeen = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    if ((!W || !H) && !resize()) return;
    const t0 = performance.now(), dt = Math.min((t0 - last) / 1000, 0.05);
    last = t0; time += dt;
    for (let i = tweens.length - 1; i >= 0; i--) { const t = tweens[i]; t.t += dt; const k = Math.min(1, t.t / t.dur); t.fn(k); if (k >= 1) { tweens.splice(i, 1); t.done?.(); } }
    // WASD / arrows move, Q/E turn
    if (keys.size) {
      const step = goal.dist * 0.9 * dt, c = Math.cos(goal.yaw), s = Math.sin(goal.yaw);
      const mx = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
      const mz = (keys.has('s') || keys.has('arrowdown') ? 1 : 0) - (keys.has('w') || keys.has('arrowup') ? 1 : 0);
      goal.x += (mx * c + mz * s) * step; goal.z += (-mx * s + mz * c) * step;
      if (keys.has('q')) goal.yaw += dt * 1.4;
      if (keys.has('e')) goal.yaw -= dt * 1.4;
    }
    goal.x = clamp(goal.x, X0, X1); goal.z = clamp(goal.z, ZB - 300, ZF);
    const a = 1 - Math.pow(0.0005, dt);
    for (const k of ['x', 'z', 'yaw'] as const) view[k] = lerp(view[k], goal[k], a);
    view.dist = Math.exp(lerp(Math.log(view.dist), Math.log(goal.dist), a));
    const d = view.dist, pitch = pitchFor(d);
    camera.position.set(view.x + Math.sin(view.yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, view.z + Math.cos(view.yaw) * Math.cos(pitch) * d);
    camera.lookAt(view.x, Math.min(2, d * 0.05), view.z);
    camera.near = Math.max(0.05, d * 0.02); camera.far = d * 6 + 6000; camera.updateProjectionMatrix();
    const sd = clamp(d * 1.2, 30, 5000);
    sun.position.set(view.x - sd * 0.5, sd, view.z + sd * 0.3); sun.target.position.set(view.x, 0, view.z);
    const sc = sun.shadow.camera; sc.left = sc.bottom = -sd * 0.9; sc.right = sc.top = sd * 0.9; sc.near = 1; sc.far = sd * 3; sc.updateProjectionMatrix();
    const fog = scene.fog as THREE.Fog; fog.near = d * 1.6 + 400; fog.far = d * 4 + 3000;
    // what shows at this distance
    const mid = smooth(110, 380, d);
    hexLines.material.opacity = 0.05 + 0.4 * mid;
    borderU.uW.value = clamp(d * 0.006, 0.8, 16);
    fillMat.opacity = 0.08 + 0.2 * mid;
    if (borders) borders.visible = d > 30;
    grass.visible = d < 2400;
    grassU.uTarget.value.set(view.x, view.z);
    grassU.uClear.value = d < 260 ? clamp(d * 0.9, 14, 70) : 0;
    const swell = 1 + 2.2 * smooth(380, 1400, d); // mounds swell far out, like Civ's cities
    for (const p of places.values()) if (p.big) p.group.scale.setScalar(swell);
    for (const [k, g] of farMounds) { g.visible = !patchPlaces.has(k); g.scale.setScalar(swell); }
    selRing.scale.setScalar(clamp(d / 200, 0.5, 6));
    // the server's state changed: rebuild the parties
    const dd = data();
    if (dd.state !== stateRef) { stateRef = dd.state; syncColumns(); }
    if (dd.now !== nowSeen) { nowSeen = dd.now; nowAt = t0; }
    // ants
    antUniforms.uTime.value = time;
    ants.begin();
    const showAnts = d < 420;
    // the game's clock ticks once a second: run it on smoothly in between, so columns march instead of hopping
    const smoothNow = reduced ? dd.now : nowSeen + Math.min(1500, t0 - nowAt);
    for (const c of columns.values()) {
      c.thread.visible = d > 250; (c.thread.material as THREE.LineDashedMaterial).opacity = smooth(250, 700, d) * 0.9;
      c.rib.visible = d < 900;
      const pr = c.prog(smoothNow);
      if (!pr) continue;
      const lead = clamp(pr.d, 0, 1);
      const lp = c.curve.getPoint(lead);
      place(c.el, lp.x, 8, lp.z, d < 700 && d > 30);
      if (!showAnts) continue;
      const spacing = 1.3 / c.len;
      for (let i = 0; i < c.n; i++) {
        const k = pr.back ? lead + i * spacing : lead - i * spacing;
        if (k < 0 || k > 1) continue;
        const p = c.curve.getPoint(k), tg = c.curve.getTangent(k);
        if (pr.back) tg.negate();
        const wob = Math.sin(i * 12.9) * 0.6;
        const x = p.x - tg.z * wob, z = p.z + tg.x * wob, y = footY(x, z);
        // nose up out of the crater and over the rim, down the far slope
        const ahead = footY(x + tg.x * 0.3, z + tg.z * 0.3);
        const pitch = y > 0 || ahead > 0 ? clamp(Math.atan2(ahead - y, 0.3), -1.2, 1.2) : 0;
        ants.ant(c.caste, x, y, z, { pitch, scale: c.caste === 'soldier' ? 0.75 : 0.6, yaw: Math.atan2(-tg.z, tg.x), gait: (k * c.len) / 0.17 * 1.2, color: c.color, cargo: pr.back && c.cargo ? { kind: 'leaf', color: c.cargo } : null });
      }
    }
    ants.end();
    // labels
    for (const p of places.values()) if (p.el) {
      const show = p.big ? d < 1500 && d > 9 : d < 420 && d > 9;
      place(p.el, p.group.position.x, p.top * (p.big ? swell : 1), p.group.position.z, show);
      p.el.classList.toggle('slim', d > 600);
    }
    for (const [k, el] of dots) {
      const [r, pp] = k.split(':').map(Number), t = tileAt(r, pp);
      place(el, t.x, 6, t.z, d >= 900 || (d >= 250 && !patchPlaces.has(k)));
      el.style.transform = `translate(-50%, -50%) translate(${el.dataset.x}px, ${el.dataset.y}px)`;
      if (d < 900 && patchPlaces.has(k)) el.style.display = 'none';
    }
    unclutter([...[...places.values()].map((p) => p.el).filter(Boolean) as HTMLElement[], ...[...columns.values()].map((c) => c.el)]);
    // tell React what level we're on, and which patch we're over when close
    const r = rungOf(d);
    if (r !== lastRung) { lastRung = r; h.onRung(r); }
    if (d < 600 && t0 - lookT > 400) {
      lookT = t0;
      const under = patchUnder(view.x, view.z);
      if (under) {
        const key = `${under.region}:${under.patch}`;
        if (key !== lastLook) { lastLook = key; h.onLook(under.region, under.patch); }
      }
    }
    renderer.render(scene, camera);
  }
  resize();
  raf = requestAnimationFrame(frame);
  for (const g of [hexGeo, blade, dotGeo]) disposables.push(g);

  return {
    setRegion,
    setSpots,
    setSelected,
    flyTo(at, rung) {
      const t = tileAt(at.region, at.patch);
      const p = at.spot ? spotAt(at as Coords) : new THREE.Vector3(t.x, 0, t.z);
      fly({ x: rung === 'patch' ? t.x : p.x, z: (rung === 'patch' ? t.z : p.z) + (rung === 'ground' ? 6 : 0), dist: RUNG_D[rung] });
    },
    wholeYard: () => fly(homeView()),
    setReduced: (r) => (reduced = r),
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      removeEventListener('keydown', onKey);
      removeEventListener('keyup', onKey);
      removeEventListener('blur', blur);
      ants.dispose();
      for (const c of columns.values()) c.el.remove();
      for (const el of dots.values()) el.remove();
      for (const p of places.values()) p.el?.remove();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mm = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mm)) mm.forEach((x) => x.dispose()); else mm?.dispose();
      });
      for (const x of disposables) x.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
