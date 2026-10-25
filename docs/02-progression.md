# 02 — Progression

**Version:** 0.1
**Data:** [`data/formulas.json`](data/formulas.json)

## Goal
Follow an **incremental-game curve**: lots to do early, steadily shifting to planning and waiting. Every phase should still have active choices (see [01-core-loop](01-core-loop.md#what-the-player-does-while-waiting-anti-dead-air)).

## Pacing targets (what playtests must hit)
| Phase | Real time | Typical timer | Player experience |
|---|---|---|---|
| Founding | First 10 min | 5–60 s | Upgrade every few seconds. Guided quest chain. First castes. |
| Early | First day | 1–20 min | All basic chambers unlocked. First foraging & scouting. Can see neighbors. |
| Growth | Days 2–7 | 20 min – 4 h | First raids (given and received). Research choices. Second colony. |
| Established | Week 2+ | 4 h – 2 days | Long-term planning, timing raids, defense layering, rankings. |

These targets are the acceptance criteria for balance. If playtests drift, tune `data/` numbers until they match.

## Curves
All costs and times are exponential by level. Values below are defaults; per-item values live in data files.

- **Cost:** `cost(L) = base × factor^(L−1)`
  - Production chambers: factor **1.5**
  - Other chambers & research: factor **2.0**
- **Production per hour:** `rate(L) = base × L × 1.1^L` — grows a bit faster than linear, so upgrades always feel worth it, but costs outpace it.
- **Build time (seconds):** `t = (foliage + protein) / (2.5 × (1 + excavationLevel)) / worldSpeed`
  - **Founding boost:** levels 1–3 of any chamber take ×0.25 time. Minimum 5 s.
- **World speed:** 1 for the main world. Test worlds can run ×5–×20.

Why exponential: costs rising faster than production is what moves the player from "click constantly" to "plan and wait" naturally, without hard gates.

## Unlock order (first pass)
1. Queen's Chamber L1 (start) → Leaf Garden, Hunting Grounds, Nursery
2. Queen's Chamber L2 → Granary, Larder, Brood Hall (castes: Worker, Minor Soldier, Scout)
3. Queen's Chamber L3 → Pheromone Chamber (research), Aphid Pasture, Nectar Cellar
4. Brood Hall L2 + research → Major Soldier, Hauler, first defenses
5. Queen's Chamber L4 → Excavation Works, Honeypot Gallery
6. Research: Nuptial Flight → Winged Queen (second colony)

The **Queen's Chamber** is the master gate: its level unlocks new chamber types, keeping the early UI small and adding options at a steady rate.

## Onboarding quest chain (first 10 minutes)
1. Upgrade Leaf Garden → 2. Build Nursery → 3. Build Hunting Grounds → 4. Upgrade Queen's Chamber → 5. Raise 3 Workers → 6. Send a forage mission → 7. Scout a neighbor.
Each quest rewards a small resource bundle and points at the next UI element. The chain doubles as the tutorial.

## Points & ranking
- 1 point per 1,000 resources spent (all types counted equally in v0.1).
- Rankings: total, economy (chambers), research, military (castes + defenses).

## Open Questions
- Should Nectar count more than Foliage for points (it's rarer)?
- Founding boost: fixed ×0.25 for L1–3, or a smooth curve?
- Is a 2-day timer acceptable late game, or cap at ~24 h?
