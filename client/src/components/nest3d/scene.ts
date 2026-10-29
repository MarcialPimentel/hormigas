// The 3D nest (docs/12-ui-nest-view.md, "The 3D slab"; docs/18-art-direction.md): the colony as a block of
// earth cut open at the front, like an ant farm on a plinth. The block, its carved hollows and tunnels are
// real 3D; everything living in it is the game's 2D art on flat cards (chamber art on each hollow's back
// wall, ant sprites walking at slightly different depths), so it reads as a paper diorama you can turn.
// Like the 2D nest, it only shows what the server says; nothing here decides anything.
import * as THREE from 'three';
import { CHAMBERS, CHAMBER_IDS, lvl, type ChamberId, type ResourceId } from '@hormigas/shared';
import type { ServerColony, ServerState } from '../../game';
import { CASTES, FOOT_Y, WALK_SWINGS, type Caste } from '../../art/ants';
import { HOLLOW, VIEW } from '../../art/chambers';
import { loadCanvases as antCanvases, walkFrame } from '../antSprites';
import { loadCanvases as roomCanvases } from '../chamberSprites';
import { partyCaste, surfaceParties, type SurfaceParty } from '../nestScene';
import { chamberTag, partyLabel } from '../nestInfo';
import { fmtDuration } from '../../format';
import { BACK, D, H, SHAFT_HW, W, ZS, carve, floorAt, pathTo, room, shaftX, type P3, type Room } from './slab';

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
export interface NestScene {
  setLayout(l: Layout): void;
  setReduced(r: boolean): void;
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
  const [antPics, roomPics] = await Promise.all([antCanvases(), roomCanvases()]);
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

  // ---------- the block: back, plinth, surface ----------
  {
    const side = mat('#4A3727'), top = mat('#5A4330'), hollow = mat('#1C140E');
    const back = new THREE.Mesh(keep(new THREE.BoxGeometry(W, H, BACK)), [side, side, top, side, hollow, side]);
    back.position.set(0, -H / 2, -D - BACK / 2);
    back.receiveShadow = back.castShadow = true;
    scene.add(back);
    box(W + 5, 1.6, D + BACK + 5, mat('#3A2A1C'), 0, -H - 0.8, -(D + BACK) / 2).receiveShadow = true;
    box(W + 6, 0.5, D + BACK + 6, mat('#2E2116'), 0, -H - 1.85, -(D + BACK) / 2);
    const g = mat('#6F9A3E');
    const lw = SX0 - SHAFT_HW - 0.2 + W / 2;
    box(lw, SURF, D, g, -W / 2 + lw / 2, SURF / 2, -D / 2).receiveShadow = true;
    const rw = W / 2 - (SX0 + SHAFT_HW + 0.2);
    box(rw, SURF, D, g, W / 2 - rw / 2, SURF / 2, -D / 2).receiveShadow = true;
    box(W, SURF, BACK, g, 0, SURF / 2, -D - BACK / 2).receiveShadow = true;
    // grass blades in one batch
    const blade = keep(new THREE.ConeGeometry(0.07, 1, 3));
    blade.translate(0, 0.5, 0);
    const n = 650;
    const inst = new THREE.InstancedMesh(blade, keep(new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true })), n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), cl = new THREE.Color();
    for (let i = 0; i < n; i++) {
      let x = rr(-W / 2 + 0.3, W / 2 - 0.3);
      const z = rr(-D - BACK + 0.3, -0.2);
      if (Math.abs(x - SX0) < 2.6 && z > -4.5) x += x > SX0 ? 2.6 : -2.6;
      e.set(rr(-0.25, 0.25), rnd() * 3, rr(-0.25, 0.25));
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(x, SURF, z), q, new THREE.Vector3(1, rr(0.35, 0.95), 1));
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, cl.set(pick(['#7FAA48', '#6F9A3E', '#8DB255', '#5E8735', '#A3BE5C'])));
    }
    inst.castShadow = true;
    scene.add(inst);
    const stone = keep(new THREE.IcosahedronGeometry(1, 0));
    for (let i = 0; i < 26; i++) {
      const p = new THREE.Mesh(stone, mat(pick(['#9C8B78', '#7F7060', '#B5A48E'])));
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
    const leaf = new THREE.Mesh(lg, mat('#9BBF54'));
    leaf.position.set(19, SURF + 0.02, -6);
    leaf.rotation.y = 0.9;
    leaf.castShadow = leaf.receiveShadow = true;
    scene.add(leaf);
    const twig = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.16, 0.2, 9, 6)), mat('#6E4A2C'));
    twig.rotation.set(Math.PI / 2, 0, 1.1);
    twig.position.set(-12, SURF + 0.18, -9);
    twig.castShadow = true;
    scene.add(twig);
    const stem = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.35, 0.45, 2.2, 8)), mat('#EDE3CF'));
    stem.position.set(-21, SURF + 1.1, -11);
    const cap = new THREE.Mesh(keep(new THREE.SphereGeometry(1.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), mat('#B0503A'));
    cap.position.set(-21, SURF + 2.1, -11);
    cap.scale.y = 0.7;
    stem.castShadow = cap.castShadow = true;
    scene.add(stem, cap);
    // roots hanging into the top of the face
    for (const x0 of [-22, -5.5, 11, 23]) {
      const pts: THREE.Vector3[] = [];
      let x = x0;
      for (let y = 0; y > -rr(3, 6); y -= 0.6) {
        x += rr(-0.25, 0.25);
        pts.push(new THREE.Vector3(x, y, 0.06));
      }
      scene.add(new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.07, 4)), mat('#7A5A3A')));
    }
  }
  // the entrance: a ring of spoil around the shaft (tap it to send a party), and the alarm ring for raids
  const mound = new THREE.Mesh(keep(new THREE.TorusGeometry(1.25, 0.55, 6, 14)), mat('#7A5C40'));
  mound.rotation.x = Math.PI / 2;
  mound.scale.z = 0.9;
  mound.position.set(SX0, SURF + 0.05, -D / 2 - 0.2);
  mound.castShadow = true;
  scene.add(mound);
  const hole = new THREE.Mesh(keep(new THREE.CircleGeometry(0.8, 14)), mat('#140E0A'));
  hole.rotation.x = -Math.PI / 2;
  hole.position.set(SX0, SURF + 0.02, -D / 2 - 0.2);
  scene.add(hole);
  const alarm = new THREE.Mesh(keep(new THREE.TorusGeometry(2.2, 0.09, 6, 32)), keep(new THREE.MeshBasicMaterial({ color: '#E2685A', transparent: true, opacity: 0 })));
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
    host.style.background = s.sky;
  }

  // ---------- art: chamber pictures and ant cards from the 2D art set ----------
  const roomTex = {} as Record<ChamberId, THREE.CanvasTexture>;
  for (const id of CHAMBER_IDS) roomTex[id] = tex(roomPics[id]);
  const plane = keep(new THREE.PlaneGeometry(1, 1));
  const antGeo = {} as Record<Caste, THREE.PlaneGeometry>;
  const antMats = new Map<string, THREE.MeshLambertMaterial>();
  for (const c of Object.keys(CASTES) as Caste[]) {
    const [, vy, vw, vh] = CASTES[c].vb;
    const g = keep(new THREE.PlaneGeometry(1, vh / vw));
    g.translate(0, (vh / vw) * (0.5 - (FOOT_Y - vy) / vh), 0); // origin under the feet
    antGeo[c] = g;
  }
  const antFrames = {} as Record<Caste, THREE.CanvasTexture[]>;
  for (const c of Object.keys(CASTES) as Caste[]) antFrames[c] = antPics[c].map(tex);
  const antMat = (c: Caste, frame: number, tint: string) => {
    const key = `${c}|${frame}|${tint}`;
    if (!antMats.has(key)) antMats.set(key, keep(new THREE.MeshLambertMaterial({ map: antFrames[c][frame], color: tint, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide })));
    return antMats.get(key)!;
  };

  interface Card {
    mesh: THREE.Mesh;
    caste: Caste;
    tint: string;
    load: THREE.Mesh | null;
  }
  const cardGroup = new THREE.Group();
  scene.add(cardGroup);
  function makeCard(caste: Caste, tint = '#FFFFFF'): Card {
    const mesh = new THREE.Mesh(antGeo[caste], antMat(caste, 1, tint));
    cardGroup.add(mesh);
    return { mesh, caste, tint, load: null };
  }
  function dropCard(c: Card) {
    cardGroup.remove(c.mesh);
  }
  /** Place a card with its feet at p, heading along (dx, dy) in the plane of the face; left-goers are mirrored, not flipped. */
  function placeCard(c: Card, p: P3, dx: number, dy: number, frame: number) {
    const len = ANT_LEN[c.caste];
    const left = dx < -0.001;
    c.mesh.position.set(p.x, p.y, p.z);
    c.mesh.rotation.set(0, 0, left ? Math.atan2(-dy, -dx) : Math.atan2(dy, dx));
    c.mesh.scale.set(left ? -len : len, len, 1);
    c.mesh.material = antMat(c.caste, frame % WALK_SWINGS.length, c.tint);
    c.mesh.visible = true;
  }
  function setLoad(c: Card, color: string | null) {
    if (!color) {
      if (c.load) c.load.visible = false;
      return;
    }
    if (!c.load) {
      c.load = new THREE.Mesh(plane, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
      c.load.scale.set(0.24, 0.16, 1);
      c.load.position.set(0.5, 0.28, 0.01);
      c.mesh.add(c.load);
    }
    (c.load.material as THREE.MeshLambertMaterial).color.set(color);
    c.load.visible = true;
  }

  // ---------- the carved face and everything that depends on the layout ----------
  const frontMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
  const sideMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, color: '#8F8274' }));
  const strata = (y: number) => {
    const t = Math.min(1, -y / H);
    const a = new THREE.Color('#6B4F37'), b = new THREE.Color('#4A3726'), c = new THREE.Color('#33261A');
    const col = t < 0.45 ? a.lerp(b, t / 0.45) : b.lerp(c, (t - 0.45) / 0.55);
    return col.multiplyScalar(1 + 0.07 * Math.sin(y * 1.9) + 0.04 * Math.sin(y * 5.3 + 1));
  };
  const layoutGroup = new THREE.Group();
  scene.add(layoutGroup);
  const layoutDisposables: { dispose(): void }[] = [];
  let rooms: Room[] = [];
  let queen: Room = room('queen_chamber', 1);
  let taps: THREE.Object3D[] = [];
  let ghosts: Room[] = [];

  interface Walker {
    card: Card;
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
    const pos = geo.attributes.position, cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const c = strata(pos.getY(i));
      cols.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    layoutDisposables.push(geo);
    const face = new THREE.Mesh(geo, [frontMat, sideMat]);
    face.castShadow = face.receiveShadow = true;
    layoutGroup.add(face);

    // each chamber's own art on the back wall of its hollow, and an invisible disc to tap
    const hit = new THREE.MeshBasicMaterial({ visible: false });
    layoutDisposables.push(hit);
    taps = [];
    for (const r of rooms) {
      const sx = r.rx / HOLLOW.rx, sy = r.ry / HOLLOW.ry;
      const art = new THREE.Mesh(plane, new THREE.MeshLambertMaterial({ map: roomTex[r.id], transparent: true, alphaTest: 0.05 }));
      layoutDisposables.push(art.material as THREE.Material);
      art.scale.set(VIEW.w * sx, VIEW.h * sy, 1);
      art.position.set(r.x - (HOLLOW.cx - VIEW.w / 2) * sx, r.y + (HOLLOW.cy - VIEW.h / 2) * sy, -D + 0.03);
      art.receiveShadow = true;
      layoutGroup.add(art);
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
    while (workers.length > want) dropCard(workers.pop()!.card);
    while (guards.length > wantSoldiers) dropCard(guards.pop()!.card);
    const r2 = seeded(42);
    while (workers.length < want) {
      const z = ZS + (r2() - 0.5) * 0.9;
      workers.push({ card: makeCard('worker'), to: targets[workers.length % targets.length], z, pts: [], lens: [], total: 0, d: 0, dir: r2() < 0.5 ? 1 : -1, speed: 1.6 + r2(), pause: 0 });
      workers[workers.length - 1].d = r2() * 40;
    }
    while (guards.length < wantSoldiers) {
      const z = ZS + (r2() - 0.5) * 0.9;
      guards.push({ card: makeCard('soldier'), to: 'guard', z, pts: [], lens: [], total: 0, d: r2() * 4, dir: 1, speed: 0.6 + r2() * 0.4, pause: 0 });
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
    el.hidden = !ok;
    if (!ok) return;
    el.className = cls;
    el.style.left = `${((v.x + 1) / 2) * host.clientWidth}px`;
    el.style.top = `${((1 - v.y) / 2) * host.clientHeight}px`;
    if (el.innerHTML !== html) el.innerHTML = html;
  }
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

  // ---------- surface parties and diggers (from the server's missions, incoming and build job) ----------
  const partyCards = new Map<string, Card[]>();
  const diggerCards: Card[] = [];
  let clock = 0;

  function drawParties(d: NestData) {
    const c = d.colony, st = d.state;
    const live = new Set<string>();
    let raid = false;
    if (c && st) {
      for (const p of surfaceParties(W, SX0 + W / 2, c, st, d.now) as SurfaceParty[]) {
        live.add(p.key);
        // army ants are drawn red already; other colonies' soldiers and scouts are tinted
        const tint = p.type === 'swarm' ? '#FFFFFF' : p.kind === 'raid' ? '#FF7A68' : p.kind === 'scout' ? '#FFB7AA' : '#FFFFFF';
        let cards = partyCards.get(p.key);
        if (!cards || cards.length !== p.n || cards[0].tint !== tint) {
          cards?.forEach(dropCard);
          cards = Array.from({ length: p.n }, (_, i) => makeCard(partyCaste(p, i), tint));
          partyCards.set(p.key, cards);
        }
        // the 2D nest starts parties just off its edges; here they enter and leave at the block's edges
        const x0 = ((p.x - W / 2) * (W / 2 - 0.6)) / (W / 2 + 8);
        const loads = p.cargo ? (Object.keys(CARGO) as ResourceId[]).filter((r) => (p.cargo![r] ?? 0) > 0).map((r) => CARGO[r]) : [];
        const z = -D / 2 - 0.4 - (p.lane % 3) * 0.7;
        cards.forEach((card, i) => {
          const x = x0 - p.heading * i * (p.type === 'swarm' ? 0.95 : 1.15);
          const frame = reduced ? 1 : Math.floor(clock * 9) + i * 2;
          placeCard(card, { x, y: SURF, z }, p.heading, 0, frame);
          card.mesh.visible = Math.abs(x) < W / 2 - 0.2;
          setLoad(card, loads.length ? loads[i % loads.length] : null);
        });
        if (p.kind === 'raid') raid = true;
        label(`party-${p.key}`, `nest-trip n3-trip ${p.kind}`, x0, SURF + 1.6, z, `${esc(partyLabel(p))} · ${fmtDuration(p.endAt - d.now)}`);
      }
    }
    for (const [k, cards] of partyCards) if (!live.has(k)) { cards.forEach(dropCard); partyCards.delete(k); }
    alarm.material.opacity = raid ? (reduced ? 0.7 : 0.45 + 0.4 * Math.sin(clock * 7)) : 0;
  }

  function drawDiggers(d: NestData) {
    const job = d.colony?.buildJob;
    const r = job ? rooms.find((x) => x.id === job.chamber) : null;
    const want = r ? 3 : 0;
    while (diggerCards.length > want) dropCard(diggerCards.pop()!);
    while (diggerCards.length < want) diggerCards.push(makeCard('worker'));
    if (!r) return;
    diggerCards.forEach((card, i) => {
      const a = Math.PI * (0.25 + i * 0.25);
      const p = { x: r.x + Math.cos(a) * r.rx * 0.82, y: r.y + Math.sin(a) * r.ry * 0.7 - 0.35, z: ZS + (i - 1) * 0.35 };
      placeCard(card, p, Math.cos(a), Math.sin(a), reduced ? 1 : Math.floor(clock * 8) + i);
    });
  }

  // ---------- camera: a gentle orbit, no zoom ----------
  const target = new THREE.Vector3(0, -13.5, -3);
  const view = { yaw: 0.3, pitch: 0.16 }, goal = { ...view };
  let dist = 80;
  function fit() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
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
    camera.position.set(target.x + dist * cp * Math.sin(view.yaw), target.y + dist * Math.sin(view.pitch), target.z + dist * cp * Math.cos(view.yaw));
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
  const onDown = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() };
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) {
      if (e.pointerType === 'mouse') canvas.classList.toggle('pointing', !!pickAt(e));
      return;
    }
    goal.yaw = THREE.MathUtils.clamp(goal.yaw - (e.clientX - drag.x) * 0.004, -0.5, 0.75);
    if (e.pointerType === 'mouse') goal.pitch = THREE.MathUtils.clamp(goal.pitch + (e.clientY - drag.y) * 0.003, 0.04, 0.36);
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
  const onDbl = () => Object.assign(goal, { yaw: 0.3, pitch: 0.16 });
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
    placeCamera();

    for (const w of walkers) {
      if (w.pause > 0) w.pause -= mdt;
      else {
        w.d += w.dir * w.speed * mdt;
        if (w.d >= w.total) { w.d = w.total; w.dir = -1; w.pause = w.to === 'guard' ? 0.5 : 0.6 + Math.random() * 1.6; }
        if (w.d <= 0) { w.d = 0; w.dir = 1; w.pause = w.to === 'guard' ? 0.5 : 0.3; }
      }
      const s = sample(w, w.d);
      placeCard(w.card, s.p, s.dx * w.dir, s.dy * w.dir, reduced || w.pause > 0 ? 1 : walkFrame(w.d, 1));
    }
    drawParties(d);
    drawDiggers(d);
    const researching = !!d.state?.player.researchJob;
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

  return {
    setLayout,
    setReduced(r: boolean) {
      reduced = r;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('dblclick', onDbl);
      for (const el of labelEls.values()) el.remove();
      for (const d of [...layoutDisposables, ...disposables]) d.dispose();
      for (const g of glows) g.l.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}

