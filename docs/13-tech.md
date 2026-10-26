# 13 — Tech

**Version:** 0.1

## Stack (proposed)
| Layer | Choice |
|---|---|
| Language | **TypeScript** everywhere |
| Client | Vite + React or Svelte (decide before coding); **PixiJS** for Nest View |
| Server | Node.js + Fastify (or Express) |
| Database | PostgreSQL |
| Realtime | WebSockets (raid incoming, mission updates) |
| Repo | Monorepo: `/shared`, `/server`, `/client`, `/docs` |

## Core principles
1. **Server is the authority.** The client never decides outcomes; it only displays and requests.
2. **Shared rules package.** All formulas (costs, production, travel, combat) live in `/shared` and read `docs/data/*.json`. Client uses them for instant previews; server uses them for truth.
3. **Compute, don't tick.** No per-second simulation of colonies.
4. **Event-driven.** Everything with a duration is a scheduled event.

## Compute, don't tick
Each colony stores `resources`, `rates`, and `last_updated`. When anything reads or changes a colony:
```
elapsed   = now − last_updated
resources = min(resources + rate × elapsed, storage_cap)
last_updated = now
```
Rates are recalculated whenever a chamber, workforce or research changes.

## Event queue
- Table `events(id, world_id, type, due_at, payload, status)`.
- Types: `build_complete`, `research_complete`, `units_complete`, `mission_arrive`, `mission_return`, `corpse_decay`.
- A worker process picks due events **in `due_at` order** and resolves them.
- When resolving an event that touches a colony, first bring that colony's resources up to the event's `due_at` time (not "now").
- Ordering matters: if a raid and a build complete at the same second, define a strict order (e.g., builds before battles).

## Data model sketch
```
worlds(id, name, speed, settings)
players(id, world_id, name, points, last_active, flags)
colonies(id, world_id, player_id, region, patch, spot, terrain, resources..., last_updated)
chambers(colony_id, type, level)
units(colony_id, type, count)
research(player_id, type, level)
missions(id, world_id, player_id, type, origin, target, units, cargo, depart_at, arrive_at, return_at, status)
events(...)
reports(id, world_id, player_id, type, data, created_at, read)
corpse_fields(world_id, region, patch, spot, protein, created_at)
```

## Security / anti-cheat basics
- Validate every action server-side using shared rules (costs, unlocks, slots).
- Rate-limit actions per account.
- Reject client-sent timestamps; server time only.
- One account per person (terms of service); detect obvious multi-accounting later.

## Hosting
- One small DigitalOcean droplet running Docker Compose: Caddy (HTTPS) → the Hormigas container → Postgres on the same box. Live at https://hormigas.marz.gg. Details in [DEPLOY.md](DEPLOY.md).
- Exactly one server instance. The event worker runs in-process with the API.
- Compute-don't-tick keeps load proportional to *player actions*, not player count.

## Open Questions
- React vs Svelte for the client.
- Auth: email + password, magic link, or OAuth (Google/Discord)?
- Event worker: in-process with the API, or a separate process? Proposal: same process for MVP.
