# Tourny Lite

Tournament management and live scoring for multi-division competitions —
built for organisers who need results recorded accurately, published
instantly, and audited completely.

Run an entire event from one lightweight application:

- **Ready-made template** — launch the Seed Ministries Math Competition 2026
  (5 divisions, 7 games, 39 event slots, 6 center codes, 75/50/25 scoring)
  with a single click.
- **Guided custom setup** — design any competition: your own scoring scheme,
  divisions, games, event counts and center roster in three steps.
- **Field scoring console** — touch-optimised for phones and tablets.
  Scorekeepers pick a division, a game and an event, then assign the podium
  with three taps. Results saved while offline sync automatically.
- **Live projector scoreboard** — a high-contrast dark screen for the
  auditorium with gold / silver / bronze rank accents and deterministic
  tie-breaking (total → first → second → third places).
- **Coordination console (M&E)** — a division × game matrix of every event,
  result corrections with mandatory justification, a complete revision
  history, center management and A4 print sheets (progress + awards).
- **Secure by default** — tournaments and results are public to read;
  creating, editing and scoring require a signed-in account. Every result
  records who submitted it.

## Roles

| Role | Capabilities |
| --- | --- |
| **Guest** (no account) | View tournaments, standings, the scoreboard, the event grid and the revision history |
| **Scorekeeper** | Record and correct results, manage event status |
| **Administrator** | Everything: create / duplicate / delete tournaments, manage centers, reset results, settings, team accounts |

The first account created becomes the administrator (first-run setup);
further accounts are issued from *Team & access*.

## Technology

Next.js 16 (App Router, standalone output) · TypeScript · Prisma + SQLite
(WAL) · Server-Sent Events · Tailwind CSS 4 + shadcn/ui · Zustand.
Authentication uses HMAC-signed session cookies and scrypt password
hashing — no external services, keeping the footprint small.

## Quick start

```bash
bun install
cp .env.example .env      # set DATABASE_URL + AUTH_SECRET
bun run db:push           # create the SQLite schema
bun run dev               # http://localhost:3000
```

Open http://localhost:3000, create the administrator account, then launch
the template tournament from the home screen.

## Testing

With the dev server running:

```bash
bun run scripts/battle-test.ts
```

The battle suite exercises authentication, role enforcement (guest /
scorekeeper / administrator), tournament lifecycle, result guardrails and
standings mathematics, corrections and the audit trail, center management,
the live event stream, concurrent submissions and account management —
103 assertions in total.

## Deployment

Single Docker container with an embedded database, tuned for small VMs
(~80–150 MB RAM, hard 512 MB cap), exposed through Cloudflare Tunnel or
any reverse proxy:

```bash
export AUTH_SECRET="$(openssl rand -hex 32)"
docker compose -f deploy/docker-compose.yml up -d --build
```

See [deploy/README.md](deploy/README.md) for the full runbook.

## Project layout

```
prisma/                  Database schema (tournaments, events, results, accounts, audit)
src/app/api/             REST + SSE route handlers (auth, tournaments, results, stream)
src/lib/                 Domain services: tournament setup, results, auth, presets
src/components/tournament/  UI views: home, scoring, scoreboard, coordination, dialogs
deploy/                  Dockerfile, compose, entrypoint, tunnel config
scripts/                 Battle test suite + demo seeder
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLite file path, e.g. `file:./db/custom.db` |
| `AUTH_SECRET` | Secret used to sign session cookies — use a long random value in production |
