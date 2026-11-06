// The garden daisy (docs/18-art-direction.md): a tall daisy with two long leaves and its head turned to the sky. Made
// with Meshy and coloured in Blender (art/meshy/garden-flower/), stored as parts in garden-flower.json, drawn like the
// ants: toon bands, gloss spot, warm rim and the dark ink outline. The petals are white in the model; each flower
// tints them with its own colour. Drawn as instances, since a bed holds hundreds.
import * as THREE from 'three';
import data from './garden-flower.json';
import { toonBands } from '../nest3d/ants3d';
import { inkPropMaterial, mergeParts, toonPropMaterial, type PropPart } from './toonModel';

type Part = PropPart & { tint: boolean };
type Wrap = <M extends THREE.Material>(m: M) => M;

/** petal colours: pink, buttercup, white, lilac, orange */
export const FLOWER_COLOURS = ['#F2A0C4', '#FFD84D', '#F7F4EA', '#B98CFF', '#FF8A5C'];

/**
 * One set of geometry and materials per scene. `many(n)` hands out n daisies 1 unit tall, standing on y = 0 at the
 * foot of the stem; place each with `set(i, matrix, petalColour)`. `wrap` lets a scene add its own shader bits
 * (the Whole Yard's fog of war) to every material.
 */
export function createGardenFlowers(wrap: Wrap = (m) => m) {
  const parts = data.parts as Part[];
  const plant = mergeParts(parts.filter((p) => !p.tint));
  // every petal triangle gets its own corners, so each is lit on its own (see petalMat)
  const smooth = mergeParts(parts.filter((p) => p.tint)), petals = smooth.toNonIndexed();
  smooth.dispose();
  petals.computeVertexNormals();
  const bands = toonBands();
  const mat = wrap(toonPropMaterial(bands, THREE.FrontSide, 'daisy'));
  // the petals are open sheets in places, like real petals: drawn from both sides, each face lit on its own, and
  // without the ink outline (it would show through from behind), like the grasshopper's wings
  const petalMat = wrap(toonPropMaterial(bands, THREE.DoubleSide, 'daisy-petals'));
  const ink = wrap(inkPropMaterial('daisy', 0.006));
  const col = new THREE.Color();
  return {
    many(n: number, shadows = true) {
      const a = new THREE.InstancedMesh(plant, mat, n), b = new THREE.InstancedMesh(petals, petalMat, n), o = new THREE.InstancedMesh(plant, ink, n);
      a.castShadow = b.castShadow = shadows;
      const group = new THREE.Group();
      group.add(a, b, o);
      return {
        group,
        /** the instanced meshes, e.g. to hide far out */
        meshes: [a, b, o],
        set(i: number, m: THREE.Matrix4, petal: string) {
          a.setMatrixAt(i, m); b.setMatrixAt(i, m); o.setMatrixAt(i, m);
          b.setColorAt(i, col.set(petal));
        },
        done() {
          for (const x of [a, b, o]) { x.instanceMatrix.needsUpdate = true; x.computeBoundingSphere(); }
          if (b.instanceColor) b.instanceColor.needsUpdate = true;
        },
      };
    },
    dispose() {
      for (const d of [plant, petals, bands, mat, petalMat, ink]) d.dispose();
    },
  };
}
