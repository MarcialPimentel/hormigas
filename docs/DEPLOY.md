# Deploying Hormigas

Hormigas is live at **https://hormigas.marz.gg**. It runs on a small DigitalOcean droplet (the "hub") that can host several of Marz's projects side by side. `https://marz.gg/games/hormigas` redirects there.

Hormigas ships as **one Docker image** (`Dockerfile`) that serves the API, WebSockets and the game client, plus **one PostgreSQL database**. Any host that runs Docker images works; this doc describes the hub.

> **Private details are not in this repo.** The server's IP address, SSH key locations and passwords live in a private note kept by Marz, and in GitHub secrets. Never commit them here.

## How it fits together

```
Browser ── https://hormigas.marz.gg ──▶ DNS A record (SiteGround zone for marz.gg)
                                          │
                                          ▼
                          Droplet (Ubuntu 24.04, Docker) — /opt/hub
                          ├─ caddy             HTTPS (automatic Let's Encrypt) → hormigas:3000,
                          │                    and guildie.marz.gg → guildie-realtime:8788
                          ├─ hormigas          ghcr.io/marcialpimentel/hormigas:latest
                          ├─ db                postgres:16 (not exposed; one database + user per project)
                          └─ guildie-realtime  ghcr.io/marcialpimentel/guildie-realtime:latest (Guildie's live rooms)
```

### Guildie's live rooms share the hub

Since 2026-10-29 the droplet also runs **Guildie's live rooms** (the `guildie-realtime` container behind `guildie.marz.gg`): positions, waves and slaps in Guildie's living city. The rest of Guildie stays on SiteGround.

- **Guildie updates it, not this repo.** Every merge to `main` in the `guildie` repo rebuilds the image and runs `docker compose pull guildie-realtime && docker compose up -d guildie-realtime` on the droplet (the `realtime` job in Guildie's `.github/workflows/deploy.yml`). Guildie's `docs/realtime-setup.md` covers its setup and troubleshooting.
- **Hormigas deploys leave it alone.** They only run `docker compose up -d hormigas`. If the rooms stop, Hormigas is unaffected, and Guildie just shows "Quiet day".
- It needs `GUILDIE_REALTIME_SECRET` in `/opt/hub/.env`, the same phrase as `realtime_secret` in Guildie's `config.php` on SiteGround.
- If you change its block in `docker-compose.yml` or the `Caddyfile` on the droplet, copy the change into `deploy/hub/` here too.

The files that define the hub are in [`deploy/`](../deploy/). The copy on the server, at `/opt/hub`, is the one that runs. It also has a `.env` with the real passwords, which never leaves the server.

| File | What it does |
|---|---|
| `deploy/setup-droplet.sh` | One-time server prep: Docker, 2 GB swap, firewall (SSH/HTTP/HTTPS only), automatic security updates, `deploy` user, `/opt/hub` |
| `deploy/hub/docker-compose.yml` | The containers: `caddy`, `db`, `hormigas`, `guildie-realtime` |
| `deploy/hub/Caddyfile` | Which domain goes to which container (`hormigas.marz.gg`, `guildie.marz.gg`) |
| `deploy/hub/.env.example` | Variable names for `.env` (`POSTGRES_PASSWORD`, `HORMIGAS_DB_PASSWORD`, `HORMIGAS_WORLD_NAME`, optional `HORMIGAS_FEEDBACK_KEY`, `GUILDIE_REALTIME_SECRET`) |
| `deploy/hub/postgres-init/01-hormigas.sh` | Creates the `hormigas` database and user on the database's very first start |
| `deploy/hub/add-database.sh` | Creates a database and user for another project |
| `deploy/hub/backup.sh` | Dumps every database to `/opt/hub/backups`, keeps 7 days (cron, nightly 03:30 UTC) |

## How a change goes live

Merging to `main` deploys automatically:

1. **CI** (`.github/workflows/ci.yml`) runs typecheck, tests and build.
2. If CI passes, **Deploy** (`.github/workflows/deploy.yml`) builds the image on GitHub's runners and pushes it to GitHub Container Registry as `latest` and as the commit SHA.
3. Deploy then SSHes into the droplet as `deploy` and, in `/opt/hub`:
   1. **Backs up the `hormigas` database** to `backups/predeploy-<date>-<commit>.sql.gz` (the newest 10 are kept). If the backup fails, nothing is deployed.
   2. Tags the running image as `hormigas:previous`.
   3. Pulls the new build, tags it `latest` and runs `docker compose up -d hormigas`. The old container gets SIGTERM and finishes in-flight events (30 s grace period), and the new one applies database migrations on start.
   4. **Waits up to 3 minutes for Docker to report the game healthy** (`/api/health`, which also checks the database). If it never does, Deploy prints the server's last log lines, **switches back to `previous`**, and the run fails. The game keeps running the old build.
4. Finally Deploy checks https://hormigas.marz.gg/api/health from outside.

The deploy script lives entirely in `deploy.yml`, so changing it needs no edits on the server.

To redeploy without a code change, go to **Actions → Deploy → Run workflow** and leave the commit box empty.

### Rolling back

If a release is live but broken (say, a bug players hit, and the server is healthy so the automatic rollback didn't kick in), go back to an earlier build from GitHub. No terminal needed:

1. Find the last good commit on `main` (the repo's commit list, or the PR that was fine).
2. **Actions → Deploy → Run workflow**, paste its commit SHA (the short 7-character one works), and run it.

This deploys the saved image for that commit, with the same backup and health check as a normal deploy. Then fix forward: the next merge to `main` deploys as usual.

On the droplet, `docker tag ghcr.io/marcialpimentel/hormigas:previous ghcr.io/marcialpimentel/hormigas:latest && docker compose up -d hormigas` does the same for the build that ran just before the current one.

Two things to know:
- **Migrations aren't undone.** An older build runs on the newer database. That's fine for migrations that only add tables or columns, which is how they should be written. If a migration rewrote data, restore the pre-deploy backup instead (below).
- Don't run `docker compose pull hormigas` by hand after a rollback. It fetches the newest `latest` from GitHub, which is the broken build.

Deploy needs two repository secrets: `DROPLET_HOST` (the droplet's IP) and `DROPLET_SSH_KEY` (the private half of a key used only by GitHub). The GHCR package `hormigas` is public so the droplet can pull it without logging in.

## Everyday commands (on the droplet, in `/opt/hub`)

| Task | Command |
|---|---|
| Status of every container | `docker compose ps` |
| Live server logs | `docker compose logs -f hormigas` |
| Restart the game | `docker compose restart hormigas` |
| Start everything | `docker compose up -d` (this also starts or recreates Guildie's rooms if their settings changed) |
| Back up now | `./backup.sh` |
| Open a database shell | `docker compose exec db psql -U postgres -d hormigas` |
| Restore a pre-deploy backup (replaces all game data!) | `docker compose stop hormigas`, then `zcat backups/predeploy-....sql.gz \| docker compose exec -T db psql -U postgres -d postgres`, then `docker compose up -d hormigas`. The dump drops and recreates the `hormigas` database, which is why the game must be stopped first. |
| Restore a nightly backup | `zcat backups/all-YYYY-MM-DD.sql.gz \| docker compose exec -T db psql -U postgres`. This dump has no "drop first", so on a live database it reports "already exists" errors and leaves old rows in place: use it on an empty database (e.g. a rebuilt hub), or prefer a pre-deploy backup. |
| Let a player read feedback (admin) | `docker compose exec db psql -U postgres -d hormigas -c "UPDATE players SET is_admin = true WHERE lower(username) = lower('NAME')"`, then reload the game |

## Private feedback page

Besides the in-game Feedback screen (admins only), feedback can be read on a private page reached by a secret link, so Marz and Claude can read it without logging in:

`https://hormigas.marz.gg/api/feedback/private?key=YOUR-PHRASE` (add `&show=all` to include handled items, `&format=json` for raw data)

It's off until a key is set. To turn it on (once):

1. Make up a phrase of 16+ characters with no spaces, e.g. four random words joined by dashes plus a number. Don't reuse a password: anyone with the link can read the feedback, including player names.
2. On the droplet in `/opt/hub`: make sure `docker-compose.yml` passes `FEEDBACK_KEY: ${HORMIGAS_FEEDBACK_KEY:-}` to `hormigas` (deploys don't update this file; copy the line from `deploy/hub/docker-compose.yml`), add `HORMIGAS_FEEDBACK_KEY=YOUR-PHRASE` to `.env`, then run `docker compose up -d hormigas`.
3. Open the link and bookmark it. Keep it with the other private hosting notes on your PC (never in the repo). A wrong or missing key gets a plain "not found".

To change the key (say it leaked), edit `.env` and run `docker compose up -d hormigas` again.

## Rules for the live server

- **Run exactly one Hormigas instance (one replica).** The event loop and WebSocket push assume a single server process. Scaling out needs a shared event lock and pub/sub first.
- **World speed is fixed at creation.** Production defaults to ×1. Changing `WORLD_SPEED` later does nothing; a fresh world means a fresh database.
- **Every deploy backs up the game database first** (see above). Backups still live on the droplet itself, so they don't survive losing the droplet; turn on DigitalOcean droplet backups or copy `backups/` elsewhere for that.
- The production image already sets `NODE_ENV=production`, which turns on secure cookies, trusted proxy headers (Caddy is the proxy) and speed ×1.

## Adding another project to the hub

1. Add a service to `docker-compose.yml` (image, environment, `restart: unless-stopped`).
2. Add a block to the `Caddyfile`: `name.marz.gg { reverse_proxy service:port }`.
3. If it needs a database, run `./add-database.sh name` and put the printed password in `.env`.
4. Add an A record for `name.marz.gg` in SiteGround's DNS Zone Editor, pointing at the droplet.
5. Run `docker compose up -d`. Caddy fetches the HTTPS certificate on its own.

Copy the changes back into `deploy/hub/` in the project's repo so the reference copy stays in sync. Latency-sensitive real-time games, such as an RTS, should get their own droplet rather than share this one.

## Rebuilding the hub from scratch

1. Create an Ubuntu 24.04 droplet with an SSH key (2 GB RAM is enough).
2. Point the A records for `hormigas.marz.gg` and `guildie.marz.gg` at it.
3. From the `deploy/` folder: `scp setup-droplet.sh root@IP:` then `ssh root@IP bash setup-droplet.sh`.
4. `scp -r hub/. deploy@IP:/opt/hub/`, then on the droplet: `chmod 755 postgres-init *.sh postgres-init/*.sh`. Copying from Windows can leave `postgres-init` unreadable to Postgres, and its first start then crash-loops.
5. `cp .env.example .env`, fill in passwords with `openssl rand -hex 24` (hex keeps them safe inside a database URL), and run `chmod 600 .env`. `GUILDIE_REALTIME_SECRET` is not generated here: copy the phrase from Guildie's `config.php` (`realtime_secret`).
6. Add the GitHub deploy key's public half to `/home/deploy/.ssh/authorized_keys`, and update the `DROPLET_HOST` secret.
7. `docker compose up -d`, then restore the latest backup if you're moving an existing world.
8. Add the backup cron job: `crontab -e` → `30 3 * * * /opt/hub/backup.sh`.

The Postgres init script only runs when the data volume is empty. If the first start fails, fix the cause, then `docker compose down && docker volume rm hub_db_data` before trying again. This is only safe while the volume holds no game data.

## Other hosts

Render, Fly.io, Railway or any other Docker host work too: build the same `Dockerfile`, attach Postgres, set `DATABASE_URL`, and expose the port. The health check path is `/api/health`. Avoid free tiers that sleep after inactivity, because the game's timers and live notifications stop when the server sleeps.
