# AGENT.md — working guide for AI coding agents

Read this before changing anything. It records what the codebase expects
and the traps that are not obvious from the source alone. Human-readable
context (features, screenshots, UX rationale) lives in `README.md`;
deployment detail lives in `deploy/README.md`.

## What this is

Tourny Lite — a multi-tournament scoring app for Sri Lankan youth-center
sports days: centers → divisions → games → events, podium results and
per-student mark sheets, live SSE scoreboard, WhatsApp broadcasting,
printable sheets, audit trail. Single self-contained Docker container
(Next.js standalone + embedded SQLite), sized for a 2-OCPU ARM VM that
hosts 25+ containers.

Stack: Next.js 16 App Router + TypeScript, Prisma + SQLite (WAL),
Server-Sent Events (`/api/stream`), Tailwind, scrypt + HMAC-cookie auth
(no external services), WAHA for WhatsApp.

## Domain model (prisma/schema.prisma)

- `Tournament` → `Division` → (`GameType`) → `TournamentEvent` — an event
  has `scoringMode`: `center-podium` (classic 3-tap) or `student-marks`
  (per-student mark sheet; the center podium is **derived** from
  per-center sums and re-derived whenever marks change).
- `Center` — competes for podium places; **one center may legally sweep
  several places of an event** (the podium editor must never block that).
- `Student` — formally registered (name + center + grade), gets an
  **issued student ID** composed from the tournament's `studentIdPattern`
  (Settings → Student IDs, default `{center}-{grade}-{index}` → e.g.
  `402-8-07`; per-tournament, validated — a pattern using `{center}`
  requires a center, `{grade}` requires a grade, `{index}` auto-bumps
  until unique). Same-name students are distinct internal records.
  `StudentScore` = one student's mark on one event.
- `EventResult` — a podium (places → centerIds + notes), either manual or
  `derivedFromStudents`.
- `User` / `InvitationCode` — roles: guest (read), scorekeeper, admin;
  invitations are single-use, optional expiry.
- `AuditLog` — every correction needs a written justification and lands
  here. `ResetSnapshot` powers undo-reset. `AppSetting` — app-wide
  settings (WhatsApp config etc.).

Service layer: `src/lib/*-service.ts` (tournament, event, result,
student) — route handlers in `src/app/api/**` stay thin; business rules
and standings math live in the services. `student-math.ts` = derivation
and leaderboard ordering.

## Commands

```bash
bun install
cp .env.example .env            # DATABASE_URL + AUTH_SECRET
bun run db:push                 # apply schema (db/ is gitignored)
bun run dev                     # http://localhost:3000

bun run lint
npx tsc --noEmit                # NOTE: has a PRE-EXISTING fontkit error
                                # (transitive dep) — ignore that one
bun run build                   # next build + prepare-standalone.mjs
```

### Test protocol (dev server must be running)

```bash
bun run scripts/seed.ts                    # reset + seed demo data
bun run scripts/battle-test.ts             # 149 assertions — core suite
bun run scripts/student-test.ts            # 63 assertions — student flow
bun run scripts/event-edit-probe.ts        # event slot editing
bun run scripts/undo-reset-test.ts         # 47 assertions — reset/undo
bun run scripts/waha-mock.ts 3001 &        # mock WAHA server
BASE_URL=http://localhost:3000 bun run scripts/whatsapp-test.ts
```

Seeded admin: `admin@tourny.test` / `correct horse battery`.
Run the suites before pushing anything non-trivial; keep them green.

## Frontend shape

One route tree (`src/app/[[...slug]]/page.tsx` → `TournyApp`) — views
are URL-addressable (`/t/<slug>/…`, public guest scoreboard + per-event
guest pages). State: zustand store in `src/components/tournament/`
(see `tourny-app.tsx`, `app-shell.tsx`, `home-view.tsx`,
`student-marks-editor.tsx`, `podium-editor.tsx`, `present-board.tsx`).
Motion vocabulary is shared via `ui-bits.tsx` — nothing snaps; reuse its
spring tokens and stagger variants instead of inventing new ones.
The Overview view is the coordination console (bird's-eye event grid +
mark entry); there is intentionally no separate scorer page.

## Deployment — two slots from one repo folder (deploy/)

One repo folder on the VM builds TWO containers, each from its own
branch; a **git worktree per slot** (`deploy/worktrees/<slot>`) is the
docker build context:

| Slot | Branch (default) | Container | URL | Data |
| --- | --- | --- | --- | --- |
| stable | `main` | `tourny-stable` | `127.0.0.1:8090` (Cloudflare Tunnel → public) | `deploy/data-stable/` |
| dev | `feature/student-rankings` | `tourny-dev` | `127.0.0.1:8091` (localhost only) | `deploy/data-dev/` |

```bash
./deploy/deploy.sh setup                 # first time: worktrees + secrets + build + start
./deploy/deploy.sh update [stable|dev]   # fetch + sync worktree + rebuild + restart
./deploy/deploy.sh status | logs | ps | up | down | restart | prune
./deploy/deploy.sh backup [stable|dev]   # WAL-checkpointed tar.gz (keeps last 10)
./deploy/deploy.sh clone-db [--yes]      # replace dev's DB with stable's data
```

- Branch config: `deploy/deploy.local.env` (gitignored, wins) > env vars
  > `deploy/deploy.env` (committed defaults).
- `setup` / `update` / `up` pre-flight the slot ports (8090/8091): a
  foreign container already publishing a port stops the run before any
  build, naming the culprit (usually the retired `tourny-lite-exp`
  experimental build — the dev slot replaces it).
- The dev slot sets `SESSION_COOKIE_NAME=tourny_session_dev` and
  `APP_VARIANT=experimental` (amber Exp badge). Cookies are scoped by
  **domain, not port** — never remove the separate cookie name, or
  `:8090` and `:8091` sign each other out of the same browser.
- Never commit or delete `deploy/data*/`, `deploy/env/`,
  `deploy/worktrees/`, `deploy/backups/` — they are runtime state
  (gitignored). Copying SQLite files safely requires a WAL checkpoint
  first (`backup`/`clone-db` do it via `docker exec … PRAGMA
  wal_checkpoint(TRUNCATE)`).
- ARM64 VM, memory caps: stable 512M / dev 384M. Healthcheck hits
  `http://127.0.0.1:8090/api` inside both containers.

## Hard rules

1. **Never invent data** — tournament/center names, dates and numbers in
   docs or seeds must match the repo's demo data.
2. **Corrections always need a justification** — any write path that
   changes a recorded result must write an `AuditLog` entry.
3. **Re-derivation must be automatic** — anything that changes marks
   (reassign, remove, reset, edit) re-derives affected events.
4. **A center may hold several podium places in one event** — that is
   valid (sweeps); do not add uniqueness checks on centerId per event.
5. Don't reformat unrelated code; keep commits small and described.
6. `README.md` + `deploy/README.md` are part of the deliverable — update
   them when behavior changes.

## Sandbox / environment traps

- This repo may be checked out with `core.fileMode=false` — `chmod +x`
  is INVISIBLE to git. To ship an executable bit:
  `git update-index --chmod=+x <file>` (deploy.sh once shipped as 644
  and broke `./deploy/deploy.sh` on fresh clones).
- `npx tsc --noEmit` shows one fontkit error from a transitive
  dependency — pre-existing, ignore it, don't "fix" it.
- No docker in the dev sandbox: dry-run deploy tooling with the stub
  CLI pattern (`scripts/stub/docker` + `scripts/deploy-dryrun.sh`,
  57 assertions) and structural YAML checks
  (`scripts/deploy-compose-check.py`).
- SQLite in WAL mode: never `cp` the db files without checkpointing.

## Branches (at the time of writing)

- `main` — stable lineage (modern-UX/auth work), what stable deploys.
- `feature/student-rankings` — the active feature line: student
  registration with issued IDs, mark sheets, derived podiums, undo-reset,
  Overview consolidation. This is what the dev slot deploys.
- Old `feature/member-ranking` was rebuilt into `feature/student-rankings`
  and deleted — don't resurrect it.
