# Dead lizard (windfall), made with Meshy

_2026-11-07. Source: Meshy, paid plan (commercial use allowed)._

**Replaces:** a green capsule (Whole Yard, "the pickle") and an olive capsule with four sticks and a cone tail (Patch), both built in code, with no model file, so nothing in the code depended on part names.

**Picked:** concept 1 of 3 (`concepts/concept1_image_0.png`; all three in `concepts/concepts-side-by-side.png`): a long sandy lizard on its back, cream belly up, stubby legs in the air, tail curled, X eye, tongue out. Marz chose "on its back, legs up" and "sandy brown-orange" (so it stands apart from the green grasshopper and the grass). Concept 2 was a chubby gecko, concept 3 a slender lizard with long thin legs.

Background removal ate holes in the pale belly; `concepts/concept1_filled.png` has them filled with cream (what Meshy got).

## Steps and credits

| Step | Meshy task | Settings | Credits |
|---|---|---|---|
| Concepts ×3 | image-to-image `01a1b97a-acfe-72e1-8eb0-40279657e680` (picked), `…-b214-…`, `…-b772-…` | `nano-banana-2`, the grasshopper and termite-mound concepts as style references, background removed (`c1.json`–`c3.json`) | 18 |
| 3D model | image-to-3d `01a1b982-9539-722a-8e9d-11e3460ef374` | `smart-topology`, `meshy-t2.5`, `target_polycount` 1500, no texture, glb (`3d.json`) | 5 |
| **Total** | | | **23** (788 left) |

## Result

Meshy gave one solid piece, 1,578 triangles. `build` colours its faces automatically and adds the eyes and tongue: 1,726 triangles in 7 parts (back, belly, stripes, claws, 2 X eyes, tongue). Game data `client/src/components/three/dead-lizard.json` (45 KB), drawn by `toonModel.ts` (`createLizards`): scale 18 in the Whole Yard, 9 in the Patch.

How `build` colours it (head at -y, belly up): thin parts (a ray inward leaves the mesh within 0.055: legs, toes, tail tip) are back colour, their highest tips claws; faces looking up are belly; side faces low on the body in bands along its length are stripes; the rest is back.

Colours: back `#C98A4B`, belly `#F1DDB0`, stripes `#9A5E2E`, claws `#5A3A22`, eyes `#2A1A10`, tongue `#E48A8A`.

## Editing it

Open `dead-lizard.blend`: the body is the `lizard` object (repaint faces between the `dl_*` materials), plus `eye_left`, `eye_right` and `tongue`, all in the `dead_lizard` collection. Then:

```
blender -b dead-lizard.blend --python dead-lizard.blend.py -- export ../../../client/src/components/three/dead-lizard.json preview.png
```

To rebuild from the Meshy download (this undoes hand touch-ups): `blender -b --factory-startup --python dead-lizard.blend.py -- build meshy/dead_lizard.glb dead-lizard.blend`.
