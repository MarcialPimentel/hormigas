# 17 — Wild Nests (NPC colonies)

**Version:** 0.1
**Data:** [`data/npc.json`](data/npc.json)

## Why
A new world is sparse. Scouting, raiding, corpse races and battle previews all need someone nearby, and the first playtest had nobody to scout. **Wild nests** are rival colonies of other ant species that live in every patch with players. They give every player something to look toward, scout, raid and fear from day one, and they keep doing so after real neighbors arrive.

Real ants fight neighboring colonies constantly over food and territory (pillar 4), and a wild nest is never a quit moment: its raids are small and give plenty of warning (pillar 2).

## Rules
### Where they live
- **One wild nest per patch that has players.** A nest spawns when the first player is placed in a patch. Patches that already had players before nests existed get theirs when the server starts.
- Nests take a free **non-Grassland** spot, so the Grassland spots new players start on stay free.
- **The terrain picks the species**, as in real life:

| Terrain | Species | Nest | How it fights | Counter |
|---|---|---|---|---|
| Sunny Meadow, Creek Bank | Pavement Ants | Pavement Ant Nest | Swarm of Workers and Minor Soldiers | Major Soldiers (Frenzy vs Minor Soldiers) |
| Sandy Soil | Fire Ants | Fire Ant Mound | Few, strong soldiers; Acid Sentries from level 4 | Cheap Minor Soldiers; keep Majors away from acid |
| Rotting Log | Carpenter Ants | Carpenter Ant Gallery | Pit traps and walls, few soldiers | Numbers; expect defenses to rebuild |

Different species make scouting matter: the right army depends on what lives next door.

### How strong they are
- Nests have **levels 1–6**. A nest's level matches the **strongest active player in its patch** (by points, see `levels[].minPatchPoints`) and **never goes down**.
- Each level sets the nest's soldiers, defenses and food store per species (`species.*.levels`, `levels[].stock`).
- **Tuning target:** a player with a fair army for their stage (about 30% of their spending on military) beats a nest of the matching level with roughly 20–35% losses. Checked with the real combat code; see the table below.
- Slow patches keep a beatable nest. Fast patches get a target that grows with their leader.

| Level | Patch leader points | Roughly when (engaged player) | Food store (F/P/N) |
|---|---|---|---|
| 1 | 0 | Founding | 1.6k / 1k / 400 |
| 2 | 20 | Day 1 | 4k / 2.8k / 1.2k |
| 3 | 60 | Day 3 | 6k / 4.2k / 1.8k |
| 4 | 200 | Day 7 | 10k / 7k / 3k |
| 5 | 600 | Day 14 | 15k / 10.5k / 4.5k |
| 6 | 1,500 | Day 30 | 22k / 16k / 7k |

### Raiding a nest
- Nests have **no new-colony or strength protection**. The **bash limit** (4 wins per 24 h per attacker) still applies.
- **Raiding a nest does not end your own new-colony protection.** It's PvE practice, not PvP.
- Combat, loot (50% of the store, limited by cargo), corpses and defense rebuild work exactly as against a player. Minor Soldiers carry little, so players learn to bring Workers or Haulers for loot.
- **The store is shared.** Everyone in the patch raids the same nest, so it's a race, not a private farm.
- Nests can't receive transports.

### Regrowth
- Lost soldiers, destroyed defenses and taken food **grow back over 24 h** (`regrowHours`, ÷ world speed), in a straight line toward the level's targets.
- Computed from elapsed time like everything else (see [13-tech](13-tech.md)): nothing ticks.
- With the bash limit, one patch can take roughly one store's worth per day from its nest: about 8 hours of a nearby player's production. That's worth doing, but not worth more than growing your own economy (pillar 3).

### Nests raid back (gently)
- Every **16–32 h** (÷ world speed) a nest may send a raid at **one player colony in its patch**.
- **Never** at players under new-colony protection, inactive players (7+ days), or anyone a nest raided in the last 24 h.
- **Revenge:** players who raided this nest in the last 24 h are twice as likely to be picked.
- **The party is small:** 30% of the nest's soldiers, at least 2 Minor Soldiers, and never worth more than 10% of the target's points (in resources).
- **The party is slow:** it marches at 10% speed, so a same-patch raid gives about **50 minutes of warning** at ×1. That's enough to send the army away or reinforce. "Raid incoming" notifications fire as for any raid.
- Loot is small (soldiers carry little) and goes into the nest's store, where the player can raid it back. Corpses land at the player's colony, so a well-defended player gets free Protein.
- Raids teach the core skill ("protect before you leave", [09-missions](09-missions.md#army-saving-the-core-skill)) long before real players threaten.

### Founding tasks
The founding tasks gain a 12th step, **"Raid the wild nest"**: win one raid against a wild nest. It follows "Send out a Scout" (the nest is the natural thing to scout) and gives the stretch after Nectar a concrete goal. A level-1 nest falls to about 6–8 Minor Soldiers.

## How players see them
- **Map:** the nest's spot shows its name, species, level and a "Wild nest" tag, with Scout and Raid buttons (no Send). Its owner is never shown as a player.
- **Scout reports** name the species and include a one-line hint on how it fights.
- **Battle reports** and **incoming raids** name the nest ("Fire Ant Mound"), never a player.
- Nests never appear in **rankings** and don't count toward the **world median** that drives the Late Founding Boost.

## Tuning check (combat code, 200 runs each, no research on either side)
A fair army at each level wins every time and loses this share of its value:

| Level | Fair army | Pavement | Fire | Carpenter |
|---|---|---|---|---|
| 1 | 8 Minor Soldiers | 24% | 35% | 27% |
| 2 | 20 Minor Soldiers | 24% | 28% | 21% |
| 3 | 20 Minor + 12 Major | 22% | 24% | 21% |
| 4 | 80 Minor + 10 Major | 32% | 35% | 22% |
| 5 | 150 Minor + 40 Major | 29% | 32% | 22% |
| 6 | 250 Minor + 100 Major | 34% | 36% | 24% |

An army half that size usually still wins but loses 50–80% of itself, so it pays to come prepared. A third of it loses. `shared/test/nests.test.ts` guards these numbers; re-check after changing `data/npc.json`, castes or combat.

## Implementation notes
- A nest is an ordinary colony row with an `npc` state (species, level, last change), owned by one hidden **wild** player per world (`players.is_npc`). Scouting, raiding, battle previews, corpses and reports reuse the normal code paths.
- A nest's current soldiers, defenses and food are its last saved values plus regrowth since then. They're saved only when something changes them (a battle, a raid party leaving or returning, a level-up).
- Nest raids are scheduled `nest_raid` events, re-armed after each one.

## Open Questions
- Should a nest's level ever drop if its patch's leader goes inactive or leaves? Proposal: no, a dormant nest stays a target for the next arrival.
- A late joiner in an old patch meets a high-level nest. Is scouting plus the Late Founding Boost enough, or should big patches get a second, level-1 nest?
- More species (e.g. army ants that move between patches, slave-maker ants that steal brood) once the basics prove fun?
- **Random raids (planned for Build 4).** Marz wants occasional raids from the wild, to make the world feel alive. Decided so far (27 Oct 2026): **4 h warning** (announced in Happening now, the Nest View and a notification), **about one every 4 days** per colony, **beatable**: about 70% of the colony's home defence, so a prepared colony wins, never during new-colony protection. Recommendation: a roaming **army-ant swarm** rather than more wild-nest raids, so it feels different; it takes only unprotected food, never touches brood, and leaves corpses to haul if beaten. Still open: whether it's a swarm or the wild nest, and the wider question of whether a colony or a wild nest can ever be destroyed for good (today nothing can; pillar 2).
