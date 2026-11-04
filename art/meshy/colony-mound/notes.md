# Colony mound (every player's and wild nest's mound), made with Meshy

_2026-11-04. Source: Meshy, paid plan (commercial use allowed)._

**Replaces:** the flat low-poly mound from `docs/art/whole-yard/mounds.blend.py` (Whole Yard, three stages) and the code-built lathe dome in the 3D Patch.

**Picked:** concept 1 of 3 (`concepts/concept1_image_0.png`): a low dome of rounded soil clods round a crater with the entrance in the middle, a few twigs, pale pebbles at the foot. Marz chose "one model, three sizes", "same dome, cartoon" and "darker, richer earth" (cocoa, to stand apart from the orange termite mound).

| Step | Meshy task | Settings | Credits |
|---|---|---|---|
| Concepts ×3 | image-to-image `01a1a825-3335…`, `…-395b…`, `…-3f32…` | `nano-banana-2`, the old mounds render, the termite concept and the hero-ant concept as references, background removed | 18 |
| 3D model | image-to-3d `01a1a82c-6dbb-7190-a09f-52bb54e27d25` | `smart-topology`, `meshy-t2.5`, `target_polycount` 1500, no texture, glb | 5 |
| **Total** | | | **23** |

Concept prompts: `c1.json` (used), `c2.json`, `c3.json`.

**Result:** the soil (1,452 triangles) and three loose pebbles. Soil faces are painted by height in Blender: foot `#3E2718`, soil `#573922`, top `#6E4A2E`, the entrance `#140B06`; pebbles `#D8CBB4`. The first palette (`#4E3220` / `#6E4A2E` / `#8A6040`) read orange-tan under the yard's sun, so it went a step darker.

**Three stages from one model:** the export writes one copy per stage (1,560 / 1,742 / 1,922 triangles); the medium and big stages get 5 and 10 extra pebbles round the foot, shrunk so a pebble stays pebble-sized when the game stretches the mound (Whole Yard radius × height: 4 × 2.2, 6.5 × 3.8, 9 × 5.6; the Patch uses the small stage at 2.1 × 0.85). Game data: `client/src/components/three/colony-mound.json`, drawn by `toonModel.ts`.

**Walking on it:** both scenes read the mound's surface from `colonyMoundHeights()` in `toonModel.ts`: a top-down height map of the mesh, with the bulging foot eased into a steep ramp so ants don't step off a ledge.

**Editing it:** open `colony-mound.blend`, repaint soil faces between the `cm_foot` / `cm_soil` / `cm_top` / `cm_hole` materials or change their colours, then:

```
blender -b colony-mound.blend --python colony-mound.blend.py -- export ../../../client/src/components/three/colony-mound.json preview.png
```
(`build` re-creates the .blend from `meshy/colony_mound.glb` and repaints it by height.)
