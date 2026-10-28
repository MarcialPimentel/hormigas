# 18 — Art Direction

**Version:** 0.1

## Direction
**Field guide meets bold silhouette.** The colony should look like a page from a naturalist's notebook that has come to life: real ant anatomy, inked and lit like an illustration, but built on shapes simple enough to read at a glance on a phone.

- **In play (sprites):** a flat silhouette in two tones (body + top highlight), no outline. It must still read as an ant at 12px.
- **Up close (portraits):** the same silhouette, plus ink outline, gaster bands, belly shade, leg joints, eye glint and fine hairs. Used for close-ups, caste cards, the Brood Hall and reports.

The tone is grounded nature documentary, not cartoon: no faces, no big eyes, no expressions. Charm comes from behaviour (carrying, digging, swarming), not from faces.

## The ant
All castes share one body plan, seen side-on (the nest is a cross-section):

gaster · petiole · mesosoma · head · mandibles · elbowed antenna · six legs

- The **elbowed antenna** and the **pinched waist** are what say "ant" rather than "bug". Never lose them, at any size.
- **Far-side legs and antenna** are drawn in a darker shade behind the body. This gives depth for free.
- Castes differ by **shape first, colour second**, so they read in silhouette:

| Caste | Silhouette cue | Colour |
|---|---|---|
| Worker | Baseline | Amber |
| Soldier | Oversized head, heavy jaws | Redder, darker |
| Queen | Long, heavy gaster; thick thorax with wing scars | Deep rust |
| Alate (winged queen) | Queen + translucent wings over the back | Deep rust |

- **Walking** uses a tripod gait: near front, near hind and far middle legs swing together, against the other three. Legs pivot at the hip in code; no hand-drawn frames.

## Palette
Ants are lighter than the soil so they read on it. Colours sit alongside the UI palette in `client/src/styles.css`.

| Role | Worker | Soldier | Queen |
|---|---|---|---|
| Base | `#c98b52` | `#b06a38` | `#a95f2f` |
| Highlight | `#f2d3a2` | `#e6b37f` | `#e0a46e` |
| Shade | `#8c5730` | `#7a4524` | `#713c1c` |
| Far side | `#6e4325` | `#5c341b` | `#552c14` |
| Ink | `#2b1d13` | `#2b1d13` | `#24170e` |

Resource colours (leaf, protein, honey) stay reserved for cargo and stores, never for ant bodies, so a carried load always stands out.

## Scale
An ant needs about 14–18px of length on screen to read as an ant. There are two zoom levels:
- **Whole nest:** sprites at 11px (workers) to 15px (queens). Small, but on phone screens (2× pixels) they read as ants.
- **Chamber close-up:** tap a chamber to see portraits at 40–70px.

## Chambers
Built in layers, not one picture each, so they can grow with level and show how full they are:
1. **Shell:** the hand-dug hollow (a wobbly outline with a packed, flat floor), a packed-soil wall flecked with grit, roots reaching in from above, and the tunnel mouth.
2. **Contents:** what the chamber holds or does, sitting on the floor.
3. **Signature detail:** the one thing that names it at a glance.

Level 1 stand-ins exist for all twelve (`client/src/art/chambers.ts`):

| Chamber | Signature |
|---|---|
| Queen's Chamber | The queen, lying with her eggs, a worker attending |
| Leaf Garden | A spongy pale fungus mound with leaf bits worked in (leafcutters farm fungus, they don't eat leaves) |
| Hunting Grounds | A beetle on its back, hauled in; a soldier on guard |
| Nursery | C-shaped larvae being fed |
| Granary | Cut leaves and round leaf discs in a heap |
| Larder | Prey cut into pieces: chunks, legs, a torn wing |
| Brood Hall | Eggs, larvae and cocoons sorted into piles |
| Pheromone Chamber | Dotted violet scent trails and a faint glow |
| Aphid Pasture | A root through the ceiling with aphids on it, honeydew dripping |
| Nectar Cellar | Pooled honeydew and droplets |
| Excavation Works | Spoil heaped on the floor, a new tunnel being cut through the wall |
| Honeypot Gallery | Honeypot ants (repletes) hanging from the ceiling, gasters swollen with honeydew |

Contents use the resource colours (leaf, protein, honey), so a chamber's job reads from colour alone. At nest size (about 90px wide) the queen, fungus, leaves, honeypots and aphid root still read; the Hunting Grounds, Pheromone Chamber and Excavation Works are weak that small and will need a bolder silhouette when the art moves into the whole-nest view.

In the game: the close-up draws the full art; the whole-nest view draws each chamber's art without the wall, roots or tunnel mouth (the nest has its own tunnels), fitted to the chamber's hollow.

**Next:** contents that grow with level and fill (more leaves as the Granary fills, more repletes as the gallery grows), and bolder silhouettes for the chambers that are weak at nest size.

## Assets
Chambers come from `client/src/art/chambers.ts`; `npx tsx art/chambers/build.ts` writes each to `art/chambers/<id>.svg` with a `preview.html` sheet (every chamber large, and at nest size). Edit `chambers.ts`, not the SVGs.

Ants come from one parametric body plan in `client/src/art/ants.ts`, which the game uses directly: the nest view rasterises four walk poses per caste into textures, and the close-up draws portraits as SVG. `npx tsx art/ants/build.ts` writes the same ants to `art/ants/` as `<caste>-sprite.svg`, `<caste>-portrait.svg` and `preview.html` (open it in a browser to review all castes at every size). Edit `ants.ts`, not the SVGs. Cosmetic ant palettes ([14-monetization.md](14-monetization.md)) are palette swaps on the same parts.

## Open Questions
- Should ant species vary by player (leafcutter, bullet ant, weaver), or is it one species with cosmetic palettes?
- Do the surface and grass get the same field-guide treatment, or stay schematic so the nest stays the focus?
- Larvae, pupae and eggs: drawn as their own sprites, or as simple shapes in the brood chamber?
