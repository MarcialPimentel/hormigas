# 26 — Reasons to come back (Build 12)

**Version:** 0.1
**Data:** [`data/needs.json`](data/needs.json), [`data/journal.json`](data/journal.json)
**Code:** `shared/src/stats.ts`, `shared/src/needs.ts`, `shared/src/journal.ts`; `server/src/game/stats.ts`, `server/src/game/comeback.ts`; `client/src/components/NeedsCard.tsx`, `client/src/screens/Journal.tsx`
**Issue:** [#124](https://github.com/MarcialPimentel/hormigas/issues/124)

## Why
The founding tasks end after the first few hours. After that nothing told a player what was worth doing today, the open question in [01-core-loop](01-core-loop.md). Windfalls and livelier events made each check-in busier; this build gives each **day** a shape and the long game something to fill in.

Three rules from the pillars:
- **Coming back is rewarding** (pillar 1), but **absence is never punished** (pillar 2): no streaks, nothing lost by missing a day.
- **No power gap** (pillar 3): needs pay a share of your own production, so they scale with you; journal rewards are cosmetic.
- **It's about ants** (pillar 4): the colony signals what it's short of; the journal is a naturalist's notebook.

## The counters
Everything here reads one set of lifetime counters per player (`player_stats`), bumped where things happen: forage parties home, food carried home, digs and research finished, Protein hauled from corpses, scout reports, fights won in the wilds (by species), swarms beaten, raids held off, windfalls and herds claimed, honeydew from herds, colonies founded, truces, supercolonies, nest gifts and needs met. A few are worked out from the colonies instead: ants raised (each colony keeps a tally as they hatch, since hatching is computed, not an event), chamber levels across colonies, how many kinds of ant you have raised, and how many colonies you rule.

When Build 12 went live, the counters were filled in from existing reports, the raid log, chambers and research, so nobody's journal started empty. Ants raised start from the ants each colony had.

## Colony needs (the daily tasks)
- **3 needs a day**, picked from the ones you can already do (a need for Scouts only once you have one; corpse hauling only once you have won a fight in the wilds). Unfinished needs from yesterday aren't given again.
- **A day** starts at 08:00 UTC (`dayStartsUtcHour`). At ×5 world speed a day is a fifth as long.
- A need counts **from the moment it was given**: "Bring home 3 forage parties" means three more.
- Goals grow with your highest Queen's Chamber (`scale`), so they stay a day's worth of play.
- **The reward** is 1.5 hours of your whole production (every colony together), at least 300 Foliage, 150 Protein and 50 Nectar, paid into the colony you're looking at. Same for every need, shown once at the top.
- **No streaks.** Unfinished needs keep for 2 days (today and tomorrow), then fade without a trace.
- **Swap**: once a day, trade one of today's open needs for another. The new one counts from then.
- No need ever asks you to raid a player: that would push the strong to farm the weak (pillar 2).

The list (goals for a young colony; they grow later): bring home 2 forage parties; carry home 1,500 food; finish 2 digs; raise 10 ants; finish a piece of research; haul 300 Protein of corpses; scout 2 places; win a fight in the wilds; claim a windfall (offered once you have any 3 Workers, Media Workers or Haulers; before Build 17 it needed 3 Workers); bring home 100 Nectar from aphid herds. Numbers are in `needs.json`.

## Yesterday in the colony
At the first visit of each day the counters are noted down. The needs card opens with what went up since the day before: "Yesterday in the colony: 2,500 food carried home · 6 ants raised · 2 digs finished …". **Got it** hides it until tomorrow. If you skipped days, it says "The last 3 days in the colony".

## The Field Journal
A new **Journal** tab: a naturalist's notebook of 40 pages in three sections (37 at launch; Build 18 added the dead beetle, sugar spill and picnic crumbs).
- **Discoveries** (one stage): each wild species beaten (Pavement, Fire, Carpenter, Honeypot and Trap-jaw Ants, Termites, the Trapdoor Spider), each kind of windfall claimed, and **The roster** (kinds of ant raised, three stages).
- **Deeds** (three stages: sketch → full entry → coloured plate): Leaf Garden, Hunting Grounds and Aphid Pasture levels, digs, ants raised, research, forage parties, food carried home, corpses hauled, places scouted, fights won in the wilds, swarms beaten, raids held off, windfalls claimed, honeydew, colonies, needs met, nest gifts; plus a truce and a supercolony (one stage).
- **Termites grows with you** (Build 18, [#205](https://github.com/MarcialPimentel/hormigas/issues/205)): three stages, at 1, 10 and 50 mounds beaten, and the title grows with it: *Mound-breaker → Termite-hunter → Bane of the Mounds* (`titles` in `journal.json`; names to confirm). Pick the page in the Journal and you wear the title of the stage you've reached. The Trapdoor Spider page goes to every member of an alliance raid that beats one ([#207](https://github.com/MarcialPimentel/hormigas/issues/207)).
- **Oddities** (hidden until they happen): the Boot, a spider ambush, a rainstorm, a shortcut, a lost trail, a dead lizard. Never needed for anything.

Rules that keep it achievable, eventually:
- **Counts are across all your colonies.** Space caps one colony, so "60 levels of Leaf Garden" is reachable by spreading out.
- **No page depends on your ground** or on luck you can't influence. Rare things are hidden oddities, not requirements.
- **A page once written stays written**, even if a count drops later.

**Titles:** each page has a title (Gardener, Swarm-breaker, Boot-dodger …), yours from its first stage. Pick one in the Journal; it shows beside your name in the Rankings. Cosmetic only.

New pages are marked **New** and counted on the Journal tab's badge until you open it.

## Not in this build
- **Diapause** (vacation mode): backlog. With a handful of players nobody needs it yet ([10-pvp-rules](10-pvp-rules.md#vacation-mode)).
- Weekly rankings: not wanted (Marz, 1 Nov 2026).
- Push notifications outside the tab: separate ([#24](https://github.com/MarcialPimentel/hormigas/issues/24)).

## Open Questions
- Is 1.5 hours of production per need (4.5 hours a day if all three are done) the right pull without making needs feel mandatory? Tune `rewardHours` after playtest.
- Is 08:00 UTC the right time for a new day for the playtest group?
- More journal pages later: per-caste pages, chamber pictures that change with the stage, and art for the windfalls and oddities, which borrow existing pictures for now.
