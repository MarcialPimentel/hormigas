# 00 — Vision

**Version:** 0.1

_Current as of Build 11 (2026-10-30). This is the design doc: pitch, fantasy, pillars, non-goals and the Decision Log; each system has its own doc ([index](README.md))._

## Pitch
Hormigas is a browser-based, persistent strategy game where you grow an ant kingdom from a single founding queen. Your colony forages, builds and breeds while you're away. Rival colonies live in the same world: you scout them, raid them, haul away their dead as food, and defend your own nest against them.

## The fantasy
*"I am the will of the colony."* Not a hero, not a general — the collective instinct that decides where tunnels go, which castes to raise, and when to march.

**Tone:** grounded nature documentary. The colony is drawn like a living field guide: real anatomy, bold silhouettes, no cartoon faces. See [18-art-direction.md](18-art-direction.md).

## Design pillars
1. **The colony lives while you're away.** Progress never stops. Coming back should always feel rewarding.
2. **Every loss is recoverable.** Raids sting but never end you. Protected storage, brood, and catch-up rules keep players in the game.
3. **Fair by design.** No pay-to-win. Skill, timing and planning beat spending.
4. **The ant fantasy *is* the mechanics.** Every system maps to real ant behavior (foraging, corpse hauling, castes, pheromone trails). If a mechanic doesn't fit ants, rethink the mechanic.
5. **Readable depth.** Simple rules, deep interactions. The game explains its own systems — no external simulators needed.

## Target player
- Liked classic browser strategy / idle games and want that loop without the pay-to-win.
- Plays in short check-ins (2–10 minutes, several times a day), on desktop or phone browser.
- Enjoys planning, optimizing, and light-to-medium PvP.

## Platform
Browser-first (desktop + mobile browser). No install.

## Non-goals (what we are NOT making)
- Not a real-time action or RTS game. No unit micro.
- Not a pay-to-win or gacha game.
- Not a detailed nest *simulation*: the art shows what the colony is doing, but there's no per-ant simulation or micro-management.
- Not multiple worlds/servers at launch — one world.

## Inspirations
- Classic persistent browser strategy (offline progression, raids, fleetsaving).
- Incremental/idle games (pacing curve: busy early, planning later).
- Real ant biology (castes, foraging, supercolonies, honeypot ants).

## Decision Log
Decisions Marz made, newest first. Details and the smaller calls live in the linked PR and system doc.

| Date | Decision | Why |
|---|---|---|
| 2026-10-30 | 3D direction "the sunlit microcosm": a Garden → Patch → Nest → Chamber scale ladder, real 3D ants, armies at real size (capped); first build is colour and real ants in the slab ([#90](https://github.com/MarcialPimentel/hormigas/pull/90), [18-art-direction](18-art-direction.md#decisions-marz-30-oct-2026)) | Make the world feel alive and readable at every scale |
| 2026-10-30 | The full roster (Build 11): bigger units for variety without copying OGame's combat; beetles and bugs as allies raised like ants; ship it all at once behind research gates; one instinct per caste; Gardener Minims can die, capped ([#84](https://github.com/MarcialPimentel/hormigas/pull/84), [05](05-castes-units.md)) | Let players pick a style and go deep on it |
| 2026-10-29 | Build 10: a counter triangle plus a siege caste, instead of retuning the two old castes or adding ally species then ([#81](https://github.com/MarcialPimentel/hormigas/pull/81), [05](05-castes-units.md)) | Give every caste a purpose; the old pair was knife-edge |
| 2026-10-29 | More wild things: aphid herds, a termite mound, two new nest species and a spider-den boss in one build; herds are claimed by stationing tenders ([#73](https://github.com/MarcialPimentel/hormigas/pull/73), [24-npcs](24-npcs.md)) | The world is sparse; Nectar is the bottleneck, so make it contested |
| 2026-10-29 | Alliances in two stages; small dealings free, deep pacts researched; truce notice 24 h; scent fade 3 days; at most 6 per supercolony ([#72](https://github.com/MarcialPimentel/hormigas/pull/72), [23-supercolonies](23-supercolonies.md)) | Players should meet and deal before they ally |
| 2026-10-29 | Protein sink: feed the brood (Well fed, Feast) and larval digestion Protein → Nectar at 3 : 1 over time; no cost rebalance yet ([#70](https://github.com/MarcialPimentel/hormigas/pull/70), [03-economy](03-economy.md)) | Protein piled up with nothing to spend it on |
| 2026-10-29 | Map folds into Missions; discovery is one way (scout before raiding); new players are placed together, up to 4 per patch ([#71](https://github.com/MarcialPimentel/hormigas/pull/71), [22-discovery](22-discovery.md)) | Players should meet; scouting should matter |
| 2026-10-29 | Army-ant swarms: a new roaming enemy, 4 h warning, about every 4 days per colony, beatable, never destroys chambers ([#62](https://github.com/MarcialPimentel/hormigas/pull/62), [20-swarms](20-swarms.md)) | Raids from the wild without breaking pillar 2 |
| 2026-10-29 | Ship colonization (second colonies) now, tune the numbers later ([#58](https://github.com/MarcialPimentel/hormigas/pull/58), [19-colonies](19-colonies.md)) | Moved up from v1 |
| 2026-10-29 | No permanent notifications panel; a one-time opt-in card instead ([#60](https://github.com/MarcialPimentel/hormigas/pull/60)) | Playtest feedback |
| 2026-10-28 | Approved the 3D nest ("a block of earth"); 2D nest stays for phones; light field-guide theme for menus ([#49](https://github.com/MarcialPimentel/hormigas/pull/49), [art/3d-exploration](art/3d-exploration.md)) | Reasons in the exploration doc |
| 2026-10-27 | Wild nests: one per patch with players, strength matches the patch, they raid back gently, new founding task "Raid the wild nest" ([#37](https://github.com/MarcialPimentel/hormigas/pull/37), [17-wild-nests](17-wild-nests.md)) | A sparse world needs someone to scout and raid |

## Open Questions
- Final name (Hormigas = "ants" in Spanish). Lean into Spanish flavor in naming, or keep English terms?
