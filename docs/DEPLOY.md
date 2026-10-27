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
                          ├─ caddy     HTTPS (automatic Let's Encrypt) → hormigas:3000
                          ├─ hormigas  ghcr.io/marcialpimentel/hormigas:latest
                          └─ db        postgres:16 (not exposed; one database + user per project)
```

The files that define the hub are in [`deploy/`](../deploy/). The copy on the server, at `/opt/hub`, is the one that runs. It also has a `.env` with the real passwords, which never leaves the server.

| File | What it does |
|---|---|
| `deploy/setup-droplet.sh` | One-time server prep: Docker, 2 GB swap, firewall (SSH/HTTP/HTTPS only), automatic security updates, `deploy` user, `/opt/hub` |
| `deploy/hub/docker-compose.yml` | The containers: `caddy`, `db`, `hormigas` |
| `deploy/hub/Caddyfile` | Which domain goes to which container |
| `deploy/hub/.env.example` | Variable names for `.env` (`POSTGRES_PASSWORD`, `HORMIGAS_DB_PASSWORD`, `HORMIGAS_WORLD_NAME`) |
| `deploy/hub/postgres-init/01-hormigas.sh` | Creates the `hormigas` database and user on the database's very first start |
| `deploy/hub/add-database.sh` | Creates a database and user for another project |
| `deploy/hub/backup.sh` | Dumps every database to `/opt/hub/backups`, keeps 7 days (cron, nightly 03:30 UTC) |

## How a change goes live

Merging to `main` deploys automatically:

1. **CI** (`.github/workflows/ci.yml`) runs typecheck, tests and build.
2. If CI passes, **Deploy** (`.github/workflows/deploy.yml`) builds the image on GitHub's runners and pushes it to GitHub Container Registry as `latest` and as the commit SHA.
3. Deploy then SSHes into the droplet as `deploy` and runs `docker compose pull hormigas && docker compose up -d hormigas`.
4. The old container gets SIGTERM and finishes in-flight events (30 s grace period), and the new one applies database migrations on start.

To redeploy without a code change, go to **Actions → Deploy → Run workflow**.

Deploy needs two repository secrets: `DROPLET_HOST` (the droplet's IP) and `DROPLET_SSH_KEY` (the private half of a key used only by GitHub). The GHCR package `hormigas` is public so the droplet can pull it without logging in.

## Everyday commands (on the droplet, in `/opt/hub`)

| Task | Command |
|---|---|
| Status of every container | `docker compose ps` |
| Live server logs | `docker compose logs -f hormigas` |
| Restart the game | `docker compose restart hormigas` |
| Start or update everything | `docker compose up -d` |
| Back up now | `./backup.sh` |
| Open a database shell | `docker compose exec db psql -U postgres -d hormigas` |
| Restore a backup (replaces data!) | `zcat backups/all-YYYY-MM-DD.sql.gz \| docker compose exec -T db psql -U postgres` |

## Rules for the live server

- **Run exactly one Hormigas instance (one replica).** The event loop and WebSocket push assume a single server process. Scaling out needs a shared event lock and pub/sub first.
- **World speed is fixed at creation.** Production defaults to ×1. Changing `WORLD_SPEED` later does nothing; a fresh world means a fresh database.
- **Back up before risky changes**, such as migrations that drop or rewrite data: run `./backup.sh` first.
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
2. Point the A record for `hormigas.marz.gg` at it.
3. From the `deploy/` folder: `scp setup-droplet.sh root@IP:` then `ssh root@IP bash setup-droplet.sh`.
4. `scp -r hub/. deploy@IP:/opt/hub/`, then on the droplet: `chmod 755 postgres-init *.sh postgres-init/*.sh`. Copying from Windows can leave `postgres-init` unreadable to Postgres, and its first start then crash-loops.
5. `cp .env.example .env`, fill in passwords with `openssl rand -hex 24` (hex keeps them safe inside a database URL), and run `chmod 600 .env`.
6. Add the GitHub deploy key's public half to `/home/deploy/.ssh/authorized_keys`, and update the `DROPLET_HOST` secret.
7. `docker compose up -d`, then restore the latest backup if you're moving an existing world.
8. Add the backup cron job: `crontab -e` → `30 3 * * * /opt/hub/backup.sh`.

The Postgres init script only runs when the data volume is empty. If the first start fails, fix the cause, then `docker compose down && docker volume rm hub_db_data` before trying again. This is only safe while the volume holds no game data.

## Other hosts

Render, Fly.io, Railway or any other Docker host work too: build the same `Dockerfile`, attach Postgres, set `DATABASE_URL`, and expose the port. The health check path is `/api/health`. Free tiers that sleep after inactivity don't break the game: nothing ticks, so the first request after a sleep catches the world up and resolves every finished build, raid and journey in order. What they do cost is a slow first load while the server wakes, and free databases that expire can wipe the world.
