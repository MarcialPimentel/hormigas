# Hormigas — Changelog

_Current as of Build 11 (2026-10-30)._ Newest first. One entry per build, in players' words, built from the merged PRs. Smaller PRs merged between builds are listed with the nearest build.

## Next build (unreleased)
- A new carrier, the **Media Worker** (leafcutter media): carries 3,500, more than twice a Worker, for 500 Foliage and 200 Protein, from Brood Hall 2 with no research. It fills the jump from Workers straight to Haulers, and hauls corpses too.
- Fixed: scouts from a player you have a truce with (or share a supercolony scent with) no longer show up as "Enemy scouts". They're listed as visiting scouts with your pact beside their name, aren't drawn in enemy red, and never set off the alarm. Your ants never kill them, and you always get a report saying who looked.
- Fixed: soldiers no longer stack in a column at the top of the 3D nest's shaft. They stand guard spread around the entrance on the mound, and workers use the shaft's whole width, most of them moving between chambers rather than all queuing at the hole.
- Fights pay in loot: beating a wild nest, termite mound or spider den now carries off 75% of its store, not 50%. Raiding players and aphid herds is unchanged.
- Battle reports end with the net result: what your losses cost, what you carried home, and what it comes to if you haul the corpses. Defenders see what the fight cost them.
- Research pays half of its Nectar in Protein (3 Protein per Nectar), so the Protein from battles has a use and Nectar goes further. Research takes no longer than before, and nobody's points change.
- Forage slots per colony: each colony can have its own forage party out, and Foraging Instinct adds a slot to every colony ([#99](https://github.com/MarcialPimentel/hormigas/pull/99)).
- Meet the ants: on the 3D nest, scroll in (or double-click a chamber) and glide close enough to watch every chamber's ants at work: hauling leaves in, cutting up prey, feeding the honeypots, licking eggs, grooming the queen. Click any ant and she stops and turns to you, with a card saying her name and what she's doing; scroll out and you're back on the whole nest. The queen now sits in her chamber. In the 2D close-up, clicking an ant keeps her name up ([#108](https://github.com/MarcialPimentel/hormigas/pull/108)).
- On the 3D patch, grass and reeds no longer stand in your way: once the camera comes down among them, the blades between you and what you're looking at (and between you and any nearby mound or spot) sink into the ground, while the rest of the meadow stays as it is. From high up nothing changes. Ant mounds are now solid domes of dug-out soil with the entrance in a crater on top. **WASD** or the arrow keys move the camera on the patch and in the Garden, **Q/E** turn it on the patch, and Shift moves faster.
- Twice the harvest: chambers, base income, Gardener Minims, forage parties and aphid herds all gather twice as much. Storage is the same size, so a Granary or Larder pays off sooner. An engaged player now reaches Nectar in about 1.3 hours instead of 2.4.
- The dig plan: from Queen's Chamber 4, plan the next chamber while one is being dug. It starts on its own the moment the dig ends and the stores can pay, even while you're away, and costs nothing until then.

## Build 11: The full roster — 2026-10-30
- Four new ants: the Supermajor (tramples through ranks), the Slave-maker (carries the dead home after a won raid), the Desert Ant (luckier forage parties) and the Gardener Minim (more Leaf Garden output) ([#84](https://github.com/MarcialPimentel/hormigas/pull/84)).
- Allies through the Symbiosis research, raised like ants: Carrion Beetle, Assassin Bug, Bullet Ant and Rhinoceros Beetle ([#84](https://github.com/MarcialPimentel/hormigas/pull/84)).
- Six instinct researches, one per fighting caste, and a second counter layer shown as Strong vs / Weak vs in the Brood Hall ([#84](https://github.com/MarcialPimentel/hormigas/pull/84)).
- On computers the research tree fills the screen ([#86](https://github.com/MarcialPimentel/hormigas/pull/86)).
- On computers, the Missions screen shows your patch in 3D: mounds with flags, scents, wild sites, and every party walking its scent trail at its real size; zoom down to ant height, or jump there with Ant's-eye view ([#92](https://github.com/MarcialPimentel/hormigas/pull/92)).
- Missions orders read **From → To**: pick the sending colony in Deploy (it switches your colony), see the target, Swap between your own colonies, and watch the route drawn on the patch. Your other colonies offer Transport, Relocate and Send from here; **Send ants…** opens Deploy without tapping a spot; Under way names your colonies.
- The Colony screen no longer lists missions twice: Happening now shows digs, research and brood, and steps aside while parties are out with nothing else going on; raid and swarm advice moved onto the threat in Under way.
- Under way's progress bars are walked by the party itself: three little ants facing home on the way back with their loads, red raiders or army ants for threats.
- On the 3D patch, empty spots and the wilds are marked with dotted circles you can see and tap; hovering one names it.
- On computers the Missions screen is a full-screen war room: the 3D patch fills it, **Under way** shows every mission and incoming raid as a progress bar (click one to fly to its column), and tapping Raid, Scout or Forage on a spot opens a Deploy card over the patch. The Colony screen shows the same list with **Open the war room**, and the 3D nest has **↑ Up to the patch** ([#100](https://github.com/MarcialPimentel/hormigas/pull/100)).
- The World button opens the whole world as a 3D back garden: a light for every patch where colonies live (yours honey, your supercolony's teal with threads to you), a star map by night, Winged Queens flying their arcs. Zoom out of a patch to rise to it, tap a light to dive in, and go down into your nest from the patch ([#97](https://github.com/MarcialPimentel/hormigas/pull/97)).
- On the 3D patch, an army-ant swarm comes on as a fan-shaped front with insects fleeing ahead of it, and battles play out where they were fought: live when a raid or swarm lands while you watch, or from any battle report with **Replay on the patch** ([#96](https://github.com/MarcialPimentel/hormigas/pull/96)).
- The 3D nest is sunlit: coloured soil layers, chambers lit from inside, and real 3D ants walking the tunnels at their real numbers, capped ([#90](https://github.com/MarcialPimentel/hormigas/pull/90)).
- Living chambers in the 3D nest: stores heap up as they fill, brood follows the queue, research motes drift while research runs, and the rest grows with level ([#95](https://github.com/MarcialPimentel/hormigas/pull/95)).

## Build 10: Castes with a purpose — 2026-10-30
- A counter triangle: Minor Soldiers beat Majors, Majors beat the new Acid Sprayer, Sprayers beat Minors ([#81](https://github.com/MarcialPimentel/hormigas/pull/81)).
- The Trap-jaw Ant breaks defenses; Pit Traps catch small ants; the Soil Wall shields the other defenses; new Narrow Tunnel defense ([#81](https://github.com/MarcialPimentel/hormigas/pull/81)).
- A fall-back order on raids, and counter hints in the Brood Hall, battle preview and reports ([#81](https://github.com/MarcialPimentel/hormigas/pull/81)).
- Brood Hall castes are grouped by role, each with a one-line description ([#82](https://github.com/MarcialPimentel/hormigas/pull/82)).

## Build 9: More wild things — 2026-10-29
- Wild nests in neighbouring patches, with two new species: Honeypot Ants and Trap-jaw Ants ([#73](https://github.com/MarcialPimentel/hormigas/pull/73)).
- Aphid herds you claim by leaving tenders with them: contested Nectar ([#73](https://github.com/MarcialPimentel/hormigas/pull/73)).
- Termite mounds and a spider-den boss; wild scents hint at what they are ([#73](https://github.com/MarcialPimentel/hormigas/pull/73)).
- Alliances, stage A: truces, supercolonies of up to 6, the Hold Position mission and a new Allies tab ([#72](https://github.com/MarcialPimentel/hormigas/pull/72)).
- The Colony screen: the nest fills the browser with cards floating over it; on computers you can zoom into the 3D nest ([#75](https://github.com/MarcialPimentel/hormigas/pull/75), [#79](https://github.com/MarcialPimentel/hormigas/pull/79)).
- Fixes: failed missions always come home and recurring events keep rearming ([#76](https://github.com/MarcialPimentel/hormigas/pull/76), [#77](https://github.com/MarcialPimentel/hormigas/pull/77), [#78](https://github.com/MarcialPimentel/hormigas/pull/78)).

## Build 8: Protein sink — 2026-10-29
_PR [#70](https://github.com/MarcialPimentel/hormigas/pull/70) is titled "Build 7"; the roadmap numbers it Build 8._
- Feed the brood: Well fed or Feast batches cost extra Protein and hatch faster ([#70](https://github.com/MarcialPimentel/hormigas/pull/70)).
- Larval digestion in the Brood Hall turns Protein into Nectar (3 : 1, over time) ([#70](https://github.com/MarcialPimentel/hormigas/pull/70)).
- The forage screen shows the most a party can bring home; forage reports say when the party gets back ([#70](https://github.com/MarcialPimentel/hormigas/pull/70)).

## Build 7: Scents and neighbours — 2026-10-29
- Missions shows your patch: tap a colony or scent to scout, raid, send or forage. The Map tab is gone ([#71](https://github.com/MarcialPimentel/hormigas/pull/71)).
- Unscouted colonies are scents (amber for players, red for wild ants); scout before you can raid ([#71](https://github.com/MarcialPimentel/hormigas/pull/71)).
- New players are placed together, up to 4 per patch ([#71](https://github.com/MarcialPimentel/hormigas/pull/71)).

## Build 6: The tech tree — 2026-10-29
- Research becomes a tree in four branches (Jaws, Harvest, Nest, Scent) with ten new researches, and Aphid Husbandry is playable ([#63](https://github.com/MarcialPimentel/hormigas/pull/63)).
- Army ants in the swarm column look like real army ants ([#69](https://github.com/MarcialPimentel/hormigas/pull/69)).

## Build 5: Raids from the wild — 2026-10-29
- Army-ant swarms visit every colony about every 4 days, with 4 hours' warning, and can be beaten ([#62](https://github.com/MarcialPimentel/hormigas/pull/62)); the first ones arrive within a day ([#64](https://github.com/MarcialPimentel/hormigas/pull/64)).
- Pictures for every chamber, unit, defense and research ([#61](https://github.com/MarcialPimentel/hormigas/pull/61)).

## Build 4: More colonies — 2026-10-29
- Nuptial Flight research, the Winged Queen and the Found Colony mission: start a second colony ([#58](https://github.com/MarcialPimentel/hormigas/pull/58)).
- The 3D nest on computers, a block of earth you can turn, and a light field-guide theme for the menus ([#49](https://github.com/MarcialPimentel/hormigas/pull/49), [#50](https://github.com/MarcialPimentel/hormigas/pull/50)).
- The colony is the home screen; ants live in the nest, with names and a chamber close-up; walking ants on the mission tracks ([#41](https://github.com/MarcialPimentel/hormigas/pull/41), [#43](https://github.com/MarcialPimentel/hormigas/pull/43), [#44](https://github.com/MarcialPimentel/hormigas/pull/44), [#48](https://github.com/MarcialPimentel/hormigas/pull/48)).
- The map as a place: named regions and a drawn patch ([#51](https://github.com/MarcialPimentel/hormigas/pull/51)).
- Feedback fixes: scout-before-raid note, Nectar fuel explained, no notifications panel ([#60](https://github.com/MarcialPimentel/hormigas/pull/60)).
- Safer deploys: a backup before every deploy and automatic rollback ([#55](https://github.com/MarcialPimentel/hormigas/pull/55)).

## Build 3: The colony comes alive — 2026-10-27
- The Nest View shows parties, raids, storage, brood, digging and research ([#38](https://github.com/MarcialPimentel/hormigas/pull/38)).
- A "while you were away" card and small random events in the nest ([#38](https://github.com/MarcialPimentel/hormigas/pull/38)).

## Build 2: Wild nests — 2026-10-27
- A wild nest of another ant species in every patch with players; its strength matches the patch and it raids back gently ([#37](https://github.com/MarcialPimentel/hormigas/pull/37)).
- New founding task: "Raid the wild nest" ([#37](https://github.com/MarcialPimentel/hormigas/pull/37)).

## Build 1: Playtest fixes — 2026-10-27
- Scouts can survey the wilds, and the last founding task works in an empty patch ([#36](https://github.com/MarcialPimentel/hormigas/pull/36)).
- Your first forage always finds food, and the forage screen shows the odds ([#36](https://github.com/MarcialPimentel/hormigas/pull/36)).
- A Feedback button on every screen ([#36](https://github.com/MarcialPimentel/hormigas/pull/36)).

## First playable — 2026-10-25 to 2026-10-26
- The MVP in eight steps: accounts and an idle economy, chambers, research and the Brood Hall, the map and missions, combat with battle reports and corpses, forage, PvP protection rules, notifications, onboarding and rankings ([#9](https://github.com/MarcialPimentel/hormigas/pull/9)–[#16](https://github.com/MarcialPimentel/hormigas/pull/16)).
- Balance pass: early pacing, Nectar as the first big goal, costs that say what's missing ([#17](https://github.com/MarcialPimentel/hormigas/pull/17)).
- Live on the web ([#18](https://github.com/MarcialPimentel/hormigas/pull/18), [#19](https://github.com/MarcialPimentel/hormigas/pull/19)).
