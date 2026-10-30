// The 3D nest (docs/12-ui-nest-view.md, "The 3D slab"; docs/art/sunlit-microcosm.md): the colony as a block of
// earth cut open at the front, like an ant farm on a plinth, in the sunlit-microcosm look: soil in coloured
// horizons, hollows lit from inside, grass and flowers towering on top. The ants are real 3D ants, drawn at
// their true numbers up to a cap (ants3d.ts); each hollow holds what the chamber holds, in 3D (contents.ts).
// Like the 2D nest, it only shows what the server says; nothing here decides anything.
import * as THREE from 'three';
import { CHAMBERS, CHAMBER_IDS, lvl, type ChamberId, type ResourceId } from '@hormigas/shared';
import type { ServerColony, ServerState } from '../../game';
import type { Caste } from '../../art/ants';
import { partyCaste, surfaceParties, type SurfaceParty } from '../nestScene';
import { chamberTag, partyLabel } from '../nestInfo';
import { fmtDuration } from '../../format';
import { BACK, D, H, SHAFT_HW, W, ZS, carve, pathTo, room, shaftX, type P3, type Room } from './slab';
import { CHITIN, antUniforms, createAnts, type AntOpts, type CargoKind } from './ants3d';
import { createContents } from './contents';

export interface NestData {
  colony: ServerColony | null;
  state: ServerState | null;
  now: number;
}
export interface Layout {
  /** chamber levels (built chambers have level ≥ 1) */
  chambers: Partial<Record<ChamberId, number>>;
  /** chambers the colony could dig next: drawn as dashed outlines */
  unlocked: ChamberId[];
  workers: number;
  soldiers: number;
}
/** Room at the edges of the view that floating cards cover, in CSS pixels: the block is framed in what's left. */
export const MAX_ZOOM = 3.5;
export interface Inset {
  left: number;
  right: number;
  top: number;
  bottom: number;
}
export interface NestScene {
  setLayout(l: Layout): void;
  setReduced(r: boolean): void;
  setInset(i: Inset): void;
  /** Zoom in (>1) or out (<1) on the middle of the view; 1 is the whole block. */
  zoomBy(f: number): void;
  /** Back to the whole block, facing the starting way. */
  resetView(): void;
  /** `fn` hears the zoom level whenever it changes (1 = whole block). */
  setOnZoom(fn: (z: number) => void): void;
  /** Where a chamber is on screen (CSS pixels in the host), and about how wide its hollow is; null if it isn't drawn. */
  where(id: ChamberId): { x: number; y: number; rx: number } | null;
  dispose(): void;
}

const SURF = 0.32;
const SX0 = shaftX(0);
const ANT_LEN: Record<Caste, number> = { worker: 1, soldier: 1.15, queen: 1.6, alate: 1.4, army: 1, army_major: 1.3 };
const CARGO: Record<ResourceId, string> = { foliage: '#8DB255', protein: '#D06A6A', nectar: '#E8B23A' };
const SHORT: Partial<Record<ChamberId, string>> = { queen_chamber: 'Queen' };

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Sky colours through the day, by the player's own clock. */
function skyFor(hour: number) {
  if (hour >= 6 && hour < 8) return { sky: '#8E7A95', night: 0.35 };
  if (hour >= 8 && hour < 17) return { sky: '#A9CFE0', night: 0 };
  if (hour >= 17 && hour < 20) return { sky: '#6E5A7A', night: 0.45 };
  return { sky: '#121A2B', night: 1 };
}

export async function createNestScene(
  host: HTMLElement,
  labelsEl: HTMLElement,
  get: () => NestData,
  cb: { onChamber: (id: ChamberId) => void; onEntrance: () => void },
  initiallyReduced: boolean,
): Promise<NestScene> {
  const canvas = document.createElement('canvas');
  canvas.className = 'n3-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  // throws without WebGL: the caller falls back to the 2D nest
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  host.prepend(canvas);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const coarse = matchMedia('(pointer: coarse)').matches;
  let reduced = initiallyReduced;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const matCache = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (hex: string, extra: THREE.MeshStandardMaterialParameters = {}) => {
    const key = hex + JSON.stringify(extra);
    if (!matCache.has(key)) matCache.set(key, keep(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92, metalness: 0, flatShading: true, ...extra })));
    return matCache.get(key)!;
  };
  const rnd = seeded(11);
  const rr = (a: number, b: number) => a + (b - a) * rnd();
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), m);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  };
  const tex = (c: HTMLCanvasElement) => {
    const t = keep(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };

  // ---------- the soil: horizons painted once, shown on the cut face and the block's sides ----------
  // Litter, topsoil, iron clay, ochre sand, grey-blue gley clay, deep subsoil (docs/art/sunlit-microcosm.md):
  // colourful, not one brown. Pebbles, roots and fallen petals are painted in.
  const HORIZONS: [number, string, string][] = [
    [0, '#3E2B1E', '#4E3826'], [1.0, '#7B4A2D', '#8A5434'], [6.6, '#A9552F', '#BB6338'],
    [12.4, '#D3A05A', '#DFB06A'], [18.2, '#7E8E96', '#8E9DA4'], [21.6, '#5E3C2A', '#6B4631'],
  ];
  const PX = coarse ? 24 : 40;
  const soil = document.createElement('canvas');
  soil.width = W * PX;
  soil.height = H * PX;
  {
    const g = soil.getContext('2d')!;
    const bound = (i: number, x: number) => HORIZONS[i][0] + (i ? 0.35 * Math.sin(x * 0.3 + i * 1.7) + 0.2 * Math.sin(x * 0.9 + i * 3.1) : 0);
    HORIZONS.forEach(([top, c0, c1], i) => {
      g.beginPath();
      for (let x = 0; x <= W; x += 0.5) g.lineTo(x * PX, bound(i, x) * PX);
      for (let x = W; x >= 0; x -= 0.5) g.lineTo(x * PX, (i + 1 < HORIZONS.length ? bound(i + 1, x) + 0.05 : H) * PX);
      const gr = g.createLinearGradient(0, top * PX, 0, (HORIZONS[i + 1]?.[0] ?? H) * PX);
      gr.addColorStop(0, c0);
      gr.addColorStop(1, c1);
      g.fillStyle = gr;
      g.fill();
    });
    const k = PX / 40;
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,240,210,0.13)' : 'rgba(30,15,5,0.16)';
      g.fillRect(rnd() * W * PX, rnd() * H * PX, rr(1, 4) * k, rr(1, 3) * k);
    }
    for (let i = 0; i < 160; i++) {
      const x = rnd() * W * PX, y = rr(1, H) * PX, r = rr(3, 13) * k;
      g.fillStyle = pick(['#E9E1D2', '#B9B4AA', '#C77C55', '#8D8781', '#F2EBDD']);
      g.beginPath();
      g.ellipse(x, y, r * 1.3, r, rr(0, 3), 0, 7);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.ellipse(x - r * 0.3, y - r * 0.35, r * 0.4, r * 0.25, 0, 0, 7);
      g.fill();
    }
    g.lineCap = 'round';
    for (let i = 0; i < 18; i++) {
      let x = rnd() * W * PX, y = 0;
      const w = rr(3, 7) * k, len = rr(4, 11) * PX;
      g.strokeStyle = 'rgba(238,224,196,0.75)';
      g.beginPath();
      g.moveTo(x, y);
      while (y < len) {
        x += rr(-14, 14) * k;
        y += rr(10, 22) * k;
        g.lineWidth = w * (1 - y / len) + 0.6;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    for (let i = 0; i < 70; i++) {
      g.save();
      g.translate(rnd() * W * PX, rr(0.1, 0.9) * PX);
      g.rotate(rr(0, 6));
      g.fillStyle = pick(['#7DB33A', '#E07B39', '#F2C14E', '#B5562F', '#9BB84A']);
      g.beginPath();
      g.ellipse(0, 0, rr(6, 14) * k, rr(3, 6) * k, 0, 0, 7);
      g.fill();
      g.restore();
    }
  }
  // the cut face's UVs are its x, y in slab units: stretch the canvas over the whole face
  const faceTex = tex(soil);
  faceTex.repeat.set(1 / W, 1 / H);
  faceTex.offset.set(0.5, 1);
  const soilSide = keep(new THREE.MeshStandardMaterial({ map: tex(soil), roughness: 0.95 }));

  // ---------- grass: instanced blades that sway in the shader and glow with the sun behind them ----------
  const grassU = { uTime: { value: 0 }, uWind: { value: 0.11 }, uGlow: { value: 0.22 }, uRim: { value: new THREE.Color(0.28, 0.36, 0.05) } };
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
  const grassMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.72 }));
  grassMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, grassU);
    sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      float wp = uTime * 1.5 + instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
      float bend = position.y * position.y * uWind;
      transformed.x += sin(wp) * bend;
      transformed.z += (0.5 + 0.5 * cos(wp * 0.73)) * bend * 0.6;`);
    sh.fragmentShader = 'uniform vec3 uRim;\nuniform float uGlow;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `
      gl_FragColor.rgb += vColor * uGlow;
      float rimG = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
      gl_FragColor.rgb += uRim * rimG * rimG;
      #include <dithering_fragment>`);
  };

  // ---------- the block: back, plinth, surface ----------
  {
    const top = mat('#6FA83E'), under = mat('#3A2618'), behind = mat('#2A1A12');
    const back = new THREE.Mesh(keep(new THREE.BoxGeometry(W, H, BACK)), [soilSide, soilSide, top, under, behind, soilSide]);
    // a hair behind the face, so the lit back walls of the hollows sit in front of it without flicker
    back.position.set(0, -H / 2, -D - BACK / 2 - 0.05);
    back.receiveShadow = back.castShadow = true;
    scene.add(back);
    box(W + 5, 1.6, D + BACK + 5, mat('#5B4636'), 0, -H - 0.8, -(D + BACK) / 2).receiveShadow = true;
    box(W + 6, 0.5, D + BACK + 6, mat('#463428'), 0, -H - 1.85, -(D + BACK) / 2);
    const g = mat('#6FA83E');
    const lw = SX0 - SHAFT_HW - 0.2 + W / 2;
    box(lw, SURF, D, g, -W / 2 + lw / 2, SURF / 2, -D / 2).receiveShadow = true;
    const rw = W / 2 - (SX0 + SHAFT_HW + 0.2);
    box(rw, SURF, D, g, W / 2 - rw / 2, SURF / 2, -D / 2).receiveShadow = true;
    box(W, SURF, BACK + 0.05, g, 0, SURF / 2, -D - BACK / 2 - 0.025).receiveShadow = true;
    // grass in one batch, taller toward the back so ants on the surface wade through it
    const n = coarse ? 700 : 1300;
    const inst = new THREE.InstancedMesh(bladeGeo, grassMat, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), cl = new THREE.Color();
    for (let i = 0; i < n; i++) {
      let x = rr(-W / 2 + 0.3, W / 2 - 0.3);
      const z = rr(-D - BACK + 0.3, -0.2);
      if (Math.abs(x - SX0) < 2.6 && z > -4.5) x += x > SX0 ? 2.6 : -2.6;
      e.set(rr(-0.15, 0.15), rnd() * 6.28, rr(-0.12, 0.12));
      q.setFromEuler(e);
      const h = rr(0.7, 1.6) + (-z / (D + BACK)) * rr(0.5, 1.8), w = rr(0.12, 0.22);
      m4.compose(new THREE.Vector3(x, SURF - 0.02, z), q, new THREE.Vector3(w, h, w * 1.5));
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, cl.set(pick(['#FFFFFF', '#F2F7E0', '#E6F0C8', '#FFF6D8'])));
    }
    inst.castShadow = !coarse;
    inst.receiveShadow = true;
    scene.add(inst);
    // flowers overhead: colour comes from life
    const FLOWERS: [string, string][] = [['#FFD23F', '#E39B12'], ['#F6B6D2', '#F7E9A6'], ['#FF6B4F', '#2B1D13'], ['#FBF7EE', '#F2B92B']];
    const petal = keep(new THREE.SphereGeometry(1, 10, 6).scale(0.6, 0.1, 0.26).translate(0.6, 0, 0));
    const heartG = keep(new THREE.SphereGeometry(0.3, 12, 8).scale(1, 0.55, 1));
    for (const [x, z] of [[-19, -7], [-9.5, -12], [6, -10.5], [14, -4.5], [21.5, -11], [-23, -3.5]]) {
      const h = rr(3.5, 6.5), [pc, hc] = pick(FLOWERS);
      const stem = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.06, 0.08, h, 5).translate(0, h / 2, 0)), mat('#4F8A35'));
      stem.position.set(x, SURF, z);
      stem.castShadow = true;
      scene.add(stem);
      for (let k = 0; k < 7; k++) {
        const p = new THREE.Mesh(petal, mat(pc, { side: THREE.DoubleSide, roughness: 0.55, flatShading: false }));
        p.position.set(x, SURF + h, z);
        p.rotation.set(0, (k / 7) * 6.28, 0.2);
        p.castShadow = true;
        scene.add(p);
      }
      const heart = new THREE.Mesh(heartG, mat(hc, { flatShading: false }));
      heart.position.set(x, SURF + h, z);
      scene.add(heart);
    }
    const stone = keep(new THREE.IcosahedronGeometry(1, 0));
    for (let i = 0; i < 26; i++) {
      const p = new THREE.Mesh(stone, mat(pick(['#C9BBA8', '#A79A8C', '#E2D6C4', '#B98A6A'])));
      p.position.set(rr(-W / 2 + 1, W / 2 - 1), SURF + 0.1, rr(-D - BACK + 1, -0.6));
      const s = rr(0.2, 0.55);
      p.scale.set(s, s * 0.6, s);
      p.castShadow = true;
      scene.add(p);
    }
    // a fallen leaf, a twig and a toadstool on top
    const ls = new THREE.Shape();
    ls.moveTo(0, -2.6);
    ls.quadraticCurveTo(2.4, -0.6, 0, 2.6);
    ls.quadraticCurveTo(-2.4, -0.6, 0, -2.6);
    const lg = keep(new THREE.ExtrudeGeometry(ls, { depth: 0.08, bevelEnabled: false }));
    lg.rotateX(-Math.PI / 2);
    const leaf = new THREE.Mesh(lg, mat('#E0A33A'));
    leaf.position.set(19, SURF + 0.02, -6);
    leaf.rotation.y = 0.9;
    leaf.castShadow = leaf.receiveShadow = true;
    scene.add(leaf);
    const twig = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.16, 0.2, 9, 6)), mat('#7A5234'));
    twig.rotation.set(Math.PI / 2, 0, 1.1);
    twig.position.set(-12, SURF + 0.18, -9);
    twig.castShadow = true;
    scene.add(twig);
    const stem = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.35, 0.45, 2.2, 8)), mat('#F3EBDB'));
    stem.position.set(-21, SURF + 1.1, -11);
    const cap = new THREE.Mesh(keep(new THREE.SphereGeometry(1.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), mat('#D0492E'));
    cap.position.set(-21, SURF + 2.1, -11);
    cap.scale.y = 0.7;
    stem.castShadow = cap.castShadow = true;
    scene.add(stem, cap);
    // pale roots hanging into the top of the face
    for (const x0 of [-22, -5.5, 11, 23]) {
      const pts: THREE.Vector3[] = [];
      let x = x0;
      for (let y = 0; y > -rr(3, 6); y -= 0.6) {
        x += rr(-0.25, 0.25);
        pts.push(new THREE.Vector3(x, y, 0.06));
      }
      scene.add(new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.07, 4)), mat('#E9D9B8')));
    }
  }
  // the entrance: a mound of sandy spoil around the shaft (tap it to send a party), and the alarm ring for raids
  const moundProfile = (d: number) => (d < 0.62 ? -0.05 + 0.85 * THREE.MathUtils.smoothstep(d, 0.3, 0.62) : 0.8 * Math.exp(-(((d - 0.62) / 1.05) ** 2)));
  const moundPts: THREE.Vector2[] = [];
  for (let d = 0.3; d <= 2.8; d += 0.1) moundPts.push(new THREE.Vector2(d * 0.85, moundProfile(d) * 0.95));
  const mound = new THREE.Mesh(keep(new THREE.LatheGeometry(moundPts, 28)), mat('#C8A06A', { roughness: 1 }));
  mound.position.set(SX0, SURF - 0.05, -D / 2 - 0.2);
  mound.castShadow = mound.receiveShadow = true;
  scene.add(mound);
  const spoil = new THREE.Mesh(keep(new THREE.ConeGeometry(1, 1, 12, 3)), mat('#B5653A', { roughness: 1 }));
  spoil.position.set(SX0 + 3.4, SURF, -D / 2 - 1.4);
  spoil.scale.set(1.1, 0.5, 0.9);
  spoil.castShadow = true;
  scene.add(spoil);
  const hole = new THREE.Mesh(keep(new THREE.CircleGeometry(0.3, 14)), mat('#140E0A'));
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(SX0, SURF - 0.02, -D / 2 - 0.2);
  scene.add(hole);
  const alarm = new THREE.Mesh(keep(new THREE.TorusGeometry(2.6, 0.09, 6, 32)), keep(new THREE.MeshBasicMaterial({ color: '#E2685A', transparent: true, opacity: 0 })));
  alarm.rotation.x = Math.PI / 2;
  alarm.position.set(SX0, SURF + 0.15, -D / 2 - 0.2);
  scene.add(alarm);

  // ---------- light and sky ----------
  const hemi = new THREE.HemisphereLight('#E8F2F4', '#6B5238', 1.15);
  const sun = new THREE.DirectionalLight('#FFF1D6', 2.6);
  sun.position.set(-26, 34, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 30, bottom: -40, near: 1, far: 140 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  sun.target.position.set(0, -12, -6);
  scene.add(hemi, sun, sun.target);
  scene.background = new THREE.Color('#A9CFE0');
  const stars = (() => {
    const n = 380, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rr(-1.4, 1.4), r = rr(150, 220);
      p[i * 3] = Math.sin(a) * r;
      p[i * 3 + 1] = rr(-20, 120);
      p[i * 3 + 2] = -Math.cos(a) * r;
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const s = new THREE.Points(g, keep(new THREE.PointsMaterial({ color: '#F3EAD8', size: 1.1, transparent: true, opacity: 0 })));
    scene.add(s);
    return s;
  })();
  const glows: { l: THREE.PointLight; base: number; id: ChamberId }[] = [];
  const GLOW: Partial<Record<ChamberId, [string, number]>> = {
    queen_chamber: ['#FFB36B', 2.5], honeypot_gallery: ['#FFCF5A', 2], leaf_garden: ['#E8F0D0', 1.5],
    pheromone_chamber: ['#C59BFF', 2.5], nectar_cellar: ['#FFCF5A', 1.2],
  };
  let hourShown = -1, nightK = 0;
  function applySky(hour: number) {
    hourShown = hour;
    const s = skyFor(hour);
    nightK = s.night;
    (scene.background as THREE.Color).set(s.sky);
    const L = (a: number, b: number) => a + (b - a) * s.night;
    hemi.color.set('#E8F2F4').lerp(new THREE.Color('#5A6E9A'), s.night);
    hemi.groundColor.set('#6B5238').lerp(new THREE.Color('#3A2C20'), s.night);
    hemi.intensity = L(1.15, 0.8);
    sun.intensity = L(2.6, 0.75);
    sun.color.set('#FFF1D6').lerp(new THREE.Color('#AFC2F0'), s.night);
    (stars.material as THREE.PointsMaterial).opacity = s.night * 0.9;
    // chitin and grass glow warm against the day, cool and faint at night
    antUniforms.uRim.value.setRGB(L(0.55, 0.1), L(0.38, 0.13), L(0.12, 0.3));
    grassU.uRim.value.setRGB(L(0.28, 0.04), L(0.36, 0.07), L(0.05, 0.14));
    grassU.uGlow.value = L(0.22, 0.02);
    backWallMat.emissiveIntensity = L(0.42, 1.25);
    wallMat.emissiveIntensity = L(0.15, 0.6);
    contents.setNight(s.night);
    host.style.background = s.sky;
  }

  // ---------- the real 3D ants ----------
  const plane = keep(new THREE.PlaneGeometry(1, 1));
  // one drawn ant per ant, up to these caps (docs/art/sunlit-microcosm.md, decision 4); the tags give true numbers
  const CAP = coarse ? 0.5 : 1;
  const ants = createAnts(scene, {
    worker: Math.round(900 * CAP), soldier: Math.round(500 * CAP), queen: 2, alate: 8,
    army: Math.round(1300 * CAP), army_major: Math.round(330 * CAP),
  }, !coarse);
  disposables.push(ants);
  const SWARM_CAP = Math.round(1500 * CAP), PARTY_CAP = Math.round(300 * CAP);
  const LOAD: Record<ResourceId, CargoKind> = { foliage: 'leaf', protein: 'chunk', nectar: 'drop' };
  /** What a worker carries down to each store. */
  const STORE: Partial<Record<ChamberId, { kind: CargoKind; color: string }>> = {
    granary: { kind: 'leaf', color: '#8DCB4A' }, leaf_garden: { kind: 'leaf', color: '#A6D83A' },
    larder: { kind: 'chunk', color: '#C4473A' }, hunting_grounds: { kind: 'chunk', color: '#D06A6A' },
    nectar_cellar: { kind: 'drop', color: '#F2B93B' }, honeypot_gallery: { kind: 'drop', color: '#F2B93B' },
    nursery: { kind: 'drop', color: '#FBF6EA' }, brood_hall: { kind: 'drop', color: '#FBF6EA' },
  };
  /** Draw one ant with its feet at p, heading along (dx, dy) in the plane of the face (climbing in the shaft). */
  function antAt(caste: Caste, p: P3, dx: number, dy: number, moving: boolean, o: AntOpts = {}) {
    ants.ant(caste, p.x, p.y, p.z, {
      scale: ANT_LEN[caste], yaw: dx < -0.001 ? Math.PI : 0, pitch: Math.atan2(dy, Math.abs(dx) || 0.0001),
      step: moving && !reduced ? 15 : 0, ...o,
    });
  }

  // ---------- the carved face and everything that depends on the layout ----------
  const frontMat = keep(new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.95 }));
  // the walls of the hollows and tunnels: warm clay, lit a little from inside
  const wallMat = keep(new THREE.MeshStandardMaterial({ color: '#9A5C38', roughness: 1, emissive: '#5A2A0E', emissiveIntensity: 0.15 }));
  // the back walls of the hollows glow with what each chamber holds; brighter at night
  const GLOW_PX = 20;
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = W * GLOW_PX;
  glowCanvas.height = H * GLOW_PX;
  const glowTex = tex(glowCanvas);
  const backWallMat = keep(new THREE.MeshStandardMaterial({ color: '#5A3020', roughness: 1, emissive: '#ffffff', emissiveMap: glowTex, emissiveIntensity: 0.42 }));
  const backWall = new THREE.Mesh(keep(new THREE.PlaneGeometry(W, H)), backWallMat);
  backWall.position.set(0, -H / 2, -D + 0.02);
  backWall.receiveShadow = true;
  scene.add(backWall);
  const GLOW_RGB: Partial<Record<ChamberId, string>> = {
    pheromone_chamber: '185,140,255', nectar_cellar: '255,200,80', honeypot_gallery: '255,200,80', aphid_pasture: '190,230,120',
  };
  function paintGlow(list: Room[]) {
    const g = glowCanvas.getContext('2d')!;
    g.fillStyle = '#000';
    g.fillRect(0, 0, glowCanvas.width, glowCanvas.height);
    for (const r of list) {
      const cx = (r.x + W / 2) * GLOW_PX, cy = -r.y * GLOW_PX, rad = r.rx * GLOW_PX * 1.3;
      const col = GLOW_RGB[r.id] ?? '255,170,80';
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
      gr.addColorStop(0, `rgba(${col},0.95)`);
      gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(cx, cy, rad, rad * 0.7, 0, 0, 7);
      g.fill();
    }
    glowTex.needsUpdate = true;
  }
  const layoutGroup = new THREE.Group();
  scene.add(layoutGroup);
  // what each hollow holds (contents.ts): rebuilt with the layout, kept in step with the colony every frame
  const contents = createContents(scene, coarse);
  const layoutDisposables: { dispose(): void }[] = [];
  let rooms: Room[] = [];
  let queen: Room = room('queen_chamber', 1);
  let taps: THREE.Object3D[] = [];
  let ghosts: Room[] = [];

  interface Walker {
    caste: Caste;
    to: ChamberId | 'guard';
    z: number;
    pts: P3[];
    lens: number[];
    total: number;
    d: number;
    dir: 1 | -1;
    speed: number;
    pause: number;
  }
  let walkers: Walker[] = [];
  const sample = (w: { pts: P3[]; lens: number[] }, d: number) => {
    const { pts, lens } = w;
    let i = 1;
    while (i < lens.length - 1 && lens[i] < d) i++;
    const a = pts[i - 1], b = pts[i];
    const t = Math.max(0, Math.min(1, (d - lens[i - 1]) / ((lens[i] - lens[i - 1]) || 1)));
    return { p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z }, dx: b.x - a.x, dy: b.y - a.y };
  };
  const route = (pts: P3[]) => {
    const lens = [0];
    for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    return { pts, lens, total: lens[lens.length - 1] };
  };
  const guardPath = (z: number) => [{ x: SX0, y: SURF, z }, { x: shaftX(-1), y: -1, z }, { x: shaftX(-2.5), y: -2.5, z }];

  function routeFor(w: Walker) {
    const pts = w.to === 'guard' ? guardPath(w.z) : pathTo(rooms.find((r) => r.id === w.to) ?? queen, queen, SURF, w.z);
    Object.assign(w, route(pts));
    w.d = Math.min(w.d, w.total);
  }

  let layoutKey = '';
  function setLayout(l: Layout) {
    const key = JSON.stringify(l);
    if (key === layoutKey) return;
    layoutKey = key;
    for (const d of layoutDisposables.splice(0)) d.dispose();
    layoutGroup.clear();
    rooms = CHAMBER_IDS.filter((id) => (l.chambers[id] ?? 0) > 0 || id === 'queen_chamber').map((id) => room(id, l.chambers[id] ?? 1));
    queen = rooms.find((r) => r.id === 'queen_chamber')!;
    ghosts = l.unlocked.filter((id) => !(l.chambers[id] ?? 0)).map((id) => room(id, 1));

    // the cut face, with every hollow and tunnel carved through it
    const shape = new THREE.Shape();
    shape.moveTo(-W / 2, -H);
    shape.lineTo(W / 2, -H);
    shape.lineTo(W / 2, 0);
    shape.lineTo(-W / 2, 0);
    shape.lineTo(-W / 2, -H);
    for (const h of carve(rooms)) {
      const p = new THREE.Path();
      p.moveTo(h[0][0], h[0][1]);
      for (const q of h.slice(1)) p.lineTo(q[0], q[1]);
      p.closePath();
      shape.holes.push(p);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: false, curveSegments: 2 });
    geo.translate(0, 0, -D);
    layoutDisposables.push(geo);
    const face = new THREE.Mesh(geo, [frontMat, wallMat]);
    face.castShadow = face.receiveShadow = true;
    layoutGroup.add(face);

    // an invisible disc over each hollow to tap. The 2D chamber pictures no longer hang on the back walls: they
    // have piles and brood drawn in, which would show a full store when it's empty. The 3D contents say it now.
    const hit = new THREE.MeshBasicMaterial({ visible: false });
    layoutDisposables.push(hit);
    taps = [];
    for (const r of rooms) {
      const disc = new THREE.Mesh(plane, hit);
      disc.scale.set(r.rx * 2, r.ry * 2, 1);
      disc.position.set(r.x, r.y, -0.1);
      disc.userData.tap = r.id;
      layoutGroup.add(disc);
      taps.push(disc);
    }
    // chambers you could dig next: a dashed outline scratched on the face
    for (const r of ghosts) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        pts.push(new THREE.Vector3(r.x + Math.cos(a) * r.rx, r.y + Math.sin(a) * r.ry, 0.03));
      }
      const lg = new THREE.BufferGeometry().setFromPoints(pts);
      const lm = new THREE.LineDashedMaterial({ color: '#A08A70', dashSize: 0.35, gapSize: 0.3 });
      layoutDisposables.push(lg, lm);
      const line = new THREE.Line(lg, lm);
      line.computeLineDistances();
      layoutGroup.add(line);
      const disc = new THREE.Mesh(plane, hit);
      disc.scale.set(r.rx * 2, r.ry * 2, 1);
      disc.position.set(r.x, r.y, 0.05);
      disc.userData.tap = r.id;
      layoutGroup.add(disc);
      taps.push(disc);
    }
    taps.push(mound);
    paintGlow(rooms);
    contents.build(rooms, l.chambers);

    // glows in the chambers that have them, brighter at night
    for (const g of glows) scene.remove(g.l);
    glows.length = 0;
    for (const r of rooms) {
      const gl = GLOW[r.id];
      if (!gl) continue;
      const l = new THREE.PointLight(gl[0], gl[1], 9, 2);
      l.position.set(r.x, r.y + 0.3, -0.6);
      scene.add(l);
      glows.push({ l, base: gl[1], id: r.id });
    }

    // walkers: as many as the colony's units allow, spread over the built chambers; soldiers patrol the entrance
    const want = Math.max(6, l.workers), wantSoldiers = l.soldiers;
    const targets = rooms.map((r) => r.id);
    const workers = walkers.filter((w) => w.to !== 'guard'), guards = walkers.filter((w) => w.to === 'guard');
    workers.length = Math.min(workers.length, want);
    guards.length = Math.min(guards.length, wantSoldiers);
    const r2 = seeded(42);
    while (workers.length < want) {
      const z = ZS + (r2() - 0.5) * 1.5;
      workers.push({ caste: 'worker', to: targets[workers.length % targets.length], z, pts: [], lens: [], total: 0, d: 0, dir: r2() < 0.5 ? 1 : -1, speed: 1.6 + r2(), pause: 0 });
      workers[workers.length - 1].d = r2() * 40;
    }
    while (guards.length < wantSoldiers) {
      const z = ZS + (r2() - 0.5) * 1.2;
      guards.push({ caste: 'soldier', to: 'guard', z, pts: [], lens: [], total: 0, d: r2() * 4, dir: 1, speed: 0.6 + r2() * 0.4, pause: 0 });
    }
    walkers = [...workers, ...guards];
    for (const w of walkers) {
      if (w.to !== 'guard' && !targets.includes(w.to)) w.to = targets[Math.floor(r2() * targets.length)];
      routeFor(w);
    }
  }

  // ---------- labels (HTML over the canvas) ----------
  const labelEls = new Map<string, HTMLDivElement>();
  const seen = new Set<string>();
  const v = new THREE.Vector3();
  function label(key: string, cls: string, x: number, y: number, z: number, html: string) {
    let el = labelEls.get(key);
    if (!el) {
      el = document.createElement('div');
      labelsEl.appendChild(el);
      labelEls.set(key, el);
    }
    seen.add(key);
    v.set(x, y, z).project(camera);
    const ok = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
    // display, not `hidden`: the label classes set display, which would win over the hidden attribute
    el.style.display = ok ? '' : 'none';
    if (!ok) return;
    el.className = cls;
    el.style.left = `${((v.x + 1) / 2) * host.clientWidth}px`;
    el.style.top = `${((1 - v.y) / 2) * host.clientHeight}px`;
    if (el.innerHTML !== html) el.innerHTML = html;
  }
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

  // ---------- surface parties and diggers (from the server's missions, incoming and build job) ----------
  // A party is drawn at its real size up to a cap: a column a few ants wide that streams on and off the
  // block's edges; an army-ant swarm is a wide, jostling river. The label gives the true number.
  let clock = 0;
  const hash = (i: number, k: number) => {
    const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const scoutColor = '#D9705F';

  function drawParties(d: NestData) {
    const c = d.colony, st = d.state;
    let raid = false;
    if (!c || !st) {
      alarm.material.opacity = 0;
      return;
    }
    for (const p of surfaceParties(W, SX0 + W / 2, c, st, d.now) as SurfaceParty[]) {
      const swarm = p.type === 'swarm';
      const n = Math.min(swarm ? SWARM_CAP : PARTY_CAP, Math.max(p.n, p.units));
      // other colonies' soldiers are raider red; army ants keep their own crimson
      const color = swarm ? undefined : p.kind === 'raid' ? CHITIN.raider : p.kind === 'scout' ? scoutColor : undefined;
      // the 2D nest starts parties just off its edges; here they enter and leave at the block's edges
      const x0 = ((p.x - W / 2) * (W / 2 - 0.6)) / (W / 2 + 8);
      const loads = p.cargo ? (Object.keys(CARGO) as ResourceId[]).filter((r) => (p.cargo![r] ?? 0) > 0) : [];
      const lanes = Math.min(swarm ? 7 : 4, Math.max(1, Math.round(Math.sqrt(n / (swarm ? 6 : 12)))));
      const gapX = swarm ? 0.5 : 0.8, gapZ = swarm ? 0.42 : 0.5;
      const z0 = -D / 2 - 0.3 - (p.lane % 3) * 1.1;
      const yaw = p.heading < 0 ? Math.PI : 0;
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / lanes), lane = i % lanes;
        // a little jostle: no two ants in step, swarms weave more
        const wob = reduced ? 0 : Math.sin(clock * (swarm ? 3.1 : 1.7) + i * 1.37) * (swarm ? 0.18 : 0.07);
        const x = x0 - p.heading * (row * gapX + hash(i, 1) * gapX * 0.6);
        if (Math.abs(x) > W / 2 - 0.3) continue;
        const z = z0 - lane * gapZ - hash(i, 2) * 0.2 + wob;
        const cargo = loads.length ? { kind: LOAD[loads[i % loads.length]], color: CARGO[loads[i % loads.length]] } : null;
        const caste = partyCaste(p, i);
        ants.ant(caste, x, SURF, z, { scale: ANT_LEN[caste], yaw: yaw + wob * 0.8, step: reduced ? 0 : swarm ? 19 : 15, color, cargo });
      }
      if (p.kind === 'raid') raid = true;
      label(`party-${p.key}`, `nest-trip n3-trip ${p.kind}`, x0, SURF + 1.6, z0,
        `${esc(partyLabel(p))} · ${p.units.toLocaleString()} · ${fmtDuration(p.endAt - d.now)}`);
    }
    alarm.material.opacity = raid ? (reduced ? 0.7 : 0.45 + 0.4 * Math.sin(clock * 7)) : 0;
  }

  function drawDiggers(d: NestData) {
    const job = d.colony?.buildJob;
    const r = job ? rooms.find((x) => x.id === job.chamber) : null;
    if (!r) return;
    for (let i = 0; i < 4; i++) {
      // diggers work along the far wall of the hollow, nose to the soil, taking turns
      const a = Math.PI * (0.2 + i * 0.2);
      const p = { x: r.x + Math.cos(a) * r.rx * 0.82, y: r.y + Math.sin(a) * r.ry * 0.7 - 0.35, z: ZS + (i - 1.5) * 0.45 };
      const busy = reduced ? false : Math.sin(clock * 4 + i * 1.7) > -0.3;
      antAt('worker', p, Math.cos(a), Math.sin(a), busy, { cargo: i % 2 ? { kind: 'chunk', color: '#B5653A' } : null });
    }
  }

  // ---------- camera: a gentle orbit, plus zoom toward the cursor (docs/12-ui-nest-view.md, "The 3D slab") ----------
  const home = new THREE.Vector3(0, -13.5, -3);
  const target = home.clone();
  // zoom (1 = whole block) and how far the view has moved across the face of the block, eased toward their goals
  const zm = { z: 1, x: 0, y: 0 }, zGoal = { z: 1, x: 0, y: 0 };
  const view = { yaw: 0.3, pitch: 0.16 }, goal = { ...view };
  let dist = 80;
  let inset: Inset = { left: 0, right: 0, top: 0, bottom: 0 };
  function fit() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    // frame the block in the part of the view the cards leave free, then widen the picture back out to the whole canvas
    const fw = Math.max(200, w - inset.left - inset.right), fh = Math.max(200, h - inset.top - inset.bottom);
    camera.aspect = fw / fh;
    if (inset.left || inset.right || inset.top || inset.bottom) camera.setViewOffset(fw, fh, -inset.left, -inset.top, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // whole block in view: its width (plus a margin) or its height, whichever needs more room
    dist = Math.max((W / 2 + 5) / (halfH * camera.aspect), (H / 2 + 4) / halfH) * 1.02;
  }
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  fit();
  function placeCamera() {
    const cp = Math.cos(view.pitch);
    target.set(home.x + zm.x, home.y + zm.y, home.z);
    const dd = dist / zm.z;
    camera.position.set(target.x + dd * cp * Math.sin(view.yaw), target.y + dd * Math.sin(view.pitch), target.z + dd * cp * Math.cos(view.yaw));
    camera.lookAt(target);
  }

  // pointer: drag sideways to turn, up and down (mouse) to tilt a little; tap a chamber or the entrance
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let drag: { x: number; y: number; sx: number; sy: number; t: number } | null = null;
  const pickAt = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(taps, false)[0]?.object ?? null;
  };
  // keep a zoomed view over the block: the further in, the further it may move from the middle
  const clampPan = () => {
    const k = 1 - 1 / zGoal.z;
    zGoal.x = THREE.MathUtils.clamp(zGoal.x, -(W / 2) * k, (W / 2) * k);
    zGoal.y = THREE.MathUtils.clamp(zGoal.y, -(H / 2) * k, (H / 2) * k);
  };
  let zoomShown = 1;
  const api: { onZoom?: (z: number) => void } = {};
  /** Zoom by `f`, keeping the point of the face under (cx, cy) (CSS pixels in the canvas) where it is. */
  const face = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
  function zoomAt(f: number, cx: number, cy: number) {
    const z = THREE.MathUtils.clamp(zGoal.z * f, 1, MAX_ZOOM);
    if (z === zGoal.z) return;
    ndc.set((cx / host.clientWidth) * 2 - 1, -(cy / host.clientHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(face, hit)) {
      const k = 1 - zGoal.z / z;
      zGoal.x += (hit.x - (home.x + zGoal.x)) * k;
      zGoal.y += (hit.y - (home.y + zGoal.y)) * k;
    }
    zGoal.z = z;
    if (z === 1) Object.assign(zGoal, { x: 0, y: 0 });
    clampPan();
  }
  // world units per CSS pixel on the face of the block, at the zoom we're heading to
  const unitsPerPx = () => (2 * (dist / zGoal.z) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / Math.max(200, host.clientHeight - inset.top - inset.bottom);
  const onWheel = (e: WheelEvent) => {
    // only where the nest fills the screen; elsewhere the wheel scrolls the page as usual
    if (!host.classList.contains('fill')) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    // trackpad pinches arrive as ctrl+wheel with small steps
    zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
    if (reduced) step(0);
  };
  canvas.addEventListener('wheel', onWheel, { passive: false });

  const onDown = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() };
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) {
      if (e.pointerType === 'mouse') canvas.classList.toggle('pointing', !!pickAt(e));
      return;
    }
    if (zGoal.z > 1.02) {
      // zoomed in: dragging moves around the nest
      const u = unitsPerPx();
      zGoal.x -= (e.clientX - drag.x) * u;
      zGoal.y += (e.clientY - drag.y) * u;
      clampPan();
    } else {
      goal.yaw = THREE.MathUtils.clamp(goal.yaw - (e.clientX - drag.x) * 0.004, -0.5, 0.75);
      if (e.pointerType === 'mouse') goal.pitch = THREE.MathUtils.clamp(goal.pitch + (e.clientY - drag.y) * 0.003, 0.04, 0.36);
    }
    drag.x = e.clientX;
    drag.y = e.clientY;
  };
  const onUp = (e: PointerEvent) => {
    if (drag && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8 && performance.now() - drag.t < 500) {
      const o = pickAt(e);
      if (o === mound) cb.onEntrance();
      else if (o?.userData.tap) cb.onChamber(o.userData.tap as ChamberId);
    }
    drag = null;
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', () => (drag = null));
  const resetView = () => {
    Object.assign(goal, { yaw: 0.3, pitch: 0.16 });
    Object.assign(zGoal, { z: 1, x: 0, y: 0 });
  };
  const onDbl = resetView;
  canvas.addEventListener('dblclick', onDbl);

  // ---------- loop ----------
  let visible = true;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
  io.observe(host);
  let raf = 0, last = performance.now(), sinceStill = 1;
  function step(dt: number) {
    const d = get();
    seen.clear();
    const mdt = reduced ? 0 : dt;
    clock += mdt;
    const hour = new Date(d.now).getHours();
    if (hour !== hourShown) applySky(hour);
    view.yaw += (goal.yaw - view.yaw) * Math.min(1, dt * 8);
    view.pitch += (goal.pitch - view.pitch) * Math.min(1, dt * 8);
    const ease = reduced ? 1 : Math.min(1, dt * 10);
    zm.z += (zGoal.z - zm.z) * ease;
    zm.x += (zGoal.x - zm.x) * ease;
    zm.y += (zGoal.y - zm.y) * ease;
    const zr = Math.round(zGoal.z * 100) / 100;
    if (zr !== zoomShown) {
      zoomShown = zr;
      api.onZoom?.(zr);
    }
    placeCamera();

    antUniforms.uTime.value = clock;
    grassU.uTime.value = clock;
    ants.begin();
    for (const w of walkers) {
      if (w.pause > 0) w.pause -= mdt;
      else {
        w.d += w.dir * w.speed * mdt;
        if (w.d >= w.total) { w.d = w.total; w.dir = -1; w.pause = w.to === 'guard' ? 0.5 : 0.6 + Math.random() * 1.6; }
        if (w.d <= 0) { w.d = 0; w.dir = 1; w.pause = w.to === 'guard' ? 0.5 : 0.3; }
      }
      const s = sample(w, w.d);
      // workers carry food down to the stores and come back up empty
      const load = w.to !== 'guard' && w.dir === 1 ? STORE[w.to] ?? null : null;
      antAt(w.caste, s.p, s.dx * w.dir, s.dy * w.dir, w.pause <= 0, { cargo: load });
    }
    drawParties(d);
    drawDiggers(d);
    ants.end();
    const researching = !!d.state?.player.researchJob;
    contents.update(d.colony, researching, clock);
    for (const g of glows) {
      const pulse = g.id === 'pheromone_chamber' && researching && !reduced ? 1 + 0.6 * Math.sin(clock * 3) : 1;
      g.l.intensity = g.base * (1 + nightK * 5) * pulse * (g.id === 'pheromone_chamber' && !researching ? 0.4 : 1);
    }

    // chamber names, levels and what they're busy with
    if (d.colony) {
      for (const r of [...rooms, ...ghosts]) {
        const level = lvl(d.colony.chambers, r.id);
        const tag = chamberTag(d.colony, d.state, d.now, r.id, level);
        const name = SHORT[r.id] ?? CHAMBERS[r.id].name;
        label(`room-${r.id}`, `n3-label${level ? '' : ' ghost'}`, r.x, r.y + r.ry + 0.2, 0.05,
          `<span>${esc(name)}${level ? ` ${level}` : ''}</span>${tag ? `<span class="nest-tag ${tag.tone}">${esc(tag.text)}</span>` : ''}`);
      }
    }
    dropUnseenLabels();
    renderer.render(scene, camera);
  }
  // labels that weren't drawn this frame go away
  function dropUnseenLabels() {
    for (const [k, el] of labelEls) if (!seen.has(k)) { el.remove(); labelEls.delete(k); }
  }
  function frame(t: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (!visible || document.hidden) return;
    if (reduced) {
      // still: draw about once a second so timers and labels stay current
      sinceStill += dt;
      if (sinceStill < 1) return;
      sinceStill = 0;
    }
    step(dt);
  }
  raf = requestAnimationFrame(frame);

  const pv = new THREE.Vector3();
  const toScreen = (x: number, y: number) => {
    pv.set(x, y, 0.05).project(camera);
    return { x: ((pv.x + 1) / 2) * host.clientWidth, y: ((1 - pv.y) / 2) * host.clientHeight };
  };

  const still = () => reduced && step(0);
  const out: NestScene = {
    setLayout,
    zoomBy(f: number) {
      zoomAt(f, inset.left + (host.clientWidth - inset.left - inset.right) / 2, inset.top + (host.clientHeight - inset.top - inset.bottom) / 2);
      still();
    },
    resetView() {
      resetView();
      still();
    },
    setOnZoom(fn: (z: number) => void) {
      api.onZoom = fn;
    },
    setReduced(r: boolean) {
      reduced = r;
    },
    setInset(i: Inset) {
      inset = i;
      fit();
      if (reduced) step(0);
    },
    where(id: ChamberId) {
      const r = rooms.find((x) => x.id === id) ?? ghosts.find((x) => x.id === id);
      if (!r) return null;
      const c = toScreen(r.x, r.y);
      return { ...c, rx: Math.abs(toScreen(r.x + r.rx, r.y).x - c.x) };
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('dblclick', onDbl);
      canvas.removeEventListener('wheel', onWheel);
      for (const el of labelEls.values()) el.remove();
      contents.dispose();
      for (const d of [...layoutDisposables, ...disposables]) d.dispose();
      for (const g of glows) g.l.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
  return out;
}

