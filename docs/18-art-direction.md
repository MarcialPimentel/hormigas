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
9. **Grass never stands in front of what you look at** (30 Oct, revised after playtest): once the camera comes down among the grass, blades and reeds that cut the line of sight to the point at the centre of the view, or to any spot within about 20 units (mounds, sites, empty spots), sink into the ground; the lane is wide by the camera and narrows toward the target. The rest of the meadow stays. From high up nothing changes. Marz turned down fading all the grass while moving (the first try): it washed out the whole view. Ant mounds are solid domes of dug-out soil with the entrance in a shallow crater on top (the old crater rim read as an open bucket up close). WASD / arrow keys move the camera on the patch and the Garden, Q/E turn it on the patch.

10. **The Whole Yard (preview)** (1 Nov): from [art/whole-yard.md](art/whole-yard.md). One continuous map replaces the separate rungs for playtesting: Yard (the five beds) → Region → Patch → Ground, the nest joined by a dive through the crater. Patches are hex tiles (grid strong far out, fading up close), scent borders honey / teal / brown / red, Civ-style banners (level, name, points), mounds in three growth stages (first a Blender script, `docs/art/whole-yard/mounds.blend.py`, which the mock-up still uses; in the game since 4 Nov the Meshy colony mound below), and the mounds swelled far out like Civ cities until 4 Nov, when Marz asked for them to keep their true size at every zoom. Behind `?preview=yard` on computers only; phones keep the 2D screens. Still open: mist over unexplored patches (needs a server list of patches seen) and whether borders ever give a bonus. **The top (Yard) view** (1 Nov) is a tidy garden: beds with low brick edges on a striped lawn, stepping stones, a wooden sign per bed, your colony as a honey pin and wild nests faint from the top ([art/whole-yard.md](art/whole-yard.md#the-yard-view)); since 2 Nov it is fitted tight to the five beds (no house, fence or hedge) and the Woodpile's logs lie beside the bed, not on its patches. **The models** (2 Nov): one continuous painted ground per bed with the hexes drawn as lines (no tile slabs), grass as Blender clumps of curved blades that sway, and Blender rocks, stones, flowers, shrubs, logs, bark chips, leaves, reeds and tussocks (`docs/art/whole-yard/props.blend.py`); ants drawn bigger as the camera pulls back (true size at ant height, about 7× at the Patch zoom, up to 25× further out) ([art/whole-yard.md](art/whole-yard.md#the-models)).

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
- **Computers:** the tree fills the screen below the resource bar, edge to edge, like the nest on the Colony screen; the tree box scrolls inside it and the page itself doesn't, so the card on the right stays in view wherever you are in the tree (the same in the Whole Yard's Research panel). The tree is a map of its own: drag to move around it, scroll as usual, and zoom with Ctrl + scroll, a trackpad pinch or the + / − / Whole tree / 100% buttons in its corner (25% to 160%, remembered per browser). A drag never counts as a click on a research. The card on the right is 280px wide, 320px on big screens.
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
- **Real 3D ants** (`client/src/components/nest3d/ants3d.ts`): one body plan (gaster, petiole, mesosoma, head, mandibles, elbowed antennae, six legs) with the castes' proportions, legs swinging in a tripod gait in the shader, drawn cartoon-style after Marz's 2D concept (1 Nov): three flat toon light bands, a glossy highlight spot, dark eyes and a dark ink outline (a slightly larger inside-out copy of the same ants), plus a soft warm rim by day and a cool one at night. Chitin: worker `#B8612F`, soldier `#96472A`, queen `#8E4527`, alate `#B06A3C`, raider `#C4473A`, army ant `#8E2216`, army major `#B23A26`. Loads ride on the ants in resource colours.
  - **The model** (since 4 Nov) is built in Blender from Meshy concept 1 (`art/meshy/hero-ant/`: `build_ant.py` makes `hero-ant.blend`, `export_ant.py` writes `client/src/components/nest3d/ant.json`). It's named parts in two levels of detail: about 3,000 triangles for the few ants up close in a chamber, 720 for crowds. The castes stretch it in code (head, jaws, gaster, slimness, leg spread; two waist nodes and sickle jaws are their own parts), and every leg is its own part so it can swing. Touch-ups made in the .blend come into the game by re-running the export, as long as the part names stay. Vertex tones: eyes dark, two pale gaster bands. The ink outline thins down each leg.
- **The aphid herd** (`client/src/components/three/aphidHerd.ts`): a poppy with chubby aphids feeding on it, drawn like the ants (toon bands, gloss spot, ink outline; shared code in `three/toonModel.ts`). Both made with Meshy (image-to-3D, Smart Topology; poppy 1,559 triangles, aphid 476) from concepts picked by Marz, and coloured per part in Blender: petals Poppy `#FF6B4F`, green seed bulb and stamens `#9DC449`, no brown (red and green only), stem and leaves `#5F8C30`, grass `#6E9A34`, one flat colour per part. The poppy is lit evenly (every face as if facing up, no gloss or rim light, no shadow on itself) so each part reads as one solid colour like the concept; the aphids keep the full toon shading; aphid body Aphid `#B5E04A`, belly `#DDEB9A`, legs `#8DB83A`, honeydew `#F2B21F`. The stem and leaves are darker than other greens so the aphids pop. The aphid count shows the herd's level (2 + 2 per level, on fixed perches exported with the poppy), and they swell gently as they feed. Source in `art/meshy/aphid-herd/`.
- **The dead grasshopper** (windfall, `client/src/components/three/toonModel.ts`): on its back with its legs in the air and X eyes, drawn like the ants (toon bands, gloss spot, ink outline; the wings get no outline). Made with Meshy (image-to-3D, Smart Topology, 1,179 triangles) from a concept picked by Marz, coloured per part in Blender: body `#8DB83A`, belly `#A9C94A` / `#93B540`, jumping legs `#9DC449`, thin legs `#6E8A2E`, wings `#CFDDA0`, eyes `#2B1D12`. Source, prompts and the Blender script in `art/meshy/grasshopper/`; the same model in the Whole Yard and the Patch.
- **The termite mound** (wild site, same code as the grasshopper: `client/src/components/three/toonModel.ts`): a tall clay spire with buttress ridges and a smaller side spire on a wide base, the undersides of its arches painted as dark entrances. Drawn like the ants (toon bands, gloss, ink outline), a deliberate exception to the flat low-poly style of the other landscape pieces (Marz, 4 Nov). Meshy Smart Topology, 1,542 triangles; spires `#B58C5E`, base `#9A7248`, entrances `#3A2618`. Source in `art/meshy/termite-mound/`.
- **The spider den** (wild site, boss; same code: `client/src/components/three/toonModel.ts`): a trapdoor spider waiting in its silk-lined burrow, only its red eye cluster, black fangs and four hairy front legs out over the rim, the mossy lid propped open on a twig and two shut trapdoors beside it. Drawn like the ants (toon bands, gloss, ink outline). Menacing, not cute: no face, the danger is in real spider parts (Marz, 6 Nov). Meshy Smart Topology, 2,521 triangles; soil `#B0814F`, burrow `#1E130C`, silk `#F2EEE6`, lids `#7A5C40`, moss `#7A7A2E`, chitin `#2B201C`, eyes `#C43A3A`. The same model in the Whole Yard and the Patch, turned so the spider faces the camera. Source in `art/meshy/spider-den/`.
- **The colony mound** (every colony and wild nest, same code: `client/src/components/three/toonModel.ts`): a low dome of rounded soil clods round a crater with the entrance in the middle, twigs and pale pebbles at the foot, drawn like the ants (toon bands, gloss, ink outline). Darker cocoa earth so it stands apart from the orange termite mound: foot `#3E2718`, soil `#573922`, top `#6E4A2E`, entrance `#140B06`, pebbles `#D8CBB4`. One Meshy model (Smart Topology, ~1,500 triangles) in three growth stages: the Whole Yard stretches it to each stage's size and the bigger stages carry more pebbles; the Patch uses the small one, a touch lighter for your own colony and darker for wild nests (Marz, 4 Nov). Source in `art/meshy/colony-mound/`.
- **The Patch** (Missions screen, computers; `client/src/components/patch3d/`): your patch as a sunlit diorama, the spots in the drawn patch's order left to right. Terrain bands blend into each other (meadow `#A9C450` with flowers, sand `#D9BE84` with pebbles, grassland `#6FA83E`, leaf litter `#8A6A44` under a fallen log with orange bracket fungus, creek bank `#8FB0A0` with a creek and reeds, the wilds `#4F7A36`). Colonies are sandy mounds on cleared ground with flags (honey yours, teal allies, amber others, grey inactive, red wild); unscouted colonies are three swaying scent plumes over a stain; aphids climb a stem, termites build a tower, a trapdoor spider waits in its burrow. Places you can act on but where nothing stands (empty spots, the wilds) are dotted cream circles on the ground, drawn over the grass so they always show; under the pointer they brighten and name themselves. A marble and a bottle cap lie at true size. Every party walks a faint scent ribbon in its colour, leaving and entering a mound through the entrance in its crater (over the rim and down the slope). Columns move smoothly between the game's once-a-second clock ticks, and legs are tied to the distance walked (one tripod step per 0.17 units, so feet don't slide), with a slow minimum pace so a long trip still reads as walking. Zooming in lowers the camera to ant height; a scale bar says how much of the garden is in view (1 unit ≈ 14 mm, an ant is 5 mm).
- **Swarms and battles on the Patch:** an army-ant swarm is a fan, a front about 17 cm wide that thins into the column behind it, with springtails and beetles hopping away ahead of it. A battle is acted out where it was fought, from its report: the two sides march in, meet at a front line in a haze of dust, lose ants round by round exactly as the report says (the dead fall on their backs, legs up), then the winners press into the nest or the losers walk away. It plays by itself when a raid or swarm lands on a patch you're watching, and from any battle report with **Watch the battle** (computers). Old corpse fields show as dead ants on their backs around the spot.
- **The Garden** (`client/src/components/patch3d/garden.ts`, 1 unit ≈ 50 cm): a lawn `#7FA84A` with the house wall and patio at the front and a fence at the back; the five regions are plots (Backyard lawn `#86B84E`, Old Garden soil `#8A6A44` with small flowers, Creekside `#86AE8E` with the creek, Woodpile `#9C7E58` with stacked logs, Long Grass `#6E9A3A` with tufts). Lights: honey `#FFC93C` yours (pulsing, with a ring on the patch in view), teal `#3FC2B8` allies with threads, warm white `#FFF1D6` everyone else. By day they're dots on the plots; by night, glows over a dark garden. Region names sit on dark pills.
- **Counts:** the nest shows one ant per ant up to 160 workers and 30 soldiers; a party on the surface shows one per ant up to 300, a swarm up to 1,500 (half on touch devices). The party label gives the true number.

## Assets
Chambers come from `client/src/art/chambers.ts`; `npx tsx art/chambers/build.ts` writes each to `art/chambers/<id>.svg` with a `preview.html` sheet (every chamber large, and at nest size). Edit `chambers.ts`, not the SVGs.

Ants come from one parametric body plan in `client/src/art/ants.ts`, which the game uses directly: the nest view rasterises four walk poses per caste into textures, and the close-up draws portraits as SVG. `npx tsx art/ants/build.ts` writes the same ants to `art/ants/` as `<caste>-sprite.svg`, `<caste>-portrait.svg` and `preview.html` (open it in a browser to review all castes at every size). Edit `ants.ts`, not the SVGs. Cosmetic ant palettes ([14-monetization.md](14-monetization.md)) are palette swaps on the same parts.

## Open Questions
- Should ant species vary by player (leafcutter, bullet ant, weaver), or is it one species with cosmetic palettes?
- Do the surface and grass get the same field-guide treatment, or stay schematic so the nest stays the focus?
- Larvae, pupae and eggs: drawn as their own sprites, or as simple shapes in the brood chamber? (In the 3D nest they are simple 3D shapes, see § In 3D; the 2D nest still uses the chamber pictures.)
