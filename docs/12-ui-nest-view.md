# 12 — UI & Nest View

**Version:** 0.5

## Principles
- **Mobile-browser first.** Every screen works one-handed on a phone. Desktop gets more columns, not more features.
- **Show the "why."** Any blocked action explains why (not enough Nectar, workforce short, slot in use).
- **Few clicks.** Common actions (send army away until X, repeat last forage) are one or two taps.

## Screens (MVP)
| Screen | Purpose |
|---|---|
| **Colony** (home) | The nest fills the screen (3D slab on computers, 2D nest on phones; below) with cards floating over it: resources, workforce, "Happening now" (active timers, incoming/outgoing missions), the founding task. Tap a chamber to open it. Overview and Nest View were merged into this one screen ([#44](https://github.com/MarcialPimentel/hormigas/pull/44), [#75](https://github.com/MarcialPimentel/hormigas/pull/75)) |
| **Chambers** | List view of all chambers, costs, upgrade buttons |
| **Brood Hall** | Raise castes and defenses |
| **Research** | Instinct tree |
| **Missions** | Your patch drawn at the top (colonies as mounds, unscouted ones as scents); tap a spot to scout, raid, send or forage; **World** opens the region grid. Below: send missions, "return at" picker, battle preview, missions under way. The Map tab folded in here in Build 7 ([22-discovery](22-discovery.md)) |
| **Allies** | Truces and your supercolony: found or join one, invite and answer, players you've met ([23-supercolonies](23-supercolonies.md)) |
| **Reports** | Battle, scout, forage reports |
| **Rankings** | Leaderboards |
| **Feedback** | Admins only: player feedback, newest first, mark as handled |

A persistent **resource bar** (Foliage, Protein, Nectar, Workforce) sits at the top of every screen. Each resource has a small picture rather than a dot: a cut leaf, prey, a drop of honeydew, a worker. A thin bar under each food shows how full its store is (hover for the exact amount and capacity), so the Production table isn't needed on computers.

## Light and dark
The menus follow the device's setting: dark is the soil theme, light is "field-guide paper" (lichen paper, ant-ink text; palette in [art/3d-exploration.md](art/3d-exploration.md)). Accents that carry text (honey, leaf, protein) have darker `*-ink` shades in light mode; the bright accents stay as fills. Anything drawn on the soil (both nests, the close-up, the login art) keeps its in-world colours in both themes.

## Feedback
A **Feedback** button sits in the top bar of every screen (icon only on phones). It opens a short form: a kind (bug, idea, confusing, other) and a message. The player's screen, colony, browser and screen size are attached automatically, so they never have to explain where they were. Limited to 10 messages per player per hour.

Feedback is read on the admin-only **Feedback** screen. Admins are players with `is_admin` set in the database (see [DEPLOY.md](DEPLOY.md)).

## The 3D slab (computers)
On computers the nest is a block of earth cut open at the front, like an ant farm on a plinth (approved from [art/3d-exploration.md](art/3d-exploration.md)). Built with Three.js in `client/src/components/nest3d/`, loaded only when shown.
- **The block and its ants are 3D; the chambers keep their 2D art.** Hollows and tunnels are carved into a face painted in coloured soil horizons; each chamber's own art (`client/src/art/chambers.ts`) is on its hollow's back wall, lit warm from inside. Ants are real 3D ants, one per ant up to a cap, walking at different depths and carrying loads down to the stores. Look and numbers: [18-art-direction.md](18-art-direction.md) § In 3D. This slab is the Nest level of the scale ladder ([art/sunlit-microcosm.md](art/sunlit-microcosm.md)).
- **Gentle orbit, and zoom on the Colony screen:** drag to turn (about ±30°) and, with a mouse, tilt a little. Where the nest fills the screen, scroll (or pinch on a trackpad, or the + and − buttons) zooms up to 3.5× toward the cursor; zoomed in, dragging moves around the nest instead of turning it, and it can't leave the block. **Whole nest** (or double-click) goes back to the full view. Still no inside views. Zoom came in with the full-screen Colony screen (Marz, 2026-10-29); it was left out at first to keep the whole colony in sight.
- **Same information as the 2D nest:** chamber names, levels and tags; dashed outlines for chambers you could dig next; surface parties with timers; raiders in red with the entrance ringing; diggers on the rim; the Pheromone Chamber glowing while research runs; a sky by the player's clock, with chambers glowing at night.
- **Taps:** a chamber opens its sheet (no Look inside); the entrance opens Missions.
- **Which nest:** 3D on computers, 2D on phones. A button in the corner switches (saved per browser). Without WebGL the 2D nest shows. Motion off draws a still slab, refreshed about once a second.

## Nest View (2D, phones)
- Side cross-section of soil.
- **Chambers** = rounded shapes; size grows with level; locked chambers appear as faint outlines (shows what's coming).
- **Tunnels** = lines connecting chambers to the entrance.
- **Ants** = ant sprites (worker, soldier) walking along tunnels, facing the way they go, with a tripod walk cycle. See [18-art-direction.md](18-art-direction.md):
  - Workers traveling between gardens and storage
  - Soldiers clustered near the entrance
  - Ants leaving/arriving when missions depart/return
- Under-construction chambers show a digging animation (dots + progress ring).
- Tap a chamber → its **sheet** (below). The sheet's **Look inside** opens the close-up.
- Ants are drawn from the art set in `client/src/art/ants.ts`. Each built chamber shows its own art (`client/src/art/chambers.ts`, without the soil wall) fitted to its hollow; unbuilt chambers are dotted outlines. Tunnels are still plain shapes.

## The colony is the home screen
The Colony screen opens on the nest, and the important information sits in the world rather than in tables.

**On a computer (900px and wider), the nest is the whole screen.** It fills everything right of the left nav and below the resource bar, edge to edge, and the rest floats over it as small paper cards:
- **Top left, in the sky:** the colony's name (with Rename), its coordinates, terrain, space and points, and how long raid protection lasts.
- **Down the right:** "While you were away" (when there is one), **Happening now**, and the next founding task at the bottom. The column scrolls if it gets long.
- The 3D slab is centred left to right and framed between the cards at the top and the founding task at the bottom (measured, as the cards grow and shrink), so they sit over sky rather than over chambers. Very tall cards may cover a little of the nest rather than shrink it to nothing. The flat 2D nest can't be framed like that, so it stops short of the card column.
- The nest's own buttons (2D/3D view, Motion) sit bottom left; the "drag to turn" hint shows when there's room.
- The Production table is gone here: the resource bar carries it.

**On phones** the nest is drawn tall (380px) with the cards stacked under it, Production table included.

In both:
- **Sky:** the strip above the grass follows the player's own clock: dawn, day, dusk, and night with stars and the moon.
- **Sign:** the colony's name on a little stake by the entrance.
- **Parties carry their timers.** Every party on the surface has a floating tag: "Forage · 17s", "Forage home · 2m", "Raid · 4m 12s" (red), "Scouts", "Delivery". Tags close together alternate between two rows so they don't overlap.
- **Chambers say what they're busy with,** under their names: "Digging · 6m" (honey), the research being learned in the Pheromone Chamber (violet), "Raising 4 · 3m" in the Brood Hall, and "41% full" or "Full" on stores.

## Chamber sheet
Tapping a chamber (built or not yet dug) opens its sheet: on a computer as a card beside the chamber (to its right, or its left when there's no room, with a small pointer; it follows the chamber as the 3D nest turns), on phones right under the nest. The chamber is ringed in honey:
- What it does, what it holds (stores: amount, capacity, and how much raids can't take), and what it does now.
- The next level: what it gives, its cost and dig time, and **Dig it / Dig deeper**. When something is in the way the button is disabled and the reason shows beside it (diggers busy, not enough food, no space). Same rules as the Chambers screen; both use `client/src/chamberPlan.ts`.
- **Look inside** (the close-up), **All chambers** (the Chambers screen), **Close** (or Esc, or tap the chamber again).

## Chamber close-up
Tapping a built chamber opens a close look inside it, filling the nest view:
- The chamber's full art (soil wall, roots, tunnel mouth, contents and its signature detail) with workers walking its floor. Stores get a wash of their food colour that rises as they fill, and show the amount.
- Every ant has a name: hover it (tap on phones) for a tag with its name and caste. See [18-art-direction.md](18-art-direction.md), "Names".
- **Upgrade** and **Back** (or Esc) return to the nest, with the chamber's sheet open.
- With motion reduced, the ants stand still along their beat.

## Showing what happens (Build 3)
The game should *show* the colony at work, not only list timers. (Build 3 used dots; ants are now sprites, see above.)

**Nest View**
- **Parties on the surface.** Our missions walk along the grass from the entrance toward the edge (the side of the target), and walk back carrying coloured food. Their position is how far through the trip they are.
- **Departures and returns.** A line of ants climbs the shaft when a party leaves; when it gets home, lines carry each kind of food down to its storage chamber.
- **Incoming.** Raids are red dots marching in from the attacker's side, with a pulsing red ring at the entrance; scouts are two paler dots; deliveries are ordinary ants.
- **Storage** chambers fill with their food colour as they fill up, and glow when full.
- **Short of workers:** production chambers go dim in proportion to the shortfall.
- **Brood:** eggs sit in the Brood Hall while units are raised; each new ant pops out.
- **Digging:** diggers on the rim and soil flying, plus the progress ring.
- **Research:** scent rings pulse from the Pheromone Chamber.
- **Level-ups:** the chamber pulses with two honey rings.
- **Nest events:** each has its own short scene (a beetle dragged down to the Larder, leaves falling and carried to the Granary, rain, winged ants rising, an old tunnel traced out).
- "Reduce motion" turns off the moving parts; the static state (fills, eggs, parties' positions) still shows. A **Motion** button in the corner of the nest view picks auto (follow the device's reduce-motion setting), on or off, saved per browser. Desktop OSes often report reduce-motion when system animations are off, which froze the ants for players who never asked for it.

**Other screens**
- **While you were away:** after 20+ minutes away, the Colony screen opens with a card listing chambers that grew, research learned, the change in stores and the reports filed meanwhile. Built from a snapshot the browser keeps; nothing new on the server.
- **Pop-ups in view:** finished builds, research and brood, and new reports, show as in-game pop-ups when the tab is open (browser notifications when it's in the background).
- **+N pops:** food arriving all at once (cargo, loot, a gift) floats up as "+N" over the resource bar.
- **Parties on the move:** mission rows, "Happening now" and the patch's spot card (Missions) show a small track with walking ants: ours outbound and home (with cargo), raids and scouts heading for us (red).

## Notifications
- **Browser notifications** (opt-in through a one-time card after the tutorial, not on first load; there's no permanent settings panel, per playtest feedback, and players turn them off in the browser's site settings):
  - Raid incoming (highest priority)
  - Mission returned
  - Construction / research complete
  - Storage full
- **Tab title badges:** `(1) Raid incoming! – Hormigas`.
- In-game: the **Happening now** list on the Colony screen shows what's under way and what's coming at you. There is no separate notification list or Notifications panel (removed after playtest feedback, [#60](https://github.com/MarcialPimentel/hormigas/pull/60)).

## Open Questions
- Should a raid landing on the nest have its own scene (a fight at the entrance, corpses on the surface)? Planned for a later build.
