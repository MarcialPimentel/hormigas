# 04 — Colony

**Version:** 0.3
**Data:** [`data/chambers.json`](data/chambers.json), [`data/terrain.json`](data/terrain.json), [`data/nest-events.json`](data/nest-events.json)

## Colony basics
- A colony is one nest at one world coordinate (see [11-world](11-world.md)).
- Players start with one colony; more are founded by sending a **Winged Queen** on a nuptial flight (see [19-colonies](19-colonies.md)).
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
- One chamber construction per colony at a time.
- **Dig plan** (from Queen's Chamber 4): while a dig is under way, you can plan **one** more behind it. Numbers in [`data/formulas.json`](data/formulas.json) (`digPlan`).
  - A planned dig costs nothing until it starts. It starts, and is paid for, the moment the diggers are free and the stores can pay, offline too. If they can't pay yet, it waits, and the Chambers screen says what for and for how long.
  - Planning the same chamber again counts the dig in progress (Leaf Garden 12 under way → plan Leaf Garden 13). Space is reserved for both.
  - A planned Brood Hall waits for the units being raised; a planned Pheromone Chamber waits for the research.
  - Cancelling the dig in progress moves the planned dig up. Removing a planned dig refunds nothing, because nothing was paid.
  - Refused at planning time: no dig in progress (dig it now instead), plan already full, chamber locked, no space, or a cost bigger than storage.
  - Why one slot, unlocked mid-game, paid at start: it covers a night's sleep or a workday (pillar 1) without letting anyone plan a week ahead, so check-ins still matter ([01-core-loop](01-core-loop.md)). Early digs take minutes and the game is meant to be hands-on then. Paying at start means the plan can't hide resources from raids, and full storage still nudges you to come back. Never sold ([14-monetization](14-monetization.md)).
- Brood Hall can't produce units while it is itself being upgraded.
- Pheromone Chamber can't research while being upgraded.
- Cancelling refunds 100% in MVP (tune later).

## Terrain
Terrain is determined by the colony's spot in a patch. **Every ground has one strength and one weakness** (Marz, 1 Nov 2026), each from how real ants live there (pillar 4), plus its space.

| Terrain | Spots | Space | Strength | Weakness |
|---|---|---|---|---|
| Sunny Meadow | 1–2 | 120–150 | Foliage +20% (sun-warmed leaves) | Nectar −10% (dry, few aphids) |
| Sandy Soil | 3–4 | 160–200 | Digs 20% faster (sand digs easily and deep) | Defenses 15% weaker (sand walls crumble) |
| Grassland | 5–8 | 160–200 | Biggest nest | No food bonus |
| Rotting Log | 9–10 | 140–170 | Protein +20% (full of insects) | Digs 15% slower (wood is slow to chew) |
| Creek Bank | 11–12 | 120–150 | Nectar +25% (aphids on the reeds) | Foliage −10% (damp, leaves rot) |

- The weaknesses sit on a different axis from the strengths where it makes a real choice: a Sandy Soil colony out-builds Grassland far from rivals, but on a border its walls let it down.
- **Defenses** on Sandy Soil: all three combat stats of the colony's defenses −15%, added to Formic Acid's bonus. Only player colonies; wild nests on that ground keep their own tuning ([17-wild-nests](17-wild-nests.md)). The battle preview counts it.
- **Space** is rolled once, when a colony is founded. When Sandy Soil's range went up from 140–170, existing Sandy Soil colonies got +20 (migration 014).
- Every player starts on Grassland, so first experiences stay even ([11-world](11-world.md#starting-placement)).
- The spot card shows the strength in green, the weakness in red and the space; the Colony screen shows them on the ground's name.

Choosing where to found a colony is a meaningful strategic choice.

## Nest events
Small, rare surprises inside the nest, so a check-in isn't always exactly what you left (pillars 1 and 4). Numbers in [`data/nest-events.json`](data/nest-events.json).

- **About once a day** per colony (every 16–32 h at world speed ×1, ÷ world speed), offline too. Each colony has one pending `nest_event` in the event queue; it re-arms itself after firing.
- **Only good or harmless.** Risk stays in forage, where the player chose it; a random loss with no counterplay feels bad in an idle game (pillar 2).
  - Gifts: a lost beetle (Protein), an aphid boom (Nectar), a gust of leaves (Foliage). Each is **about an hour of that resource's production** (at least 40), never into full storage: a full resource's gifts are skipped, and a gift is capped to what fits.
  - Harmless moments: rain drumming on the soil, a neighbouring nest's nuptial flight, diggers breaking into an old empty tunnel. Flavour only.
- Each event files a report with flavour text, and plays a short animation in the Nest View if the game is open.
- **Inactive players get none** (same rule as raids: 7 days without logging in), so abandoned colonies don't pile up free loot. The timer keeps running.
- About +4% income over a day. Not power, and the same for everyone (pillar 3).

## Open Questions
- ~~Spots 3–4 felt like only negatives~~ Decided 2026-11-01: every ground has one strength and one weakness (see Terrain; idea [#119](https://github.com/MarcialPimentel/hormigas/issues/119)).
- ~~Should the chamber queue grow?~~ Decided 2026-10-30: a dig plan of one, unlocked by Queen's Chamber 4, paid when it starts (see Build rules). A second slot later, through research, only if playtests show one isn't enough. Never sold.
- Do we want a visible penalty for destroyed chambers? Proposal: no — chambers can't be destroyed in v0.1.
