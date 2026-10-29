# 15 — Roadmap

**Version:** 0.1

## Guiding rule
Keep the MVP **brutally small**. Its only job is to answer: *is the core loop fun?*

## MVP — "Does the loop work?"
**Content**
- One world, one species.
- Chambers: Queen's Chamber, Leaf Garden, Hunting Grounds, Nursery, Granary, Larder, Brood Hall, Pheromone Chamber, Aphid Pasture, Nectar Cellar, Excavation Works, Honeypot Gallery.
- Castes: Worker, Minor Soldier, Major Soldier, Scout, Hauler, Winged Queen.
- Defenses: Soil Wall, Pit Trap, Acid Sentry.
- Research: Mandibles, Chitin, Guard Formation, Pheromone Trails, Scent Reading, Colony Mind, Foraging Instinct, Brood Science, Deep Digging, Nuptial Flight; from Build 6 also Formic Acid, Raiding Columns, Nest Plugging, Group Hunting, Aphid Husbandry, Fungus Farming, Repletes, Nurse Workers, Tunnel Engineering, Tandem Running, Chemical Mimicry.
- Missions: Raid, Scout, Transport, Relocate, Haul Corpses, Forage, Found Colony, Hold Position, Tend Aphids (Build 9).
- PvP rules: new-colony protection, strength protection, bash limit, Honeypot protection, Late Founding Boost (catch-up).
- More colonies (Build 4): Nuptial Flight research, Winged Queen, Found Colony mission ([19-colonies](19-colonies.md)). Moved up from v1.
- Wild nests: one NPC colony per patch with players, raidable, raiding back gently ([17-wild-nests](17-wild-nests.md)).
- Army-ant swarms (Build 5): every colony is visited about every 4 days, 4 h warning, beatable ([20-swarms](20-swarms.md)).
- The tech tree (Build 6): research that needs other research, four branches (Jaws, Harvest, Nest, Scent), ten new research and Aphid Husbandry made playable ([21-tech-tree](21-tech-tree.md)).
- Scents and neighbours (Build 7): the Missions tab shows your patch; unscouted colonies are player or wild scents; scout before you raid; new players are placed together, up to 4 per patch ([22-discovery](22-discovery.md), [11-world](11-world.md)).
- Truces and supercolonies (alliances stage A): meet before you deal; truces with 24 h notice; supercolonies of up to 6 with the Supercolony research; Hold Position; a 3-day scent fade on leaving ([23-supercolonies](23-supercolonies.md)). Moved up from v1.
- Protein sink (Build 8): feed the brood for faster castes; larval digestion turns Protein into Nectar ([03-economy](03-economy.md), [05-castes-units](05-castes-units.md)).
- More wild things (Build 9): wild nests in neighbouring patches, Honeypot and Trap-jaw Ants, aphid herds held by tenders (contested Nectar), termite mounds, a spider-den boss; wild scents hint at what they are ([24-npcs](24-npcs.md)). Aphid herding moved up from v1.
- The colony comes alive (Build 3): the Nest View shows parties, raids, storage, brood, digging and research; while-you-were-away card; small nest events ([12-ui-nest-view](12-ui-nest-view.md), [04-colony](04-colony.md)).

**Systems**
- Accounts & login
- Compute-don't-tick economy + event queue
- Combat + battle reports + in-game battle preview
- Overview, Chambers, Brood Hall, Research, Missions, Reports, Rankings
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
- Supercolonies, stage B: joint raids, trade trails, a members' board (stage A shipped early: truces, supercolonies, hold position)
- Ally species: Carrion Beetle, Bullet Ant
- ~~Aphid herding (raidable livestock economy)~~ (moved up: Build 9)
- Joint raids on spider dens (bosses from [24-npcs](24-npcs.md))
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
