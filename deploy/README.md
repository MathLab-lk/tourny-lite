# Tourny Lite — Deployment Guide

Multi-tournament scoring with a live projector scoreboard, a field scoring
console, and an M&E coordination console. Ships as a **single self-contained
Docker container** with an embedded SQLite database — engineered for a
resource-constrained VM (2 OCPU / 12 GB RAM hosting 25+ containers).

## Architecture

| Requirement | This build (Next.js 16) |
| --- | --- |
| Embedded DB | SQLite (WAL) via Prisma |
| Realtime | Server-Sent Events route (`/api/stream`) |
| Single container | Next.js standalone server (single `node server.js`) |
| REST API | App Router route handlers (`/api/*`) |
| Auth | HMAC-signed session cookies + scrypt password hashing (no external services) |
| Memory ceiling | ~80–150 MB (Node runtime), capped at 512 MB hard limit |

## Deploy on the VM

```bash
# 1. Copy the project to the VM, then:
cd tourny-lite

# 2. Generate a session-signing secret and expose it to compose:
export AUTH_SECRET="$(openssl rand -hex 32)"

# 3. Build and start (bound strictly to localhost):
docker compose -f deploy/docker-compose.yml up -d --build

# 4. Verify:
curl http://127.0.0.1:8090/api
# → {"status":"ok","db":"up", ...}
```

SQLite data persists in `deploy/data/` (bind-mounted volume). The container
runs the entrypoint, which applies the Prisma schema (idempotent), enables
SQLite WAL journaling for concurrent readers (scoreboard streams) and writers
(scorekeepers), and starts the server.

> **Security note** — `AUTH_SECRET` signs every session cookie. Use a long
> random value (`openssl rand -hex 32`) and keep it stable across restarts,
> or signed-in users will need to sign in again.

## First-run setup

On first visit the app shows a one-time **administrator setup** screen:
create the organiser account, then issue scorekeeper accounts from
*Team & access*. Reading tournaments and results stays public; every write
requires a signed-in account.

## Cloudflare Tunnel

Add the ingress block from `cloudflare-config.yml` to the host's existing
`cloudflared` configuration and restart the service. The tunnel forwards
`tournament.yourdomain.com → http://127.0.0.1:8090`. Live updates stream
through Cloudflare without WebSocket support (plain HTTP streaming).

## Operational profile

| Scenario | CPU | RAM | Network |
| --- | --- | --- | --- |
| Idle | < 0.5% | ~80 MB | 0 KB/s |
| Active field scoring (10 judges) | 1–4% | ~100 MB | ~15 KB/s |
| Live projector streaming (SSE) | < 1% | ~110 MB | < 2 KB/s keep-alive |

## Day-of-event runbook

1. **Set up**: Home → template card → *Launch this tournament* (39 events,
   6 centers, 75/50/25 scoring) — or *Design a tournament* for the guided
   three-step setup.
2. **Centers**: Coordination console → Centers tab → paste any extra center
   codes (`402`, `403 — Galle Center`).
3. **Scorekeepers**: create accounts under *Team & access*, share the URL;
   each signs in on a phone/tablet, then Division → Game → Event → 3-tap
   podium → Confirm. Offline submissions are saved on the device and sync
   automatically.
4. **Projector**: open *Scoreboard* on the auditorium machine → Fullscreen.
   Standings update live.
5. **Coordination**: the event grid tracks every slot; corrections require a
   written justification and are recorded in the revision history.
   *Progress sheet* and *Awards scorecard* print to A4.
6. **Next year**: Home → ⋯ → *Duplicate tournament* — structure copied,
   results cleared.

## Troubleshooting

**`Error: Cannot find module '@prisma/engines'` on startup** — the runtime
image was built without the complete Prisma toolchain. Fixed in this version:
the Dockerfile now installs production dependencies in a dedicated stage and
ships the full tree (`prisma`, `@prisma/engines`, `@prisma/internals`, …)
alongside the standalone server. Rebuild from scratch to pick up the fix:

```bash
docker compose -f deploy/docker-compose.yml down
docker compose -f deploy/docker-compose.yml build --no-cache
docker compose -f deploy/docker-compose.yml up -d
```

**A second container appeared (e.g. named "prisma" or a database service)** —
Tourny Lite ships as **one container by design**. The database is embedded
SQLite inside the app container; no external database container is needed or
used. If your deployment platform provisioned an extra database resource,
remove it — the app never connects to it.

**`unable to open database file`** — the `deploy/data` directory is not
writable by the container's `app` user. The entrypoint repairs ownership
automatically on startup; if it persists, check the directory permissions on
the host (`docker logs tourny-lite` shows the exact error) or delete the
directory and let Docker recreate it (back it up first — it holds the
database).

**Container restart-loops after a schema change** — check
`docker logs tourny-lite` for the Prisma step; the entrypoint applies schema
changes automatically (idempotent `prisma db push`).

## Local development

```bash
bun install
cp .env.example .env        # set DATABASE_URL + AUTH_SECRET
bun run db:push             # apply schema to db/custom.db
bun run scripts/battle-test.ts   # full API test suite (server must be running)
bun run dev                 # http://localhost:3000
```
