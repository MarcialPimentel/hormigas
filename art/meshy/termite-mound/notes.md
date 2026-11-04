# Termite mound (wild site), made with Meshy

_2026-11-04. Source: Meshy, paid plan (commercial use allowed)._

**Replaces:** a brown cone (Whole Yard) and a lumpy cone with a side spire (Patch), both built in code.

**Picked:** concept 2 of 3 (`concepts/concept2_image_0.png`): one tall spire with buttress ridges, a smaller side spire, arched entrances on a wide base. Marz chose "cartoon like the ants" (over the flat low-poly look of the other mounds) and "cathedral spires".

| Step | Meshy task | Settings | Credits |
|---|---|---|---|
| Concepts ×3 | image-to-image `01a1a805-81a9…`, `…-8690…`, `…-8b58…` | `nano-banana-2`, the 2D worker ant and the grasshopper concept as style references, background removed | 18 |
| 3D model | image-to-3d `01a1a809-b868-76fb-96d1-5313a0f19e9e` | `smart-topology`, `meshy-t2.5`, `target_polycount` 1500, no texture, glb | 5 |
| **Total** | | | **23** |

The concept prompts are in `c1.json`, `c2.json` and `c3.json` (concept 2 is the one used).

**Result:** 1,542 triangles in 2 parts (spires, base). Faces under the arches use the dark `hole` material. Game data: `client/src/components/three/termite-mound.json`, drawn by `toonModel.ts` (scale 17 in the Whole Yard so it stays inside its hex, 6 in the Patch).

**Fix, 4 Nov:** Meshy left a see-through slit in the main spire's front; `fill` closes it (and `build` now does too). See `slit-before.png` / `slit-after.png`.

**Editing it:** open `termite-mound.blend`, repaint faces between the `tm_spires` / `tm_base` / `tm_hole` materials or change their colours, then:

```
blender -b termite-mound.blend --python termite-mound.blend.py -- export ../../../client/src/components/three/termite-mound.json preview.png
```
