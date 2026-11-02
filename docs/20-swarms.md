# 20 — Army-ant swarms

**Version:** 0.1
**Data:** [`data/npc.json`](data/npc.json) (`swarm`)

Every now and then a column of army ants marches out of the wilds toward a colony. It's announced hours ahead, so the player makes a real choice: keep the army home and fight, or send it away and let the swarm take some food. Army ants really do raid other ant colonies (pillar 4), and the threat makes the world feel alive between player raids.

## Decisions (Marz, 27–29 Oct 2026)
- **An army-ant swarm**, a new roaming enemy, not more raids from the patch's wild nest, so it feels different.
- **4 hours' warning.** Players check in a few times a day, so most see it coming.
- **About once every 4 days per colony** (each colony has its own schedule). More colonies means defending more often: expanding is a commitment. _Changed 1 Nov 2026: every 1.5–2.5 days._
- **Beatable:** a colony that keeps its army home wins about 70% of the time.
- **Beating it leaves corpses to haul**, like any battle. No bonus gift. _Changed 1 Nov 2026: beating it also leaves the prey it was carrying (see Rules)._

## Decisions (Marz, 1 Nov 2026)
- **More action:** swarms come every **36–60 h** instead of 72–120 h.
- **Beating one pays:** the army ants drop the prey they were carrying.
- **Nothing is ever destroyed for good** (pillar 2): a swarm takes unprotected food and kills units, never chambers, brood or the colony.

## Decisions (Marz, 2 Nov 2026): Build 13, Scout the swarm
- **Don't say it's sized to you.** The card no longer explains that the swarm is "sized so the army you have at home usually wins". It says an army **roughly the size of your colony** is marching in.
- **The size is hidden until scouted.** Before scouts reach it, the card, the nest and the map show "?" instead of the number (the column is still drawn about the right size).
- **Scout the swarm.** Players can send Scouts out to meet the column. Scouts shouldn't just walk up unthreatened, so the chance is shown before they go, like a raid's odds: **each Scout rolls on its own**, the report gets back if any of them do, and army ants eat the rest. More Scouts, Scent Reading and Chemical Mimicry raise the odds.
- **A good report shows size, make-up and live odds:** the real ant count, how many Minors and Majors, and the colony's win / draw / lose odds against it with the ants at home right now, updating as the player raises soldiers or sends them away (pillar 5).

## Decisions (Marz, 2 Nov 2026): Build 14, Swarm sizes
Playtest: Marz's main colony (about 44k of ants and 44k of defenses, twice the swarm's worth) beat a swarm of 64 Minors and 16 Majors and still lost 40,300 of ants, about 91%. Re-run 3,000 times with the real combat code it won every time and lost about 35k on average. Two causes: every swarm bite kills one ant, so losses follow how many bites the swarm gets rather than how strong you are, and the old sizing (the biggest swarm you beat 70% of the time) meant a "win" cost nearly the whole army. Corpses and 4 hours of Protein didn't make up for it.
- **Three sizes, rolled at each sighting, hidden until scouted:** a **foraging column** (60%), a **war column** (30%) and, now and then, a **great swarm** (10%). Most are survivable; any one might be the big one. Marz turned down a single "always about 30% losses" size: there must be a real chance of losing at any army size, so players fear the swarm and spend on soldiers and defenses.
- **Winning pays:** the prey is **75% of the swarm's worth in mixed food** (like the 75% wild nests give up), at least 4 hours of your own production, and it can go over the storage cap.
- **Handling Workers stays manual.** A standing-orders idea (#158) was turned down: when a swarm is coming, moving Workers and carriers out of harm's way is the player's call.
- **Who gets hit in battle** (the deeper cause) is parked as research in [#159](https://github.com/MarcialPimentel/hormigas/issues/159).

## Rules
- Each player colony has one pending sighting, every **36–60 hours** at world speed ×1 (÷ world speed). When it comes due, a swarm sets off from the patch's wilds (spot 13) and lands **4 hours** later.
- **Skipped** (the schedule carries on) while the player has new-colony protection, when the player is inactive (7 days), or if a swarm is already on its way to that colony.
- **Size.** When the swarm is spotted, the sighting rolls one of three sizes (`npc.json` → `swarm.sizes`). The server then simulates the battle against what the colony has at home (units, defenses, research), 24 battles per try (`trials`), and picks the biggest swarm that still fits that size:

  | Size | Chance | The colony, keeping what it has at home, ... | Typically |
  |---|---|---|---|
  | Foraging column | 60% | wins at least 95% of the time and loses at most 30% of its ants' worth | wins, loses about a quarter of its ants |
  | War column | 30% | wins at least 90% of the time and loses at most 60% | wins, loses about 55–60% |
  | Great swarm | 10% | wins at least half the time | wins 50–80% of the time, and loses nearly every ant either way |

  "Loses" counts the ants lost plus the 30% of knocked-down defenses that don't rebuild, against the worth of the ants at home (a colony with no ants measures against that 30% of its defenses). Near the top, one more pack takes about 20 points off the win chance, so a great swarm lands between a coin flip and about 4 in 5. Swarms are built from packs of 4 Minor + 1 Major Soldier; the smallest party is 2 Minor Soldiers (`smallest`), which is what a colony with nothing at home meets. Units raised or sent away after the sighting change the odds: that's the choice.
- **The fight** uses the normal raid rules ([08-combat](08-combat.md)): loot only from unprotected stores (the Honeypot Gallery protects its share, [03-economy](03-economy.md)), corpses at the colony's spot, defenses may rebuild. The defender gets a battle report "… attack by Army ant swarm (war column)", naming its size.
- **Prey:** a colony that wins keeps what the swarm was carrying: **75% of the swarm's worth** (`prey.pctOfWorth`) in mixed food, 55% Foliage / 30% Protein / 15% Nectar (`prey.mixPct`), and never less than 4 hours of the colony's own total production (`prey.minHours`) or 300 (`prey.min`). It can go over the storage cap, like mission cargo. It arrives as a report, "The swarm dropped its prey". With corpses hauled, a colony that keeps its army home comes out ahead over many swarms (about +10k a swarm for a 44k army, +20k for a day-14 army); without hauling, it's slightly behind. Before 2 Nov 2026 the prey was 4 hours of production as Protein, up to free storage.
- **Afterwards** the survivors and whatever they took march on. Nothing comes back, and there's no "attacker" to raid in revenge.
- Players can't send swarms, and swarms don't count toward anyone's bash limit.

### Scouting the swarm
- While a swarm is on its way to one of your colonies, **Scouts sent at that colony** (from it or from any of your colonies) go out to meet the column. It's an ordinary Scout mission: a mission slot, Nectar fuel, Scouts only. Any other time, scouting your own colony is refused.
- **Each Scout slips past on its own** with `basePct` 30%, plus `perScentReadingPct` 10% per Scent Reading level and `perMimicryPct` 10% per Chemical Mimicry level, up to `maxPct` 90% (`npc.json` → `swarm.scouting`). Army ants are nearly blind and hunt by smell, so the scent research is what helps (pillar 4).
- The Missions form shows the odds before you send: the chance one Scout gets back, the chance **a report** gets back (`1 − (1 − p)^scouts`), and how many Scouts you'll likely lose. More Scouts make a report likelier and cost more Scouts; each is 100 Protein.
- **On arrival:** if any Scout gets back, the swarm is **scouted** for good (it can't change after it's spotted): a scout report gives which size it is (foraging column, war column or great swarm), its real count and make-up, and the colony's swarm card shows them with live odds. Survivors walk home; the rest are eaten. If none get back, the report says so and the swarm stays unknown; you can try again until it lands. Scouts that arrive after it landed find nothing and come home.
- Scouting a swarm doesn't count as scouting a colony (no discovery, no Field Journal "scouted" count).

- **First swarms on the live world** (Marz, 29 Oct 2026): brought forward once, by migration `007_first_swarms_soon.sql`, to be spotted 2–24 h after that deploy instead of 72–120 h, so players meet one within about a day. After that, the normal schedule.

## How players see it
- A pop-up (or a browser notification in the background) the moment it's spotted, and "Raid incoming!" in the tab title.
- **Happening now / Under way:** "Army ant swarm incoming out of the wilds", the countdown, and the line: *"Army ants are marching in from the wilds. Most are foraging columns your soldiers can handle, some are war columns that cost dearly, and now and then a great swarm comes that could overrun your colony. Beat it to keep its prey and haul the corpses, or send your soldiers away and let it take some unprotected food. It never touches chambers."* (Build 13's "roughly the size of your colony" line was replaced in Build 14.) Until it's scouted the size shows as "? ants", with a **Scout the swarm** button that opens the Missions form aimed at it. Once scouted, the card is titled "Army ant swarm: war column" (or its size) and says "It's a war column, a hard fight that will cost you. Your scouts saw N army ants: … Minor Soldiers and … Major Soldiers", and a win / draw / lose bar for the colony with the ants at home now (on the colony's own screen; another colony's swarm offers to switch to it).
- **Nest view (2D and 3D):** a long red column of army ants ([18-art-direction](18-art-direction.md): slim, leggy, blind, one sickle-jawed major in five) walking in along the surface from the wilds' side, a "Swarm" timer above it, and the red alarm ring at the entrance. The 2D column shows one ant per 3 in the swarm, at least 6 and at most 30 (a raid shows up to 10). The 3D nest shows the swarm at its real size up to 1,500 ants, a wide jostling river of army ants, with the number on its label once scouted ("?" before; [18-art-direction](18-art-direction.md) § In 3D). On the **3D Patch** it comes on as a fan-shaped front with insects fleeing ahead of it, and when it reaches your mound the battle plays out there from its report: the dead fall on their backs round by round, then the swarm breaks into the nest or the survivors melt away.
- **Map:** the colony's spot says the swarm is coming.

## Open Questions
- Should allies' soldiers holding position at the colony count in the swarm's live odds? (Today: the odds count the colony's own ants and defenses only; held allies still fight.)
- Should the swarm's size use the army at the moment it lands rather than when it's spotted? (Today: spotted, so the player's preparation counts.)
- Should a colony that beats several swarms in a row get a small reward (a milestone, a title)?
- Swarms and colonies far from home: should a brand-new colony get a grace period before its first swarm? (Today it gets the normal 72–120 h.)
