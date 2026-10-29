# 19 — More colonies (Nuptial Flight)

**Version:** 0.1
**Data:** [`data/research.json`](data/research.json) (`nuptial_flight`), [`data/castes.json`](data/castes.json) (`winged_queen`), [`data/resources.json`](data/resources.json) (`startingResources`)

A player starts with one colony and can found more by sending a **Winged Queen** on a **nuptial flight**. This is how real ant colonies spread: a winged queen leaves the nest, lands, sheds her wings and digs a new one (pillar 4). It gives the "Growth" stage (days 2–7, see [02-progression](02-progression.md)) its big goal: a second colony (pillar 1).

## The path to a second colony
1. **Pheromone Chamber 3** unlocks the research **Nuptial Flight** (level 1 costs 4,000 Foliage, 8,000 Protein, 4,000 Nectar; each level doubles).
2. **Brood Hall 4 + Nuptial Flight 1** unlock the **Winged Queen** caste (1,000 Foliage, 2,000 Protein, 1,000 Nectar). She is slow, barely fights, and carries up to 500.
3. Send her on a **Found Colony** mission to an empty spot.

## How many colonies
- **1 + Nuptial Flight levels, rounded up to the next odd level:** level 1 → 2 colonies, level 3 → 3, level 5 → 4, and so on (`coloniesPer2Levels` in the research data: +1 at levels 1, 3, 5…).
- Queens already in the air count, so a player can't send two queens for one free slot.
- Research is account-wide, so the cap is too.

## Found Colony mission
- **Exactly one Winged Queen**, plus any escort units and cargo you like. Everyone who goes **stays** at the new colony (like Relocate). The queen is used up: she becomes the new Queen's Chamber.
- **Target:** any empty colony spot (1–12) in any patch of the world. Not the wilds (spot 13), not an occupied spot. Distance only costs travel time and Nectar, as for every mission.
- Uses a normal mission slot, pays Nectar for the trip, and can be recalled before it lands.
- **On landing**, if the spot is still free and the player is still under the cap:
  - A new colony appears: **Queen's Chamber 1**, the same starting stores as a new player (500 Foliage, 500 Protein) **plus whatever was carried**, and the escorts as its first units.
  - Its terrain and space come from the spot (see [04-colony](04-colony.md) § Terrain), plus Deep Digging. Choosing the spot is the strategic choice: a Rotting Log for Protein, a Creek Bank for Nectar.
  - It's named "*player*'s Nest 2" (3, 4…) and can be renamed.
  - It gets its own nest events, and the patch gets a wild nest if it had none ([17-wild-nests](17-wild-nests.md)).
  - A report says where it was founded.
- **If the spot was taken** while she flew (or the cap was reached), the flight turns back and everyone comes home. Nothing is lost but the Nectar.

## Running several colonies
- Each colony has its own chambers, stores, units, defenses, build queue and Brood Hall queue. Research is shared, and only one research runs at a time for the whole account.
- Switch colony from the picker in the top bar.
- Move resources between colonies with **Transport** (units come back) and units with **Relocate** (units stay).
- Points count every colony. The bash limit counts raids per target colony ([10-pvp-rules](10-pvp-rules.md)).
- **Protection is per player.** A new colony shares the player's status: no fresh 72 hours, so an experienced player can't hide behind a new nest.
- **Nothing is destroyed for good** (pillar 2): a raided colony loses food and units, never chambers or the colony itself.

## Open Questions
- Should a brand-new colony get a short protection window of its own (e.g. 12 h), so a far-flung nest isn't raided before its first chamber?
- Should a queen be able to fail the flight (birds, rain), as real queens often do? Proposal: no; a lost 4,000-resource queen with no counterplay feels bad (pillar 2).
- Starting stores: same as a new player, or nothing but what was carried?
- Cap: is "+1 at levels 1, 3, 5" the right pace once playtests show how fast players reach it?
- Abandoning or moving a colony: not possible yet. Needed when players regret a spot?
- Art: show the nuptial flight leaving the nest (alates are drawn in [18-art-direction](18-art-direction.md)) and the new colony's first dig.
