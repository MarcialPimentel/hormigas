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
import propsUrl from './props.json?url';
import { CHITIN, antUniforms, createAnts, type Ants } from '../nest3d/ants3d';
import { createGrasshoppers, createTermiteMounds } from '../three/toonModel';
import { createAphidHerds } from '../three/aphidHerd';
import { tripProgress } from '../UnderWay';
import { TIMING, drawnFor, momentAt, planBattle, replayLength, type BattlePlan, type ReplayMoment } from '../patch3d/battle';
import { makePath, pitchAhead, pointAlong, type Path } from '../three/path';
import { MARCH } from '../three/march';
import type { Spot, Coords } from '../Patch';
import type { ServerState } from '../../game';

export interface RegionPatch { patch: number; colonies: number; wild: boolean; mine: boolean; ally?: boolean }
export type Rung = 'yard' | 'region' | 'patch' | 'ground';
export type PatchFog = 'visible' | 'explored' | 'unexplored';
export interface YardData { state: ServerState | null; now: number; colonyId: number | null }
export interface YardHandlers {
  /** a spot was tapped (a mound, a wild site, an empty spot) */
  onPick: (at: Coords) => void;
  /** double-click on one of your own mounds: the camera has dived into its crater */
  onDive: (at: Coords) => void;
  /** the camera is close over this patch: load its spots */
  onLook: (region: number, patch: number) => void;
  onRung: (r: Rung) => void;
  /** a battle replay moved on (a new round, new losses), or ended (null) */
  onBattle?: (b: BattleView | null) => void;
}
/** What a battle replay shows right now, for the card over the map. */
export interface BattleView { plan: BattlePlan; moment: ReplayMoment }
export interface YardScene {
  setRegion(region: number, patches: RegionPatch[]): void;
  setSpots(region: number, patch: number, spots: Spot[], fog?: PatchFog): void;
  /** fog of war over a region's patches (docs/22-discovery.md#fog-of-war) */
  setFog(region: number, fog: { patch: number; fog: PatchFog }[]): void;
  setSelected(at: Coords | null): void;
  /** fly the camera to a place, at a level */
  flyTo(at: { region: number; patch: number; spot?: number }, rung: Rung): void;
  wholeYard(): void;
  /** act a battle report out where it was fought; false if the report has nothing to show (no rounds) */
  playBattle(report: unknown): boolean;
  stopBattle(): void;
  setReduced(r: boolean): void;
  dispose(): void;
}

type MoundData = { pos: number[]; tri: number[][]; r: number; h: number };
/** small models built in Blender (docs/art/whole-yard/props.blend.py): positions y-up, sRGB colour per vertex */
type PropData = Record<string, { pos: number[]; col: number[] }>;
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
// The beds sit 1.5 m apart, with paths between them. Each has its own ground: a striped lawn, dark flowerbed soil,
// mossy creek bank, orange bark chips and deep green long grass, so no two read alike from the top.
const REGIONS = [
  { ox: -1060, oz: -1780, color: '#93C957', alt: '#80B748', kind: 'lawn' },
  { ox: -2120, oz: -1780, color: '#6F4D33', alt: '#664630', kind: 'garden' },
  { ox: -1590, oz: -860, color: '#93B49C', alt: '#86A890', kind: 'creek' },
  { ox: 0, oz: -1780, color: '#A86E3E', alt: '#9C6538', kind: 'wood' },
  { ox: -530, oz: -860, color: '#4F8C30', alt: '#4A852D', kind: 'grass' },
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
  const [MOUNDS, PROPS]: [MoundData[], PropData] = await Promise.all([fetch(moundsUrl).then((r) => r.json()), fetch(propsUrl).then((r) => r.json())]);
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
  // ---------- fog of war (docs/22-discovery.md#fog-of-war): one map of the patches, red = never explored (a dark,
  // drifting mist), green = out of sight (greyed and dimmed). Everything standing on the ground is shaded by it; the
  // hex lines aren't, so every patch's outline still shows.
  const fogU = { uFogTex: { value: null as THREE.Texture | null }, uFogBox: { value: new THREE.Vector4(0, 0, 1, 1) }, uFogTime: { value: 0 } };
  function fogify<M extends THREE.Material>(m: M): M {
    const prev = m.onBeforeCompile.bind(m), key = m.customProgramCacheKey();
    m.onBeforeCompile = (sh, r) => {
      prev(sh, r);
      Object.assign(sh.uniforms, fogU);
      sh.vertexShader = 'uniform vec4 uFogBox;\nvarying vec2 vFogUv;\n' + sh.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 fogWp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        fogWp = instanceMatrix * fogWp;
        #endif
        fogWp = modelMatrix * fogWp;
        vFogUv = (fogWp.xz - uFogBox.xy) / uFogBox.zw;`,
      );
      sh.fragmentShader = 'uniform sampler2D uFogTex;\nuniform float uFogTime;\nvarying vec2 vFogUv;\n' + sh.fragmentShader.replace(
        '#include <dithering_fragment>',
        `vec2 fogK = texture2D(uFogTex, vFogUv).rg;
        float fogN = 0.82 + 0.18 * sin(vFogUv.x * 95.0 + uFogTime * 0.35) * sin(vFogUv.y * 70.0 - uFogTime * 0.28);
        vec3 fogGrey = vec3(dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11)));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(fogGrey, vec3(0.7, 0.71, 0.7), 0.2) * 0.78, fogK.g * 0.9);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.21, 0.24, 0.28) * fogN, fogK.r * 0.86);
        #include <dithering_fragment>`,
      );
    };
    m.customProgramCacheKey = () => key + '|fog';
    return m;
  }
  const hoppers = createGrasshoppers(fogify), termites = createTermiteMounds(fogify);
  disposables.push(hoppers, termites);
  const herds = createAphidHerds(fogify);
  disposables.push(herds);
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (color: string) => {
    if (!mats.has(color)) mats.set(color, fogify(new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 })));
    return mats.get(color)!;
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();
  // ---------- the Blender models (grass, flowers, shrubs, rocks, stones, logs, chips, leaves)
  const propGeo = new Map<string, THREE.BufferGeometry>();
  function prop(name: string) {
    let g = propGeo.get(name);
    if (!g) {
      const d = PROPS[name], c = new Float32Array(d.col.length);
      for (let i = 0; i < c.length; i += 3) { col.setRGB(d.col[i], d.col[i + 1], d.col[i + 2], THREE.SRGBColorSpace); c[i] = col.r; c[i + 1] = col.g; c[i + 2] = col.b; }
      g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
      g.computeVertexNormals();
      propGeo.set(name, g); disposables.push(g);
    }
    return g;
  }
  const propMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
  /** thin things seen from both sides: petals, leaves, reeds */
  const propMat2 = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
  fogify(propMat); fogify(propMat2);
  disposables.push(propMat, propMat2);

  // ---------- tiles
  const tiles: { region: number; patch: number; x: number; z: number; col: number }[] = [];
  for (let r = 1; r <= NREG; r++) for (let p = 1; p <= PER; p++) tiles.push({ region: r, patch: p, ...tileAt(r, p) });
  const bounds = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const t of tiles) { bounds.x0 = Math.min(bounds.x0, t.x); bounds.x1 = Math.max(bounds.x1, t.x); bounds.z0 = Math.min(bounds.z0, t.z); bounds.z1 = Math.max(bounds.z1, t.z); }

  // ---------- the yard round the beds: a mown lawn, paths, the back of the house and its patio, a fence all round
  const GY = -2.5; // the lawn sits just under the beds
  const beds = Array.from({ length: NREG }, (_, i) => {
    const ts = tiles.filter((t) => t.region === i + 1);
    const x0 = Math.min(...ts.map((t) => t.x)) - HW / 2 - 4, x1 = Math.max(...ts.map((t) => t.x)) + HW / 2 + 4;
    const z0 = Math.min(...ts.map((t) => t.z)) - HR - 4, z1 = Math.max(...ts.map((t) => t.z)) + HR + 4;
    return { region: i + 1, x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
  });
  function canvasTex(size: number, draw: (g: CanvasRenderingContext2D) => void, repeat: number) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d')!);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    disposables.push(t);
    return t;
  }
  const specks = (g: CanvasRenderingContext2D, n: number, size: number, cols: string[], s: number) => {
    const pr = rng(n);
    for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(pr() * size, pr() * size, s, s); }
  };
  // the lawn: mown stripes running away from the house, 1.6 m wide
  const LAWN = 32000;
  const lawnTex = canvasTex(256, (g) => {
    g.fillStyle = '#7AA548'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#6F9A41'; g.fillRect(128, 0, 128, 256);
    specks(g, 900, 256, ['#86B252', '#66903C', '#8DB85A'], 2);
  }, LAWN / 320);
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(LAWN, LAWN), new THREE.MeshStandardMaterial({ map: lawnTex, roughness: 1 }));
  lawn.rotation.x = -Math.PI / 2; lawn.position.set(0, GY - 0.3, 0); lawn.receiveShadow = true;
  world.add(lawn);
  const flat = (w: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
    p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); p.receiveShadow = true;
    world.add(p);
    return p;
  };
  const bx0 = Math.min(...beds.map((b) => b.x0)), bx1 = Math.max(...beds.map((b) => b.x1));
  const bz0 = Math.min(...beds.map((b) => b.z0)), bz1 = Math.max(...beds.map((b) => b.z1));
  // each bed is one continuous ground, painted with its own surface (Marz's pick, 2 Nov 2026: soft ground, the hexes
  // only drawn on it as lines). Painted at about 1 px per cm, so it still has grain at ant height.
  for (const b of beds) {
    const g = REGIONS[b.region - 1], W = b.x1 - b.x0, D = b.z1 - b.z0;
    const S = 1024, pr = rng(100 + b.region), sx = S / W;
    const tex = canvasTex(S, (c) => {
      c.fillStyle = g.color; c.fillRect(0, 0, S, S);
      const blot = (x: number, y: number, r: number, color: string, a: number) => {
        const gr = c.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, color); gr.addColorStop(1, 'transparent');
        c.globalAlpha = a; c.fillStyle = gr; c.fillRect(x - r, y - r, r * 2, r * 2); c.globalAlpha = 1;
      };
      if (g.kind === 'lawn') {
        // mown stripes running away from the house, 1.6 m wide
        c.fillStyle = g.alt;
        for (let x = 0; x < W; x += 320) c.fillRect(x * sx, 0, 160 * sx, S);
      }
      const light = col.set(g.color).offsetHSL(0, 0, 0.07).getStyle(), dark = col.set(g.alt).offsetHSL(0, 0, -0.08).getStyle();
      for (let i = 0; i < 70; i++) blot(pr() * S, pr() * S, 40 + pr() * 120, pr() < 0.5 ? light : dark, 0.35);
      const extra: Record<string, [string[], number]> = {
        lawn: [['#B4C860', '#5E8F38'], 14],
        garden: [['#4E3422', '#83613F'], 30],
        creek: [['#6F9C5A', '#7C8A80', '#5E7D6A'], 40],
        wood: [['#C98450', '#7E4A28'], 24],
        grass: [['#B9B45A', '#3C6E24'], 30],
      };
      const [cols, n] = extra[g.kind];
      for (let i = 0; i < n; i++) blot(pr() * S, pr() * S, 30 + pr() * 90, cols[i % cols.length], 0.4);
      // grain: soil crumbs, gravel, chips, clippings
      const grain: Record<string, string[]> = {
        lawn: ['#86B252', '#66903C', '#9CC45E'],
        garden: ['#8A6A48', '#3E2A1C', '#9C7B55'],
        creek: ['#B9B4A8', '#6C8D62', '#8FA98F'],
        wood: ['#D48B52', '#8E4F27', '#E3A56A'],
        grass: ['#6E9E3A', '#3E6E28', '#C9C072'],
      };
      for (let i = 0; i < 26000; i++) {
        c.fillStyle = grain[g.kind][i % 3];
        const w = g.kind === 'wood' ? 3 + pr() * 6 : 1 + pr() * 2, h = g.kind === 'wood' ? 2 + pr() * 3 : 1 + pr() * 2;
        c.save(); c.translate(pr() * S, pr() * S); c.rotate(pr() * 3); c.globalAlpha = 0.55 + pr() * 0.45; c.fillRect(-w / 2, -h / 2, w, h); c.restore();
      }
      c.globalAlpha = 1;
      // a damp, shaded rim inside the brick edge
      const rim = 16 * sx;
      for (const [x0, y0, x1, y1] of [[0, 0, 0, rim], [0, S, 0, S - rim], [0, 0, rim, 0], [S, 0, S - rim, 0]]) {
        const gr = c.createLinearGradient(x0, y0, x1, y1);
        gr.addColorStop(0, 'rgba(40,28,16,0.45)'); gr.addColorStop(1, 'rgba(40,28,16,0)');
        c.fillStyle = gr; c.fillRect(Math.min(x0, x1), Math.min(y0, y1), x0 === x1 ? S : rim, y0 === y1 ? S : rim);
      }
    }, 1);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 8;
    flat(W, D, fogify(new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })), b.cx, 0, b.cz);
  }
  const fogState = new Map<string, PatchFog>(); // "r:p" → how you see it; unknown = in sight until the server says
  const FOGBOX = { x: bx0 - 40, z: bz0 - 40, w: bx1 - bx0 + 80, d: bz1 - bz0 + 80 };
  const fogCanvas = document.createElement('canvas');
  fogCanvas.width = 1024; fogCanvas.height = Math.round((1024 * FOGBOX.d) / FOGBOX.w);
  const fogTex = new THREE.CanvasTexture(fogCanvas);
  fogTex.colorSpace = THREE.NoColorSpace; fogTex.flipY = false;
  disposables.push(fogTex);
  fogU.uFogTex.value = fogTex;
  fogU.uFogBox.value.set(FOGBOX.x, FOGBOX.z, FOGBOX.w, FOGBOX.d);
  let fogDirty = true;
  function paintFog() {
    fogDirty = false;
    const g = fogCanvas.getContext('2d')!, k = fogCanvas.width / FOGBOX.w;
    g.filter = 'none';
    g.fillStyle = '#000'; g.fillRect(0, 0, fogCanvas.width, fogCanvas.height);
    g.filter = `blur(${Math.max(1, HR * 0.08 * k)}px)`;
    for (const t of tiles) {
      const f = fogState.get(`${t.region}:${t.patch}`);
      if (!f || f === 'visible') continue;
      g.fillStyle = f === 'unexplored' ? '#F00' : '#0F0';
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, r = HR * 1.06;
        const x = (t.x + Math.sin(a) * r - FOGBOX.x) * k, y = (t.z + Math.cos(a) * r - FOGBOX.z) * k;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath(); g.fill();
    }
    fogTex.needsUpdate = true;
  }
  function setFog(region: number, fog: { patch: number; fog: PatchFog }[]) {
    for (const f of fog) fogState.set(`${region}:${f.patch}`, f.fog);
    fogDirty = true;
  }

  // a low brick edge with a pale coping round every bed (Marz's pick, 1 Nov 2026)
  const EDGE = { w: 20, top: 4 };
  {
    const brick = mat('#B4583A'), coping = mat('#C9C0B0');
    for (const b of beds) {
      const T = EDGE.w;
      const pieces: [number, number, number, number][] = [
        [b.cx, b.z0 - T / 2, b.x1 - b.x0 + T * 2, T], [b.cx, b.z1 + T / 2, b.x1 - b.x0 + T * 2, T],
        [b.x0 - T / 2, b.cz, T, b.z1 - b.z0], [b.x1 + T / 2, b.cz, T, b.z1 - b.z0],
      ];
      for (const [x, z, w, d] of pieces) {
        const e = new THREE.Mesh(new THREE.BoxGeometry(w, EDGE.top - GY, d), brick);
        e.position.set(x, (EDGE.top + GY) / 2, z); e.castShadow = e.receiveShadow = true;
        const c = new THREE.Mesh(new THREE.BoxGeometry(w + 2, 1.5, d + 2), coping);
        c.position.set(x, EDGE.top + 0.75, z);
        world.add(e, c);
      }
    }
  }
  {
    // stepping stones across the lawn between the beds
    const stones: [number, number][] = [];
    const rows = [...new Set(beds.map((b) => Math.round(b.cz)))].sort((a, b) => a - b).map((z) => beds.filter((b) => Math.round(b.cz) === z).sort((a, b) => a.x0 - b.x0));
    for (const row of rows) for (let i = 0; i + 1 < row.length; i++) {
      const x = (row[i].x1 + row[i + 1].x0) / 2;
      for (let z = row[i].z0 + 30; z < row[i].z1; z += 70) stones.push([x, z]);
    }
    for (let i = 0; i + 1 < rows.length; i++) {
      const z = (Math.max(...rows[i].map((b) => b.z1)) + Math.min(...rows[i + 1].map((b) => b.z0))) / 2;
      for (let x = bx0 + 20; x < bx1; x += 70) stones.push([x, z]);
    }
    const pr = rng(7);
    for (const [k, name] of ['stone_a', 'stone_b'].entries()) {
      const these = stones.filter((_, i) => i % 2 === k);
      const sm = new THREE.InstancedMesh(prop(name), propMat, these.length);
      these.forEach(([x, z], i) => sm.setMatrixAt(i, m4.compose(v.set(x, GY - 0.6, z), q.setFromEuler(e3.set(0, pr() * 6, 0)), s3.set(0.95 + pr() * 0.15, 1, 0.95 + pr() * 0.15))));
      sm.receiveShadow = true;
      world.add(sm);
    }
  }

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
  /** a random point inside a bed, clear of its brick edge */
  const inBed = (r: number, pad = 3) => () => { const b = beds[r - 1]; return { x: lerp(b.x0 + pad, b.x1 - pad, R()), z: lerp(b.z0 + pad, b.z1 - pad, R()), region: r }; };
  const lying = (x: number, y: number, z: number, s: number, tilt = 0.25) => m4.compose(v.set(x, y, z), q.setFromEuler(e3.set((R() - 0.5) * tilt, R() * 6.3, (R() - 0.5) * tilt)), s3.set(s, s, s));
  // grass: clumps of curved blades, dark at the root and light at the tip, that sway in the wind (Marz's pick, 2 Nov 2026)
  const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
  // grass round the point you're looking at is pressed down, so it never hides the mound you came to see
  const grassU = { uTarget: { value: new THREE.Vector2() }, uClear: { value: 0 }, uTime: { value: 0 }, uCam: { value: new THREE.Vector2() }, uCamR: { value: 0 } };
  grassMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, grassU);
    sh.vertexShader = 'uniform vec2 uTarget;\nuniform float uClear;\nuniform float uTime;\nuniform vec2 uCam;\nuniform float uCamR;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec4 gOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float gH = max(position.y, 0.0);
      float gWind = sin(uTime * 1.7 + gOrigin.x * 0.035 + gOrigin.z * 0.02) + 0.4 * sin(uTime * 3.1 + gOrigin.z * 0.05);
      float gBend = gWind * 0.08 * gH * gH / (gH + 10.0);
      transformed.x += gBend; transformed.z += gBend * 0.5;
      float gK = mix(0.12, 1.0, smoothstep(uClear * 0.55, uClear, length(gOrigin.xz - uTarget)));
      // and round the camera's own feet, so no clump fills the screen at ant height
      float gC = uCamR > 0.0 ? mix(0.08, 1.0, smoothstep(uCamR * 0.5, uCamR, length(gOrigin.xz - uCam))) : 1.0;
      transformed.y *= (uClear > 0.0 ? gK : 1.0) * gC;`,
    );
  };
  fogify(grassMat);
  disposables.push(grassMat);
  const kindOf = (r: number) => REGIONS[r - 1].kind;
  /** big dressing that reads from the top and gives way to the real grass and flowers up close */
  const farDress: THREE.Object3D[] = [];
  /** per bed: which clump, how many, how tall, and a tint so each bed's grass belongs to its ground */
  const GRASS: Record<string, { model: string; n: number; tall: number; tint: string }> = {
    lawn: { model: 'grass_short', n: 2800, tall: 1, tint: '#FFFFFF' },
    garden: { model: 'grass_mid', n: 700, tall: 0.85, tint: '#D9DCC4' },
    creek: { model: 'grass_mid', n: 1500, tall: 1, tint: '#D0E4D4' },
    wood: { model: 'grass_short', n: 450, tall: 1, tint: '#E6DFB4' },
    grass: { model: 'grass_tall', n: 3000, tall: 1, tint: '#FFFFFF' },
  };
  const grassMeshes: THREE.InstancedMesh[] = [];
  for (const model of ['grass_short', 'grass_mid', 'grass_tall']) {
    const plan = beds.filter((b) => GRASS[kindOf(b.region)].model === model);
    const n = plan.reduce((a, b) => a + GRASS[kindOf(b.region)].n, 0);
    if (!n) continue;
    const im = new THREE.InstancedMesh(prop(model), grassMat, n);
    let k = 0;
    for (const b of plan) {
      const cfg = GRASS[kindOf(b.region)], pick = inBed(b.region, 2);
      for (let i = 0; i < cfg.n; i++) {
        const t = pick(), sc = 0.75 + R() * 0.55;
        im.setMatrixAt(k, m4.compose(v.set(t.x, 0, t.z), q.setFromEuler(e3.set((R() - 0.5) * 0.25, R() * 6.3, (R() - 0.5) * 0.25)), s3.set(sc, sc * cfg.tall * (0.8 + R() * 0.4), sc)));
        im.setColorAt(k++, col.set(cfg.tint).offsetHSL(0, 0, (R() - 0.5) * 0.06));
      }
    }
    world.add(im);
    grassMeshes.push(im);
  }
  // litter at ant height: pebbles everywhere but the lawn, fallen leaves in the flowerbed and on the creek bank
  for (const [r, n] of [[2, 500], [3, 900], [4, 200], [5, 300]] as const) if (r <= NREG)
    scatter(prop('pebble'), propMat, n, inBed(r), (t) => lying(t.x, -0.1, t.z, 0.4 + R() * 1.2, 1.5), false);
  for (const [r, n] of [[2, 400], [3, 250]] as const) if (r <= NREG)
    scatter(prop('leaf'), propMat2, n, inBed(r), (t) => lying(t.x, 0, t.z, 0.6 + R() * 0.5, 0.3), false);
  const FLOWERS = ['#F2A0C4', '#FFD84D', '#F7F4EA', '#B98CFF', '#FF8A5C'];
  if (NREG >= 2) {
    // the Old Garden: flowers on stems, the petals coloured per flower
    const pick = inBed(2, 8), n = 350;
    const stems = new THREE.InstancedMesh(prop('flower_stem'), propMat2, n), heads = new THREE.InstancedMesh(prop('flower_petals'), propMat2, n);
    for (let i = 0; i < n; i++) {
      const t = pick(), sc = 0.8 + R() * 0.45;
      m4.compose(v.set(t.x, 0, t.z), q.setFromEuler(e3.set((R() - 0.5) * 0.2, R() * 6.3, (R() - 0.5) * 0.2)), s3.set(sc, sc * (0.8 + R() * 0.5), sc));
      stems.setMatrixAt(i, m4); heads.setMatrixAt(i, m4);
      heads.setColorAt(i, col.set(FLOWERS[i % FLOWERS.length]));
    }
    stems.castShadow = heads.castShadow = true;
    world.add(stems, heads);
    // flowering shrubs big enough to read from the top
    const shrubs = new THREE.InstancedMesh(prop('shrub'), propMat, 70), bloom = new THREE.InstancedMesh(prop('blossom'), propMat2, 70);
    const sp = inBed(2, 25);
    for (let i = 0; i < 70; i++) {
      const t = sp(), sc = 0.9 + R() * 0.6;
      m4.compose(v.set(t.x, 0, t.z), q.setFromEuler(e3.set(0, R() * 6.3, 0)), s3.set(sc, sc * (0.8 + R() * 0.3), sc));
      shrubs.setMatrixAt(i, m4); bloom.setMatrixAt(i, m4);
      bloom.setColorAt(i, col.set(FLOWERS[i % FLOWERS.length]));
    }
    shrubs.castShadow = true;
    world.add(shrubs, bloom);
    farDress.push(shrubs, bloom);
  }
  if (NREG >= 4) {
    // the log pile is stacked on the lawn beside the bed, so it never hides a patch (Marz, 2 Nov 2026)
    const wb = beds[3], px = wb.x1 + EDGE.w + 110;
    for (const [layer, n] of [[0, 4], [1, 3], [2, 2]]) for (let j = 0; j < n; j++) {
      const r = 19 + R() * 4, len = 240 + R() * 110;
      const lg = new THREE.Mesh(prop('log'), propMat);
      lg.scale.set(len / 300, r / 22, r / 22); lg.rotation.set(R() * 6.3, Math.PI / 2 + (R() - 0.5) * 0.12, 0, 'YXZ');
      lg.position.set(px + (j - (n - 1) / 2) * 44, GY + 21 + layer * 37, wb.cz + (R() - 0.5) * 40);
      lg.castShadow = lg.receiveShadow = true;
      world.add(lg);
    }
    for (const name of ['chip_a', 'chip_b']) scatter(prop(name), propMat, 300, inBed(4), (t) => lying(t.x, -0.2, t.z, 0.7 + R() * 0.8, 0.3), false);
  }
  if (NREG >= 3) {
    const a = tileAt(3, 1), b = tileAt(3, 100);
    const curve = new THREE.CatmullRomCurve3(Array.from({ length: 41 }, (_, i) => { const k = i / 40; return new THREE.Vector3(lerp(a.x + 10, b.x - 10, k), 0.8, lerp(a.z + 120, b.z - 120, k) + Math.sin(k * 7) * 90); }));
    const pos: number[] = [], idx: number[] = [], N = 120;
    for (let i = 0; i <= N; i++) {
      const p = curve.getPoint(i / N), tg = curve.getTangent(i / N), w = 26 + Math.sin(i * 0.4) * 6;
      pos.push(p.x - tg.z * w, 0.8, p.z + tg.x * w, p.x + tg.z * w, 0.8, p.z - tg.x * w);
      if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const water = fogify(new THREE.MeshStandardMaterial({ color: '#4FA3C7', roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide }));
    world.add(new THREE.Mesh(g, water));
    // the creek rises in a spring pool and ends in a pond, both ringed with stones, so it never stops mid-bed
    for (const [k, r] of [[0, 44], [1, 54]] as const) {
      const p = curve.getPoint(k);
      const pool = new THREE.Mesh(new THREE.CircleGeometry(r, 18), water);
      pool.rotation.x = -Math.PI / 2; pool.position.set(p.x, 0.9, p.z);
      world.add(pool);
      const ring = new THREE.InstancedMesh(prop(k ? 'rock_moss' : 'rock'), propMat, 16);
      for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2 + R() * 0.2, sc = 7 + R() * 3; ring.setMatrixAt(i, m4.compose(v.set(p.x + Math.cos(a) * r, -0.5, p.z + Math.sin(a) * r), q.setFromEuler(e3.set(0, R() * 6.3, 0)), s3.set(sc * (1 + R() * 0.4), sc * 0.8, sc))); }
      ring.castShadow = true;
      world.add(ring);
    }
    for (const name of ['rock', 'rock_moss']) scatter(prop(name), propMat, 80, inBed(3, 8), (t) => { const sc = 4 + R() * 5; return m4.compose(v.set(t.x, -0.4, t.z), q.setFromEuler(e3.set(0, R() * 6.3, 0)), s3.set(sc * (1 + R() * 0.4), sc * 0.8, sc)); });
    // reed clumps along the water
    farDress.push(scatter(prop('reeds'), grassMat, 70, () => tiles[0], () => {
      const k = R(), p = curve.getPoint(k), tg = curve.getTangent(k), side = R() < 0.5 ? -1 : 1, d = 34 + R() * 14;
      const sc = 0.8 + R() * 0.4;
      return m4.compose(v.set(p.x - tg.z * d * side, 0, p.z + tg.x * d * side), q.setFromEuler(e3.set((R() - 0.5) * 0.2, R() * 6.3, (R() - 0.5) * 0.2)), s3.set(sc, sc * (0.8 + R() * 0.4), sc));
    }));
  }
  if (NREG >= 5) {
    // tussocks with straw seed heads: the Long Grass reads as a meadow, not a second lawn
    farDress.push(scatter(prop('tussock'), grassMat, 260, inBed(5, 10), (t) => { const sc = 0.85 + R() * 0.4; return m4.compose(v.set(t.x, 0, t.z), q.setFromEuler(e3.set((R() - 0.5) * 0.2, R() * 6.3, (R() - 0.5) * 0.2)), s3.set(sc, sc * (0.75 + R() * 0.5), sc)); }));
  }

  // ---------- hex lines: strong far out, gone up close
  const hexLines = (() => {
    const pos: number[] = [];
    for (const t of tiles) for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * Math.PI * 2, a1 = ((i + 1) / 6) * Math.PI * 2;
      pos.push(t.x + Math.sin(a0) * HR, 0.5, t.z + Math.cos(a0) * HR, t.x + Math.sin(a1) * HR, 0.5, t.z + Math.cos(a1) * HR);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#FFF6DC', transparent: true, opacity: 0.3 }));
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
  const moundMat = fogify(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
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
    const bed = beds.find((b) => x > b.x0 - EDGE.w && x < b.x1 + EDGE.w && z > b.z0 - EDGE.w && z < b.z1 + EDGE.w);
    if (!bed) return GY + 0.04; // out on the lawn
    if (x < bed.x0 || x > bed.x1 || z < bed.z0 || z > bed.z1) return EDGE.top + 1.54; // on the brick edge
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
      // the Meshy poppy, with more aphids feeding on it the bigger the herd
      const h = herds.make(c.herd.level);
      h.scale.setScalar(22);
      h.rotation.y = 0.4;
      g.add(h);
    } else if (c.wild?.kind === 'mound') {
      // the Meshy termite mound: a tall clay spire with buttress ridges and arched entrances
      const t = termites.make();
      t.scale.setScalar(17);
      g.add(t);
    } else if (c.wild?.kind === 'den') {
      const d = new THREE.Mesh(new THREE.SphereGeometry(7, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#3A2E2A')); d.scale.y = 0.4; g.add(d);
      const silk = new THREE.Mesh(new THREE.CircleGeometry(6, 10), new THREE.MeshStandardMaterial({ color: '#EDE8E0', transparent: true, opacity: 0.8 })); silk.rotation.x = -Math.PI / 2; silk.position.y = 2.9; g.add(silk);
    } else if (c.windfall) {
      const k = c.windfall.kind;
      if (k === 'grasshopper') {
        // the Meshy grasshopper, on its back with its legs in the air
        const h = hoppers.make();
        h.scale.setScalar(12);
        h.rotation.y = 0.5;
        g.add(h);
        return g;
      }
      const m = k === 'fig' ? new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), mat('#7A3F6E'))
        : k === 'branch' ? new THREE.Mesh(new THREE.CylinderGeometry(1, 1.4, 30, 6), mat('#7A5536'))
        : new THREE.Mesh(new THREE.CapsuleGeometry(2.5, 16, 3, 8), mat('#6E8F3A'));
      if (k !== 'fig') m.rotation.z = Math.PI / 2;
      m.position.y = 2.5; m.castShadow = true; g.add(m);
    }
    return g;
  }
  let selected: string | null = null;
  const selRing = new THREE.Mesh(new THREE.RingGeometry(6.5, 7.6, 32), new THREE.MeshBasicMaterial({ color: '#F2B21F', transparent: true, opacity: 0.9, depthWrite: false }));
  selRing.rotation.x = -Math.PI / 2; selRing.visible = false; selRing.renderOrder = 3;
  world.add(selRing);
  // a free spot is ringed with pale pebbles (they read as dots from the Patch zoom, and as stones at ant height)
  const ringMat = fogify(new THREE.MeshStandardMaterial({ color: '#F6EEDB', emissive: '#4A4436', flatShading: true, roughness: 0.8 }));
  disposables.push(ringMat);

  function setSpots(region: number, patch: number, spots: Spot[], fog?: PatchFog) {
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
          const dm = new THREE.Mesh(prop('pebble'), ringMat);
          const a = (k / 14) * Math.PI * 2, sc = 0.5 + ((k * 7) % 5) * 0.04;
          dm.position.set(Math.cos(a) * 4.2, -0.05, Math.sin(a) * 4.2); dm.rotation.y = k * 2.3; dm.scale.set(sc, sc * 0.9, sc);
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
        top = c.herd ? 26 : c.wild?.kind === 'mound' ? 32 : 12;
        cls = `ybanner site${c.windfall ? ' windfall' : ''}`; html = `<b>${esc(c.windfall ? c.windfall.text?.split('.')[0] || c.name : c.name)}</b>`;
      }
      g.position.copy(p);
      g.traverse((o) => { o.userData.at = at; if ((o as THREE.Mesh).isMesh) taps.push(o); });
      world.add(g);
      const place: Place = { key: `${region}:${patch}:${s.spot}`, at, group: g, top, mine, big };
      if (stage >= 0) moundSpots.set(place.key, { x: p.x, z: p.z, stage });
      if (html) place.el = tag(cls + (fog === 'explored' ? ' fogged' : ''), html);
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
    signText(region);
  }

  // a wooden sign at the front of each bed: its name, how many colonies live there, and whether you do. Tap it to
  // fly down to that bed.
  const signs = beds.map((b) => {
    const el = tag('ysign', '');
    el.addEventListener('click', () => fly({ x: b.cx, z: b.cz + 80, dist: RUNG_D.region }));
    return { el, b };
  });
  function signText(region: number) {
    const s = signs[region - 1];
    if (!s) return;
    const ps = regionData.get(region) ?? [];
    const n = ps.reduce((a, p) => a + p.colonies, 0), mine = ps.some((p) => p.mine);
    s.el.classList.toggle('home', mine);
    s.el.innerHTML = `<b>${esc(WORLD.regionNames[region - 1] ?? `Region ${region}`)}</b><span>${mine ? '<i>You</i>' : ''}${n === 1 ? '1 colony' : `${n.toLocaleString('en')} colonies`}</span>`;
  }
  beds.forEach((b) => signText(b.region));

  // ---------- parties: columns of real ants up close, a thread far out
  // room for a swarm's column (200 army ants) and a battle replay (140 a side) at once
  const ants: Ants = createAnts(world, { worker: 700, soldier: 400, army: 450, army_major: 30, queen: 4, alate: 10 }, true);
  interface Column { key: string; from: THREE.Vector3; to: THREE.Vector3; path: Path; len: number; thread: THREE.Line; rib: THREE.Mesh; color: string; caste: 'worker' | 'soldier' | 'army'; n: number; el: HTMLDivElement; prog: (now: number) => { d: number; back: boolean } | null; cargo?: string }
  const columns = new Map<string, Column>();
  const colP = new THREE.Vector3(), colT = new THREE.Vector3(); // scratch: where an ant stands, and which way it faces
  const sumUnits = (u?: Record<string, number>) => Object.values(u ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  function syncColumns() {
    const d = data();
    const st = d.state;
    if (!st) return;
    const want = new Map<string, Omit<Column, 'path' | 'len' | 'thread' | 'rib' | 'el'> & { label: string }>();
    const home = new Map((st.colonies ?? []).map((c) => [c.id, c.coords]));
    for (const m of (st.missions ?? []) as any[]) {
      if (!m.origin || !m.target) continue;
      const soldiers = ['raid', 'hold', 'tend', 'claim'].includes(m.type);
      want.set(`m${m.id}`, {
        key: `m${m.id}`, from: spotAt(m.origin), to: spotAt(m.target), color: m.type === 'transport' || m.type === 'relocate' ? CHITIN.worker : soldiers ? CHITIN.soldier : CHITIN.worker,
        caste: soldiers ? 'soldier' : 'worker', n: Math.min(200, Math.max(3, Math.round(Math.sqrt(sumUnits(m.units)) * 3))),
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
        label: swarm ? `Army ants · ${i.scouted ? (i.unitCount ?? 0).toLocaleString('en') : '?'}` : i.hostile ? `${i.type === 'raid' ? 'Raid' : 'Scouts'} from ${i.from}` : `Delivery from ${i.from}`,
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
      // walked by distance, like the patch's trails (docs/art/whole-yard.md): sampled finely along the curve
      const path = makePath(curve.getSpacedPoints(64));
      const len = path.total;
      const arc = new THREE.QuadraticBezierCurve3(a.clone().setY(4), a.clone().lerp(b, 0.5).setY(len * 0.25 + 10), b.clone().setY(4));
      const tg = new THREE.BufferGeometry().setFromPoints(arc.getPoints(40));
      const thread = new THREE.Line(tg, new THREE.LineDashedMaterial({ color: w.color, dashSize: 14, gapSize: 9, transparent: true, opacity: 0 }));
      thread.computeLineDistances();
      const rib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curve.getPoints(40)), 60, 0.5, 4), new THREE.MeshBasicMaterial({ color: w.color, transparent: true, opacity: 0.35, depthWrite: false }));
      rib.scale.y = 0.15; rib.position.y = 0.3;
      world.add(thread, rib);
      columns.set(k, { ...w, path, len, thread, rib, el: tag('ybanner col', `<b>${esc(w.label)}</b>`) });
    }
  }

  // ---------- battles: a report acted out where it was fought (Watch the battle, from Reports)
  // The server fought it already; this only shows its numbers (patch3d/battle.ts reads the report): both sides meet
  // in front of the target's mound, the dead fall on their backs round by round, then the winners press on or the
  // losers walk away. Up to FIGHT_CAP ants a side stand for the real numbers.
  interface Fight { plan: BattlePlan; startedAt: number; at: THREE.Vector3; dx: number; dz: number; na: number; nd: number; seen: string; sentAt: number }
  let fight: Fight | null = null;
  const FIGHT_CAP = 140;
  const fhash = (i: number, s: number) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
  const DUST = 70;
  const dustPos = new Float32Array(DUST * 3), dustLife = new Float32Array(DUST).fill(1);
  const dustGeo = new THREE.BufferGeometry();
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
    return new THREE.CanvasTexture(c);
  })();
  disposables.push(dustTex);
  const dustMat = new THREE.PointsMaterial({ map: dustTex, color: '#D8C29A', size: 1.6, transparent: true, opacity: 0.35, depthWrite: false });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.visible = false;
  dust.frustumCulled = false;
  world.add(dust);

  function playBattle(report: unknown) {
    const plan = planBattle(report);
    if (!plan) return false;
    const at = spotAt(plan.target);
    // the raiders come in from the side of the colony they marched from
    const from = plan.origin ? spotAt(plan.origin) : null;
    let dx = from ? from.x - at.x : 1, dz = from ? from.z - at.z : 0;
    if (Math.hypot(dx, dz) < 1) { dx = 1; dz = 0; }
    const l = Math.hypot(dx, dz);
    dx /= l; dz /= l;
    fight = { plan, startedAt: performance.now(), at, dx, dz, na: Math.min(FIGHT_CAP, Math.max(1, plan.attacker.start)), nd: Math.min(FIGHT_CAP, Math.max(1, plan.defender.start)), seen: '', sentAt: 0 };
    dustLife.fill(1);
    // frame it from the side, a little behind the defenders, close enough to see each ant
    const ox = -dz - dx * 0.45, oz = dx - dz * 0.45;
    let yaw = Math.atan2(ox, oz);
    while (yaw - goal.yaw > Math.PI) yaw -= Math.PI * 2;
    while (yaw - goal.yaw < -Math.PI) yaw += Math.PI * 2;
    fly({ x: at.x + dx * 10, z: at.z + dz * 10, yaw, dist: 60 }, 1.8);
    return true;
  }
  function stopBattle() {
    if (!fight) return;
    fight = null;
    dust.visible = false;
    h.onBattle?.(null);
  }
  // your ants keep their own colours; the other side is raider red, like a hostile column (Marz, 2 Nov 2026)
  function drawBattle(dt: number, antGrow: number, show: boolean) {
    if (!fight) return;
    const f = fight, p = f.plan;
    // timed by the real clock, so a slow frame rate doesn't stretch the fight; reduced motion shows the end at once
    const elapsed = (performance.now() - f.startedAt) / 1000;
    const m = momentAt(p, reduced ? replayLength(p) : elapsed);
    // tell the card: at once for a new phase or round, otherwise a few times a second (in a big fight the counts
    // change nearly every frame, and each update re-renders the whole yard screen)
    const step = `${m.phase}:${m.round}`, counts = `${m.attackers}:${m.defenders}`, t0 = performance.now();
    if (step !== f.seen.split('|')[0] || (counts !== f.seen.split('|')[1] && t0 - f.sentAt > 200)) {
      f.seen = `${step}|${counts}`;
      f.sentAt = t0;
      h.onBattle?.({ plan: p, moment: m });
    }
    if (elapsed > replayLength(p) + TIMING.linger) return stopBattle();
    if (!show) { dust.visible = false; return; } // too far out to see ants
    const g = Math.min(antGrow, 4); // spread the ranks as the ants grow, so they don't pile up when zoomed out
    const mound = moundSpots.get(`${p.target.region}:${p.target.patch}:${p.target.spot}`);
    const front = (mound ? MOUNDS[mound.stage].r * 1.05 : 4) + 1.5 * g;
    // the front line runs across the raiders' path, `front` out from the mound
    const fx = f.at.x + f.dx * front, fz = f.at.z + f.dz * front, nx = -f.dz, nz = f.dx;
    const aliveA = drawnFor(m.attackers, p.attacker.start, f.na), aliveD = drawnFor(m.defenders, p.defender.start, f.nd);
    const attackersWon = p.winner === 'attacker' && p.fellBackAfter == null;
    const attackersLeave = !attackersWon && p.winner !== 'draw';
    const ko = m.phase === 'outcome' || m.phase === 'done' ? ease(Math.min(1, m.k)) : 0;
    const youAttack = p.perspective === 'attacker';
    const attColor = p.attacker.swarm || youAttack ? undefined : CHITIN.raider;
    const defColor = youAttack ? CHITIN.raider : undefined;
    const faceIn = Math.atan2(f.dz, -f.dx), faceOut = Math.atan2(-f.dz, f.dx);
    const fighting = m.phase === 'fight';
    const side = (n: number, alive: number, attacker: boolean) => {
      const s = attacker ? p.attacker : p.defender;
      const wide = (s.swarm ? 8 : 5) * g;
      for (let j = 0; j < n; j++) {
        // the last ants in the list stand at the front, so they fall first
        const u = 1 - (j + 0.5) / n;
        const dep = -Math.log(1 - 0.99 * u) * (s.swarm ? 2.2 : 1.6) * g;
        const lat = (fhash(j, attacker ? 7 : 8) * 2 - 1) * (wide * Math.exp(-dep / (5 * g)) + 0.8 * g);
        const dead = j >= alive;
        let off = 0, yaw = attacker ? faceIn : faceOut;
        if (!dead) {
          if (m.phase === 'approach') off = (1 - ease(m.k)) * (attacker ? 16 * g : -front);
          if (attacker && attackersWon) off = -ko * front * 0.7;
          if (attacker && attackersLeave) { off = ko * 16 * g; yaw = faceOut; }
          if (!attacker && attackersWon) off = -ko * (front + dep); // survivors pull back into the nest
        }
        // defenders who made it back inside go down the entrance
        if (!attacker && !dead && attackersWon && ko > 0.85) continue;
        const along = (attacker ? 1 : -1) * (0.4 * g + dep) + off;
        const lunge = fighting && !dead && dep < 2 * g && !reduced ? Math.sin(time * 9 + j) * 0.18 * g * (attacker ? -1 : 1) : 0;
        const x = fx + f.dx * (along + lunge) + nx * lat, z = fz + f.dz * (along + lunge) + nz * lat;
        const caste = s.swarm ? (j % 9 === 4 ? 'army_major' : 'army') : fhash(j, 9) < s.soldiers ? 'soldier' : 'worker';
        ants.ant(caste, x, footY(x, z), z, {
          scale: (caste === 'worker' ? 0.6 : caste === 'army_major' ? 0.9 : 0.75) * antGrow,
          yaw: yaw + (dead ? fhash(j, 10) * 2 - 1 : lunge),
          flip: dead,
          step: dead || reduced ? 0 : 17,
          color: attacker ? attColor : defColor,
        });
      }
    };
    side(f.na, aliveA, true);
    side(f.nd, aliveD, false);
    // dust over the front line while they fight
    dust.visible = fighting && !reduced;
    if (!dust.visible) return;
    dustMat.size = 1.6 * g;
    for (let i = 0; i < DUST; i++) {
      dustLife[i] += dt * (0.6 + fhash(i, 1) * 0.6);
      if (dustLife[i] >= 1) {
        dustLife[i] = 0;
        const lat = (fhash(i, Math.floor(performance.now() / 300)) * 2 - 1) * 6 * g, fwd = (fhash(i, 31) - 0.5) * 2 * g;
        const x = fx + nx * lat + f.dx * fwd, z = fz + nz * lat + f.dz * fwd;
        dustPos[i * 3] = x; dustPos[i * 3 + 1] = footY(x, z) + 0.2; dustPos[i * 3 + 2] = z;
      }
      dustPos[i * 3 + 1] += dt * 0.4 * g;
    }
    dustGeo.attributes.position.needsUpdate = true;
  }

  // ---------- camera: one orbit rig, one zoom from the whole yard to ant height
  const view = { x: 0, z: 0, yaw: -0.3, dist: 2900 };
  const goal = { ...view };
  const pitchFor = (dd: number) => (dd < 160 ? lerp(0.2, 0.9, smooth(4, 160, dd)) : lerp(0.9, 1.02, smooth(160, 1500, dd)));
  // the top view is just the five beds (Marz, 2 Nov 2026): it fits them, their signs and the log pile to the window,
  // and you can't pull back any further than that
  const FRAME = { x0: bx0 - 40, x1: bx1 + 300, z0: bz0 - 10, z1: bz1 + 230 };
  function fitDist() {
    const tv = Math.tan((camera.fov * Math.PI) / 360), th = tv * camera.aspect;
    return Math.max((FRAME.x1 - FRAME.x0) / (2 * th), ((FRAME.z1 - FRAME.z0) * Math.sin(1.02)) / (2 * tv)) * 1.12;
  }
  const DMIN = 4;
  let DMAX = fitDist();
  const homeView = () => ({ x: (FRAME.x0 + FRAME.x1) / 2 - 20, z: (FRAME.z0 + FRAME.z1) / 2, yaw: 0, dist: fitDist() });
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
  const RUNG_D: Record<Rung, number> = { yard: DMAX, region: 900, patch: 140, ground: 14 };
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
    // a new window shape changes how far back the whole yard is; from the top, re-fit it
    const atTop = goal.dist >= DMAX * 0.97;
    DMAX = RUNG_D.yard = fitDist();
    if (atTop || goal.dist > DMAX) { tweens.length = 0; Object.assign(goal, homeView()); Object.assign(view, goal); }
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
    if (!reduced) herds.tick(time);
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
    goal.x = clamp(goal.x, FRAME.x0, FRAME.x1); goal.z = clamp(goal.z, FRAME.z0, FRAME.z1);
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
    hexLines.material.opacity = 0.1 + 0.22 * mid;
    borderU.uW.value = clamp(d * 0.006, 0.8, 16);
    fillMat.opacity = 0.08 + 0.2 * mid;
    if (borders) borders.visible = d > 30;
    for (const g of grassMeshes) g.visible = d < 2400;
    grassU.uTime.value = reduced ? 0 : time;
    grassU.uTarget.value.set(view.x, view.z);
    grassU.uClear.value = d < 260 ? clamp(d * 0.9, 14, 70) : 0;
    grassU.uCam.value.set(camera.position.x, camera.position.z);
    grassU.uCamR.value = d < 260 ? clamp(d * 0.7, 6, 60) : 0;
    // mounds keep their true size at every zoom (Marz, 4 Nov 2026: no swelling far out like the ants)
    for (const [k, g] of farMounds) g.visible = !patchPlaces.has(k);
    selRing.scale.setScalar(clamp(d / 200, 0.5, 6));
    // the server's state changed: rebuild the parties
    const dd = data();
    if (dd.state !== stateRef) { stateRef = dd.state; syncColumns(); }
    if (dd.now !== nowSeen) { nowSeen = dd.now; nowAt = t0; }
    // ants
    antUniforms.uTime.value = time;
    if (fogDirty) paintFog();
    fogU.uFogTime.value = reduced ? 0 : time;
    ants.begin();
    const showAnts = d < 700;
    // true size at ant height, then bigger as the camera pulls back (about 7× at the Patch zoom, 20× halfway out, 25× near
    // the Region zoom) so a column reads like a unit on the map (Marz, 2 Nov 2026: they were still too small)
    const M = MARCH.yard;
    const antGrow = 1 + M.growPatch * smooth(20, 140, d) + M.growRegion * smooth(140, 500, d);
    // the game's clock ticks once a second: run it on smoothly in between, so columns march instead of hopping
    const smoothNow = reduced ? dd.now : nowSeen + Math.min(1500, t0 - nowAt);
    for (const c of columns.values()) {
      c.thread.visible = d > 250; (c.thread.material as THREE.LineDashedMaterial).opacity = smooth(250, 700, d) * 0.9;
      c.rib.visible = d < 900;
      const pr = c.prog(smoothNow);
      if (!pr) continue;
      const lead = clamp(pr.d, 0, 1);
      const lp = pointAlong(c.path, lead * c.len, colP);
      place(c.el, lp.x, 8, lp.z, d < 700 && d > 30);
      if (!showAnts) continue;
      const spacing = (M.spacing * antGrow) / c.len;
      // a party's column is capped (march.json); a swarm's column is not
      const n = c.caste === 'army' ? c.n : Math.min(c.n, M.maxAnts);
      for (let i = 0; i < n; i++) {
        const k = pr.back ? lead + i * spacing : lead - i * spacing;
        if (k < 0 || k > 1) continue;
        const p = pointAlong(c.path, k * c.len, colP, colT), tg = colT;
        if (pr.back) tg.negate();
        const wob = Math.sin(i * 12.9) * M.wobble * antGrow;
        const x = p.x - tg.z * wob, z = p.z + tg.x * wob, y = footY(x, z);
        // nose up out of the crater and over the rim, down the far slope
        const ahead = footY(x + tg.x * 0.3, z + tg.z * 0.3);
        const pitch = y > 0 || ahead > 0 ? pitchAhead(footY, x, z, tg.x, tg.z, 0.3, 1.2) : 0;
        ants.ant(c.caste, x, y, z, { pitch, scale: (c.caste === 'soldier' ? M.soldierSize : M.workerSize) * antGrow, yaw: Math.atan2(-tg.z, tg.x), gait: (k * c.len) / (M.stride * antGrow) * 1.2, color: c.color, cargo: pr.back && c.cargo ? { kind: 'leaf', color: c.cargo } : null });
      }
    }
    drawBattle(dt, antGrow, showAnts);
    ants.end();
    // labels
    for (const p of places.values()) if (p.el) {
      const show = p.big ? d < 1500 && d > 9 : d < 420 && d > 9;
      place(p.el, p.group.position.x, p.top, p.group.position.z, show);
      p.el.classList.toggle('slim', d > 600);
    }
    for (const o of farDress) o.visible = d > 1300;
    for (const s of signs) {
      place(s.el, s.b.x0 + 170, 0, s.b.z1 + 95, d > 1150);
      if (s.el.style.display !== 'none') s.el.style.transform = `translate(-50%, -100%) translate(${s.el.dataset.x}px, ${+s.el.dataset.y! - 14}px)`;
    }
    for (const [k, el] of dots) {
      const [r, pp] = k.split(':').map(Number), t = tileAt(r, pp);
      el.classList.toggle('far', d > 1500); // from the top, wild nests go quiet and players stand out
      el.classList.toggle('fogged', fogState.get(k) === 'explored');
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

  return {
    setRegion,
    setFog,
    setSpots,
    setSelected,
    flyTo(at, rung) {
      const t = tileAt(at.region, at.patch);
      const p = at.spot ? spotAt(at as Coords) : new THREE.Vector3(t.x, 0, t.z);
      fly({ x: rung === 'patch' ? t.x : p.x, z: (rung === 'patch' ? t.z : p.z) + (rung === 'ground' ? 6 : 0), dist: RUNG_D[rung] });
    },
    wholeYard: () => fly(homeView()),
    playBattle,
    stopBattle,
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
      for (const s of signs) s.el.remove();
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
