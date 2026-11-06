# 07 — Research (Instinct Tree)

**Version:** 0.2
**Data:** [`data/research.json`](data/research.json)

## Concept
Research represents the colony evolving new instincts. It happens in the **Pheromone Chamber** and is **account-wide** (all colonies benefit). One research at a time per account.

## What research costs: Protein and Nectar
**Research pays mostly in Protein and Nectar** (Marz, 5 Nov 2026; `formulas.json` → `cost.researchSplit`). Each research level's listed total (Foliage + Protein + Nectar in `research.json`, doubled per level) is split by its branch's ratio, Foliage : Protein : Nectar:

| Branch | Ratio | Why |
|---|---|---|
| Jaws | 1 : 2 : 1.5 | Fighters have battle Protein |
| Nest, Harvest | 1 : 1.75 : 1.75 | Even |
| Scent | 1 : 1.75 : 2 | Pheromones lean sweet |

- **Examples:** Nurse Workers 1 costs 620 / 1,090 / 1,090 (it was 800 / 2,200 / 200). Nuptial Flight 1 costs 3,560 / 6,220 / 6,220 (it was 4,000 / 14,000 / 2,000), and each level doubles it.
- **Why:** colonies earn about 60% Foliage, 30% Protein and 10% Nectar, and chambers, troops and defenses all cost close to that. Research was the outlier at 62% Protein after the 30 Oct swap (below), so players sat on Foliage while Protein ran out, and few reached their first Nuptial Flight (14,000 Protein). Now each resource has a job: **Foliage builds** (chambers, defenses, troops), **Protein raises ants** and feeds research, **Nectar powers research and travel**, and it's the resource worth fighting over on the map (herds, honeypot nests, figs).
- **It comes with more Nectar:** Aphid Pastures make 2.5× the Nectar (base 10 → 25), and mission fuel was re-priced so it still costs the same hours of Nectar ([03-economy](03-economy.md#mission-fuel)). Without that, Nectar would become a wall.
- **Hours to save up** (an engaged colony on day 3, pacing sim): Nuptial Flight 1 about 7.7 h (was 12.8 h), the whole tree at level 1 about 77 h (was 118 h). Protein and Nectar now run out at about the same point.
- **Research time and points don't change:** both still come from the listed cost in `research.json`, so the split never makes research slower and nobody's points (or wild-nest levels) jump.
- Per-item flavour is gone within a branch (Chitin was all Foliage). If that's missed, blend each item's own mix with the branch ratio.
- **Replaced:** from 30 Oct to 5 Nov 2026 research paid half its Nectar in Protein at 3 : 1, to soak up battle Protein while Nectar was the bottleneck. A research already running keeps what it paid; cancelling it refunds exactly that.

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
| **Rescue** (Build 20) | Jaws | Pher 4, Chitin 2, Guard Formation 2 | After every attack you send, 5% of your fallen per level come home alive (max 3) |
| **Foraging Instinct** | Harvest | Pher 3 | +1 forage slot **in each colony** every 2 levels; better forage outcomes |
| **Group Hunting** | Harvest | Pher 3, Mandibles 1, Pheromone Trails 2 | +5% Protein from Hunting Grounds per level |
| **Aphid Husbandry** | Harvest | Pher 3 | +5% Nectar per level from Aphid Pastures, and (Build 20) on the honeydew your tenders bring home from wild aphid herds |
| **Fungus Farming** | Harvest | Pher 3, Aphid Husbandry 2 | +5% Foliage from Leaf Gardens per level |
| **Recruitment Trails** (Build 20) | Harvest | Pher 4, Foraging Instinct 1, Pheromone Trails 2 | Windfall holders carry a load home 10% sooner per level (max 3) |
| **Trophallaxis** (Build 20) | Harvest | Pher 4, Aphid Husbandry 3 | Trade trails stay open one more day per level (max 2) |
| **Repletes** | Harvest | Pher 5, Aphid Husbandry 4, Fungus Farming 2 | +10% storage per level |
| **Brood Science** | Nest | Pher 1 | Major Soldier and Acid Sprayer (1), Hauler (2, with Brood Hall 4); max 2 |
| **Nurse Workers** | Nest | Pher 3, Brood Science 1 | Units raised 5% faster per level (max 6) |
| **Deep Digging** | Nest | Pher 4 | +5 space per level in all colonies |
| **Tunnel Engineering** | Nest | Pher 4, Deep Digging 2 | Chambers dug 5% faster per level (max 6); level 1 also opens the Narrow Tunnel defense |
| **Necrophoresis** (Build 20) | Nest | Pher 3, Brood Science 1 | Corpse fields from your fights start rotting 12 h later per level (max 2) |
| **Nuptial Flight** | Nest | Pher 3 | Unlocks the Winged Queen; +1 colony per level ([19-colonies](19-colonies.md)) |
| **Pheromone Trails** | Scent | Pher 1 | +10% unit speed per level |
| **Colony Mind** | Scent | Pher 1 | +1 mission slot per level |
| **Scent Reading** | Scent | Pher 2 | Better scouting reports; harder to scout |
| **Tandem Running** | Scent | Pher 4, Colony Mind 2, Pheromone Trails 2 | Research 5% faster per level (max 6) |
| **Chemical Mimicry** | Scent | Pher 4, Scent Reading 3 | Each level halves the chance your scouts are spotted (max 3) |
| **Social Stomach** (Build 20) | Scent | Pher 4, Pheromone Trails 3, Colony Mind 1 | Every mission burns 5% less Nectar fuel per level (max 5) |
| **Supercolony** | Nest | Pher 3, Nuptial Flight 1, Colony Mind 1 | Found or join a supercolony (max 1; [23-supercolonies](23-supercolonies.md)) |
| **Symbiosis** | Harvest | Pher 5, Aphid Husbandry 3, Chemical Mimicry 1 | Allies (max 4): Carrion Beetle (1), Assassin Bug (2), Bullet Ant (3), Rhinoceros Beetle (4). Playable since Build 11 |
| **Instincts** (6) | Jaws | the same research as their caste | +5% attack and health per level for one caste only, max 10 ([05](05-castes-units.md#instincts-build-11)) |

### Research for the missions you run (Build 20)
Marz, 6 Nov 2026 ([#220](https://github.com/MarcialPimentel/hormigas/issues/220)): research should deepen the missions players already run rather than add new missions. Before this build raids, forage, scouting and founding had research behind them; corpse hauling, windfalls, aphid herds, trade trails and fuel had none. Each effect shows where it applies, so a player can see why a mission went better (pillar 5). Details and the ant behaviour: [21-tech-tree](21-tech-tree.md#research-for-the-missions-you-run-build-20).

| Mission | Research that helps it |
|---|---|
| Raid (and joint raids) | Mandibles, Chitin, Guard Formation, Instincts, Raiding Columns, **Rescue** |
| Scout | Scent Reading, Chemical Mimicry |
| Forage | Foraging Instinct |
| Found Colony | Nuptial Flight |
| Claim windfall | **Recruitment Trails** |
| Tend aphids | **Aphid Husbandry** (now also on herds) |
| Haul corpses | **Necrophoresis** |
| Trade trail | **Trophallaxis** |
| Every mission | Pheromone Trails (speed), Colony Mind (slots), **Social Stomach** (fuel) |

Transports, relocations and Hold Position still have none of their own beyond speed, slots and fuel.

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
