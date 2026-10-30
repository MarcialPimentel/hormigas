# 07 — Research (Instinct Tree)

**Version:** 0.2
**Data:** [`data/research.json`](data/research.json)

## Concept
Research represents the colony evolving new instincts. It happens in the **Pheromone Chamber** and is **account-wide** (all colonies benefit). One research at a time per account.

## The tech tree
Since Build 6 research is a **tree**: research can need other research (not only a Pheromone Chamber level), it is grouped into four branches (Jaws, Harvest, Nest, Scent), and some research has a highest level. Full design, the new research and the reasoning: [21-tech-tree.md](21-tech-tree.md).

| Research | Branch | Needs | Effect |
|---|---|---|---|
| **Mandibles** | Jaws | Pher 2 | +10% attack per level, all units & defenses |
| **Chitin** | Jaws | Pher 2 | +10% health per level |
| **Guard Formation** | Jaws | Pher 3 | +10% guard per level |
| **Formic Acid** | Jaws | Pher 4, Mandibles 3, Chitin 2 | Defenses +10% attack, guard, health per level |
| **Raiding Columns** | Jaws | Pher 5, Mandibles 5, Guard Formation 3, Pheromone Trails 4 | Winning raids take +5% of unprotected stores per level (max 3) |
| **Nest Plugging** | Jaws | Pher 5, Chitin 4, Guard Formation 4 | +25% protected storage per level |
| **Foraging Instinct** | Harvest | Pher 3 | +1 forage slot every 2 levels; better forage outcomes |
| **Group Hunting** | Harvest | Pher 3, Mandibles 1, Pheromone Trails 2 | +5% Protein from Hunting Grounds per level |
| **Aphid Husbandry** | Harvest | Pher 3 | +5% Nectar from Aphid Pastures per level |
| **Fungus Farming** | Harvest | Pher 3, Aphid Husbandry 2 | +5% Foliage from Leaf Gardens per level |
| **Repletes** | Harvest | Pher 5, Aphid Husbandry 4, Fungus Farming 2 | +10% storage per level |
| **Brood Science** | Nest | Pher 1 | Major Soldier and Acid Sprayer (1), Hauler (2); max 2 |
| **Nurse Workers** | Nest | Pher 3, Brood Science 1 | Units raised 5% faster per level (max 6) |
| **Deep Digging** | Nest | Pher 4 | +5 space per level in all colonies |
| **Tunnel Engineering** | Nest | Pher 4, Deep Digging 2 | Chambers dug 5% faster per level (max 6); level 1 also opens the Narrow Tunnel defense |
| **Nuptial Flight** | Nest | Pher 3 | Unlocks the Winged Queen; +1 colony at levels 1, 3, 5… ([19-colonies](19-colonies.md)) |
| **Pheromone Trails** | Scent | Pher 1 | +10% unit speed per level |
| **Colony Mind** | Scent | Pher 1 | +1 mission slot per level |
| **Scent Reading** | Scent | Pher 2 | Better scouting reports; harder to scout |
| **Tandem Running** | Scent | Pher 4, Colony Mind 2, Pheromone Trails 2 | Research 5% faster per level (max 6) |
| **Chemical Mimicry** | Scent | Pher 4, Scent Reading 3 | Each level halves the chance your scouts are spotted (max 3) |
| **Supercolony** | Nest | Pher 3, Nuptial Flight 1, Colony Mind 1 | Found or join a supercolony (max 1; [23-supercolonies](23-supercolonies.md)) |

## Later research
| Research | Branch | Needs | Effect |
|---|---|---|---|
| **Symbiosis** | Harvest | Pher 5, Aphid Husbandry 3, Chemical Mimicry 1 | Unlocks ally species (beetles, bullet ants) |

## Scouting detail by Scent Reading difference
`diff = yourScentReading − theirScentReading + (scouts sent − 1) / 2` (rounded down). Scent Reading counts through its `scoutLevel` effect; the 2 and the thresholds below are in `formulas.json` → `scouting.detail`.
| diff | Report shows |
|---|---|
| < 0 | Resources only |
| 0–1 | + Units |
| 2–3 | + Defenses |
| 4+ | + Chambers & research |

## Open Questions
- ~~Should research have branch choices (pick A or B), or stay a flat tree in MVP?~~ Decided 2026-10-29: four branches, no exclusive choices; everyone can learn everything, the choice is the order ([21-tech-tree.md](21-tech-tree.md)).
- ~~Account-wide research with one queue — or per-colony research?~~ Decided: account-wide, one at a time.
- Open tech-tree questions live in [21-tech-tree.md](21-tech-tree.md#open-questions).
