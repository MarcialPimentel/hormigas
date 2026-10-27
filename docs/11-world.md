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
| Region | 5 | "The Backyard", "The Old Garden", "Creekside", … |
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
- Browse by region → patch.
- Each spot shows: colony name, owner, rank band, status icons (inactive, protected, vacation, corpse field present). A wild nest shows its species and level instead of an owner.

## Open Questions
- Region names and visual identity per region?
- Should corpse fields be visible to everyone on the map, or only to scouts? Proposal: visible to everyone (creates races).
