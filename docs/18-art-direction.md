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

## Decisions (Marz, 30 Oct 2026)
From the 3D direction proposal, [art/sunlit-microcosm.md](art/sunlit-microcosm.md):
1. **Structure: the scale ladder.** Garden → Patch → Nest → Chamber, OGame's galaxy → system → planet as one garden: one camera, zoom out past a level to rise to the next.
2. **Look: the sunlit microcosm.** Macro-photo light, soil in coloured horizons, colour from life (flowers, stores, beetles). The old brown strata are retired.
3. **Ants: real 3D ants** from one body plan, instanced, in every 3D view. The 2D sprites stay for the 2D nest (phones, fallback) and the pictures.
4. **Counts: real size, capped.** One drawn ant per ant up to a cap; above it, the label gives the true number.
5. **First build:** colour and real ants in the 3D slab (this change). The 3D patch comes next.

6. **Allies are teal** (30 Oct): supercolony mates' flags, lights and threads are teal `#2F9C95`, so honey = you, teal = allies, red = hostile or wild, with no overlap.
7. **Hero art: Claude builds the master ant in Blender** (30 Oct), with Blender open and its MCP add-on connected, after the Patch, swarm and Garden builds.
8. **The rest lands as separate PRs** (30 Oct), each its own playtest: A the 3D Patch, B swarms and battles on the patch (replays read the per-round counts battle reports already save), C the Garden and the zoom between levels, D living chambers in the nest.
9. **Grass gets out of the way while you move** (30 Oct): on the zoomed-out patch the grass turns see-through (to about a fifth) while the camera moves, and grows back half a second after it stops; at ant height it stays solid, since there it's the point. Still views keep the lush look. WASD / arrow keys move the camera on the patch and in the Garden, Q/E turn it on the patch.

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
An ant needs about 14–18px of length on screen to read as an ant. In the 2D nest there are two zoom levels (the 3D views follow the scale ladder above):
- **Whole nest:** sprites at 11px (workers) to 15px (queens). Small, but on phone screens (2× pixels) they read as ants.
- **Chamber close-up:** tap a chamber to see portraits at 40–70px. In the 3D nest, zooming in (up to 10×) shows every chamber's crew; at the double-click glide (8×) an ant is roughly 45–90px long on a computer. Crews are cut finer than the crowds in the tunnels.

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
Every ant you can look at closely has a name: in the 3D nest, zoom in and point at any ant for her name and caste, and click her for a field-guide card (name, caste, what she's doing) while she stops and turns to you; in the 2D close-up, hover, click or tap for a small tag. See [12-ui-nest-view.md](12-ui-nest-view.md), "Meeting the ants".
- **The card** is a little specimen label on paper `#F7F4EA` with ant-ink text and border (honey ring when pinned), the same in both themes since it sits in the world.
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

## In 3D: the sunlit microcosm
The computer nest is a 3D block of earth ([12-ui-nest-view.md](12-ui-nest-view.md), "The 3D slab") in the look of [art/sunlit-microcosm.md](art/sunlit-microcosm.md):
- **Soil horizons** on the cut face and sides, top to bottom: litter `#3E2B1E`, topsoil `#7B4A2D`, iron clay `#A9552F`, ochre sand `#D3A05A`, grey-blue gley clay `#7E8E96`, deep subsoil `#5E3C2A`, with pebbles, pale roots and fallen petals painted in. Hollow and tunnel walls are warm clay `#9A5C38`.
- **Hollows lit from inside.** Each hollow's back wall is plain warm clay lit from the middle, in the chamber's glow (gold for nectar, violet for the Pheromone Chamber, green for aphids, amber for the rest). At night the glow strengthens, so the nest reads like lanterns.
- **Living chambers** (`client/src/components/nest3d/contents.ts`): each hollow holds what the chamber holds, in 3D, and the amounts are the colony's real numbers. Colour comes from the contents, not the walls.
  - Stores fill with their resource (the same fill as the "% full" tag): green leaf bits heap up in the **Granary**, red prey chunks in the **Larder** (a whole teal beetle once it's over 40% full), a glossy honey pool that spreads and deepens with drops around it in the **Nectar Cellar**. Piles fill from the bottom up, so an empty store is a bare floor.
  - Brood follows the unit queue, one piece per ant being raised up to a cap: eggs, curled larvae and cocoons in the **Brood Hall**, and what overflows in the **Nursery**. No queue, no brood.
  - By level: the pale fungus garden with leaf bits in the **Leaf Garden**, a beetle and prey in the **Hunting Grounds**, the queen's eggs beside her, a root with green aphids in the **Aphid Pasture**, a spoil heap in **Excavation Works**, and hanging honey repletes in the **Honeypot Gallery** (one more per level, swelling as nectar fills).
  - Violet motes drift in the **Pheromone Chamber** only while research runs.
  - Everything sizes with the hollow (bigger at higher levels), is still when motion is off, and uses about half the pieces on touch devices.
  - Why the 2D pictures left the back walls: they have piles and brood drawn in, so an empty Granary still showed leaves and an idle Brood Hall still showed larvae. With the contents in 3D the plain lit wall is cleaner and never contradicts the numbers. The 2D pictures stay in the lists and on the 2D nest.
- **The surface** has swaying, backlit grass `#2E5E25` → `#BCE35C`, flowers overhead, a red toadstool, an orange leaf and a sandy entrance mound `#C8A06A`.
- **Real 3D ants** (`client/src/components/nest3d/ants3d.ts`): one body plan (gaster, petiole, mesosoma, head, mandibles, elbowed antennae, six legs) with the castes' proportions, legs swinging in a tripod gait in the shader, a warm rim light on the chitin by day and a cool one at night. Chitin: worker `#D9934A`, soldier `#B5662F`, queen `#A95F2F`, raider `#C4473A`, army ant `#8E2216`, army major `#B23A26`. Loads ride on the ants in resource colours.
- **The Patch** (Missions screen, computers; `client/src/components/patch3d/`): your patch as a sunlit diorama, the spots in the drawn patch's order left to right. Terrain bands blend into each other (meadow `#A9C450` with flowers, sand `#D9BE84` with pebbles, grassland `#6FA83E`, leaf litter `#8A6A44` under a fallen log with orange bracket fungus, creek bank `#8FB0A0` with a creek and reeds, the wilds `#4F7A36`). Colonies are sandy mounds on cleared ground with flags (honey yours, teal allies, amber others, grey inactive, red wild); unscouted colonies are three swaying scent plumes over a stain; aphids climb a stem, termites build a tower, a spider hides under a silk lid. Places you can act on but where nothing stands (empty spots, the wilds) are dotted cream circles on the ground, drawn over the grass so they always show; under the pointer they brighten and name themselves. A marble and a bottle cap lie at true size. Every party walks a faint scent ribbon in its colour. Zooming in lowers the camera to ant height; a scale bar says how much of the garden is in view (1 unit ≈ 14 mm, an ant is 5 mm).
- **Swarms and battles on the Patch:** an army-ant swarm is a fan, a front about 17 cm wide that thins into the column behind it, with springtails and beetles hopping away ahead of it. A battle is acted out where it was fought, from its report: the two sides march in, meet at a front line in a haze of dust, lose ants round by round exactly as the report says (the dead fall on their backs, legs up), then the winners press into the nest or the losers walk away. It plays by itself when a raid or swarm lands on a patch you're watching, and from any battle report with **Replay on the patch** (computers). Old corpse fields show as dead ants on their backs around the spot.
- **The Garden** (`client/src/components/patch3d/garden.ts`, 1 unit ≈ 50 cm): a lawn `#7FA84A` with the house wall and patio at the front and a fence at the back; the five regions are plots (Backyard lawn `#86B84E`, Old Garden soil `#8A6A44` with small flowers, Creekside `#86AE8E` with the creek, Woodpile `#9C7E58` with stacked logs, Long Grass `#6E9A3A` with tufts). Lights: honey `#FFC93C` yours (pulsing, with a ring on the patch in view), teal `#3FC2B8` allies with threads, warm white `#FFF1D6` everyone else. By day they're dots on the plots; by night, glows over a dark garden. Region names sit on dark pills.
- **Counts:** the nest shows one ant per ant up to 160 workers and 30 soldiers; a party on the surface shows one per ant up to 300, a swarm up to 1,500 (half on touch devices). The party label gives the true number.

## Assets
Chambers come from `client/src/art/chambers.ts`; `npx tsx art/chambers/build.ts` writes each to `art/chambers/<id>.svg` with a `preview.html` sheet (every chamber large, and at nest size). Edit `chambers.ts`, not the SVGs.

Ants come from one parametric body plan in `client/src/art/ants.ts`, which the game uses directly: the nest view rasterises four walk poses per caste into textures, and the close-up draws portraits as SVG. `npx tsx art/ants/build.ts` writes the same ants to `art/ants/` as `<caste>-sprite.svg`, `<caste>-portrait.svg` and `preview.html` (open it in a browser to review all castes at every size). Edit `ants.ts`, not the SVGs. Cosmetic ant palettes ([14-monetization.md](14-monetization.md)) are palette swaps on the same parts.

## Open Questions
- Should ant species vary by player (leafcutter, bullet ant, weaver), or is it one species with cosmetic palettes?
- Do the surface and grass get the same field-guide treatment, or stay schematic so the nest stays the focus?
- Larvae, pupae and eggs: drawn as their own sprites, or as simple shapes in the brood chamber? (In the 3D nest they are simple 3D shapes, see § In 3D; the 2D nest still uses the chamber pictures.)
