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
8. **Trample** (Build 11): a unit with trample *N* whose bite kills its target carries the leftover damage on into up to *N* more random enemies (stopping if what's left would glance). Only big units have it (Supermajor 4, Rhinoceros Beetle 8), so battles without them run exactly as before.
9. **Soil Wall shield:** a shot at one of the defender's other defenses hits the Soil Wall's guard first, while the wall stands and has guard left this round. What the guard doesn't soak goes on to the target ([06-defense](06-defense.md)).
10. **Narrow Tunnel:** if the defender has one, in round 1 each raider fights with a 50% chance (`defenses.json` → `chokepoint`). The tunnel itself isn't in the fight.
11. **Fall-back order:** after a round in which the raiders have lost at least their chosen share of their army's worth (Foliage + Protein + Nectar cost), they break off (below).
12. Battle ends when one side is wiped out, the raiders fall back, or after round 6 (draw).

Research bonuses (Mandibles, Chitin, Guard Formation, and each caste's instinct) apply to both sides' stats before the battle.

**Slave-makers** (Build 11): after a won raid, the raiders carry up to 400 Protein of corpses each straight home; only the rest is left on the field.

## Outcome
| Result | Effect |
|---|---|
| **Attacker wins** | Loots up to **50%** of a player's *unprotected* resources (**75%** of a wild nest's, termite mound's or spider den's store), limited by cargo. Raiding Columns adds to both, never past 100% |
| **Draw** | No loot; both sides retreat with survivors |
| **Defender wins** | No loot |
| **Raiders fell back** | Counts as the defender holding: no loot, the surviving raiders walk home |

## Fall-back order (Build 10)
Real raiding ants break off when a fight goes badly. On the raid screen the player picks **Fight to the end**, **After 25% losses** or **After 50% losses** (`formulas.json` → `combat.retreatOptions`).
- Checked after each round, against the army's worth when it set out. A raid that has already won or lost doesn't fall back.
- Falling back saves the rest of the army but brings no loot. The battle preview shows how often it would happen.
- Only player raids carry an order. Wild-nest raids and army-ant swarms fight to the end.
- With no order, battles run exactly as before (the same random draws).

Loot is taken evenly across resource types where possible (fill cargo by thirds, then fill remaining space with whatever is left).

## Corpses (debris)
- **30%** of the Foliage + Protein value of every destroyed **unit** (both sides) becomes a **corpse field** at that coordinate.
- Corpses are **converted entirely to Protein** — ants eat the dead. This makes Protein the war resource.
- Anyone can send Workers (or v1 Carrion Beetles) to haul corpses. Defenders often get there first.
- Corpse fields decay: −10% per hour after 24 h (encourages quick hauling, prevents permanent clutter).

### Why corpses are Protein, and why loot is the main profit (Marz, 30 Oct 2026)
Corpses are the ant version of OGame's debris field. They are all Protein because ants eat the dead (pillar 4), and only 30% comes back, so war shrinks the world economy instead of growing it.

That made sense when fights were rare. With wild nests, swarms, mounds and nest raids, players fight constantly, so most of a fight's value arrived as Protein, behind a second trip, while Nectar stayed short. A won raid could read as a loss: one playtest raid lost 7,000 worth of ants for 6,000 of loot, profitable only once 4,215 Protein of corpses was hauled.

So:
- **Corpses stay Protein** (the identity is worth keeping).
- **Loot becomes the main profit from wild things:** wild nests, termite mounds and spider dens give up **75%** of their store (`formulas.json` → `combat.lootPctOfWild`). Players and aphid herds stay at 50%.
- **Research takes more Protein** ([07-research](07-research.md#protein-in-research)), so the Protein from corpses has somewhere to go.
- **The battle report shows the net result** (below).

## Battle report
Every battle produces a readable report: forces, round summaries, losses, loot, corpse field size.

It ends with a **net result**, counted in what it costs to raise what was lost:
- **For the raider:** "lost X · carried home Y · ±Z", plus what it comes to if you haul the corpses.
- **For the defender:** what the fight cost, counting ants, defenses that didn't rebuild and food taken, plus a reminder that the corpses at its door are its to haul.

**Watching it** (computers): the report's round-by-round counts are enough to act the battle out on the 3D Patch, where it was fought. **Replay on the patch** in the report opens Missions at that patch and plays it; a raid or swarm that lands on a patch you're watching plays by itself. The replay draws up to about 320 ants a side, each standing for its share of the real army, and loses them round by round to the report's exact numbers ([18-art-direction](18-art-direction.md) § In 3D). It shows the server's result; it decides nothing.

## In-game battle preview
Before sending a raid on a scouted target, the UI runs the **same combat code** client-side and shows an estimated outcome range (e.g., "Win: 80%, Expected loot ~12k, Expected losses ~3k").
This is a core fairness goal: players should never need an external simulator.

## Open Questions
- Should the preview be exact (seeded RNG) or a Monte Carlo range? Proposal: run ~50 simulations, show range.
- ~~Should defenders get a home advantage (e.g., +10% Guard)?~~ Decided (Build 10): no flat bonus. The Narrow Tunnel and the Soil Wall's shield are the defender's advantages, and they cost something to build. Terrain-based home advantage (antlion pits stronger in Sandy Soil) is a candidate for later.
