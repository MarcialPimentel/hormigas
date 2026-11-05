# 23 — Truces and Supercolonies

**Version:** 0.1
**Data:** [`data/diplomacy.json`](data/diplomacy.json), [`data/research.json`](data/research.json) (`supercolony`), [`data/trade.json`](data/trade.json) (trade trails)
**Code:** `shared/src/diplomacy.ts` (rules), `server/src/game/diplomacy.ts` (the record), migration `010_supercolonies.sql`; trade trails in `shared/src/trade.ts` and `server/src/game/trade.ts`

## Why
Marz (29 Oct 2026) wants more player interaction than raiding, modelled on 4X games like Civilization: **you meet someone before you can deal with them, and deeper pacts come later**. Real ants give the ladder its shape. Colonies recognise each other by smell. Argentine ants form **supercolonies**: millions of nests that share one scent and never fight each other (pillar 4).

This is **stage A** of [#68](https://github.com/MarcialPimentel/hormigas/issues/68). Stage B (joint raids, trade trails, a members' message board) waits for the NPC bosses (#67) and the Protein build's trade rules (#65), so nothing is built twice.

## The ladder
| Step | What it takes | What it gives |
|---|---|---|
| **Contact** | One of you has scouted a colony of the other ([22-discovery](22-discovery.md)) | You can offer a truce or a supercolony invitation. Gifts (Send) work as before, to colonies you know |
| **Truce** | One side offers, the other accepts. Nothing else needed | Neither side can raid the other |
| **Supercolony** | The **Supercolony** research, for the founder and for everyone who joins | Up to 6 players share one scent: no raiding each other, members know all each other's colonies, soldiers can **hold position** at a mate's nest |

How OGame and Civilization compare, and why we sit in between: OGame lets anyone make or join an alliance with no research, which lets a few huge alliances run a server. Civilization makes trade and peace early but alliances need a mid-game technology on both sides. Hormigas follows Civ: small dealings are free, the shared scent is researched, and the research sits next to colonization so it's reachable in the first week, not the first month.

## Contact
- **Contact works both ways.** Discovery is one way (you scout, they only smell you), but once either side has scouted the other, both can talk. A player who was scouted can answer with a truce offer instead of a raid.
- Wild nests and army-ant swarms have no diplomacy.

## Truces
- **Offer** to any player you've met. They **accept** or **decline**; you can **withdraw** while it waits. One open truce (or offer) per pair.
- **Active:** raids are refused both ways with the reason ("You have a truce with this colony…"). Scouting and sending are still allowed.
- **Pact scouts are visitors.** While a truce (or its notice) or a shared scent (or its fade) lasts, the other side's scouts show as "Visiting scouts" with the pact beside the sender's name, not as enemy scouts. They are never caught or killed, and the hosts always get a report naming who looked ("bee's scouts visited …"), so scouting a partner before a betrayal is always seen. Report detail still follows Scent Reading as usual.
- **Ending takes notice.** Either side can give notice at any time. Raids stay off for **24 hours** (`truceNoticeHours`), then the truce ends and both get a report. A truce can't be broken instantly, so a betrayal is always telegraphed.
- **Raids already on their way** when a truce (or a shared scent) starts turn back on arrival without a fight: "Your soldiers smelled the truce". Nothing is lost but the Nectar.

## Supercolonies
- **Found:** needs the Supercolony research. Give it a name (3–24 characters, unique in the world). The founder is its first member.
- **Invite:** any member can invite a player they've met. The invitation waits until answered or withdrawn.
- **Join:** needs the Supercolony research too, and not already belonging to (or fading from) a supercolony. At most **6 players** (`supercolonyMaxMembers`); a leaving member still holds their seat until their scent has faded.
- **A shared scent hides nothing:** on joining, members know every colony of every other member, and a member's newly founded colony is known to the others at once.
- **On the map,** a known colony shows its owner's supercolony name, and your pact with them ("Supercolony mate", "Truce", "Shared scent fading · 2 days left"). Raid is greyed out with the reason.
- **The founder** can remove members. If the founder leaves, the role passes to the longest-standing member. When the last member leaves, the supercolony dissolves and its name is free again.

### Hold Position
- A new mission: send soldiers to a **current** supercolony mate's colony. They stay there (status *holding*) until recalled, using one mission slot the whole time.
- **They fight in every battle at that colony,** player raids, wild-nest raids and army-ant swarms alike, beside the colony's own units and defenses. Each owner's units fight with their own research. Losses are counted per owner, the corpses go on the field as usual, and loot only ever comes from the host's stores.
- The host, the attacker and every garrison owner get the battle report; garrison owners see their own soldiers' part. Scout reports list allied soldiers holding position, and the battle preview counts them (unboosted, since their owner's research isn't scouted).
- **Recall** brings them home; the trip back takes as long as the trip out.
- Their units still count toward their owner's points while away, as for any mission.

## Breaking up is slow
- **Leaving** (or being removed) starts a **scent fade of 3 days** (`scentFadeHours`). Until it ends, raids between the leaver and the supercolony's members stay off both ways, and the leaver can't found or join another supercolony.
- **Soldiers holding position** on either side (the leaver's at mates' nests, and mates' at the leaver's) turn for home at once: a garrison inside a former ally's nest is too dangerous to leave.
- When the fade ends, everyone involved gets a report and raids are possible again (all the usual PvP rules apply).

## Trade trails (Build 16)
Real ants lay pheromone trails between nests and walk them for days, carrying food both ways (pillar 4). Modelled on Civilization's trade routes ([#98](https://github.com/MarcialPimentel/hormigas/issues/98), Marz 30 Oct and 5 Nov 2026): a trail is income you set up once and renew, and peace makes it pay more.

- **A new mission, Trade trail.** Send a caravan of **Workers, Media Workers or Haulers** to another colony: **one of yours**, or a **player's** you have met (scouted) and have a **truce** or a **shared scent** with. A truce in its notice period or a fading scent opens no new trails.
- **One trail per colony,** a slot pool of its own like forage parties: it doesn't use a mission slot. A caravan walking home still holds the slot. More trails from research later (`trade.json` → `trailsPerColony`).
- **The caravan stays 3 days** (`trailHours` 72) at the far end; its ants are away from home the whole time (no defending, foraging or fighting). Fuel is paid once, as for any mission.
- **Every 6 hours** (`deliverEveryHours`) one scheduled event brings home goods, 12 deliveries in all, then the caravan walks home on its own and the colony can open a new trail. Computed, not ticked, like aphid herds: it runs offline.
- **What comes back depends on the destination's ground** (`trade.json` → `goods`):

| Ground | Brings back |
|---|---|
| Sunny Meadow | Foliage |
| Sandy Soil | Foliage |
| Rotting Log | Protein |
| Creek Bank | Nectar |
| Grassland | A bundle: half a share each of Foliage, Protein and Nectar |

- **How much:** each delivery is `share × the destination's own production of that good per hour (world speed 1) × 6 h × the distance factor`, never more than the caravan carries (bring more carriers to carry it all). The destination **loses nothing**: the goods are what the trail adds, not what it takes.
  - **Share** by who it goes to: your own colony **15%**, a truce partner **25%**, a supercolony mate **30%** (peace pays).
  - **Distance factor:** `1 + distance ÷ 10,000 × 0.5`, at most ×2. Same patch about ×1.05, the next patch ×1.14, another region ×2: a long trail pays more.
  - **Example** (own trail to a Creek Bank colony with Aphid Pasture 8, about 1,060 Nectar an hour there): about 1,000 Nectar a delivery, 12,000 over the trail, if the caravan can carry it (3 Media Workers can).
- **On a player trail both sides gain:** the host gets **half the delivery's total** (`partnerShare`) in the goods of the **sender's** ground, every delivery. So two players trading both ways each get a share of the other's specialty.
- **When a pact ends,** the trail keeps going through the notice or the fade (raids are still off), then closes at the next delivery; the caravan walks home and both sides get a report.
- **Call home** from Under way ends the trail early; nothing more arrives.
- **Reports:** the sender when the trail opens and when it closes (with totals); the host when it opens (what they'll gain) and when it closes.
- **On the maps:** in the Whole Yard, a caravan holding its trail walks to and fro along it, ants heading home carrying a gold load (`march.json` → `yard.tradeLeg`, seconds a leg). A player's caravan coming to you shows as "Trade caravan from …".
- **Not built:** plundering caravans (decided: later, with joint raids), more trails from research, a trail upkeep.

### Decisions (Marz, 5 Nov 2026)
- **Trails now, joint raids next build.** Build 16 is own and player trade trails; joint raids and the members' board are Build 19 (Builds 17 and 18 went to cargo ants and goals in the wilds). Reason: each is a large change with its own playtest (joint raids need two accounts in a supercolony).
- **One trail per colony, research for more later.** With today's player count one each is plenty; add a research once trails are used.
- **Grassland sends a bundle, Sandy Soil sends Foliage.** Every trail brings food, and a trail to the ground most players start on still pays.
- **No plunder yet.** Ship peaceful trails first; ambushing caravans needs scouting caravans and open-ground fights, so it can come with joint raids.
- Decided in the build (Marz may overrule): trails use their own per-colony slot, not a mission slot; the host gains half the delivery in the sender's goods; the destination never loses anything; numbers are first-pass for playtest.

## World speed
All the times above are at world speed ×1 and divide by the world speed, like every other duration: at ×5 a truce's notice is about 5 hours and a scent fades in about 14 hours.

## The record (for other builds)
Four new tables, read and written only through `server/src/game/diplomacy.ts`:

| Table | One row per |
|---|---|
| `truces` | Truce or offer between two players (`player_a < player_b`); `status` proposed / active / ending / ended / declined / withdrawn, `ends_at` when notice was given |
| `supercolonies` | Supercolony: name, current founder, `dissolved_at` |
| `supercolony_members` | Time a player joined; `status` member / fading / gone, `fade_until` |
| `supercolony_invites` | Waiting invitation |

- `relationsOf(q, playerId, others)` returns `ally | fading | truce | truce_ending` (with `until`) per other player, and `raidBlock(...)` the reason a raid is refused. The raid check and the map use these.
- `inContact(q, a, b)` is the contact rule.
- Hold Position is a mission (`type = 'hold'`) whose status becomes `holding` on arrival; no new column.
- Discovery gets one new `via` value, `ally`, for colonies learned by sharing a scent.

### Notes for stage B
- **Joint Raid:** missions from several members that wait at a muster point and arrive together, fought as one attacker with per-owner groups. `simulateBattle` already supports per-owner groups on the defending side (`allies`); the attacking side needs the same. Bosses from #67 are the natural targets.
- **Trade trails** shipped in Build 16 (above). A trail is a mission (`type = 'trade'`) that is `holding` while it runs; its totals live in `missions.result`, and one `trade_deliver` event at a time carries its delivery number (`n`), so an old event after a recall does nothing. No migration.
- **Plunder** (Build 19 or later): players without a truce ambush a caravan they've scouted.
- **Declared wars** (lifting the bash limit between enemies, [10-pvp-rules](10-pvp-rules.md)) are not built.

## Launch on the live world (migration 010)
- New tables and one new index only. No existing row changes; safe to run twice.
- Nobody starts in a truce or a supercolony. The Supercolony research becomes available to anyone with Pheromone Chamber 3, Nuptial Flight 1 and Colony Mind 1; nothing anyone already has changes.

## Decisions (Marz, 29 Oct 2026)
- **Two stages.** Stage A: contact, truces, supercolonies, slow break-up, Hold Position. Stage B: joint raids, trade trails, members' board. Reason: stage B depends on #65 and #67, and a smaller first step is safer on the live world and easier to playtest.
- **Small dealings free, deep pacts researched, like Civilization.** Contact, gifts and truces need nothing more than having met. Supercolonies need research.
- **The Supercolony research moves to around colonization:** Pheromone Chamber 3, Nuptial Flight 1, Colony Mind 1, costing about what Nuptial Flight 1 does (listed 5,000 / 6,000 / 5,000; since 5 Nov 2026 players pay 3,560 / 6,220 / 6,220, [07-research](07-research.md#what-research-costs-protein-and-nectar)), one level only. It was the tree's final goal (Pher 6, Nuptial Flight 5…), weeks away for most players.
- **Founder and joiners both need it.** Everyone in a supercolony has passed the colonization stage, and a brand-new player can't be pulled in on day 1.
- **Truce notice 24 hours; scent fade 3 days.** Long enough for the betrayed side to log in and react, short enough not to trap people.
- **6 players per supercolony.** With today's player count a bigger cap would let one supercolony hold most of the world, leaving nobody to raid.
- **Pact scouts are never killed, always seen** (30 Oct 2026, after a playtest showed a truce partner's scouts as "Enemy scouts"). Killing a partner's ants goes against the truce, and an always-reported visit keeps a betrayal telegraphed.
- Decided in the build (Marz may overrule): allies hold position regardless of strength difference; declared wars wait; the founder can remove members, who fade like anyone leaving; Hold Position uses a mission slot.

## On the map
In the 3D Garden ([11-world](11-world.md)), patches where your supercolony mates live are teal lights, with teal threads from your own patch; on the 3D Patch, a mate's mound flies a teal flag. Only members count: a mate whose scent is fading is no longer lit. The region map (`/api/map/region`) says `ally` per patch for this.

## Open Questions
- Should the host be able to send an ally's garrison home without leaving the supercolony? Proposal: yes, if playtests show unwanted garrisons.
- Should a truce offer expire if unanswered? Proposal: not until unanswered offers clutter the Allies screen.
- Trade trails: is 15 / 25 / 30% the right pay, and should a long trail or a supercolony mate pay more? Tune `trade.json` from playtest.
- Trade trails: should research add trails (a Scent branch level), and should players be able to see trails other players run near them?
- Should Hold Position cost Nectar over time (upkeep), so garrisons aren't free forever? Proposal: no for now; the mission slot is the cost.
