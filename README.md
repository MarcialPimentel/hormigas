# Hormigas

*Working title.* A browser-based, persistent, idle-strategy game about growing an ant kingdom. Your colony keeps working while you're away, rival colonies raid and scout each other, and every choice is about growth, timing, and risk.

Inspired by the offline-progression loop of classic browser strategy games, without the pay-to-win.

## Status
Design phase — **GDD v0.1**. No code yet.

## Repo layout
```
/docs      ← game design document (start with 00-vision.md)
/docs/data ← numbers: costs, stats, formulas (read by the shared rules package)
/shared    ← (planned) TypeScript game rules shared by client and server
/server    ← (planned) API, database, event processor
/client    ← (planned) UI + nest view
```

## Design doc index
| # | Doc | Covers |
|---|---|---|
| 00 | [Vision](docs/00-vision.md) | Pitch, pillars, audience, non-goals |
| 01 | [Core Loop](docs/01-core-loop.md) | Minute / session / day / week loops |
| 02 | [Progression](docs/02-progression.md) | Pacing targets, curves, unlock order |
| 03 | [Economy](docs/03-economy.md) | Resources, production, storage, protection |
| 04 | [Colony](docs/04-colony.md) | Chambers (buildings), space, terrain |
| 05 | [Castes & Units](docs/05-castes-units.md) | Castes, stats, roles |
| 06 | [Defense](docs/06-defense.md) | Nest defenses, rebuild rules |
| 07 | [Research](docs/07-research.md) | Instinct tree |
| 08 | [Combat](docs/08-combat.md) | Battle resolution, counters, loot, corpses |
| 09 | [Missions](docs/09-missions.md) | Raid, scout, haul, forage, etc. |
| 10 | [PvP Rules](docs/10-pvp-rules.md) | Protection, bash limit, catch-up |
| 11 | [World](docs/11-world.md) | Map, coordinates, terrain |
| 12 | [UI & Nest View](docs/12-ui-nest-view.md) | Screens, nest view, notifications |
| 13 | [Tech](docs/13-tech.md) | Stack, architecture, server authority |
| 14 | [Monetization](docs/14-monetization.md) | Fairness principles |
| 15 | [Roadmap](docs/15-roadmap.md) | MVP → v1 → later |

## Doc conventions
- **Numbers live in `docs/data/`**, reasoning lives in the markdown. If they disagree, the data file wins and the doc gets fixed.
- Each doc ends with **Open Questions**. Resolve them by editing the doc, not by leaving comments.
- All numbers in v0.1 are **first-pass placeholders** meant to be tuned in playtesting.
