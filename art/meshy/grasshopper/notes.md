# Dead grasshopper (windfall), made with Meshy

_2026-11-04. Source: Meshy, paid plan (commercial use allowed)._

**Replaces:** a green capsule (Whole Yard) and a capsule with six sticks (Patch). Code built both, with no model file, so nothing in the code depended on part names.

**Picked:** concept 1 of 3 (`concepts/concept1_image_0.png`): on its back, legs stiff in the air, big jumping legs up, wings spread underneath, X eyes. Marz chose "comic, legs up" and "ant cartoon shading" (a plain mesh coloured in Blender, not a Meshy texture).

## Steps and credits

| Step | Meshy task | Settings | Credits |
|---|---|---|---|
| Concepts ×3 | image-to-image `01a1a7b9-04b8…`, `…-0844…`, `…-0b6a…` | `nano-banana-2`, the 2D worker ant (`art/ants/worker-portrait.svg`) as the style reference, background removed | 18 |
| 3D model | image-to-3d `01a1a7c0-4d4a-77e8-a7ee-8020699c3ee7` | `smart-topology`, `meshy-t2.5`, `target_polycount` 1200, no texture, glb | 5 |
| **Total** | | | **23** (1,020 left) |

Concept prompt (concept 1; `c1.json`): "Chunky cartoon 3D game prop of a dead grasshopper, in the same style as the reference ant: smooth rounded simple shapes, flat colour with two or three soft shading bands, a thick dark brown ink outline, one small glossy highlight on the body, simple dark eye. Colours: leaf green #8DB83A body with olive #6E8A2E shade, pale yellow-green belly, dark brown leg joints. Lying flat on its back, all six legs stiff and straight up in the air, the two big jumping hind legs folded and pointing up, wings splayed flat underneath, little X marks for eyes, antennae drooping. Funny, not gory. Single object, centred, three-quarter view from above, plain white background, even lighting, no text, no ground shadow."

## Result

1,179 triangles in 22 parts: head, thorax, belly and 3 bands, 2 jumping legs, 6 thin legs, 2 antennae, 4 wing pieces, 2 X eyes. The game data (`client/src/components/three/grasshopper.json`) is 25 KB.

## Editing it

`grasshopper.blend` has each part as its own object in the `grasshopper` collection. A part's material colour is its colour in the game, and parts named `wing…` are two-sided with no outline. After any touch-up:

```
blender -b grasshopper.blend --python grasshopper.blend.py -- export ../../../client/src/components/three/grasshopper.json preview.png
```

To rebuild it from the Meshy download: `blender -b --factory-startup --python grasshopper.blend.py -- build meshy/grasshopper.glb grasshopper.blend`.
