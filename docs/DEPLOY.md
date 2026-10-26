# Deploying Hormigas

Hormigas ships as **one Docker image** (`Dockerfile`) that serves the API, WebSockets and the game client, plus **one PostgreSQL database**. Any host that runs Docker images works. The steps below use **Railway**, which needs no server management and doesn't put the game to sleep.

## Costs (checked Oct 2026 — verify on the host's pricing page)
- **Railway Hobby:** $5/month, which includes $5 of usage. A small Hormigas world (the app plus Postgres) should run around $5–10/month.
- **Not recommended:** free tiers that sleep after inactivity (the game's timers and live notifications stop) or delete free databases after a set time.

## Railway setup (one time, ~10 minutes)
1. **Create an account** at railway.com and sign in with GitHub. Choose the Hobby plan.
2. **New Project → Deploy from GitHub repo →** pick `MarcialPimentel/hormigas`. Grant Railway access to the repo if asked. Railway finds `railway.json` and builds the `Dockerfile`.
3. **Add the database:** in the project, **+ New → Database → PostgreSQL**.
4. **Connect them:** open the **hormigas** service → **Variables** → add
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (Railway fills in the private address)
   - `WORLD_SPEED` = `1` (optional; production already defaults to 1)
   - `WORLD_NAME` = `The Backyard` (optional)
5. **Get a public address:** service → **Settings → Networking → Generate Domain**. You get something like `hormigas-production.up.railway.app`.
6. Open the address and found a colony. Done.

After that, **every merge to `main` deploys automatically.** The server applies database migrations on start, and hosts stop the old version gracefully (SIGTERM) so in-flight events finish.

## Settings reference
| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | local Postgres | Connection string |
| `DATABASE_SSL` | `false` | Set `true` if the database is reached over the public internet with TLS |
| `PORT` | `3000` | Hosts usually set this |
| `NODE_ENV` | `production` in the image | Turns on secure cookies, trusted proxy headers, speed ×1 |
| `WORLD_SPEED` | `1` in production, `5` locally | Only used when the world is first created |
| `WORLD_NAME` | `The Backyard` | Only used when the world is first created |

## Rules for the live server
- **Run exactly one instance (one replica).** The event loop and WebSocket push assume a single server process. Scaling out needs a shared event lock and pub/sub first.
- **World speed is fixed at creation.** Changing `WORLD_SPEED` later does nothing; starting a fresh world means a fresh database.
- **Back up the database.** Railway's Postgres has backups on paid plans — turn them on before inviting players.

## Other hosts
- **Render / Fly.io / a VPS:** build the same `Dockerfile`, attach a Postgres database, set `DATABASE_URL`, expose the port. Health check path: `/api/health`.
