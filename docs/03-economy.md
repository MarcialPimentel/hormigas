# 03 — Economy

**Version:** 0.1
**Data:** [`data/resources.json`](data/resources.json), [`data/chambers.json`](data/chambers.json)

## Resources
| Resource | Tier | Main source | Main use |
|---|---|---|---|
| **Foliage** | Bulk | Leaf Garden | Chambers, most castes |
| **Protein** | Mid | Hunting Grounds, battlefield corpses | Castes, research |
| **Nectar** | Rare | Aphid Pasture | Advanced castes/research, **mission fuel** |
| **Workforce** | Capacity (not stored) | Nursery, Queen's Chamber | Required to run production chambers |

## Production
- Each production chamber produces per hour: `base × L × 1.1^L × terrainMod`.
- The Queen's Chamber gives a small free base income (+30 Foliage, +15 Protein /h) so a colony is never fully stalled.
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

## Mission fuel
- Every mission consumes Nectar based on distance, unit count and unit type.
- Makes Nectar strategically important and turns distance into a real cost.

## Sinks and sources (economy health)
| Sources | Sinks |
|---|---|
| Production | Chamber & research costs |
| Foraging expeditions | Caste & defense costs |
| Raids (transfer, not creation) | Mission fuel (Nectar) |
| Corpses (partial value recovered) | Units lost in battle |

Raids **move** value between players; corpses recover only 30% of destroyed value. War is net-negative for the world economy, which prevents raiding from being the only viable strategy.

## Open Questions
- Should the three storage chambers merge into one "Store" in the MVP to reduce UI?
- Is Honeypot protection per-resource, or a single pooled amount?
- Trading between players: out of scope for v0.1 — revisit for v1.
