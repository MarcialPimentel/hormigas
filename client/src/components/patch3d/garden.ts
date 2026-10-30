// The Garden (docs/art/sunlit-microcosm.md, "The big idea"; docs/11-world.md): the whole world as one back garden,
// the "galaxy" level of the scale ladder. The five regions are places in it (the lawn, the old flowerbeds, the
// creek, the woodpile, the long grass), and each inhabited patch is a light: yours honey, a supercolony mate's
// teal, everyone else's plain. Like the region grid it replaces, it never shows names or strength. By night it
// becomes a star map. A winged queen on her way to found a colony flies an arc across it.
//
// Scale: 1 unit ≈ 50 cm. A patch (about a metre) is two units; a region is ten patches square.
import * as THREE from 'three';
import { WORLD } from '@hormigas/shared';
import type { ServerState } from '../../game';

export interface GardenPatch {
  patch: number;
  colonies: number;
  wild: boolean;
  mine: boolean;
  ally?: boolean;
}
export interface GardenData {
  state: ServerState | null;
  now: number;
}
export interface GardenScene {
  /** One region's patches (from /api/map/region). */
  setRegion(region: number, patches: GardenPatch[]): void;
  /** The patch being looked at (a ring marks it). */
  setCurrent(region: number, patch: number): void;
  setReduced(r: boolean): void;
  resetView(): void;
  setOnScale(fn: (text: string) => void): void;
  dispose(): void;
}

const CM_PER_UNIT = 50;
const SIDE = Math.round(Math.sqrt(WORLD.patchesPerRegion)); // 10 × 10
const CELL = 2;
/** Where each region lies in the garden, and what its ground is like. */
const PLOTS = [
  { x: 0, z: 15, ground: '#86B84E', rim: '#6E9A3A', yaw: 0.04 }, // The Backyard: the lawn by the house
  { x: -27, z: -3, ground: '#8A6A44', rim: '#6E5236', yaw: -0.12 }, // The Old Garden: flowerbeds
  { x: 27, z: -3, ground: '#86AE8E', rim: '#5E8A6A', yaw: 0.1 }, // Creekside
  { x: -13, z: -25, ground: '#9C7E58', rim: '#7A5E3E', yaw: 0.08 }, // The Woodpile
  { x: 14, z: -25, ground: '#6E9A3A', rim: '#557A2C', yaw: -0.06 }, // The Long Grass
];
const PLOT_W = SIDE * CELL + 2;

/** Where a patch's light sits in the garden: its region's plot, row by row, a little irregular. */
export function patchPos(region: number, patch: number) {
  const p = PLOTS[(region - 1) % PLOTS.length];
  const i = patch - 1, col = i % SIDE, row = Math.floor(i / SIDE);
  const jx = Math.sin(patch * 12.9898 + region * 4.1) * 0.35, jz = Math.cos(patch * 78.233 + region * 2.7) * 0.35;
  const lx = (col - (SIDE - 1) / 2) * CELL + jx, lz = (row - (SIDE - 1) / 2) * CELL + jz;
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  return { x: p.x + lx * c - lz * s, z: p.z + lx * s + lz * c };
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function skyFor(hour: number) {
  if (hour >= 6 && hour < 8) return { sky: '#C7A7A0', night: 0.35 };
  if (hour >= 8 && hour < 17) return { sky: '#B8DCEA', night: 0 };
  if (hour >= 17 && hour < 20) return { sky: '#9C7A8A', night: 0.5 };
  return { sky: '#0A1128', night: 1 };
}
const LIGHT = { mine: '#FFC93C', ally: '#3FC2B8', other: '#FFF1D6' };

export async function createGardenScene(
  host: HTMLElement,
  labelsEl: HTMLElement,
  get: () => GardenData,
  cb: { onPick: (region: number, patch: number) => void },
  initiallyReduced: boolean,
): Promise<GardenScene> {
  const canvas = document.createElement('canvas');
  canvas.className = 'p3-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  host.prepend(canvas);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const coarse = matchMedia('(pointer: coarse)').matches;
  let reduced = initiallyReduced;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog('#B8DCEA', 90, 260);
  scene.background = new THREE.Color('#B8DCEA');
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 900);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  const mat = (hex: string, o: THREE.MeshStandardMaterialParameters = {}) => {
    const k = hex + JSON.stringify(o);
    if (!mats.has(k)) mats.set(k, keep(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9, ...o })));
    return mats.get(k)!;
  };
  const rnd = seeded(77);
  const rr = (a: number, b: number) => a + (b - a) * rnd();
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

  // ---------- light ----------
  const hemi = new THREE.HemisphereLight('#E4F2FF', '#7A6A4C', 1.15);
  const sun = new THREE.DirectionalLight('#FFE2A6', 1.9);
  sun.position.set(-60, 70, -50);
  scene.add(hemi, sun);

  // ---------- the garden: lawn, house wall, the five plots and what grows on them ----------
  {
    const lawn = new THREE.Mesh(keep(new THREE.PlaneGeometry(400, 300)), mat('#7FA84A'));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = -0.05;
    scene.add(lawn);
    // the back of the house, beyond the lawn, and a strip of patio
    const wall = new THREE.Mesh(keep(new THREE.BoxGeometry(140, 26, 2)), mat('#E8DCC8'));
    wall.position.set(0, 13, 44);
    scene.add(wall);
    const patio = new THREE.Mesh(keep(new THREE.BoxGeometry(110, 0.3, 10)), mat('#C9B9A2'));
    patio.position.set(0, 0.05, 37);
    scene.add(patio);
    // a fence along the back
    for (let x = -90; x <= 90; x += 3.2) {
      const post = new THREE.Mesh(keep(new THREE.BoxGeometry(2.8, 14, 0.4)), mat(pick(['#B98A5E', '#A97A50', '#C49668'])));
      post.position.set(x, 7, -52);
      scene.add(post);
    }
    PLOTS.forEach((p, i) => {
      const plot = new THREE.Mesh(keep(new THREE.BoxGeometry(PLOT_W, 0.2, PLOT_W)), mat(p.ground));
      plot.position.set(p.x, 0.05, p.z);
      plot.rotation.y = -p.yaw;
      scene.add(plot);
      const edge = new THREE.Mesh(keep(new THREE.BoxGeometry(PLOT_W + 1, 0.12, PLOT_W + 1)), mat(p.rim));
      edge.position.set(p.x, 0, p.z);
      edge.rotation.y = -p.yaw;
      scene.add(edge);
      const at = (lx: number, lz: number) => {
        const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
        return new THREE.Vector3(p.x + lx * c - lz * s, 0, p.z + lx * s + lz * c);
      };
      const H = PLOT_W / 2;
      if (i === 1) {
        // flowers in the old beds
        for (let k = 0; k < 60; k++) {
          const v = at(rr(-H, H), rr(-H, H));
          const f = new THREE.Mesh(keep(new THREE.SphereGeometry(rr(0.15, 0.3), 8, 6)), mat(pick(['#FFD23F', '#F6B6D2', '#FF6B4F', '#FBF7EE', '#B49BFF'])));
          f.position.set(v.x, rr(0.3, 0.7), v.z);
          scene.add(f);
        }
      } else if (i === 2) {
        // the creek runs through Creekside
        const water = new THREE.Mesh(keep(new THREE.PlaneGeometry(3.2, PLOT_W + 30)), mat('#5E9FC0', { roughness: 0.1, metalness: 0.1 }));
        water.rotation.set(-Math.PI / 2, 0, -p.yaw + 0.2);
        water.position.set(p.x + 4, 0.18, p.z);
        scene.add(water);
      } else if (i === 3) {
        // the woodpile behind its plot
        for (let k = 0; k < 9; k++) {
          const log = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.1, 1.1, 9, 12)), mat(pick(['#7A5234', '#8A6040', '#6E4A2C'])));
          log.rotation.set(Math.PI / 2, 0, Math.PI / 2 + rr(-0.1, 0.1));
          const v = at(rr(-6, 6), -H - 3 - (k % 3) * 0.2);
          log.position.set(v.x, 1.1 + Math.floor(k / 3) * 1.9, v.z);
          scene.add(log);
        }
      } else if (i === 4) {
        // tall grass tufts
        for (let k = 0; k < 90; k++) {
          const v = at(rr(-H, H), rr(-H, H));
          const t = new THREE.Mesh(keep(new THREE.ConeGeometry(0.4, rr(1.5, 3.5), 5)), mat(pick(['#5E8A2E', '#7FA048', '#4F7A36'])));
          t.position.set(v.x, 1, v.z);
          scene.add(t);
        }
      }
    });
    // shrubs around the edges
    for (let k = 0; k < 26; k++) {
      const a = (k / 26) * Math.PI * 2;
      const b = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(rr(3, 6), 1)), mat(pick(['#4F7A36', '#5E8A3A', '#3F6A2C']), { flatShading: true }));
      b.position.set(Math.cos(a) * rr(58, 70), 2, Math.sin(a) * rr(42, 50) - 6);
      if (b.position.z > 30) continue;
      scene.add(b);
    }
  }

  // ---------- lights: one per inhabited patch ----------
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return keep(new THREE.CanvasTexture(c));
  })();
  const dotTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(32, 32, 22, 0, 7);
    g.fill();
    g.strokeStyle = 'rgba(43,29,19,0.85)';
    g.lineWidth = 5;
    g.stroke();
    return keep(new THREE.CanvasTexture(c));
  })();
  interface Light { sprite: THREE.Sprite; region: number; patch: number; kind: 'mine' | 'ally' | 'other'; size: number; phase: number }
  const regions = new Map<number, GardenPatch[]>();
  const lightGroup = new THREE.Group();
  scene.add(lightGroup);
  let lights: Light[] = [];
  const spriteMats = { day: new Map<string, THREE.SpriteMaterial>(), night: new Map<string, THREE.SpriteMaterial>() };
  const spriteMat = (color: string, night: boolean) => {
    const m = night ? spriteMats.night : spriteMats.day;
    if (!m.has(color))
      m.set(color, keep(new THREE.SpriteMaterial({ map: night ? glowTex : dotTex, color, transparent: true, depthWrite: false, blending: night ? THREE.AdditiveBlending : THREE.NormalBlending })));
    return m.get(color)!;
  };
  let nightK = 0;
  function rebuildLights() {
    lightGroup.clear();
    lights = [];
    const night = nightK > 0.5;
    for (const [region, patches] of regions) {
      for (const p of patches) {
        if (!p.colonies && !p.mine) continue;
        const kind = p.mine ? 'mine' : p.ally ? 'ally' : 'other';
        const size = (night ? 3.2 : 2) * (kind === 'mine' ? 1.5 : kind === 'ally' ? 1.2 : 0.85 + Math.min(0.5, p.colonies * 0.12));
        const s = new THREE.Sprite(spriteMat(LIGHT[kind], night));
        const { x, z } = patchPos(region, p.patch);
        s.position.set(x, night ? 1.4 : 1.2, z);
        s.scale.setScalar(size);
        s.userData = { region, patch: p.patch };
        lightGroup.add(s);
        lights.push({ sprite: s, region, patch: p.patch, kind, size, phase: rnd() * 6.28 });
      }
    }
    rebuildThreads();
  }

  // ---------- threads between you and your supercolony mates ----------
  const threadGroup = new THREE.Group();
  scene.add(threadGroup);
  const threadMat = keep(new THREE.MeshBasicMaterial({ color: LIGHT.ally, transparent: true, opacity: 0.55, depthWrite: false }));
  function rebuildThreads() {
    for (const c of threadGroup.children) (c as THREE.Mesh).geometry.dispose();
    threadGroup.clear();
    const home = lights.find((l) => l.kind === 'mine');
    if (!home) return;
    for (const l of lights) {
      if (l.kind !== 'ally') continue;
      const a = home.sprite.position, b = l.sprite.position;
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.y += 2 + a.distanceTo(b) * 0.18;
      const g = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone()), 40, 0.08, 5);
      threadGroup.add(new THREE.Mesh(g, threadMat));
    }
  }

  // ---------- the current patch, and winged queens in flight ----------
  const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(1.3, 0.12, 6, 40)), keep(new THREE.MeshBasicMaterial({ color: '#FFC93C', transparent: true, opacity: 0.9 })));
  ring.rotation.x = Math.PI / 2;
  ring.visible = false;
  scene.add(ring);
  const queenMat = keep(new THREE.SpriteMaterial({ map: glowTex, color: '#FFE08A', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const queens: THREE.Sprite[] = [];
  const trailMat = keep(new THREE.LineDashedMaterial({ color: '#FFE08A', dashSize: 0.6, gapSize: 0.5, transparent: true, opacity: 0.7 }));
  const trailGroup = new THREE.Group();
  scene.add(trailGroup);
  let flightsKey = '';
  function drawFlights(d: GardenData) {
    const st = d.state;
    const homes = new Map((st?.colonies ?? []).map((c) => [c.id, c.coords]));
    const flights = ((st?.missions ?? []) as any[]).filter((m) => m.type === 'colonize' && m.status === 'outbound' && homes.has(m.originColonyId));
    const key = flights.map((m) => m.id).join(',');
    if (key !== flightsKey) {
      flightsKey = key;
      for (const c of trailGroup.children) (c as THREE.Line).geometry.dispose();
      trailGroup.clear();
      for (const m of flights) {
        const a = homes.get(m.originColonyId)!, b = m.target;
        const pa = patchPos(a.region, a.patch), pb = patchPos(b.region, b.patch);
        const curve = arc(pa, pb);
        const g = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
        const line = new THREE.Line(g, trailMat);
        line.computeLineDistances();
        trailGroup.add(line);
      }
    }
    while (queens.length < flights.length) {
      const s = new THREE.Sprite(queenMat);
      s.scale.setScalar(2.6);
      scene.add(s);
      queens.push(s);
    }
    queens.forEach((q, i) => {
      const m = flights[i];
      q.visible = !!m;
      if (!m) return;
      const a = homes.get(m.originColonyId)!, b = m.target;
      const k = Math.max(0, Math.min(1, (d.now - m.departAt) / (m.arriveAt - m.departAt)));
      q.position.copy(arc(patchPos(a.region, a.patch), patchPos(b.region, b.patch)).getPoint(k));
      if (!reduced) q.position.y += Math.sin(clock * 6) * 0.15;
      label(`flight-${m.id}`, 'nest-trip p3-trip ours', q.position.x, q.position.y + 1.6, q.position.z, `Winged queen · ${Math.max(0, Math.ceil((m.arriveAt - d.now) / 60000))}m`);
    });
  }
  const arc = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    const h = 4 + Math.hypot(b.x - a.x, b.z - a.z) * 0.35;
    return new THREE.QuadraticBezierCurve3(new THREE.Vector3(a.x, 1.4, a.z), new THREE.Vector3((a.x + b.x) / 2, h, (a.z + b.z) / 2), new THREE.Vector3(b.x, 1.4, b.z));
  };

  // ---------- labels ----------
  const labelEls = new Map<string, HTMLDivElement>();
  const seen = new Set<string>();
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
    el.style.left = `${((pv.x + 1) / 2) * host.clientWidth}px`;
    el.style.top = `${((1 - pv.y) / 2) * host.clientHeight}px`;
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  // ---------- camera ----------
  const TANH = Math.tan(THREE.MathUtils.degToRad(20));
  const view = { tx: 0, tz: -4, dist: 100, yaw: 0 }, goal = { ...view };
  let homeDist = 100;
  const MIN_DIST = 12;
  const pitchFor = (dist: number) => THREE.MathUtils.lerp(0.55, 0.95, THREE.MathUtils.smoothstep(dist, MIN_DIST, homeDist));
  function fit() {
    const w = host.clientWidth, h = host.clientHeight;
    if (w < 2 || h < 2) return;
    sized = [w, h];
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const wasHome = goal.dist >= homeDist * 0.999;
    homeDist = Math.max(48 / (TANH * camera.aspect), 34 / TANH);
    if (wasHome || goal.dist > homeDist) goal.dist = homeDist;
  }
  let sized = [0, 0];
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  fit();
  const reset = () => Object.assign(goal, { tx: 0, tz: -4, yaw: 0, dist: homeDist });
  reset();
  Object.assign(view, goal);
  const clampGoal = () => {
    goal.dist = THREE.MathUtils.clamp(goal.dist, MIN_DIST, homeDist);
    goal.tx = THREE.MathUtils.clamp(goal.tx, -45, 45);
    goal.tz = THREE.MathUtils.clamp(goal.tz, -38, 26);
  };

  // pointer: drag to move, wheel to zoom, tap a light to dive into that patch
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  const setNdc = (cx: number, cy: number) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  };
  /** The light nearest the pointer on screen, if it's close enough to mean it. */
  const lightAt = (cx: number, cy: number) => {
    const r = canvas.getBoundingClientRect();
    let best: Light | null = null, bd = 22 * 22;
    for (const l of lights) {
      pv.copy(l.sprite.position).project(camera);
      const sx = ((pv.x + 1) / 2) * r.width + r.left, sy = ((1 - pv.y) / 2) * r.height + r.top;
      const d = (sx - cx) ** 2 + (sy - cy) ** 2;
      if (d < bd) {
        bd = d;
        best = l;
      }
    }
    return best;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const f = Math.exp(e.deltaY * (e.ctrlKey ? 0.012 : 0.0015));
    const d = THREE.MathUtils.clamp(goal.dist * f, MIN_DIST, homeDist);
    setNdc(e.clientX, e.clientY);
    if (ray.ray.intersectPlane(plane, hit)) {
      const k = 1 - d / goal.dist;
      goal.tx += (hit.x - goal.tx) * k;
      goal.tz += (hit.z - goal.tz) * k;
    }
    goal.dist = d;
    clampGoal();
  };
  canvas.addEventListener('wheel', onWheel, { passive: false });
  let drag: { x: number; y: number; sx: number; sy: number; t: number } | null = null;
  const onDown = (e: PointerEvent) => {
    drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() };
    canvas.setPointerCapture?.(e.pointerId);
  };
  let hover: Light | null = null;
  const onMove = (e: PointerEvent) => {
    if (!drag) {
      hover = e.pointerType === 'mouse' ? lightAt(e.clientX, e.clientY) : null;
      canvas.classList.toggle('pointing', !!hover);
      return;
    }
    const u = (2 * goal.dist * TANH) / Math.max(200, host.clientHeight);
    goal.tx -= (e.clientX - drag.x) * u;
    goal.tz -= ((e.clientY - drag.y) * u) / Math.max(0.4, Math.sin(pitchFor(goal.dist)));
    clampGoal();
    drag.x = e.clientX;
    drag.y = e.clientY;
  };
  const onUp = (e: PointerEvent) => {
    if (drag && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8 && performance.now() - drag.t < 500) {
      const l = lightAt(e.clientX, e.clientY);
      if (l) cb.onPick(l.region, l.patch);
    }
    drag = null;
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('dblclick', reset);

  // ---------- day and night ----------
  let hourShown = -1;
  function applySky(hour: number) {
    hourShown = hour;
    const s = skyFor(hour);
    const was = nightK > 0.5;
    nightK = s.night;
    const L = (a: number, b: number) => a + (b - a) * s.night;
    (scene.background as THREE.Color).set(s.sky);
    (scene.fog as THREE.Fog).color.set(s.sky);
    hemi.intensity = L(1.15, 0.25);
    hemi.color.set('#E4F2FF').lerp(new THREE.Color('#4A5A9A'), s.night);
    sun.intensity = L(1.9, 0.15);
    host.style.background = s.sky;
    if (was !== nightK > 0.5) rebuildLights();
  }

  // ---------- scale bar ----------
  const scaleCb: { fn?: (t: string) => void } = {};
  let scaleShown = '';

  // ---------- loop ----------
  let clock = 0, raf = 0, last = performance.now(), sinceStill = 1, visible = true;
  const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting));
  io.observe(host);
  function step(dt: number) {
    const d = get();
    seen.clear();
    clock += reduced ? 0 : dt;
    // a view that opened hidden or at zero size measures itself again once it has one
    if (host.clientWidth !== sized[0] || host.clientHeight !== sized[1]) fit();
    const hour = new Date(d.now).getHours();
    if (hour !== hourShown) applySky(hour);
    const k = reduced ? 1 : Math.min(1, dt * 8);
    view.tx += (goal.tx - view.tx) * k;
    view.tz += (goal.tz - view.tz) * k;
    view.dist += (goal.dist - view.dist) * k;
    const pitch = pitchFor(view.dist);
    camera.position.set(view.tx, view.dist * Math.sin(pitch), view.tz + view.dist * Math.cos(pitch));
    camera.lookAt(view.tx, 0, view.tz);
    // lights breathe a little; yours pulses
    for (const l of lights) {
      const pulse = reduced ? 1 : l.kind === 'mine' ? 1 + 0.15 * Math.sin(clock * 2.4) : 1 + 0.06 * Math.sin(clock * 1.3 + l.phase);
      l.sprite.scale.setScalar(l.size * pulse);
    }
    ring.material.opacity = reduced ? 0.9 : 0.6 + 0.3 * Math.sin(clock * 3);
    for (let r = 1; r <= WORLD.regions; r++) {
      const p = PLOTS[r - 1];
      label(`region-${r}`, 'p3-label region', p.x, 0.5, p.z + PLOT_W / 2 + 1.5, WORLD.regionNames[r - 1] ?? `Region ${r}`);
    }
    if (hover) {
      const p = regions.get(hover.region)?.find((x) => x.patch === hover!.patch);
      const n = p?.colonies ?? 0;
      const what = hover.kind === 'mine' ? 'your colony' : hover.kind === 'ally' ? 'a supercolony mate' : `${n} ${n === 1 ? 'colony' : 'colonies'}`;
      label('hover', 'p3-label', hover.sprite.position.x, hover.sprite.position.y + 1.6, hover.sprite.position.z, `Patch ${hover.patch} · ${what}`);
    }
    drawFlights(d);
    for (const [key, el] of labelEls) if (!seen.has(key)) { el.remove(); labelEls.delete(key); }
    const across = 2 * view.dist * TANH * camera.aspect * CM_PER_UNIT;
    const st = `View ≈ ${across >= 100 ? `${Math.round(across / 100)} m` : `${Math.round(across)} cm`} across · the whole garden`;
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
    if (reduced) {
      sinceStill += dt;
      if (sinceStill < 1) return;
      sinceStill = 0;
    }
    step(dt);
  }
  raf = requestAnimationFrame(frame);
  const still = () => reduced && step(0);

  return {
    setRegion(region, patches) {
      regions.set(region, patches);
      rebuildLights();
      still();
    },
    setCurrent(region, patch) {
      const { x, z } = patchPos(region, patch);
      ring.position.set(x, 0.3, z);
      ring.visible = true;
      still();
    },
    setReduced(r) {
      reduced = r;
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
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('dblclick', reset);
      for (const el of labelEls.values()) el.remove();
      for (const c of [...threadGroup.children, ...trailGroup.children]) (c as THREE.Mesh).geometry.dispose();
      for (const x of disposables) x.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
