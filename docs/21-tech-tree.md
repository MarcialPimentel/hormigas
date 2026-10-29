# 21 — The Tech Tree (Build 6)

**Version:** 0.1
**Data:** [`data/research.json`](data/research.json) (names, costs, prerequisites, caps, effects, branches)
**Related:** [07-research.md](07-research.md) (research basics), [00-vision.md](00-vision.md) pillar 4

## Why
Before Build 6, every research was gated only by the Pheromone Chamber level. After the first few days there was nothing new to aim for: the list just got more expensive. The tech tree gives players **long-term goals**: research that needs other research, four branches that suit different play styles, and late "capstone" research worth planning a week ahead for.

## What we took from other games
- **OGame:** research unlocks research (Impulse Drive needs Energy Tech; Plasma Tech needs Ion and Laser), late techs need several branches at once, and steady percentage bonuses (Plasma Tech's mine bonus) are the endless late goals. We keep the "needs X at level N" rule and the doubling cost. We avoid OGame's weakness: the tree is only readable on a fan-made chart. Ours is shown in the game ([vision pillar 5](00-vision.md)).
- **Civilization / strategy-game trees:** visible branches with a clear theme, and branches that cross (Group Hunting needs both Jaws and Scent research).
- **What we don't take:** exclusive "pick A or B" choices. Research is account-wide and permanent, so a wrong pick would punish new players with no way back (pillar 2: every loss is recoverable). Every player can eventually learn everything; the choice is **order**, not exclusion.

## The four branches
Every research is real ant behaviour (pillar 4).

| Branch | Theme | Roots (existing) | New |
|---|---|---|---|
| **Jaws** | Fighting | Mandibles, Chitin, Guard Formation | Formic Acid, Raiding Columns, Nest Plugging |
| **Harvest** | Food | Foraging Instinct, Aphid Husbandry | Group Hunting, Fungus Farming, Repletes (Symbiosis later) |
| **Nest** | The colony itself | Brood Science, Deep Digging, Nuptial Flight | Nurse Workers, Tunnel Engineering, Supercolony |
| **Scent** | Pheromones and information | Pheromone Trails, Colony Mind, Scent Reading | Tandem Running, Chemical Mimicry |

## The new research
Pher = Pheromone Chamber level in the colony doing the research. Costs are level 1; each level doubles ([formulas.json](data/formulas.json) `researchCostFactor`).

| Research | Needs | Effect per level | Cap | The ant behaviour |
|---|---|---|---|---|
| **Formic Acid** | Pher 4, Mandibles 3, Chitin 2 | Defenses +10% attack, guard and health | — | Formicine ants spray formic acid from the gaster. |
| **Raiding Columns** | Pher 5, Mandibles 5, Guard Formation 3, Pheromone Trails 4 | Winning raids take +5% more of unprotected stores (50% → 65%) | 3 | Army ants and slave-making ants raid in long columns. |
| **Nest Plugging** | Pher 5, Chitin 4, Guard Formation 4 | +25% protected storage | — | Turtle and door-head ants (phragmosis) plug the entrance with their heads. |
| **Group Hunting** | Pher 3, Mandibles 1, Pheromone Trails 2 | +5% Protein from Hunting Grounds | — | Recruitment trails bring nestmates to prey too big for one ant. |
| **Aphid Husbandry** *(was "later", now playable)* | Pher 3 | +5% Nectar from Aphid Pastures | — | Ants guard and "milk" aphids for honeydew. |
| **Fungus Farming** | Pher 3, Aphid Husbandry 2 | +5% Foliage from Leaf Gardens | — | Leafcutter ants farm fungus on chewed leaves. |
| **Repletes** | Pher 5, Aphid Husbandry 4, Fungus Farming 2 | +10% storage (all three resources) | — | Honeypot ant workers swell into living storage jars. |
| **Nurse Workers** | Pher 3, Brood Science 1 | Units raised 5% faster | 6 (−30%) | Nurses feed, groom and move the brood. |
| **Tunnel Engineering** | Pher 4, Deep Digging 2 | Chambers dug 5% faster | 6 (−30%) | Ants pack soil pellets to shore up tunnels. |
| **Tandem Running** | Pher 4, Colony Mind 2, Pheromone Trails 2 | Research 5% faster | 6 (−30%) | *Temnothorax* leaders teach followers a route, step by step: real ant teaching. |
| **Chemical Mimicry** | Pher 4, Scent Reading 3 | Each level halves the chance your scouts are spotted | 3 | Parasites and raiders copy a colony's smell to walk in unnoticed. |

Changed existing research:
- **Brood Science** is capped at 2 (levels above 2 did nothing).
- **Symbiosis** (later) now needs Aphid Husbandry 3 and Chemical Mimicry 1: ant guests (beetles, crickets) live in nests by mimicking the colony's smell.
- **Supercolony** needs Pher 3, Nuptial Flight 1 and Colony Mind 1, one level only, and is playable since the alliances build ([23-supercolonies](23-supercolonies.md)). It was first planned as the tree's final goal (Pher 6, Nuptial Flight 5, Colony Mind 4, Chemical Mimicry 2); Marz moved it next to colonization on 29 Oct 2026 so alliances are reachable in the first week.

The existing research keep their old requirements, so **no player loses access to anything they already have**.

## Rules
- **Prerequisites** are `research.<id>: level` keys in `unlock`, next to the Pheromone Chamber level. They are checked when you start a research (and the Research screen shows "Needs Mandibles 3, Chitin 2").
- **Already researched levels are never taken away.** A prerequisite only gates the next level.
- **Caps** (`maxLevel`) are only on research whose bonus would otherwise run away (time cuts, loot, stealth) or do nothing (Brood Science). The rest are uncapped, like OGame: doubling cost is the brake.
- **Effects add up by key.** `researchSum(research, "foliagePct")` adds the effect from every research that has that key, so a future research can reuse a key with no code change.
- **Production and storage research change rates.** When such a research finishes, every colony of that player is first brought up to the finishing moment at the old rates, then the new rates apply. Away time is never paid at the wrong rate (pillar 1, and the compute-don't-tick rule in [13-tech.md](13-tech.md)).
- **Time research** (Nurse Workers, Tunnel Engineering, Tandem Running) applies when a job starts, like the Excavation Works and Brood Hall. Jobs already running keep their finish time.
- **Formic Acid** only boosts defenses (Soil Walls, Pit Traps, Acid Sentries), never units. It is the defender's answer to Raiding Columns, as Nest Plugging is.
- **Chemical Mimicry** counts as extra Scent Reading for *being spotted* only, not for how much a scout report shows.

## Long-term goals (how the tree paces)
At ×1 speed, roughly:
- **Days 1–4:** the roots (Mandibles, Pheromone Trails, Colony Mind, Brood Science…), as before.
- **Week 1–2:** the first crossings: Group Hunting, Aphid Husbandry, Fungus Farming, Nurse Workers, Tandem Running.
- **Weeks 2–4:** Formic Acid, Tunnel Engineering, Chemical Mimicry. Picking a branch to rush starts to matter.
- **Month 1+:** the capstones: Raiding Columns (raiders), Nest Plugging (turtles), Repletes (builders). Then endless percentage levels.
- **Week 1:** Supercolony, next to the second colony (since the alliances build).
- **Later builds:** Symbiosis, shown on the tree as "coming later" so players can already plan toward it.

The two Jaws capstones are deliberately balanced: Raiding Columns adds at most 15 points of loot share; Nest Plugging grows protected storage without a cap. A turtle can always out-protect a raider (pillar 2).

## Decisions (2026-10-29)
Proposed by the rules session as defaults and approved by Marz on 2026-10-29 before shipping (PR #63).
- **No exclusive branch choices.** Everyone can learn everything; order is the choice. (Answers the open question in 07-research.md.)
- **Stay account-wide with one research at a time.** Unchanged.
- **Tree lives inside the Research tab**, with the four branches (the art session designs the view).
- **Production bonuses are +5% per level, chamber output only** (not the base trickle), like OGame's Plasma Tech: small, steady, always worth one more level.
- **Symbiosis and Supercolony stay "later"** but appear on the tree with their prerequisites.

## Open Questions
- Should the Research screen let you **queue** the next research (OGame doesn't)? Proposal: not yet; one-at-a-time keeps check-ins meaningful.
- Raiding Columns cap 3 (65%) vs Nest Plugging uncapped: is that the right balance after playtest?
- Should a Pheromone Chamber level ever be a prerequisite *only* in the colony doing the research (today), or account-wide (highest chamber you own)? Proposal: keep per colony, it gives the research colony a role.
