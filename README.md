# Hormigas

*Working title.* A browser-based, persistent, idle-strategy game about growing an ant kingdom. Your colony keeps working while you're away, rival colonies raid and scout each other, and every choice is about growth, timing, and risk.

Inspired by the offline-progression loop of classic browser strategy games, without the pay-to-win.

## Status
MVP in development — see the [roadmap](docs/15-roadmap.md) and the milestone issues.

## Run it locally

You need **Node.js 22+** and **Docker Desktop** (for the database).

```bash
git clone https://github.com/MarcialPimentel/hormigas.git
cd hormigas
docker compose up -d     # starts PostgreSQL (and creates the test database)
npm install
npm run dev              # server on :3000, client on http://localhost:5173
```

Open **http://localhost:5173**, found a colony, and play. Open a second browser (or a private window) to make a second player.

The world is created on first start at **×5 speed** (set `WORLD_SPEED` in `.env` before the first start to change it; see `.env.example`).
To start over with a fresh world: `docker compose down -v && docker compose up -d`.

### Other commands
| Command | What it does |
|---|---|
| `npm test` | Runs all tests (needs the database running) |
| `npm run typecheck` | Type-checks every package |
| `npm run sim` | Prints the milestone map for an engaged player (`npm run sim -- 5` for ×5) |
| `npm run build` then `npm start` | Production mode: one server on :3000 serving the built client |

## Deploy it
Live at **https://hormigas.marz.gg**. Every merge to `main` that passes CI deploys automatically to a DigitalOcean droplet. See [docs/DEPLOY.md](docs/DEPLOY.md) for how it works, everyday commands, and how to rebuild the server. The server's own config files are in [`deploy/`](deploy/).

## Repo layout
```
/docs      ← game design document (start with 00-vision.md)
/docs/data ← numbers: costs, stats, formulas (read by the shared rules package)
/shared    ← TypeScript game rules shared by client and server
/server    ← API, database, event processor (Fastify + PostgreSQL)
/client    ← UI (Vite + React)
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
| 16 | [Milestone Map](docs/16-milestones.md) | When players hit each milestone, pacing targets |
| 17 | [Wild Nests](docs/17-wild-nests.md) | NPC colonies in every patch: levels, species, raids |
| 18 | [Art Direction](docs/18-art-direction.md) | Look and feel: ants, chambers, palette, the 3D nest |
| 19 | [More Colonies](docs/19-colonies.md) | Nuptial Flight, the Winged Queen and founding a second colony |
| 20 | [Army-Ant Swarms](docs/20-swarms.md) | Raids from the wilds: schedule, warning, sizing, rewards |

## Doc conventions
- **Numbers live in `docs/data/`**, reasoning lives in the markdown. If they disagree, the data file wins and the doc gets fixed.
- Each doc ends with **Open Questions**. Resolve them by editing the doc, not by leaving comments.
- All numbers in v0.1 are **first-pass placeholders** meant to be tuned in playtesting.
