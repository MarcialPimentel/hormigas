# Hormigas: notes for AI agents

A browser-based, persistent idle-strategy game about growing an ant kingdom, in the spirit of OGame's offline progression but without pay-to-win. Marz (the repo owner) reviews; agents write most of the code.

## Stack and layout

TypeScript everywhere, npm workspaces:

- `shared/`: game rules used by both client and server. Reads the numbers in `docs/data/*.json`.
- `server/`: Fastify + PostgreSQL. The API, WebSockets (`/api/ws`), the event loop, and SQL migrations in `server/src/migrations/` (applied automatically on start).
- `client/`: Vite + React. The nest is a Three.js 3D slab on computers (`client/src/components/nest3d/`, loaded only when shown) and a PixiJS 2D nest on phones and as the fallback. In production, the server serves the built client.
- `docs/`: the game design document (start with `00-vision.md`; `13-tech.md` covers architecture).

Core architecture (see `docs/13-tech.md`): the server is the authority. The game computes rather than ticks (resources are derived from `rate × elapsed`), and everything with a duration is a row in the `events` table, resolved in `due_at` order by an in-process event loop.

## Commands

Needs Node 22+ and Docker (for local Postgres).

| Command | What it does |
|---|---|
| `docker compose up -d` | Local Postgres (+ test database) |
| `npm run dev` | Server on :3000, client on http://localhost:5173 (world speed ×5) |
| `npm test` | All tests (needs the database running) |
| `npm run typecheck` | Type-check every package |
| `npm run sim` | Milestone pacing simulation (`npm run sim -- 5` for ×5) |
| `npm run combat` | Balance tables from the real combat code: castes against each other, raids on defenses, fair armies against every wild nest (`-- castes`, `-- defenses`, `-- nests`; `--budget`, `--runs`) |
| `npm run build` then `npm start` | Production mode, one server on :3000 |

Run `npm run typecheck` and `npm test` before calling work done. CI runs both, plus the build, on every push and PR. After changing `castes.json`, `defenses.json`, `npc.json` or `combat.ts`, also run `npm run combat`.

**Local setup notes.** On Marz's PC, Docker Desktop may not be running: start it first, then `docker compose -p hormigas up -d` (from a worktree too, so it reuses the same database volume). To preview in the Claude desktop app, start the `server` and `client` entries in `.claude/launch.json` separately: the preview sets `PORT`, which the game server also reads, so `npm run dev` as one entry puts both on the same port.

## Adding a caste or defense

Mostly a data change in `docs/data/`:
1. `castes.json` / `defenses.json`: stats, cost, `unlock`, `frenzy` (who it strikes again and again), `outnumbers` if it wins by numbers, `role` (castes: worker, soldier, scout, carrier, queen, wild) and `blurb` (the Brood Hall line). Screens group castes by `role`, never by listing ids.
2. Add the id to `CASTE_IDS` / `DEFENSE_IDS` in `shared/src/data.ts`.
3. A picture in `client/src/art/icons.ts` (the type-checker insists).
4. `npm run combat` to see where it lands; `shared/test/castes-triangle.test.ts` and `nests.test.ts` guard the balance. Update `docs/05-castes-units.md` / `06-defense.md`.

A new combat *mechanic* (like the Soil Wall's shield or the Narrow Tunnel's chokepoint) also needs `shared/src/combat.ts`.

## Design-doc conventions

- Numbers live in `docs/data/`; reasoning lives in the markdown. If they disagree, the data file wins and the doc gets fixed.
- Each design doc ends with **Open Questions**. Resolve them by editing the doc, not by leaving comments.
- Numbers in v0.1 are first-pass placeholders for playtest tuning.

## Production: read before touching deploys or the database

- **Live at https://hormigas.marz.gg.** Merging to `main` deploys to players automatically once CI passes (`.github/workflows/deploy.yml`). Treat `main` as production.
- Hosting: one DigitalOcean droplet running Docker Compose (Caddy → `hormigas` container → Postgres), defined in `deploy/`. Full details and the runbook are in `docs/DEPLOY.md`.
- **Exactly one server instance.** The event loop and WebSocket push assume a single process.
- **Migrations run on startup against the live world.** Write them to be safe on existing data. Never drop or rewrite player data without a plan, and back up first (`./backup.sh` on the server).
- World speed is fixed when a world is created (production ×1). Changing `WORLD_SPEED` does nothing to an existing world.
- **Never commit secrets or private infrastructure details:** no IP addresses, passwords, `.env` files, private keys or key file paths. GitHub secrets hold `DROPLET_HOST` and `DROPLET_SSH_KEY`; real passwords live only in `/opt/hub/.env` on the server. Marz keeps the private details (server IP, SSH key names, access steps) in a private Claude doc and will share it in sessions that need server access.
