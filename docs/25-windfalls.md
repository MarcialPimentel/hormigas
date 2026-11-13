# 25 — Windfalls (contested food)

**Version:** 0.1
**Data:** [`data/npc.json`](data/npc.json) (`windfalls`, `area.sites.windfall`)
**Code:** `shared/src/windfalls.ts`, `server/src/game/windfalls.ts` (built on the aphid-herd code in `server/src/game/herds.ts`)

## Why
Marz wants more action right now: ants always marching out and coming home loaded, with plenty of fighting (1 Nov 2026). Player-vs-player raids give that, but in a small world they turn into the strongest colony farming the weakest, which breaks pillars 2 and 3.

Windfalls put the fighting **over food lying in the wilds, not at anyone's nest**. A dead grasshopper or a fallen fig drops between colonies, everyone nearby smells it, and whoever holds it hauls it home. Nobody's colony is ever at risk. Going is a choice, and the bodies left after a fight are Protein for whoever holds the ground.

This is real ant behaviour (pillar 4). Ants from neighbouring colonies race to large prey, recruit nestmates along a trail and fight over it. Big finds get carried home piece by piece.

## Decisions (Marz, 1 Nov 2026)
- **Contested food first**, ahead of "war trails" (standing raid orders). War trails come later, built on the trade-trail plumbing ([#98](https://github.com/MarcialPimentel/hormigas/issues/98)).
- **Shipped together with livelier random events** (more often, more generous) as one experiment: more action now, then see how it feels in playtest. See the Decision Log in [00-vision](00-vision.md).

## Rules
- **Where:** every patch within 2 of a player gets a **windfall site** (spot 17, in the wilds next to the herd, mound and den sites). It's empty until something drops.
- **How often:** each site rolls every **16–32 h** (`everyHours`, ÷ world speed; 8–16 h until 13 Nov 2026). It skips the roll if the last windfall is still there, or if no active player has a colony within **1 patch** (`announceRange`). A brand-new site gets its first drop within **0.5–3 h**, so a new area gets one quickly.
- **What drops:**

  | Kind | Chance | Food | Size |
  |---|---|---|---|
  | Dead grasshopper | 31% | Protein | ×1 |
  | Fallen fig | 23% | 60% Nectar, 40% Foliage | ×1 |
  | Leafy branch | 19% | Foliage | ×1 |
  | Dead lizard | 4% | Protein | ×3 |
  | Dead beetle, sugar spill, picnic crumbs | 23% together | see [below](#wild-ants-come-for-windfalls) | |

  The pile is **4k / 10k / 18k / 30k / 45k / 70k** by site level, times the kind's size. The level follows the area's strongest active player, like aphid herds and wild nests, and never drops. The gathering multiplier doesn't apply: a windfall is the world's food, not the colony's own gathering.
- **Guards:** half the time (`guardChance`), wild ants got there first and guard it. There are a few Minor Soldiers at level 1, up to 80 Minor and 35 Major Soldiers at level 6.
- **Everyone nearby hears of it.** Players with a colony within 1 patch get a report ("Dead grasshopper in the wilds"). Everyone sees windfalls on the map **without scouting**: what it is, how much is left, when it rots, and who holds it. How many ants hold it takes a scout.
- **It rots after 12 h** (`lastsHours`). Whoever holds it carries one last load home; the rest is lost.

- **Recruitment Trails** (Build 20, Harvest, max 3): the holder's loads come home **10% sooner per level** (every 2 h → 1 h 24 min at level 3). It is read as each load sets off, so a level learned while holding counts from the next load. Wild ants have no research. The windfall card, the send card and the "Your ants hold it" report show the holder's pace.

### Claiming it
- **Claim windfall** is a new mission. Send any ants: soldiers to win, carriers to haul.
- On arrival, if **nobody** is there, the party holds it.
- If **wild guards or another player's ants** are there, the party **fights them** under the normal battle rules ([08-combat](08-combat.md)). If it wins, the survivors hold it. Whatever they grabbed in the fight goes back on the pile, because they're staying to haul it. If it loses, the survivors walk home. The dead from both sides stay on the field as corpses, and anyone can haul them.
- **While held**, the holders carry a load home every **2 h** (`deliverEveryHours`): as much as they can carry, sent along the trail at once like an aphid herd's honeydew. When nothing is left, they all walk home.
- **More ants:** sending more from the same colony joins the holders. Another of your colonies can't join; it gets turned back.
- **Call them home** from the windfall's card. They carry what they can.
- **Raid** works too: fight the holders and carry one load home, without staying.

### Fair play (pillars 2 and 3)
- **Neutral ground.** Anyone who goes to a windfall can be fought there, so new-colony protection and the 20% points rule don't apply. Nobody's colony is ever touched, and you only risk the ants you chose to send.
- **Pacts still hold.** You can't fight a truce partner's or supercolony mate's ants for a windfall ([23-supercolonies](23-supercolonies.md)).
- The **bash limit** applies to raids on a windfall.
- Holders count toward your points, like herd tenders.
- The holders are warned when someone is coming to fight them for it ("Raid incoming on your windfall").

## How players see it
- **Map (2D and 3D patch):** a grasshopper (in 3D a cartoon dead grasshopper on its back, legs up, like the ants), fig, branch or lizard (in 3D a sandy cartoon lizard on its back, legs up, X eyes) on spot 17, with a flag in your colour, another player's, or wild red when guarded. Empty sites show nothing.
- **Card:** what it is, food left, time until it rots, who holds it. **Claim** / **Fight for it** / **Send more ants**, **Call ants home**, **Raid**, **Scout**.
- **Reports:** a windfall dropped nearby (with **Show on the map**), your ants hold it, it was stripped clean, it rotted.
- **Battle reports** read "Fight for Dead grasshopper", and "your ants were driven off" for the side that lost it.

## Wild ants come for windfalls
_Build 18 ([#206](https://github.com/MarcialPimentel/hormigas/issues/206)), decided by Marz 5 Nov 2026. Numbers in `npc.json` (`windfalls.wildParties`, `windfalls.kinds[].eaters`), first pass for playtest._

Before this, wild ants only guarded a windfall when it dropped, so in a quiet area nobody contested it. Now the wild nests nearby go out for food too, as real colonies do.

- **When a windfall drops**, a wild nest within **1 patch** whose species eats it sends a party after **1–4 h**, with a **60%** chance. A picnic always draws **3** parties. After each party sets off, another may follow (**35%**), until it rots.
- **Each species goes for the food it really eats**, so you can guess who's coming:

  | Windfall | Who comes for it |
  |---|---|
  | Fallen fig | Honeypot Ants |
  | Sugar spill | Honeypot and Pavement Ants |
  | Leafy branch | Termites |
  | Dead grasshopper, dead beetle | Pavement, Fire, Carpenter and Trap-jaw Ants |
  | Dead lizard, picnic crumbs | Any wild nest nearby |

- **The party is 40% of each kind of ant in the nest**, so the nest is weaker at home while they're out: a chance to raid it. It walks at half speed. A nest that already has a party out (or holding a windfall) sends no other.
- **It claims the windfall like a player.** Free: it holds it. Held by a player: it fights the holders under the normal battle rules. Held by wild ants (guards, or another nest's party): it turns round and walks home, because wild ants never fight wild ants. A windfall already held by wild ants draws no party at all.
- **It hauls loads into its nest's store** every 2 h, like a player. Wild ants carry 40 per ant on top of their castes' cargo (termites carry nothing otherwise). Fight them off the windfall, or raid the store back.
- **Seen and warned:** players see the windfall "held by" the nest, by name. When a party heads for a windfall you hold, Under way says **Wild ants coming** and the party marches on the Whole Yard and 3D Patch. There's no report otherwise, to keep reports quiet. Wild parties get no reports, counters or points.
- **Spiders stay home**: they never raid.

**New kinds of windfall** (weights out of 130 with the old four):

| Kind | Chance | Food | Size | What's different |
|---|---|---|---|---|
| Dead beetle | 12% | Protein | ×1.5 | Hard shell: each load carries only half the holders' cargo (`carryPct` 50) |
| Sugar spill | 9% | Nectar | ×0.6 | Rots in 4 h instead of 12 (`lastsHours`) |
| Picnic crumbs | 2% | 40% Foliage, 30% Protein, 30% Nectar | ×4 | Draws 3 wild parties, always |

Each has a Journal page: Dead beetle (*Shell-cracker*), Sugar spill (*Sweet-tooth*), and a hidden oddity for Picnic crumbs (*Picnic-raider*).

## Open Questions
- ~~Is 8–16 h per site too many?~~ Decided (13 Nov 2026): yes, a player back after a few days found 70+ reports. Now 16–32 h, so about one or two drops a day from the sites in reach.
- ~~Should wild nests send parties to windfalls that are already held?~~ Decided (5 Nov 2026): yes, built in Build 18 (above).
- Are the wild-party numbers right? Watch whether players feel they lose too many windfalls to the wild, or that quiet areas are still quiet. The dials are `wildParties.chance`, `repeatChance` and `partyShare`.
- Should the 3D patch show the holders' column walking loads home every 2 h? (Today only the party going out and coming back is drawn.)
- War trails (standing raid orders that keep marching while you're away) are the next step towards constant marching. Design them with the trade-trail plumbing.
