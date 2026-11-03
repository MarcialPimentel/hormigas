# Hormigas: notes for AI agents

A browser-based, persistent idle-strategy game about growing an ant kingdom, in the spirit of OGame's offline progression but without pay-to-win.

**Read the design doc before any design or code decision** ([`docs/00-vision.md`](docs/00-vision.md), then the system doc for the area) and check every change against its **design pillars**. Every doc and its role: [`docs/README.md`](docs/README.md).

## How Marz works

Marz (the repo owner) designs and playtests; he doesn't write code. Agents write the code. Give him honest critique, including when an idea weakens a pillar, with a recommendation; he makes the final call. Record his decisions in the Decision Log in `docs/00-vision.md` (and in the system doc they touch).

## Workflow

- Work on a branch, never on `main` (it is production). Open a PR with a plain-language summary and **playtest steps**.
- Marz playtests and says "merge #N": merge only that PR. Never push to `main` directly.
- Add each build to [`CHANGELOG.md`](CHANGELOG.md) and update the roadmap's build status (`docs/15-roadmap.md`).

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
- Hosting: one small cloud server running Docker Compose (Caddy → `hormigas` container → Postgres), defined in `deploy/`. Full details and the runbook are in `docs/DEPLOY.md`.
- **Exactly one server instance.** The event loop and WebSocket push assume a single process.
- **Migrations run on startup against the live world.** Write them to be safe on existing data. Never drop or rewrite player data without a plan, and back up first (`./backup.sh` on the server).
- World speed is fixed when a world is created (production ×1). Changing `WORLD_SPEED` does nothing to an existing world.
- **Never commit secrets or private infrastructure details:** no IP addresses, passwords, `.env` files, private keys or key file paths. GitHub secrets hold `DROPLET_HOST` and `DROPLET_SSH_KEY`; real passwords live only in the server's `.env`. Marz keeps the private details (server address, folders, users, DNS, SSH keys, access steps) in git-ignored notes (`CLAUDE.local.md` § Hosting (private)) and shares them in sessions that need server access.

## Ship and build notes

_Read by the `ship`, `next-build` and `prod-run` skills, which keep no per-game notes of their own. Keep this section current when the deploy or build process changes._

### Shipping (merge, deploy, live check)

- **Default branch:** `main`. **Merge style:** squash.
- **Deploy:** "CI" (`ci.yml`) runs on push to `main`; when it succeeds, "Deploy" (`deploy.yml`, a `workflow_run` trigger) builds the Docker image, pushes it to GHCR and restarts the app on the DigitalOcean droplet. So wait for CI on the merge commit, then for the Deploy run that follows it (`gh run list --workflow deploy.yml --limit 3`, pick the one whose `headSha` is the merge commit).
- **Live check:** `curl -s https://hormigas.marz.gg/api/health` must return `{"ok":true}`. The health endpoint has **no build number**, so the proof that the new code is live is: the Deploy run for the merge commit succeeded **and** health is ok afterwards. Say so in the report ("deploy succeeded and the server is healthy; the server doesn't report its build, so I can't confirm the exact version from outside").
- **Playtest link:** https://hormigas.marz.gg

### Planning and building the next build

- **Where the next build comes from:** issues labelled `build`, titled "Build N: …" (the lowest-numbered open one that hasn't shipped). Each build issue says how it works, e.g. "starts with the screen audit (sub-issue); Marz picks which items make the build". Other candidates are issues labelled `status: planned` or `status: accepted`; `status: idea` / `discussing` / `parked` need Marz's yes first, and never build `status: rejected`. Build issues have sub-issues holding the actual items (list them with the `sub_issues` API). `docs/15-roadmap.md`'s "Suggested build order" and `docs/16-milestones.md` are the historical MVP plan (M1–M9, all built); use them only for background.
- **Playtest feedback** lives in the game's admin Feedback screen (in the database), which you can't read. Ask Marz to check it under "Your side".
- **Check:** past build PRs closed the sub-issues but not the build issue itself (#28, #29 stayed open after #36, #37). A build issue whose sub-issues are all closed and whose PR merged is done: offer to close it. New build PRs must say `Closes #<build issue>` too.
- **Branch / PR:** `build/<n>-<slug>`, one PR for the build (it ships as a single deploy), one commit per issue, `Closes #N` for the build issue and each included issue. PR title `Build N: <name>`. Squash-merged.
- **Before the PR:** `npm run typecheck` and `npm test` (needs the database: `docker compose up -d`). For anything touching pacing, timers or the economy, also `npm run sim`.
- **Docs in the same PR:** the matching numbered design doc in `docs/` (e.g. `03-economy.md`), and the build issue's test checklist written out in the PR.
- **Watch for:** never commit secrets or server details (no IPs, `.env`, key paths).
