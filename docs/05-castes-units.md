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
| **Minor Soldier** | Swarm | Fast and cheap. Beats Major Soldiers by numbers; mown down by Acid Sprayers and Pit Traps. |
| **Major Soldier** | Heavy | Expensive and armoured. Crushes Acid Sprayers and Trap-jaw Ants; drowns under a swarm of Minors. |
| **Acid Sprayer** (Build 10) | Anti-swarm | *Formica* soldiers spray formic acid over a crowd. Frenzy vs Minor Soldiers and Workers; dies fast to Majors. Brood Hall 2 + Brood Science 1. |
| **Trap-jaw Ant** (Build 10) | Siege | *Odontomachus* jaws snap shut faster than anything in nature. Frenzy vs every defense; fragile against ants, so it needs an escort. Brood Hall 3 + Mandibles 2. |
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
| **Bullet Ant** (ally) | Elite striker, frenzy vs Major Soldiers. Waits until the triangle has been playtested, so it doesn't become the new "one best unit". |
| **Army Ant swarm** | Late-game mass unit |

## Counters: the triangle (Build 10)
Before Build 10 the best army was "as many Minor Soldiers as you can afford": at equal cost they beat Major Soldiers about 89% of the time, and defenses lost to them at roughly a 3 : 1 cost ratio even after free rebuilds. With only two fighting castes, changing one number just flipped which one dominated. A third caste makes a stable triangle:

```
Minor Soldiers  ──beat by numbers──▶  Major Soldiers
Major Soldiers  ──crush──────────────▶  Acid Sprayers
Acid Sprayers   ──mow down───────────▶  Minor Soldiers
Trap-jaw Ants   ──break──────────────▶  defenses (and lose to every soldier caste)
Pit Traps       ──catch──────────────▶  small ants (Minors, Workers, Acid Sprayers)
Acid Sentries   ──burn───────────────▶  Major Soldiers
```

- **Frenzy** = chance to fire again after a shot, based on the target ([08-combat](08-combat.md)). Frenzy ×3 or more counts as a counter; ×2 (Majors against Minors) is only an edge.
- **Outnumbers** (`castes.json`): a caste that wins by sheer numbers rather than frenzy. Minor Soldiers outnumber Major Soldiers: big hitters waste most of a 150-damage bite on a 50-health ant.
- **Every combat unit → Scout (5)**, as before.
- **An even mix is the safe middle.** A third each of Minors, Majors and Sprayers is never crushed by a single caste, but loses to the right counter-mix. Scouting first and bringing the counter is the skill (pillar 5).
- **Readable:** the Brood Hall shows each caste's "Strong vs" and "Weak vs", the battle preview warns which of their units counter yours, and battle reports explain losses ("Acid Sprayers cut down your Minor Soldiers. Major Soldiers counter Acid Sprayers."). All read from the same numbers in `docs/data` (`shared/src/counters.ts`).

Tuning check (combat code, equal spend of 44k a side, no research; `shared/test/castes-triangle.test.ts` guards it):

| Attacker → defender | Attacker wins |
|---|---|
| Minor → Major / Major → Sprayer / Sprayer → Minor | 100% / 100% / 93% |
| Major → Minor / Sprayer → Major / Minor → Sprayer | 0% / 0% / 3% |
| Even mix → Minor / Major / Sprayer | 68% / 35% / 85% |
| Minor / Major / Sprayer → even mix | 33% / 59% / 4% |
| Trap-jaw → any soldier caste | 0% |

Rule: every unit should have **at least one counter** and **at least one thing it's good against**. No dominant unit.

**Decisions (Marz, 29 Oct 2026, Build 10):** a triangle plus a siege caste, rather than retuning the two old castes (that stays knife-edge) or adding ally species now. Existing armies are unchanged; every player got a report explaining the change. No refunds.

## Open Questions
- Should units have upkeep (ongoing Protein cost)? Pro: limits hoarding armies. Con: punishes offline players. Proposal: no upkeep in MVP.
- Do we show the squad size (e.g., "Major Soldiers ×40 squads") for flavor?
