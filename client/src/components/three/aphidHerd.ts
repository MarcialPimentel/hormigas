// The aphid herd (docs/24-npcs.md): a poppy with chubby aphids feeding on its stem and leaves. Both made with Meshy
// and coloured in Blender (art/meshy/aphid-herd/), stored as parts in aphid-herd.json, drawn like the ants.
// The more aphids on the poppy, the bigger the herd: 2 + 2 per level, so a level 6 herd is crowded (14).
// The aphids swell and shrink gently while they feed; each one keeps its own beat.
import * as THREE from 'three';
import data from './aphid-herd.json';
import { toonBands } from '../nest3d/ants3d';
import { inkPropMaterial, mergeParts, toonPropMaterial, type PropPart, type VertexBend } from './toonModel';

type Part = PropPart & { two: boolean };
type Perch = { p: number[]; n: number[] };

/** an aphid's length next to a poppy 1 unit tall */
const APHID = 0.07;

/** how many aphids a herd of this level shows */
export const aphidsShown = (level: number) => Math.min(data.poppy.perches.length, 2 + 2 * Math.max(1, Math.round(level)));

/**
 * One set of geometry and materials per scene; `make(level)` hands out a poppy 1 unit tall standing on y = 0, with
 * that level's aphids on it. `tick(seconds)` moves the aphids; skip it for reduced motion. `wrap` lets a scene add
 * its own shader bits (the Whole Yard's fog of war) to every material.
 */
export function createAphidHerds(wrap: <M extends THREE.Material>(m: M) => M = (m) => m) {
  const poppyParts = data.poppy.parts as Part[];
  const solid = mergeParts(poppyParts.filter((p) => !p.two));
  const thin = mergeParts(poppyParts.filter((p) => p.two));
  const aphid = mergeParts(data.aphid.parts as Part[]);
  const bands = toonBands();
  // feeding: each aphid swells up and back, timed from where it sits so neighbours don't pulse together
  const feed: VertexBend = {
    uniforms: { uAphidT: { value: 0 } },
    key: 'aphid-feed',
    glsl: `float aPh = dot(modelMatrix[3].xyz, vec3(3.1, 5.7, 4.3));
      float aS = sin(uAphidT * 2.4 + aPh);
      transformed.y *= 1.0 + 0.08 * aS;
      transformed.x *= 1.0 + 0.04 * aS;
      transformed.z *= 1.0 - 0.03 * aS;`,
  };
  const poppyMat = wrap(toonPropMaterial(bands, THREE.FrontSide, 'poppy'));
  const thinMat = wrap(toonPropMaterial(bands, THREE.DoubleSide, 'poppy-thin'));
  const poppyInk = wrap(inkPropMaterial('poppy', 0.006));
  const aphidMat = wrap(toonPropMaterial(bands, THREE.FrontSide, 'aphid', feed));
  // the aphid is drawn at 1 unit long and scaled down, so its outline is wider in its own units
  const aphidInk = wrap(inkPropMaterial('aphid', 0.035, feed));

  const up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3(), f = new THREE.Vector3(), s = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  function placeAphid(perch: Perch, shadows: boolean) {
    const a = new THREE.Group();
    const body = new THREE.Mesh(aphid, aphidMat), ink = new THREE.Mesh(aphid, aphidInk);
    body.castShadow = shadows;
    a.add(body, ink);
    // belly on the surface, head climbing towards the flower (or, on a flat leaf, towards the stem)
    n.fromArray(perch.n).normalize();
    f.copy(up).addScaledVector(n, -up.dot(n));
    if (f.lengthSq() < 0.04) f.set(-perch.p[0], 0, -perch.p[2]).addScaledVector(n, -n.dot(f));
    f.normalize();
    s.crossVectors(n, f);
    basis.makeBasis(s, n, f);
    a.quaternion.setFromRotationMatrix(basis);
    a.scale.setScalar(APHID);
    a.position.fromArray(perch.p).addScaledVector(n, -APHID * 0.08);
    return a;
  }

  return {
    make(level: number, shadows = true) {
      const g = new THREE.Group();
      const p = new THREE.Mesh(solid, poppyMat), t = new THREE.Mesh(thin, thinMat);
      p.castShadow = t.castShadow = shadows;
      p.receiveShadow = t.receiveShadow = shadows;
      g.add(p, t, new THREE.Mesh(solid, poppyInk), new THREE.Mesh(thin, poppyInk));
      const perches = data.poppy.perches as Perch[];
      for (let i = 0; i < aphidsShown(level); i++) g.add(placeAphid(perches[i], shadows));
      return g;
    },
    tick(seconds: number) {
      feed.uniforms.uAphidT.value = seconds;
    },
    dispose() {
      for (const d of [solid, thin, aphid, bands, poppyMat, thinMat, poppyInk, aphidMat, aphidInk]) d.dispose();
    },
  };
}
