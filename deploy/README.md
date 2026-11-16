# Tourny Lite — Deployment Guide (two slots: stable + dev)

Multi-tournament scoring with a live projector scoreboard, a field scoring
console, and an M&E coordination console. Ships as **self-contained Docker
containers** (Next.js standalone server + embedded SQLite) — engineered for a
resource-constrained VM (2 OCPU / 12 GB RAM hosting 25+ containers).

**One repo folder on the VM builds and runs TWO containers, each from its own
branch:**

| Slot | Branch | Container | URL | Data |
| --- | --- | --- | --- | --- |
| `stable` | `main` *(configure in `deploy.env`)* | `tourny-stable` | `http://127.0.0.1:8090` (tunnel → public) | `deploy/data-stable/` |
| `dev` | `feature/student-rankings` *(configure in `deploy.env`)* | `tourny-dev` | `http://127.0.0.1:8091` (localhost only) | `deploy/data-dev/` |

The trick: each slot's **git worktree** (`deploy/worktrees/<slot>`) is the
docker build context. `deploy/deploy.sh` fetches origin, points each worktree
at its branch, builds the image and restarts the container — so the stable
image is always *exactly* the stable branch, and the dev image is exactly the
dev branch. No checkout juggling, no re-copying the folder.

## Architecture

| Requirement | This build (Next.js 16) |
| --- | --- |
| Embedded DB | SQLite (WAL) via Prisma — one independent volume per slot |
| Realtime | Server-Sent Events route (`/api/stream`) |
| Container | Next.js standalone server (single `node server.js`) per slot |
| REST API | App Router route handlers (`/api/*`) |
| Auth | HMAC-signed session cookies + scrypt password hashing (per-slot secret) |
| Memory ceiling | ~80–150 MB per container (stable capped 512 MB, dev 384 MB) |

## Quick start on the VM

```bash
# 0. The repo folder was copied to the VM. Put its main checkout on a branch
#    that has deploy/deploy.sh (feature/student-rankings or later):
cd tourny-lite
git fetch origin && git checkout feature/student-rankings && git reset --hard origin/feature/student-rankings

# 1. One-time setup — worktrees, per-slot secrets, first build, start:
./deploy/deploy.sh setup

# 2. Verify both slots:
curl http://127.0.0.1:8090/api    # stable
curl http://127.0.0.1:8091/api    # dev
```

`setup` also prints a migration hint if it finds data or a container from the
old single-container setup (see [Migration](#migration-from-the-old-single-container-setup)).

## Which branch runs where

Branches are configured in **`deploy/deploy.env`** (committed defaults). For
VM-specific values that must survive `git pull`, create
**`deploy/deploy.local.env`** (gitignored — it wins):

```bash
# deploy/deploy.local.env
STABLE_BRANCH=release/2026
DEV_BRANCH=feature/next-thing
```

Precedence: `deploy.local.env` > environment variables > `deploy.env` defaults.
When promoting: merge the dev branch into the stable branch (on your dev
machine, push), then `./deploy/deploy.sh update stable` on the VM.

## Daily operations

```bash
./deploy/deploy.sh update              # fetch + rebuild + restart BOTH slots
./deploy/deploy.sh update stable       # only stable (dev keeps running)
./deploy/deploy.sh update dev          # only dev
./deploy/deploy.sh status              # commit / image / container / data per slot
./deploy/deploy.sh logs stable         # follow logs (no argument = both)
./deploy/deploy.sh ps                  # container table
./deploy/deploy.sh down [stable|dev]   # stop (data is always kept)
./deploy/deploy.sh up [stable|dev]     # start again (no rebuild)
./deploy/deploy.sh restart dev         # plain restart
./deploy/deploy.sh prune               # drop dangling images from rebuilds
```

A typical cycle: work on the dev machine → push the feature branch →
`./deploy/deploy.sh update dev` on the VM → test at `http://127.0.0.1:8091` →
merge into the stable branch → `./deploy/deploy.sh update stable`.

Offline VM? `SKIP_FETCH=1 ./deploy/deploy.sh update stable` deploys whatever
refs the copied folder already contains.

## Data, isolation, backups

- Each slot has its **own SQLite volume** (`deploy/data-stable/`,
  `deploy/data-dev/`) and its **own `AUTH_SECRET`** (generated into
  `deploy/env/<slot>.env`, mode 600, never committed). A schema change on dev
  can never touch stable's database, and stable's sessions stay valid even if
  dev's secret rotates.
- The dev slot also uses a **separate session cookie**
  (`SESSION_COOKIE_NAME=tourny_session_dev`) and wears an amber **Exp** badge
  (`APP_VARIANT=experimental`). Browsers scope cookies by domain, **not
  port** — without the separate cookie, opening `:8090` and `:8091` in the
  same browser would keep signing each other out, and the badge makes it
  impossible to mistake the dev build for stable.
- `./deploy/deploy.sh backup stable` — WAL-checkpointed, timestamped
  `tar.gz` of a slot's volume into `deploy/backups/` (newest 10 kept).
- `./deploy/deploy.sh clone-db` — **replace** dev's database with a copy of
  stable's (WAL checkpointed first). The safe way to try new code against
  real data. Dev's own data is discarded — it will ask for confirmation.

## First-run setup

On first visit the app shows a one-time **administrator setup** screen:
create the organiser account, then issue scorekeeper accounts from
*Team & access*. Reading tournaments and results stays public; every write
requires a signed-in account. Do this once per slot — the two slots have
completely separate accounts and data.

## Cloudflare Tunnel

Add the ingress block from `cloudflare-config.yml` to the host's existing
`cloudflared` configuration and restart the service. The tunnel forwards
`tournament.yourdomain.com → http://127.0.0.1:8090` (the stable slot). Live
updates stream through Cloudflare without WebSocket support (plain HTTP
streaming).

The dev slot stays private by default. To reach it from your laptop:
`ssh -L 8091:127.0.0.1:8091 <vm>` → `http://localhost:8091`. The config file
also contains a commented optional ingress if you ever need a public dev URL.

## Migration from the old single-container setup

```bash
# stop & remove the old container and move its data onto the stable slot:
docker rm -f tourny-lite 2>/dev/null || true
cd tourny-lite
git pull --ff-only
mv deploy/data deploy/data-stable          # keeps the existing database
./deploy/deploy.sh setup
```

If you would rather start fresh, skip the `mv` and delete `deploy/data`.

## Operational profile

| Scenario | CPU | RAM | Network |
| --- | --- | --- | --- |
| Idle (one slot) | < 0.5% | ~80 MB | 0 KB/s |
| Active field scoring (10 judges) | 1–4% | ~100 MB | ~15 KB/s |
| Live projector streaming (SSE) | < 1% | ~110 MB | < 2 KB/s keep-alive |

Two slots running idle add up to ~160–200 MB — still small for a 12 GB VM.
Each built image also occupies disk; `./deploy/deploy.sh prune` removes the
dangling images left behind by rebuilds.

## Day-of-event runbook

1. **Set up** (on the stable slot): Home → template card → *Launch this
   tournament* — or *Design a tournament* for the guided three-step setup.
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

**`deploy.sh update` says the branch is not found** — the slot's branch
neither exists locally nor as `origin/<branch>`. Fix the branch names in
`deploy/deploy.env` / `deploy/deploy.local.env`, or push the branch and
re-run (the script prints every branch it can see).

**`leftover directory … is not a registered git worktree`** — a previous
worktree was removed by hand. Fix exactly as printed:
`rm -rf deploy/worktrees/<slot>`, then re-run the command.

**A worktree has no `deploy/Dockerfile`** — the configured branch predates
the container build. Point the slot at a newer branch.

**`Error: Can't write to /app/node_modules/@prisma/engines …` on startup** —
the Prisma engine *binaries* were missing from the image. The
`@prisma/engines` postinstall downloads them with `failSilent: true`, so a
failed (or skipped) download during `bun install --production` still exits 0
and produces a hollow `@prisma/engines` directory. At startup, `prisma db push`
then tries to download the engines at runtime — as the unprivileged `app`
user, into the root-owned `node_modules` — and crash-loops. The Dockerfile
bakes the engines at build time (one-shot `db push` inside the `prod-deps`
stage, as root, with network access) and fails the build loudly if they
cannot be fetched. Rebuild from scratch to pick up the fix:

```bash
./deploy/deploy.sh down
docker compose -f deploy/docker-compose.yml build --no-cache
./deploy/deploy.sh up
```

**`Error: Cannot find module '@prisma/engines'` on startup** — same class of
problem: the runtime image lacks the complete Prisma toolchain. The Dockerfile
ships the full production dependency tree alongside the standalone server.
Rebuild from scratch (commands above).

**A second container appeared (e.g. named "prisma" or a database service)** —
Tourny Lite needs **no external database container**; SQLite is embedded in
each app container. (Two *app* containers — `tourny-stable` and `tourny-dev` —
are expected.) If your deployment platform provisioned an extra database
resource, remove it — the app never connects to it.

**`unable to open database file`** — the slot's `deploy/data-<slot>`
directory is not writable by the container's `app` user. The entrypoint
repairs ownership automatically on startup; if it persists, check the
directory permissions on the host (`docker logs tourny-stable` shows the
exact error) or delete the directory and let Docker recreate it (back it up
first — it holds the database).

**Container restart-loops after a schema change** — check
`docker logs tourny-<slot>` for the Prisma step; the entrypoint applies
schema changes automatically (idempotent `prisma db push`).

**Direct `docker compose` fails before `deploy.sh setup` ran** — the compose
file needs `deploy/worktrees/<slot>` (build contexts) and
`deploy/env/<slot>.env` (secrets), both created by `setup`. Run
`./deploy/deploy.sh setup` once; afterwards plain compose commands work.

## Local development

```bash
bun install
cp .env.example .env        # set DATABASE_URL + AUTH_SECRET
bun run db:push             # apply schema to db/custom.db
bun run scripts/battle-test.ts   # full API test suite (server must be running)
bun run dev                 # http://localhost:3000
```
