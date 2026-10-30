# Hormigas — Deploy

_Current as of Build 11 (2026-10-30)._

Hormigas is live at **https://hormigas.marz.gg**. It runs on a small cloud server (the "hub") that can host several of Marz's projects side by side.

Hormigas ships as **one Docker image** (`Dockerfile`) that serves the API, WebSockets and the game client, plus **one PostgreSQL database**. Any host that runs Docker images works; this doc describes the hub in general terms.

> **Private details are not in this repo.** The server's address, folders, users, DNS setup, SSH keys and passwords live in Marz's private hosting notes (git-ignored), in GitHub secrets and in the server's own `.env`. Never commit them here.

## How it fits together

```
Browser ── https://hormigas.marz.gg ──▶ DNS record for the subdomain
                                          │
                                          ▼
                          Hub server (Linux, Docker Compose)
                          ├─ caddy      HTTPS (automatic Let's Encrypt) → hormigas:3000,
                          │             plus other projects' subdomains
                          ├─ hormigas   ghcr.io/marcialpimentel/hormigas:latest
                          ├─ db         postgres:16 (not exposed; one database + user per project)
                          └─ (other projects' containers)
```

### Other projects share the hub

The hub also runs containers for other projects (for example Guildie's live rooms). Those projects deploy their own containers from their own repos; **Hormigas deploys leave them alone** and only run `docker compose up -d hormigas`. If another project's container stops, Hormigas is unaffected. If you change another project's block in the server's `docker-compose.yml` or `Caddyfile`, copy the change into `deploy/hub/` here too.

The files that define the hub are in [`deploy/`](../deploy/). The copy on the server is the one that runs. It also has a `.env` with the real passwords, which never leaves the server.

| File | What it does |
|---|---|
| `deploy/setup-droplet.sh` | One-time server prep: Docker, 2 GB swap, firewall (SSH/HTTP/HTTPS only), automatic security updates, a non-root deploy user, the hub folder |
| `deploy/hub/docker-compose.yml` | The containers: `caddy`, `db`, `hormigas` and the other projects' services |
| `deploy/hub/Caddyfile` | Which domain goes to which container |
| `deploy/hub/.env.example` | Variable names for `.env` (database passwords, world name, optional feedback key, and other projects' settings) |
| `deploy/hub/postgres-init/01-hormigas.sh` | Creates the `hormigas` database and user on the database's very first start |
| `deploy/hub/add-database.sh` | Creates a database and user for another project |
| `deploy/hub/backup.sh` | Dumps every database to the hub's `backups/` folder, keeps 7 days (nightly cron) |

## How a change goes live

Merging to `main` deploys automatically:

1. **CI** (`.github/workflows/ci.yml`) runs two jobs side by side: typecheck, tests and build in one, and the Docker image build in the other. On `main` the image is pushed to GitHub Container Registry tagged with the commit SHA. On PRs the image is only built, to prove the Dockerfile still works.
2. If both jobs pass, **Deploy** (`.github/workflows/deploy.yml`) takes that same image (no second build) and tags it `latest` in the registry. `latest` therefore only ever points at a build that passed CI.
3. Deploy then connects to the hub over SSH (as a deploy-only user) and, in the hub folder:
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

This deploys the saved image for that commit, with the same backup and health check as a normal deploy, and points `latest` at it. It refuses a commit whose CI run failed. Then fix forward: the next merge to `main` deploys as usual.

On the server, `docker tag ghcr.io/marcialpimentel/hormigas:previous ghcr.io/marcialpimentel/hormigas:latest && docker compose up -d hormigas` does the same for the build that ran just before the current one.

Two things to know:
- **Migrations aren't undone.** An older build runs on the newer database. That's fine for migrations that only add tables or columns, which is how they should be written. If a migration rewrote data, restore the pre-deploy backup instead (below).
- After a rollback done **on the server** (the `previous` command above), don't run `docker compose pull hormigas` by hand: GitHub's `latest` still points at the broken build. A rollback through **Run workflow** moves `latest` too, so it doesn't have this problem.

Deploy needs two repository secrets: `DROPLET_HOST` (the server's address) and `DROPLET_SSH_KEY` (the private half of a key used only by GitHub). The GHCR package `hormigas` is public so the server can pull it without logging in.

## Everyday commands (on the server, in the hub folder)

| Task | Command |
|---|---|
| Status of every container | `docker compose ps` |
| Live server logs | `docker compose logs -f hormigas` |
| Restart the game | `docker compose restart hormigas` |
| Start everything | `docker compose up -d` (this also starts or recreates other projects' containers if their settings changed) |
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
2. On the server, in the hub folder: make sure `docker-compose.yml` passes `FEEDBACK_KEY: ${HORMIGAS_FEEDBACK_KEY:-}` to `hormigas` (deploys don't update this file; copy the line from `deploy/hub/docker-compose.yml`), add `HORMIGAS_FEEDBACK_KEY=YOUR-PHRASE` to `.env`, then run `docker compose up -d hormigas`.
3. Open the link and bookmark it. Keep it with the other private hosting notes on your PC (never in the repo). A wrong or missing key gets a plain "not found".

To change the key (say it leaked), edit `.env` and run `docker compose up -d hormigas` again.

## Rules for the live server

- **Run exactly one Hormigas instance (one replica).** The event loop and WebSocket push assume a single server process. Scaling out needs a shared event lock and pub/sub first.
- **World speed is fixed at creation.** Production defaults to ×1. Changing `WORLD_SPEED` later does nothing; a fresh world means a fresh database.
- **Every deploy backs up the game database first** (see above). Backups still live on the server itself, so they don't survive losing the server; turn on the host's server backups or copy `backups/` elsewhere for that ([#88](https://github.com/MarcialPimentel/hormigas/issues/88)).
- The production image already sets `NODE_ENV=production`, which turns on secure cookies, trusted proxy headers (Caddy is the proxy) and speed ×1.

## Adding another project to the hub

1. Add a service to `docker-compose.yml` (image, environment, `restart: unless-stopped`).
2. Add a block to the `Caddyfile`: `name.marz.gg { reverse_proxy service:port }`.
3. If it needs a database, run `./add-database.sh name` and put the printed password in `.env`.
4. Add a DNS record for `name.marz.gg` at the domain's DNS provider, pointing at the hub (details in Marz's private hosting notes).
5. Run `docker compose up -d`. Caddy fetches the HTTPS certificate on its own.

Copy the changes back into `deploy/hub/` in the project's repo so the reference copy stays in sync. Latency-sensitive real-time games, such as an RTS, should get their own server rather than share this one.

## Rebuilding the hub from scratch

The exact commands (addresses, users, folders) are in Marz's private hosting notes. In outline:

1. Create a small Ubuntu 24.04 server with an SSH key (2 GB RAM is enough).
2. Point the DNS records for the hub's subdomains at it.
3. Run `deploy/setup-droplet.sh` on it once as the admin user.
4. Copy `deploy/hub/` to the hub folder, then make the scripts readable: `chmod 755 postgres-init *.sh postgres-init/*.sh`. Copying from Windows can leave `postgres-init` unreadable to Postgres, and its first start then crash-loops.
5. `cp .env.example .env`, fill in passwords with `openssl rand -hex 24` (hex keeps them safe inside a database URL), and run `chmod 600 .env`. Other projects' settings are copied from those projects, not generated here.
6. Authorise the GitHub deploy key for the deploy user, and update the `DROPLET_HOST` secret.
7. `docker compose up -d`, then restore the latest backup if you're moving an existing world.
8. Add the nightly backup cron job for `backup.sh`.

The Postgres init script only runs when the data volume is empty. If the first start fails, fix the cause, then `docker compose down && docker volume rm hub_db_data` before trying again. This is only safe while the volume holds no game data.

## Other hosts

Render, Fly.io, Railway or any other Docker host work too: build the same `Dockerfile`, attach Postgres, set `DATABASE_URL`, and expose the port. The health check path is `/api/health`. Free tiers that sleep after inactivity don't break the game: nothing ticks, so the first request after a sleep catches the world up and resolves every finished build, raid and journey in order. What they do cost is a slow first load while the server wakes, and free databases that expire can wipe the world.
