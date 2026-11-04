// The test scene's lineup: every 3D ant the game draws, side by side, walking on the spot. The top row is the
// close-up mesh (chambers), the bottom row the light crowd mesh (columns on the maps). Uses ants3d, the same code
// every 3D view draws ants with.
import * as THREE from 'three';
import { CHITIN, createAnts, type CargoKind } from '../components/nest3d/ants3d';
import type { Caste } from '../art/ants';

export interface LineupAnt { caste: Caste; label: string; color?: string; cargo?: { kind: CargoKind; color: string } }
export const LINEUP: LineupAnt[] = [
  { caste: 'worker', label: 'Worker' },
  { caste: 'soldier', label: 'Soldier' },
  { caste: 'queen', label: 'Queen' },
  { caste: 'alate', label: 'Winged queen' },
  { caste: 'soldier', label: 'Raider', color: CHITIN.raider },
  { caste: 'army', label: 'Army ant' },
  { caste: 'army_major', label: 'Army major' },
  { caste: 'worker', label: 'Leaf load', cargo: { kind: 'leaf', color: '#7FC24A' } },
  { caste: 'worker', label: 'Chunk load', cargo: { kind: 'chunk', color: '#C98B5A' } },
  { caste: 'worker', label: 'Drop load', cargo: { kind: 'drop', color: '#F2B21F' } },
];
const GAP = 1.25;

export interface Lineup {
  set(o: { walk?: boolean; spin?: boolean; speed?: number }): void;
  dispose(): void;
}

export function createLineup(host: HTMLElement, labels: HTMLElement): Lineup {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  host.prepend(renderer.domElement);
  renderer.domElement.className = 'ts-lineup-canvas';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#E8DCC4');
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight('#FFF6E0', '#6B5440', 1.6));
  const sun = new THREE.DirectionalLight('#FFF2D6', 2.2);
  sun.position.set(3, 6, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 4, bottom: -4 });
  scene.add(sun);
  const width = (LINEUP.length - 1) * GAP;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(width + 6, 6), new THREE.MeshStandardMaterial({ color: '#CDB58E', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const caps = { worker: 12, soldier: 6, queen: 2, alate: 2, army: 2, army_major: 2 };
  const close = createAnts(scene, caps, true, 2);
  const crowd = createAnts(scene, caps, true, 1);

  const tags = LINEUP.map((a) => {
    const el = document.createElement('div');
    el.className = 'ts-lineup-tag';
    el.textContent = a.label;
    labels.append(el);
    return el;
  });

  let walk = true, spin = false, speed = 1;
  const v = new THREE.Vector3();
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // fit the whole row across the strip
    const fit = ((width / 2 + 1.2) / Math.tan((camera.fov * Math.PI) / 360) / camera.aspect) * 1.15;
    camera.position.set(0, fit * 0.55, fit * 0.85);
    camera.lookAt(0, 0.1, 0.2);
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  let raf = 0, last = performance.now(), t = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt * speed;
    for (const [ants, z] of [[close, -0.45], [crowd, 0.75]] as const) {
      ants.begin();
      LINEUP.forEach((a, i) => {
        const x = -width / 2 + i * GAP;
        ants.ant(a.caste, x, 0, z, {
          yaw: spin ? t * 0.8 : -0.5,
          // legs tied to a walk of 0.5 lengths a second, like a column on the move
          gait: walk ? (t * 0.5) / 0.17 * Math.PI * 2 : 0,
          color: a.color,
          cargo: a.cargo ?? null,
        });
      });
      ants.end();
    }
    renderer.render(scene, camera);
    const w = host.clientWidth, h = host.clientHeight;
    LINEUP.forEach((_, i) => {
      v.set(-width / 2 + i * GAP, 0, 1.35).project(camera);
      tags[i].style.transform = `translate(-50%, 0) translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    });
  };
  raf = requestAnimationFrame(frame);

  return {
    set(o) {
      if (o.walk !== undefined) walk = o.walk;
      if (o.spin !== undefined) spin = o.spin;
      if (o.speed !== undefined) speed = o.speed;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      close.dispose();
      crowd.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      tags.forEach((t) => t.remove());
    },
  };
}
