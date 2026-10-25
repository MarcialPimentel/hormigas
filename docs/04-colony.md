# 04 — Colony

**Version:** 0.1
**Data:** [`data/chambers.json`](data/chambers.json), [`data/terrain.json`](data/terrain.json)

## Colony basics
- A colony is one nest at one world coordinate (see [11-world](11-world.md)).
- Players start with one colony; more are founded via **Nuptial Flight** (Winged Queen caste).
- Research is account-wide; chambers, castes, defenses and resources are per colony.

## Space
- Each chamber level uses **1 space**.
- Max space depends on terrain (see below). Increased by the **Deep Digging** research.
- Space forces specialization: you can't max everything in one colony.

## Chambers
| Chamber | Role | Unlock |
|---|---|---|
| **Queen's Chamber** | Master gate: unlocks chamber types; base income & workforce | Start |
| **Leaf Garden** | Produces Foliage | Start |
| **Hunting Grounds** | Produces Protein | Start |
| **Nursery** | Produces Workforce | Start |
| **Granary** | Foliage storage | Queen L2 |
| **Larder** | Protein storage | Queen L2 |
| **Brood Hall** | Raises castes and defenses; higher level = faster | Queen L2 |
| **Pheromone Chamber** | Research; higher level = faster | Queen L3 |
| **Aphid Pasture** | Produces Nectar | Queen L3 |
| **Nectar Cellar** | Nectar storage | Queen L3 |
| **Excavation Works** | Speeds up chamber construction | Queen L4 |
| **Honeypot Gallery** | Protected storage | Queen L4 |

## Build rules
- One chamber construction per colony at a time (queue of 1 in MVP).
- Brood Hall can't produce units while it is itself being upgraded.
- Pheromone Chamber can't research while being upgraded.
- Cancelling refunds 100% in MVP (tune later).

## Terrain
Terrain is determined by the colony's spot in a patch and affects space and production.

| Terrain | Spots | Space | Modifiers |
|---|---|---|---|
| Sunny Meadow | 1–2 | 120–150 | Foliage +20%, Nectar −10% |
| Sandy Soil | 3–4 | 140–170 | Easy digging: build time −10% |
| Grassland | 5–8 | 160–200 | No modifiers |
| Rotting Log | 9–10 | 140–170 | Protein +20% |
| Creek Bank | 11–12 | 120–150 | Nectar +25%, Foliage −10% |

Choosing where to found a colony is a meaningful strategic choice.

## Open Questions
- Should chamber queue grow (e.g., a research unlocks queue of 2)? Must never be sold for money.
- Do we want a visible penalty for destroyed chambers? Proposal: no — chambers can't be destroyed in v0.1.
