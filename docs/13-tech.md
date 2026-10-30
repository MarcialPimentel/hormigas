# 13 — Tech

**Version:** 0.1

## Stack
| Layer | Choice |
|---|---|
| Language | **TypeScript** everywhere |
| Client | Vite + React; **Three.js** for the 3D nest (computers, lazy-loaded), **PixiJS** for the 2D nest (phones, fallback) |
| Server | Node.js + Fastify |
| Database | PostgreSQL |
| Realtime | WebSockets (raid incoming, mission updates) |
| Repo | Monorepo: `/shared`, `/server`, `/client`, `/docs` |

## Core principles
1. **Server is the authority.** The client never decides outcomes; it only displays and requests.
2. **Shared rules package.** All formulas (costs, production, travel, combat) live in `/shared` and read `docs/data/*.json`. Client uses them for instant previews; server uses them for truth. That includes the rules for what is allowed: mission types and their fixed rules (`shared/src/missions.ts`: cargo, wilds, slot pool, which units may go, speed steps, return times) and why a chamber, research or brood order is blocked (`shared/src/blockers.ts`). The server refuses with a blocker's `message`; the client greys out the button with its `short` text, so the two can't drift apart.
3. **Compute, don't tick.** No per-second simulation of colonies.
4. **Event-driven.** Everything with a duration is a scheduled event.

## Compute, don't tick
Each colony stores `resources`, `rates`, and `last_updated`. When anything reads or changes a colony:
```
elapsed   = now − last_updated
resources = min(resources + rate × elapsed, storage_cap)
last_updated = now
```
Rates are recalculated whenever a chamber, workforce or research changes. When a research that changes production or storage finishes, the `research_complete` event first brings every colony of that player up to the finishing moment, then saves the new level ([21-tech-tree](21-tech-tree.md)).

## Event queue
- Table `events(id, world_id, type, due_at, payload, status)`.
- Types: `build_complete`, `dig_plan` (the planned dig's look again when it was waiting), `research_complete`, `units_complete`, `mission_arrive`, `mission_return`, `corpse_decay`.
- A worker process picks due events **in `due_at` order** and resolves them.
- When resolving an event that touches a colony, first bring that colony's resources up to the event's `due_at` time (not "now").
- Ordering matters: if a raid and a build complete at the same second, define a strict order (e.g., builds before battles).
- A broken event never blocks the queue or leaves things stuck. A handler that fails is rolled back and its error saved on the event row, then its cleanup (`onEvent(..., { onFail })`) runs: a mission whose arrival fails turns for home with its units and cargo; a failed return closes the mission (units stay on the row so they can be given back by hand). Recurring per-colony events (`nest_event`, `swarm_spotted`, `nest_raid`) use one helper, `recurringColonyEvent` in `server/src/recurring.ts`, which schedules the next one even after a failure. On startup, `repairStuckMissions` turns home outbound missions that lost their arrival event and reschedules lost returns.

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
-- wild nests: colonies.npc (species, level, at) on colonies owned by the world's players.is_npc player
-- nest events (Build 3): one pending events row per player colony, type nest_event, payload {colonyId}; startup re-arms any colony without one
known_colonies(player_id, colony_id, via, first_at, discovered_at, smelled_at)  -- discovery (Build 7): no row = a scent; read through server/src/game/discovery.ts (docs/22-discovery.md)
-- swarms (Build 5): same pattern, type swarm_spotted; the swarm itself is a mission of type 'swarm' owned by the wild player, anchored on the patch's wild nest, starting from spot 13
```

## Security / anti-cheat basics
- Validate every action server-side using shared rules (costs, unlocks, slots).
- Rate-limit actions per account.
- Reject client-sent timestamps; server time only.
- One account per person (terms of service); detect obvious multi-accounting later.

## Hosting
- One small cloud server running Docker Compose: Caddy (HTTPS) → the Hormigas container → Postgres on the same box. Live at https://hormigas.marz.gg. Details in [DEPLOY.md](DEPLOY.md).
- Exactly one server instance. The event worker runs in-process with the API.
- Compute-don't-tick keeps load proportional to *player actions*, not player count.

## Open Questions
- React vs Svelte for the client.
- Auth: email + password, magic link, or OAuth (Google/Discord)?
- Event worker: in-process with the API, or a separate process? Proposal: same process for MVP.
