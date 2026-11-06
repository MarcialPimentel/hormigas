# Hormigas — Playtesting

_Current as of Build 11 (2026-10-30)._

## Play the current build
- Open **https://hormigas.marz.gg** in any browser (computer or phone), sign up and found a colony. No install.
- The live world runs at **×1 speed**: a first session reaches Nectar in about 1.3 hours of play for an engaged player (gathering is ×2 since 2026-10-30) ([16-milestones](16-milestones.md)). Check in a few times a day.
- What's new in this build: the latest entry in [CHANGELOG.md](../CHANGELOG.md). Each build's PR has its own playtest steps.

### The Whole Yard
On a computer, https://hormigas.marz.gg opens on the Whole Yard (it is the only view there; phones keep the classic screens). Scroll to zoom from the yard to the ground, drag to move, right-drag or Q/E to turn, WASD to pan; double-click your mound to go inside; the left buttons open Chambers, Brood Hall, Research and Missions, then Allies, Reports, Rankings and the Field Journal (red counts show unread reports, truce offers, raids coming and new journal pages). From the top, each bed has a sign with its name and colony count: click it to fly to that bed. In Reports, a battle's **Watch the battle** flies the map to where it was fought and acts it out round by round. Admins get a **Feedback inbox** button at the top.

### Fog of war
You see the patches round your colonies; the rest is greyed (explored, as last seen) or under mist (never explored). To explore a patch, tap it, pick **the wilds** and send **Scouts**. When they arrive the mist lifts, and the patch stays explored after they leave.

### Scouting the swarm
A swarm comes every 1.5–2.5 days. To meet one sooner on a test world, wait for the "Army ant swarm" warning, then press **Scout the swarm** on its card under Under way and send a few Scouts. Check that the odds on the form go up as you add Scouts, that the report says how many came back, and that the card then shows the swarm's size and a win / draw / lose bar that moves when you raise or send away soldiers ([20-swarms](20-swarms.md)).

### Trade trails
Tap another of your colonies (or a truce partner's or supercolony mate's) and press **Trade trail**, or pick Trade trail on the send card. Send Workers, Media Workers or Haulers; the card shows what each delivery brings and, for a player, what they gain. While the trail is open the caravan walks to and fro on the Whole Yard, and Under way shows when it ends and what it has brought so far ([23-supercolonies](23-supercolonies.md#trade-trails-build-16)).

### Joint raids
In a supercolony, pick a wild nest, termite mound or spider den, choose **Raid**, then **Open a joint raid** and when it lands. Your mates get a report and see it on the **members' board** in Allies; they press **Join** and send an army that can get there in time. Everyone lands together and fights as one, and the battle report lists every army and its share. Spider dens only fight joint raids of 2 or more players ([23-supercolonies](23-supercolonies.md#joint-raids-build-19)). Testing needs two or three accounts in one supercolony (see below).

### The test scene
Open https://hormigas.marz.gg/?test to check ant models and trails without playing: the real Whole Yard and 3D Patch with made-up parties (forage, scouts, raids, termites, windfalls, herds, swarms) sent from buttons on the right, a lineup of every ant, and sliders for how columns march. It never touches the real game. See [test-bed](test-bed.md).

## Controls
- Tap or click everything; the tabs are Colony, Chambers, Brood Hall, Research, Missions, Allies, Reports, Journal and Rankings ([12-ui-nest-view](12-ui-nest-view.md)).
- **3D nest (computers):** drag to turn it; scroll, pinch or the + and − buttons to zoom. Tap a chamber to open it.
- **3D Patch (computers, Missions):** drag or WASD/arrow keys to move, scroll or pinch to zoom (the camera drops toward ant height), right-drag, shift-drag or Q/E to turn (Shift + keys goes faster; low down, grass between you and what you look at sinks out of the way), double-click for the whole patch. **Ant's-eye view** jumps down beside your mound. Tap a mound or scent to open its card. A battle report's **Watch the battle** plays the fight there.
- **The war room (computers, Missions):** tap a spot, then Raid, Scout or Forage (or **Send ants…**) to open the Deploy card, which starts with **From** and **To**; **Under way** on the right shows every mission's progress; click one to fly to it. From Colony: **Open the war room**, or **↑ Up to the patch** on the nest.
- **The Garden (computers, Missions → World):** keep scrolling out from a patch to rise to it; drag or WASD/arrow keys to move, scroll to zoom, tap a light to dive into that patch. **Region grid** picks a patch by number; **↓ Your nest** (on the patch) goes down to the Colony screen.
- **Phones** get the 2D nest and the drawn patch; everything else is the same. On a computer, **2D view** / **3D view** switches either.

## Testing with more than one player
- Open a second browser or a private window and sign up a second player. New players get their own patch next to an active player's ([11-world](11-world.md#starting-placement)), so the two can scout across the border, raid, truce, trade and form a supercolony.
- **Joint raids** need two or three accounts in one supercolony: each needs the Supercolony research, one founds it in Allies and invites the others. Spider den tier 1 needs 2 players in the raid, tier 2 needs 3.
- For fast checks, run the game locally at ×5 speed (see the [README](../README.md#run-it-locally)).

## Daily needs and the Journal
- The **Colony needs** card (Colony screen) gives three tasks a day; collect each one's reward when it's done. **Swap** trades one for another once a day.
- The **Journal** tab fills in as you play; pick a title there and look for it in the Rankings.

## What to look for
- **Does the loop pull you back?** The MVP's success criteria: playtesters return on their own for 7+ days, pacing matches [02-progression](02-progression.md), and being raided doesn't make anyone quit ([15-roadmap](15-roadmap.md)).
- Anything confusing, any button that's blocked without saying why, numbers that feel off.

## Report feedback
- **In the game:** the **Feedback** button in the top bar of every screen (bug, idea, confusing, other). Your screen, colony and browser are attached automatically.
- **Reading it:** admins see it on the Feedback screen; Marz can also use the private feedback page ([DEPLOY.md](DEPLOY.md#private-feedback-page)).
- Bigger items become GitHub issues.
