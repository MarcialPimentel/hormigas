# Sunlit Microcosm: taking Hormigas properly 3D

**Status:** proposal, waiting on Marz (drafted 30 Oct 2026). Nothing in the design docs has changed yet.
**Mock-up:** [sunlit-microcosm-mockup.html](sunlit-microcosm-mockup.html) (open in a browser; published as "Hormigas Sunlit Microcosm"). Sources in [sunlit-microcosm/](sunlit-microcosm/): edit `page.src.html` and `scene.js`, then run `python docs/art/sunlit-microcosm/build.py`. New pictures: `icons/scale-*.svg`.

Builds on [3d-exploration.md](3d-exploration.md) (the slab) and [18-art-direction.md](../18-art-direction.md).

## The short version

| | Call |
|---|---|
| Structure | **A ladder of scales:** Garden → Patch → Nest → Chamber, one camera and one zoom. Each rung is a screen we already have, turned into a place. |
| Look | **Sunlit microcosm:** macro-photo light (low sun behind things, glossy backlit ants), colourful soil horizons, flowers overhead. No more one-brown nest. |
| Swarms | Ants become 3D and instanced, so a raid is hundreds of ants and a swarm is a red tide of thousands, not 30 sprites. |
| Technology | More Three.js (instancing, small shaders) on the version we already ship. No physics engine yet. |
| Art | One master ant and a garden kit made in Blender; the 2D pictures rendered from the same models later. |

## The big idea: OGame had a solar system, we have a garden

Space games feel big because you can zoom from one ship out to a galaxy. Our world already has that ladder: the five regions (`regionNames` in `formulas.json`) are parts of one back garden, a patch is a square of ground, and the nest is under a mound.

| Rung | OGame | What it shows | Today's screen |
|---|---|---|---|
| **Garden** (≈15 m across) | Galaxy | A light where colonies live (never names or strength); your colonies honey, allies teal; threads for missions under way | Missions → World (region grid) |
| **Patch** (≈80 cm) | Solar system | Mounds, scents, wild things; every mission as a column of ants on a scent trail | Missions (drawn patch) |
| **Nest** (≈35 cm deep) | Planet | Your colony cut open under the mound | Colony (3D slab) |
| **Chamber** | Building | One hollow up close, its sheet and names | Chamber card, close-up |

Zooming out past the edge of one rung rises to the next; zooming in on the garden dives into your patch. A live scale bar ("view ≈ 80 cm across · 160 ant lengths") says where you are.

### Options

- **A. The scale ladder (recommended).** Garden, Patch and Nest in 3D, joined by one zoom. Colony screen = Nest, Missions = Patch, World = Garden. Lists stay as cards over the world. Cost: the patch and garden are new scenes.
- **B. Two separate 3D views.** The 3D nest and a 3D patch, no zoom between them; the world grid stays 2D. About 60% of the work and most of the wow, but no "one world".
- **C. Hero moments only.** Today's screens plus short 3D scenes for big events (swarm arriving, battle replay, nuptial flight). Cheapest; it looks good in a trailer, but day to day you're still using a menu.

Not proposed: a free camera through the tunnels. It loses the at-a-glance read and turns a check-in game into a navigation game.

## Small things, big feeling: eight rules

1. **Get the camera down.** Zooming in also lowers the camera, until it sits at ant height looking across the ground.
2. **Neighbours at true size.** A marble (16 mm), a bottle cap, a fallen leaf, a garden hose, drawn at real size.
3. **Shallow focus.** Out-of-focus grass across the bottom of the lens and soft sun discs at the top, strongest up close.
4. **Light from behind.** A low warm sun behind the scene: chitin glows at the edges, grass lights up, shadows run toward you.
5. **Crowds at real count.** One drawn ant per ant up to a cap; above it, the tag gives the true number.
6. **Slow world, quick ants.** Grass sways slowly; ants scurry with a real tripod gait.
7. **Show the scale.** A live scale bar on every rung.
8. **Colour comes from life.** Petals, aphids, fungus, honey, beetles, rusty clay. Brown is one colour among many.

## The swarm look

- **Columns are rivers.** Every mission is a column on a scent trail in the owner's colour (the tech tree's dot line, on the ground). Ants have their own speed, so they overtake and bunch.
- **Army ants come as a fan.** Like real *Eciton* raids: a wide front that narrows into a column, insects leaping away ahead of it, dust where it meets your soldiers, the dead left upside down for your workers to haul home.
- **Far away, a light.** At garden scale a colony is a glow and a mission is a thread; night turns the garden into a star map.
- **Honest numbers.** Up to about 3,000 ants on screen on computers, 900 on phones. The server still decides results; the ants act them out. This is choreography, not a simulation (the non-goal in `00-vision.md` holds).

## Palette

World colours (fills, never text):

| Group | Colours |
|---|---|
| Light and air | Sunbeam `#FFD98A` (key light), Sky `#8CCBEB`, Warm haze `#F5E2B5` (fog, horizon), Dew `#DDF4FF`, Night `#131D43` |
| Life | Backlit blade `#BCE35C`, Blade root `#2E5E25`, Buttercup `#FFD23F`, Clover `#F6B6D2`, Poppy `#FF6B4F`, Bracket fungus `#F08A3C`, Beetle sheen `#2F8F83`, Aphid `#B5E04A` |
| Soil horizons | Leaf litter `#3E2B1E`, Topsoil `#7B4A2D`, Iron clay `#A9552F`, Ochre sand `#D3A05A`, Gley clay `#7E8E96`, Hollow glow `#FFB347` |
| Who's who | Worker amber `#D9934A`, Your trail `#FFC93C`, **Allies (new) `#46C9B8`**, Raider red `#C4473A`, Army ant `#8E2216`, Scent `#B98CFF` |

Retired: the three-step strata `#6B4F37` → `#4A3726` → `#33261A`.

Menu colours don't change. The new HUD text was checked with `contrast.py`: ink `#2B1D13` on paper `#F7F4EA` 14.8:1; tag accents (raider `#9C2B20`, scent `#6B38B8`, teal `#1D6E64`, leaf `#3B6522`, honey `#7E520A`) 5.5–6.9:1. Muted text fails on honey and teal fills (4.2 and 3.9), so only ink goes on fills.

## Type and pictures

Keep Bricolage Grotesque and Atkinson Hyperlegible. Four new pictures in the house style name the rungs: `icons/scale-garden.svg`, `scale-patch.svg`, `scale-nest.svg`, `scale-chamber.svg`. Later the unit and chamber pictures can be rendered in Blender from the 3D models (side view, ink line), so the list picture and the walking ant are the same ant.

## Interaction map

Every system gets a place and a verb; menus open from the world; the server decides.

| System | Where it lives | What the player does | Builds on |
|---|---|---|---|
| World map | Garden: a light per inhabited patch; yours honey, allies teal | Scroll out to rise; tap a light to dive in | Missions → World region grid |
| Your patch, scouting | Patch: mounds with flags, scent plumes, wild sites | Tap for the card (Scout, Raid, Send, Forage) | `Patch.tsx` spot card |
| Missions | Patch: a trail is laid, a column walks it with its timer tag | Send, watch, recall | Missions, `surfaceParties` |
| Incoming raids | Patch: red column, alarm ring at your mound | Keep the army or send it away | Incoming list |
| Army-ant swarms | Patch: fan-shaped front, insects fleeing, real count | Hold the line or send the army away | `20-swarms.md` |
| Battles | Patch: the clash at your mound; dead lie upside down | Watch it land, or replay it from the report | Battle report (needs per-round counts) |
| Corpse hauling | Patch: workers carry the dead home | Haul | Haul mission, corpse fields |
| Aphid herds | Patch: aphids on a stem in the wilds | Tend, call home | `24-npcs.md` |
| Chambers | Nest: carved hollows that widen with level | Tap; Dig deeper sends diggers carrying soil up to the heap | Build jobs, `chamberPlan.ts` |
| Stores | Nest: leaf piles, prey, honey pools | Glance; tap for amounts | Resources, capacity |
| Brood | Nest: eggs, larvae, cocoons; new ants walk out | Raise | Brood queue |
| Research | Nest: violet motes in the Pheromone Chamber | Tap to open the tree | Research jobs |
| New colonies | Garden: a winged queen flies an arc, a new light appears | Pick a spot | `19-colonies.md` |
| Supercolonies | Garden: teal threads between allied lights | Open Allies from a thread | `23-supercolonies.md` |
| Nest events | Patch and Nest: rain, beetle dragged down, leaves falling | Watch | Nest events |
| Reports, rankings, feedback | Cards over the current scale | Unchanged | Unchanged |

Only the battle replay needs anything new from the server (per-round counts, which the combat code already computes).

## Technology

Layers: React menus (unchanged) → **one Three.js world with three scenes, lazy-loaded per scale (new)** → **instanced ants and grass, small shaders, hand-written physics (new)** → PixiJS 2D nest and drawn patch (kept as fallback) → same data → server (unchanged).

| Option | Verdict |
|---|---|
| Three.js WebGL2 + InstancedMesh + custom shaders | **Recommended.** Already shipped. The mock-up draws 2,000+ swarming ants with walking legs in two draw calls (legs swing in the vertex shader). |
| Three.js WebGPU renderer, compute shaders | Later, for 50,000-ant swarms with GPU flocking. Same package, an upgrade not a rewrite. |
| Hand-written physics (hops, falls, splashes, sway) | **Recommended now.** About 100 lines, no download, same result every time. |
| cannon-es (≈120 KB) | Maybe later, for bodies tumbling in a battle replay. |
| Rapier (WASM, ≈1.5 MB) | No: nothing needs collisions solved; heavy download. |
| Post-processing (depth of field, bloom) | Phase 4, computers only. The mock-up fakes both. |
| React Three Fiber, Babylon.js, Unity/Godot web | No (same reasons as for the slab). |
| Blender | **Yes:** master ant, caste variants, garden kit, picture renders. |

Budgets: scene code under 150 KB, models under 800 KB in total (meshopt), loaded per scale. One ant ≤ 600 triangles (the mock-up's is about 580); ≤ 3,000 ants on computers, ≤ 900 on phones; under 100 draw calls per scale; hidden groups aren't drawn. 60 fps on computers, 30 on phones; stop drawing when hidden; Motion off shows a still frame or the 2D view.

## Making the art

- **Now, in code:** everything in the mock-up (ant body plan matching `client/src/art/ants.ts`, grass, flowers, pebbles, log, soil horizons, chamber contents).
- **Hero pieces in Blender:** a master ant with caste variants and a baked walk; a garden kit (leaves, petals, pebbles, twig, acorn, bottle cap, marble, termite cone, aphid).
- **Later:** a 3D artist for a consistent set; cosmetic nest themes as palette and prop swaps (never pay-to-win).

Blender pipeline: model the worker low-poly (≤ 600 triangles) to the body plan → castes as shape keys (soldier head and jaws, queen gaster, army ant slim with two nodes, major's sickle jaws) → rig six legs, one tripod walk loop, bake to a vertex animation texture → export `.glb` with meshopt → render side-on with an ink line for the 2D pictures. Claude can drive Blender through its MCP connector (it timed out in the session that wrote this); or start from a concept image:

```
A worker leafcutter ant carrying a cut leaf over its head, seen side-on at ant level.
Stylised low-poly 3D model, glossy amber chitin with a warm backlit rim, chunky readable silhouette,
six clearly separated legs, elbowed antennae, pinched waist, field-guide naturalism, no cartoon face.
Colours: amber body #D9934A, highlight #FFE2A8, leaf #8DCB4A.
Isolated on a plain light background, three-quarter side view, whole model in frame.
```

Image generator → Meshy or Tripo (low poly) → `.glb` → drop it in the chat. Check commercial-use terms first.

## Conflicts with the design docs

| Where | Says today | Would say |
|---|---|---|
| `18-art-direction.md` § In 3D | 2D art in a 3D block; ants on flat cards | 3D ants from one master model, instanced; 2D sprites stay for the fallback and pictures |
| `18-art-direction.md` § Palette | Strata `#6B4F37` → `#33261A`; nest the same in both themes | Sunlit microcosm palette; teal for allies; day and night by the player's clock |
| `18-art-direction.md` § Scale | Two zoom levels; sprites 11–15 px | Four scales on one zoom, with a live scale bar |
| `art/3d-exploration.md` decisions | No inside views; phones not a priority; no 3D models for now | Still no free camera; ant-level views on the patch; 3D patch on capable phones; models from Blender |
| `11-world.md` § Missions screen | Patch drawn in 2D; World = 10×10 grid per region | 3D patch diorama; World = the garden with regions as places (grid as overlay); same "no names or strength" rule |
| `12-ui-nest-view.md` | Slab on computers, 2D on phones; Open Question on a raid scene | The slab is the Nest rung; the raid scene plays on the patch |
| `20-swarms.md` § How players see it | One ant per 3, 6–30 shown | Fan-shaped front at real count up to the cap, flushed insects, true number on the tag |
| `13-tech.md` client | Three.js on the Colony screen only | One Three.js world shared by Colony and Missions |
| `00-vision.md` non-goals | Not a per-ant simulation | Unchanged |

These change, with the decision log, in the same pull request as the first approved work.

## Plan

1. **Colour and real ants in the slab:** instanced 3D ants replace the sprite cards; soil horizons; sunlit surface. Phones keep 2D.
2. **The 3D patch** on the Missions screen (computers); the drawn patch stays as the fallback.
3. **Swarm and battle moments:** fan front, fleeing insects, clash at the mound, corpses to haul, replay from the report.
4. **The Garden** and the zoom between rungs; nuptial flights; supercolony threads; real depth of field and bloom on computers.
5. **Blender hero art** and re-rendered pictures; the 3D patch on phones if phase 2 holds 30 fps on a mid-range phone.

## Decisions needed

1. ~~Structure: A (scale ladder), B (two separate 3D views) or C (hero moments only)?~~ **Decided 2026-10-30: A, the scale ladder** (Garden → Patch → Nest → Chamber, one camera, zoom out to rise a rung).
2. Look: retire the brown strata for the sunlit microcosm palette?
3. Ants: real 3D ants from one model, instanced, replacing the flat cards in 3D?
4. Counts: armies and swarms at real size (capped, true number on the tag) instead of 1 per 3, max 30?
5. First build: colour and real ants in the slab (recommended), or straight to the 3D patch?
6. Allies: teal for supercolony lights and threads?
7. Hero art: Claude builds the master ant in Blender (Blender open with the connector), or start from a concept image in Meshy or Tripo?

Risks: each system costs a little 3D work on top of its 2D fallback; cheap phones are the real test; hero art is the slowest part. Menus remain the fallback for everything.

## Open Questions
- Does the Garden replace the region grid outright, or sit beside it as a second view for players who like the grid?
- At garden scale, should wild things (swarms on the move, spider dens) show at all, given the "no strength on the map" rule?
- Night: the player's clock (as the slab does now) or the server's world time, so everyone's garden is dark together?
