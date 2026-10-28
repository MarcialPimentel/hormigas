# 11 — World

**Version:** 0.1
**Data:** [`data/terrain.json`](data/terrain.json), [`data/formulas.json`](data/formulas.json)

## One world (for now)
- All players share a single persistent world.
- Every record in the database carries a `world_id` anyway, so seasonal or extra worlds can be added later without a rewrite.

## Coordinates
`Region : Patch : Spot` — e.g. `2:47:9`

| Level | Count (MVP) | Flavor |
|---|---|---|
| Region | 5 | The Backyard, The Old Garden, Creekside, The Woodpile, The Long Grass (`regionNames` in `formulas.json`) |
| Patch | 100 per region | A patch of ground |
| Spot | 12 colony spots per patch (+ spot 13 = the wilds, for Forage) | |

That's 6,000 colony spots — plenty for MVP. Increase regions as the population grows.

## Distance → travel time
- Same patch: short (minutes).
- Different patch, same region: scales with patch distance.
- Different region: large fixed cost + patch distance.
Exact formulas in `data/formulas.json`. Distance should make **neighbors** your main friends and threats.

## Starting placement
- New players are placed in the least-populated region, in a patch with free spots, avoiding patches full of very strong players where possible.
- Terrain at start: always **Grassland** (no modifiers) to keep the first experience even.

## Wild nests
Every patch with players also holds one **wild nest**, a rival colony of another ant species on a non-Grassland spot. It spawns when the patch's first player arrives. See [17-wild-nests](17-wild-nests.md).

## Map screen
One screen, drawn rather than listed:
- **Regions:** a tab per region by name, and under it a 10×10 grid of the region's 100 patches. A patch is marked only by whether colonies live there (and which one is yours), never by names or strength, so players can find each other without the grid advertising targets. Tap a patch to go there.
- **The patch:** a picture of its ground, with the spots laid out on their terrain bands (sunny meadow 1–2, sandy soil 3–4, grassland 5–8, rotting log 9–10, creek bank 11–12, the wilds at the edge). A colony is an entrance mound with a flag: yours in honey, wild nests in red, other players in amber. Corpse fields lie on the ground; parties on the way show a marker on the spot.
- **Nearest colony:** buttons on both sides of the patch jump to the next patch, going backwards or forwards through the world, that holds another player's colony. Wild nests don't count, since every inhabited patch has one.
- **A spot:** tapping it opens a card with the colony name, owner, points and status (inactive, protected), or the wild nest's species and level, plus the actions (Scout, Raid, Send, Forage, Haul, Relocate).
- **Seeing inside takes a scout.** The map only shows the mound. The card shows your latest scout report on that colony and how old it is: what was in the stores, and, as the report's detail allows, the army, the defences and the chambers with their levels.

## Open Questions
- Should corpse fields be visible to everyone on the map, or only to scouts? Proposal: visible to everyone (creates races).
