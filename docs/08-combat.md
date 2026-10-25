# 08 — Combat

**Version:** 0.1
**Data:** [`data/castes.json`](data/castes.json), [`data/defenses.json`](data/defenses.json), [`data/formulas.json`](data/formulas.json)

## Overview
Combat is automatic and resolves instantly when a raid arrives. The skill is in the decisions **before** the fight: scouting, composition, timing.

## Resolution
1. Up to **6 rounds**.
2. Each round, every unit/defense on each side fires once at a **random** enemy unit.
3. **Guard** absorbs damage first and fully restores at the start of each round.
4. **Glance rule:** a shot dealing less than 1% of the target's full Guard does nothing. Prevents swarms of weak units from wearing down big ones.
5. **Health** damage persists for the whole battle.
6. **Collapse chance:** a unit below 70% Health has a chance to die when hit, equal to `1 − currentHealth / maxHealth`.
7. **Frenzy:** after firing, a unit with Frenzy *N* against the target's type has a `(N−1)/N` chance to fire again at a new random target.
8. Battle ends when one side is wiped out or after round 6 (draw).

Research bonuses (Mandibles, Chitin, Guard Formation) apply to both sides' stats before the battle.

## Outcome
| Result | Effect |
|---|---|
| **Attacker wins** | Loots up to **50%** of the defender's *unprotected* resources, limited by cargo |
| **Draw** | No loot; both sides retreat with survivors |
| **Defender wins** | No loot |

Loot is taken evenly across resource types where possible (fill cargo by thirds, then fill remaining space with whatever is left).

## Corpses (debris)
- **30%** of the Foliage + Protein value of every destroyed **unit** (both sides) becomes a **corpse field** at that coordinate.
- Corpses are **converted entirely to Protein** — ants eat the dead. This makes Protein the war resource.
- Anyone can send Workers (or v1 Carrion Beetles) to haul corpses. Defenders often get there first.
- Corpse fields decay: −10% per hour after 24 h (encourages quick hauling, prevents permanent clutter).

## Battle report
Every battle produces a readable report: forces, round summaries, losses, loot, corpse field size.

## In-game battle preview
Before sending a raid on a scouted target, the UI runs the **same combat code** client-side and shows an estimated outcome range (e.g., "Win: 80%, Expected loot ~12k, Expected losses ~3k").
This is a core fairness goal: players should never need an external simulator.

## Open Questions
- Should the preview be exact (seeded RNG) or a Monte Carlo range? Proposal: run ~50 simulations, show range.
- Should defenders get a home advantage (e.g., +10% Guard)?
