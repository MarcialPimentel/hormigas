# Hormigas: Test bed

_Current as of 2026-11-04._ Where to try things out without touching the live world.

| Layer | What it is | How to open it |
|---|---|---|
| Tuning data | Game rules in `docs/data/*.json`; how marching columns look in `client/src/components/three/march.json` | edit through a PR |
| Test scene | The real Whole Yard and 3D Patch fed a made-up world, a lineup of every 3D ant, and a menu of actions | **`/?test`** (live: https://hormigas.marz.gg/?test, local: http://localhost:5173/?test) |
| Simulators | `npm run sim` (milestone pacing) and `npm run combat` (balance tables) | command line |
| Fast test world | `npm run dev` runs a local world at ×5 speed | command line |

## The test scene (`/?test`)

A page of made-up data for troubleshooting ant models and movement. It **never talks to the server**: no login, nothing saved on the server, and no real colony is touched. Players see no link to it. Add `?test=patch` to open on the 3D Patch, and `&seed=7` to start with another seed.

**On screen:** the map (left), the ant lineup (bottom) and the menu (right).

- **The map** is the real Whole Yard or 3D Patch code, drawing a made-up patch 1:45 with your colony, a rival, the wilds, a wild nest, a termite mound, an aphid herd and a grasshopper windfall. Next door (1:46) are a second colony of yours, a spider den and a fallen fig. A rival outpost and more wilds sit on 1:44.
- **The lineup** shows every 3D ant the game draws, walking on the spot: worker, soldier, queen, winged queen, raider (red), army ant, army major, and a worker carrying each kind of load (leaf, chunk, drop). The top row is the close-up mesh used in chambers; the bottom row is the light crowd mesh used for columns on the maps.

### The menu

| Section | What it does |
|---|---|
| **Map** | Whole Yard / 3D Patch. Yard: jump the camera to Ground, Patch, Region or Whole yard. Patch: Home patch / Next patch, Ant's-eye, Whole patch. Day / Dusk / Night changes the light. |
| **Clock** | Pause / Play, −1 s / +1 s to step, Restart all (every party leaves home again at once), Speed ×0.25 to ×20, and Scrub to drag the clock across every party's trip (scrubbing pauses). |
| **Send a party** | Ants sets the party size (1–500), Trip how many seconds one way takes, and *Send again when back* repeats each party forever. Then one button per action: Forage (here or next patch), Scout (wild nest or spider den), Raid (wild nest, termites, spider den, rival), Claim windfall (here or next patch), Tend aphids, Transport, Found colony. **Coming at you:** Raid, Scouts, Army ant swarm, Delivery. **Play a battle** acts a made-up fight out at the termite mound, **Random mix** sends six random parties picked by the seed, **Clear all** empties the map. |
| **On the map** | Every party with its phase (out / holding / home) and how far along it is. Look (Yard) or Follow (Patch) flies to it; × removes it. |
| **Setups** | Starter setups, and your own: **Save this setup** keeps the parties, sizes, trip time, seed and slider changes in this browser. |
| **How columns march** | Sliders for the map being shown (see below). A changed slider turns gold and gets ↺ to put it back. **Copy changes** copies only what you changed. |
| **Ant models** | Show or hide the lineup, walk on the spot, turn around. |

### Starter setups

- **One of everything:** every action at once, spread along their trips.
- **Busy forage trail:** six forage parties on the same trail.
- **Loads walking home:** two windfall claims and an aphid herd, timed to be walking home with their loads.
- **Big termite raid:** one 400-ant raid.
- **Under attack:** a raid, a swarm and scouts coming at your colony.
- **Scouts out:** scouts to the wild nest and the spider den next door.

### The sliders (`march.json`)

Visual only: none of these change travel times or any rule.

| Whole Yard | Default | What it does |
|---|---|---|
| Worker size / Soldier size | 0.6 / 0.75 | how big ants are drawn in a column, before the zoom grows them |
| Gap between ants | 1.3 ant lengths | distance from one ant to the next |
| Side-to-side spread | 0.6 | how far ants stray either side of the trail |
| Stride | 0.17 | distance per leg cycle (too short: legs blur; too long: feet slide) |
| Most ants in a column | 60 | cap on ants drawn for one party (swarms are separate) |
| Grow at Patch zoom / Region zoom | 6 / 18 | how much bigger ants get as the camera pulls back |

| 3D Patch | Default | What it does |
|---|---|---|
| Gap between rows / Swarm row gap | 0.46 / 0.3 | distance between rows (an ant is 0.36 long) |
| Lane width | 0.3 | distance between side-by-side lanes in a big column |
| Sway | 0.05 | how much each ant sways as it walks |
| Stride | 0.17 | distance per leg cycle |
| Soldier size | 1.15 × worker | soldiers next to workers |

### Sending tweaks back

1. Move the sliders until it looks right, then press **Copy changes**.
2. Paste the result to Claude ("keep these numbers"). Claude puts them in `march.json` on a branch and opens a PR.
3. Say "merge #N" once you've checked the PR.

## Simulators

- `npm run sim` (`-- 5` for ×5): how long the milestones take.
- `npm run combat`: castes against each other, raids on defenses, fair armies against every wild nest.
