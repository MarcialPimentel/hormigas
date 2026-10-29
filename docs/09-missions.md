# 09 — Missions

**Version:** 0.1
**Data:** [`data/formulas.json`](data/formulas.json)

## General rules
- Missions travel between coordinates; travel time depends on distance and the **slowest** unit.
- Every mission consumes **Nectar** (fuel) up front.
- Number of simultaneous missions is limited by **mission slots** (base 2, + Colony Mind research).
- Missions can be **recalled** while outbound; they turn around immediately.

## Mission types
| Mission | MVP | What it does |
|---|---|---|
| **Raid** | ✅ | Attack a colony; loot on win |
| **Scout** | ✅ | Send Scouts to gather a report on a colony, or to survey the wilds (below) |
| **Transport** | ✅ | Move resources to any colony; units return |
| **Relocate** | ✅ | Move units + resources to one of your own colonies; units stay |
| **Haul Corpses** | ✅ | Collect a corpse field (Workers / Carrion Beetles) |
| **Forage** | ✅ | Expedition into the wilds (below) |
| **Found Colony** | ✅ | A Winged Queen (plus escorts and cargo) founds a new colony at an empty spot ([19-colonies](19-colonies.md)) |
| **Hold Position** | ✅ | Station soldiers at a supercolony mate's colony; they fight in its battles until recalled ([23-supercolonies](23-supercolonies.md)) |
| **Joint Raid** | v1 | Several supercolony members raid together (alliances stage B) |

## Scout before you raid
Raids and transports need a target you have scouted. A colony you haven't is a **scent** on the map, and the game refuses with "Scout this scent first" ([22-discovery](22-discovery.md)). Scouting is always allowed. Targets are picked by tapping them on the patch at the top of the Missions tab; typing coordinates is still possible behind **Enter coordinates**.

## Forage expeditions (the PvE "slot machine")
Sent to the wild edge of a patch (spot 13). Outcome rolled on arrival:

| Outcome | Base chance | Result |
|---|---|---|
| Food cache | 35% | Foliage / Protein / Nectar, scaled by cargo & research |
| Dead beetle | 15% | Large Protein haul |
| Nothing | 20% | Flavor text only |
| Lost the trail | 10% | Returns late (+50% travel time) |
| Shortcut | 5% | Returns early |
| Spider ambush | 10% | Small PvE battle |
| Rainstorm | 4% | Loses 20–50% of the party |
| The Boot | 1% | Whole party lost |

Foraging Instinct research shifts odds toward good outcomes. Every result has short flavor text — this is where the game's personality shows.

- **The first expedition always finds food.** A player's first party to reach the wilds rolls a Food cache worth at least 70% of what it can carry, and loses nobody. Sending foragers is a founding task, so it has to land well; the gamble starts with the second trip. A recalled party doesn't use up the guarantee.
- **Players see the cap.** One party never brings home more than `(3,000 + 25 × points) × (1 + 10% per Foraging Instinct level)` (`forageFindCap`). The forage screen says that number, how many Workers (1,500 cargo each) it takes to carry it, and whether the party being sent can carry it all.
- **The report arrives before the food.** The find is rolled when the party reaches the wilds, so the report says "On the way home, arriving HH:MM"; the food lands in the stores when the party gets home.
- **Players see the odds.** The forage screen shows the chances after Foraging Instinct, grouped as finds food / back early / comes back empty / loses ants, with every outcome one tap away. A flop should read as bad luck, not a bug.

## Surveying the wilds
Scouts can scout the wilds of any patch, not only colonies. A survey always succeeds and the Scouts come home. The report shows:
- the forage odds there and the largest find a party could bring back;
- how many other colonies live in the patch, and how many are inactive;
- how much Protein is lying around in corpse fields.

It gives Scouts a job that doesn't depend on neighbors, and lets a player in an empty patch finish the founding tasks. NPC nests (planned) will give empty patches something to scout and raid as well.

## Army saving (the core skill)
Units at home are at risk while you're offline. The counter-play is sending your army on a long Transport/Relocate/Forage mission timed to return when you're back. The UI should support this directly:
- **"Return at…"** time picker on the mission screen (auto-calculates speed %).
- Speed slider (10%–100%) — slower = less fuel, longer trip.

## Open Questions
- Should Forage roll events by terrain (creek → rainstorm more likely)?
- Can missions be sent at reduced speed to save Nectar? Proposal: yes, fuel scales with speed².
