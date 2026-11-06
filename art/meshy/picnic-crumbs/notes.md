# Picnic crumbs (windfall), made with Meshy

_2026-11-06. Source: Meshy, paid plan (commercial use allowed)._

**Replaces:** a brown box with a pale top, a red disc of tomato and cube crumbs (Patch), and a box and a disc (Whole Yard), all built in code.

**Picked:** Marz's own drawing (`concepts/marz-sandwich.webp`): the corner of a sliced-bread sandwich, two straight crusted edges at a right angle, a giant's bite out of the long side, lettuce, tomato, ham and cheese, crumbs on the ground. Before that, seven Meshy concepts (task IDs and what each tried in `concepts/tasks.md`; images not kept): Marz liked concept 3 (a bold-layered wedge) but wanted a true 90° sandwich corner, which the concepts never quite got, so he drew the reference himself. Choices: classic filling stack, bite taken, ant cartoon shading (plain mesh, coloured in Blender).

| Step | Meshy task | Settings | Credits |
|---|---|---|---|
| Concepts ×7 | image-to-image (see `concepts/tasks.md`) | `nano-banana-2`, the grasshopper and termite-mound concepts as style references, background removed | 42 |
| 3D model | image-to-3d `01a1b172-a367-74b2-9e96-46e1cd639074` | `smart-topology`, `meshy-t2.5`, `target_polycount` 1500, no texture, glb, from Marz's drawing | 5 |
| **Total** | | | **47** (857 left) |

**Result:** Meshy gave 8 loose pieces (1,555 triangles): bottom slice, one sheet of ham and cheese, lettuce, four tomato slices, top slice. It dropped the crumbs, so `build` adds five small crumbs past the bite. 1,655 triangles in 16 coloured parts; game data `client/src/components/three/picnic-crumbs.json` (40 KB), drawn by `toonModel.ts` (`createPicnics`): scale 13 in the Whole Yard, 5 in the Patch (the Patch also strews 8 code crumbs further out, in the same bread colours).

Colours: soft bread `#F3D9A2`, crust `#D08A3E` (side faces on the two straight edges), lettuce `#8DB83A`, tomato `#D9483A`, ham `#EC9C98`, cheese `#F2C14E` (the lower third and underside of the ham sheet).

**Editing it:** open `picnic-crumbs.blend`, repaint faces between the `pc_*` materials, move crumbs or change colours, then:

```
blender -b picnic-crumbs.blend --python picnic-crumbs.blend.py -- export ../../../client/src/components/three/picnic-crumbs.json preview.png
```

To rebuild from the Meshy download (this undoes hand touch-ups): `blender -b --factory-startup --python picnic-crumbs.blend.py -- build meshy/picnic_crumbs.glb picnic-crumbs.blend`.
