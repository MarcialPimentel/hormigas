# 15 — Roadmap

**Version:** 0.1

## Guiding rule
Keep the MVP **brutally small**. Its only job is to answer: *is the core loop fun?*

## MVP — "Does the loop work?"
**Content**
- One world, one species.
- Chambers: Queen's Chamber, Leaf Garden, Hunting Grounds, Nursery, Granary, Larder, Brood Hall, Pheromone Chamber, Aphid Pasture, Nectar Cellar, Excavation Works, Honeypot Gallery.
- Castes: Worker, Minor Soldier, Major Soldier, Scout, Hauler.
- Defenses: Soil Wall, Pit Trap, Acid Sentry.
- Research: Mandibles, Chitin, Guard Formation, Pheromone Trails, Scent Reading, Colony Mind, Foraging Instinct, Brood Science, Deep Digging.
- Missions: Raid, Scout, Transport, Relocate, Haul Corpses, Forage.
- PvP rules: new-colony protection, strength protection, bash limit, Honeypot protection, Late Founding Boost (catch-up).
- One colony per player.
- Wild nests: one NPC colony per patch with players, raidable, raiding back gently ([17-wild-nests](17-wild-nests.md)).

**Systems**
- Accounts & login
- Compute-don't-tick economy + event queue
- Combat + battle reports + in-game battle preview
- Map, Overview, Chambers, Brood Hall, Research, Missions, Reports, Rankings
- Simple schematic Nest View
- Browser notifications + tab badges
- Onboarding quest chain
- In-game feedback button (playtest signal)

**Success criteria**
- Playtesters return on their own for 7+ days.
- Pacing matches targets in [02-progression](02-progression.md).
- Being raided doesn't cause testers to quit.

### Suggested build order
1. `/shared` rules + data files (with unit tests for formulas & combat)
2. Server: accounts, colonies, compute-don't-tick, chamber builds
3. Client: Overview + Chambers (playable single-player idle)
4. Research, Brood Hall, units
5. Map, missions, event queue
6. Combat, reports, corpses, battle preview
7. Forage
8. PvP rules, notifications, Nest View, onboarding
9. Playtest with a small group at ×5 world speed

## v1 — "A world worth staying in"
- Multiple colonies (Winged Queen, Nuptial Flight, Found Colony)
- Supercolonies (alliances): chat, joint raids, hold position
- Ally species: Carrion Beetle, Bullet Ant
- Aphid herding (raidable livestock economy)
- More defenses (Narrow Tunnel, Sticky Resin)
- Vacation mode

## Later ideas
- **Species as classes:** Leafcutters (economy), Army Ants (nomadic raiders), Honeypot ants (storage), Weaver ants (defense), Slave-maker ants (steal brood).
- **Seasons:** world lifecycle (spring founding → winter end) with fresh worlds.
- Player trading / market.
- Achievements and cosmetics.
- Illustrated nest art.

## Open Questions
- Is Aphid Pasture needed in MVP, or can Nectar come only from foraging at first?
- Should multiple colonies move into MVP if testers plateau early?
