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
| Spot | 12 colony spots per patch (+ spot 13 = the wilds, for Forage; spots 14–16 = wild sites for an aphid herd, a termite mound and a spider den, [23-npcs](23-npcs.md)) | |

That's 6,000 colony spots — plenty for MVP. Increase regions as the population grows.

## Distance → travel time
- Same patch: short (minutes).
- Different patch, same region: scales with patch distance.
- Different region: large fixed cost + patch distance.
Exact formulas in `data/formulas.json`. Distance should make **neighbors** your main friends and threats.

## Starting placement
Players should meet. Until Build 7 each sign-up went to the least-populated region, so the first players all ended up alone. Now (Marz, 29 Oct 2026):
1. **Join players first.** A new player goes to a patch where an active player (seen in the last 7 days) lives and a Grassland spot is free, up to **4 players per patch** (`world.playersPerPatch`; a patch has exactly 4 Grassland spots). The patch with the fewest players wins, so lone players get neighbours first. Ties go to the patch with the weakest leader, since a newcomer faces a smaller wild nest there, then to world order.
2. **Otherwise open a new patch beside the last one:** the next patch without players after the newest player's home, in world order (region by region). New patches grow side by side, so neighbours are close. A patch that holds only wild things (Build 9) counts as empty.
3. **Otherwise** any patch with a free Grassland spot.

- Existing players and colonies keep their places.
- Terrain at start: always **Grassland** (no modifiers) to keep the first experience even.

## Wild nests and other wild things
Every patch with players, and every patch within 2 of one, holds a **wild nest** (a rival colony of another ant species on a non-Grassland spot) and an **aphid herd** on a wild site. Termite mounds (about one per 5 patches) and spider dens (one per 10) sit on their own wild sites nearby. All of them appear when a player first arrives nearby. See [17-wild-nests](17-wild-nests.md) and [23-npcs](23-npcs.md).

## Missions screen: the patch and the world
Since Build 7 the map lives in the **Missions** tab (the separate Map tab is gone). It opens on **your own patch**, drawn. Tap a spot to scout, raid, send or forage from it, and the send form below fills in the target. Colonies you haven't scouted show as **scents** ([22-discovery](22-discovery.md)). **World** opens the region grid to look at other patches; **Back to my patch** returns.

- **Regions:** a tab per region by name, and under it a 10×10 grid of the region's 100 patches. A patch is marked only by whether colonies live there (and which one is yours), never by names or strength, so players can find each other without the grid advertising targets. Tap a patch to go there.
- **The patch:** a picture of its ground, with the spots laid out on their terrain bands (sunny meadow 1–2, sandy soil 3–4, grassland 5–8, rotting log 9–10, creek bank 11–12, the wilds at the edge, holding any wild sites). A known colony is an entrance mound with a flag: yours in honey, wild nests in red, other players in amber. A colony you haven't scouted is a rising **scent** in the same colours, with no mound or name. Corpse fields lie on the ground; parties on the way show a marker on the spot.
- **Nearest colony:** buttons on both sides of the patch jump to the next patch, going backwards or forwards through the world, that holds another player's colony. Wild nests don't count, since every inhabited patch has one.
- **A spot:** tapping it opens a card with the colony name, owner, points and status (inactive, protected), or the wild nest's species and level, plus the actions (Scout, Raid, Send, Forage, Haul, Relocate). On a scent the card says only whose ants it smells of (or, for a familiar scent, who came at you and when), and Raid and Send are greyed out: "Scout this scent first".
- **Seeing inside takes a scout.** The map only shows the mound. The card shows your latest scout report on that colony and how old it is: what was in the stores, and, as the report's detail allows, the army, the defences and the chambers with their levels.

## Open Questions
- Should corpse fields be visible to everyone on the map, or only to scouts? Proposal: visible to everyone (creates races).
