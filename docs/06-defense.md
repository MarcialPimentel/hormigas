# 06 — Defense

**Version:** 0.1
**Data:** [`data/defenses.json`](data/defenses.json)

## Philosophy
Defense doesn't exist to **win** fights. It exists to make attacking you **cost more than it's worth**. A well-defended colony is an unprofitable target.

## MVP defenses
| Defense | Role |
|---|---|
| **Soil Wall** | Max 1 per colony. Huge Guard that **shields the other defenses**: a shot aimed at a Pit Trap or Acid Sentry hits the wall's guard first, while it lasts that round. |
| **Pit Trap** | Cheap Foliage-only defense. An antlion-style pit: frenzy vs Minor Soldiers (5), Workers (4) and Acid Sprayers (3). Small ants that rush in tumble down it. |
| **Acid Sentry** | Formic acid emplacement. Strong; frenzy vs Major Soldiers (3). |
| **Narrow Tunnel** (Build 10) | Max 1 per colony; Brood Hall 3 + Tunnel Engineering 1. Not a fighter and never destroyed: in **round 1 only half the raiders can fight**, the rest are still queueing in the tunnel. |

Trap-jaw Ants ([05](05-castes-units.md)) are the defenses' counter: frenzy vs every defense, but fragile against ants.

## v1 defenses
| Defense | Role |
|---|---|
| **Sticky Resin** | Slows/disables a share of attackers in round 1 |
| **Guard Garrison** | Upgrades stationed soldiers' Guard |

## Does defense pay? (Build 10 check)
Combat code, about 40k of defenses (a Soil Wall, 8 Pit Traps, 5 Acid Sentries), raided by 44k of one caste. Defender losses are before the free rebuild, so the defender's real loss is about 30% of them.

| Raiders | Raider wins | Raider loses | Defender loses (before rebuild) |
|---|---|---|---|
| Minor Soldiers | 100% | 17k | 40k |
| Major Soldiers | 99% | 27k | 40k |
| Trap-jaw Ants | 100% | 10k | 40k |
| Minor Soldiers, with a Narrow Tunnel | 82% | 32k | 36k |
| Major Soldiers, with a Narrow Tunnel | 43% | 40k | 29k |

Before Build 10, 110 Minor Soldiers took 10 Acid Sentries for 4k of losses against the defender's 42k (≈12.6k after rebuild). Defenses alone still fall, as they should: they make raiding cost, and they win with soldiers at home.

## Rebuild rule
After a battle, each destroyed defense has a **70% chance** to rebuild for free. Defenders lose much less than attackers expect; this is what makes defense investment worthwhile.

## Stationed units
Castes at home fight alongside defenses. They do **not** rebuild — they're the defender's real risk. This is why moving your army out before going offline (see [09-missions](09-missions.md)) is a core skill.

## Open Questions
- ~~Should Soil Wall be max 1, or allow a few levels?~~ Decided (Build 10): max 1, and it now really shields the other defenses.
- Do destroyed defenses produce corpses? Proposal: no (they're dirt and acid, not ants).
