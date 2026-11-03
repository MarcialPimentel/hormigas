# Trailer

_Current as of 2026-11-03._

A ~35-second trailer for Hormigas, captured from the real game: `art/trailer/hormigas_trailer_1080p30.mp4` (1920×1080, 30 fps, H.264 + AAC), with a poster image `art/trailer/hormigas_trailer_poster.jpg`. Made the same way as Papercut's store trailer (papercut#56): nothing is painted or animated by hand. Every shot is the game drawing its own world, and the music is the game's own march.

## What it shows

| # | Shot | Seconds | Caption |
|---|---|---|---|
| 1 | Ant height beside Red Hill in the Whole Yard: a column streams out of the mound | 4 | Grow an ant kingdom from a single queen |
| 2 | Title card: the ant mark and wordmark over the yard | 2.6 | A persistent strategy game about an ant colony |
| 3 | The 3D nest, a slow turn across the whole slab | 4 | Dig chambers. Raise the castes. |
| 4 | Close on the upper chambers with ants at work | 3.5 | Every ant at work, while you're away |
| 5 | Columns marching out of Red Hill across the patch | 4.5 | Send columns out to forage, herd and raid |
| 6 | A raid on the neighbour, acted out from its battle report | 7 | Raid your rivals. Haul home their dead. |
| 7 | Pull back from the patch to the whole yard | 5 | One living world that grows while you're away |
| 8 | End card | 4.5 | Free in your browser. No pay-to-win. · hormigas.marz.gg |

Captions carry the pitch with the sound off (most sites autoplay muted), in the game's own fonts and colours. They only claim what the game does today, and lean on the pillars: the colony lives while you're away (1), fair by design (3), the ant fantasy is the mechanics (4).

**Music:** the march from [sound.md](sound.md), rendered offline to follow the edit: the quiet "idle" march under the open and title, the full "march" from the nest on, "tense" for the raid, back to "march" for the pull-back, faded out under the end card. It's seeded, so every render plays the same tune.

## How it's made

`npm run trailer` does everything (about 6 minutes). It needs Docker's Postgres running (`docker compose -p hormigas up -d`) and port 3100 free. The tools are in `tools/trailer/`:

- **`world.mjs`** builds a **separate trailer world** from scratch on every run: the database `hormigas_trailer` in the same Docker Postgres (your development world, database `hormigas`, is never touched), with its own game server on port 3100 at speed ×20. It seeds one late-game player, Myrmidon of Red Hill (every chamber dug deep, the full roster of castes, research, 13 colonies), 25 rival colonies around the yard, every patch explored and every colony scouted. It fights one raid on the neighbour (Formica Rex, defended well enough to last four rounds) and sends columns out at full speed to far-off targets, so they're still walking during the capture.
- **`director.js`** runs inside the game page: a fake clock, so animation frames, `performance.now()` and `Date.now()` only move when the tool says. Every frame is captured exactly, however long a screenshot takes.
- **`capture.mjs`** opens the game in a headless Chromium (with the GPU) at 1920×1080, hides the menus and bars, flies the camera along each shot's path frame by frame, saves the frames, draws the title and end cards, and has ffmpeg cut it together with the music. The browser uses a time zone where it's midday, because the nest's sky follows the local hour.
- **`music.mjs`** renders the march into a WAV on a blank page of the game's dev server.
- **`scout.mjs`**, **`scout-nest.mjs`**: stills from a list of camera spots, to plan new shots. **`serve.mjs`** serves the game against the trailer world to look around by hand (log in as Myrmidon, password in `tools/trailer/lib.mjs`; it's a local test account).

Two tiny game-code hooks make the camera drivable, both **development builds only** (stripped from production, like the music's `__march` hook): `window.__yard` in the Whole Yard scene and `window.__nest3d` in the 3D nest.

`node tools/trailer/capture.mjs <shot>` captures just one shot (`open`, `march`, `battle`, `pullback`, `nest`, `nestclose`) into `tools/trailer/cache/trailer/<shot>/` without editing, to check a change quickly.

## Re-rendering

Re-render after art changes the trailer shows (the Whole Yard, the 3D nest, the ants, battle replays) or when the Whole Yard becomes the main screen. Shot paths are camera poses near Red Hill (1:1:5), so they survive most changes; check the frames after any change to the yard's layout or camera.

The file is about 45 MB, committed directly like Papercut's. If re-renders grow the repo too much, move it to a GitHub release.

## Open Questions
- Where will it be shown first (the login page, the itch.io page, Marz's site, social posts)? A 15-second cut for social posts is a quick follow-up from the same frames.
- Should the login page embed it?
