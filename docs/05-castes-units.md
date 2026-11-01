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
| **Supermajor** (Build 11) | Heavy | Leafcutter (*Atta*) supermajor. Very tough, **tramples** (a killing bite carries on into up to 4 more ants). Crushes Majors, Sprayers and Trap-jaws; drowns under Minor swarms. Brood Hall 4 + Chitin 3 + Guard Formation 2. |
| **Slave-maker** (Build 11) | Late raider | *Polyergus*. A middling fighter that, on a **won raid, carries corpses home at once** (400 Protein each) before anyone else can haul them. Brood Hall 6 + Raiding Columns 1 + Chemical Mimicry 2. |
| **Desert Ant** (Build 11) | Forager | *Cataglyphis*. Very fast; every 5 in a forage party count as one more Foraging Instinct level for that trip (up to +5). Brood Hall 3 + Foraging Instinct 2. |
| **Gardener Minim** (Build 11) | Economy | The tiniest leafcutters, tending the fungus. Each at home adds 0.5% to the Leaf Gardens' output, counting up to 4 per Leaf Garden level ([03](03-economy.md#gardener-minims-build-11)). Fights like a Worker, so raids can kill some. Brood Hall 2 + Fungus Farming 1. |
| **Scout** | Espionage | Near-zero combat value; dies easily. |
| **Media Worker** (30 Oct 2026) | Carrier | Leafcutter *media*: the everyday carrier between Worker and Hauler. Carries 3,500 (Worker 1,500, Hauler 7,500) for 500 Foliage / 200 Protein, 5.0 cargo per resource spent (Worker 3.8, Hauler 6.3). Hauls corpses. Can't fight. **Brood Hall 2, no research.** |
| **Hauler** | Bulk cargo | 7,500 cargo. Brood Hall 2 + Brood Science 2. |
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

## Allies (Build 11)
Other insects that live with the colony, unlocked by **Symbiosis** levels 1–4 and raised in the Brood Hall like any caste (Marz, 30 Oct 2026: "just treat them like ants").

| Ally | Symbiosis | Role |
|---|---|---|
| **Carrion Beetle** | 1 (Brood Hall 4) | Corpse hauler: 20,000 cargo for corpses only. Can't fight. |
| **Assassin Bug** | 2 (Brood Hall 5) | Giant-killer: stabs through armour (frenzy vs Rhinoceros Beetles and Supermajors). Fragile against small ants. |
| **Bullet Ant** | 3 (Brood Hall 5) | Heavy-hunter (frenzy vs Majors, Supermajors, beetles). Minors pull it down. |
| **Rhinoceros Beetle** | 4 (Brood Hall 6) | The giant: hugely tough, **tramples** up to 8. Crushes the mid castes; falls to Minor swarms, Supermajors, Assassin Bugs and Bullet Ants. |

Later idea: Army Ant swarm as a late-game mass unit.

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

## The second layer: big units and their hunters (Build 11)
In this combat engine one bite kills at most one ant and both sides strike at once, so a big unit with the same health per cost as a small one always loses to a swarm. Big units are therefore **tough** (several times the health per cost) and **trample** (leftover damage from a kill carries on, [08](08-combat.md)). That adds a layer on top of the triangle:

```
Big units (Supermajor, Rhinoceros Beetle)  ──crush──▶  the mid castes (Major, Sprayer, Trap-jaw)
Hunters (Bullet Ant, Assassin Bug)         ──hunt───▶  the big units
Small castes (Minor, Sprayer, Trap-jaw)    ──mob────▶  the hunters
Minor swarms                               ──pull down──▶  the big units too
```

Tuning check (combat code, 120k a side, no research; `npm run combat`, guarded by `shared/test/full-roster.test.ts`):

| Attacker → defender | Wins |
|---|---|
| Supermajor → Major / Sprayer / Trap-jaw | 100% / 100% / 100% |
| Rhinoceros Beetle → Major / Sprayer / Trap-jaw | 100% / 98% / 100% |
| Minor → Supermajor / Rhinoceros Beetle | 75% / 100% |
| Bullet Ant → Supermajor / Rhinoceros Beetle | 100% / 100% |
| Assassin Bug → Supermajor / Rhinoceros Beetle | 100% / 100% |
| Minor, Sprayer or Trap-jaw → Bullet Ant or Assassin Bug | 100% |
| Supermajor → Rhinoceros Beetle | 73% |

## Instincts (Build 11)
One research per fighting ant caste, in the Jaws branch: **Swarm Raiding** (Minor), **Armoured Heads** (Major), **Acid Glands** (Sprayer), **Snap Reflex** (Trap-jaw), **Crushing Heads** (Supermajor), **Propaganda Glands** (Slave-maker). Each gives +5% attack and +5% health per level to that caste only, up to level 10. Players who pick a style can go deep on it ([21-tech-tree](21-tech-tree.md)).

Rule: every unit should have **at least one counter** and **at least one thing it's good against**. No dominant unit.

**Decisions (Marz, 30 Oct 2026, Build 11):** bigger units are wanted for variety, without copying OGame's combat exactly; beetles and other bugs fit the fantasy; ship the whole roster at once (research gates already spread it over weeks); one instinct per caste; allies are raised like ants; Gardener Minims can die in raids, capped.

**Decisions (Marz, 29 Oct 2026, Build 10):** a triangle plus a siege caste, rather than retuning the two old castes (that stays knife-edge) or adding ally species now. Existing armies are unchanged; every player got a report explaining the change. No refunds.

## Open Questions
- Should units have upkeep (ongoing Protein cost)? Pro: limits hoarding armies. Con: punishes offline players. Proposal: no upkeep in MVP.
- Do we show the squad size (e.g., "Major Soldiers ×40 squads") for flavor?
