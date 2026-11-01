// The Whole Yard: one map from the yard down to the nest. Semantic zoom like Civilization's map: far out the
// patches are hex tiles with scent borders, mist and banners; closer in the hex lines fade and the ground turns
// into the garden; at the bottom the camera sits among the ants. Double-click your mound to dive into the nest.
// Units: 1 = 1 cm. Your home patch is at the origin. Everything here is fake data; the real game's server decides.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';

const MOUNDS = __MOUNDS__;
const $ = (s) => document.querySelector(s);
const stageEl = $('#stage');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

// ---------- helpers
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(42);
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const mats = new Map();
function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, ...o }));
  return mats.get(key);
}
const tweens = [];
function tween(dur, fn, done) { tweens.push({ t: 0, dur: reduced ? Math.min(dur, 0.25) : dur, fn, done }); }

// ---------- renderer
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  $('#fallback').textContent = 'This mock-up needs WebGL, which this browser has turned off.';
  throw e;
}
$('#fallback').remove();
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const canvas = renderer.domElement;
canvas.setAttribute('aria-label', 'A back garden seen from above as a map of hex patches: ant colonies on mounds with banners, scent borders in honey and teal, mist over unexplored ground, and columns of ants on scent trails.');
canvas.setAttribute('role', 'img');
stageEl.prepend(canvas);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 1, 10000);
const hemi = new THREE.HemisphereLight('#EAF4FF', '#6B5A3A', 1.2);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#FFF1D0', 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
scene.add(sun, sun.target);
scene.fog = new THREE.Fog('#BFDDEB', 3000, 9000);

const world = new THREE.Group();
scene.add(world);

// ---------- the hex world: 5 regions × 100 patches (a patch is about a metre across)
const HR = 50, HW = Math.sqrt(3) * HR, ROW = 1.5 * HR;
const REGIONS = [
  { name: 'The Old Garden', ox: -1950, oz: -1700, color: '#9A7046', alt: '#86603C', kind: 'garden' },
  { name: 'The Backyard', ox: -980, oz: -1700, color: '#86BE4E', alt: '#7AB246', kind: 'lawn' },
  { name: 'The Woodpile', ox: -10, oz: -1700, color: '#8A6A44', alt: '#7D5F3C', kind: 'wood' },
  { name: 'Creekside', ox: -1465, oz: -860, color: '#93B49C', alt: '#86A890', kind: 'creek' },
  { name: 'The Long Grass', ox: -495, oz: -860, color: '#6FA83E', alt: '#629A36', kind: 'grass' },
];
// home: The Long Grass, patch 45 (row 4, col 4). Shift everything so it sits at the origin.
const tiles = [];
const key = (r, p) => r * 1000 + p;
const tileBy = new Map();
for (let r = 0; r < 5; r++) {
  for (let p = 1; p <= 100; p++) {
    const row = Math.floor((p - 1) / 10), col = (p - 1) % 10;
    const x = REGIONS[r].ox + col * HW + (row % 2) * HW / 2, z = REGIONS[r].oz + row * ROW;
    const t = { r, p, row, col, x, z, owner: null, fog: true };
    tiles.push(t);
    tileBy.set(key(r, p), t);
  }
}
const HOME = tileBy.get(key(4, 45));
const shift = new THREE.Vector3(-HOME.x, 0, -HOME.z);
for (const t of tiles) { t.x += shift.x; t.z += shift.z; }
for (const g of REGIONS) { g.cx = g.ox + shift.x + 4.5 * HW; g.cz = g.oz + shift.z + 4.5 * ROW; }
function neighbours(t) {
  const odd = t.row % 2;
  const d = odd ? [[1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [1, 1]] : [[1, 0], [-1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  return d.map(([dc, dr]) => {
    const c = t.col + dc, rr = t.row + dr;
    if (c < 0 || c > 9 || rr < 0 || rr > 9) return null;
    return tileBy.get(key(t.r, rr * 10 + c + 1));
  }).filter(Boolean);
}
const hexDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) / HW;

// explored: around home and along the way to an ally and a rival
// what your scouts and columns have seen: everything near home, the way to the Backyard and the Woodpile, a
// few far patches seen on old raids. The rest of the yard is under mist.
for (const t of tiles) {
  const d = hexDist(t, HOME);
  if (d < 5.2 || (t.r === 1 && t.row > 4 && R() < 0.7) || (t.r === 2 && t.col < 4 && t.row > 3) || R() < 0.12) t.fog = false;
}

// owners: you (honey), an ally (teal), rivals (amber), the wild (red)
const OWN = { you: '#F2B21F', ally: '#2F9C95', rival: '#9A6B45', wild: '#C4473A' };
const at = (dc, dr) => tiles.find((t) => t.r === 4 && t.col === HOME.col + dc && t.row === HOME.row + dr);
HOME.owner = 'you';
const EXPAND = at(1, 0);   // the empty patch your nuptial flight claims
const ALLY = at(2, -1);
const RIVAL = at(-1, 1);
const SCOUTED = at(-2, 2); // under the mist: Scout the mist reveals it
const RIVAL2 = at(3, 1);
ALLY.owner = 'ally'; RIVAL.owner = 'rival'; RIVAL2.owner = 'rival';
SCOUTED.fog = true; for (const n of neighbours(SCOUTED)) if (n !== RIVAL && hexDist(n, HOME) > 1.5) n.fog = true;
const ALLY2 = at(3, -1); ALLY2.owner = 'ally'; ALLY2.fog = false;
// far colonies (seen only as lights and banners at yard scale)
const far = [];
for (const t of tiles) if (t.fog && R() < 0.05) { t.owner = t.owner ?? 'rival'; far.push(t); }

// tiles: one instanced prism; colour per region with a little variation
const hexGeo = new THREE.CylinderGeometry(HR, HR, 8, 6).translate(0, -4, 0);
const tileMesh = new THREE.InstancedMesh(hexGeo, new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95 }), tiles.length);
tileMesh.receiveShadow = true;
const m4 = new THREE.Matrix4(), col = new THREE.Color();
tiles.forEach((t, i) => {
  m4.makeTranslation(t.x, 0, t.z);
  tileMesh.setMatrixAt(i, m4);
  col.set(R() < 0.5 ? REGIONS[t.r].color : REGIONS[t.r].alt).offsetHSL(0, 0, (R() - 0.5) * 0.04);
  tileMesh.setColorAt(i, col);
});
world.add(tileMesh);

// the ground between regions: gravel paths, the house wall and patio behind, a fence down both sides
const X0 = REGIONS[0].ox + shift.x - 120, X1 = REGIONS[2].ox + shift.x + 10 * HW + 120;
const ZB = REGIONS[0].oz + shift.z - 140, ZF = REGIONS[3].oz + shift.z + 10 * ROW + 160;
const groundMat = mat('#C9B48E');
const under = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0 + 600, ZF - ZB + 900), groundMat);
under.rotation.x = -Math.PI / 2; under.position.set((X0 + X1) / 2, -2.5, (ZB + ZF) / 2 - 150); under.receiveShadow = true;
world.add(under);
const house = new THREE.Group();
const wall = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0 + 600, 900, 120), mat('#E6D3B3'));
wall.position.set((X0 + X1) / 2, 450, ZB - 420);
const sill = new THREE.Mesh(new THREE.BoxGeometry(X1 - X0 + 600, 30, 180), mat('#B9A27E'));
sill.position.set(wall.position.x, 30, wall.position.z + 40);
house.add(wall, sill);
for (let j = 0; j < 12; j++) {
  const sl = new THREE.Mesh(new THREE.BoxGeometry(290, 6, 280), mat(j % 2 ? '#C7B9A3' : '#BCAE97'));
  sl.position.set(X0 - 200 + j * 300, 2, ZB - 210);
  sl.receiveShadow = true;
  house.add(sl);
}
for (let i = 0; i < 4; i++) { // windows that glow at night
  const w = new THREE.Mesh(new THREE.PlaneGeometry(260, 280), new THREE.MeshStandardMaterial({ color: '#5E7790', emissive: '#FFC56B', emissiveIntensity: 0 }));
  w.position.set(X0 + 250 + i * (X1 - X0 - 500) / 3, 520, wall.position.z + 61);
  w.userData.window = true;
  house.add(w);
}
world.add(house);
const windows = house.children.filter((c) => c.userData.window);
const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(14, 160, 14), mat('#9B7B57'), 60);
for (let i = 0; i < 30; i++) {
  const z = ZB - 300 + i * (ZF - ZB + 300) / 29;
  posts.setMatrixAt(i, m4.makeTranslation(X0 - 160, 80, z));
  posts.setMatrixAt(30 + i, m4.makeTranslation(X1 + 160, 80, z));
}
posts.castShadow = true;
world.add(posts);

// ---------- region dressing (cheap, instanced): what makes each region read from far away
const dress = new THREE.Group();
world.add(dress);
function scatter(geo, material, n, pick, place) {
  const im = new THREE.InstancedMesh(geo, material, n);
  let k = 0;
  for (let i = 0; i < n * 4 && k < n; i++) {
    const t = pick();
    if (!t) continue;
    const m = place(t);
    if (!m) continue;
    im.setMatrixAt(k++, m);
  }
  im.count = k;
  im.castShadow = true;
  dress.add(im);
  return im;
}
const inRegion = (r) => () => tiles[r * 100 + Math.floor(R() * 100)];
const Y_AXIS = new THREE.Vector3(0, 1, 0), Z_AXIS = new THREE.Vector3(0, 0, 1), q2 = new THREE.Quaternion();
const q = new THREE.Quaternion(), e3 = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3();
const onTile = (t, spread = 0.85) => { const a = R() * Math.PI * 2, d = Math.sqrt(R()) * HR * spread; return [t.x + Math.cos(a) * d, t.z + Math.sin(a) * d]; };
// a patch's 12 spots: an inner and an outer ring
const SPOTS = [];
for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + 0.3, d = i % 2 ? 34 : 20; SPOTS.push([Math.cos(a) * d, Math.sin(a) * d]); }
// grass everywhere, taller in the Long Grass
const blade = new THREE.ConeGeometry(0.9, 1, 3).translate(0, 0.5, 0);
const grassMat = new THREE.MeshStandardMaterial({ color: '#5E9A34', flatShading: true, roughness: 0.9 });
const grassAll = scatter(blade, grassMat, coarse ? 7000 : 16000, () => tiles[Math.floor(R() * 500)], (t) => {
  if (REGIONS[t.r].kind === 'wood' && R() < 0.6) return null;
  const [x, z] = onTile(t, 0.95);
  if (Math.hypot(x, z) < 55 && SPOTS.some(([sx, sz]) => Math.hypot(x - HOME.x - sx, z - HOME.z - sz) < 11)) return null;
  const tall = REGIONS[t.r].kind === 'grass' ? 13 : REGIONS[t.r].kind === 'lawn' ? 6 : 10;
  return m4.compose(v.set(x, 0, z), q.setFromEuler(e3.set((R() - 0.5) * 0.4, R() * 6, (R() - 0.5) * 0.4)), s3.set(1 + R(), tall * (0.6 + R() * 0.8), 1 + R()));
});
grassAll.castShadow = false;
const nearTiles = [HOME, ...neighbours(HOME)];
const grassNear = scatter(blade, grassMat, coarse ? 2500 : 6000, () => nearTiles[Math.floor(R() * nearTiles.length)], (t) => {
  const x = t.x + (R() - 0.5) * HW, z = t.z + (R() - 0.5) * 2 * HR;
  if (SPOTS.some(([sx, sz]) => Math.hypot(x - HOME.x - sx, z - HOME.z - sz) < 9)) return null;
  const tall = t === HOME ? 3 + R() * 5 : 4 + R() * 8;
  return m4.compose(v.set(x, 0, z), q.setFromEuler(e3.set((R() - 0.5) * 0.5, R() * 6, (R() - 0.5) * 0.5)), s3.set(0.45 + R() * 0.35, tall, 0.45 + R() * 0.35));
});
grassNear.castShadow = false;
// flowers in the Old Garden, a big terracotta pot
const petalCols = ['#F2A0C4', '#FFD84D', '#F7F4EA', '#B98CFF', '#FF8A5C'];
for (const c of petalCols) {
  scatter(new THREE.CylinderGeometry(4, 2, 1.5, 6).translate(0, 26, 0), mat(c), 70, inRegion(0), (t) => {
    const [x, z] = onTile(t); return m4.compose(v.set(x, 0, z), q.identity(), s3.set(1, 0.8 + R() * 0.6, 1));
  });
}
scatter(new THREE.CylinderGeometry(0.5, 0.5, 26, 4).translate(0, 13, 0), mat('#4F8A2E'), 350, inRegion(0), (t) => {
  const [x, z] = onTile(t); return m4.compose(v.set(x, 0, z), q.identity(), s3.set(1, 0.8 + R() * 0.6, 1));
});
const pot = new THREE.Mesh(new THREE.CylinderGeometry(70, 52, 110, 14), mat('#C46A3F'));
pot.position.set(REGIONS[0].cx - 300, 55, REGIONS[0].cz - 200); pot.castShadow = true; world.add(pot);
const potRim = new THREE.Mesh(new THREE.TorusGeometry(70, 8, 6, 18), mat('#B45E36')); potRim.rotation.x = Math.PI / 2; potRim.position.set(pot.position.x, 110, pot.position.z); world.add(potRim);
// logs in the Woodpile
for (let i = 0; i < 9; i++) {
  const lg = new THREE.Mesh(new THREE.CylinderGeometry(18 + R() * 8, 20 + R() * 8, 240 + R() * 120, 9), mat(i % 2 ? '#7A5536' : '#6B4A2F'));
  lg.rotation.z = Math.PI / 2; lg.rotation.y = 0.2 + (R() - 0.5) * 0.3;
  lg.position.set(REGIONS[2].cx - 120 + (i % 3) * 40, 20 + Math.floor(i / 3) * 34, REGIONS[2].cz - 160 + (i % 3) * 46);
  lg.castShadow = true; world.add(lg);
}
scatter(new THREE.CylinderGeometry(5, 5, 0.6, 5), mat('#B5622E'), 500, inRegion(2), (t) => { const [x, z] = onTile(t); return m4.compose(v.set(x, 0.4, z), q.setFromEuler(e3.set(0, R() * 6, 0)), s3.set(1 + R(), 1, 0.6 + R() * 0.5)); });
// a creek through Creekside
const creekPts = [];
for (let i = 0; i <= 40; i++) { const k = i / 40; creekPts.push(new THREE.Vector3(REGIONS[3].cx - 520 + k * 1040, 0.6, REGIONS[3].cz - 380 + k * 640 + Math.sin(k * 7) * 90)); }
{
  const curve = new THREE.CatmullRomCurve3(creekPts);
  const pos = [];
  const N = 120;
  for (let i = 0; i <= N; i++) {
    const p = curve.getPoint(i / N), tg = curve.getTangent(i / N);
    const nx = -tg.z, nz = tg.x, w = 26 + Math.sin(i * 0.4) * 6;
    pos.push(p.x + nx * w, 0.8, p.z + nz * w, p.x - nx * w, 0.8, p.z - nz * w);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const idx = [];
  for (let i = 0; i < N; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  g.setIndex(idx);
  g.computeVertexNormals();
  const water = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#4FA3C7', roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide }));
  world.add(water);
}
scatter(new THREE.DodecahedronGeometry(6), mat('#A8A299'), 160, inRegion(3), (t) => { const [x, z] = onTile(t); return m4.compose(v.set(x, 2, z), q.setFromEuler(e3.set(R(), R(), R())), s3.set(1 + R(), 0.6, 1 + R())); });
// a garden hose across the Backyard, and a bottle cap
{
  const pts = [];
  for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector3(REGIONS[1].cx - 450 + i * 75, 3, REGIONS[1].cz + Math.sin(i * 0.9) * 140));
  const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 80, 3.2, 6), mat('#3E9E4F'));
  hose.castShadow = true; world.add(hose);
}

// ---------- the mounds (built in Blender: docs/art/whole-yard/mounds.blend.py)
const moundGeo = MOUNDS.map((m) => {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
  const c = [];
  for (const t of m.tri) for (let k = 0; k < 3; k++) { col.setRGB(t[0], t[1], t[2], THREE.SRGBColorSpace); c.push(col.r, col.g, col.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.computeVertexNormals();
  return g;
});
const moundMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
const colonies = [];
const mounds = new THREE.Group();
world.add(mounds);
const tapables = [];
function addColony(c) {
  const t = c.tile;
  const [sx, sz] = SPOTS[c.spot];
  const g = new THREE.Group();
  g.position.set(t.x + sx, 0, t.z + sz);
  const m = new THREE.Mesh(moundGeo[c.stage], moundMat);
  m.castShadow = m.receiveShadow = true;
  m.userData.tap = c;
  g.add(m);
  // flag on a grass stem
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 14, 4), mat('#6B4A2F'));
  pole.position.set(MOUNDS[c.stage].r * 0.4, MOUNDS[c.stage].h * 0.5 + 7, 0);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.2), new THREE.MeshStandardMaterial({ color: OWN[c.owner], side: THREE.DoubleSide, flatShading: true }));
  flag.position.set(pole.position.x + 2.5, pole.position.y + 5, 0);
  g.add(pole, flag);
  // a glow that turns the yard into a star map at night
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: OWN[c.owner], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  glow.scale.setScalar(120);
  glow.position.y = 8;
  g.add(glow);
  c.group = g; c.mesh = m; c.flag = flag; c.glow = glow;
  mounds.add(g);
  tapables.push(m);
  colonies.push(c);
  return c;
}
let _glow;
function glowTex() {
  if (_glow) return _glow;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const x = cv.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return (_glow = new THREE.CanvasTexture(cv));
}
const home = addColony({ name: "Marz's Nest", owner: 'you', tile: HOME, spot: 7, stage: 2, ants: 1240, level: 9, doing: 'Digging Granary 4 · 22m', mine: true });
addColony({ name: 'The Hatch', owner: 'you', tile: HOME, spot: 2, stage: 0, ants: 50, level: 2, doing: 'Raising 20 Workers · 8m', mine: true });
const rivalHere = addColony({ name: 'Redwood Hill', owner: 'rival', tile: HOME, spot: 4, stage: 1, ants: 610, level: 6, doing: 'Scouted 2h ago' });
addColony({ name: 'Teal Hollow', owner: 'ally', tile: ALLY, spot: 0, stage: 2, ants: 1800, level: 11, doing: 'Supercolony mate' });
addColony({ name: 'Moss Ring', owner: 'ally', tile: ALLY2, spot: 5, stage: 1, ants: 700, level: 7, doing: 'Supercolony mate' });
addColony({ name: 'Cinder Mound', owner: 'rival', tile: RIVAL, spot: 3, stage: 1, ants: 820, level: 7, doing: 'Raided you yesterday' });
addColony({ name: 'Thornback', owner: 'rival', tile: RIVAL2, spot: 9, stage: 2, ants: 2100, level: 12, doing: 'Scouted 1d ago' });
const wildNest = addColony({ name: 'Wild nest', owner: 'wild', tile: HOME, spot: 10, stage: 1, ants: 300, level: 0, doing: 'Pavement ants · 300', wild: true });
const farNames = ['Bramble Keep', 'Sunpit', 'Old Rootway', 'Clover Hold', 'Pebblegate', 'Dewfall', 'Ashmound', 'Barkhollow', 'Gravelreach', 'Seedvault', 'Mirelight', 'Fernwatch', 'Dustcrown', 'Hollowstem', 'Saltlick', 'Rainhold', 'Twigmarsh', 'Lowfield', 'Briar End', 'Copperhill', 'Wetstone', 'Nettlebank', 'Highbloom', 'Mudgate', 'Kestrel Bank'];
far.forEach((t, i) => addColony({ name: farNames[i % farNames.length], owner: 'rival', tile: t, spot: Math.floor(R() * 12), stage: Math.floor(R() * 3), ants: 200 + Math.floor(R() * 3000), level: 3 + Math.floor(R() * 10), doing: 'Seen from afar', hidden: true }));
const hidden = addColony({ name: 'Bramble Keep', owner: 'rival', tile: SCOUTED, spot: 6, stage: 1, ants: 940, level: 8, doing: 'Found by your scouts', hidden: true });
SCOUTED.owner = 'rival';

// wild sites on the home patch: aphids on a stem, the wilds
const aphids = new THREE.Group();
{
  const [sx, sz] = SPOTS[5];
  aphids.position.set(HOME.x + sx + 4, 0, HOME.z + sz);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1, 30, 5).translate(0, 15, 0), mat('#5C9A33'));
  stem.castShadow = true; aphids.add(stem);
  for (let i = 0; i < 14; i++) {
    const a = new THREE.Mesh(new THREE.SphereGeometry(0.8, 6, 4), mat('#A6D83A'));
    a.scale.set(1, 0.8, 1.3); a.position.set(Math.cos(i * 2.4) * 1.3, 8 + i * 1.3, Math.sin(i * 2.4) * 1.3);
    aphids.add(a);
  }
  aphids.children[0].userData.tap = { site: 'aphids', name: 'Aphid herd' };
  tapables.push(aphids.children[0]);
  world.add(aphids);
}
// open spots: dotted circles (as on the live patch)
const ring = new THREE.Group();
{
  const used = new Set(colonies.filter((c) => c.tile === HOME).map((c) => c.spot).concat([5]));
  for (let i = 0; i < 12; i++) {
    if (used.has(i)) continue;
    const [sx, sz] = SPOTS[i];
    for (let k = 0; k < 14; k++) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.45, 6), new THREE.MeshBasicMaterial({ color: '#FFF6DC', transparent: true, opacity: 0.85 }));
      d.rotation.x = -Math.PI / 2; const a = k / 14 * Math.PI * 2;
      d.position.set(HOME.x + sx + Math.cos(a) * 4.2, 0.3, HOME.z + sz + Math.sin(a) * 4.2);
      ring.add(d);
    }
  }
  world.add(ring);
}

// ---------- hex lines (strong far out, gone up close) and scent borders
const hexLines = (() => {
  const pos = [];
  for (const t of tiles) for (let i = 0; i < 6; i++) {
    const a0 = i / 6 * Math.PI * 2, a1 = (i + 1) / 6 * Math.PI * 2;
    pos.push(t.x + Math.sin(a0) * HR, 0.5, t.z + Math.cos(a0) * HR, t.x + Math.sin(a1) * HR, 0.5, t.z + Math.cos(a1) * HR);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#2B1D13', transparent: true, opacity: 0.3 }));
})();
world.add(hexLines);

const borderMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
borderMat.onBeforeCompile = (sh) => {
  sh.uniforms.uW = borderU.uW;
  sh.vertexShader = 'attribute vec2 aOff;\nuniform float uW;\n' + sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + vec3(aOff.x, 0.0, aOff.y) * uW;');
};
const borderU = { uW: { value: 3 } };
const fillMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false });
let borders = null, fills = null;
function buildBorders() {
  if (borders) { world.remove(borders, fills); borders.geometry.dispose(); fills.geometry.dispose(); }
  const pos = [], off = [], cols = [], fpos = [], fcols = [];
  for (const t of tiles) {
    if (!t.owner || t.fog) continue;
    col.set(OWN[t.owner]);
    const nb = new Map();
    for (const n of neighbours(t)) nb.set(Math.round(Math.atan2(n.x - t.x, n.z - t.z) / (Math.PI / 3)), n);
    for (let i = 0; i < 6; i++) {
      const a0 = i / 6 * Math.PI * 2, a1 = (i + 1) / 6 * Math.PI * 2, mid = (i + 0.5) / 6 * Math.PI * 2;
      const n = nb.get(Math.round(mid / (Math.PI / 3))) ?? nb.get(Math.round(mid / (Math.PI / 3)) - 6);
      // fill
      fpos.push(t.x, 0.6, t.z, t.x + Math.sin(a0) * HR, 0.6, t.z + Math.cos(a0) * HR, t.x + Math.sin(a1) * HR, 0.6, t.z + Math.cos(a1) * HR);
      for (let k = 0; k < 3; k++) fcols.push(col.r, col.g, col.b);
      if (n && n.owner === t.owner && !n.fog) continue;
      // a band just inside the edge: the inner side is pushed inward by uW in the shader
      const ax = t.x + Math.sin(a0) * HR, az = t.z + Math.cos(a0) * HR, bx = t.x + Math.sin(a1) * HR, bz = t.z + Math.cos(a1) * HR;
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
  borders = new THREE.Mesh(g, borderMat);
  borders.renderOrder = 2;
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
  fg.setAttribute('color', new THREE.Float32BufferAttribute(fcols, 3));
  fills = new THREE.Mesh(fg, fillMat);
  fills.renderOrder = 1;
  world.add(borders, fills);
}
buildBorders();

// ---------- mist over ground nobody of yours has seen
const puffGeo = new THREE.IcosahedronGeometry(1, 1);
const puffMat = new THREE.MeshLambertMaterial({ color: '#F4F1E8', transparent: true, opacity: 0.88, flatShading: true });
const fogTiles = tiles.filter((t) => t.fog);
const PER = 3;
const puffs = new THREE.InstancedMesh(puffGeo, puffMat, fogTiles.length * PER);
const puffBase = [];
fogTiles.forEach((t, i) => {
  t.puffs = [];
  for (let k = 0; k < PER; k++) {
    const a = k / PER * Math.PI * 2 + R(), d = k ? 22 : 0;
    const p = { x: t.x + Math.cos(a) * d, z: t.z + Math.sin(a) * d, y: 16 + R() * 10, s: 24 + R() * 12, k: 1, ph: R() * 6 };
    puffBase.push(p);
    t.puffs.push(p);
  }
});
world.add(puffs);
function drawPuffs(time) {
  puffBase.forEach((p, i) => {
    const s = p.s * p.k;
    puffs.setMatrixAt(i, m4.compose(v.set(p.x + Math.sin(time * 0.2 + p.ph) * 3, p.y, p.z), q.identity(), s3.set(s * 1.3, s * 0.55, s * 1.3)));
  });
  puffs.instanceMatrix.needsUpdate = true;
}

// ---------- ants: the shipped cartoon ant, instanced (client/src/components/nest3d/ants3d.ts, simplified)
function ell(sx, sy, sz, x, y, z, rz = 0) { const g = new THREE.SphereGeometry(1, 8, 6); g.scale(sx, sy, sz); g.rotateZ(rz); g.translate(x, y, z); return g; }
function seg(a, b, r, r2 = r * 0.75) {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r2, r, d.length(), 5, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5); g.translate(m.x, m.y, m.z); return g;
}
function antGeo() {
  const parts = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  parts.push([ell(0.2, 0.14, 0.15, -0.27, 0.17, 0, 0.25), 0, 1], [ell(0.05, 0.058, 0.045, -0.08, 0.15, 0), 0, 1], [ell(0.125, 0.068, 0.066, 0.03, 0.155, 0, -0.15), 0, 1], [ell(0.085, 0.075, 0.08, 0.19, 0.17, 0), 0, 1]);
  for (const s of [1, -1]) {
    parts.push([ell(0.026, 0.03, 0.022, 0.23, 0.192, s * 0.06), 0, 0.12]);
    parts.push([seg(V(0.26, 0.14, s * 0.03), V(0.35, 0.13, s * 0.005), 0.016, 0.006), 0, 1]);
    parts.push([seg(V(0.23, 0.2, s * 0.03), V(0.27, 0.3, s * 0.07), 0.012), 0, 1], [seg(V(0.27, 0.3, s * 0.07), V(0.41, 0.27, s * 0.12), 0.011, 0.007), 0, 1]);
  }
  const hips = [0.08, 0.025, -0.03], kn = [0.07, 0, -0.07], ft = [0.2, 0.03, -0.2];
  for (let k = 0; k < 3; k++) for (const s of [1, -1]) {
    const hip = V(hips[k], 0.13, s * 0.035), knee = V(hips[k] + kn[k], 0.21, s * 0.15), foot = V(hips[k] + ft[k], 0, s * 0.25);
    const grp = k % 2 === 0 ? s : -s;
    parts.push([seg(hip, knee, 0.022, 0.017), grp, 1, hip], [seg(knee, foot, 0.017, 0.009), grp, 1, hip]);
  }
  const pos = [], nor = [], leg = [], tone = [];
  for (const [g0, grp, tn, hip] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); tone.push(tn);
      leg.push(grp, hip ? clamp(Math.hypot(P.getX(i) - hip.x, P.getY(i) - hip.y, P.getZ(i) - hip.z) / 0.3, 0, 1) : 0);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aLeg', new THREE.Float32BufferAttribute(leg, 2));
  g.setAttribute('aTone', new THREE.Float32BufferAttribute(tone, 1));
  return g;
}
const antU = { uTime: { value: 0 } };
const LEGS = `vec3 transformed = vec3(position);
  float ph = uTime * 14.0 + aPhase;
  transformed.x += sin(ph) * aLeg.x * 0.07 * aLeg.y;
  transformed.y += max(0.0, cos(ph) * aLeg.x) * 0.045 * aLeg.y;`;
const bands = new THREE.DataTexture(new Uint8Array([95, 175, 255]), 3, 1, THREE.RedFormat);
bands.minFilter = bands.magFilter = THREE.NearestFilter; bands.needsUpdate = true;
const antMat = new THREE.MeshToonMaterial({ gradientMap: bands });
antMat.onBeforeCompile = (sh) => {
  sh.uniforms.uTime = antU.uTime;
  sh.vertexShader = 'attribute vec2 aLeg;\nattribute float aPhase;\nattribute float aTone;\nuniform float uTime;\nvarying float vTone;\n' + sh.vertexShader.replace('#include <begin_vertex>', LEGS + '\nvTone = aTone;');
  sh.fragmentShader = 'varying float vTone;\n' + sh.fragmentShader
    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vTone;')
    .replace('#include <dithering_fragment>', 'float gl0 = smoothstep(0.84, 0.87, dot(normalize(normal), normalize(vec3(-0.35, 0.8, 0.5))));\ngl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 1.45 + vec3(0.14, 0.09, 0.05), gl0 * 0.85);\n#include <dithering_fragment>');
};
const inkMat = new THREE.MeshBasicMaterial({ color: '#1c0f08', side: THREE.BackSide });
inkMat.onBeforeCompile = (sh) => {
  sh.uniforms.uTime = antU.uTime;
  sh.vertexShader = 'attribute vec2 aLeg;\nattribute float aPhase;\nuniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', LEGS + '\ntransformed += normalize(normal) * 0.013;');
};
const ANT_CAP = 900;
const aGeo = antGeo();
const phase = new Float32Array(ANT_CAP); for (let i = 0; i < ANT_CAP; i++) phase[i] = R() * 6.28;
aGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
const antMesh = new THREE.InstancedMesh(aGeo, antMat, ANT_CAP);
const antInk = new THREE.InstancedMesh(aGeo, inkMat, ANT_CAP);
antInk.instanceMatrix = antMesh.instanceMatrix;
antMesh.setColorAt(0, col.set('#B8612F'));
antMesh.frustumCulled = antInk.frustumCulled = false;
antMesh.count = antInk.count = 0;
antMesh.castShadow = true;
scene.add(antMesh, antInk); // in the scene, not the map: they also walk the nest's tunnels
const loadMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshToonMaterial({ gradientMap: bands, color: '#A6D83A' }), ANT_CAP);
loadMesh.count = 0; loadMesh.frustumCulled = false; world.add(loadMesh);
let antN = 0, loadN = 0;
const ANT_COL = { you: '#B8612F', ally: '#2F9C95', rival: '#A85A3A', wild: '#C4473A', army: '#8E2216' };
function putAnt(x, z, yaw, colr, load, size = 1) {
  if (antN >= ANT_CAP) return;
  m4.compose(v.set(x, 0, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), s3.setScalar(size));
  antMesh.setMatrixAt(antN, m4);
  antMesh.setColorAt(antN++, col.set(colr));
  if (load && loadN < ANT_CAP) { loadMesh.setMatrixAt(loadN, m4.multiply(new THREE.Matrix4().makeTranslation(0.4, 0.3, 0))); loadMesh.setColorAt(loadN++, col.set(load)); }
}

// columns: a party on a scent trail (a curve on the ground), drawn as real ants close up and as a thread far out
const columns = [];
const threadMat = new THREE.LineDashedMaterial({ color: '#E8B23A', dashSize: 14, gapSize: 9, transparent: true, opacity: 0 });
function addColumn(o) {
  const a = o.from, b = o.to;
  const mid = a.clone().lerp(b, 0.5);
  const n = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize().multiplyScalar(a.distanceTo(b) * 0.12 * (o.bend ?? 1));
  const curve = new THREE.QuadraticBezierCurve3(a, mid.add(n), b);
  const len = curve.getLength();
  const pts = curve.getPoints(40).map((p) => p.clone().setY(p.y + 0.4));
  // scent ribbon on the ground
  const rib = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.5, 4), new THREE.MeshBasicMaterial({ color: OWN[o.owner] ?? '#E8B23A', transparent: true, opacity: 0.35, depthWrite: false }));
  rib.scale.y = 0.15; rib.position.y = 0.3;
  world.add(rib);
  // the far-out thread: an arc above the ground
  const arc = new THREE.QuadraticBezierCurve3(a.clone().setY(4), a.clone().lerp(b, 0.5).setY(len * 0.25 + 10), b.clone().setY(4));
  const tg = new THREE.BufferGeometry().setFromPoints(arc.getPoints(40));
  const thread = new THREE.Line(tg, threadMat.clone());
  thread.material.color.set(OWN[o.owner] ?? '#E8B23A');
  thread.computeLineDistances();
  world.add(thread);
  const c = { ...o, curve, len, rib, thread, t0: o.t0 ?? 0, n: o.n ?? 30 };
  columns.push(c);
  return c;
}
function removeColumn(c) { world.remove(c.rib, c.thread); columns.splice(columns.indexOf(c), 1); }
const P = (t, spot, dx = 0, dz = 0) => new THREE.Vector3(t.x + SPOTS[spot][0] + dx, 0, t.z + SPOTS[spot][1] + dz);
// standing traffic: workers between your two mounds, the ally's column to you
addColumn({ from: P(HOME, 7), to: P(HOME, 2), owner: 'you', n: 26, speed: 1.6, loop: true, load: '#7FC24A', label: 'Transport · 26' });
addColumn({ from: P(ALLY, 0), to: P(HOME, 7, 3, -4), owner: 'ally', n: 30, speed: 2.4, loop: true, label: 'Teal Hollow · gift', bend: -1 });

// ---------- the nest (dive into it from your mound): a cutaway slab, its chambers lit from inside
const nest = new THREE.Group();
nest.visible = false;
scene.add(nest);
const NEST_Y = -5000;
nest.position.set(0, NEST_Y, 0);
const nestChambers = [];
{
  const layers = [['#7A5A3E', 12], ['#A0703E', 18], ['#C9874A', 16], ['#B4643A', 18], ['#8E5A44', 16]];
  let y = 0;
  for (const [c, h] of layers) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(160, h, 40), mat(c));
    b.position.set(0, -y - h / 2, -20); y += h;
    nest.add(b);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(160, 3, 40), mat('#6FA83E')); top.position.set(0, 1.5, -20); nest.add(top);
  const m = new THREE.Mesh(moundGeo[2], moundMat); m.position.set(0, 3, -20); nest.add(m);
  const nestGrass = new THREE.InstancedMesh(blade, grassMat, 260);
  for (let i = 0; i < 260; i++) nestGrass.setMatrixAt(i, m4.compose(v.set((R() - 0.5) * 158, 3, -20 + (R() - 0.5) * 38), q.setFromEuler(e3.set(0, R() * 6, 0)), s3.set(1, 6 + R() * 12, 1)));
  nest.add(nestGrass);
  const hollow = (x, y, w, h) => {
    const sh = new THREE.Shape(); sh.absellipse(0, 0, w, h, 0, Math.PI * 2);
    const g = new THREE.ShapeGeometry(sh, 24);
    const mm = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#3A2416', roughness: 1 }));
    mm.position.set(x, y, 0.2); nest.add(mm);
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.92, w * 0.92, 1, 20, 1, false, 0, Math.PI), mat('#5A3A24'));
    floor.scale.z = 0.5; floor.rotation.y = Math.PI / 2; floor.position.set(x, y - h + 0.6, 0.3); nest.add(floor);
    return mm;
  };
  const tunnel = (pts) => {
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0.1))), 40, 2.4, 6), new THREE.MeshStandardMaterial({ color: '#3A2416' }));
    tube.scale.z = 0.05; nest.add(tube);
  };
  tunnel([[0, 2], [2, -14], [-6, -30], [-28, -40], [-46, -52]]);
  tunnel([[-6, -30], [18, -38], [40, -48]]);
  tunnel([[-28, -40], [-20, -62], [4, -68]]);
  tunnel([[40, -48], [52, -66]]);
  const ch = (name, x, y, w, h, fill, sheet) => {
    const mm = hollow(x, y, w, h);
    const light = new THREE.PointLight('#FFC56B', 600, 60, 2); light.position.set(x, y, 14); nest.add(light);
    mm.userData.tap = { chamber: name, sheet };
    tapables.push(mm);
    fill(x, y - h + 1.2, w);
    nestChambers.push({ name, x, y: y + h + 4, mesh: mm });
  };
  ch('Queen’s Chamber', -46, -52, 16, 7, (x, y) => {
    const q0 = new THREE.Mesh(new THREE.SphereGeometry(4, 10, 8), mat('#8E4527')); q0.scale.set(1.6, 0.9, 1); q0.position.set(x - 2, y + 3, 2); nest.add(q0);
    for (let i = 0; i < 9; i++) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 4), mat('#F7F4EA')); e.position.set(x + 6 + (i % 3) * 1.8, y + 0.9 + Math.floor(i / 3) * 1.4, 2); nest.add(e); }
  }, { title: 'Queen’s Chamber 9', body: 'The heart of the colony. Here she lays the eggs for everything the Brood Hall raises.', acts: ['Raise ants…'] });
  ch('Fungus Garden', 40, -48, 15, 7, (x, y, w) => {
    for (let i = 0; i < 7; i++) { const f = new THREE.Mesh(new THREE.DodecahedronGeometry(2.2 + R() * 1.4), mat(i % 2 ? '#E9E2C8' : '#CFD8A0')); f.position.set(x - w * 0.7 + i * w * 0.23, y + 2, 2); nest.add(f); }
  }, { title: 'Leaf Garden 7', body: 'Workers chew leaves into a fungus garden. Making 410 Foliage an hour.', acts: ['Dig to level 8 · 34m'] });
  ch('Granary', 4, -68, 13, 6, (x, y, w) => {
    for (let i = 0; i < 26; i++) { const sd = new THREE.Mesh(new THREE.SphereGeometry(0.9, 5, 3), mat(['#E3C27A', '#C9A55E', '#B98B4A'][i % 3])); sd.position.set(x - w * 0.6 + R() * w * 1.2, y + 0.8 + R() * 2.4, 2 + R()); nest.add(sd); }
  }, { title: 'Granary 3 → 4', body: 'Being dug now: 22 minutes left. Stores more seeds and safe Protein.', acts: ['Plan the next dig'] });
  ch('Nursery', 52, -66, 11, 5.5, (x, y) => {
    for (let i = 0; i < 10; i++) { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 1.4, 2, 6), mat('#FFF6E0')); l.rotation.z = Math.PI / 2; l.position.set(x - 6 + i * 1.3, y + 0.9 + (i % 2) * 1.2, 2); nest.add(l); }
  }, { title: 'Brood Hall 6', body: 'Raising 40 Workers and 12 Minor Soldiers. Next out in 1m 20s.', acts: ['Queue more…'] });
  ch('Honeypots', -20, -30, 12, 5.5, (x, y) => {
    for (let i = 0; i < 4; i++) { const h = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), new THREE.MeshStandardMaterial({ color: '#F2B53A', emissive: '#E8902A', emissiveIntensity: 0.25, roughness: 0.3 })); h.position.set(x - 6 + i * 4, y + 2.4, 2); nest.add(h); }
  }, { title: 'Honeypot Chamber 4', body: 'Replete workers hang here swollen with Nectar. Holds 12,000.', acts: ['Dig to level 5'] });
}
const nestTunnels = [
  new THREE.CatmullRomCurve3([[0, 2], [2, -14], [-6, -30], [-28, -40], [-46, -52]].map(([x, y]) => new THREE.Vector3(x, y - 1.6, 1.5))),
  new THREE.CatmullRomCurve3([[-6, -30], [18, -38], [40, -48]].map(([x, y]) => new THREE.Vector3(x, y - 1.6, 1.5))),
  new THREE.CatmullRomCurve3([[-28, -40], [-20, -62], [4, -68]].map(([x, y]) => new THREE.Vector3(x, y - 1.6, 1.5))),
];

// ---------- camera: one orbit rig, one zoom from the whole yard (≈40 m) to ant height (≈6 cm)
const view = { x: 0, z: 0, y: 0, yaw: -0.35, dist: 2600 };
const goal = { ...view };
const DMIN = 4, DMAX = 4200;
let nestMode = false;
function pitchFor(d) { return d < 160 ? lerp(0.2, 0.9, smooth(4, 160, d)) : lerp(0.9, 1.02, smooth(160, 1500, d)); } // gets the camera down as you zoom in
function homeView() { const portrait = stageEl.clientHeight > stageEl.clientWidth; return { x: (X0 + X1) / 2, z: (ZB + ZF) / 2 + 120, y: 0, yaw: -0.3, dist: portrait ? 4200 : 2900 }; }
Object.assign(view, homeView()); Object.assign(goal, view);
function fly(to, dur = 1.4, done) {
  const from = { ...goal };
  tween(dur, (k) => { const e = ease(k); for (const kk of ['x', 'y', 'z', 'dist', 'yaw']) if (to[kk] !== undefined) goal[kk] = lerp(from[kk], to[kk], e); Object.assign(view, goal); }, done);
}
function rung(d) { return nestMode ? 'nest' : d > 1500 ? 'yard' : d > 330 ? 'region' : 'patch'; }

// ---------- labels: Civ-style banners over colonies, region names far out, chamber names in the nest
const labels = $('#labels');
function tag(cls, html) { const el = document.createElement('div'); el.className = cls; el.innerHTML = html; labels.append(el); return el; }
const fmt = (n) => n.toLocaleString('en');
for (const c of colonies) {
  c.el = tag(`banner ${c.owner}`, `<i>${c.wild ? '!' : c.level}</i><b>${c.name}</b><span>${c.wild ? '' : fmt(c.ants)}</span>`);
  c.dot = tag(`bdot ${c.owner}`, '');
}
for (const g of REGIONS) g.el = tag('rname', g.name);
const colTags = new Map();
for (const ch of nestChambers) ch.el = tag('tag', `<b>${ch.name}</b>`);
const tmpV = new THREE.Vector3();
function place(el, x, y, z, show) {
  if (!show) { el.style.display = 'none'; return; }
  tmpV.set(x, y, z).project(camera);
  if (tmpV.z > 1 || Math.abs(tmpV.x) > 1.2 || Math.abs(tmpV.y) > 1.2) { el.style.display = 'none'; return; }
  el.style.display = '';
  el.style.transform = `translate(-50%, -100%) translate(${(tmpV.x * 0.5 + 0.5) * W}px, ${(-tmpV.y * 0.5 + 0.5) * H}px)`;
}

// banners on the same patch would sit on top of each other: stack them instead
function unclutter(els) {
  const shown = els.filter((el) => el.style.display !== 'none').map((el) => {
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)$/.exec(el.style.transform);
    return { el, x: +m[1], y: +m[2], w: el.offsetWidth, h: el.offsetHeight + 3 };
  }).sort((a, b) => b.y - a.y);
  const placed = [];
  for (const b of shown) {
    for (let guard = 0; guard < 8; guard++) {
      const hit = placed.find((p) => Math.abs(p.x - b.x) < (p.w + b.w) / 2 && Math.abs(p.y - b.y) < b.h);
      if (!hit) break;
      b.y = hit.y - b.h;
    }
    placed.push(b);
    b.el.style.transform = `translate(-50%, -100%) translate(${b.x}px, ${b.y}px)`;
  }
}

// ---------- input: drag to move, right-drag / two fingers to turn, wheel or pinch to zoom, double-click to dive
let W = 1, H = 1;
const ptrs = new Map();
let downAt = null, lastTap = 0, pinch0 = 0, dist0 = 0;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button });
  downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = goal.dist; }
});
canvas.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId);
  if (!p) { hover(e); return; }
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch0) goal.dist = clamp(dist0 * pinch0 / d, DMIN, nestMode ? 180 : DMAX);
    return;
  }
  if (p.b === 2 || e.shiftKey) { goal.yaw -= dx * 0.006; return; }
  const k = (goal.dist / H) * 1.25;
  const c = Math.cos(goal.yaw), s = Math.sin(goal.yaw);
  if (nestMode) { goal.x -= dx * k; goal.y += dy * k; return; }
  goal.x -= (dx * c + dy * s) * k;
  goal.z -= (-dx * s + dy * c) * k;
});
const up = (e) => {
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch0 = 0;
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  if (moved < 9 && performance.now() - downAt.t < 500) {
    const now = performance.now();
    const hit = pick(e);
    if (now - lastTap < 350 && hit && hit.mine) dive(hit);
    else if (hit) open(hit);
    lastTap = now;
  }
  downAt = null;
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const f = Math.exp(e.deltaY * 0.0015);
  // zoom toward the pointer
  const r = canvas.getBoundingClientRect();
  const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
  const nd = clamp(goal.dist * f, DMIN, nestMode ? 180 : DMAX);
  const k = (goal.dist - nd) * 0.9;
  const c = Math.cos(goal.yaw), s = Math.sin(goal.yaw);
  if (nestMode) { goal.x += nx * k; goal.y -= ny * k; }
  else { goal.x += (nx * c + ny * s * 1.4) * k; goal.z += (-nx * s + ny * c * 1.4) * k; }
  goal.dist = nd;
  if (!nestMode && nd < 9 && f < 1) hint('Double-click your mound to go inside');
}, { passive: false });
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pick(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const vis = tapables.filter((m) => { let o = m; while (o) { if (!o.visible) return false; o = o.parent; } return true; });
  return ray.intersectObjects(vis, false)[0]?.object.userData.tap ?? null;
}
function hover(e) { canvas.style.cursor = pick(e) ? 'pointer' : 'grab'; }
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select')) return;
  const step = goal.dist * 0.08, c = Math.cos(goal.yaw), s = Math.sin(goal.yaw);
  const m = { w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [-1, 0], arrowright: [1, 0] }[e.key.toLowerCase()];
  if (m && !nestMode && stageEl.matches(':hover')) { goal.x += (m[0] * c + m[1] * s) * step; goal.z += (-m[0] * s + m[1] * c) * step; e.preventDefault(); }
  if ((e.key === 'q' || e.key === 'e') && stageEl.matches(':hover')) goal.yaw += e.key === 'q' ? 0.12 : -0.12;
});

// ---------- HUD: ladder, toast, sheets
const toastEl = $('#toast');
let toastT = 0;
function toast(msg, ms = 4200) { toastEl.textContent = msg; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('on'), ms); }
const hintEl = $('#hint'); let hintT = 0, hinted = new Set();
function hint(msg) { if (hinted.has(msg)) return; hinted.add(msg); hintEl.textContent = msg; hintEl.hidden = false; clearTimeout(hintT); hintT = setTimeout(() => (hintEl.hidden = true), 2600); }
const res = { foliage: 24700, protein: 10000, nectar: 20700 };
function bump(k, n) {
  const el = $(`#r-${k}`); const from = res[k]; res[k] += n;
  tween(0.8, (x) => (el.textContent = fmt(Math.round(lerp(from, res[k], x)))));
  el.parentElement.classList.remove('pop'); void el.offsetWidth; el.parentElement.classList.add('pop');
}
const sheet = $('#sheet');
function open(hit) {
  if (hit.chamber) return showSheet(hit.sheet.title, hit.sheet.body, hit.sheet.acts.map((a) => [a, () => toast('In the game this opens the chamber card. Numbers here are made up.')]));
  if (hit.site === 'aphids') return showSheet('Aphid herd · Spot 15', 'Green aphids on a stem. Tend them for Honeydew (Nectar) until someone drives you off.', [['Herd aphids', act.herd]]);
  if (hit.mine) return showSheet(hit.name, `Your colony · level ${hit.level} · ${fmt(hit.ants)} ants. ${hit.doing}.`, [['Enter the nest', () => dive(hit)], ['Send ants from here', () => toast('Deploy opens beside the map, with this colony as From.')]]);
  if (hit.wild) return showSheet('Wild nest · Pavement ants', '300 ants that raid back gently. Beat them for their stores and the corpses.', [['Raid the wild nest', act.raid]]);
  if (hit.owner === 'ally') return showSheet(hit.name, `Supercolony mate · level ${hit.level}. Their scent is your scent: teal border, teal thread.`, [['Send food', () => toast('A transport column sets off along a teal-and-honey trail.')]]);
  showSheet(hit.name, `Rival · level ${hit.level} · about ${fmt(hit.ants)} ants. ${hit.doing}.`, [['Scout', () => toast('A scout leaves your mound; the report comes back in a few minutes.')], ['Raid…', () => toast('Deploy opens with this colony as To.')]]);
}
function showSheet(title, body, acts) {
  $('#sheet-title').textContent = title;
  $('#sheet-body').textContent = body;
  const box = $('#sheet-acts'); box.innerHTML = '';
  acts.forEach(([label, fn], i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (!i) b.className = 'primary'; b.onclick = () => { sheet.hidden = true; fn(); }; box.append(b); });
  sheet.hidden = false;
  box.querySelector('button')?.focus({ preventScroll: true });
}
$('#sheet-x').onclick = () => (sheet.hidden = true);

// ---------- the five verbs
const busy = new Set();
const act = {
  // Explore: scouts walk into the mist; it lifts and shows what was there
  scout() {
    if (busy.has('scout')) return;
    busy.add('scout');
    const to = P(SCOUTED, 6);
    fly({ x: (HOME.x + SCOUTED.x) / 2 - 60, z: (HOME.z + SCOUTED.z) / 2 + 40, dist: 900 }, 1.4);
    const c = addColumn({ from: P(HOME, 7), to, owner: 'you', n: 4, speed: 9, label: 'Scouts · 4' });
    toast('Explore: 4 scouts walk into the mist. Far out you follow the thread; close up, the ants.');
    c.onArrive = () => {
      removeColumn(c);
      const lift = [SCOUTED, ...neighbours(SCOUTED)].filter((t) => t.fog);
      lift.forEach((t) => (t.fog = false));
      tween(1.8, (k) => lift.forEach((t) => t.puffs?.forEach((p) => (p.k = 1 - ease(k)))));
      hidden.hidden = false;
      buildBorders();
      toast('The mist lifts: Bramble Keep, a level 8 rival, two patches from home. Its border is drawn now.');
      busy.delete('scout');
      $('#c-scout').disabled = true;
    };
  },
  // Expand: a winged queen flies to an empty patch; a new mound rises and the border grows
  flight() {
    if (busy.has('flight')) return;
    busy.add('flight');
    fly({ x: EXPAND.x - 40, z: EXPAND.z + 30, dist: 520 }, 1.2);
    const from = home.group.position.clone().setY(12), to = P(EXPAND, 1).setY(1);
    const curve = new THREE.QuadraticBezierCurve3(from, from.clone().lerp(to, 0.5).setY(120), to);
    const queen = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6), mat('#8E4527')); body.scale.set(1.8, 1, 1);
    const wingM = new THREE.MeshStandardMaterial({ color: '#EAF4FF', transparent: true, opacity: 0.75, side: THREE.DoubleSide });
    const w1 = new THREE.Mesh(new THREE.PlaneGeometry(7, 3), wingM), w2 = w1.clone();
    w1.position.z = 3.5; w2.position.z = -3.5; w1.rotation.x = w2.rotation.x = -Math.PI / 2;
    queen.add(body, w1, w2);
    world.add(queen);
    toast('Expand: a winged queen leaves on her nuptial flight to the empty patch next door.');
    tween(4.5, (k) => {
      queen.position.copy(curve.getPoint(k)); queen.lookAt(curve.getPoint(Math.min(1, k + 0.01)));
      queen.rotateY(-Math.PI / 2);
      w1.rotation.y = Math.sin(k * 90) * 0.6; w2.rotation.y = -w1.rotation.y;
    }, () => {
      world.remove(queen);
      const c = addColony({ name: 'Queen’s Rest', owner: 'you', tile: EXPAND, spot: 1, stage: 0, ants: 1, level: 1, doing: 'Founding · first eggs', mine: true });
      c.el = tag('banner you', `<i>1</i><b>${c.name}</b><span>1</span>`); c.dot = tag('bdot you', '');
      c.group.scale.setScalar(0.01); c.growing = true;
      tween(1.2, (k) => c.group.scale.setScalar(Math.max(0.01, ease(k))), () => (c.growing = false));
      EXPAND.owner = 'you';
      buildBorders();
      toast('A new colony: Queen’s Rest. Your honey border grows over a second patch.');
      busy.delete('flight');
      $('#c-flight').disabled = true;
    });
  },
  // Exploit: a column goes to the aphids and comes home loaded
  herd() {
    if (busy.has('herd')) return;
    busy.add('herd');
    fly({ x: aphids.position.x - 6, z: aphids.position.z + 18, dist: 70 }, 1.4);
    const c = addColumn({ from: P(HOME, 7), to: aphids.position.clone().add(new THREE.Vector3(-1, 0, 2)), owner: 'you', n: 24, speed: 6, label: 'Herders · 24', bend: 0.6 });
    toast('Exploit: 24 workers march to the aphid herd.');
    c.onArrive = () => {
      removeColumn(c);
      const back = addColumn({ from: aphids.position.clone().add(new THREE.Vector3(-1, 0, 2)), to: P(HOME, 7), owner: 'you', n: 24, speed: 6, label: 'Herders · coming home', load: '#A6D83A', bend: -0.6 });
      back.onArrive = () => { removeColumn(back); bump('nectar', 1800); toast('Home with honeydew: +1,800 Nectar.'); busy.delete('herd'); };
    };
  },
  // Exterminate: a raid on the wild nest, a dust cloud, the result
  raid() {
    if (busy.has('raid')) return;
    busy.add('raid');
    fly({ x: (home.group.position.x + wildNest.group.position.x) / 2, z: (home.group.position.z + wildNest.group.position.z) / 2 + 30, dist: 120 }, 1.4);
    const c = addColumn({ from: P(HOME, 7), to: P(HOME, 10, 4, 0), owner: 'you', n: 60, speed: 7, label: 'Raid · 60 soldiers', soldiers: true });
    toast('Exterminate: 60 soldiers march on the wild nest.');
    c.onArrive = () => {
      removeColumn(c);
      const dust = new THREE.Group();
      for (let i = 0; i < 18; i++) { const d = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + R() * 2, 0), new THREE.MeshLambertMaterial({ color: '#D9C8A6', transparent: true, opacity: 0.8 })); d.position.set((R() - 0.5) * 14, 2 + R() * 4, (R() - 0.5) * 14); dust.add(d); }
      dust.position.copy(wildNest.group.position);
      world.add(dust);
      tween(2.4, (k) => { dust.children.forEach((d, i) => { d.position.y += 0.05; d.rotation.y += 0.05; d.material.opacity = 0.8 * (1 - k); }); }, () => {
        world.remove(dust);
        wildNest.el.querySelector('b').textContent = 'Wild nest · beaten';
        const back = addColumn({ from: P(HOME, 10, 4, 0), to: P(HOME, 7), owner: 'you', n: 48, speed: 6, label: 'Raid · coming home', load: '#C9874A', soldiers: true });
        back.onArrive = () => { removeColumn(back); bump('protein', 3200); bump('foliage', 1400); toast('Won: 12 soldiers lost; 3,200 Protein and 1,400 Foliage carried home.'); busy.delete('raid'); };
      });
    };
  },
};
function dive(c) {
  if (nestMode) return;
  sheet.hidden = true;
  const p = c.group.position;
  fly({ x: p.x, z: p.z + 2, dist: 5 }, 1.3, () => {
    const haze = $('#haze'); haze.style.background = '#2A1A10';
    tween(0.35, (k) => (haze.style.opacity = k), () => {
      nestMode = true; world.visible = false; nest.visible = true;
      Object.assign(view, { x: 2, y: NEST_Y - 34, z: 0, yaw: 0, dist: 170 }); Object.assign(goal, view);
      fly({ dist: 140 }, 1.0);
      tween(0.5, (k) => (haze.style.opacity = 1 - k));
      toast(`Inside ${c.name}. Tap a chamber. "Up to the patch" or zoom out to climb back.`);
      ui();
    });
  });
}
function surface() {
  if (!nestMode) return;
  const haze = $('#haze');
  tween(0.3, (k) => (haze.style.opacity = k), () => {
    nestMode = false; world.visible = true; nest.visible = false;
    const p = home.group.position;
    Object.assign(view, { x: p.x, y: 0, z: p.z + 2, yaw: -0.35, dist: 8 }); Object.assign(goal, view);
    fly({ dist: 90 }, 1.1);
    tween(0.4, (k) => (haze.style.opacity = 1 - k));
    ui();
  });
}
$('#c-scout').onclick = act.scout;
$('#c-flight').onclick = act.flight;
$('#c-herd').onclick = act.herd;
$('#c-raid').onclick = act.raid;
$('#c-nest').onclick = () => (nestMode ? surface() : dive(home));
$('#needs').onclick = () => { if (nestMode) surface(); fly({ x: home.group.position.x, z: home.group.position.z + 10, dist: 60 }, 1.3, () => open(home)); };
for (const b of document.querySelectorAll('#ladder button')) b.onclick = () => {
  const r = b.dataset.r;
  if (r === 'nest') return dive(home);
  const go = () => {
    if (r === 'yard') fly(homeView());
    if (r === 'region') fly({ x: 60, z: -40, dist: 900 });
    if (r === 'patch') fly({ x: 0, z: 4, dist: 140 });
  };
  if (nestMode) { surface(); setTimeout(go, 500); } else go();
};
$('#reset').onclick = () => { if (nestMode) surface(); fly(homeView()); };

// day and night: the yard at night is a star map of colony lights
const DAY = { sky: '#BFDDEB', hemi: 1.2, sun: 2.3, glow: 0, win: 0, ground: '#6B5A3A' };
const NIGHT = { sky: '#14203F', hemi: 0.35, sun: 0.35, glow: 0.95, win: 1.4, ground: '#2A2230' };
let night = 0, nightGoal = 0;
const themeDark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
night = nightGoal = themeDark() ? 1 : 0;
$('#daynight').onclick = () => { nightGoal = nightGoal ? 0 : 1; $('#daynight').textContent = nightGoal ? 'Day' : 'Night'; };
$('#daynight').textContent = night ? 'Day' : 'Night';
const SOIL_BG = new THREE.Color('#24160D');
const skyC = new THREE.Color(), cA = new THREE.Color(), cB = new THREE.Color();

// what rung we're on, for the ladder and the scale bar
let lastRung = '';
function ui() {
  const r = rung(view.dist);
  if (r === lastRung) return;
  lastRung = r;
  for (const b of document.querySelectorAll('#ladder button')) b.setAttribute('aria-pressed', String(b.dataset.r === r));
  $('#c-nest').textContent = nestMode ? '↑ Up to the patch' : 'Enter the nest';
  for (const id of ['#c-scout', '#c-flight', '#c-herd', '#c-raid']) $(id).hidden = nestMode;
}

// ---------- frame
function resize() {
  W = stageEl.clientWidth; H = stageEl.clientHeight;
  if (!W || !H) return false;
  renderer.setSize(W, H, false);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  return true;
}
new ResizeObserver(resize).observe(stageEl);
let visible = true;
new IntersectionObserver(([en]) => (visible = en.isIntersecting)).observe(stageEl);
const clock = new THREE.Clock();
let time = 0;
function frame() {
  requestAnimationFrame(frame);
  if (!visible || document.hidden) return;
  if ((!W || !H) && !resize()) return;
  tick(Math.min(clock.getDelta(), 0.05));
}
function tick(dt, draw = true) {
  time += dt;
  for (let i = tweens.length - 1; i >= 0; i--) { const t = tweens[i]; t.t += dt; const k = Math.min(1, t.t / t.dur); t.fn(k); if (k >= 1) { tweens.splice(i, 1); t.done?.(); } }
  // camera follows its goal
  const a = 1 - Math.pow(0.0005, dt);
  for (const k of ['x', 'y', 'z', 'yaw']) view[k] = lerp(view[k], goal[k], a);
  view.dist = Math.exp(lerp(Math.log(view.dist), Math.log(goal.dist), a));
  if (!nestMode) { goal.x = clamp(goal.x, X0, X1); goal.z = clamp(goal.z, ZB - 300, ZF); }
  if (nestMode && goal.dist >= 179 && view.dist > 172) surface();
  const pitch = nestMode ? 0.08 : pitchFor(view.dist);
  const d = view.dist;
  camera.position.set(view.x + Math.sin(view.yaw) * Math.cos(pitch) * d, view.y + Math.sin(pitch) * d, view.z + Math.cos(view.yaw) * Math.cos(pitch) * d);
  camera.lookAt(view.x, view.y + (nestMode ? 0 : Math.min(2, d * 0.05)), view.z);
  camera.near = Math.max(0.05, d * 0.02); camera.far = d * 6 + 6000; camera.updateProjectionMatrix();
  // light follows the view so shadows stay sharp at every scale
  const sd = clamp(d * 1.2, 30, 5000);
  sun.position.set(view.x - sd * 0.5, view.y + sd, view.z + sd * 0.3); sun.target.position.set(view.x, view.y, view.z);
  const sc = sun.shadow.camera; sc.left = sc.bottom = -sd * 0.9; sc.right = sc.top = sd * 0.9; sc.near = 1; sc.far = sd * 3; sc.updateProjectionMatrix();
  // day / night
  night = lerp(night, nightGoal, 1 - Math.pow(0.02, dt));
  skyC.copy(cA.set(DAY.sky)).lerp(cB.set(NIGHT.sky), night);
  scene.background = nestMode ? SOIL_BG : skyC;
  scene.fog.color.copy(skyC);
  scene.fog.near = d * 1.6 + 400; scene.fog.far = d * 4 + 3000;
  hemi.intensity = lerp(DAY.hemi, NIGHT.hemi, night); sun.intensity = lerp(DAY.sun, NIGHT.sun, night);
  hemi.groundColor.copy(cA.set(DAY.ground)).lerp(cB.set(NIGHT.ground), night);
  windows.forEach((w) => (w.material.emissiveIntensity = night * NIGHT.win));
  // semantic zoom: what shows at this distance
  const far = smooth(500, 1600, d);       // 0 near, 1 at yard scale
  const mid = smooth(110, 380, d);        // 0 in the patch, 1 at region scale
  hexLines.material.opacity = 0.05 + 0.4 * mid;
  borderU.uW.value = clamp(d * 0.006, 0.8, 16);
  fillMat.opacity = 0.08 + 0.2 * mid;
  borders.visible = d > 30;
  puffMat.opacity = 0.88 * smooth(60, 260, d);
  grassAll.visible = d < 2400;
  ring.visible = d < 200;
  for (const c of colonies) {
    c.glow.material.opacity = night * (c.owner === 'you' ? 0.3 + 0.25 * mid : 0.18 + 0.3 * mid);
    c.glow.scale.setScalar(clamp(d * 0.025, 18, 90));
    c.flag.visible = d < 600;
    c.group.scale.setScalar(c.growing ? c.group.scale.x : 1 + 2.2 * smooth(380, 1400, d));
  }
  drawPuffs(time);
  // ants
  antU.uTime.value = time;
  antN = 0; loadN = 0;
  const showAnts = d < 420;
  for (const c of [...columns]) {
    c.t0 += dt * c.speed / c.len * 10;
    if (c.t0 > 1.4 && !c.loop) { c.onArrive?.(); continue; }
    c.thread.material.opacity = smooth(250, 700, d) * 0.9;
    c.rib.visible = d < 900;
    if (!showAnts) continue;
    for (let i = 0; i < c.n; i++) {
      let k = c.t0 - i * (1.6 / c.len) * (c.soldiers ? 1.3 : 1.8);
      if (c.loop) k = ((k % 1) + 1) % 1; else if (k < 0 || k > 1) continue;
      const p = c.curve.getPoint(k), tg = c.curve.getTangent(k);
      const wob = Math.sin(i * 12.9 + time * 2) * 0.5;
      putAnt(p.x - tg.z * wob, p.z + tg.x * wob, Math.atan2(-tg.z, tg.x), c.owner === 'you' ? (c.soldiers ? '#96472A' : ANT_COL.you) : ANT_COL[c.owner], c.load, c.soldiers ? 1.25 : 1);
    }
  }
  // the nest: workers in the tunnels
  if (nestMode) {
    nestTunnels.forEach((cv, ti) => {
      for (let i = 0; i < 14; i++) {
        const k = ((time * 0.04 * (ti % 2 ? 1 : -1) + i / 14) % 1 + 1) % 1;
        const p = cv.getPoint(k), tg = cv.getTangent(k);
        if (antN >= ANT_CAP) break;
        const back = tg.x < 0;
        q.setFromAxisAngle(Y_AXIS, back ? Math.PI : 0).multiply(q2.setFromAxisAngle(Z_AXIS, Math.atan2(tg.y, Math.abs(tg.x))));
        m4.compose(v.set(p.x, p.y + NEST_Y, p.z), q, s3.setScalar(2.2));
        antMesh.setMatrixAt(antN, m4); antMesh.setColorAt(antN++, col.set('#B8612F'));
      }
    });
  }
  antMesh.count = antInk.count = antN; loadMesh.count = loadN;
  antMesh.instanceMatrix.needsUpdate = true; if (antMesh.instanceColor) antMesh.instanceColor.needsUpdate = true;
  loadMesh.instanceMatrix.needsUpdate = true; if (loadMesh.instanceColor) loadMesh.instanceColor.needsUpdate = true;
  // labels
  for (const c of colonies) {
    const show = !nestMode;
    const top = MOUNDS[c.stage].h + (d < 600 ? 16 : 6);
    const big = show && !c.hidden && d < (c.tile === HOME || c.tile === EXPAND ? 1500 : c.owner === 'ally' ? 1500 : 1100) && d > 9;
    place(c.el, c.group.position.x, top, c.group.position.z, big);
    place(c.dot, c.group.position.x, 6, c.group.position.z, show && !big && d >= 900);
    if (big) c.el.classList.toggle('slim', d > 600);
  }
  for (const g of REGIONS) place(g.el, g.cx, 40, g.cz, !nestMode && d > 1100);
  for (const ch of nestChambers) place(ch.el, ch.x, ch.y + NEST_Y, 6, nestMode);
  for (const c of columns) {
    if (!colTags.has(c)) colTags.set(c, tag('tag small coltag', c.label));
    const k = clamp(c.loop ? 0.5 : c.t0, 0, 1);
    const p = c.curve.getPoint(k);
    place(colTags.get(c), p.x, 6, p.z, !nestMode && d < 700 && d > 30);
  }
  for (const [c, el] of colTags) if (!columns.includes(c)) { el.remove(); colTags.delete(c); }
  unclutter([...colonies.map((c) => c.el), ...colTags.values()]);
  // scale bar: how much of the yard is in view
  const across = 2 * d * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect;
  const m = across / 100;
  $('#scale').textContent = nestMode ? 'Your nest · 35 cm deep' : `View ≈ ${m >= 1 ? m.toFixed(m >= 10 ? 0 : 1) + ' m' : Math.round(across) + ' cm'} across · ${Math.round(across / 0.5).toLocaleString('en')} ant lengths`;
  ui();
  if (draw) renderer.render(scene, camera);
}
resize();
frame();
// for testing: run the scene forward n frames without waiting for the browser to draw
window.__yard = { view, goal, fly, act, dive, surface, step(n = 20) { for (let i = 0; i < n; i++) tick(0.05, i === n - 1); } };
