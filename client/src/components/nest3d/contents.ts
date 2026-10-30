// What each hollow of the 3D nest holds (docs/12-ui-nest-view.md, "The 3D slab"; docs/art/sunlit-microcosm.md):
// leaf bits in the Granary, prey in the Larder, a honey pool in the Nectar Cellar, hanging repletes, the fungus
// garden, brood, the queen's eggs, aphids on a root, spoil, and violet motes while research runs. Colour comes
// from what the rooms hold. Amounts follow the server's numbers: stores fill with their resource, brood with the
// unit queue, motes only while research runs; everything sizes with the chamber's level and its hollow. Nothing
// here decides anything.
//
// Piles are instanced and laid out once per layout, lowest pieces first, so showing a fuller store only means
// drawing more of them: an empty store is an empty floor, a full one a heap.
import * as THREE from 'three';
import { storageCapacity, type ChamberId, type ResourceId } from '@hormigas/shared';
import type { ServerColony } from '../../game';
import { D, floorAt, type Room } from './slab';

export interface Contents {
  /** Lay out the contents for these built chambers (call again whenever the layout changes). */
  build(rooms: Room[], levels: Partial<Record<ChamberId, number>>): void;
  /** Show the colony as it is now: how full the stores are, how much brood, whether research runs. */
  update(colony: ServerColony | null, researching: boolean, clock: number): void;
  /** 0 by day, 1 at night: the contents catch the hollows' lantern glow. */
  setNight(k: number): void;
  dispose(): void;
}

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

interface Piece {
  x: number;
  y: number;
  z: number;
  rx?: number;
  ry?: number;
  rz?: number;
  s: number;
  sy?: number;
  sz?: number;
  c?: string;
  /** height above the floor: piles fill from the lowest piece up */
  h?: number;
}

export function createContents(parent: THREE.Object3D, coarse: boolean): Contents {
  const group = new THREE.Group();
  parent.add(group);
  const Q = coarse ? 0.5 : 1;
  const keep: { dispose(): void }[] = [];
  const k = <T extends { dispose(): void }>(x: T) => (keep.push(x), x);

  // shapes, shared by every layout
  const LEAF = k(new THREE.CylinderGeometry(0.17, 0.17, 0.025, 7).scale(1, 1, 0.75));
  const CHUNK = k(new THREE.DodecahedronGeometry(0.1));
  const DROP = k(new THREE.SphereGeometry(0.11, 10, 8));
  const BALL = k(new THREE.SphereGeometry(1, 10, 8));
  const LUMP = k(new THREE.IcosahedronGeometry(1, 1));
  const GRIT = k(new THREE.DodecahedronGeometry(1));
  const LARVA = k(new THREE.TorusGeometry(0.16, 0.085, 6, 10, Math.PI * 1.4));
  const REPLETE = k(new THREE.SphereGeometry(1, 16, 12));
  const SHELL = k(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.9, 0.55, 0.6));
  const LEG = k(new THREE.CylinderGeometry(0.03, 0.02, 0.7, 4));
  const POOL = k(new THREE.SphereGeometry(1, 24, 12));

  // materials: a little warm emissive so the contents read inside the hollows, more at night when the lanterns glow
  const glowing: { m: THREE.MeshStandardMaterial; day: number; night: number }[] = [];
  const M = (p: THREE.MeshStandardMaterialParameters, day = 0.12, night = 0.35) => {
    const m = k(new THREE.MeshStandardMaterial({ emissive: '#6A3A18', ...p }));
    glowing.push({ m, day, night });
    m.emissiveIntensity = day;
    return m;
  };
  const leafMat = M({ roughness: 0.6, emissive: '#3A5A10' });
  const chunkMat = M({ roughness: 0.5, flatShading: true, emissive: '#5A1A10' });
  const honeyMat = M({ color: '#F6C64A', roughness: 0.05, emissive: '#E8A010' }, 0.4, 0.75);
  const poolMat = M({ color: '#F0B83A', roughness: 0.08, emissive: '#E89A10' }, 0.35, 0.7);
  const repleteMat = M({ color: '#F2B83A', roughness: 0.12, transparent: true, opacity: 0.92, emissive: '#E89A10' }, 0.45, 0.8);
  const fungusMat = M({ roughness: 0.95, flatShading: true, emissive: '#7A6A40' }, 0.15, 0.4);
  const broodMat = M({ roughness: 0.45, emissive: '#7A6040' }, 0.15, 0.4);
  const aphidMat = M({ color: '#ffffff', roughness: 0.35, emissive: '#5C8E1A' }, 0.25, 0.5);
  const rootMat = M({ color: '#E7D5B0', roughness: 0.8, flatShading: true }, 0.1, 0.3);
  const spoilMat = M({ roughness: 1, flatShading: true, emissive: '#5A2A0E' }, 0.1, 0.3);
  const shellMat = M({ color: '#2F8F83', metalness: 0.7, roughness: 0.25, emissive: '#0F4A44' }, 0.2, 0.4);
  const legMat = M({ color: '#1C2420', roughness: 0.9 }, 0, 0);

  // research motes: soft violet points drifting in the Pheromone Chamber
  const dot = document.createElement('canvas');
  dot.width = dot.height = 64;
  {
    const g = dot.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }
  const dotTex = k(new THREE.CanvasTexture(dot));
  const moteMat = k(new THREE.PointsMaterial({ map: dotTex, color: '#C59BFF', size: 0.5, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));

  // ---------- per layout ----------
  const built: { dispose(): void }[] = [];
  /** instanced piles whose drawn count follows something (a store's fill, the brood) */
  const piles: { im: THREE.InstancedMesh; max: number; by: (c: ServerColony) => number }[] = [];
  let pool: { mesh: THREE.Mesh; r: Room } | null = null;
  let repletes: { im: THREE.InstancedMesh; list: Piece[] } | null = null;
  let larderBeetle: THREE.Object3D | null = null;
  let motes: { pos: Float32Array; geo: THREE.BufferGeometry; seed: number[]; r: Room } | null = null;
  /** how much brood the Brood Hall can show; the Nursery shows the rest */
  let hallCap = 0;

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();
  const place = (im: THREE.InstancedMesh, i: number, o: Piece) => {
    q.setFromEuler(e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0));
    im.setMatrixAt(i, m4.compose(p3.set(o.x, o.y, o.z), q, s3.set(o.s, o.sy ?? o.s, o.sz ?? o.s)));
    if (o.c) im.setColorAt(i, col.set(o.c));
  };
  /** An instanced batch of pieces, lowest first; `by` (if given) says how many of them to draw. */
  function scatter(geo: THREE.BufferGeometry, m: THREE.Material, list: Piece[], by?: (c: ServerColony) => number) {
    if (!list.length) return null;
    list.sort((a, b) => (a.h ?? 0) - (b.h ?? 0));
    const im = new THREE.InstancedMesh(geo, m, list.length);
    list.forEach((o, i) => place(im, i, o));
    im.castShadow = false;
    im.receiveShadow = true;
    group.add(im);
    built.push(im);
    if (by) {
      piles.push({ im, max: list.length, by });
      // measure the bounds with every piece in, or a pile that starts empty is culled for good once it fills
      im.computeBoundingSphere();
      im.count = 0;
    }
    return im;
  }

  function beetle(r: Room, dx: number) {
    const g = new THREE.Group();
    const s = Math.min(1, r.rx / 3.4);
    // on its back: prey carried home
    g.position.set(r.x + dx, floorAt(r, r.x + dx) + 0.45 * s, -D / 2);
    g.rotation.z = Math.PI;
    g.scale.setScalar(s);
    g.add(new THREE.Mesh(SHELL, shellMat));
    for (let i = 0; i < 6; i++) {
      const leg = new THREE.Mesh(LEG, legMat);
      leg.position.set(-0.4 + (i % 3) * 0.4, -0.25, i < 3 ? 0.45 : -0.45);
      leg.rotation.x = i < 3 ? 0.9 : -0.9;
      g.add(leg);
    }
    group.add(g);
    return g;
  }

  function clear() {
    for (const d of built.splice(0)) d.dispose();
    group.clear();
    piles.length = 0;
    pool = null;
    repletes = null;
    larderBeetle = null;
    motes = null;
  }

  function build(rooms: Room[], lv: Partial<Record<ChamberId, number>>) {
    clear();
    hallCap = 0;
    const rnd = seeded(7);
    const R = (a: number, b: number) => a + (b - a) * rnd();
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    const zIn = () => R(-D + 0.45, -0.45);
    const lev = (id: ChamberId) => Math.max(1, lv[id] ?? 1);
    // how many pieces a room gets: more in a bigger hollow, fewer on touch devices
    const n = (r: Room, base: number) => Math.max(1, Math.round(base * (r.rx / 3.4) * Q));
    const fillOf = (res: ResourceId) => (c: ServerColony) => {
      const cap = storageCapacity(c.chambers, c.research)[res];
      return cap > 0 ? Math.max(0, Math.min(1, c.resources[res] / cap)) : 0;
    };
    const raising = (c: ServerColony) => c.unitQueue.reduce((s, i) => s + i.count - i.done, 0);

    for (const r of rooms) {
      const floor = (dx: number) => floorAt(r, r.x + dx);
      const list: Piece[] = [];
      switch (r.id) {
        case 'granary': {
          // leaf bits heaped in a mound that rises toward the middle
          const f = fillOf('foliage');
          for (let i = 0; i < n(r, 130); i++) {
            const dx = R(-r.rx * 0.75, r.rx * 0.75), h = Math.max(0, 1 - (dx / (r.rx * 0.8)) ** 2) * r.ry * 1.05 * Math.sqrt(rnd());
            list.push({ x: r.x + dx, y: floor(dx) + 0.05 + h, z: zIn(), rx: R(-0.6, 0.6), ry: R(0, 6), rz: R(-0.6, 0.6), s: R(1.6, 2.6), sy: 1, c: pick(['#8DCB4A', '#A6D83A', '#6E9F3A', '#B9E06A']), h });
          }
          scatter(LEAF, leafMat, list, (c) => f(c));
          break;
        }
        case 'larder': {
          const f = fillOf('protein');
          for (let i = 0; i < n(r, 34); i++) {
            const dx = R(-r.rx * 0.7, r.rx * 0.7), h = rnd() * r.ry * 0.35 * (1 - Math.abs(dx) / r.rx);
            list.push({ x: r.x + dx, y: floor(dx) + 0.12 + h, z: zIn(), rx: R(0, 3), ry: R(0, 3), s: R(1.4, 2.6), c: pick(['#D06A6A', '#B04848', '#E08A7A', '#C25A4A']), h });
          }
          scatter(CHUNK, chunkMat, list, (c) => f(c));
          larderBeetle = beetle(r, r.rx * 0.45);
          break;
        }
        case 'hunting_grounds': {
          // the day's catch: a beetle and a few pieces, more with level
          beetle(r, -0.6);
          for (let i = 0; i < n(r, Math.min(16, 4 + lev(r.id) * 2)); i++) {
            const dx = R(0.2, r.rx * 0.7);
            list.push({ x: r.x + dx, y: floor(dx) + 0.12, z: zIn(), rx: R(0, 3), ry: R(0, 3), s: R(1.4, 2.2), c: pick(['#D06A6A', '#C25A4A']) });
          }
          scatter(CHUNK, chunkMat, list);
          break;
        }
        case 'nectar_cellar': {
          const f = fillOf('nectar');
          const mesh = new THREE.Mesh(POOL, poolMat);
          mesh.position.set(r.x, floor(0) + 0.05, -D / 2);
          group.add(mesh);
          pool = { mesh, r };
          for (let i = 0; i < n(r, 12); i++) {
            const dx = R(-r.rx * 0.6, r.rx * 0.6);
            list.push({ x: r.x + dx, y: floor(dx) + 0.35, z: zIn(), s: R(1.5, 2.6), h: rnd() });
          }
          scatter(DROP, honeyMat, list, (c) => f(c));
          break;
        }
        case 'honeypot_gallery': {
          // repletes hanging from the ceiling, one more per level, swelling as the nectar store fills
          const count = Math.min(9, 3 + lev(r.id));
          for (let i = 0; i < count; i++) {
            const dx = -r.rx * 0.65 + ((i + 0.5) * r.rx * 1.3) / count;
            const ceil = 2 * r.y - floor(dx);
            list.push({ x: r.x + dx, y: ceil - 0.55, z: -D / 2 + R(-0.35, 0.35), s: R(0.42, 0.52) });
          }
          const im = scatter(REPLETE, repleteMat, list);
          if (im) repletes = { im, list };
          break;
        }
        case 'leaf_garden': {
          // the fungus garden: pale spongy lumps with fresh leaf bits worked in, bigger with level
          const lumps = n(r, Math.min(70, 24 + lev(r.id) * 4));
          for (let i = 0; i < lumps; i++) {
            const dx = R(-r.rx * 0.7, r.rx * 0.7), h = (1 - (dx / (r.rx * 0.75)) ** 2) * r.ry * 0.85 * Math.sqrt(rnd());
            list.push({ x: r.x + dx, y: floor(dx) + 0.2 + h, z: zIn(), s: R(0.22, 0.42), c: pick(['#F3E9CE', '#E8D9B4', '#F7F0DE', '#DCCB9F']) });
          }
          scatter(LUMP, fungusMat, list);
          const leaves: Piece[] = [];
          for (let i = 0; i < n(r, 12); i++) {
            const dx = R(-r.rx * 0.6, r.rx * 0.6);
            leaves.push({ x: r.x + dx, y: floor(dx) + 0.4 + rnd() * 0.8, z: zIn(), ry: R(0, 6), rx: R(-1, 1), s: 1.6, c: pick(['#8DCB4A', '#A6D83A']) });
          }
          scatter(LEAF, leafMat, leaves);
          break;
        }
        case 'brood_hall':
        case 'nursery': {
          // brood being raised (the unit queue, true count up to a cap): eggs at one end, larvae in the middle,
          // cocoons at the other. The Brood Hall takes the first share, the Nursery the larvae that overflow.
          const hall = r.id === 'brood_hall';
          const eggs: Piece[] = [], larvae: Piece[] = [], cocoons: Piece[] = [];
          const nE = n(r, hall ? 18 : 6), nL = n(r, hall ? 10 : 14), nC = n(r, hall ? 12 : 3);
          for (let i = 0; i < nE; i++) {
            const dx = -r.rx * 0.55 + R(-0.6, 0.6);
            eggs.push({ x: r.x + dx, y: floor(dx) + 0.12 + rnd() * 0.2, z: zIn(), s: 0.12, sy: 0.09, c: '#FBF6EA', h: i });
          }
          for (let i = 0; i < nL; i++) {
            const dx = R(-0.9, 0.9) * Math.min(1, r.rx / 3);
            larvae.push({ x: r.x + dx, y: floor(dx) + 0.14, z: zIn(), ry: R(0, 6), rx: Math.PI / 2, s: 1, c: '#F6EEDF', h: i });
          }
          for (let i = 0; i < nC; i++) {
            const dx = r.rx * 0.5 + R(-0.6, 0.6);
            cocoons.push({ x: r.x + dx, y: floor(dx) + 0.2, z: zIn(), rz: R(-0.4, 0.4), s: 0.34, sy: 0.18, sz: 0.18, c: '#E7CFA0', h: i });
          }
          // shares of the brood: 40% eggs, 30% larvae, 30% cocoons; the Nursery shows what the hall can't hold
          if (hall) hallCap = nE + nL + nC;
          const shown = (c: ServerColony) => (hall ? Math.min(raising(c), hallCap) : Math.max(0, raising(c) - hallCap));
          const nl = (c: ServerColony) => Math.round(shown(c) * 0.3), nc = (c: ServerColony) => Math.floor(shown(c) * 0.3);
          scatter(BALL, broodMat, eggs, (c) => (shown(c) - nl(c) - nc(c)) / nE);
          scatter(LARVA, broodMat, larvae, (c) => nl(c) / nL);
          scatter(BALL, broodMat, cocoons, (c) => nc(c) / nC);
          break;
        }
        case 'queen_chamber': {
          // the queen lays all the time: a clutch of eggs by her, more with level
          for (let i = 0; i < n(r, Math.min(30, 12 + lev(r.id) * 2)); i++) {
            const dx = R(1.4, Math.min(3.2, r.rx * 0.8));
            list.push({ x: r.x + dx, y: floor(dx) + 0.1, z: zIn(), s: 0.13, sy: 0.1, c: '#FBF6EA' });
          }
          scatter(BALL, broodMat, list);
          break;
        }
        case 'aphid_pasture': {
          // a root through the hollow, aphids herded along it, more with level
          const curve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(r.x - r.rx * 0.4, r.y + r.ry + 0.5, -D / 2),
            new THREE.Vector3(r.x - r.rx * 0.13, r.y + 0.2, -D / 2 - 0.1),
            new THREE.Vector3(r.x + r.rx * 0.27, r.y - r.ry * 0.27, -D / 2),
            new THREE.Vector3(r.x + r.rx * 0.63, r.y + r.ry * 0.33, -D / 2),
          ]);
          const tube = new THREE.TubeGeometry(curve, 20, 0.16, 6);
          built.push(tube);
          group.add(new THREE.Mesh(tube, rootMat));
          for (let i = 0; i < n(r, Math.min(18, 6 + lev(r.id))); i++) {
            const p = curve.getPoint(R(0.2, 0.92));
            list.push({ x: p.x, y: p.y - 0.16, z: p.z + R(-0.15, 0.15), s: 0.15, sy: 0.11, c: '#B5E04A' });
          }
          scatter(BALL, aphidMat, list);
          break;
        }
        case 'excavation_works': {
          // spoil waiting to be hauled up, a bigger heap with level
          for (let i = 0; i < n(r, Math.min(60, 20 + lev(r.id) * 4)); i++) {
            const dx = R(-r.rx * 0.2, r.rx * 0.75);
            list.push({ x: r.x + dx, y: floor(dx) + 0.08 + rnd() * 0.6 * (1 - Math.abs(dx - r.rx * 0.3) / r.rx), z: zIn(), s: R(0.11, 0.17), c: pick(['#B5653A', '#A9552F', '#C47A48']) });
          }
          scatter(GRIT, spoilMat, list);
          break;
        }
        case 'pheromone_chamber': {
          const count = Math.round(60 * Q), pos = new Float32Array(count * 3);
          const seed = Array.from({ length: count }, () => rnd() * 100);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          built.push(geo);
          const pts = new THREE.Points(geo, moteMat);
          pts.frustumCulled = false;
          group.add(pts);
          motes = { pos, geo, seed, r };
          moveMotes(0);
          break;
        }
      }
    }
  }

  function moveMotes(t: number) {
    if (!motes) return;
    const { pos, seed, r, geo } = motes;
    for (let i = 0; i < seed.length; i++) {
      const s = seed[i], a = t * (0.3 + (s % 1) * 0.4) + s;
      pos[i * 3] = r.x + Math.cos(a) * r.rx * 0.7 * ((s * 7) % 1);
      pos[i * 3 + 1] = r.y + Math.sin(a * 1.3) * r.ry * 0.6 * ((s * 3) % 1);
      pos[i * 3 + 2] = -D / 2 + Math.sin(a * 0.7) * 0.6;
    }
    geo.attributes.position.needsUpdate = true;
  }

  const shownKey: number[] = [];
  let lastNectar = -1;
  function update(c: ServerColony | null, researching: boolean, clock: number) {
    piles.forEach((p, i) => {
      const want = c ? Math.round(Math.max(0, Math.min(1, p.by(c))) * p.max) : 0;
      if (shownKey[i] !== want) {
        shownKey[i] = want;
        p.im.count = want;
      }
    });
    const nectar = c ? Math.max(0, Math.min(1, c.resources.nectar / (storageCapacity(c.chambers, c.research).nectar || 1))) : 0;
    if (pool) {
      // a puddle that spreads and deepens as the cellar fills
      const r = pool.r;
      pool.mesh.visible = nectar > 0.01;
      pool.mesh.scale.set(r.rx * (0.3 + 0.45 * nectar), 0.08 + 0.28 * nectar, 0.5 + 0.4 * nectar);
    }
    if (repletes && Math.abs(nectar - lastNectar) > 0.01) {
      // repletes swell with the colony's nectar
      lastNectar = nectar;
      const sw = 0.55 + 0.6 * nectar;
      repletes.list.forEach((o, i) => place(repletes!.im, i, { ...o, s: o.s * sw, sy: o.s * sw * 1.1 }));
      repletes.im.instanceMatrix.needsUpdate = true;
    }
    // a whole beetle only once the larder is getting full
    if (larderBeetle) larderBeetle.visible = !!c && c.resources.protein / (storageCapacity(c.chambers, c.research).protein || 1) > 0.4;
    // motes fade in while research runs; they only drift when motion is allowed (clock stands still otherwise)
    const target = researching ? 0.95 : 0;
    moteMat.opacity += (target - moteMat.opacity) * 0.15;
    if (Math.abs(moteMat.opacity - target) < 0.02) moteMat.opacity = target;
    if (motes && moteMat.opacity > 0) moveMotes(clock);
  }

  function setNight(kN: number) {
    for (const g of glowing) g.m.emissiveIntensity = g.day + (g.night - g.day) * kN;
  }

  return {
    build,
    update,
    setNight,
    dispose() {
      clear();
      for (const d of keep) d.dispose();
      parent.remove(group);
    },
  };
}
