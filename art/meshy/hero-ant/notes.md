# Hero ant (master 3D ant)

The 3D nest's ant is built in code (`client/src/components/nest3d/ants3d.ts`): 720 triangles in crowds, 2,664 up close
(detail 2), one body plan stretched per caste, legs walked in the vertex shader from per-vertex `aLeg` (tripod group,
distance from hip), eyes marked by `aTone`. Meshy is a poor fit for the model itself (one fused mesh, no castes by
numbers), so: Meshy concept art, then Claude builds the ant in Blender. Marz chose this 2026-11-04.

## Reference
- `ref/old_ant.obj`: the code worker ant at detail 2, exported (ant forward = -Y in Blender, feet on the ground).
- `ref/ref_*.png`, `ref/contract.json`: renders and measurements (0.88 long, 0.32 tall).
- `ref/worker-2d.png`: the 2D worker portrait (`art/ants/worker-portrait.svg`), for the toon look.

## Concepts (2026-11-04)
Meshy image-to-image, nano-banana-2, refs `ref_34.png` + `worker-2d.png`, remove_background, 6 credits each (18 in all).
- c1 `01a1a7b9-932d-75c6-a266-3ba99f9d7c84`: same silhouette, upgraded (tapered legs, knees, foot claws, gaster bands).
- c2 `01a1a7b9-98a0-7794-a550-1ee2509cd4d6`: chunkier toy figure, big eyes, stubby segmented legs.
- c3 `01a1a7b9-9d7c-767d-9a6f-59caa0d02fad`: leaner and truer, three-segment legs, clear waist node, banded gaster.
Shared prompt tail: 3D cartoon worker ant, cel-shaded three bands, gloss spot, thin ink outline, red-brown #B8612F,
darker far legs, small dark eyes, gaster / one waist node / mesosoma / head / mandibles / elbowed antennae / six legs,
3/4 front-left view, plain white background, no text, no shadow.

## Picked: concept 1 (Marz, 2026-11-04)
Built by Claude in Blender, not Meshy image-to-3D (one fused mesh, no leg walk, no castes by numbers).
- `build_ant.py` → `hero-ant.blend` (collections `ant_close`, `ant_crowd`; caste extras `petiole_a/b`, `sickle_L/R` hidden).
- `export_ant.py` → `client/src/components/nest3d/ant.json` (102 KB, 31 KB gzipped in the ants3d chunk).
- `render_ant.py` → `renders/ant_34.png`. `renders/game_*.png`: old vs new in three.js with the game's toon material.
- Worker triangles: close 3,014 (old 2,664), crowd 720 (old 720). Size, pivot and facing match the old ant.
- Code changes: `ants3d.ts` builds castes from the parts (head about the neck, jaw length, gaster growth, slim, leg spread);
  tone > 1 pales toward cream (bands); ink thins down the legs.
- Credits: 18 (three concepts). Source: Meshy, paid plan (concepts only).
