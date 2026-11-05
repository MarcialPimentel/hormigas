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
- **How often:** each site rolls every **8–16 h** (`everyHours`, ÷ world speed). It skips the roll if the last windfall is still there, or if no active player has a colony within **1 patch** (`announceRange`). A brand-new site gets its first drop within **0.5–3 h**, so a new area gets one quickly.
- **What drops:**

  | Kind | Chance | Food | Size |
  |---|---|---|---|
  | Dead grasshopper | 40% | Protein | ×1 |
  | Fallen fig | 30% | 60% Nectar, 40% Foliage | ×1 |
  | Leafy branch | 25% | Foliage | ×1 |
  | Dead lizard | 5% | Protein | ×3 |

  The pile is **4k / 10k / 18k / 30k / 45k / 70k** by site level, times the kind's size. The level follows the area's strongest active player, like aphid herds and wild nests, and never drops. The gathering multiplier doesn't apply: a windfall is the world's food, not the colony's own gathering.
- **Guards:** half the time (`guardChance`), wild ants got there first and guard it. There are a few Minor Soldiers at level 1, up to 80 Minor and 35 Major Soldiers at level 6.
- **Everyone nearby hears of it.** Players with a colony within 1 patch get a report ("Dead grasshopper in the wilds"). Everyone sees windfalls on the map **without scouting**: what it is, how much is left, when it rots, and who holds it. How many ants hold it takes a scout.
- **It rots after 12 h** (`lastsHours`). Whoever holds it carries one last load home; the rest is lost.

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
- **Map (2D and 3D patch):** a grasshopper (in 3D a cartoon dead grasshopper on its back, legs up, like the ants), fig, branch or lizard on spot 17, with a flag in your colour, another player's, or wild red when guarded. Empty sites show nothing.
- **Card:** what it is, food left, time until it rots, who holds it. **Claim** / **Fight for it** / **Send more ants**, **Call ants home**, **Raid**, **Scout**.
- **Reports:** a windfall dropped nearby (with **Show on the map**), your ants hold it, it was stripped clean, it rotted.
- **Battle reports** read "Fight for Dead grasshopper", and "your ants were driven off" for the side that lost it.

## Planned: wild ants come for windfalls
_[#206](https://github.com/MarcialPimentel/hormigas/issues/206), decided by Marz 5 Nov 2026. Numbers are placeholders._

Today wild ants only guard a windfall when it drops, so in a quiet area nobody contests it. Next, the wild nests nearby go out for food too, as real colonies do.

- **Wild nests send parties** to windfalls, whether just dropped or already held, including ones you hold.
- **Each species goes for the food it really eats**, so you can guess who's coming:

  | Windfall | Who comes for it |
  |---|---|
  | Fallen fig, sugar spill | Honeypot Ants |
  | Leafy branch | Termites |
  | Dead grasshopper, dead beetle | Pavement, Fire and Carpenter Ants |
  | Dead lizard, picnic crumbs | Any wild nest nearby |

- **The party comes out of the nest's own ants.** The nest is weaker at home while they're out, which is a chance to raid it.
- **If they win, they hold it** and haul loads home to the nest's store. Fight them off the windfall, or raid the store back.
- **Seen and warned:** the party marches on the Whole Yard and the 3D Patch. When it heads for a windfall you hold, you get "Wild ants coming for your windfall". There's no report otherwise, to keep reports quiet.
- **Spiders stay home**: they never raid.

**New kinds of windfall:**

| Kind | Food | What's different |
|---|---|---|
| Dead beetle | Protein | Hard shell, slow to strip |
| Sugar spill | Nectar | Rots fast |
| Picnic crumbs | Mixed, very large | Rare; draws every wild nest nearby |

## Open Questions
- Is 8–16 h per site too many? With 5 sites in reach, an active player sees a few drops a day. Watch whether reports feel like noise.
- ~~Should wild nests send parties to windfalls that are already held?~~ Decided (5 Nov 2026): yes, see Planned above.
- Should the 3D patch show the holders' column walking loads home every 2 h? (Today only the party going out and coming back is drawn.)
- War trails (standing raid orders that keep marching while you're away) are the next step towards constant marching. Design them with the trade-trail plumbing.
