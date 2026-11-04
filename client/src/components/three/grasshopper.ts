// The dead grasshopper windfall (docs/25-windfalls.md): on its back, legs in the air, X eyes. Made with Meshy and
// coloured in Blender (art/meshy/grasshopper/), stored as parts in grasshopper.json. Drawn like the ants: three
// flat toon bands, a gloss spot, the warm rim and a dark ink outline; the see-through wings get no outline.
import * as THREE from 'three';
import data from './grasshopper.json';
import { toonBands } from '../nest3d/ants3d';
import { inkPropMaterial, mergeParts, toonPropMaterial, type PropPart } from './toonProp';

type Part = PropPart & { wing: boolean };

/**
 * One set of geometry and materials per scene; `make()` hands out a model 1 unit nose to tail, lying on y = 0 with
 * its head towards +z. `wrap` lets a scene add its own shader bits (the Whole Yard's fog of war) to every material.
 */
export function createGrasshoppers(wrap: <M extends THREE.Material>(m: M) => M = (m) => m) {
  const parts = data.parts as Part[];
  const body = mergeParts(parts.filter((p) => !p.wing));
  const wings = mergeParts(parts.filter((p) => p.wing));
  const bands = toonBands();
  const bodyMat = wrap(toonPropMaterial(bands, THREE.FrontSide, 'grasshopper'));
  const wingMat = wrap(toonPropMaterial(bands, THREE.DoubleSide, 'grasshopper-wing'));
  const ink = wrap(inkPropMaterial('grasshopper'));
  return {
    make(shadows = true) {
      const g = new THREE.Group();
      const b = new THREE.Mesh(body, bodyMat), w = new THREE.Mesh(wings, wingMat), o = new THREE.Mesh(body, ink);
      b.castShadow = w.castShadow = shadows;
      b.receiveShadow = w.receiveShadow = shadows;
      g.add(b, w, o);
      return g;
    },
    dispose() {
      for (const d of [body, wings, bands, bodyMat, wingMat, ink]) d.dispose();
    },
  };
}
