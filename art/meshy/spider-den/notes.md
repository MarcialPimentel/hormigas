# Spider den (wild site, boss), made with Meshy

_2026-11-06. Source: Meshy, paid plan (commercial use allowed)._

**Replaces:** a dark half-dome with a silk disc (Whole Yard) and a dark hole with a tilted lid and silk threads (Patch), both built in code.

**Picked:** concept 4 (`concepts/concept4.png`): a trapdoor spider waiting in its silk-lined burrow, only its eyes, fangs and four front legs out, the mossy lid propped open on a twig, two shut trapdoors beside it. Marz chose "spider bursting out", "menacing toon" and plain mesh with our own colours, then concept 3 with the spider sunk deeper so only two pairs of legs show. Two edits of concept 3 couldn't move the spider (`c1`–`c3.json` are the first three concepts' prompts), so concept 4 was drawn fresh (`c4.json`).

| Step | Meshy task | Settings | Credits |
|---|---|---|---|
| Concepts 1–3 | image-to-image `01a1b162-6d82…`, `…-70ae…`, `…-733f…` | `nano-banana-2`, the grasshopper and termite concepts as style references, background removed | 18 |
| Two edits of concept 3 | `01a1b164-444f…`, `01a1b164-ebee…` | `nano-banana-2`, concept 3 as reference (not used) | 12 |
| Concept 4 | `01a1b16d-a155-76a3-8351-030d025e340e` | `nano-banana-2`, grasshopper and termite concepts as references | 6 |
| 3D model | image-to-3d `01a1b16e-c83e-7516-a61a-ee4dcf947bb3` | `smart-topology`, `meshy-t2.5`, `target_polycount` 2500, no texture, glb (`3d.json`) | 5 |
| **Total** | | | **41** |

**Result:** 2,521 triangles in 21 loose pieces (ground, lid, twig, 2 trapdoors and their collars, 4 legs, 2 fangs, 8 eyes), exported as 11 colour parts. Colours: soil `#B0814F`, collars `#9A7248`, burrow `#1E130C`, silk `#F2EEE6`, lids `#7A5C40`, moss `#7A7A2E`, twig `#6E5236`, chitin `#2B201C`, leg bands `#9A8270`, fangs `#120A07`, eyes `#C43A3A`. Game data: `client/src/components/three/spider-den.json` (1 unit across), drawn by `toonModel.ts` (scale 17 in the Whole Yard, 6 in the Patch, turned so the spider faces the camera).

**Editing it:** open `spider-den.blend`, repaint faces between the `sd_*` materials (Edit Mode, face select, assign) or change their colours, then:

```
blender -b spider-den.blend --python spider-den.blend.py -- export ../../../client/src/components/three/spider-den.json preview.png
```

`build` rebuilds the .blend from the Meshy download and repaints it from scratch (it would undo hand painting).

**Worth touching up:** the pale leg bands are thin; the inside of the open lid is one flat brown; the burrow is shallow, so the head sits right at the rim.
