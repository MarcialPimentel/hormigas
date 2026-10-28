# 12 — UI & Nest View

**Version:** 0.4

## Principles
- **Mobile-browser first.** Every screen works one-handed on a phone. Desktop gets more columns, not more features.
- **Show the "why."** Any blocked action explains why (not enough Nectar, workforce short, slot in use).
- **Few clicks.** Common actions (send army away until X, repeat last forage) are one or two taps.

## Screens (MVP)
| Screen | Purpose |
|---|---|
| **Overview** | Colony summary: resources, workforce, active timers, incoming/outgoing missions |
| **Nest View** | Schematic nest (below); tap a chamber to open it |
| **Chambers** | List view of all chambers, costs, upgrade buttons |
| **Brood Hall** | Raise castes and defenses |
| **Research** | Instinct tree |
| **Map** | Region/patch browser |
| **Missions** | Send missions; "return at" picker; preview battles |
| **Reports** | Battle, scout, forage reports |
| **Rankings** | Leaderboards |
| **Feedback** | Admins only: player feedback, newest first, mark as handled |

A persistent **resource bar** (Foliage, Protein, Nectar, Workforce) sits at the top of every screen. Each resource has a small picture rather than a dot: a cut leaf, prey, a drop of honeydew, a worker.

## Feedback
A **Feedback** button sits in the top bar of every screen (icon only on phones). It opens a short form: a kind (bug, idea, confusing, other) and a message. The player's screen, colony, browser and screen size are attached automatically, so they never have to explain where they were. Limited to 10 messages per player per hour.

Feedback is read on the admin-only **Feedback** screen. Admins are players with `is_admin` set in the database (see [DEPLOY.md](DEPLOY.md)).

## Nest View (simple, schematic)
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
The Colony screen opens on the nest, drawn tall (380px on phones, up to 540px on desktop), and the important information sits in the world rather than in tables:
- **Sky:** the strip above the grass follows the player's own clock: dawn, day, dusk, and night with stars and the moon.
- **Sign:** the colony's name on a little stake by the entrance.
- **Parties carry their timers.** Every party on the surface has a floating tag: "Forage · 17s", "Forage home · 2m", "Raid · 4m 12s" (red), "Scouts", "Delivery". Tags close together alternate between two rows so they don't overlap.
- **Chambers say what they're busy with,** under their names: "Digging · 6m" (honey), the research being learned in the Pheromone Chamber (violet), "Raising 4 · 3m" in the Brood Hall, and "41% full" or "Full" on stores.
- The "Happening now" list and the production table stay below the nest for now.

## Chamber sheet
Tapping a chamber (built or not yet dug) opens a sheet right under the nest, and rings the chamber in honey:
- What it does, what it holds (stores: amount, capacity, and how much raids can't take), and what it does now.
- The next level: what it gives, its cost and dig time, and **Dig it / Dig deeper**. When something is in the way the button is disabled and the reason shows beside it (diggers busy, not enough food, no space). Same rules as the Chambers screen; both use `client/src/chamberPlan.ts`.
- **Look inside** (the close-up), **All chambers** (the Chambers screen), **Close** (or Esc, or tap the chamber again).

## Chamber close-up
Tapping a built chamber opens a close look inside it, filling the nest view:
- The chamber's full art (soil wall, roots, tunnel mouth, contents and its signature detail) with workers walking its floor. Stores get a wash of their food colour that rises as they fill, and show the amount.
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
- **Parties on the move:** mission rows, "Happening now" and Map spots show a small track with walking ants: ours outbound and home (with cargo), raids and scouts heading for us (red).

## Notifications
- **Browser notifications** (opt-in, prompted after the tutorial, not on first load):
  - Raid incoming (highest priority)
  - Mission returned
  - Construction / research complete
  - Storage full
- **Tab title badges:** `(1) Raid incoming! – Hormigas`.
- In-game notification list on the Overview.

## Open Questions
- Dark mode by default (soil theme) or light?
- Should a raid landing on the nest have its own scene (a fight at the entrance, corpses on the surface)? Planned for a later build.
