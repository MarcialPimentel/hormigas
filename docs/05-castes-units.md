# 05 — Castes & Units

**Version:** 0.1
**Data:** [`data/castes.json`](data/castes.json)

## Concept
Units are **castes** raised in the Brood Hall. Each unit represents a squad of ants (the number is flavor; mechanically it's one unit).

## Stats
| Stat | Meaning |
|---|---|
| **Attack** | Damage per shot |
| **Guard** | Absorbs damage each round; fully restores each round (like a shield) |
| **Health** | Permanent damage pool for the battle. Default = (Foliage + Protein) / 10 |
| **Speed** | Movement on the map |
| **Cargo** | Resources carried |
| **Nectar use** | Fuel consumption factor |

## MVP castes
| Caste | Role | Notes |
|---|---|---|
| **Worker** | Light hauling, corpse hauling, early foraging | Cheap. Frenzy target for soldiers. |
| **Minor Soldier** | Cheap fodder / early raider | Fast, weak. Frenzy vs Workers & Scouts. |
| **Major Soldier** | Main fighting caste | Expensive, strong. Frenzy vs Minor Soldiers. |
| **Scout** | Espionage | Near-zero combat value; dies easily. |
| **Hauler** | Bulk cargo | Unlocked after Major Soldier. |
| **Winged Queen** | Founds a new colony | Brood Hall 4 + Nuptial Flight 1. Used up on landing ([19-colonies](19-colonies.md)). |

## Feeding the brood
Well-fed ant larvae develop faster. When you raise castes in the Brood Hall you pick a diet for the batch:

| Feeding | Extra Protein per unit | Raising time |
|---|---|---|
| Normal | none | as usual |
| **Well fed** | +50% of the caste's Foliage + Protein cost | 25% faster |
| **Feast** | +150% | 40% faster |

- Castes only; defenses aren't brood. The choice is made per batch when it's queued, and the queue shows it.
- The second step costs much more for a smaller gain: a real choice between speed now and saving Protein.
- Feeding adds no points (points count the units, not the meal). Numbers: `formulas.json` → `brood.feeding`. Decided by Marz, 29 Oct 2026 (#65); see [03-economy](03-economy.md#why-protein-needed-a-sink-playtest-29-oct-2026).

## v1 castes (designed, not in MVP)
| Caste | Role |
|---|---|
| **Carrion Beetle** (ally species) | Dedicated corpse hauler, huge corpse cargo |
| **Bullet Ant** (ally) | Elite striker, frenzy vs Major Soldiers |
| **Trap-jaw Ant** | Anti-defense specialist (siege role) |
| **Army Ant swarm** | Late-game mass unit |

## Counters (Frenzy)
Frenzy = chance to fire again after a shot, based on target type (see [08-combat](08-combat.md)).
```
Minor Soldier → Worker (3), Scout (5)
Major Soldier → Minor Soldier (3), Scout (5)
Acid Sentry (defense) → Major Soldier (2)
Every combat unit → Scout (5)
```
Rule: every unit should have **at least one counter** and **at least one thing it's good against**. No dominant unit.

## Open Questions
- Should units have upkeep (ongoing Protein cost)? Pro: limits hoarding armies. Con: punishes offline players. Proposal: no upkeep in MVP.
- Do we show the squad size (e.g., "Major Soldiers ×40 squads") for flavor?
