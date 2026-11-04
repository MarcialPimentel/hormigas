# Aphid herd (poppy + aphids), made with Meshy

_2026-11-04. Source: Meshy, paid plan (commercial use allowed)._

**Replaces:** a green cylinder with 12 green balls stacked up it (Whole Yard) and a thin stem, one leaf and 12 tiny spheres (3D Patch). The code built both and had no model file, so nothing in the code depended on part names.

**Picked:** poppy, concept 3 of 3 (`concepts/c3_image_0.png`): a curved, hairy stem, four cupped red petals around a dark centre and a pale seed head, jagged leaves, and a grass tuft at the base. The other two (a nodding buttercup and a pink clover) weren't kept. One aphid concept (`concepts/a1_image_0.png`): chubby, pear-shaped, with sleepy eyes and a drop of honeydew. Marz chose a flower plus a separate aphid, with the aphid count set by the herd's level (more aphids, bigger herd), and "cute, chubby cattle" for the aphids. Both are plain meshes coloured in Blender, not Meshy textures.

## Steps and credits

| Step | Meshy task | Settings | Credits |
|---|---|---|---|
| Concepts ×4 (buttercup, clover, poppy, aphid) | image-to-image `01a1a810-9311…`, `…-986c…`, `01a1a810-9e6a-7691-a6c8-89966b3b7e7c` (poppy), `01a1a810-a3d2-772b-a1ec-7c9402215a6a` (aphid) | `nano-banana-2`, the grasshopper concept and a render of the hero ant as style references, background removed | 24 |
| Poppy 3D | image-to-3d `01a1a817-4da6-71b0-8836-8fbad69ae7fe` | `smart-topology`, `meshy-t2.5`, `target_polycount` 1500, no texture, glb | 5 |
| Aphid 3D | image-to-3d `01a1a817-5351-7318-b436-e800ec300918` | `smart-topology`, `meshy-t2.5`, `target_polycount` 300, no texture, glb | 5 |
| **Total** | | | **34** (945 left) |

Prompts are in `c1.json`, `c2.json`, `c3.json` and `a1.json`. The 3D settings are in `3d-poppy.json` and `3d-aphid.json`.

## Result

- **Poppy:** 1,559 triangles in 13 parts, one flat colour per part like the concept: grass tuft `#6E9A34`, stem and leaves `#5F8C30`, petals Poppy `#FF6B4F`, a green seed bulb `#9DC449` with brown `#5A341E` around it (the cup's centre and the 7 stamens). The bulb is everything within 0.05 of the stamen ring's centre. Stem and leaves are darker than the grasshopper's greens on purpose, so the lime aphids stand out against them.
- **Aphid:** 476 triangles in 6 parts. Body Aphid `#B5E04A`, belly `#DDEB9A`, legs `#8DB83A`, honeydew `#F2B21F`, and two eye spheres `#2B1D12` added in Blender.
- **Perches:** 14 spots on the stem (a spiral from just under the flower downwards) and on top of the leaves, at least an aphid's length apart. A herd shows 2 + 2 per level (level 1: 4 aphids, level 6: 14), filled top down.
- The game data (`client/src/components/three/aphid-herd.json`) is about 50 KB. Drawn by `client/src/components/three/aphidHerd.ts` with the same toon look as the ants and the grasshopper (`three/toonModel.ts`). The poppy is lit evenly in the game (normals all pointing up, no gloss or rim light, dimmed to `POPPY_TONE`, and no shadow on itself), so each part is one solid colour; the ink outline still follows the real shape. The aphids swell gently while they feed (turned off with reduced motion). The poppy is 22 units tall in the Whole Yard and 5.5 in the Patch.

## Editing it

`aphid-herd.blend` keeps each part as its own object, in the `poppy` and `aphid` collections. A part's material colour is its colour in the game. Parts named `petal…` or `leaf…` are drawn two-sided. After any touch-up:

```
blender -b aphid-herd.blend --python aphid-herd.blend.py -- export ../../../client/src/components/three/aphid-herd.json preview.png
```

The export also picks the perches again, so moving the leaves moves the aphids with them.

To rebuild from the Meshy downloads: `blender -b --factory-startup --python aphid-herd.blend.py -- build meshy/poppy.glb meshy/aphid.glb aphid-herd.blend`. Region rules (what counts as petal, stem, leaf, belly and so on) are at the top of the script.
