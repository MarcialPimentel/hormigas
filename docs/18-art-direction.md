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
| Army ant (swarms) | Slim and leggy, two waist nodes, no eyes | Raider red |
| Army ant major | Army ant with a big head and long sickle jaws that hook back | Raider red |

**Army ants** are the enemy from the wilds ([20-swarms.md](20-swarms.md)), loosely after *Eciton*. They are the only ants with a two-node waist and no eyes (army ants are blind), and the major's sickle jaws name the swarm at a glance. They wear the same blood red as other colonies' raiders, so red still means "hostile" (Marz picked this over a field-guide chestnut with cream-headed majors and a near-black look, 29 Oct 2026).

- **Walking** uses a tripod gait: near front, near hind and far middle legs swing together, against the other three. Legs pivot at the hip in code; no hand-drawn frames.

## Palette
Ants are lighter than the soil so they read on it. Colours sit alongside the UI palette in `client/src/styles.css`, which has a dark (soil) and a light (field-guide paper) theme following the device; the nest itself looks the same in both.

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

## Names
Every ant in a chamber close-up has a name: hover it (or tap it on a phone) to see a small tag with its name and caste.
- Names are common given names in Spain, kept in `docs/data/ant-names.json` (100 female, 100 male).
- **Biologically accurate:** workers, soldiers and queens are all female, so they take female names; a queen is titled ("Reina Isabel"). Male names are for winged males (drones), which aren't drawn yet.
- **Nothing is stored.** A name is worked out from the colony, the chamber and which ant it is (`client/src/art/antNames.ts`), so the same ant has the same name on every visit, on every device, for anyone looking. A name belongs to a spot in the chamber, not to an individual with a history.

## Pictures
Every chamber, unit, defense and research has a small picture (`client/src/art/icons.ts`), shown on a light tile left of its name in the Chambers, Brood and Research lists. They are placeholders in the house style, each drawn on its own so it can be replaced one at a time.
- **Rules:** 64 × 64, side view like the nest, ant-ink outlines, one base colour and one shade, one highlight. Always on the light tile (paper `#F7F4EA`, ink border, leaf-green inner ring), so they read in both themes. Locked items grey out.
- **Chambers:** a small window into the hollow showing the chamber's signature detail (the same pieces as the chamber art).
- **Units:** the caste's field-guide portrait. The Major Soldier is a bigger, darker soldier; the Bullet Ant is black; the Carrion Beetle is drawn on its own.
- **Defenses and research:** a simple symbol for what each does (pellet wall, pit trap, acid spray; jaws, shell plates, scent trail, antenna, linked minds, lucky leaf, egg→larva→cocoon, shaft, flight, aphid, ant and beetle, linked mounds).
- **Build 6 research:** acid drop over a pellet wall (Formic Acid), soldiers marching in a column (Raiding Columns), a flat soldier head plugging the tunnel mouth (Nest Plugging), two hunters and a beetle (Group Hunting), a fungus mound with a cut leaf (Fungus Farming), a hanging replete (Repletes), a nurse feeding a larva (Nurse Workers), a pellet-lined tunnel arch (Tunnel Engineering), leader and follower (Tandem Running), a half-hidden ant in a scent cloud (Chemical Mimicry).

`npx tsx art/pictures/build.ts` writes `art/pictures/preview.html` with all of them on their tiles.

## The tech tree
The Research screen has a **Tree / List** switch. Computers open on the tree, phones on the list; each device remembers the last choice. The tree is a map of scent trails (`client/src/components/ResearchTree.tsx`; rules in [21-tech-tree.md](21-tech-tree.md); first mock-up in [art/tech-tree-mockup.html](art/tech-tree-mockup.html), with sample links).

- **Columns are depth.** Research sits under the Pheromone Chamber level it needs; one that builds on another at the same level sits a step to its right. A dashed honey line marks how far this colony's chamber reaches.
- **Lanes are the four branches** (Jaws, Harvest, Nest, Scent), named on the left and sticky while you scroll.
- **Trails are pheromone.** Every `research.<id>` prerequisite is a trail, read from `unlock` in `docs/data/research.json`, never drawn by hand. A trail you've laid is the violet scent-dot line from the Pheromone Chamber art; one still to lay is a dashed soil line. A small pill where it arrives says the level needed. Trails that skip columns run in the gap under the rows, so they never pass behind a research.
- **Research are the same picture tiles** as the list. Level badge in honey (leaf green at the cap). Greyed with a lock: not reachable yet, or "coming later" (Symbiosis). Honey ring: you can afford it now. Violet glow: being learned.
- **Hover or focus** a research: the card on the right shows what it does, the next level's cost and time, the Research button (with the same "why not" as the list), what it needs (ticks, or your level against the one needed) and what it leads to. Everything it needs and opens stays lit; the rest fades. **Click** pins the card; names in Needs and Leads to jump there. Esc unpins.
- **Computers:** the tree fills the screen below the resource bar, edge to edge, like the nest on the Colony screen; the tree box scrolls inside it and the page itself doesn't. The card on the right is 280px wide, 320px on big screens.
- **Phones:** the same tree, panning sideways; a tap opens the card as a bottom sheet.
- **Colours:** `--scent` (violet, darker on paper) and `--trail-off` are theme tokens in `client/src/styles.css`; picture tiles stay on their light paper in both themes.

## Scents on the patch
A colony you haven't scouted is drawn as a **scent**: three wavy strokes rising from a faint stain on the ground, with no mound, flag or name ([22-discovery](22-discovery.md)). They use the flag colours, so players learn one code: **amber = players' ants, red = wild ants** (honey stays yours). Strokes sway slowly; reduced motion holds them still. The label reads "Ant scent" or "Wild scent", or the colony's name once it has scouted or raided you. Mock-up: [art/scents-mockup.html](art/scents-mockup.html) (made before the build; the real screen is `client/src/components/Patch.tsx`).

## In 3D: 2D art in a 3D block
The computer nest is a 3D block of earth ([12-ui-nest-view.md](12-ui-nest-view.md), "The 3D slab"), but its life is this 2D art: chamber pictures on the hollows' back walls and ant sprites on flat cards. The look is a paper diorama; the soil strata (`#6B4F37` → `#4A3726` → `#33261A`), hollow (`#1C140E`) and grass (`#6F9A3E`) come from [art/3d-exploration.md](art/3d-exploration.md). Hero models can replace cards one at a time later.

## Assets
Chambers come from `client/src/art/chambers.ts`; `npx tsx art/chambers/build.ts` writes each to `art/chambers/<id>.svg` with a `preview.html` sheet (every chamber large, and at nest size). Edit `chambers.ts`, not the SVGs.

Ants come from one parametric body plan in `client/src/art/ants.ts`, which the game uses directly: the nest view rasterises four walk poses per caste into textures, and the close-up draws portraits as SVG. `npx tsx art/ants/build.ts` writes the same ants to `art/ants/` as `<caste>-sprite.svg`, `<caste>-portrait.svg` and `preview.html` (open it in a browser to review all castes at every size). Edit `ants.ts`, not the SVGs. Cosmetic ant palettes ([14-monetization.md](14-monetization.md)) are palette swaps on the same parts.

## Open Questions
- Should ant species vary by player (leafcutter, bullet ant, weaver), or is it one species with cosmetic palettes?
- Do the surface and grass get the same field-guide treatment, or stay schematic so the nest stays the focus?
- Larvae, pupae and eggs: drawn as their own sprites, or as simple shapes in the brood chamber?
