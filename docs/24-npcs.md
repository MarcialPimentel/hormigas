# 24 — More Wild Things (NPCs)

**Version:** 0.1
**Data:** [`data/npc.json`](data/npc.json) (`species`, `area`, `herds`, `scents`), [`data/castes.json`](data/castes.json) (NPC-only units)
**Code:** `shared/src/herds.ts`, `shared/src/nests.ts`, `server/src/game/nests.ts`, `server/src/game/herds.ts`
**Issue:** [#67](https://github.com/MarcialPimentel/hormigas/issues/67)

## Why
The world is sparse. Players usually fill it for each other, but there aren't enough players yet (Marz, 29 Oct 2026). Before this build each patch with players held one wild nest ([17-wild-nests](17-wild-nests.md)), and army-ant swarms came and went ([20-swarms](20-swarms.md)). Everything else was empty ground.

This build fills the area around players with **more, and more varied, wild things**. Each one asks for something different:

| Wild thing | What it is | What it asks of you |
|---|---|---|
| **Wild nests** (now 5 species) | Rival ant colonies | Scout to learn the species, then bring the right army |
| **Aphid herds** | Contested Nectar | Hold one with tenders. Defend it, or take one from a neighbour |
| **Termite mound** | Rich, heavily defended target | A mid-game goal worth a big army and many carriers |
| **Spider den** | Boss | A late-game goal. Later, a target for several players together |

All of them start as **scents** ([22-discovery](22-discovery.md)): you have to scout before you can raid or tend.

Real ants live like this (pillar 4). They fight neighbouring colonies and tend aphids for honeydew, termites are their oldest enemies, and spiders hunt them. Nothing here is ever a quit moment (pillar 2): wild things never destroy chambers, and losing a herd costs only the ants that tended it.

## Decisions (Marz, 29 Oct 2026)
- **All four kinds in this build.**
  - Aphid herds, a termite mound, two new wild-nest species (Honeypot Ants and Trap-jaw Ants), and a spider den boss.
  - The den is built so the Alliances build ([#68](https://github.com/MarcialPimentel/hormigas/issues/68)) can reuse it for joint raids instead of making its own boss.
- **Aphid herds are claimed by stationing tenders.**
  - Your ants stay with the herd and it makes Nectar for you while they're there.
  - Others can raid your tenders to take the herd.
  - A herd left without tenders wanders off.
  - Why: Nectar is the bottleneck. This turns it into something players compete over, and keeping ants away from home is a real choice (they aren't there to defend).
- **NPCs live around players.**
  - In patches with players and the patches within 2 of them (same region), created when a player first arrives nearby.
  - Not seeded across every empty patch: that would fill far-off land nobody visits and add rows to keep.
- **Scents hint at what they are:** sweet means aphids, woody means termites, sharp means a rival ant nest, and danger means a spider.
  - Players choose what to scout first.
  - Scouting still reveals size and strength.
- **Defaults** (recorded on #67, kept):
  - Herds, mounds and dens never use one of the 12 colony spots.
  - About one termite mound per 5 patches; mounds regrow over 72 h.
  - Anything you've scouted stays known.
  - There's no trader NPC. Trading stays with the Protein build (#65), which made it a chamber job (larval digestion, [03-economy](03-economy.md)).

## Rules

### Where wild things live
- **Wild sites:** spots **14, 15 and 16** in a patch's wilds hold the aphid herd, the termite mound and the spider den (`area.sites`). Spot 13 is still the open wilds for foraging and surveys. The 12 colony spots stay free for players.
- When a colony is created (sign-up or Found Colony), every patch within **2 patches** of it (same region, `area.range`) gets:
  - a **wild nest** on a free non-Grassland colony spot, if it has none;
  - an **aphid herd** on its herd site, if it has none.
- **Termite mounds** sit in patches where `patch % 5 = 3`, spawned once a player lives within 2 patches. So almost every player has one within reach.
- **Spider dens** sit in patches where `patch % 10 = 8`, spawned once a player lives within 7 patches. Every patch has one in range, so every player can find one.
- At server start, the area around every patch with players fills in the same way. That's how the live world gets them on deploy.
- **Levels follow the strongest active player nearby**, as wild-nest levels do: its own patch's leader, or, in a patch with no active players, the strongest within 2 patches. Levels never drop.
- Patches that hold only wild things are still open to new players. Placement ([11-world](11-world.md#starting-placement)) puts new players next door to the last ones, NPCs or not.

### Wild nests: two new species
Terrain still picks the species. Where two live on the same terrain, a new nest picks one at random. Existing nests keep their species.

| Terrain | Species | How it fights | Counter |
|---|---|---|---|
| Sandy Soil, Sunny Meadow | **Honeypot Ants** | Workers and Minor Soldiers guarding a store with **2.5× the Nectar** (60% of the Foliage and Protein) | Easy to beat. Bring Workers to carry the Nectar home |
| Creek Bank, Rotting Log | **Trap-jaw Ants** | No Workers, just a few Major Soldiers behind pit traps (from level 3) | Swarm them with Minor Soldiers; bring a few Trap-jaw Ants for the pits (Build 10) |

They follow every wild-nest rule (levels 1–6, 24 h regrowth, gentle raids back).

### Termite mound
- A colony of **Termite Workers** (soft, many) and **Termite Soldiers** (armoured, hit hard against Minor Soldiers and Workers). It has a Soil Wall, Pit Traps and, at higher tiers, Acid Sentries.
- **Three tiers**, by the area leader's points: 0, 600 and 1,500 (`levels[].minPoints`).
- **A big store, mostly Foliage** (chewed wood): tier 1 holds 40k Foliage, 20k Protein and 3k Nectar. That's over three times a level-4 wild nest.
- **Regrows over 72 h** instead of 24, so it's a target you come back to about weekly.
- **Never raids.** No protection; the bash limit applies. Loot, corpses and defense rebuild work as for any raid.

### Spider den (boss)
- One **Trapdoor Spider** and her **Spiderlings** under a silk lid. The spider has huge health and armour, and her fangs kill an ant with each strike, many times a round.
- **Two tiers:** tier 1 from the start, and tier 2 once a nearby player reaches 1,500 points (two spiders, more young).
- **Can't be worn down.** She recovers fully between fights, so only one big enough army wins. A small raid draws and loses ants for nothing.
- **Regrows over a week** (168 h). Rich in Protein: tier 1 holds 10k Foliage, 40k Protein and 8k Nectar.
- **Never raids.**
- **For the Alliances build:** tier 2 is out of reach for one day-30 army. It's meant for joint raids, which come in alliances stage B ([23-supercolonies](23-supercolonies.md)). A joint raid can target the same colony row; nothing here needs to change.

### Aphid herds
- **Scout it first.** Then send a **Tend aphids** mission with any ants. When they arrive they **stay with the herd** (the mission ends there, like Relocate), and the herd is yours while they're there.
- **Honeydew:** a tended herd makes Nectar: 10, 20, 35, 60, 100 and 160 per hour at levels 1–6. That's roughly a third of an engaged player's own Nectar at that stage. It piles up in the herd, up to **12 hours' worth**.
- **Delivery:** every **6 hours** your tenders carry the honeydew home to the colony that sent them. Nothing ticks: it's one scheduled event per herd.
- **One herd per colony.** More colonies, more herds (and more to defend).
- **Send more tenders** any time from the same colony. **Call tenders home** from the herd's card: they walk home carrying what honeydew they can, and the herd is left untended.
- **Taking a herd:** you can't tend a herd someone else holds. **Raid** it instead.
  - It's a fight with the tenders, under the normal PvP rules: new-colony and strength protection, and the bash limit. Raiding someone's tenders ends your own new-colony protection.
  - A truce or a shared supercolony scent with the tending player covers their tenders too ([23-supercolonies](23-supercolonies.md)). A raid already on its way turns back if a pact is agreed first.
  - The tenders fight with their owner's research. They're warned like any raid ("Raid incoming on your aphid herd").
  - Win, and you take the waiting honeydew. If no tenders survive, the herd is free, and the first to tend it holds it.
- **Nobody to fight at an untended herd:** you can't raid it, you tend it.
- **Wandering off:** a herd with no tenders for **48 hours** drifts to a free herd site in a nearby patch where players live, and keeps drifting every 48 h until someone tends it. A herd nobody has found yet stays put. Whoever had scouted it still knows it ("your scouts know its scent").
- **Tenders still count** toward your points and military strength, but they are not home: swarms and raids on your colony meet only the ants at home. That's the choice.
- Wild nests don't steal herds yet (see Open Questions).

### Scents
Unscouted wild things show as scents with a hint ([22-discovery](22-discovery.md)): **Wild scent** (sharp, an ant nest), **Sweet scent** (aphids), **Woody scent** (termites), **Danger scent** (a spider). Each gets its own plume colour on the patch. Players' colonies still show as a plain amber Ant scent.

## How players see them
- **Missions tab:**
  - The wilds strip at the right of the patch holds up to three wild sites.
  - Known ones are drawn: aphids on a stem (with your flag when you tend it), a termite cone, a silk-lidded burrow.
  - Tapping one opens its card. A herd's card shows its yield and who tends it; if it's yours, it also shows your tenders and the waiting honeydew. The card has Tend, Send more tenders, Call tenders home, and Raid when someone else holds it.
- **Tags:** "Wild nest · Level 3", "Termite mound · Tier 1", "Boss · Tier 1", "Aphid herd · untended / tended / yours".
- **Reports:** scouting a herd says what it makes and who tends it. Tending gets its own report. Raids on your tenders arrive as normal battle reports ("Aphid Herd lost: your tenders were driven off").
- **Pictures** for Termite Workers, Termite Soldiers, Spiderlings and the Trapdoor Spider appear in battle reports.

## Tuning check (combat code, 200 runs each, no research on either side)
The armies are the fair armies from [17-wild-nests](17-wild-nests.md#tuning-check-combat-code-200-runs-each-no-research-on-either-side). Each cell shows win rate / share of the attacking army lost.

| Level | Fair army | Honeypot | Trap-jaw |
|---|---|---|---|
| 1 | 8 Minor | 100% / 24% | 100% / 34% |
| 2 | 20 Minor | 100% / 29% | 100% / 27% |
| 3 | 20 Minor + 12 Major | 100% / 25% | 100% / 34% |
| 4 | 80 Minor + 10 Major | 100% / 30% | 100% / 38% |
| 5 | 150 Minor + 40 Major | 100% / 29% | 100% / 32% |
| 6 | 250 Minor + 100 Major | 100% / 31% | 100% / 34% |

| Target | Army | Result | Half that army |
|---|---|---|---|
| Termite mound, tier 1 | 120 Minor + 40 Major (around day 10) | 100% / 43% | 0% (wiped out) |
| Termite mound, tier 2 | 250 Minor + 110 Major | 100% / 37% | 0% |
| Termite mound, tier 3 | 450 Minor + 220 Major | 100% / 37% | 0% |
| Spider den, tier 1 | 250 Minor + 100 Major (day 30) | 100% / 21% | 0%, loses 59% |
| Spider den, tier 2 | 450 Minor + 220 Major | 100% / 25% | 0%, loses 63% |

Re-checked for Build 10 (Pit Traps catch Minors, the Soil Wall shields): tier 1 mounds have 2 Pit Traps instead of 4, and early Trap-jaw nests (levels 1–2) have no pits.

- A day-14 army (150 Minor + 40 Major) never beats the tier-1 spider and loses 57% of itself.
- A day-30 army never beats tier 2.
- `shared/test/nests.test.ts` guards all of this. Re-check after changing `data/npc.json`, castes or combat.

## Implementation notes
- Every wild thing is an ordinary **colony row owned by the hidden wild player**, as the discovery doc recommends ([22-discovery](22-discovery.md#notes-for-the-next-builds)). So scents, scouting, `known_colonies`, raids, battle previews and reports work with no new discovery rules.
- `colonies.npc` holds the state:
  - Nests, mounds and dens use the wild-nest state (`species`, `level`, `at`). Mounds and dens are species with `kind`, `regrowHours`, `raids: false` and their own `levels`.
  - Herds use `{ kind: 'herd', level, at, tender, untendedSince }`.
  - A herd's `units` are its tenders, and its Nectar is the waiting honeydew. Both are computed from elapsed time (`herdHoneydewAt`).
- Events: `herd_deliver` (every 6 h while tended) and `herd_wander` (48 h after the tenders leave). Each carries the state it was armed for, so a stale one does nothing.
- NPC-only units (`termite_worker`, `termite_soldier`, `spiderling`, `trapdoor_spider`) are castes with `npcOnly: true, mvp: false`, so players can never raise or send them.
- **Live world:** no migration is needed (the `npc` column is jsonb). On the first start after deploy, `ensureWildNests` fills the area around every settled patch. Existing wild nests keep their species and level.

## Open Questions
- Should wild nests raid untended (or weakly tended) herds, so herds are contested even in quiet areas? Proposal: yes, in a later build, once players have tried herds.
- Should a herd's yield grow the longer one colony holds it (a reason to defend rather than hop)? Proposal: watch playtests first.
- Should the first player to beat a spider get a lasting mark (a title, a milestone)? Proposal: decide with the Alliances build, which may make spiders a group goal.
- Should termite mounds and spider dens ever raid back? Decided for now: no. They are goals, not threats.
