# 12 — UI & Nest View

**Version:** 0.2

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

A persistent **resource bar** (Foliage, Protein, Nectar, Workforce) sits at the top of every screen.

## Feedback
A **Feedback** button sits in the top bar of every screen (icon only on phones). It opens a short form: a kind (bug, idea, confusing, other) and a message. The player's screen, colony, browser and screen size are attached automatically, so they never have to explain where they were. Limited to 10 messages per player per hour.

Feedback is read on the admin-only **Feedback** screen. Admins are players with `is_admin` set in the database (see [DEPLOY.md](DEPLOY.md)).

## Nest View (simple, schematic)
- Side cross-section of soil.
- **Chambers** = rounded shapes; size grows with level; locked chambers appear as faint outlines (shows what's coming).
- **Tunnels** = lines connecting chambers to the entrance.
- **Ants** = small dots moving along tunnels:
  - Workers traveling between gardens and storage
  - Soldiers clustered near the entrance
  - Dots leaving/arriving when missions depart/return
- Under-construction chambers show a digging animation (dots + progress ring).
- Tap a chamber → its upgrade panel.
- No art assets in v0.1 — colors and shapes only (PixiJS). Real art can replace it later without changing behavior.

## Showing what happens (Build 3)
The game should *show* the colony at work, not only list timers. Schematic shapes and dots only; no art assets.

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
- "Reduce motion" turns off the moving parts; the static state (fills, eggs, parties' positions) still shows.

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
- Should the Nest View be the home screen, or the Overview?
- Tapping a chamber in the Nest View opens the Chambers screen. Should it open a small panel for that chamber instead? Planned for a later build.
- Should a raid landing on the nest have its own scene (a fight at the entrance, corpses on the surface)? Planned for a later build.
