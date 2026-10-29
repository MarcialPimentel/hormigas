# 20 — Army-ant swarms

**Version:** 0.1
**Data:** [`data/npc.json`](data/npc.json) (`swarm`)

Every now and then a column of army ants marches out of the wilds toward a colony. It's announced hours ahead, so the player makes a real choice: keep the army home and fight, or send it away and let the swarm take some food. Army ants really do raid other ant colonies (pillar 4), and the threat makes the world feel alive between player raids.

## Decisions (Marz, 27–29 Oct 2026)
- **An army-ant swarm**, a new roaming enemy, not more raids from the patch's wild nest, so it feels different.
- **4 hours' warning.** Players check in a few times a day, so most see it coming.
- **About once every 4 days per colony** (each colony has its own schedule). More colonies means defending more often: expanding is a commitment.
- **Beatable:** a colony that keeps its army home wins about 70% of the time.
- **Beating it leaves corpses to haul**, like any battle. No bonus gift.
- **Nothing is ever destroyed for good** (pillar 2): a swarm takes unprotected food and kills units, never chambers, brood or the colony.

## Rules
- Each player colony has one pending sighting, every **72–120 hours** at world speed ×1 (÷ world speed). When it comes due, a swarm sets off from the patch's wilds (spot 13) and lands **4 hours** later.
- **Skipped** (the schedule carries on) while the player has new-colony protection, when the player is inactive (7 days), or if a swarm is already on its way to that colony.
- **Size.** When the swarm is spotted, the server simulates the battle against what the colony has at home (units, defenses, research) and picks the biggest swarm the colony still beats about 70% of the time (`defenderWinRate`, 12 simulated battles). It's built from packs of 4 Minor + 1 Major Soldier. A colony with nothing at home meets the smallest swarm (one pack). Units raised or sent away after the sighting change the odds: that's the choice.
- **The fight** uses the normal raid rules ([08-combat](08-combat.md)): loot only from unprotected stores (the Honeypot Gallery protects its share, [03-economy](03-economy.md)), corpses at the colony's spot, defenses may rebuild. The defender gets a battle report "… attack by Army ant swarm".
- **Afterwards** the survivors and whatever they took march on. Nothing comes back, and there's no "attacker" to raid in revenge.
- Players can't send swarms, and swarms don't count toward anyone's bash limit.

- **First swarms on the live world** (Marz, 29 Oct 2026): brought forward once, by migration `007_first_swarms_soon.sql`, to be spotted 2–24 h after that deploy instead of 72–120 h, so players meet one within about a day. After that, the normal schedule.

## How players see it
- A pop-up (or a browser notification in the background) the moment it's spotted, and "Raid incoming!" in the tab title.
- **Happening now:** "Army ant swarm incoming out of the wilds — N ants", the countdown, and a line explaining the choice.
- **Nest view (2D and 3D):** a long red column of army ants ([18-art-direction](18-art-direction.md): slim, leggy, blind, one sickle-jawed major in five) walking in along the surface from the wilds' side, a "Swarm" timer above it, and the red alarm ring at the entrance. The column shows one ant per 3 in the swarm, at least 6 and at most 30 (a raid shows up to 10).
- **Map:** the colony's spot says the swarm is coming.

## Open Questions
- Should the swarm's size use the army at the moment it lands rather than when it's spotted? (Today: spotted, so the player's preparation counts.)
- Should a colony that beats several swarms in a row get a small reward (a milestone, a title)?
- Swarms and colonies far from home: should a brand-new colony get a grace period before its first swarm? (Today it gets the normal 72–120 h.)
