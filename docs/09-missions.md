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
| **Scout** | ✅ | Send Scouts to gather a report |
| **Transport** | ✅ | Move resources to any colony; units return |
| **Relocate** | ✅ | Move units + resources to one of your own colonies; units stay |
| **Haul Corpses** | ✅ | Collect a corpse field (Workers / Carrion Beetles) |
| **Forage** | ✅ | Expedition into the wilds (below) |
| **Found Colony** | v1 | Winged Queen founds a new colony at an empty spot |
| **Joint Raid** | v1 | Several supercolony members raid together |
| **Hold Position** | v1 | Station units at an ally's colony to defend it |

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

## Army saving (the core skill)
Units at home are at risk while you're offline. The counter-play is sending your army on a long Transport/Relocate/Forage mission timed to return when you're back. The UI should support this directly:
- **"Return at…"** time picker on the mission screen (auto-calculates speed %).
- Speed slider (10%–100%) — slower = less fuel, longer trip.

## Open Questions
- Should Forage roll events by terrain (creek → rainstorm more likely)?
- Can missions be sent at reduced speed to save Nectar? Proposal: yes, fuel scales with speed².
