# The Whole Yard: Hormigas as a 3D 4X on one map

**Status:** approved as a preview, 1 Nov 2026: Marz asked to ship it behind a switch to playtest, with Chambers, Brood Hall and Research as panels over the map and phones left on today's screens. Built in `client/src/screens/Yard.tsx` and `client/src/components/yard3d/scene.ts`; open with `?preview=yard`. Mist and border bonuses are still open.
**Mock-up:** [whole-yard-mockup.html](whole-yard-mockup.html) (open in a browser; published as "Hormigas Whole Yard"). Sources in [whole-yard/](whole-yard/): edit `page.src.html` and `scene.js`, then run `python docs/art/whole-yard/build.py`. The mounds come from a Blender script: `"C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P docs/art/whole-yard/mounds.blend.py` writes `mounds.json` and `mounds-preview.png`.

Builds on [sunlit-microcosm.md](sunlit-microcosm.md) (the scale ladder, approved 30 Oct) and the cartoon ants (#123). Palette and type are unchanged.

## The short version

| | Call |
|---|---|
| Structure | **One map, one zoom:** Yard (≈30 m) → Region (≈5 m) → Patch (≈1 m) → Ground (≈6 cm), on one screen. Double-click your mound to dive into the nest. |
| Look | **Civilization's map grammar:** patches as hex tiles far out, scent borders, mist over unexplored ground, mounds that grow, banners, a "Needs you" button. |
| Rules | **Civ's look, OGame's clock.** No turns, no unit micro, nothing about the server rules changes. |
| Technology | Grow the Three.js Garden and Patch scenes into one scene with level-of-detail rules; the nest stays its own scene, joined by the dive. |
| Art | A scripted Blender kit: mounds in three growth stages (done), landmarks, region dressing, the master ant. |
| Playtest | A preview switch on the live game (`?preview=yard`), off for players, so Marz plays it with his real colonies before anyone else sees it. |

## What makes it read as a 4X

| Civilization | Hormigas, Whole Yard | Cost |
|---|---|---|
| Hex map | Each patch is a hex tile (5 regions × 100). The grid shows far out and fades up close. | Art only |
| Cities that grow | Mounds in three stages by colony points (heap → thatched → big domed mound). | Art only |
| City banners | Level, name, ant count; "!" on wild nests; coloured squares far out. | Art only (data exists) |
| Culture borders | Scent borders: honey yours, teal supercolony mates, muted brown rivals, red wild. | Art only; a border bonus would be a new rule |
| Fog of war | Mist over patches you have never scouted or sent ants to. | Small server change: patches seen per player |
| Units | Columns of real ants close up, a tag in between, a thread far out. | Exists (#92, #96); joined up |
| Strategic view | Zooming out is the strategic view. | Art only |
| End turn | **Needs you**: idle Brood Hall, no dig, raid incoming; tap and the map flies there. | Art only |
| City screen | The dive through the crater into the 3D nest. | Exists; joined by the dive |
| Wonders | Later idea: landmarks as contested places. | New system, not proposed now |

**Recommendation on rules:** take Civilization's presentation, not its rules. Turns, settlers and moving units by hand break "the colony lives while you're away" and "no unit micro", and turn a 5-minute check-in into a long session.

## Conflicts with the design docs

| Doc | Says today | Would say |
|---|---|---|
| 00-vision · Inspirations | Browser strategy, idle games, ant biology | Adds Civilization's map (presentation only) |
| 00-vision · Tone | Grounded documentary, "no cartoon faces" | Stylised field guide (cartoon ants with eyes are live since #123) |
| 18-art-direction · Decision 1 | Separate rungs: Garden, Patch, Nest, Chamber | One continuous map Yard → Ground; nest joined by a dive |
| 11-world · Missions screen | The map lives in Missions | The map is the main screen; Colony and Missions become cards on it |
| 11-world · Coordinates | Patches in a 10 × 10 grid | Same numbers drawn as offset hex tiles (travel times unchanged) |
| 22-discovery | Unscouted colonies are scents | Plus mist over patches never seen |

## Plan

1. Preview switch and the one zoom (computers, existing art): Garden + Patch become one map behind `?preview=yard`; double-click your mound dives into the 3D nest.
2. Civ grammar: hex tiles far out, scent borders, banners, Needs you.
3. Mist: the server keeps the patches each player has seen; scouting lifts it.
4. Blender kit: growing mounds, landmarks, region dressing, the master ant.
5. Make it the main screen for everyone (Marz's call after playtests), then phones.

## Decisions for Marz

1. Direction: the Whole Yard (Civ's look, today's rules and clock)?
2. Hex tiles: grid far out only, fading up close (recommended), or hexes at every zoom?
3. Mist: fog of war over never-seen patches (small server change)?
4. Scent borders: art only for now (recommended), or a bonus for owned ground later?
5. Playtest path: preview switch on the live game for your browser only (recommended)?
6. Phones: computers first; phones keep today's screens until step 5 (recommended)?
7. Tone: change "no cartoon faces" to "stylised field guide" to match the shipped ants?
