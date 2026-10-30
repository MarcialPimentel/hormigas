import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';

/* Hormigas, "Sunlit Microcosm" mock-up. One camera, three scales (Garden → Patch → Nest).
   Everything is built from primitives in code. Numbers are made up: in the game the server decides. */

const $ = (id) => document.getElementById(id);
const stage = $('stage'), canvas = $('scene'), labelsEl = $('labels'), hazeEl = $('haze');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const Q = coarse ? 0.5 : 1;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (e) {
  $('fallback').textContent = 'This mock-up needs WebGL, which is turned off in this browser. The proposal below reads fine without it.';
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// ---------------------------------------------------------------- helpers
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261030);
const R = (a, b) => a + (b - a) * rnd();
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0), XAX = V3(1, 0, 0), ZAX = V3(0, 0, 1);
const fmt = (n) => Math.round(n).toLocaleString('en-US');

const tweens = [];
function tween(dur, fn, done) { tweens.push({ t: 0, dur: reduced ? Math.min(dur, 0.25) : dur, fn, done }); }
function later(s, done) { tweens.push({ t: 0, dur: s, fn: () => {}, done }); }

const mats = new Map();
function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o }));
  return mats.get(k);
}
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function shadows(o, cast = true, receive = true) { o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive; } }); return o; }

const U = {
  time: { value: 0 },
  rim: { value: new THREE.Color(0.55, 0.38, 0.12) },
  grassRim: { value: new THREE.Color(0.28, 0.36, 0.05) },
  wind: { value: reduced ? 0 : 0.11 },
  grassGlow: { value: 0.22 },
};

// ---------------------------------------------------------------- the ant (one shared 3D body plan, instanced)
function ell(sx, sy, sz, x, y, z, rz = 0) {
  const g = new THREE.SphereGeometry(1, 9, 6); g.scale(sx, sy, sz); g.rotateZ(rz); g.translate(x, y, z); return g;
}
function seg(a, b, r, r2 = r * 0.75) {
  const d = new THREE.Vector3().subVectors(b, a); const len = d.length();
  const g = new THREE.CylinderGeometry(r2, r, len, 5, 1, true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  const m = a.clone().add(b).multiplyScalar(0.5); g.translate(m.x, m.y, m.z); return g;
}
function mergeParts(parts) {
  const pos = [], nor = [], leg = [];
  for (const { g, lf } of parts) {
    const G = g.index ? g.toNonIndexed() : g;
    const P = G.attributes.position, N = G.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      pos.push(x, y, z); nor.push(N.getX(i), N.getY(i), N.getZ(i));
      if (lf) { const l = lf(x, y, z); leg.push(l[0], l[1]); } else leg.push(0, 0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('aLeg', new THREE.Float32BufferAttribute(leg, 2));
  geo.computeBoundingSphere();
  return geo;
}
/** Gaster · petiole · mesosoma · head · mandibles · elbowed antennae · six legs (docs/18-art-direction.md). */
function antGeometry(o = {}) {
  const head = o.head ?? 1, gas = o.gaster ?? 1, jaw = o.jaw ?? 1, slim = o.slim ?? 1;
  const parts = []; const body = (g) => parts.push({ g });
  body(ell(0.2 * gas, 0.14 * gas * slim, 0.15 * gas * slim, -0.27 - 0.1 * (gas - 1), 0.17 + 0.03 * (gas - 1), 0, 0.25));
  if (o.nodes === 2) { body(ell(0.04, 0.045, 0.035, -0.11, 0.15, 0)); body(ell(0.036, 0.042, 0.033, -0.05, 0.15, 0)); }
  else body(ell(0.04, 0.05, 0.035, -0.08, 0.15, 0));
  body(ell(0.12, 0.062, 0.06 * slim, 0.03, 0.155, 0, -0.15));
  const hx = 0.19 + 0.06 * (head - 1);
  body(ell(0.085 * head, 0.075 * head, 0.08 * head, hx, 0.17 + 0.012 * (head - 1), 0));
  for (const s of [1, -1]) {
    const jb = V3(hx + 0.07 * head, 0.14, s * 0.03 * head);
    const jt = o.sickle ? V3(hx + 0.07 * head + 0.13, 0.12, s * -0.01) : V3(hx + 0.07 * head + 0.09 * jaw, 0.13, s * 0.005);
    body(seg(jb, jt, 0.016 * Math.sqrt(head), 0.006));
    const a0 = V3(hx + 0.04 * head, 0.2 + 0.03 * (head - 1), s * 0.03), a1 = V3(hx + 0.08, 0.3 + 0.03 * (head - 1), s * 0.07), a2 = V3(hx + 0.22, 0.27, s * 0.12);
    body(seg(a0, a1, 0.009)); body(seg(a1, a2, 0.008, 0.005));
  }
  const hips = [0.08, 0.025, -0.03], kneeDx = [0.07, 0, -0.07], footDx = [0.2, 0.03, -0.2];
  const legK = o.legs ?? 1;
  for (let k = 0; k < 3; k++) for (const s of [1, -1]) {
    const hip = V3(hips[k], 0.13, s * 0.035);
    const knee = V3(hips[k] + kneeDx[k] * legK, 0.21, s * 0.15 * legK);
    const foot = V3(hips[k] + footDx[k] * legK, 0, s * 0.25 * legK);
    const grp = k % 2 === 0 ? s : -s; // tripod gait: near front, far middle, near hind swing together
    const reach = foot.distanceTo(hip);
    const lf = (x, y, z) => [grp, clamp(Math.hypot(x - hip.x, y - hip.y, z - hip.z) / reach, 0, 1)];
    parts.push({ g: seg(hip, knee, 0.016, 0.012), lf });
    parts.push({ g: seg(knee, foot, 0.012, 0.006), lf });
  }
  return mergeParts(parts);
}
const GEO = {
  worker: antGeometry(),
  soldier: antGeometry({ head: 1.45, jaw: 1.3 }),
  queen: antGeometry({ gaster: 1.75, head: 1.1 }),
  army: antGeometry({ slim: 0.8, nodes: 2, legs: 1.15 }),
  armyMajor: antGeometry({ slim: 0.85, nodes: 2, legs: 1.1, head: 1.35, sickle: true }),
};

// Legs swing in the vertex shader (no per-ant simulation), and a warm rim makes the chitin glow against the light.
const ANT_MAT = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.06 });
ANT_MAT.onBeforeCompile = (sh) => {
  sh.uniforms.uTime = U.time; sh.uniforms.uRim = U.rim;
  sh.vertexShader = 'attribute vec2 aLeg;\nattribute float aPhase;\nattribute float aSpeed;\nuniform float uTime;\n' +
    sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      float on = step(0.001, aSpeed);
      float ph = uTime * aSpeed + aPhase;
      transformed.x += sin(ph) * aLeg.x * 0.07 * aLeg.y * on;
      transformed.y += max(0.0, cos(ph) * aLeg.x) * 0.045 * aLeg.y * on;
      transformed.y += (1.0 - abs(aLeg.x)) * abs(sin(ph)) * 0.006 * on;`);
  sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `
      float rimF = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
      gl_FragColor.rgb += uRim * rimF * rimF;
      #include <dithering_fragment>`);
};

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _d = new THREE.Vector3(), _v = new THREE.Vector3();
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
const CARGO_OFF = new THREE.Matrix4().compose(V3(0.4, 0.22, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0.3, 0.25)), V3(1, 1, 1));
const LEAF_BIT = (() => { const g = new THREE.CylinderGeometry(0.17, 0.17, 0.025, 7); g.scale(1, 1, 0.75); return g; })();
const CHUNK = new THREE.DodecahedronGeometry(0.1);
const DROP = new THREE.SphereGeometry(0.11, 10, 8);

class AntGroup {
  constructor(parent, geo, n, o = {}) {
    n = Math.max(1, Math.round(n));
    this.n = n; this.s = o.scale ?? 1;
    const g = geo.clone();
    this.ph = new Float32Array(n); this.sp = new Float32Array(n);
    for (let i = 0; i < n; i++) this.ph[i] = rnd() * 6.283;
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(this.ph, 1));
    this.spA = new THREE.InstancedBufferAttribute(this.sp, 1); this.spA.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aSpeed', this.spA);
    this.mesh = new THREE.InstancedMesh(g, ANT_MAT, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.castShadow = !!o.shadow && !coarse;
    const base = new THREE.Color(o.color ?? '#D9934A'), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      c.copy(base).offsetHSL((rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.1, (rnd() - 0.5) * 0.07);
      this.mesh.setColorAt(i, c); this.mesh.setMatrixAt(i, ZERO_M);
    }
    this.mesh.visible = false; parent.add(this.mesh);
    this.lane = new Float32Array(n); this.seed = new Float32Array(n); this.vf = new Float32Array(n); this.u = new Float32Array(n);
    for (let i = 0; i < n; i++) { this.lane[i] = rnd() * 2 - 1; this.seed[i] = rnd() * 100; this.vf[i] = 0.88 + rnd() * 0.24; this.u[i] = rnd(); }
    if (o.cargo) {
      this.cargo = new THREE.InstancedMesh(o.cargoGeo ?? LEAF_BIT, mat(o.cargo, { roughness: 0.6, emissive: o.cargo, emissiveIntensity: 0.12 }), n);
      this.cargo.frustumCulled = false; this.cargo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < n; i++) this.cargo.setMatrixAt(i, ZERO_M);
      this.cargo.visible = false; parent.add(this.cargo);
    }
  }
  put(i, x, y, z, yaw, step = 15, carry = false, pitch = 0, scale = this.s, flip = false) {
    _q.setFromAxisAngle(UP, yaw);
    if (pitch) { _q2.setFromAxisAngle(ZAX, pitch); _q.multiply(_q2); }
    if (flip) { _q2.setFromAxisAngle(XAX, Math.PI); _q.multiply(_q2); }
    _p.set(x, y + (flip ? 0.24 * scale : 0), z); _s.setScalar(scale);
    _m.compose(_p, _q, _s); this.mesh.setMatrixAt(i, _m); this.sp[i] = step; this.mesh.visible = true;
    if (this.cargo) { if (carry) { _m2.multiplyMatrices(_m, CARGO_OFF); this.cargo.setMatrixAt(i, _m2); this.cargo.visible = true; } else this.cargo.setMatrixAt(i, ZERO_M); }
  }
  hide(i) { this.mesh.setMatrixAt(i, ZERO_M); this.sp[i] = 0; if (this.cargo) this.cargo.setMatrixAt(i, ZERO_M); }
  hideAll() { for (let i = 0; i < this.n; i++) this.hide(i); this.commit(); this.mesh.visible = false; if (this.cargo) this.cargo.visible = false; }
  commit() { this.mesh.instanceMatrix.needsUpdate = true; this.spA.needsUpdate = true; if (this.cargo) this.cargo.instanceMatrix.needsUpdate = true; }
}

class Path {
  constructor(pts) {
    this.p = pts; this.c = new Float32Array(pts.length);
    for (let i = 1; i < pts.length; i++) this.c[i] = this.c[i - 1] + pts[i].distanceTo(pts[i - 1]);
    this.L = this.c[pts.length - 1];
  }
  at(d, out, dir) {
    const c = this.c, p = this.p; d = clamp(d, 0, this.L);
    let lo = 0, hi = p.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= d) lo = m; else hi = m; }
    const k = (d - c[lo]) / (c[hi] - c[lo] || 1);
    out.lerpVectors(p[lo], p[hi], k);
    if (dir) dir.subVectors(p[hi], p[lo]).normalize();
    return out;
  }
}

// ---------------------------------------------------------------- grass (instanced blades, sway in the shader)
const BLADE = (() => {
  const g = new THREE.PlaneGeometry(1, 1, 1, 5); const p = g.attributes.position; const col = [];
  const c0 = new THREE.Color('#2E5E25'), c1 = new THREE.Color('#BCE35C'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + 0.5; const w = 1 - y * 0.92;
    p.setXYZ(i, p.getX(i) * w, y, y * y * 0.28);
    c.copy(c0).lerp(c1, Math.pow(y, 0.8)); col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
})();
const GRASS_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.72 });
GRASS_MAT.onBeforeCompile = (sh) => {
  sh.uniforms.uTime = U.time; sh.uniforms.uWind = U.wind; sh.uniforms.uRim = U.grassRim;
  sh.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      #ifdef USE_INSTANCING
      float wp = uTime * 1.5 + instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;
      #else
      float wp = uTime * 1.5;
      #endif
      float bend = position.y * position.y * uWind;
      transformed.x += sin(wp) * bend;
      transformed.z += (0.5 + 0.5 * cos(wp * 0.73)) * bend * 0.6;`);
  sh.uniforms.uGlow = U.grassGlow;
  sh.fragmentShader = 'uniform vec3 uRim;\nuniform float uGlow;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `
      gl_FragColor.rgb += vColor * uGlow;
      float rimG = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
      gl_FragColor.rgb += uRim * rimG * rimG;
      #include <dithering_fragment>`);
};
function blades(parent, list, cast = true) {
  const im = new THREE.InstancedMesh(BLADE, GRASS_MAT, Math.max(1, list.length));
  const c = new THREE.Color();
  list.forEach((b, i) => {
    _q.setFromEuler(new THREE.Euler(b.tilt ?? R(-0.15, 0.15), b.yaw ?? R(0, 6.28), b.lean ?? R(-0.12, 0.12)));
    _m.compose(_p.set(b.x, b.y, b.z), _q, _s.set(b.w, b.h, b.w * 1.5));
    im.setMatrixAt(i, _m); im.setColorAt(i, c.set(b.c ?? '#ffffff'));
  });
  im.castShadow = cast && !coarse; im.receiveShadow = true;
  parent.add(im); return im;
}

// ---------------------------------------------------------------- shared textures
const glowTex = canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.95)');
  gr.addColorStop(0.36, 'rgba(255,255,255,0.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
});
function dotTex(color) {
  const t = canvasTex(64, 16, (g) => {
    g.fillStyle = color; g.beginPath(); g.arc(18, 8, 6.5, 0, 7); g.fill();
    g.globalAlpha = 0.45; g.beginPath(); g.arc(48, 8, 4, 0, 7); g.fill();
  });
  t.wrapS = THREE.RepeatWrapping; return t;
}
/** A pheromone trail: scent dots flowing along the path, in the owner's colour (the tech tree's dot line, on the ground). */
function trail(world, pts, color, o = {}) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const len = curve.getLength();
  const geo = new THREE.TubeGeometry(curve, Math.ceil(len * (o.res ?? 3)), o.r ?? 0.07, 4, false);
  const tex = dotTex(color); tex.repeat.set(len * (o.dots ?? 1.6), 1);
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: o.opacity ?? 0.95, depthWrite: false });
  const mesh = new THREE.Mesh(geo, m); mesh.renderOrder = 2; world.scene.add(mesh);
  world.tick.push((t, dt) => { tex.offset.x -= dt * (o.flow ?? 0.9); });
  mesh.userData.reveal = (k) => geo.setDrawRange(0, Math.floor((geo.index.count * clamp(k, 0, 1)) / 6) * 6);
  return mesh;
}
/** Out-of-focus grass across the bottom of the lens: the cheapest way to say "macro". */
function lensTex() {
  return canvasTex(1024, 300, (g, w, h) => {
    g.shadowOffsetX = -4000;
    for (let i = 0; i < 52; i++) {
      const edge = rnd() < 0.82;
      const x = (edge ? (rnd() < 0.5 ? rnd() * 300 : w - rnd() * 300) : rnd() * w) + 4000;
      const bw = R(14, 52), bh = edge ? R(140, 300) : R(40, 120), lean = R(-180, 180);
      g.shadowBlur = R(14, 30);
      g.shadowColor = pick(['rgba(40,84,34,0.95)', 'rgba(86,132,46,0.9)', 'rgba(120,160,60,0.75)', 'rgba(28,60,30,0.95)']);
      g.fillStyle = '#000'; g.beginPath(); g.moveTo(x - bw / 2, h + 10);
      g.quadraticCurveTo(x + lean * 0.3, h - bh * 0.6, x + lean, h - bh);
      g.quadraticCurveTo(x + lean * 0.3 + bw * 0.3, h - bh * 0.55, x + bw / 2, h + 10); g.fill();
    }
  });
}
// ---------------------------------------------------------------- worlds, light, day and night
const worlds = {};
function makeWorld(name, level, cfg) {
  const scene = new THREE.Scene();
  const skyC = document.createElement('canvas'); skyC.width = 2; skyC.height = 256;
  const sky = new THREE.CanvasTexture(skyC); sky.colorSpace = THREE.SRGBColorSpace; scene.background = sky;
  scene.fog = new THREE.Fog(0xffffff, cfg.fog[0], cfg.fog[1]);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x886644, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.copy(cfg.sun); scene.add(sun, sun.target);
  if (cfg.shadow) {
    sun.castShadow = true; const n = coarse ? 1024 : 2048; sun.shadow.mapSize.set(n, n);
    const c = sun.shadow.camera; c.left = c.bottom = -cfg.shadow; c.right = c.top = cfg.shadow; c.near = 1; c.far = 220;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; c.updateProjectionMatrix();
  }
  const w = { name, level, scene, skyC, sky, hemi, sun, cfg, taps: [], labels: [], tick: [], night: [], chips: () => [] };
  worlds[name] = w; return w;
}
const SKY = {
  day: { top: '#5BAAE0', mid: '#B8DCEA', bot: '#F5E2B5', hs: '#E4F2FF', hg: '#A0824C', hi: 1.1, sc: '#FFE2A6', si: 2.0, rim: [0.55, 0.38, 0.12], grim: [0.28, 0.36, 0.05] },
  night: { top: '#050A18', mid: '#131D43', bot: '#2B2954', hs: '#6475B5', hg: '#251C2C', hi: 0.42, sc: '#A9BCFF', si: 0.5, rim: [0.1, 0.13, 0.3], grim: [0.04, 0.07, 0.14] },
};
const cA = new THREE.Color(), cB = new THREE.Color();
const mixHex = (a, b, k) => '#' + cA.set(a).lerp(cB.set(b), k).getHexString();
let night = 0, nightGoal = 0;
function applyNight(w, k) {
  const g = w.skyC.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, mixHex(SKY.day.top, SKY.night.top, k));
  gr.addColorStop(0.6, mixHex(SKY.day.mid, SKY.night.mid, k));
  gr.addColorStop(1, mixHex(SKY.day.bot, SKY.night.bot, k));
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256); w.sky.needsUpdate = true;
  w.scene.fog.color.set(mixHex(SKY.day.bot, SKY.night.bot, k));
  w.hemi.color.set(mixHex(SKY.day.hs, SKY.night.hs, k)); w.hemi.groundColor.set(mixHex(SKY.day.hg, SKY.night.hg, k));
  w.hemi.intensity = lerp(SKY.day.hi, SKY.night.hi, k) * (w.cfg.hemiK ?? 1);
  w.sun.color.set(mixHex(SKY.day.sc, SKY.night.sc, k)); w.sun.intensity = lerp(SKY.day.si, SKY.night.si, k) * (w.cfg.sunK ?? 1);
  U.rim.value.setRGB(...SKY.day.rim.map((v, i) => lerp(v, SKY.night.rim[i], k)));
  U.grassRim.value.setRGB(...SKY.day.grim.map((v, i) => lerp(v, SKY.night.grim[i], k)));
  U.grassGlow.value = lerp(0.22, 0.02, k);
  for (const f of w.night) f(k);
}

const camera = new THREE.PerspectiveCamera(40, 1, 0.04, 700);
const TANH = Math.tan(THREE.MathUtils.degToRad(20));
const fitDist = (w, h) => Math.max(w / (2 * TANH * camera.aspect), h / (2 * TANH));
const view = { tx: 0, ty: 0, tz: 0, yaw: 0, pitch: 0.6, dist: 40 }, goal = { ...view };

// Lens layers ride on the camera.
const lensFg = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: lensTex(), transparent: true, depthTest: false, depthWrite: false, fog: false }));
const bokehMat = new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 34, 64, 64, 62); gr.addColorStop(0, 'rgba(255,242,210,0.35)'); gr.addColorStop(0.86, 'rgba(255,236,190,0.75)'); gr.addColorStop(1, 'rgba(255,236,190,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
}), transparent: true, depthTest: false, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
const lensBk = new THREE.Group(); const bokehSpots = Array.from({ length: 9 }, () => ({ x: R(-1, 1), y: R(0.3, 0.95), r: R(0.05, 0.12), m: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bokehMat) }));
for (const b of bokehSpots) { b.m.renderOrder = 999; lensBk.add(b.m); }
lensFg.renderOrder = 1000; camera.add(lensFg, lensBk);
function fitLens() {
  const h = 2 * TANH * 1, w = h * camera.aspect;
  lensFg.position.set(0, -h / 2 + h * 0.17, -1); lensFg.scale.set(w * 1.08, h * 0.34, 1);
  for (const b of bokehSpots) { b.m.position.set((b.x * w) / 2, (b.y * h) / 2, -1.01); b.m.scale.setScalar(b.r * h); }
}

// ================================================================ THE PATCH (the "solar system": your neighbourhood)
const P = makeWorld('patch', 1, { fog: [75, 200], sun: V3(-38, 34, -26), shadow: 46 });
const ANT = 0.36; // an ant's length in patch units (1 unit ≈ 14 mm)
const ME = { x: -3, z: 6 }, SUR = { x: 6, z: -5 }, WILD = { x: 12.5, z: 8 }, SCENT = { x: -15, z: -7 };
const MOUNDS = [
  { ...ME, soil: '#C8A06A', flag: '#FFC93C' },
  { ...SUR, soil: '#C9A574', flag: '#E39A3B' },
  { ...WILD, soil: '#8C6A4A', flag: '#C4473A' },
];
const LOG = { x: 16.5, z: -9, yaw: 0.35, len: 15, r: 2.35 };
function baseH(x, z) {
  return 0.22 * Math.sin(x * 0.19 + 1.3) * Math.cos(z * 0.17) + 0.1 * Math.sin(x * 0.53 + z * 0.31) + 0.05 * Math.sin(x * 1.7) * Math.sin(z * 1.3) - 0.95 * smooth(-16.5, -19.5, z);
}
const moundProfile = (d) => (d < 0.62 ? lerp(-0.05, 0.8, smooth(0.3, 0.62, d)) : 0.8 * Math.exp(-(((d - 0.62) / 1.05) ** 2)));
function gH(x, z) {
  let h = baseH(x, z);
  for (const m of MOUNDS) { const d2 = (x - m.x) ** 2 + (z - m.z) ** 2; if (d2 < 10) h += moundProfile(Math.sqrt(d2)); }
  return h;
}
function groundPath(pts2, step = 0.2) {
  const curve = new THREE.CatmullRomCurve3(pts2.map(([x, z]) => V3(x, 0, z)), false, 'centripetal');
  const pts = curve.getSpacedPoints(Math.max(8, Math.ceil(curve.getLength() / step)));
  for (const v of pts) v.y = gH(v.x, v.z);
  return new Path(pts);
}
const lifted = (path, dy = 0.045) => path.p.map((v) => v.clone().setY(v.y + dy));

// Paths first: the grass keeps clear of trails.
const PATH = {
  meadow: groundPath([[ME.x, ME.z], [-7, 5.4], [-11, 6.4], [-15, 6.3], [-19, 5], [-23.4, 3.4]]),
  sur: groundPath([[SUR.x, SUR.z], [10, -1.6], [15, 1.5], [20.5, 1.2], [23, -3], [24.5, -9]]),
  wilds: groundPath([[ME.x, ME.z], [2, 5.1], [7, 4.6], [11, 4.1], [15.5, 3.7], [20, 3.1], [23.5, 1.2], [27, -1.4]]),
  away: groundPath([[ME.x, ME.z], [-6.5, 8.6], [-9.5, 9.8], [-15, 12.6], [-22, 13.2], [-34, 13.5]]),
};
const trailPts = [];
for (const k of ['meadow', 'sur', 'wilds', 'away']) for (let d = 0; d < PATH[k].L; d += 0.5) trailPts.push(PATH[k].at(d, new THREE.Vector3()));
function nearTrail(x, z, r) { const r2 = r * r; for (const p of trailPts) if ((p.x - x) ** 2 + (p.z - z) ** 2 < r2) return true; return false; }
function onLog(x, z, pad = 0) {
  const c = Math.cos(LOG.yaw), s = Math.sin(LOG.yaw), dx = x - LOG.x, dz = z - LOG.z;
  const along = dx * s + dz * c, across = dx * c - dz * s;
  return Math.abs(along) < LOG.len / 2 + pad && Math.abs(across) < LOG.r + pad;
}
const WILDSITES = { aphid: { x: 28.5, z: -7 }, termite: { x: 28.6, z: 4 }, spider: { x: 29.2, z: 11.5 } };
function clearOf(x, z, trailR = 0.7) {
  for (const m of MOUNDS) if ((x - m.x) ** 2 + (z - m.z) ** 2 < 7) return false;
  for (const k in WILDSITES) { const s = WILDSITES[k]; if ((x - s.x) ** 2 + (z - s.z) ** 2 < 4.5) return false; }
  if (onLog(x, z, 0.3)) return false;
  if (trailR && nearTrail(x, z, trailR)) return false;
  return true;
}

// Ground: bands like the game's patch (meadow, sand, grassland, the log, the creek bank, the wilds).
{
  const geo = new THREE.PlaneGeometry(230, 180, 230, 180); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = []; const c = new THREE.Color(), c2 = new THREE.Color();
  const BANDS = [[-99, '#89BC4C', '#B2D35C'], [-20, '#D9B37B', '#E9CC97'], [-10, '#6BA43F', '#8CC14E'], [12, '#5A4230', '#6F8C3B'], [20, '#7D6C50', '#5F6849'], [26, '#3D6B2B', '#567F33']];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, baseH(x, z));
    let b = 0; for (let j = 0; j < BANDS.length; j++) if (x >= BANDS[j][0]) b = j;
    const n = 0.5 + 0.5 * Math.sin(x * 2.1 + z * 1.3) * Math.sin(x * 0.7 - z * 2.3);
    c.set(BANDS[b][1]).lerp(c2.set(BANDS[b][2]), n);
    if (b > 0) { const edge = smooth(1.6, 0, x - BANDS[b][0]); if (edge > 0) c.lerp(c2.set(BANDS[b - 1][1]), edge * 0.5); }
    for (const m of MOUNDS) { const d = Math.hypot(x - m.x, z - m.z); if (d < 3.4) c.lerp(c2.set(m.soil), smooth(3.4, 1.4, d) * 0.85); }
    const ds = Math.hypot(x - SCENT.x, z - SCENT.z); if (ds < 2.2) c.lerp(c2.set('#4E5A33'), smooth(2.2, 0.4, ds) * 0.35);
    if (z < -15) c.lerp(c2.set('#55503A'), smooth(-15, -18, z) * 0.6);
    if (Math.abs(x) > 34 || z > 25) c.lerp(c2.set('#4F7F34'), 0.5);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  ground.receiveShadow = true; P.scene.add(ground); P.ground = ground;
}
// The creek along the back.
{
  const geo = new THREE.PlaneGeometry(110, 9, 90, 8); geo.rotateX(-Math.PI / 2); geo.translate(0, -0.62, -21.5);
  const water = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#3F9DC6', roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.86, flatShading: true }));
  water.receiveShadow = true; P.scene.add(water);
  const base = geo.attributes.position.array.slice();
  P.tick.push((t) => {
    if (reduced) return; const a = geo.attributes.position;
    for (let i = 0; i < a.count; i++) a.setY(i, base[i * 3 + 1] + 0.05 * Math.sin(base[i * 3] * 0.9 + t * 1.6) * Math.cos(base[i * 3 + 2] * 1.7 + t));
    a.needsUpdate = true;
  });
}
// Mounds, entrances and flags.
const flags = [];
for (const m of MOUNDS) {
  const pts = [V3(0.28, -0.45, 0)]; for (let d = 0.3; d <= 2.8; d += 0.1) pts.push(V3(d, moundProfile(d), 0));
  const geo = new THREE.LatheGeometry(pts.map((v) => new THREE.Vector2(v.x, v.y)), 28).toNonIndexed();
  const c = new THREE.Color(), base = new THREE.Color(m.soil), col = [];
  for (let i = 0; i < geo.attributes.position.count; i += 3) { c.copy(base).offsetHSL(0, R(-0.05, 0.05), R(-0.06, 0.05)); for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b); }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
  const mound = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  mound.position.set(m.x, baseH(m.x, m.z), m.z); shadows(mound); P.scene.add(mound);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), mat('#140C07')); hole.rotation.x = -Math.PI / 2; hole.position.set(m.x, baseH(m.x, m.z) - 0.3, m.z); P.scene.add(hole);
  const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 2.6, 5), mat('#6E5236')); twig.position.set(m.x + 1.15, gH(m.x + 1.15, m.z - 0.6) + 1.2, m.z - 0.6); P.scene.add(shadows(twig));
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.55, 6, 1).translate(0.48, 0, 0), mat(m.flag, { side: THREE.DoubleSide, roughness: 0.7, emissive: m.flag, emissiveIntensity: 0.15 }));
  cloth.position.set(twig.position.x, twig.position.y + 0.95, twig.position.z); P.scene.add(shadows(cloth)); flags.push(cloth);
  m.mound = mound;
}
P.tick.push((t) => { flags.forEach((f, i) => { f.rotation.y = 0.5 + Math.sin(t * 2.2 + i) * (reduced ? 0 : 0.35); }); });
// Excavated pellets around the mounds.
{
  const list = []; for (const m of MOUNDS) for (let i = 0; i < 70 * Q + 10; i++) { const a = R(0, 6.28), d = R(0.7, 2.6); list.push([m.x + Math.cos(a) * d, m.z + Math.sin(a) * d, m.soil]); }
  const im = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.075), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), list.length);
  const c = new THREE.Color();
  list.forEach(([x, z, s], i) => { _m.compose(_p.set(x, gH(x, z) + 0.03, z), _q.setFromEuler(new THREE.Euler(R(0, 3), R(0, 3), 0)), _s.setScalar(R(0.7, 1.5))); im.setMatrixAt(i, _m); im.setColorAt(i, c.set(s).offsetHSL(0, 0, R(-0.08, 0.1))); });
  im.receiveShadow = true; P.scene.add(im);
}
// The rotting log, with moss and bracket fungus.
{
  const g = new THREE.Group(); g.position.set(LOG.x, 0.9, LOG.z); g.rotation.y = LOG.yaw; P.scene.add(g);
  const geo = new THREE.CylinderGeometry(LOG.r, LOG.r * 1.05, LOG.len, 18, 10); geo.rotateX(Math.PI / 2);
  const pos = geo.attributes.position, col = []; const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); const a = Math.atan2(y, x); const r = Math.hypot(x, y);
    if (r > 0.5) { const k = 1 + 0.05 * Math.sin(a * 17 + z * 0.4) + 0.03 * Math.sin(z * 1.3); pos.setX(i, x * k); pos.setY(i, y * k); }
    c.set(Math.sin(a * 17 + z * 0.4) > 0.3 ? '#5B3F2D' : '#7B5A40'); if (y > 1.4 && Math.sin(z * 0.9 + a * 3) > 0) c.lerp(new THREE.Color('#7DAF3C'), 0.55);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
  g.add(shadows(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }))));
  const ring = canvasTex(256, 256, (x) => { for (let r = 128; r > 0; r -= 7) { x.fillStyle = r % 14 ? '#C9A27A' : '#B38660'; x.beginPath(); x.arc(128, 128, r, 0, 7); x.fill(); } x.fillStyle = '#6E4C34'; x.beginPath(); x.arc(128, 128, 30, 0, 7); x.fill(); });
  for (const s of [1, -1]) { const cap = new THREE.Mesh(new THREE.CircleGeometry(LOG.r * 1.02, 24), new THREE.MeshStandardMaterial({ map: ring, roughness: 0.9 })); cap.position.z = (s * LOG.len) / 2; cap.rotation.y = s > 0 ? 0 : Math.PI; g.add(cap); }
  const fungus = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.75, 0.75, 0.14, 14, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ roughness: 0.6 }), 12);
  const fc = new THREE.Color();
  for (let i = 0; i < 12; i++) {
    const side = i < 7 ? 1 : -1, z = R(-5.5, 5.5), y = R(-0.6, 1.2), sc = R(0.6, 1.3);
    _m.compose(_p.set(side * (LOG.r + 0.05), y, z), _q.setFromEuler(new THREE.Euler(0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0)), _s.set(sc, sc, sc));
    fungus.setMatrixAt(i, _m); fungus.setColorAt(i, fc.set(pick(['#F08A3C', '#F6B04E', '#E9DCC2', '#F08A3C'])));
  }
  g.add(shadows(fungus));
}
// Pebbles, a few boulders, dew, the lost marble, a bottle cap and a fallen leaf: true-size things that make an ant tiny.
{
  const list = [];
  for (let i = 0; i < 70; i++) { const x = R(-20, -10), z = R(-16, 22); if (clearOf(x, z, 0.5)) list.push([x, z, R(0.12, 0.55)]); }
  for (let i = 0; i < 40; i++) { const x = R(19.5, 26), z = R(-16, 18); if (clearOf(x, z, 0.5)) list.push([x, z, R(0.12, 0.6)]); }
  list.push([-17.8, -2.5, 1.7], [-12.4, -12.5, 1.25], [-18.6, 15, 1.4], [21.5, 15.5, 1.5]);
  const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), list.length);
  const c = new THREE.Color();
  list.forEach(([x, z, r], i) => { _m.compose(_p.set(x, gH(x, z) + r * 0.3, z), _q.setFromEuler(new THREE.Euler(R(0, 3), R(0, 3), R(0, 3))), _s.set(r * R(0.9, 1.3), r * R(0.6, 0.9), r)); im.setMatrixAt(i, _m); im.setColorAt(i, c.set(pick(['#B8B2A6', '#ECE6DA', '#C98F7A', '#8E8A84', '#D8B989', '#A7B3B8']))); });
  P.scene.add(shadows(im));
  const dew = []; for (let i = 0; i < 46; i++) { const x = R(-28, 12), z = R(-14, 22); if (clearOf(x, z, 0.4)) dew.push([x, z, R(0.1, 0.32)]); }
  const dm = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ color: '#E8F8FF', roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.55, emissive: '#A8DCFF', emissiveIntensity: 0.18 }), dew.length);
  dew.forEach(([x, z, r], i) => { _m.compose(_p.set(x, gH(x, z) + r * 0.55, z), _q.identity(), _s.set(r, r * 0.8, r)); dm.setMatrixAt(i, _m); });
  P.scene.add(dm);
  const marble = new THREE.Group(); marble.position.set(-8.6, gH(-8.6, 2.4) + 0.55, 2.4); P.scene.add(marble);
  marble.add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 32, 24), new THREE.MeshPhysicalMaterial({ color: '#3C9BE8', roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.03, transparent: true, opacity: 0.72 })));
  const swirl = new THREE.Mesh(new THREE.TorusKnotGeometry(0.22, 0.05, 64, 6, 2, 3), mat('#FF8A3D', { emissive: '#FF8A3D', emissiveIntensity: 0.35, roughness: 0.4 })); marble.add(swirl);
  marble.children[0].castShadow = true; P.marble = marble;
  const capGeo = new THREE.CylinderGeometry(0.9, 0.96, 0.24, 42, 1, true);
  const cp = capGeo.attributes.position; for (let i = 0; i < cp.count; i++) { const k = (Math.round(Math.atan2(cp.getZ(i), cp.getX(i)) / (Math.PI / 21)) % 2) ? 1.055 : 1; cp.setX(i, cp.getX(i) * k); cp.setZ(i, cp.getZ(i) * k); }
  capGeo.computeVertexNormals();
  const cap = new THREE.Group(); cap.position.set(-16.3, gH(-16.3, 3.3) + 0.12, 3.3); cap.rotation.z = 0.08; P.scene.add(cap);
  cap.add(shadows(new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({ color: '#D33A2C', metalness: 0.55, roughness: 0.32, side: THREE.DoubleSide }))));
  const capFloor = new THREE.Mesh(new THREE.CircleGeometry(0.92, 30), mat('#ECE4DA', { metalness: 0.4, roughness: 0.3 })); capFloor.rotation.x = -Math.PI / 2; capFloor.position.y = -0.1; cap.add(capFloor);
  // fallen leaf
  const L = 9.5, W2 = 2.4; const shape = new THREE.Shape(); shape.moveTo(-L / 2, 0);
  for (let i = 1; i <= 24; i++) { const t = i / 24; shape.lineTo(-L / 2 + L * t, W2 * Math.pow(Math.sin(Math.PI * t), 0.75) * (1 - 0.25 * t)); }
  for (let i = 23; i >= 1; i--) { const t = i / 24; shape.lineTo(-L / 2 + L * t, -W2 * Math.pow(Math.sin(Math.PI * t), 0.75) * (1 - 0.25 * t)); }
  const lg = new THREE.ShapeGeometry(shape, 8); const lp = lg.attributes.position, uv = lg.attributes.uv;
  for (let i = 0; i < lp.count; i++) { const x = lp.getX(i), y = lp.getY(i); uv.setXY(i, (x + L / 2) / L, (y + W2) / (2 * W2)); lp.setZ(i, 0.35 * (y / W2) ** 2 + 0.25 * Math.sin((x / L) * Math.PI)); }
  lg.rotateX(-Math.PI / 2); lg.computeVertexNormals();
  const leafTex = canvasTex(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#F4B840'); gr.addColorStop(0.5, '#E8742E'); gr.addColorStop(1, '#F2A93A');
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(120,50,20,0.55)'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke(); g.lineWidth = 2.5;
    for (let i = 1; i < 9; i++) { const x = (i / 9) * w; g.beginPath(); g.moveTo(x, h / 2); g.quadraticCurveTo(x + 30, h / 2 - 40, x + 55, 8); g.moveTo(x, h / 2); g.quadraticCurveTo(x + 30, h / 2 + 40, x + 55, h - 8); g.stroke(); }
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(110,60,20,0.25)'; g.beginPath(); g.arc(R(0, w), R(0, h), R(2, 8), 0, 7); g.fill(); }
  });
  const leaf = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ map: leafTex, side: THREE.DoubleSide, roughness: 0.75 }));
  leaf.position.set(-21, gH(-21, -11.5) + 0.08, -11.5); leaf.rotation.y = 0.6; P.scene.add(shadows(leaf));
}
// Flowers in the meadow: a canopy of colour far over the ants' heads.
{
  const FL = [['#FFD23F', '#E39B12'], ['#F6B6D2', '#F7E9A6'], ['#FBF7EE', '#F2B92B'], ['#FF6B4F', '#2B1D13'], ['#5C82EA', '#F4E7B8'], ['#FFD23F', '#E39B12']];
  const spots = []; for (let i = 0; i < 26 * (coarse ? 0.7 : 1); i++) { const x = R(-31, -19.5), z = R(-15, 21); if (clearOf(x, z, 1.4)) spots.push([x, z]); }
  spots.push([-6, -12], [2, 15], [9, 15.5], [-12, -10]);
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 1, 5).translate(0, 0.5, 0), mat('#4F8A35'), spots.length);
  const petals = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6).scale(0.55, 0.09, 0.24).translate(0.55, 0, 0), new THREE.MeshStandardMaterial({ roughness: 0.55, side: THREE.DoubleSide }), spots.length * 7);
  const hearts = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 12, 8).scale(1, 0.55, 1), new THREE.MeshStandardMaterial({ roughness: 0.6 }), spots.length);
  const c = new THREE.Color(); let pi = 0; const head = new THREE.Matrix4();
  spots.forEach(([x, z], i) => {
    const h = R(4, 8), y = gH(x, z), [pc, hc] = pick(FL), size = R(0.9, 1.5);
    _m.compose(_p.set(x, y, z), _q.setFromEuler(new THREE.Euler(R(-0.08, 0.08), 0, R(-0.08, 0.08))), _s.set(1, h, 1)); stems.setMatrixAt(i, _m);
    head.compose(_p.set(x, y + h, z), _q.setFromEuler(new THREE.Euler(R(-0.35, 0.1), R(0, 6), R(-0.2, 0.2))), _s.setScalar(size));
    hearts.setMatrixAt(i, head); hearts.setColorAt(i, c.set(hc));
    for (let k = 0; k < 7; k++) { _m2.makeRotationY((k / 7) * Math.PI * 2); _m.multiplyMatrices(head, _m2); _m2.makeRotationZ(0.18); _m.multiply(_m2); petals.setMatrixAt(pi, _m); petals.setColorAt(pi++, c.set(pc).offsetHSL(0, 0, R(-0.04, 0.04))); }
  });
  P.scene.add(shadows(stems), shadows(petals), shadows(hearts));
}
// Wild things in the wilds strip.
{
  const a = WILDSITES.aphid, y0 = gH(a.x, a.z);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 10, 6).translate(0, 5, 0), mat('#5C9A3A')); stem.position.set(a.x, y0, a.z); stem.rotation.z = -0.06; P.scene.add(shadows(stem));
  const lf = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6).scale(2.4, 0.08, 0.9), mat('#6DB143', { side: THREE.DoubleSide })); lf.position.set(a.x - 1.6, y0 + 6.5, a.z); lf.rotation.z = 0.5; P.scene.add(shadows(lf));
  const aph = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 10, 8).scale(1.3, 0.9, 1), mat('#B5E04A', { roughness: 0.35, emissive: '#7DB321', emissiveIntensity: 0.15 }), 16);
  for (let i = 0; i < 16; i++) { const h = R(2.5, 7.5), ang = R(0, 6.28); _m.compose(_p.set(a.x + Math.cos(ang) * 0.24 - h * 0.006, y0 + h, a.z + Math.sin(ang) * 0.24), _q.setFromEuler(new THREE.Euler(0, ang, 1.2)), _s.setScalar(R(0.8, 1.3))); aph.setMatrixAt(i, _m); }
  P.scene.add(shadows(aph));
  const t = WILDSITES.termite, tg = new THREE.ConeGeometry(1.7, 5.2, 10, 6).translate(0, 2.6, 0); const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) { const k = 1 + 0.12 * Math.sin(tp.getY(i) * 3 + Math.atan2(tp.getZ(i), tp.getX(i)) * 4); tp.setX(i, tp.getX(i) * k); tp.setZ(i, tp.getZ(i) * k); }
  tg.computeVertexNormals();
  const cone = new THREE.Mesh(tg, mat('#C99A60', { flatShading: true, roughness: 1 })); cone.position.set(t.x, gH(t.x, t.z) - 0.1, t.z); P.scene.add(shadows(cone));
  const spire = cone.clone(); spire.scale.set(0.45, 0.6, 0.45); spire.position.x += 1.4; spire.position.z -= 0.6; P.scene.add(spire);
  const s = WILDSITES.spider;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1, 0.12, 20), mat('#EEEBE3', { roughness: 0.9 })); lid.position.set(s.x - 0.3, gH(s.x, s.z) + 0.45, s.z); lid.rotation.z = 0.7; P.scene.add(shadows(lid));
  const pit = new THREE.Mesh(new THREE.CircleGeometry(0.85, 18), mat('#0E0806')); pit.rotation.x = -Math.PI / 2; pit.position.set(s.x, gH(s.x, s.z) + 0.04, s.z); P.scene.add(pit);
  const silk = []; for (let i = 0; i < 9; i++) { const ang = (i / 9) * 6.28; silk.push(V3(s.x, gH(s.x, s.z) + 0.06, s.z), V3(s.x + Math.cos(ang) * 2.4, gH(s.x + Math.cos(ang) * 2.4, s.z + Math.sin(ang) * 2.4) + 0.05, s.z + Math.sin(ang) * 2.4)); }
  P.scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(silk), new THREE.LineBasicMaterial({ color: '#F4F2EC', transparent: true, opacity: 0.7 })));
}
// The grass itself, short in the grassland, tall in the meadow and wilds, a forest of giants round the edge.
{
  const list = []; const n = (k) => Math.round(k * Q);
  const add = (cnt, xr, zr, h, w, tint, trailR = 0.7) => {
    for (let i = 0; i < cnt; i++) {
      const x = R(xr[0], xr[1]), z = R(zr[0], zr[1]);
      if (z < -17.6 || !clearOf(x, z, trailR)) continue;
      list.push({ x, z, y: gH(x, z) - 0.05, h: R(h[0], h[1]), w: R(w[0], w[1]), c: new THREE.Color(pick(tint)).getStyle() });
    }
  };
  add(n(3400), [-10, 12], [-16, 23], [1.4, 3.4], [0.12, 0.2], ['#ffffff', '#f2ffe0', '#e8f5d0', '#fff6d8']);
  add(n(1600), [-33, -19.5], [-16, 23], [2.4, 5.2], [0.14, 0.24], ['#fff8d8', '#f6ffd0', '#ffffff']);
  add(n(160), [-20, -10], [-16, 23], [0.8, 2.2], [0.1, 0.16], ['#fff0c8', '#ffffff']);
  add(n(260), [12, 20], [-16, 23], [0.8, 2.4], [0.12, 0.2], ['#d8f0b0', '#ffffff']);
  add(n(1400), [26.5, 34], [-16, 23], [5, 12], [0.26, 0.4], ['#cfe6c0', '#bcd8b0', '#e0f0c8'], 0);
  add(n(160), [-33, 34], [-17.4, -15.5], [5, 9], [0.12, 0.2], ['#d6efb8', '#c7e0a8']);
  const nearList = []; // the giant backdrop, out past the patch
  for (let i = 0; i < n(1100); i++) {
    const a = R(0, 6.28); let x = Math.cos(a) * R(38, 62), z = Math.sin(a) * R(28, 48);
    if (z > 24) z = R(27, 40);
    const tall = z < -20 ? R(9, 18) : z > 24 ? R(2.5, 5) : R(5, 11);
    nearList.push({ x, z, y: baseH(x, z) - 0.1, h: tall, w: R(0.35, 0.65), c: pick(['#93b47c', '#86a872', '#a2c288', '#7a9c68']) });
  }
  blades(P.scene, list); blades(P.scene, nearList, false);
}
// Trails (scent lines), always there for the colonies' routine runs.
const meadowTrail = trail(P, lifted(PATH.meadow), '#FFC93C');
const surTrail = trail(P, lifted(PATH.sur), '#F0A040', { opacity: 0.75 });
// The scent of a colony you haven't scouted: amber wisps rising from a stain.
{
  const N = 70, pos = new Float32Array(N * 3), life = new Float32Array(N);
  for (let i = 0; i < N; i++) life[i] = rnd();
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTex, color: '#F2B25C', size: 0.55, transparent: true, opacity: 0.8, depthWrite: false }));
  P.scene.add(pts); const y0 = gH(SCENT.x, SCENT.z);
  P.tick.push((t, dt) => {
    for (let i = 0; i < N; i++) {
      life[i] += dt * (reduced ? 0.02 : 0.12); if (life[i] > 1) life[i] -= 1; const k = life[i];
      pos[i * 3] = SCENT.x + Math.sin(k * 7 + i) * (0.3 + k * 1.2); pos[i * 3 + 1] = y0 + k * 7; pos[i * 3 + 2] = SCENT.z + Math.cos(k * 5 + i * 1.7) * (0.3 + k);
    }
    geo.attributes.position.needsUpdate = true;
  });
}
// Fireflies (night only).
function fireflies(world, n, box, size) {
  const pos = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) { seed[i] = rnd() * 100; pos[i * 3] = R(box[0], box[1]); pos[i * 3 + 1] = R(box[2], box[3]); pos[i * 3 + 2] = R(box[4], box[5]); }
  const base = pos.slice(); const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ map: glowTex, color: '#E6FF7A', size, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  world.scene.add(new THREE.Points(geo, m));
  world.night.push((k) => { m.userData.k = k; });
  world.tick.push((t) => {
    m.opacity = (m.userData.k ?? 0) * (0.65 + 0.35 * Math.sin(t * 2.3));
    if (reduced || !m.opacity) return;
    for (let i = 0; i < n; i++) { const s = seed[i]; pos[i * 3] = base[i * 3] + Math.sin(t * 0.3 + s) * 1.5; pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.5 + s * 2) * 0.6; pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.27 + s) * 1.5; }
    geo.attributes.position.needsUpdate = true;
  });
}
fireflies(P, 60, [-32, 32, 2, 9, -16, 22], 0.7);

// ---- life on the patch
const AMBER = '#D9934A', SOLDIER = '#B5662F', RAIDER = '#C4473A', ARMY = '#8E2216';
const pMeadow = new AntGroup(P.scene, GEO.worker, 90 * Q + 20, { scale: ANT, shadow: true, cargo: '#8DCB4A' });
const pSur = new AntGroup(P.scene, GEO.worker, 60 * Q + 10, { scale: ANT, shadow: true, cargo: '#F2B93B', cargoGeo: DROP, color: '#CF8A46' });
const pWild = new AntGroup(P.scene, GEO.worker, 30, { scale: ANT * 1.05, shadow: true, color: RAIDER });
const pForage = new AntGroup(P.scene, GEO.worker, 120 * Q + 20, { scale: ANT, shadow: true, cargo: '#9BD84A' });
const pSoldiers = new AntGroup(P.scene, GEO.soldier, 80 * Q + 20, { scale: ANT * 1.15, shadow: true, color: SOLDIER });
const pSwarm = new AntGroup(P.scene, GEO.army, 1700 * Q, { scale: ANT * 0.95, shadow: true, color: ARMY, cargo: '#F2B93B', cargoGeo: CHUNK });
const pSwarmMaj = new AntGroup(P.scene, GEO.armyMajor, 340 * Q, { scale: ANT * 1.25, shadow: true, color: '#B23A26' });
const pCorpse = new AntGroup(P.scene, GEO.army, 520 * Q, { scale: ANT * 0.95, color: '#5E2A20' });
const pHaul = new AntGroup(P.scene, GEO.worker, 70 * Q + 10, { scale: ANT, shadow: true, cargo: '#C4473A', cargoGeo: CHUNK });

function shuttle(g, path, o) {
  return (t) => {
    const L = path.L; const n = o.active ? Math.round(o.active() * g.n) : g.n;
    for (let i = 0; i < g.n; i++) {
      if (i >= n) { g.hide(i); continue; }
      const d = (t * o.speed * g.vf[i] + g.u[i] * 2 * L) % (2 * L); const out = d < L; const dd = out ? d : 2 * L - d;
      if (dd < (o.hideStart ?? 0) || dd > L - (o.hideEnd ?? 0)) { g.hide(i); continue; }
      path.at(dd, _v, _d); if (!out) _d.negate();
      const lat = g.lane[i] * (o.laneW ?? 0.13) + Math.sin(t * 1.9 + g.seed[i]) * 0.035;
      const x = _v.x - _d.z * lat, z = _v.z + _d.x * lat;
      g.put(i, x, gH(x, z), z, Math.atan2(-_d.z, _d.x) + Math.sin(t * 3 + g.seed[i]) * 0.12, o.step ?? 15, out ? !!o.carryOut : !!o.carryHome);
    }
    g.commit();
  };
}
function milling(g, cx, cz, r0, r1, step = 14, count = g.n) {
  return (t) => {
    for (let i = 0; i < g.n; i++) {
      if (i >= count) { g.hide(i); continue; }
      const dir = g.lane[i] > 0 ? 1 : -1, r = r0 + (r1 - r0) * g.u[i], a = g.seed[i] + t * (0.25 + 0.3 * g.vf[i]) * dir / Math.max(r, 0.6);
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      g.put(i, x, gH(x, z), z, Math.atan2(-Math.cos(a) * dir, -Math.sin(a) * dir), step);
    }
    g.commit();
  };
}
P.tick.push(shuttle(pMeadow, PATH.meadow, { speed: 0.55, hideStart: 0.45, carryHome: true }));
P.tick.push(shuttle(pSur, PATH.sur, { speed: 0.5, hideStart: 0.45, carryHome: true }));
P.tick.push(milling(pWild, WILD.x, WILD.z, 1.1, 3.4));

// ---- labels on the patch
const ME_Y = () => V3(ME.x, gH(ME.x, ME.z) + 2.6, ME.z);
function tag(world, html, pos, cls = '') {
  const el = document.createElement('div'); el.className = 'tag ' + cls; el.innerHTML = html; labelsEl.appendChild(el);
  const L = { el, pos, world, show: true }; world.labels.push(L); return L;
}
tag(P, '<b>Your nest</b>', ME_Y(), 'you');
tag(P, '<b>Colonia del Sur</b> neighbour', V3(SUR.x, gH(SUR.x, SUR.z) + 2.6, SUR.z), 'player');
tag(P, '<b>Wild nest</b> Level 3', V3(WILD.x, gH(WILD.x, WILD.z) + 2.6, WILD.z), 'wild');
tag(P, '<b>Ant scent</b> scout it first', V3(SCENT.x, gH(SCENT.x, SCENT.z) + 6.5, SCENT.z), 'player');
tag(P, '<b>Aphid herd</b> untended', V3(WILDSITES.aphid.x, 10.8, WILDSITES.aphid.z), 'leaf');
tag(P, '<b>Termite mound</b> Tier 1', V3(WILDSITES.termite.x, 6, WILDSITES.termite.z), 'wild');
tag(P, '<b>Spider den</b> Boss', V3(WILDSITES.spider.x, 2, WILDSITES.spider.z), 'wild');
const marbleTag = tag(P, '<b>A lost marble</b> at true size', V3(-8.6, gH(-8.6, 2.4) + 1.4, 2.4), 'note');
const capTag = tag(P, '<b>A bottle cap</b> at true size', V3(-16.3, gH(-16.3, 3.3) + 0.9, 3.3), 'note');
marbleTag.near = capTag.near = 14;
const forageTag = tag(P, '', V3(), 'you'); forageTag.show = false;
const swarmTag = tag(P, '', V3(), 'wild'); swarmTag.show = false;

// ---- taps on the patch
function tapTarget(world, obj, fn) { obj.userData.tap = fn; world.taps.push(obj); }
const myMoundHit = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 1.6, 12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
myMoundHit.position.set(ME.x, gH(ME.x, ME.z), ME.z); P.scene.add(myMoundHit);
tapTarget(P, myMoundHit, () => openSheet('Your nest · Hormiguero de Marz', '<p>1,240 workers and 86 soldiers at home. Workers are on the meadow trail, bringing leaves back.</p>', [
  { label: 'Send foragers to the wilds', primary: true, fn: () => act.forage() },
  { label: 'Open my nest', fn: () => go('nest') },
]));
const wildHit = myMoundHit.clone(); wildHit.position.set(WILD.x, gH(WILD.x, WILD.z), WILD.z); P.scene.add(wildHit);
tapTarget(P, wildHit, () => toast('Wild nest, level 3 (made up). Raid it from its card, like on the patch today.'));
const scentHit = myMoundHit.clone(); scentHit.scale.set(0.8, 4, 0.8); scentHit.position.set(SCENT.x, gH(SCENT.x, SCENT.z) + 2, SCENT.z); P.scene.add(scentHit);
tapTarget(P, scentHit, () => toast('Ant scent: someone lives here. Scout it to see the mound.'));
tapTarget(P, P.marble, () => toast('A glass marble is about 16 mm across: three ant lengths. Scale cues like this are what make ants feel tiny.'));

// ---- army-ant swarm (fan-shaped front, the column behind it, insects flushed ahead)
const SW = { on: false, F: -2, v: 0, Fmax: 0, mode: 'idle', O: V3(46, 0, -1.4), took: false };
SW.f = V3(ME.x - SW.O.x, 0, ME.z - SW.O.z); SW.L = SW.f.length(); SW.f.normalize(); SW.s = V3(-SW.f.z, 0, SW.f.x);
const swarmDepth = (g) => { const d = new Float32Array(g.n); for (let i = 0; i < g.n; i++) d[i] = Math.min(32, -Math.log(1 - 0.995 * g.u[i]) * 5.2); return d; };
pSwarm.depth = swarmDepth(pSwarm); pSwarmMaj.depth = swarmDepth(pSwarmMaj);
pSwarm.dead = new Uint8Array(pSwarm.n); pSwarmMaj.dead = new Uint8Array(pSwarmMaj.n);
const halfW = (dep) => 5.6 * Math.exp(-dep / 5) + 0.55;
function swarmPos(g, i, t) {
  const dep = g.depth[i], ag = SW.mode === 'clash' ? 1.4 : Math.exp(-dep / 3);
  const along = SW.F - dep + Math.cos(t * 1.7 + g.seed[i]) * 0.25 * (0.4 + ag);
  const side = g.lane[i] * halfW(dep) + Math.sin(t * 1.3 + g.seed[i]) * 0.3 * (0.3 + ag);
  return [SW.O.x + SW.f.x * along + SW.s.x * side, SW.O.z + SW.f.z * along + SW.s.z * side, along, ag];
}
function swarmTick(g) {
  return (t) => {
    if (!SW.on) return;
    const yaw0 = Math.atan2(-SW.f.z, SW.f.x) + (SW.mode === 'retreat' ? Math.PI : 0);
    for (let i = 0; i < g.n; i++) {
      if (g.dead[i]) { g.hide(i); continue; }
      const [x, z, along, ag] = swarmPos(g, i, t);
      if (along < -1.5) { g.hide(i); continue; }
      const carry = SW.took && SW.mode === 'retreat' && g.u[i] < 0.35;
      g.put(i, x, gH(x, z), z, yaw0 + Math.sin(t * 2.3 + g.seed[i]) * (0.25 + 0.9 * ag), 17, carry);
    }
    g.commit();
  };
}
P.tick.push(swarmTick(pSwarm), swarmTick(pSwarmMaj));
P.tick.push((t, dt) => {
  if (!SW.on) return;
  if (SW.mode === 'advance') { SW.F = Math.min(SW.Fmax, SW.F + SW.v * dt); }
  if (SW.mode === 'retreat') { SW.F -= 4.2 * dt; if (SW.F < -36) { SW.on = false; pSwarm.hideAll(); pSwarmMaj.hideAll(); swarmTag.show = false; alarm.visible = false; refreshChips(); } }
  const fx = SW.O.x + SW.f.x * SW.F, fz = SW.O.z + SW.f.z * SW.F;
  swarmTag.pos.set(fx, gH(fx, fz) + 1.6, fz);
  if (SW.mode === 'advance') {
    const left = Math.max(0, (SW.Fmax - SW.F) / Math.max(SW.v, 0.01));
    swarmTag.el.innerHTML = `<b>Army-ant swarm</b> ${fmt(pSwarm.n + pSwarmMaj.n)} ants · lands in ${Math.ceil(left * 27)}m`;
  }
});
const alarm = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.08, 6, 48), new THREE.MeshBasicMaterial({ color: '#FF4A3A', transparent: true, opacity: 0.8 }));
alarm.rotation.x = -Math.PI / 2; alarm.position.set(ME.x, gH(ME.x, ME.z) + 0.15, ME.z); alarm.visible = false; P.scene.add(alarm);
P.tick.push((t) => { if (alarm.visible) { const k = (t * 0.9) % 1; alarm.scale.setScalar(0.7 + k * 0.6); alarm.material.opacity = 0.9 * (1 - k); } });
// Springtails flushed ahead of the swarm: the only "physics" here is a ballistic hop.
const BUGS = 34, bug = { p: [], v: [], air: new Uint8Array(BUGS) };
const bugIM = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6).scale(0.16, 0.07, 0.07), mat('#8A84BC', { roughness: 0.4 }), BUGS);
for (let i = 0; i < BUGS; i++) {
  const along = R(14, 40), side = R(-6, 6); const x = SW.O.x + SW.f.x * along + SW.s.x * side, z = SW.O.z + SW.f.z * along + SW.s.z * side;
  bug.p.push(V3(x, gH(x, z) + 0.06, z)); bug.v.push(V3());
}
bugIM.castShadow = true; P.scene.add(bugIM);
P.tick.push((t, dt) => {
  for (let i = 0; i < BUGS; i++) {
    const p = bug.p[i], v = bug.v[i];
    if (bug.air[i]) {
      v.y -= 14 * dt; p.addScaledVector(v, dt); const gy = gH(p.x, p.z) + 0.06;
      if (p.y <= gy) { p.y = gy; bug.air[i] = 0; }
    } else if (SW.on && SW.mode !== 'retreat') {
      const rel = _v.set(p.x - SW.O.x, 0, p.z - SW.O.z); const along = rel.dot(SW.f), side = rel.dot(SW.s);
      if (along - SW.F < 2.4 && along - SW.F > -1 && Math.abs(side) < halfW(0) + 1.5) {
        bug.air[i] = 1; v.copy(SW.f).multiplyScalar(R(2.2, 3.6)).addScaledVector(SW.s, R(-2.5, 2.5)); v.y = R(3.6, 5.4);
      }
    }
    _m.compose(p, _q.setFromAxisAngle(UP, Math.atan2(-v.z, v.x || 1)), _s.setScalar(1)); bugIM.setMatrixAt(i, _m);
  }
  bugIM.instanceMatrix.needsUpdate = true;
});
// Dust where the two sides meet.
const DUSTN = 140, dustPos = new Float32Array(DUSTN * 3), dustLife = new Float32Array(DUSTN).fill(1), dustVel = [];
for (let i = 0; i < DUSTN; i++) dustVel.push(V3());
const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
const dustMat = new THREE.PointsMaterial({ map: glowTex, color: '#E8D2A8', size: 0.6, transparent: true, opacity: 0.5, depthWrite: false });
P.scene.add(new THREE.Points(dustGeo, dustMat));
let dustOn = false;
P.tick.push((t, dt) => {
  const cx = ME.x - SW.f.x * 3.6, cz = ME.z - SW.f.z * 3.6;
  for (let i = 0; i < DUSTN; i++) {
    dustLife[i] += dt * 0.9;
    if (dustLife[i] >= 1) {
      if (!dustOn) { dustPos[i * 3 + 1] = -99; continue; }
      dustLife[i] = rnd() * 0.3; const side = R(-4, 4);
      dustPos[i * 3] = cx + SW.s.x * side; dustPos[i * 3 + 2] = cz + SW.s.z * side; dustPos[i * 3 + 1] = gH(cx, cz) + 0.1;
      dustVel[i].set(R(-0.5, 0.5), R(0.4, 1.2), R(-0.5, 0.5));
    }
    dustPos[i * 3] += dustVel[i].x * dt; dustPos[i * 3 + 1] += dustVel[i].y * dt; dustPos[i * 3 + 2] += dustVel[i].z * dt;
  }
  dustGeo.attributes.position.needsUpdate = true;
});

// ---- soldiers: rally in an arc between the nest and the swarm, or march away
const SOL = { mode: 'home', t0: 0, k: 0 };
const solTarget = (g, i) => {
  const th = (i / g.n - 0.5) * 2.5 + g.lane[i] * 0.04, r = 2.4 + g.u[i] * 1.2;
  const bx = -SW.f.x, bz = -SW.f.z; const c = Math.cos(th), s = Math.sin(th);
  return [ME.x + (bx * c - bz * s) * r, ME.z + (bx * s + bz * c) * r];
};
P.tick.push((t, dt) => {
  const g = pSoldiers;
  if (SOL.mode === 'home') return;
  if (SOL.mode === 'rally' || SOL.mode === 'return') {
    SOL.k = clamp(SOL.k + dt * (SOL.mode === 'rally' ? 0.55 : -0.5), 0, 1);
    for (let i = 0; i < g.n; i++) {
      const k = clamp(SOL.k * 1.6 - (i / g.n) * 0.6, 0, 1); if (k <= 0.02) { g.hide(i); continue; }
      const [tx, tz] = solTarget(g, i); const e = ease(k);
      const x = lerp(ME.x, tx, e), z = lerp(ME.z, tz, e);
      const moving = k < 1 && SOL.k > 0 && SOL.k < 1;
      const yaw = moving ? Math.atan2(-(tz - ME.z), tx - ME.x) + (SOL.mode === 'return' ? Math.PI : 0) : Math.atan2(SW.f.z, -SW.f.x) + Math.sin(t * 2 + g.seed[i]) * 0.2;
      g.put(i, x, gH(x, z), z, yaw, moving ? 16 : 4);
    }
    g.commit();
    if (SOL.mode === 'return' && SOL.k <= 0) { SOL.mode = 'home'; g.hideAll(); }
  }
  if (SOL.mode === 'away') {
    const path = PATH.away; const tt = t - SOL.t0;
    for (let i = 0; i < g.n; i++) {
      const d = tt * 6 - i * 0.16; if (d < 0.4 || d > path.L) { g.hide(i); continue; }
      path.at(d, _v, _d); const lat = g.lane[i] * 0.16; const x = _v.x - _d.z * lat, z = _v.z + _d.x * lat;
      g.put(i, x, gH(x, z), z, Math.atan2(-_d.z, _d.x), 17);
    }
    g.commit();
    if (tt * 6 - g.n * 0.16 > path.L) { SOL.mode = 'home'; g.hideAll(); }
  }
});

// ---- foragers: a trail is laid, a column walks it, and comes back carrying leaves
const wildsTrail = trail(P, lifted(PATH.wilds), '#FFC93C'); wildsTrail.userData.reveal(0); wildsTrail.visible = false;
const FO = { phase: 'idle', t0: 0, gap: 0.11, speed: 5.5 };
P.tick.push((t) => {
  const g = pForage, path = PATH.wilds, L = path.L;
  if (FO.phase === 'idle') return;
  const tt = t - FO.t0;
  if (FO.phase === 'lay') { wildsTrail.userData.reveal(tt / 1.6); if (tt > 1.6) { FO.phase = 'out'; FO.t0 = t; } return; }
  if (FO.phase === 'out' || FO.phase === 'home') {
    let done = true;
    for (let i = 0; i < g.n; i++) {
      const d = tt * FO.speed * (0.96 + 0.08 * g.vf[i]) - i * FO.gap;
      if (d < L - 0.01) done = false;
      if (d < 0.45) { g.hide(i); continue; }
      const dd = FO.phase === 'out' ? Math.min(d, L) : L - Math.min(d, L);
      if (FO.phase === 'home' && dd < 0.45) { g.hide(i); continue; }
      path.at(dd, _v, _d); if (FO.phase === 'home') _d.negate();
      const lat = g.lane[i] * 0.15 + Math.sin(t * 2 + g.seed[i]) * 0.04; const x = _v.x - _d.z * lat, z = _v.z + _d.x * lat;
      g.put(i, x, gH(x, z), z, Math.atan2(-_d.z, _d.x), 16, FO.phase === 'home');
    }
    g.commit();
    const head = Math.min(L, tt * FO.speed); path.at(FO.phase === 'out' ? head : L - head, _v);
    forageTag.pos.set(_v.x, _v.y + 1.5, _v.z);
    const left = Math.max(0, (L + g.n * FO.gap - tt * FO.speed) / FO.speed);
    forageTag.el.innerHTML = FO.phase === 'out' ? `<b>Forage</b> ${g.n} workers · ${Math.ceil(left)}s` : `<b>Forage home</b> carrying leaves · ${Math.ceil(left)}s`;
    if (done && FO.phase === 'out') { FO.phase = 'work'; FO.t0 = t; }
    if (done && FO.phase === 'home') { FO.phase = 'idle'; g.hideAll(); forageTag.show = false; gain('foliage', 2400); toast('Foragers are home: +2,400 Foliage (made up).'); tween(1.2, (k) => { wildsTrail.material.opacity = 0.95 * (1 - k); }, () => { wildsTrail.visible = false; wildsTrail.material.opacity = 0.95; }); refreshChips(); }
  }
  if (FO.phase === 'work') {
    const end = path.p[path.p.length - 1];
    for (let i = 0; i < g.n; i++) {
      const dir = g.lane[i] > 0 ? 1 : -1, r = 0.5 + 2 * g.u[i], a = g.seed[i] + t * 0.6 * dir / r;
      const x = end.x + Math.cos(a) * r, z = end.z + Math.sin(a) * r;
      g.put(i, x, gH(x, z), z, Math.atan2(-Math.cos(a) * dir, -Math.sin(a) * dir), 14, g.u[i] > 0.4);
    }
    g.commit(); forageTag.el.innerHTML = '<b>Foraging</b> cutting leaves';
    if (tt > 2.4) { FO.phase = 'home'; FO.t0 = t; }
  }
});

// ---- corpses and hauling
let corpseCount = 0;
const HAUL = { on: false, t0: 0, path: groundPath([[ME.x, ME.z], [ME.x - SW.f.x * 1.8, ME.z - SW.f.z * 1.8 + 0.3], [ME.x - SW.f.x * 4.2, ME.z - SW.f.z * 4.2]]) };
const haulTick = shuttle(pHaul, HAUL.path, { speed: 1.6, hideStart: 0.45, carryHome: true, laneW: 0.4 });
P.tick.push((t) => {
  if (!HAUL.on) return;
  haulTick(t);
  const k = (t - HAUL.t0) / 9; const keep = Math.round(corpseCount * (1 - clamp(k, 0, 1)));
  for (let i = keep; i < corpseCount; i++) pCorpse.hide(i); pCorpse.commit();
  if (k >= 1) { HAUL.on = false; pHaul.hideAll(); corpseCount = 0; gain('protein', 1850); toast('Corpses hauled home: +1,850 Protein (made up).'); refreshChips(); }
});

P.chips = () => [
  { label: "Ant's-eye view", fn: () => act.antsEye() },
  { label: 'Send foragers', fn: () => act.forage(), off: FO.phase !== 'idle' },
  { label: 'Army-ant swarm', fn: () => act.swarm(), off: SW.on },
  ...(corpseCount && !HAUL.on ? [{ label: 'Haul the corpses', fn: () => act.haul(), hot: true }] : []),
  { label: 'Open my nest', fn: () => go('nest') },
  { label: 'Rise to the garden', fn: () => go('garden') },
];
const homePitch = () => (camera.aspect < 0.9 ? 1.02 : 0.68);
P.home = () => ({ tx: camera.aspect < 0.9 ? -2 : 1, ty: 0, tz: camera.aspect < 0.9 ? 0 : 2, yaw: -0.16, pitch: homePitch(), dist: clamp(fitDist(64, 44) * (camera.aspect < 0.9 ? 0.62 : 1), 38, 115) });
P.min = 1.3; P.maxK = 1.35; P.up = 'garden'; P.zoomPlane = 'xz';
P.bounds = { x: [-30, 30], z: [-16, 21] };
P.autoPitch = (d) => lerp(0.1, homePitch(), smooth(1.6, 34, d));
P.targetY = (x, z, d) => gH(x, z) + lerp(0.16, 0, smooth(2, 12, d));
P.unitMM = 14 / 1; // 1 unit ≈ 14 mm

// ================================================================ THE NEST (the "planet": your colony cut open)
const N = makeWorld('nest', 2, { fog: [90, 220], sun: V3(-26, 38, 46), hemiK: 1.15, sunK: 0.9 });
const W = 52, H = 28, D = 2.4, BACK = 12, SHAFT_HW = 0.7, TUN_H = 0.55, GAP = 0.06, ZS = -D / 2, SURF = 0.32, NS = 0.95;
const shaftX = (y) => 0.55 * Math.sin(y * 0.23);
const SPOTS = {
  leaf_garden: { x: -16, y: -4.6 }, hunting_grounds: { x: 16.5, y: -4.6 }, excavation_works: { x: 8.5, y: -8.6 }, nursery: { x: -9, y: -9.4 },
  pheromone_chamber: { x: 15.5, y: -13.4 }, aphid_pasture: { x: -18, y: -14.2 }, brood_hall: { x: 7.5, y: -16.8 }, granary: { x: -9, y: -18.6 },
  larder: { x: 17.5, y: -19.8 }, nectar_cellar: { x: -18.5, y: -23.4, viaQueen: true }, queen_chamber: { x: 0, y: -23 }, honeypot_gallery: { x: 13, y: -25.2, viaQueen: true },
};
const CH = {
  queen_chamber: ["Queen's Chamber", 6, 'Reina Isabel lays here.'], leaf_garden: ['Leaf Garden', 5, 'Fungus farmed on cut leaves.'], hunting_grounds: ['Hunting Grounds', 2, 'Prey dragged in.'],
  excavation_works: ['Excavation Works', 2, 'Diggers widen the nest.'], nursery: ['Nursery', 3, 'Larvae being fed.'], pheromone_chamber: ['Pheromone Chamber', 3, 'Research: Tandem Running.'],
  aphid_pasture: ['Aphid Pasture', 2, 'A root with aphids on it.'], brood_hall: ['Brood Hall', 4, 'Raising 12 soldiers · 3m.'], granary: ['Granary', 4, '41% full.'],
  larder: ['Larder', 3, '63% full.'], nectar_cellar: ['Nectar Cellar', 2, '28% full.'], honeypot_gallery: ['Honeypot Gallery', 1, 'Repletes hold honeydew raids can’t take.'],
};
const LV = Object.fromEntries(Object.entries(CH).map(([k, v]) => [k, v[1]]));
function room(id, level) {
  const s = SPOTS[id]; const lv = Math.max(1, level);
  if (id === 'queen_chamber') return { id, ...s, rx: 3.9 + Math.min(0.6, lv * 0.05), ry: 2.0 + Math.min(0.4, lv * 0.03) };
  return { id, ...s, rx: 2.9 + Math.min(1.0, lv * 0.08), ry: 1.5 + Math.min(0.5, lv * 0.04) };
}
const halfWidth = (r, y) => { const k = 1 - ((y - r.y) / r.ry) ** 2; return k > 0 ? r.rx * Math.sqrt(k) : 0; };
const floorAt = (r, x) => r.y - r.ry * Math.sqrt(Math.max(0, 1 - ((x - r.x) / r.rx) ** 2));
function ellipseOut(r) { const pts = []; for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; const k = 0.975 + 0.025 * Math.sin(a * 5 + r.x); pts.push([r.x + Math.cos(a) * r.rx * k, r.y + Math.sin(a) * r.ry * k]); } return pts; }
function shaftOut(q) {
  const top = (x) => q.y + q.ry * Math.sqrt(Math.max(0, 1 - ((x - q.x) / q.rx) ** 2));
  const xc = shaftX(q.y + q.ry), xl = xc - SHAFT_HW, xr = xc + SHAFT_HW, yl = top(xl) + GAP, yr = top(xr) + GAP;
  const left = [], right = [];
  for (let y = -0.08; y > yl + 0.3; y -= 0.5) left.push([shaftX(y) - SHAFT_HW, y]); left.push([xl, yl]);
  const arc = []; for (let i = 1; i < 8; i++) { const x = xl + ((xr - xl) * i) / 8; arc.push([x, top(x) + GAP]); }
  for (let y = -0.08; y > yr + 0.3; y -= 0.5) right.push([shaftX(y) + SHAFT_HW, y]); right.push([xr, yr]);
  return [...left, ...arc, ...right.reverse()];
}
function branchOut(r) {
  const s = Math.sign(r.x - shaftX(r.y)), top = r.y + TUN_H, bot = r.y - TUN_H;
  const startX = (y) => shaftX(y) + s * (SHAFT_HW + GAP), endX = (y) => r.x - s * (halfWidth(r, y) + GAP);
  const pts = [[startX(top), top], [endX(top), top]];
  for (let i = 1; i < 6; i++) { const y = top - ((top - bot) * i) / 6; pts.push([endX(y), y]); }
  pts.push([endX(bot), bot], [startX(bot), bot]); return pts;
}
function queenBranchOut(q, r) {
  const s = Math.sign(r.x), ya = q.y + 0.2, yb = r.y;
  const qx = (y) => q.x + s * (halfWidth(q, y) + GAP), cx = (y) => r.x - s * (halfWidth(r, y) + GAP);
  const pts = [[qx(ya + TUN_H), ya + TUN_H], [cx(yb + TUN_H), yb + TUN_H]];
  for (let i = 1; i < 6; i++) { const y = yb + TUN_H - (2 * TUN_H * i) / 6; pts.push([cx(y), y]); }
  pts.push([cx(yb - TUN_H), yb - TUN_H], [qx(ya - TUN_H), ya - TUN_H]);
  for (let i = 1; i < 6; i++) { const y = ya - TUN_H + (2 * TUN_H * i) / 6; pts.push([qx(y), y]); }
  return pts;
}
function carve(rooms) {
  const q = rooms.find((r) => r.id === 'queen_chamber');
  const out = [shaftOut(q), ellipseOut(q)];
  for (const r of rooms) { if (r.id === 'queen_chamber') continue; out.push(ellipseOut(r), r.viaQueen ? queenBranchOut(q, r) : branchOut(r)); }
  return out;
}
function pathTo(r, q, fromX) {
  const P3 = (x, y) => V3(x, y, ZS);
  const pts = [P3(fromX, SURF), P3(shaftX(0) + Math.sign(fromX) * 1.2, SURF), P3(shaftX(0), SURF), P3(shaftX(-0.4), -0.4)];
  const toQueen = r.viaQueen || r.id === 'queen_chamber';
  const shaftEnd = toQueen ? q.y + q.ry - 0.3 : r.y - TUN_H + 0.12;
  for (let y = -1; y > shaftEnd; y -= 1) pts.push(P3(shaftX(y), y));
  if (r.id === 'queen_chamber') { pts.push(P3(shaftX(shaftEnd), floorAt(q, shaftX(shaftEnd)) + 0.08), P3(q.x + 1.6, floorAt(q, q.x + 1.6) + 0.06)); return new Path(pts); }
  if (r.viaQueen) {
    const s = Math.sign(r.x), ex = q.x + s * (halfWidth(q, q.y + 0.2 - TUN_H) + 0.2);
    pts.push(P3(shaftX(shaftEnd), floorAt(q, shaftX(shaftEnd)) + 0.08), P3(q.x + s * 2, floorAt(q, q.x + s * 2) + 0.06), P3(ex, q.y + 0.2 - TUN_H + 0.1));
  } else pts.push(P3(shaftX(shaftEnd), shaftEnd));
  const s = Math.sign(r.x - shaftX(r.y)); pts.push(P3(r.x - s * r.rx, r.y - TUN_H + 0.12));
  const mid = r.x - s * r.rx * 0.1; pts.push(P3(mid, floorAt(r, mid) + 0.06));
  return new Path(pts);
}
const rooms = () => Object.keys(SPOTS).map((id) => room(id, LV[id]));
const R_ = (id) => room(id, LV[id]);

// Soil horizons: litter, topsoil, iron clay, ochre sand, grey-blue gley clay, deep subsoil. Not one brown.
const HORIZONS = [
  [0, '#3E2B1E', '#4E3826'], [1.0, '#7B4A2D', '#8A5434'], [6.6, '#A9552F', '#BB6338'], [12.4, '#D3A05A', '#DFB06A'], [18.2, '#7E8E96', '#8E9DA4'], [21.6, '#5E3C2A', '#6B4631'],
];
const PX = 40;
const strataCanvas = document.createElement('canvas'); strataCanvas.width = W * PX; strataCanvas.height = H * PX;
{
  const g = strataCanvas.getContext('2d'); const bound = (i, x) => HORIZONS[i][0] + (i ? 0.35 * Math.sin(x * 0.3 + i * 1.7) + 0.2 * Math.sin(x * 0.9 + i * 3.1) : 0);
  for (let i = 0; i < HORIZONS.length; i++) {
    g.beginPath();
    for (let x = 0; x <= W; x += 0.5) g.lineTo(x * PX, bound(i, x) * PX);
    for (let x = W; x >= 0; x -= 0.5) g.lineTo(x * PX, (i + 1 < HORIZONS.length ? bound(i + 1, x) + 0.05 : H) * PX);
    const gr = g.createLinearGradient(0, HORIZONS[i][0] * PX, 0, (HORIZONS[i + 1]?.[0] ?? H) * PX); gr.addColorStop(0, HORIZONS[i][1]); gr.addColorStop(1, HORIZONS[i][2]);
    g.fillStyle = gr; g.fill();
  }
  for (let i = 0; i < 9000; i++) { const x = rnd() * W * PX, y = rnd() * H * PX; g.fillStyle = rnd() < 0.5 ? 'rgba(255,240,210,0.13)' : 'rgba(30,15,5,0.16)'; g.fillRect(x, y, R(1, 4), R(1, 3)); }
  for (let i = 0; i < 160; i++) {
    const x = rnd() * W * PX, y = R(1, H) * PX, r = R(3, 13);
    g.fillStyle = pick(['#E9E1D2', '#B9B4AA', '#C77C55', '#8D8781', '#F2EBDD']); g.beginPath(); g.ellipse(x, y, r * 1.3, r, R(0, 3), 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.35, r * 0.4, r * 0.25, 0, 0, 7); g.fill();
  }
  g.lineCap = 'round';
  for (let i = 0; i < 18; i++) { let x = rnd() * W * PX, y = 0, w = R(3, 7); g.strokeStyle = 'rgba(238,224,196,0.75)'; g.beginPath(); g.moveTo(x, y); const len = R(4, 11) * PX; while (y < len) { x += R(-14, 14); y += R(10, 22); g.lineWidth = w * (1 - y / len) + 0.6; g.lineTo(x, y); } g.stroke(); }
  for (let i = 0; i < 70; i++) { g.save(); g.translate(rnd() * W * PX, R(0.1, 0.9) * PX); g.rotate(R(0, 6)); g.fillStyle = pick(['#7DB33A', '#E07B39', '#F2C14E', '#B5562F', '#9BB84A']); g.beginPath(); g.ellipse(0, 0, R(6, 14), R(3, 6), 0, 0, 7); g.fill(); g.restore(); }
}
const faceTex = new THREE.CanvasTexture(strataCanvas); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.repeat.set(1 / W, 1 / H); faceTex.offset.set(0.5, 1);
const sideTex = new THREE.CanvasTexture(strataCanvas); sideTex.colorSpace = THREE.SRGBColorSpace;
const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.95 });
const wallMat = new THREE.MeshStandardMaterial({ color: '#9A5C38', roughness: 1, emissive: '#5A2A0E', emissiveIntensity: 0.2 });
const slab = new THREE.Group(); N.scene.add(slab);
let faceMesh = null;
function buildFace() {
  const shape = new THREE.Shape(); shape.moveTo(-W / 2, -H); shape.lineTo(W / 2, -H); shape.lineTo(W / 2, 0); shape.lineTo(-W / 2, 0); shape.closePath();
  for (const o of carve(rooms())) { const h = new THREE.Path(); h.moveTo(o[0][0], o[0][1]); for (let i = 1; i < o.length; i++) h.lineTo(o[i][0], o[i][1]); h.closePath(); shape.holes.push(h); }
  const g = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: false, curveSegments: 4 }); g.translate(0, 0, -D);
  if (faceMesh) { faceMesh.geometry.dispose(); faceMesh.geometry = g; } else { faceMesh = new THREE.Mesh(g, [faceMat, wallMat]); slab.add(faceMesh); }
}
buildFace();
{
  const block = new THREE.Mesh(new THREE.BoxGeometry(W, H, BACK), [mat('#5E3C2A'), mat('#5E3C2A'), mat('#6FA83E'), mat('#3A2618'), mat('#2A1A12'), new THREE.MeshStandardMaterial({ map: sideTex })]);
  block.material[0] = block.material[1] = new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.95 });
  block.position.set(0, -H / 2, -D - BACK / 2 - 0.05); slab.add(block);
  const grass = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, SURF, D + BACK), mat('#6FA83E')); grass.position.set(0, SURF / 2, -(D + BACK) / 2); slab.add(grass);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.5, BACK * 3.2), new THREE.MeshBasicMaterial({ map: glowTex, color: '#000000', transparent: true, opacity: 0.25, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.set(0, -H - 0.6, -BACK / 2); slab.add(shadow);
}
// Back walls of the hollows, lit from inside.
const glowCanvas = document.createElement('canvas'); glowCanvas.width = W * 20; glowCanvas.height = H * 20;
function paintGlow() {
  const g = glowCanvas.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, glowCanvas.width, glowCanvas.height);
  for (const r of rooms()) {
    const cx = (r.x + W / 2) * 20, cy = -r.y * 20, rad = r.rx * 26;
    const col = r.id === 'pheromone_chamber' ? '185,140,255' : r.id === 'nectar_cellar' || r.id === 'honeypot_gallery' ? '255,200,80' : r.id === 'aphid_pasture' ? '190,230,120' : '255,170,80';
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad); gr.addColorStop(0, `rgba(${col},0.95)`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, rad, rad * 0.7, 0, 0, 7); g.fill();
  }
  glowTexN.needsUpdate = true;
}
const glowTexN = new THREE.CanvasTexture(glowCanvas); glowTexN.colorSpace = THREE.SRGBColorSpace;
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ color: '#3A2418', roughness: 1, emissive: '#ffffff', emissiveMap: glowTexN, emissiveIntensity: 0.45 }));
backWall.position.set(0, -H / 2, -D + 0.03); slab.add(backWall); paintGlow();
N.night.push((k) => { backWall.material.emissiveIntensity = lerp(0.42, 1.25, k); wallMat.emissiveIntensity = lerp(0.15, 0.6, k); });

// Chamber contents: colour carried by what each room holds.
const contents = new THREE.Group(); slab.add(contents);
const zIn = () => R(-D + 0.45, -0.45);
function onFloor(r, dx) { return floorAt(r, r.x + dx); }
function scatterIM(geo, material, list, parent = contents) {
  const im = new THREE.InstancedMesh(geo, material, list.length); const c = new THREE.Color();
  list.forEach((o, i) => { _m.compose(_p.set(o.x, o.y, o.z), _q.setFromEuler(new THREE.Euler(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0)), _s.set(o.s, o.sy ?? o.s, o.sz ?? o.s)); im.setMatrixAt(i, _m); if (o.c) im.setColorAt(i, c.set(o.c)); });
  parent.add(im); return im;
}
const granaryPile = new THREE.Group(); contents.add(granaryPile);
function fillGranary() {
  granaryPile.clear(); const r = R_('granary'); const list = [];
  for (let i = 0; i < 70; i++) { const dx = R(-r.rx * 0.75, r.rx * 0.75), h = (1 - (dx / (r.rx * 0.8)) ** 2) * 1.15 * rnd(); list.push({ x: r.x + dx, y: onFloor(r, dx) + 0.05 + h, z: zIn(), rx: R(-0.6, 0.6), ry: R(0, 6), rz: R(-0.6, 0.6), s: R(1.6, 2.6), sy: 1, c: pick(['#8DCB4A', '#A6D83A', '#6E9F3A', '#B9E06A']) }); }
  scatterIM(LEAF_BIT, new THREE.MeshStandardMaterial({ roughness: 0.6 }), list, granaryPile);
}
fillGranary();
{
  let r = R_('larder'), list = [];
  for (let i = 0; i < 22; i++) { const dx = R(-r.rx * 0.7, r.rx * 0.7); list.push({ x: r.x + dx, y: onFloor(r, dx) + 0.12 + rnd() * 0.5 * (1 - Math.abs(dx) / r.rx), z: zIn(), rx: R(0, 3), ry: R(0, 3), s: R(1.4, 2.6), c: pick(['#D06A6A', '#B04848', '#E08A7A', '#C25A4A']) }); }
  scatterIM(CHUNK, new THREE.MeshStandardMaterial({ roughness: 0.5, flatShading: true }), list);
  const beetle = (rr, dx, flip) => {
    const g = new THREE.Group(); g.position.set(rr.x + dx, onFloor(rr, dx) + 0.45, -D / 2); g.rotation.z = flip ? Math.PI : 0;
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.9, 0.55, 0.6), new THREE.MeshStandardMaterial({ color: '#2F8F83', metalness: 0.7, roughness: 0.25, emissive: '#0F4A44', emissiveIntensity: 0.2 })));
    for (let k = 0; k < 6; k++) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.7, 4), mat('#1C2420')); leg.position.set(-0.4 + (k % 3) * 0.4, -0.25, k < 3 ? 0.45 : -0.45); leg.rotation.x = k < 3 ? 0.9 : -0.9; g.add(leg); }
    contents.add(g);
  };
  beetle(r, r.rx * 0.45, true);
  r = R_('hunting_grounds'); beetle(r, -0.6, true);
  r = R_('nectar_cellar');
  const pool = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12).scale(r.rx * 0.72, 0.28, 0.85), new THREE.MeshStandardMaterial({ color: '#F0B83A', roughness: 0.08, emissive: '#E89A10', emissiveIntensity: 0.35 }));
  pool.position.set(r.x, onFloor(r, 0) + 0.05, -D / 2); contents.add(pool);
  list = []; for (let i = 0; i < 8; i++) { const dx = R(-r.rx * 0.6, r.rx * 0.6); list.push({ x: r.x + dx, y: onFloor(r, dx) + 0.35, z: zIn(), s: R(1.5, 2.6) }); }
  scatterIM(DROP, new THREE.MeshStandardMaterial({ color: '#F6C64A', roughness: 0.05, emissive: '#E8A010', emissiveIntensity: 0.4 }), list);
  r = R_('honeypot_gallery'); list = [];
  for (let i = 0; i < 5; i++) { const dx = -r.rx * 0.6 + i * r.rx * 0.3; const ceil = 2 * r.y - onFloor(r, dx); list.push({ x: r.x + dx, y: ceil - 0.55, z: -D / 2 + R(-0.3, 0.3), s: R(0.42, 0.52) }); }
  scatterIM(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshStandardMaterial({ color: '#F2B83A', roughness: 0.12, transparent: true, opacity: 0.92, emissive: '#E89A10', emissiveIntensity: 0.45 }), list);
  r = R_('leaf_garden'); list = [];
  for (let i = 0; i < 46; i++) { const dx = R(-r.rx * 0.7, r.rx * 0.7); const h = (1 - (dx / (r.rx * 0.75)) ** 2) * 1.3 * Math.sqrt(rnd()); list.push({ x: r.x + dx, y: onFloor(r, dx) + 0.2 + h, z: zIn(), s: R(0.22, 0.42), c: pick(['#F3E9CE', '#E8D9B4', '#F7F0DE', '#DCCB9F']) }); }
  scatterIM(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), list);
  list = []; for (let i = 0; i < 12; i++) { const dx = R(-r.rx * 0.6, r.rx * 0.6); list.push({ x: r.x + dx, y: onFloor(r, dx) + 0.4 + rnd() * 0.8, z: zIn(), ry: R(0, 6), rx: R(-1, 1), s: 1.6, c: pick(['#8DCB4A', '#A6D83A']) }); }
  scatterIM(LEAF_BIT, new THREE.MeshStandardMaterial({ roughness: 0.6 }), list);
  const brood = (rr, eggs, larvae, cocoons) => {
    const l = [];
    for (let i = 0; i < eggs; i++) { const dx = -rr.rx * 0.55 + R(-0.5, 0.5); l.push({ x: rr.x + dx, y: onFloor(rr, dx) + 0.12 + rnd() * 0.2, z: zIn(), s: 0.12, sy: 0.09, c: '#FBF6EA' }); }
    for (let i = 0; i < cocoons; i++) { const dx = rr.rx * 0.5 + R(-0.6, 0.6); l.push({ x: rr.x + dx, y: onFloor(rr, dx) + 0.2, z: zIn(), rz: R(-0.4, 0.4), s: 0.34, sy: 0.18, sz: 0.18, c: '#E7CFA0' }); }
    scatterIM(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.5 }), l);
    const lv = []; for (let i = 0; i < larvae; i++) { const dx = R(-0.7, 0.7); lv.push({ x: rr.x + dx, y: onFloor(rr, dx) + 0.14, z: zIn(), ry: R(0, 6), rx: Math.PI / 2, s: 1, c: '#F6EEDF' }); }
    scatterIM(new THREE.TorusGeometry(0.16, 0.085, 6, 10, Math.PI * 1.4), new THREE.MeshStandardMaterial({ roughness: 0.45 }), lv);
  };
  brood(R_('brood_hall'), 14, 6, 9); brood(R_('nursery'), 4, 10, 2);
  r = R_('queen_chamber'); list = [];
  for (let i = 0; i < 22; i++) { const dx = R(1.4, 3); list.push({ x: r.x + dx, y: onFloor(r, dx) + 0.1, z: zIn(), s: 0.13, sy: 0.1, c: '#FBF6EA' }); }
  scatterIM(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.4 }), list);
  r = R_('aphid_pasture');
  const root = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(r.x - 1.2, r.y + r.ry + 0.5, -D / 2), V3(r.x - 0.4, r.y + 0.2, -D / 2 - 0.1), V3(r.x + 0.8, r.y - 0.4, -D / 2), V3(r.x + 1.9, r.y + 0.5, -D / 2)]), 20, 0.16, 6), mat('#E7D5B0', { roughness: 0.8 }));
  contents.add(root); list = [];
  for (let i = 0; i < 10; i++) { const k = R(0.2, 0.9); const p = root.geometry.parameters.path.getPoint(k); list.push({ x: p.x, y: p.y - 0.16, z: p.z + R(-0.15, 0.15), s: 0.15, sy: 0.11, c: '#B5E04A' }); }
  scatterIM(new THREE.SphereGeometry(1, 10, 8), mat('#ffffff', { roughness: 0.35, emissive: '#5C8E1A', emissiveIntensity: 0.25 }), list);
  r = R_('excavation_works'); list = [];
  for (let i = 0; i < 40; i++) { const dx = R(-r.rx * 0.2, r.rx * 0.75); list.push({ x: r.x + dx, y: onFloor(r, dx) + 0.08 + rnd() * 0.6 * (1 - Math.abs(dx - r.rx * 0.3) / r.rx), z: zIn(), s: R(0.11, 0.17), c: pick(['#B5653A', '#A9552F', '#C47A48']) }); }
  scatterIM(new THREE.DodecahedronGeometry(1), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), list);
}
// Research motes in the Pheromone Chamber.
{
  const r = R_('pheromone_chamber'); const n = 60, pos = new Float32Array(n * 3), seed = Array.from({ length: n }, () => rnd() * 100);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTex, color: '#C59BFF', size: 0.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  contents.add(pts);
  N.tick.push((t) => {
    for (let i = 0; i < n; i++) { const s = seed[i], a = t * (0.3 + (s % 1) * 0.4) + s; pos[i * 3] = r.x + Math.cos(a) * r.rx * 0.7 * ((s * 7) % 1); pos[i * 3 + 1] = r.y + Math.sin(a * 1.3) * r.ry * 0.6 * ((s * 3) % 1); pos[i * 3 + 2] = -D / 2 + Math.sin(a * 0.7) * 0.6; }
    geo.attributes.position.needsUpdate = true;
  });
}
// The surface on top: grass, flowers and the entrance mound with its spoil heap.
{
  const list = []; for (let i = 0; i < 1100 * Q; i++) { const x = R(-W / 2 + 0.3, W / 2 - 0.3), z = R(-D - BACK + 0.3, -0.2); if (Math.abs(x - shaftX(0)) < 2.6 && z > -4) continue; list.push({ x, z, y: SURF - 0.02, h: R(0.9, 3.4), w: R(0.12, 0.22) }); }
  blades(slab, list, false);
  const FL = [['#FFD23F', '#E39B12'], ['#F6B6D2', '#F7E9A6'], ['#FF6B4F', '#2B1D13'], ['#FBF7EE', '#F2B92B']];
  for (let i = 0; i < 7; i++) {
    const x = R(-W / 2 + 3, W / 2 - 3), z = R(-BACK, -2); if (Math.abs(x) < 4) continue; const h = R(3.5, 6.5), [pc, hc] = pick(FL);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, h, 5).translate(0, h / 2, 0), mat('#4F8A35')); stem.position.set(x, SURF, z); slab.add(stem);
    for (let k = 0; k < 7; k++) { const p = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6).scale(0.6, 0.1, 0.26).translate(0.6, 0, 0), mat(pc, { side: THREE.DoubleSide, roughness: 0.55 })); p.position.set(x, SURF + h, z); p.rotation.set(0, (k / 7) * 6.28, 0.2); slab.add(p); }
    const heart = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8).scale(1, 0.55, 1), mat(hc)); heart.position.set(x, SURF + h, z); slab.add(heart);
  }
  const pts = []; for (let d = 0.3; d <= 2.8; d += 0.1) pts.push(new THREE.Vector2(d * 1.15, moundProfile(d) * 1.1));
  const mound = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), mat('#C8A06A', { flatShading: true, roughness: 1 })); mound.position.set(shaftX(0), SURF - 0.05, -D / 2 - 1.6); slab.add(mound);
}
const spoil = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 12, 3), mat('#B5653A', { flatShading: true, roughness: 1 }));
spoil.position.set(shaftX(0) + 3.6, SURF, -D / 2 - 1); spoil.scale.set(1.1, 0.5, 0.9); slab.add(spoil);

// Ants in the nest: carriers along the tunnels, keepers in the rooms, the queen.
const nGroups = [];
function nestShuttle(id, n, cargo, fromX, cargoGeo, carryDown = true) {
  const g = new AntGroup(N.scene, GEO.worker, n, { scale: NS, cargo, cargoGeo });
  const ref = { path: pathTo(R_(id), R_('queen_chamber'), fromX) }; g.ref = ref; g.id = id; g.fromX = fromX;
  N.tick.push((t) => {
    const path = ref.path, L = path.L;
    for (let i = 0; i < g.n; i++) {
      if (g.off) { g.hide(i); continue; }
      const d = (t * 1.25 * g.vf[i] + g.u[i] * 2 * L) % (2 * L), down = d < L, dd = down ? d : 2 * L - d;
      path.at(dd, _v, _d); if (!down) _d.negate();
      g.put(i, _v.x, _v.y, ZS + g.lane[i] * 0.72, _d.x < 0 ? Math.PI : 0, 15, down === carryDown, Math.atan2(_d.y, Math.abs(_d.x)));
    }
    g.commit();
  });
  nGroups.push(g); return g;
}
nestShuttle('granary', 22 * Q + 8, '#8DCB4A', 25);
nestShuttle('larder', 16 * Q + 6, '#C4473A', -25, CHUNK);
nestShuttle('nectar_cellar', 12 * Q + 5, '#F2B93B', 25, DROP);
nestShuttle('leaf_garden', 14 * Q + 6, '#A6D83A', -25);
nestShuttle('brood_hall', 8, '#FBF6EA', 25, DROP);
const diggers = nestShuttle('granary', 16, '#B5653A', 22, CHUNK, false); diggers.off = true;
{
  const keepers = [['brood_hall', 3], ['nursery', 3], ['leaf_garden', 4], ['queen_chamber', 3], ['pheromone_chamber', 2], ['aphid_pasture', 2], ['excavation_works', 2], ['honeypot_gallery', 2], ['larder', 2], ['hunting_grounds', 1]];
  const total = keepers.reduce((a, k) => a + k[1], 0); const g = new AntGroup(N.scene, GEO.worker, total, { scale: NS }); const home = [];
  keepers.forEach(([id, n]) => { for (let i = 0; i < n; i++) home.push(id); });
  N.tick.push((t) => {
    home.forEach((id, i) => {
      const r = R_(id); const span = r.rx * (id === 'queen_chamber' ? 0.35 : 0.6); const a = t * 0.35 * g.vf[i] + g.seed[i];
      const dx = (id === 'queen_chamber' ? -1.6 : 0) + Math.sin(a) * span, v = Math.cos(a);
      g.put(i, r.x + dx, onFloor(r, dx), ZS + g.lane[i] * 0.7, v < 0 ? Math.PI : 0, Math.abs(v) > 0.15 ? 13 : 0, false, 0);
    });
    g.commit();
  });
  const q = new AntGroup(N.scene, GEO.queen, 1, { scale: NS * 1.9, color: '#A95F2F' }); const qr = R_('queen_chamber');
  q.put(0, qr.x - 0.4, onFloor(qr, -0.4), ZS, 0, 0); q.commit();
  const s = new AntGroup(N.scene, GEO.soldier, 1, { scale: NS * 1.2, color: SOLDIER }); const hr = R_('hunting_grounds');
  s.put(0, hr.x + 1.4, onFloor(hr, 1.4), ZS, Math.PI, 0); s.commit();
}
// Chamber names and taps.
const roomTags = {};
const pickers = {};
function placePickers() {
  for (const r of rooms()) {
    let pk = pickers[r.id];
    if (!pk) { pk = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); slab.add(pk); pickers[r.id] = pk; tapTarget(N, pk, () => chamberSheet(r.id)); }
    pk.position.set(r.x, r.y, -0.05); pk.scale.set(r.rx, r.ry, 1);
    const [name, , note] = CH[r.id];
    if (!roomTags[r.id]) roomTags[r.id] = tag(N, '', V3(), r.id === 'pheromone_chamber' ? 'scent small' : 'small');
    roomTags[r.id].pos.set(r.x, r.y + r.ry + 0.15, 0); roomTags[r.id].el.innerHTML = `<b>${name}</b> ${LV[r.id]}`;
  }
}
placePickers();
const entranceTag = tag(N, '<b>Entrance</b> up to the patch', V3(shaftX(0), SURF + 3.2, -D / 2 - 1.6), 'you');
const entranceHit = new THREE.Mesh(new THREE.SphereGeometry(2.6, 10, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
entranceHit.position.set(shaftX(0), SURF + 0.8, -D / 2 - 1.6); slab.add(entranceHit); tapTarget(N, entranceHit, () => go('patch'));
const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 48), new THREE.MeshBasicMaterial({ color: '#FFC93C', transparent: true, opacity: 0 })); ring.position.z = 0.05; slab.add(ring);
const DIG = { on: false, id: 'granary' };
function chamberSheet(id) {
  const [name, , note] = CH[id]; const r = R_(id);
  ring.position.set(r.x, r.y, 0.05); ring.scale.set(r.rx + 0.2, r.ry + 0.2, 1); ring.material.opacity = 0.9;
  openSheet(`${name} · level ${LV[id]}`, `<p>${note} Level ${LV[id] + 1} widens the hollow and holds more.</p><p class="cost">Cost (made up): 2,400 Foliage · 1,100 Protein · dig time 6m</p>`, [
    { label: 'Dig deeper', primary: true, fn: () => act.dig(id), off: DIG.on },
    { label: 'Close', fn: () => closeSheet() },
  ], () => { ring.material.opacity = 0; });
}
N.chips = () => [
  { label: 'Dig deeper: Granary', fn: () => act.dig('granary'), off: DIG.on },
  { label: 'Back to the surface', fn: () => go('patch') },
];
N.home = () => ({ tx: 0, ty: -11.5, tz: 0, yaw: 0.2, pitch: 0.12, dist: clamp(fitDist(57, 37) * (camera.aspect < 0.9 ? 0.6 : 1), 50, 160) });
N.min = 6; N.maxK = 1.35; N.up = 'patch'; N.zoomPlane = 'xy';
N.bounds = { x: [-W / 2, W / 2], y: [-H, 3] };
N.yawLim = 0.6; N.pitchLim = [-0.15, 0.6];
N.unitMM = 5.6;

// ================================================================ THE GARDEN (the "galaxy": the whole world)
const G = makeWorld('garden', 0, { fog: [170, 420], sun: V3(-80, 90, -40), shadow: 95, hemiK: 1.05 });
const creekCurve = new THREE.CatmullRomCurve3([V3(48, 0, -60), V3(40, 0, -38), V3(50, 0, -16), V3(41, 0, 6), V3(49, 0, 28), V3(42, 0, 62)]);
const creekPts = creekCurve.getSpacedPoints(120);
const nearCreek = (x, z, r) => creekPts.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < r * r);
const REGIONS = {
  backyard: { name: 'The Backyard', x: 12, z: 34 },
  oldGarden: { name: 'The Old Garden', x: -30, z: -20 },
  creekside: { name: 'Creekside', x: 54, z: 0 },
  woodpile: { name: 'The Woodpile', x: 16, z: -26 },
  longGrass: { name: 'The Long Grass', x: 0, z: -52 },
};
function regionAt(x, z) {
  if (x < -46) return 'patio'; if (z < -40) return 'longGrass'; if (x > 33) return 'creekside';
  if (z < -6 && x < 2) return 'oldGarden'; if (z < -10 && x <= 33) return 'woodpile'; return 'backyard';
}
{
  const geo = new THREE.PlaneGeometry(190, 150, 190, 150); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = []; const c = new THREE.Color(), c2 = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), reg = regionAt(x, z); const n = 0.5 + 0.5 * Math.sin(x * 0.9 + z * 0.6) * Math.sin(x * 0.31 - z * 0.7);
    let y = 0.3 * Math.sin(x * 0.07) * Math.cos(z * 0.06);
    if (reg === 'backyard') c.set(Math.floor((x + 200) / 7) % 2 ? '#7DBA4A' : '#6CAA40').lerp(c2.set('#8CC556'), n * 0.4);
    else if (reg === 'oldGarden') c.set('#6FAE45').lerp(c2.set('#7DBA4A'), n);
    else if (reg === 'longGrass') c.set('#9DB04E').lerp(c2.set('#C2C46A'), n);
    else if (reg === 'woodpile') c.set('#7A6A48').lerp(c2.set('#6E9A44'), n);
    else if (reg === 'creekside') c.set('#6FA34A').lerp(c2.set('#5C8C3E'), n);
    else c.set('#D27A4A');
    if (nearCreek(x, z, 5.5)) { c.lerp(c2.set('#6E6248'), 0.6); y -= 1.2 * smooth(5.5, 2.4, Math.min(...creekPts.map((p) => Math.hypot(p.x - x, p.z - z)))); }
    pos.setY(i, y); col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })); ground.receiveShadow = true; G.scene.add(ground);
}
// The creek ribbon.
{
  const pos = [], idx = []; const n = creekPts.length;
  for (let i = 0; i < n; i++) { const p = creekPts[i], t = creekCurve.getTangent(i / (n - 1)); const nx = -t.z, nz = t.x; const w = 2.6 + Math.sin(i * 0.3) * 0.6; pos.push(p.x + nx * w, -0.55, p.z + nz * w, p.x - nx * w, -0.55, p.z - nz * w); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const water = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#46A6D4', roughness: 0.1, metalness: 0.2, side: THREE.DoubleSide })); G.scene.add(water);
  const stones = []; for (let i = 0; i < 160; i++) { const p = pick(creekPts); const a = R(0, 6.28), r = R(3, 5.5); stones.push({ x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r, s: R(0.3, 1.1) }); }
  const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.8 }), stones.length); const c = new THREE.Color();
  stones.forEach((s, i) => { _m.compose(_p.set(s.x, -0.1, s.z), _q.setFromEuler(new THREE.Euler(R(0, 3), R(0, 3), 0)), _s.set(s.s, s.s * 0.6, s.s)); im.setMatrixAt(i, _m); im.setColorAt(i, c.set(pick(['#B8B2A6', '#D9D3C6', '#9A968F', '#C9B79A']))); });
  G.scene.add(shadows(im));
  const reeds = []; for (let i = 0; i < 520 * Q; i++) { const p = pick(creekPts); const a = R(0, 6.28), r = R(3.2, 7); reeds.push({ x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r, y: -0.2, h: R(3, 7), w: R(0.15, 0.3), c: pick(['#cfe2a8', '#bcd894']) }); }
  blades(G.scene, reeds);
}
// The house wall, a terracotta patio, a hose, the woodpile, the flower beds and the long grass.
{
  const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 26, 150), mat('#EADBC4', { roughness: 0.95 })); wall.position.set(-69, 13, 0); G.scene.add(shadows(wall));
  const roof = new THREE.Mesh(new THREE.BoxGeometry(9, 2.2, 152), mat('#C8643B', { roughness: 0.8 })); roof.position.set(-67.5, 26.5, 0); G.scene.add(shadows(roof));
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.6, 16, 9), mat('#3E6B4A')); door.position.set(-65.8, 8, 14); G.scene.add(door);
  const step = new THREE.Mesh(new THREE.BoxGeometry(5, 1.4, 13), mat('#D8CBB4')); step.position.set(-63.5, 0.7, 14); G.scene.add(shadows(step));
  const tiles = canvasTex(512, 512, (g) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#D27A4A' : '#C86E40'; g.fillRect(i * 64 + 3, j * 64 + 3, 58, 58); } g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#E9D5B5'; g.fillRect(0, 0, 512, 512); });
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping; tiles.repeat.set(3, 12);
  const patio = new THREE.Mesh(new THREE.PlaneGeometry(20, 150), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.85 })); patio.rotation.x = -Math.PI / 2; patio.position.set(-56, 0.35, 0); patio.receiveShadow = true; G.scene.add(patio);
  for (const [z, s] of [[-14, 1.2], [30, 1], [40, 0.8]]) {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(3 * s, 2.2 * s, 4.5 * s, 16), mat('#C8643B', { roughness: 0.75 })); pot.position.set(-58, 2.25 * s + 0.35, z); G.scene.add(shadows(pot));
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(3.4 * s, 1), mat('#4E8E38', { flatShading: true })); bush.position.set(-58, 6.5 * s, z); G.scene.add(shadows(bush));
    const fl = []; for (let i = 0; i < 22; i++) fl.push({ x: -58 + R(-2.6, 2.6) * s, y: 6.5 * s + R(0.5, 3.2) * s, z: z + R(-2.6, 2.6) * s, s: R(0.45, 0.75) * s, c: pick(['#E2483D', '#F0604E', '#D93A40']) });
    scatterIM(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.6 }), fl, G.scene);
  }
  const coils = new THREE.Group(); coils.position.set(-40, 0.6, 34); G.scene.add(coils);
  for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(4.2 - i * 0.25, 0.55, 8, 40), mat('#3FA34D', { roughness: 0.45 })); t.rotation.x = -Math.PI / 2; t.position.y = i * 0.95; coils.add(shadows(t)); }
  const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(-36, 0.5, 34), V3(-30, 0.5, 26), V3(-44, 0.5, 16), V3(-60, 0.5, 20), V3(-65.5, 5, 26)]), 60, 0.5, 8), mat('#3FA34D', { roughness: 0.45 })); G.scene.add(shadows(hose));
  const stones = []; for (let i = 0; i < 9; i++) stones.push({ x: -44 + i * 6.5, y: 0.25, z: 8 - i * 3.2 + Math.sin(i) * 2, s: 2.6, sy: 0.35, c: '#BDB7AC', ry: R(0, 3) });
  scatterIM(new THREE.CylinderGeometry(1, 1, 1, 9), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), stones, G.scene).receiveShadow = true;
  const logs = new THREE.Group(); logs.position.set(16, 0, -26); G.scene.add(logs);
  const ringT = canvasTex(128, 128, (g) => { for (let r = 64; r > 0; r -= 6) { g.fillStyle = r % 12 ? '#E2BD86' : '#C99A62'; g.beginPath(); g.arc(64, 64, r, 0, 7); g.fill(); } });
  const rows = [5, 4, 3, 2];
  rows.forEach((n, row) => { for (let i = 0; i < n; i++) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 22, 14), [mat('#6B4A33', { flatShading: true }), new THREE.MeshStandardMaterial({ map: ringT }), new THREE.MeshStandardMaterial({ map: ringT })]); lg.rotation.z = Math.PI / 2; lg.position.set(R(-0.8, 0.8), 2.1 + row * 3.7, (i - (n - 1) / 2) * 4.3); logs.add(shadows(lg)); } });
  const beds = [[-36, -12, 26, 9], [-36, -28, 26, 9], [-12, -22, 12, 22]];
  const blooms = [], leaves = [];
  for (const [bx, bz, bw, bd] of beds) {
    const soil = new THREE.Mesh(new THREE.BoxGeometry(bw, 1, bd), mat('#4A3324')); soil.position.set(bx, 0.3, bz); G.scene.add(shadows(soil, false, true));
    const edge = new THREE.Mesh(new THREE.BoxGeometry(bw + 1.6, 1.2, bd + 1.6), mat('#B5563A')); edge.position.set(bx, 0.2, bz); G.scene.add(shadows(edge)); soil.position.y = 0.55;
    const palette = pick([['#E2483D', '#F7F3E8'], ['#9C7BD6', '#B9A2E6'], ['#F4A21C', '#FFD23F'], ['#EE8AB8', '#F7F3E8'], ['#E2483D', '#F4A21C']]);
    for (let i = 0; i < 150 * Q; i++) { const x = bx + R(-bw / 2 + 1, bw / 2 - 1), z = bz + R(-bd / 2 + 1, bd / 2 - 1); leaves.push({ x, y: R(1.5, 3), z, s: R(0.8, 1.4), c: pick(['#4E8E38', '#5E9F40', '#3F7A30']) }); blooms.push({ x: x + R(-0.5, 0.5), y: R(2.6, 4.4), z: z + R(-0.5, 0.5), s: R(0.45, 0.8), c: pick(palette) }); }
  }
  scatterIM(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 }), leaves, G.scene).castShadow = true;
  scatterIM(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.55 }), blooms, G.scene).castShadow = true;
  for (const [x, z, h] of [[-46, -30, 15], [-42, -33, 13], [-48, -26, 14]]) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, h, 6).translate(0, h / 2, 0), mat('#5C8E3A')); stem.position.set(x, 0, z); G.scene.add(shadows(stem));
    const disc = new THREE.Group(); disc.position.set(x, h, z + 0.5); disc.rotation.x = 1.0; G.scene.add(disc);
    disc.add(shadows(new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.5, 18), mat('#5A3A1E'))));
    for (let k = 0; k < 16; k++) { const p = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 5).scale(1.2, 0.12, 0.45).translate(2.3, 0, 0), mat('#FFC81F', { side: THREE.DoubleSide })); p.rotation.y = (k / 16) * 6.28; disc.add(p); }
  }
  const tall = []; for (let i = 0; i < 3600 * Q; i++) { const x = R(-66, 92), z = R(-74, -41); if (nearCreek(x, z, 4)) continue; tall.push({ x, z, y: 0, h: R(5, 12), w: R(0.35, 0.6), c: pick(['#e8eaa0', '#d6e6a0', '#f3e7a0', '#c8dc98']) }); }
  blades(G.scene, tall, false);
  const tufts = []; for (let i = 0; i < 900 * Q; i++) { const x = R(-46, 33), z = R(-8, 70); tufts.push({ x, z, y: 0, h: R(0.8, 1.8), w: R(0.25, 0.4) }); }
  blades(G.scene, tufts, false);
}
// Colony lights: a glow where colonies live. Never names or strength (docs/11-world.md); yours in honey, allies in teal.
const LIGHT = { other: '#F2B25C', you: '#FFD25A', ally: '#46C9B8' };
const dayDot = canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 20, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); g.fillStyle = '#ffffff'; g.strokeStyle = '#2B1D13'; g.lineWidth = 7; g.beginPath(); g.arc(64, 64, 24, 0, 7); g.fill(); g.stroke();
});
const lightMats = { other: new THREE.SpriteMaterial({ map: dayDot, color: LIGHT.other, transparent: true, depthWrite: false }), you: new THREE.SpriteMaterial({ map: dayDot, color: LIGHT.you, transparent: true, depthWrite: false }), ally: new THREE.SpriteMaterial({ map: dayDot, color: LIGHT.ally, transparent: true, depthWrite: false }) };
G.night.push((k) => { for (const m of Object.values(lightMats)) { const b = k > 0.5 ? THREE.AdditiveBlending : THREE.NormalBlending; if (m.blending !== b) { m.blending = b; m.map = k > 0.5 ? glowTex : dayDot; m.needsUpdate = true; } } });
const lights = [];
function addLight(x, z, kind) {
  const s = new THREE.Sprite(lightMats[kind]); s.position.set(x, 1.6, z); const sc = kind === 'you' ? 8 : kind === 'ally' ? 5.6 : 4.8; s.scale.setScalar(sc); s.userData.base = sc; s.userData.kind = kind; s.userData.seed = rnd() * 10;
  G.scene.add(s); lights.push(s); tapTarget(G, s, () => (kind === 'you' ? go('patch') : toast(kind === 'ally' ? 'An ally in your supercolony. Teal threads link your colonies.' : 'Colonies live here. The garden never shows names or strength: scout to learn more.')));
  return s;
}
const HOME = V3(-6, 0, 14);
addLight(HOME.x, HOME.z, 'you');
const clusters = [[-6, 14, 9], [-22, 32, 6], [14, 30, 7], [-30, -18, 7], [-12, -30, 5], [14, -16, 6], [26, -30, 5], [56, -32, 5], [58, 12, 6], [36, 40, 5], [-14, -55, 6], [26, -57, 6], [60, -56, 4], [-46, -58, 5], [6, 52, 5], [-30, 2, 5]];
const allySpots = [];
for (const [cx, cz, n] of clusters) for (let i = 0; i < n; i++) {
  const x = cx + R(-7, 7), z = cz + R(-6, 6); if (nearCreek(x, z, 5) || x < -46 || Math.hypot(x - HOME.x, z - HOME.z) < 3) continue;
  const ally = allySpots.length < 5 && Math.hypot(x - HOME.x, z - HOME.z) < 30 && rnd() < 0.5; const s = addLight(x, z, ally ? 'ally' : 'other'); if (ally) allySpots.push(s.position);
}
for (const p of allySpots) trail(G, [V3(HOME.x, 1.2, HOME.z), V3((HOME.x + p.x) / 2, 3.2, (HOME.z + p.z) / 2), V3(p.x, 1.2, p.z)], '#46C9B8', { r: 0.22, dots: 0.35, opacity: 0.9, flow: 0.4, res: 1.5 });
const raidTarget = lights.find((l) => l.userData.kind === 'other' && l.position.distanceTo(HOME) > 25 && l.position.x > 5);
const raidArc = (a, b, h) => { const m = a.clone().add(b).multiplyScalar(0.5); m.y = h; const c = new THREE.QuadraticBezierCurve3(V3(a.x, 1.2, a.z), m, V3(b.x, 1.2, b.z)); return c.getPoints(40); };
if (raidTarget) trail(G, raidArc(HOME, raidTarget.position, 9), '#FFC93C', { r: 0.25, dots: 0.4, flow: 0.8, res: 1.5 });
const raider = lights.find((l) => l.userData.kind === 'other' && l.position.x < -15 && l.position.z > 20);
if (raider) trail(G, raidArc(raider.position, HOME, 6), '#E2483D', { r: 0.25, dots: 0.4, flow: 1.2, res: 1.5 });
const homeRing = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.1, 40), new THREE.MeshBasicMaterial({ color: '#FFD25A', transparent: true, side: THREE.DoubleSide, depthWrite: false }));
homeRing.rotation.x = -Math.PI / 2; homeRing.position.set(HOME.x, 0.6, HOME.z); G.scene.add(homeRing);
G.tick.push((t) => {
  const k = (t * 0.5) % 1; homeRing.scale.setScalar(1 + k * 2.2); homeRing.material.opacity = 0.85 * (1 - k);
  for (const l of lights) l.scale.setScalar(l.userData.base * (1 + (reduced ? 0 : 0.08 * Math.sin(t * 1.6 + l.userData.seed))));
});
fireflies(G, 120, [-60, 90, 2, 12, -70, 60], 1.6);
for (const r of Object.values(REGIONS)) tag(G, `<b>${r.name}</b> 100 patches`, V3(r.x, 9, r.z), 'region');
tag(G, '<b>Your colony</b> Hormiguero de Marz', V3(HOME.x, 6, HOME.z), 'you');
// Nuptial flight: a winged queen flies an arc to an empty spot and a new light appears.
const queenTex = canvasTex(128, 128, (g) => {
  g.translate(64, 64); g.fillStyle = 'rgba(235,245,255,0.75)'; g.strokeStyle = 'rgba(60,40,30,0.6)'; g.lineWidth = 1.5;
  for (const s of [1, -1]) { g.beginPath(); g.ellipse(s * 26, -10, 30, 11, s * -0.35, 0, 7); g.fill(); g.stroke(); g.beginPath(); g.ellipse(s * 20, 10, 22, 8, s * 0.35, 0, 7); g.fill(); g.stroke(); }
  g.fillStyle = '#A95F2F'; g.beginPath(); g.ellipse(0, 26, 9, 17, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(0, -2, 7, 10, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(0, -20, 7, 7, 0, 0, 7); g.fill();
});
const queenSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: queenTex, transparent: true, depthWrite: false })); queenSprite.scale.setScalar(5); queenSprite.visible = false; G.scene.add(queenSprite);
const sparkN = 80, sparkPos = new Float32Array(sparkN * 3).fill(-99); let sparkI = 0;
const sparkGeo = new THREE.BufferGeometry(); sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
G.scene.add(new THREE.Points(sparkGeo, new THREE.PointsMaterial({ map: glowTex, color: '#FFE08A', size: 1.6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
const FLIGHT_SPOTS = [{ name: 'Creekside bank', p: V3(57, 0, -8) }, { name: 'The Woodpile', p: V3(30, 0, -40) }, { name: 'The Old Garden', p: V3(-24, 0, -36) }];
const flightRings = FLIGHT_SPOTS.map((f) => { const r = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.9, 40), new THREE.MeshBasicMaterial({ color: '#FFD25A', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })); r.rotation.x = -Math.PI / 2; r.position.set(f.p.x, 0.8, f.p.z); r.visible = false; G.scene.add(r); tapTarget(G, r, () => { if (r.visible) act.fly(f); }); return r; });
G.tick.push((t) => { flightRings.forEach((r, i) => { if (r.visible) r.scale.setScalar(1 + 0.15 * Math.sin(t * 4 + i)); }); });
let colonies = 1;
G.chips = () => [
  { label: 'Nuptial flight', fn: () => act.nuptial(), off: colonies > 3 },
  { label: 'Dive to my patch', fn: () => go('patch') },
];
G.home = () => ({ tx: 4, ty: 0, tz: -2, yaw: 0.1, pitch: 0.95, dist: clamp(fitDist(170, 100), 120, 360) });
G.minK = 0.42; G.maxK = 1.3; G.down = 'patch'; G.zoomPlane = 'xz';
G.bounds = { x: [-60, 80], z: [-60, 55] };
G.unitMM = 100;

// ================================================================ camera, input, transitions
let active = P;
function minD(w) { return w.min ?? w.home().dist * w.minK; }
function maxD(w) { return w.home().dist * w.maxK; }
function clampGoal() {
  const w = active;
  goal.dist = clamp(goal.dist, minD(w), maxD(w));
  goal.pitch = clamp(goal.pitch, w.pitchLim?.[0] ?? 0.06, w.pitchLim?.[1] ?? 1.35);
  if (w.yawLim) goal.yaw = clamp(goal.yaw, -w.yawLim, w.yawLim);
  if (w.bounds.x) goal.tx = clamp(goal.tx, ...w.bounds.x);
  if (w.bounds.z) goal.tz = clamp(goal.tz, ...w.bounds.z);
  if (w.bounds.y) goal.ty = clamp(goal.ty, ...w.bounds.y);
}
function applyCam() {
  const cp = Math.cos(view.pitch);
  camera.position.set(view.tx + Math.sin(view.yaw) * cp * view.dist, view.ty + Math.sin(view.pitch) * view.dist, view.tz + Math.cos(view.yaw) * cp * view.dist);
  camera.lookAt(view.tx, view.ty, view.tz);
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function setRay(cx, cy) { const r = canvas.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
function planeHit(cx, cy) {
  setRay(cx, cy); const w = active; const pl = w.zoomPlane === 'xy' ? new THREE.Plane(ZAX, 0) : new THREE.Plane(UP, -(w === P ? gH(goal.tx, goal.tz) : 0));
  return ray.ray.intersectPlane(pl, new THREE.Vector3());
}
let push = 0, hintTimer = 0;
function hint(text) { const h = $('hint'); h.textContent = text; h.hidden = false; clearTimeout(hintTimer); hintTimer = setTimeout(() => { h.hidden = true; }, 1600); }
function zoomBy(f, cx, cy) {
  if (trans) return; const w = active;
  if (f > 1 && goal.dist >= maxD(w) * 0.995 && w.up) { push += Math.log(f); hint(`Keep zooming out to rise to the ${worlds[w.up].label}`); if (push > 0.5) { push = 0; go(w.up); } return; }
  if (f < 1 && goal.dist <= minD(w) * 1.005 && w.down) { push -= Math.log(f); hint(`Keep zooming in to dive into your ${worlds[w.down].label.toLowerCase()}`); if (push > 0.5) { push = 0; go(w.down); } return; }
  push = 0;
  const nd = clamp(goal.dist * f, minD(w), maxD(w)); const k = 1 - nd / goal.dist;
  if (cx != null && k > 0) { const hit = planeHit(cx, cy); if (hit) { goal.tx += (hit.x - goal.tx) * k; if (w.zoomPlane === 'xy') goal.ty += (hit.y - goal.ty) * k; else goal.tz += (hit.z - goal.tz) * k; } }
  if (k < 0 && w.zoomPlane === 'xy') { const h = w.home(); const kk = clamp((nd - goal.dist) / Math.max(1, maxD(w) - goal.dist), 0, 1); goal.tx = lerp(goal.tx, h.tx, kk); goal.ty = lerp(goal.ty, h.ty, kk); }
  goal.dist = nd;
  if (w.autoPitch) goal.pitch = w.autoPitch(nd);
  clampGoal();
  if (w.targetY) goal.ty = w.targetY(goal.tx, goal.tz, goal.dist);
}
const ptrs = new Map(); let down = null, pinch0 = 0;
const pDist = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
canvas.addEventListener('pointerdown', (e) => {
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
  if (ptrs.size === 2) { pinch0 = pDist(); down = null; }
  try { canvas.setPointerCapture(e.pointerId); } catch {}
});
canvas.addEventListener('pointermove', (e) => {
  const prev = ptrs.get(e.pointerId);
  if (!prev) { if (e.pointerType === 'mouse') { setRay(e.clientX, e.clientY); canvas.style.cursor = ray.intersectObjects(active.taps, false).length ? 'pointer' : 'grab'; } return; }
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y; prev.x = e.clientX; prev.y = e.clientY;
  if (ptrs.size === 1) {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 9) down.moved = true;
    if (!down || !down.moved) return;
    const w = active; const zoomed = goal.dist < w.home().dist * 0.7;
    if (zoomed && w === N) { const s = goal.dist / 900; goal.tx -= dx * s * 1.6; goal.ty += dy * s * 1.6; clampGoal(); return; }
    goal.yaw -= dx * 0.005; if (e.pointerType === 'mouse') goal.pitch += dy * 0.004; clampGoal();
    if (w.targetY) goal.ty = w.targetY(goal.tx, goal.tz, goal.dist);
  } else if (ptrs.size === 2) { const d = pDist(); if (pinch0 > 0) zoomBy(pinch0 / d); pinch0 = d; }
});
const endPtr = (e) => {
  if (down && !down.moved && ptrs.size === 1 && performance.now() - down.t < 500 && e.type === 'pointerup') {
    setRay(e.clientX, e.clientY); const hit = ray.intersectObjects(active.taps, false)[0];
    if (hit) { let o = hit.object; while (o && !o.userData.tap) o = o.parent; o?.userData.tap(); }
  }
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; if (!ptrs.size) down = null;
};
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(Math.exp(clamp(e.deltaY, -120, 120) * 0.0016), e.clientX, e.clientY); }, { passive: false });
canvas.addEventListener('dblclick', () => resetView());

P.label = 'Patch'; N.label = 'Nest'; G.label = 'Garden';
let trans = false;
function swapTo(w) {
  active = w; w.scene.add(camera);
  lensFg.visible = lensBk.visible = w === P;
  applyNight(w, night);
  document.querySelectorAll('[data-go]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.go === w.name)));
  stage.dataset.scale = w.name; refreshChips(); closeSheet();
}
function go(name) {
  const to = worlds[name]; if (!to || to === active || trans) return;
  trans = true; const rising = to.level < active.level; closeSheet();
  hazeEl.style.background = night > 0.5 ? '#0B1022' : '#F7EED8';
  const d0 = goal.dist;
  tween(reduced ? 0.15 : 0.5, (k) => { hazeEl.style.opacity = String(ease(k)); goal.dist = view.dist = d0 * (rising ? 1 + ease(k) * 1.4 : 1 - 0.75 * ease(k)); }, () => {
    swapTo(to); const h = to.home(); Object.assign(goal, h); Object.assign(view, h); view.dist = h.dist * (rising ? 0.3 : 2.4); if (reduced) view.dist = h.dist;
    tween(reduced ? 0.15 : 0.75, (k) => { hazeEl.style.opacity = String(1 - ease(k)); }, () => { trans = false; hazeEl.style.opacity = '0'; });
  });
}
function resetView() { const h = active.home(); Object.assign(goal, h); }

// ---------------------------------------------------------------- HUD: chips, sheets, toasts, resources
const chipsEl = $('chips');
function refreshChips() {
  chipsEl.innerHTML = '';
  for (const c of active.chips()) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + (c.hot ? ' hot' : ''); b.textContent = c.label; b.disabled = !!c.off;
    b.addEventListener('click', () => c.fn()); chipsEl.appendChild(b);
  }
}
let sheetClose = null;
function openSheet(title, body, actions, onClose) {
  closeSheet(); $('sheetTitle').textContent = title; $('sheetBody').innerHTML = body; const a = $('sheetActions'); a.innerHTML = '';
  for (const x of actions) { const b = document.createElement('button'); b.type = 'button'; b.textContent = x.label; b.className = x.primary ? 'primary' : ''; b.disabled = !!x.off; b.addEventListener('click', () => { closeSheet(); x.fn(); }); a.appendChild(b); }
  $('sheet').hidden = false; sheetClose = onClose ?? null;
}
function closeSheet() { $('sheet').hidden = true; if (sheetClose) { const f = sheetClose; sheetClose = null; f(); } }
$('sheetX').addEventListener('click', closeSheet);
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
let toastT = 0;
function toast(text) { const t = $('toast'); t.textContent = text; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 4200); }
const RES = { foliage: 12480, protein: 6215, nectar: 3902 }, RATE = { foliage: 3.1, protein: 1.4, nectar: 0.9 };
function gain(k, n) { RES[k] = Math.max(0, RES[k] + n); const el = $('res-' + k); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
function drawRes() { for (const k in RES) $('res-' + k).querySelector('b').textContent = fmt(RES[k]); }

// ---------------------------------------------------------------- the actions (each stands for a real system)
const act = {
  antsEye() {
    if (active !== P) { go('patch'); later(1.4, () => act.antsEye()); return; }
    closeSheet(); Object.assign(goal, { tx: -9.6, tz: 6.6, yaw: 0.32, pitch: 0.09, dist: 2.3 }); goal.ty = P.targetY(goal.tx, goal.tz, goal.dist);
    toast('Ant level. Same patch, same ants, but now a grass blade is a tree and a marble is a boulder.');
  },
  forage() {
    if (active !== P) { go('patch'); later(1.4, () => act.forage()); return; }
    if (FO.phase !== 'idle') return;
    FO.phase = 'lay'; FO.t0 = U.time.value; wildsTrail.visible = true; wildsTrail.userData.reveal(0); forageTag.show = true; forageTag.el.innerHTML = '<b>Laying a trail</b> to the wilds';
    Object.assign(goal, P.home()); refreshChips(); toast('A scout lays a scent trail to the wilds, and the foragers follow it.');
  },
  swarm() {
    if (active !== P) { go('patch'); later(1.4, () => act.swarm()); return; }
    if (SW.on) return;
    SW.on = true; SW.mode = 'advance'; SW.took = false; SW.F = -2; SW.Fmax = SW.L - 4.6; SW.v = (SW.Fmax + 2) / 11;
    pSwarm.dead.fill(0); pSwarmMaj.dead.fill(0); alarm.visible = true; swarmTag.show = true; Object.assign(goal, { tx: 9, tz: 3, yaw: -0.5, pitch: 0.62, dist: clamp(fitDist(40, 26), 26, 80) }); goal.ty = 0; refreshChips();
    openSheet('Army-ant swarm incoming', `<p><b>${fmt(pSwarm.n + pSwarmMaj.n)}</b> army ants are coming out of the wilds. In the game you get 4 hours’ warning.</p><p>Keep the army home and fight, or send it away and let the swarm take some food?</p>`, [
      { label: 'Hold the line', primary: true, fn: () => act.hold() },
      { label: 'Send the army away', fn: () => act.away() },
    ]);
  },
  hold() {
    SOL.mode = 'rally'; SOL.k = 0; toast('Soldiers pour out and form a line between the nest and the swarm.');
    const wait = () => { if (SW.F < SW.Fmax - 0.05) return later(0.3, wait); SW.mode = 'clash'; dustOn = true; later(2.6, resolveHold); };
    later(0.5, wait);
  },
  away() {
    SOL.mode = 'away'; SOL.t0 = U.time.value; SW.Fmax = SW.L - 0.4; SW.v *= 1.15; toast('The army slips out the other way. The swarm will find the nest unguarded.');
    const wait = () => { if (SW.F < SW.Fmax - 0.05) return later(0.3, wait); SW.mode = 'clash'; later(2.4, () => { SW.took = true; SW.mode = 'retreat'; alarm.visible = false; swarmTag.el.innerHTML = '<b>Swarm leaving</b> with your food'; gain('foliage', -1900); gain('nectar', -620); toast('The swarm took 30% of the unprotected food (made up). Nothing else is lost; the army comes home later.'); }); };
    later(0.5, wait);
  },
  haul() { if (!corpseCount || HAUL.on) return; HAUL.on = true; HAUL.t0 = U.time.value; refreshChips(); toast('Workers haul the dead home as protein, like in the game.'); },
  dig(id) {
    if (active !== N) { go('nest'); later(1.4, () => act.dig(id)); return; }
    if (DIG.on) return; DIG.on = true; DIG.id = id; refreshChips();
    diggers.ref.path = pathTo(R_(id), R_('queen_chamber'), 22); diggers.off = false;
    const r0 = R_(id); Object.assign(goal, { tx: r0.x * 0.6, ty: r0.y * 0.7, dist: N.home().dist * 0.6 });
    roomTags[id].el.innerHTML = `<b>${CH[id][0]}</b> digging · 6m`;
    const L0 = LV[id]; let step = 0;
    const grow = () => {
      step++; LV[id] = L0 + step * 0.25; buildFace(); placePickers(); paintGlow(); for (const g of nGroups) if (g.id === id) g.ref.path = pathTo(R_(id), R_('queen_chamber'), g.fromX);
      if (id === 'granary') fillGranary();
      spoil.scale.set(1.1 + step * 0.22, 0.5 + step * 0.18, 0.9 + step * 0.2);
      if (step < 4) later(1.3, grow); else {
        LV[id] = L0 + 1; CH[id][1] = LV[id]; placePickers(); diggers.off = true; DIG.on = false; refreshChips();
        const r = R_(id); ring.position.set(r.x, r.y, 0.05); tween(1.4, (k) => { ring.scale.set((r.rx + 0.2) * (1 + k * 0.35), (r.ry + 0.2) * (1 + k * 0.35), 1); ring.material.opacity = 0.95 * (1 - k); });
        toast(`${CH[id][0]} reached level ${LV[id]}. The hollow is wider; the spoil went up the shaft to the heap.`);
      }
    };
    later(1.6, grow);
    toast('Diggers carry soil pellets up the shaft while the hollow widens.');
  },
  nuptial() {
    if (active !== G) { go('garden'); later(1.4, () => act.nuptial()); return; }
    flightRings.forEach((r) => (r.visible = true));
    openSheet('Nuptial flight', '<p>Send a Winged Queen to found a new colony. Pick a free spot: tap a gold ring in the garden, or choose here.</p>', FLIGHT_SPOTS.map((f, i) => ({ label: f.name, primary: i === 0, fn: () => act.fly(f) })), () => flightRings.forEach((r) => (r.visible = false)));
  },
  fly(f) {
    closeSheet(); flightRings.forEach((r) => (r.visible = false));
    const a = V3(HOME.x, 2, HOME.z), b = V3(f.p.x, 2, f.p.z), m = a.clone().add(b).multiplyScalar(0.5); m.y = 34;
    const curve = new THREE.QuadraticBezierCurve3(a, m, b); queenSprite.visible = true;
    toast('A winged queen rises from your colony…');
    tween(4.2, (k) => {
      curve.getPoint(ease(k), queenSprite.position); queenSprite.scale.set(5 * (0.75 + 0.25 * Math.abs(Math.sin(k * 60))), 5, 1);
      const i = sparkI++ % sparkN; sparkPos[i * 3] = queenSprite.position.x; sparkPos[i * 3 + 1] = queenSprite.position.y; sparkPos[i * 3 + 2] = queenSprite.position.z; sparkGeo.attributes.position.needsUpdate = true;
    }, () => {
      queenSprite.visible = false; colonies++; const l = addLight(f.p.x, f.p.z, 'you'); l.scale.setScalar(0.1);
      tween(1, (k) => l.scale.setScalar(l.userData.base * ease(k)));
      tag(G, `<b>Hormiguero ${colonies}</b> just founded`, V3(f.p.x, 6, f.p.z), 'you');
      trail(G, raidArc(HOME, f.p, 5), '#FFC93C', { r: 0.22, dots: 0.4, flow: 0.6, res: 1.5 });
      toast(`She landed, shed her wings and dug in: Hormiguero ${colonies} is founded (made up).`); refreshChips();
      later(3, () => { sparkPos.fill(-99); sparkGeo.attributes.position.needsUpdate = true; });
    });
  },
};
function resolveHold() {
  dustOn = false; let n = 0;
  for (const g of [pSwarm, pSwarmMaj]) for (let i = 0; i < g.n; i++) {
    if (g.depth[i] < 3.4 && rnd() < 0.55 && n < pCorpse.n) {
      const [x, z] = swarmPos(g, i, U.time.value); g.dead[i] = 1;
      pCorpse.put(n++, x, gH(x, z), z, R(0, 6.28), 0, false, 0, pCorpse.s, true);
    }
  }
  corpseCount = n; pCorpse.commit();
  SW.mode = 'retreat'; alarm.visible = false; swarmTag.el.innerHTML = '<b>Swarm beaten</b> falling back';
  later(1.8, () => { SOL.mode = 'return'; });
  toast(`You held. ${fmt(n)} army ants fell (made up: in the game the server runs the battle and sends the report).`);
  refreshChips();
}

// ---------------------------------------------------------------- labels, scale bar, loop
const _lp = new THREE.Vector3();
function updateLabels() {
  const W2 = stage.clientWidth, H2 = stage.clientHeight; const hide = trans || hazeEl.style.opacity > 0.3; const narrow = W2 < 640;
  for (const w of Object.values(worlds)) for (const L of w.labels) {
    if (w !== active || !L.show || hide || (L.near && view.dist > L.near) || (narrow && L.el.classList.contains('small') && view.dist > w.home().dist * 0.8)) { L.el.style.display = 'none'; continue; }
    _lp.copy(L.pos).project(camera);
    if (_lp.z > 1 || Math.abs(_lp.x) > 1.05 || Math.abs(_lp.y) > 1.05) { L.el.style.display = 'none'; continue; }
    L.el.style.display = ''; L.el.style.transform = `translate(${(_lp.x * 0.5 + 0.5) * W2}px, ${(-_lp.y * 0.5 + 0.5) * H2}px) translate(-50%, -100%)`;
  }
}
function updateScaleBar() {
  const w = 2 * TANH * camera.aspect * view.dist; const mm = w * active.unitMM;
  const across = mm >= 1000 ? `${(mm / 1000).toFixed(mm >= 10000 ? 0 : 1)} m` : `${Math.round(mm / 10)} cm`;
  $('scalebar').textContent = `View ≈ ${across} across · ${fmt(mm / 5)} ant lengths`;
}
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); fitLens();
}
let started = false, visible = true;
new ResizeObserver(() => { resize(); if (!started) { started = true; Object.assign(goal, active.home()); Object.assign(view, goal); } }).observe(stage);
new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(stage);
document.addEventListener('visibilitychange', () => { if (document.hidden) visible = false; else visible = true; });

const themeAttr = document.documentElement.getAttribute('data-theme');
night = nightGoal = (themeAttr ? themeAttr === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches) ? 1 : 0;
$('dn').addEventListener('click', () => { nightGoal = nightGoal > 0.5 ? 0 : 1; $('dn').textContent = nightGoal ? 'Day' : 'Night'; });
$('dn').textContent = night ? 'Day' : 'Night';
$('reset').addEventListener('click', resetView);
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));

swapTo(P);
resize(); Object.assign(goal, P.home()); Object.assign(view, goal);
const clock = new THREE.Clock(); let resAcc = 0;
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (visible) step(dt);
}
function step(dt) {
  U.time.value += dt; const t = U.time.value;
  for (let i = tweens.length - 1; i >= 0; i--) { const tw = tweens[i]; tw.t += dt; const k = Math.min(1, tw.t / tw.dur); tw.fn(k); if (k >= 1) { tweens.splice(i, 1); tw.done?.(); } }
  if (Math.abs(nightGoal - night) > 0.001) { night += clamp(nightGoal - night, -dt * 1.2, dt * 1.2); applyNight(active, night); }
  const s = 1 - Math.exp(-dt * 6);
  for (const k of ['tx', 'ty', 'tz', 'yaw', 'pitch', 'dist']) view[k] += (goal[k] - view[k]) * s;
  applyCam();
  for (const f of active.tick) f(t, dt);
  if (active === P) {
    const close = 1 - smooth(2.5, 22, view.dist);
    lensFg.material.opacity = 0.08 + 0.9 * close; bokehMat.opacity = (0.03 + 0.4 * close) * (1 - night * 0.6);
    if (!reduced) lensFg.position.x = Math.sin(t * 0.6) * 0.008;
    if (P.marble) P.marble.children[1].rotation.y = t * 0.2;
  }
  renderer.render(active.scene, camera);
  updateLabels(); updateScaleBar();
  resAcc += dt; if (resAcc > 0.25) { resAcc = 0; for (const k in RES) RES[k] += RATE[k] * 0.25 * 5; drawRes(); }
}
$('fallback').hidden = true;
frame();
window.__mock = { go, act, worlds, view, goal, advance(sec) { for (let i = 0; i < sec * 20; i++) step(0.05); }, get active() { return active.name; }, setNight: (k) => { nightGoal = night = k; applyNight(active, k); } };
