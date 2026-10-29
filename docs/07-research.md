# 07 — Research (Instinct Tree)

**Version:** 0.1
**Data:** [`data/research.json`](data/research.json)

## Concept
Research represents the colony evolving new instincts. It happens in the **Pheromone Chamber** and is **account-wide** (all colonies benefit). One research at a time per account.

## MVP research
| Research | Effect | Category |
|---|---|---|
| **Mandibles** | +10% Attack per level, all units & defenses | Combat |
| **Chitin** | +10% Health per level | Combat |
| **Guard Formation** | +10% Guard per level | Combat |
| **Pheromone Trails** | +10% unit speed per level | Movement |
| **Scent Reading** | Better scouting reports; harder to scout | Intel |
| **Colony Mind** | +1 mission slot per level | Utility |
| **Foraging Instinct** | +1 forage expedition slot every 2 levels; better forage outcomes | Utility |
| **Brood Science** | Unlocks advanced castes (Major Soldier, Hauler) | Unlock |
| **Deep Digging** | +5 space per level in all colonies | Utility |
| **Nuptial Flight** | Unlocks the Winged Queen; +1 colony at levels 1, 3, 5… ([19-colonies](19-colonies.md)) | Expansion |

## v1 research
| Research | Effect |
|---|---|
| **Aphid Husbandry** | +Nectar production; unlocks aphid herding |
| **Symbiosis** | Unlocks ally species (beetles, bullet ants) |
| **Supercolony** | Unlocks supercolonies (alliances) and joint raids |

## Scouting detail by Scent Reading difference
`diff = yourScentReading − theirScentReading + (scouts sent − 1) / 2` (rounded down)
| diff | Report shows |
|---|---|
| < 0 | Resources only |
| 0–1 | + Units |
| 2–3 | + Defenses |
| 4+ | + Chambers & research |

## Open Questions
- Should research have branch choices (pick A or B), or stay a flat tree in MVP?
- Account-wide research with one queue — or per-colony research? Proposal: account-wide.
