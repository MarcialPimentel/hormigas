# 27 — A living world: what the long game is for

**Version:** 0.1 (proposal, nothing built)
**Issues:** [#144](https://github.com/MarcialPimentel/hormigas/issues/144) the Great Nuptial Flight, [#143](https://github.com/MarcialPimentel/hormigas/issues/143) the world calendar, [#145](https://github.com/MarcialPimentel/hormigas/issues/145) landmarks

## Why
After gathering ×2 and the "more action" tuning, resources run high, but Marz found little reason to keep going (2 Nov 2026). There's nothing big to spend on and nothing to beat. He asked what the end goal is in 4X games and OGame, and whether Hormigas should be a war game.

How similar games answer it:

| Game | End goal | What keeps people playing |
|---|---|---|
| Civilization | Several ways to win (conquest, science, culture, diplomacy, score) | Every play style has a finish line |
| Stellaris | Score at the end date, plus a late crisis that threatens everyone | A shared enemy and a climax |
| OGame | None; universes run for years | Rankings, alliances, revenge. Mostly the other players |
| Travian | Rounds of about 6 months that end in a race to build a Wonder; then the server restarts | The whole round builds to a known finale |
| Clash of Clans, Path of Exile | The world never resets; leagues and trophy races restart, your village or characters stay | A fresh race every month without losing anything |
| EVE Online | No reset; alliances fight over territory | Territory and politics |

A Travian-style reset was floated first. **Players rejected it (2 Nov 2026):** they want a living game and to keep their stuff. That's now a decision (see the Decision Log in [00-vision](00-vision.md)).

So Hormigas's end goal isn't an ending. It's **big moments that come round again in a world that never ends**, plus **goals that last forever**. Players fight over things, not to wipe each other out.

## Rules this design keeps
- **Nothing is ever wiped.** Colonies, chambers, ants, research and the Field Journal stay. Only a race's own scoreboard restarts.
- **War is the means, not the goal.** Fights are over brood, food and places, never to end a colony (pillar 2). With a handful of players, endless colony-against-colony war makes the losers quit.
- **Winning gives status, not power** (pillar 3): the Hall of Fame, titles, marks on the map.
- **It works with four players and with fifty.**
- **Not weekly rankings** (Marz, 1 Nov 2026): the flight is a once-a-cycle event with its own result; the Rankings tab stays as it is.

## 1. The Great Nuptial Flight
_Idea: [#144](https://github.com/MarcialPimentel/hormigas/issues/144)._ The recurring finale.

**Real basis (pillar 4):** once a year, mature colonies feed larvae extra protein to raise winged princesses and males, and every colony of a species flies on the same day.

- **The Royal Brood** opens in every colony for the last part of each cycle (about 7–10 days; placeholder). You pour Protein and Nectar into larvae over time to raise **alates**. They're scored, not kept, and are separate from the Winged Queen caste that founds your own colonies ([19-colonies](19-colonies.md)).
- **It's the sink the mid and late game lack.** Nectar is what research and travel run on, so windfalls ([25-windfalls](25-windfalls.md)) and aphid herds ([24-npcs](24-npcs.md)) become worth fighting over in the run-up.
- **Royal brood can be raided.** A raid can kill or carry off some of it (Slave-makers steal brood, which is real behaviour). A protected share, like the Honeypot Gallery, keeps it recoverable (pillar 2). War peaks in autumn, with a reason.
- **Flight day ("first frost")**: every colony's alates fly at once. Results per player and per supercolony.
- **Prizes:** a permanent Hall of Fame entry (section 3), a Field Journal page and title ([26-come-back](26-come-back.md)), and a mark on the winner's mound or banner until the next flight.

**Keeping it winnable.** Without resets, the biggest colony could win every time and everyone else stops trying. Recommended:
- Two lists: **Biggest flight**, and **Best flight for its size** (alates per Queen's Chamber level, or per point).
- A **supercolony** result, so small members matter.
- Side prizes: first royal brood raised, best-defended brood, most brood carried off.
- Size brackets only if the world grows well beyond a handful of players.

## 2. The world calendar
_Idea: [#143](https://github.com/MarcialPimentel/hormigas/issues/143)._ Spring, summer, autumn and winter, looping forever, the same for the whole world. About 4 weeks per cycle at ×1 (placeholder).

- **Mostly look, few rules:** the yard and patch change with the season (fresh green, full summer, autumn leaves, frost), and the music could follow it ([sound.md](sound.md)).
- **One light rule per season (to decide):** spring, founding is easier; summer, windfalls and swarms at their busiest; autumn, the Royal Brood and the flight; winter, a quiet stretch with fewer swarms and wild raids, a breather that pairs with Diapause in the backlog.
- **Shown in one line** on the top bar: "Autumn · 6 days to first frost" (pillar 5).

## 3. The Hall of Fame
Part of [#144](https://github.com/MarcialPimentel/hormigas/issues/144). A permanent record of every flight's winners (player, supercolony, size-fair winner, side prizes), shown beside the Rankings. It's the "legacy" a reset game gets from new worlds, without losing anything.

## 4. Landmarks
_Idea: [#145](https://github.com/MarcialPimentel/hormigas/issues/145)._ The goal that never ends: the "Wonders" row in [art/whole-yard.md](art/whole-yard.md).

- A few **landmarks** per region of the Whole Yard (an old stump, the garden tap, the compost heap…), on neutral ground and never at anyone's nest.
- **Held like a windfall or aphid herd:** station ants there, and anyone can attack the holders. Same code (`HeldState`), same neutral-ground rules: no new-colony or points protection, pacts still hold.
- **Holding gives** your (or your supercolony's) colour and name on the map and a Journal page; maybe a small, capped bonus (to decide; pillar 3).
- Best once the Whole Yard is the main screen.

## 5. Goals in the wilds
Decided by Marz, 5 Nov 2026. Beating a mound or a den felt hollow: the loot is more of what players already have, plus one Journal page. Each wild goal now gets a reward only it gives:
- **Termite mounds → the Matabele Ant**, a termite-hunting caste earned by beating 3 mounds, plus titles that grow ([#205](https://github.com/MarcialPimentel/hormigas/issues/205)).
- **Spider dens → alliance raids.** Too strong for any one player; beaten by joint raids, with credit to every member ([#207](https://github.com/MarcialPimentel/hormigas/issues/207)).
- **Windfalls → contested by the wilds.** Wild nests go out for windfalls too, and there are more kinds ([#206](https://github.com/MarcialPimentel/hormigas/issues/206)).
- **Not yet:** extra resources (trade goods, or materials only bosses drop). Revisit later.

## Order (recommended)
1. **Nuptial Flight with the calendar and the Hall of Fame**, as one build: it gives resources somewhere to go and war a reason now.
2. **Landmarks**, once the Whole Yard is the main screen.
3. War trails stay as planned ([15-roadmap](15-roadmap.md)).

## What this replaces
- The roadmap's "Seasons: world lifecycle with fresh worlds" idea. There are no fresh worlds; the calendar loops in the one world.
- The open question in [14-monetization](14-monetization.md) about a seasonal pass.

## Open Questions
- Cycle length: 4 weeks at ×1, or shorter while the world is small?
- How long is the Royal Brood window, what does it cost, and how much can one raid take?
- Is a once-a-cycle flight result fine alongside "no weekly rankings"?
- Prizes cosmetic only, or a small one-cycle perk?
- Should the flown queens seed new wild nests on the map, named after the winners, so the world visibly grows from each flight?
- Landmarks: cosmetic or a small bonus? Can wild nests or swarms take one back, so a quiet world still has a fight?
- A winter breather, or does it cut against "more action"?
