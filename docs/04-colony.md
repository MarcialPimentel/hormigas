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

## Digging Crews (Build 17)
A Nest research (Pher 4, Tunnel Engineering 2, one level) that puts idle Workers to work on the dig. Each **Worker at home when a dig starts** cuts that dig's time by **0.5%**, counting at most **5 Workers per Excavation Works level** (25% off at Excavation Works 10, with 50 Workers). Workers out on missions don't count, and a dig keeps the time it started with, like every other speed-up. It multiplies with Tunnel Engineering (−30% at 6) and the Excavation Works itself. Numbers: `research.json` `digging_crews` (Workers per Excavation level) and `formulas.json` `digCrews` (percent per Worker).

Why: once Media Workers and Haulers arrive, the Worker was a dead caste (see [05-castes-units](05-castes-units.md#the-carrier-ladder-build-17)). Digging is a job no ant had, late-game digs are the longest waits in the game, and keeping Workers home to dig or sending them out to carry is a real choice. It works like the Gardener Minim's Leaf Garden bonus.

## What chambers cost
Numbers live in [`data/chambers.json`](data/chambers.json): `baseCost × costFactor^(L−1)`. Production chambers and the Nursery grow ×1.5–1.6 a level, everything else ×2.

**Foliage builds** ([07-research](07-research.md#what-research-costs-protein-and-nectar) gives each resource its job). Most chambers are paid mostly in Foliage with some Protein, about what colonies earn, and almost none take Nectar, which goes to research and travel. Three exceptions, reviewed on 5 Nov 2026 (Marz):

| Chamber | Before | Now | Why |
|---|---|---|---|
| **Nursery** | staffs 20 × L × 1.1^L | **30 × L × 1.1^L** (cost unchanged) | It had to sit 2–3 levels above the chambers it staffs, took about 40% of all chamber spending and its next level cost 42 hours of income on day 14 (a Leaf Garden: 15). Now it can sit at their level |
| **Nectar Cellar** | 1,000 / 1,000 / 0 | **1,000 / 0 / 1,000** | Storing Nectar cost as much Protein as Foliage (about a million Protein over 40 days) right when Aphid Pastures went ×2.5. Now each store costs Foliage plus what it stores |
| **Pheromone Chamber** | 200 / 400 / 200 | **180 / 310 / 310** | The research building costs like research: Protein and Nectar above Foliage |

- The Cellar and Pheromone Chamber keep their totals, so nobody's points moved. Build time counts only Foliage + Protein, so a Cellar now digs twice as fast and a Pheromone Chamber a little faster.
- The Nursery change speeds the whole economy up by about a third after the first day (pacing sim: Leaf Garden 20 at ~14 days instead of ~21; [16-milestones](16-milestones.md)). Players whose production was held back by workforce got the boost on deploy. If resources pile up too fast, 25 is the gentler setting.

## Build rules
- One chamber construction per colony at a time.
- **Dig plan** (from Queen's Chamber 4): the **dig line** holds two digs: the dig in progress and **one** planned behind it. With idle diggers, both places can hold planned digs that can't start yet, so a chamber you can't afford can still be lined up (Build 15). Numbers in [`data/formulas.json`](data/formulas.json) (`digPlan`; the line is `slots` + 1).
  - A planned dig costs nothing until it starts. It starts, and is paid for, the moment the diggers are free and the stores can pay, offline too. If they can't pay yet, it waits, and the Chambers screen says what for and for how long.
  - **Plan sits next to Dig.** While the diggers are idle and a dig can't start (not enough food, a busy Brood Hall, research running), the Chambers screen and the chamber card offer Plan beside Dig. If it can start right now, it's dug, not planned.
  - Planning the same chamber again counts the dig in progress and earlier planned digs (Leaf Garden 12 under way → plan Leaf Garden 13). Space is reserved for each.
  - A planned Brood Hall waits for the units being raised; a planned Pheromone Chamber waits for the research.
  - Digging something by hand while plans wait jumps the line: the plans wait behind it. Cancelling the dig in progress moves the planned dig up. Removing a planned dig refunds nothing, because nothing was paid.
  - Refused at planning time: a dig that could start right now (dig it now instead), line already full, chamber locked, no space, or a cost bigger than storage.
  - Why a line of two, unlocked mid-game, paid at start: it covers a night's sleep or a workday (pillar 1) without letting anyone plan a week ahead, so check-ins still matter ([01-core-loop](01-core-loop.md)). Early digs take minutes and the game is meant to be hands-on then. Paying at start means the plan can't hide resources from raids, and full storage still nudges you to come back. Never sold ([14-monetization](14-monetization.md)).
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
Small surprises inside the nest, so a check-in isn't always exactly what you left (pillars 1 and 4). Numbers in [`data/nest-events.json`](data/nest-events.json).

- **About one a day** per colony (every 18–30 h at world speed ×1, ÷ world speed), offline too. Was every 16–32 h until 1 Nov 2026, then every 6–12 h until 13 Nov 2026 (too many reports for a player back after a few days away, [00-vision](00-vision.md#decision-log)). Each colony has one pending `nest_event` in the event queue; it re-arms itself after firing.
- **Only good or harmless.** Risk stays in forage, where the player chose it; a random loss with no counterplay feels bad in an idle game (pillar 2).
  - Gifts: a lost beetle (Protein), an aphid boom (Nectar), a gust of leaves (Foliage). Each is **about two hours of that colony's production of that resource** (so it follows the gathering multiplier, [03-economy](03-economy.md#production)), at least 40 × the multiplier (80 now), never into full storage: a full resource's gifts are skipped, and a gift is capped to what fits (the report says so). A young colony's gifts are small because its production is.
  - Harmless moments: rain drumming on the soil, a neighbouring nest's nuptial flight, diggers breaking into an old empty tunnel. Flavour only, and only 15% of events (85% are gifts).
- Each event files a report with flavour text, naming the colony it happened in (title and body), and plays a short animation in the Nest View if the game is open.
- **Inactive players get none** (same rule as raids: 7 days without logging in), so abandoned colonies don't pile up free loot. The timer keeps running.
- About +6% of each resource's daily income (about 2.3 gifts a day, each 2 h of one resource; was about +1%). Not power, and the same for everyone (pillar 3).

## Open Questions
- ~~Spots 3–4 felt like only negatives~~ Decided 2026-11-01: every ground has one strength and one weakness (see Terrain; idea [#119](https://github.com/MarcialPimentel/hormigas/issues/119)).
- ~~Should the chamber queue grow?~~ Decided 2026-10-30: a dig plan of one, unlocked by Queen's Chamber 4, paid when it starts (see Build rules). A second slot later, through research, only if playtests show one isn't enough. Never sold.
- Do we want a visible penalty for destroyed chambers? Proposal: no — chambers can't be destroyed in v0.1.
