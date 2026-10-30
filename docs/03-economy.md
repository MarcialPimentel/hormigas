# 03 — Economy

**Version:** 0.1
**Data:** [`data/resources.json`](data/resources.json), [`data/chambers.json`](data/chambers.json)

## Resources
| Resource | Tier | Main source | Main use |
|---|---|---|---|
| **Foliage** | Bulk | Leaf Garden | Chambers, most castes |
| **Protein** | Mid | Hunting Grounds, battlefield corpses | Castes, research |
| **Nectar** | Rare | Aphid Pasture, tended aphid herds ([24-npcs](24-npcs.md)) | Advanced castes/research, **mission fuel** |
| **Workforce** | Capacity (not stored) | Nursery, Queen's Chamber | Required to run production chambers |

## Production
- Each production chamber produces per hour: `base × L × 1.1^L × terrainMod`.
- The Queen's Chamber gives a small free base income (+60 Foliage, +30 Protein /h) so a colony is never fully stalled.
- **Gathering multiplier (×2 since 2026-10-30).** Everything a colony gathers itself is multiplied by `gathering.multiplier` in `formulas.json`: base income, producing chambers, Gardener Minims, forage finds and aphid herd Nectar. So the base income is really +120 Foliage, +60 Protein /h. The numbers in this doc and in the data files are before the multiplier. Storage, raid loot, wild-nest stores and quest rewards are not multiplied, and neither are build, brood or research times, so a richer colony is soon held back by its diggers and its storage instead. Raised from 1 after playtest feedback that gathering felt slow; it's the current baseline, reviewed after this playtest.
- Production is calculated on demand by the server (see [13-tech](13-tech.md)), never ticked.

## Workforce (the "energy" constraint)
- Production chambers consume workforce; Nursery and Queen's Chamber supply it.
- If demand > supply, **all** production is multiplied by `supply / demand`.
- This forces balanced growth: upgrading mines without the Nursery gives diminishing returns.
- UI must show this clearly (red workforce bar + "production at 72%").

## Storage
- Each resource has its own storage chamber: Granary (Foliage), Larder (Protein), Nectar Cellar (Nectar).
- Capacity: `10,000 × 1.8^L` (L0 = base 10,000).
- Production stops at the cap. Resources from missions/raids can exceed it temporarily but production pauses until below cap.

## Protected storage — the Honeypot Gallery
Real honeypot ants store food in their own bodies. In Hormigas they are the colony's safe:
- Protects `1,000 × 1.6^L` of **each** resource from raids.
- Raiders can only take from the unprotected remainder.
- This is the key fix for the "lost everything overnight" quit moment, while keeping risk for hoarding.

## Gardener Minims (Build 11)
The tiniest leafcutter workers weed and tend the fungus garden. Each Gardener Minim **at home** adds 0.5% to the colony's Leaf Garden output, counting at most 4 per Leaf Garden level (Leaf Garden 10 → up to 40 minims, +20%). Numbers: `formulas.json` → `gardeners`.
- Minims away on missions don't count. They fight like Workers, so a raid can kill some (Marz, 30 Oct 2026: yes, but capped).
- Compute-don't-tick: production uses the minims at home when the colony was last settled, and minims hatching in the Brood Hall while the player is away are paid from the moment they hatch (`syncColony`), so away time is never paid at the wrong rate. A test checks one big jump equals many small steps.

## Mission fuel
- Every mission consumes Nectar based on distance, unit count and unit type.
- Makes Nectar strategically important and turns distance into a real cost.

## Larval digestion (Protein → Nectar)
Adult ants can't swallow solid food. Workers feed protein to the larvae, which digest it and feed liquid food back to the colony. In Hormigas that is the Brood Hall's exchange:
- A **job** in the Brood Hall (Brood Hall 2+, one per colony): put in Protein, get back **1 Nectar per 3 Protein**.
- It takes time: the larvae get through `200 × Brood Hall level` Protein an hour (× world speed). 3,000 Protein at Brood Hall 2 is 7.5 hours for 1,000 Nectar.
- The Nectar trickles in evenly while the job runs and can go over the Nectar Cellar's cap, like mission cargo. Stopping the job keeps the Nectar made so far and refunds the undigested Protein.
- The rate is deliberately poor (production values Protein at about 2 : 1), so Aphid Pastures stay the real Nectar source and digestion is for surplus Protein. Protein inside a running job is out of raiders' reach; at 3 : 1 that is an expensive way to hide it.
- Numbers: `formulas.json` → `brood.digestion`.

## Sinks and sources (economy health)
| Sources | Sinks |
|---|---|
| Production | Chamber & research costs |
| Foraging expeditions | Caste & defense costs |
| Raids (transfer, not creation) | Mission fuel (Nectar) |
| Corpses (partial value recovered) | Units lost in battle |
| Larval digestion (Nectar out) | Larval digestion (Protein in, 3 : 1) |
| | Feeding the brood (extra Protein, [05](05-castes-units.md)) |

Raids **move** value between players; corpses recover only 30% of destroyed value. War is net-negative for the world economy, which prevents raiding from being the only viable strategy.

## Why Protein needed a sink (playtest, 29 Oct 2026)
Players piled up Protein while Nectar ran short. Production (about 2 Foliage : 1 Protein) and chamber costs balance each other, but Protein also arrives free from battles (corpses are 30% of destroyed value, all Protein), dead-beetle forages and loot, and its big sinks (research, castes, mission fuel) all need Nectar too. When Nectar runs out, Protein has nowhere to go.

**Decisions (Marz, 29 Oct 2026, #65):**
- **Feed the brood:** extra Protein raises castes faster, at two levels: Well fed and Feast ([05](05-castes-units.md#feeding-the-brood)).
- **Trading at a cost:** larval digestion in the Brood Hall turns Protein into Nectar at 3 : 1 and over time (above). It is a chamber job rather than a trade-party mission: it runs while you're away, doesn't burn Nectar fuel to fetch Nectar, and doesn't need a map trader (traders belong to the NPC build). Protein to Nectar only, so Foliage doesn't become a second Nectar source.
- **No cost rebalance yet.** Ship the two sinks, then check in playtest whether Protein still piles up.
- **"Workers" and "Workforce" stay as they are.** The names were flagged as confusable; Marz judged them clear enough.

## Open Questions
- Should the three storage chambers merge into one "Store" in the MVP to reduce UI?
- Is Honeypot protection per-resource, or a single pooled amount?
- Trading between players: out of scope for v0.1 — revisit for v1.
