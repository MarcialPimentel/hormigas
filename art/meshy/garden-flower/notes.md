# Garden flower (daisy), made with Meshy

_2026-11-06. Source: Meshy, paid plan (commercial use allowed)._

**Replaces:** the Whole Yard's `flower_stem` + `flower_petals` (54 triangles, `yard3d/props.json`, built by `docs/art/whole-yard/props.blend.py`, 350 copies in the Old Garden, petals tinted per flower) and the 3D Patch's sphere flowers (`patch3d/scene.ts`).

**Marz's calls (6 Nov):** one daisy tinted in the 5 petal colours; in both the Whole Yard and the 3D Patch; shaded like the ants (toon bands, gloss, ink outline). **Picked:** concept 1 (`concepts/c1.png`): a tall daisy with two long leaves, closest to the old flower's height. Not kept: 2 (nodding head) and 3 (short toy daisy with a leaf rosette).

## Steps and credits

| Step | Meshy task | Settings | Credits |
|---|---|---|---|
| Concept 1 (tall daisy, two long leaves) | image-to-image `01a1b16e-c8f4-7485-a4dd-3896e9c610b4` | `nano-banana-2`, refs: old flower render, poppy concept, grasshopper concept; background removed | 6 |
| Concept 2 (nodding daisy) | image-to-image `01a1b16e-ce61-76de-ba35-83664c43bfb4` | same | 6 |
| Concept 3 (toy daisy, leaf rosette) | image-to-image `01a1b16e-d214-74bf-9453-c06f82e317de` | same | 6 |
| Daisy 3D | image-to-3d `01a1b175-3a19-71ed-bd63-47109c3495cb` | from concept 1's task, `smart-topology`, `meshy-t2.5`, `target_polycount` 400, no texture, glb | 5 |
| **Total** | | | **23** (875 left) |

Concept prompts: the style words of the poppy (`../aphid-herd/c3.json`) plus "a single garden daisy, same tall proportions as the grey reference flower ... nine to eleven rounded chunky petals, pure white, around a domed golden yellow eye", with the old flower's render, the poppy concept and the grasshopper concept as references.

## Result

- **373 triangles** in 3 parts (was 54): stem and leaves `#6E9A34` (150), petals white (182, tinted per flower in the game), eye `#F2B21F` (41). 1 unit tall in the game data, standing on the stem's foot; 22 units tall in the Whole Yard (the old flower was 27), 2.5 to 10 in the 3D Patch.
- **Blender:** the Meshy model faces forward like the drawing; the build tips the head 30° back towards the sky round the top of the stem so it reads from the game's high camera, and splits the eye off the petals (faces within 0.085 of the head's middle, on its front).
- **In the game:** `client/src/components/three/gardenFlower.ts`, drawn as instances (350 in the Old Garden) with the ants' toon look. The petals are open sheets in places, so they're drawn from both sides, lit per face and without the ink outline (it showed through from behind, making petals look black); stem, leaves and eye keep the outline.
- **Before / after:** `before-yard.webp` (Marz's screenshot), `after-yard.jpg`, `after-patch.jpg` (the test scene).

## Editing it

`garden-flower.blend` keeps each part as its own object in the `flower` collection; a part's material colour is its colour in the game, and parts named `petals…` are tinted per flower. After any touch-up:

```
blender -b garden-flower.blend --python garden-flower.blend.py -- export ../../../client/src/components/three/garden-flower.json preview.png
```

To rebuild from the Meshy download (this redoes the head tilt and the eye split): `blender -b --factory-startup --python garden-flower.blend.py -- build meshy/daisy.glb garden-flower.blend`.

Worth touching up: the two leaves sit in one flat plane (from straight above they're a line), and the back of the head is ridged slabs.
