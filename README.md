# Hormigas

*Working title.* A browser-based, persistent, idle-strategy game about growing an ant kingdom. Your colony keeps working while you're away, rival colonies raid and scout each other, and every choice is about growth, timing, and risk.

Inspired by the offline-progression loop of classic browser strategy games, without the pay-to-win.

## Status
- **Current build:** Build 11, "The full roster" (2026-10-30). What changed in each build: [CHANGELOG.md](CHANGELOG.md).
- **Live:** https://hormigas.marz.gg. Every merge to `main` that passes CI deploys there automatically.
- **Next:** Build 12, "Reasons to come back". The plan is in the [roadmap](docs/15-roadmap.md); builds are tracked as GitHub issues (there are no GitHub milestones).

## Play it
**https://hormigas.marz.gg**: sign up, found a colony and play. How to playtest and send feedback: [docs/playtest.md](docs/playtest.md).

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
| `npm run combat` | Balance tables from the real combat code (castes, defenses, wild nests) |
| `npm run build` then `npm start` | Production mode: one server on :3000 serving the built client |

## Deploy it
Every merge to `main` that passes CI deploys automatically to a small cloud server. See [docs/DEPLOY.md](docs/DEPLOY.md) for how it works, everyday commands, and how to rebuild the server. The server's reference config files are in [`deploy/`](deploy/).

## Repo layout
```
/docs      ← game design document (start with 00-vision.md)
/docs/data ← numbers: costs, stats, formulas (read by the shared rules package)
/shared    ← TypeScript game rules shared by client and server
/server    ← API, database, event processor (Fastify + PostgreSQL)
/client    ← UI (Vite + React; Three.js 3D nest, PixiJS 2D nest)
```

## Docs
Every doc, its role and whether it's current: **[docs/README.md](docs/README.md)**.

- **Numbers live in `docs/data/`**, reasoning lives in the markdown. If they disagree, the data file wins and the doc gets fixed.
- Each design doc ends with **Open Questions**. Resolve them by editing the doc, not by leaving comments.
- All numbers are **first-pass placeholders** meant to be tuned in playtesting.
