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
- **Student rankings with a registration stage** — events can be scored
  by individual student marks instead of a picked podium: students are
  registered with name, center and grade, receive a unique, pattern-built
  student ID (`402-8-07`) and earn custom marks per event; each center's
  entry is the sum of its students' marks, and the podium — plus the fixed
  place points — is derived from those sums. A live student leaderboard
  ranks every competitor.
- **Field scoring on the Overview** — touch-optimised for phones and
  tablets. The bird's-eye event matrix records everything: tap an event
  chip, assign the podium with three taps (a center may hold several
  places) or switch to the per-student mark sheet. Results saved while
  offline sync automatically.
- **Live projector scoreboard** — presented from any tournament's Overview
  as a full-screen, high-contrast dark stage with gold / silver / bronze
  rank accents and deterministic tie-breaking (total → first → second →
  third places). Esc or Exit returns to wherever you launched it.
- **Liquid glass theme** — a deep blue-charcoal night sky (drifting
  nebula, starfield, film grain) behind frosted translucent glass
  panels; a floating glass sidebar on desktop, a detached glass tab
  pill with a lit active segment on phones; one steel-blue accent
  with a light "silver glass" day variant, dark by night.
- **Coordination tools (M&E)** — a division × game matrix of every event,
  result corrections with mandatory justification, a complete revision
  history, center management and A4 print sheets (event progress).
- **Undoable resets** — resetting a result keeps a full recovery
  snapshot (podium + entire mark sheet), so an admin can undo the
  reset — right from the toast, the history trail or the event
  dialog — until something new is recorded on the event. Restores
  are audit-trailed like every other change, and roster drift is
  handled: removed students are skipped, and a student-derived
  podium is recomputed from the marks that survived.
- **Secure by default** — tournaments and results are public to read;
  creating, editing and scoring require a signed-in account. Every result
  records who submitted it.

## Roles

| Role | Capabilities |
| --- | --- |
| **Guest** (no account) | View tournaments, standings, the scoreboard, the event grid and the revision history |
| **Scorekeeper** | Record and correct results, manage event status |
| **Administrator** | Everything: create / duplicate / delete tournaments, manage centers, reset and undo-reset results, settings, team accounts, WhatsApp sharing |

The first account created becomes the administrator (first-run setup);
further accounts are added from *Team & access* — either created directly
or via single-use invitation codes the recipient redeems to set up their
own credentials.

## Navigation model

iOS-inspired, consistent across devices, and **URL-addressable** —
every view has a path, so any screen can be linked, bookmarked and
restored with the browser's back button:

| Path | View |
| --- | --- |
| `/` | Tournaments (home) |
| `/t/{id}` | A tournament's Overview (the bird's-eye event matrix — record results from its event dialogs) |
| `/t/{id}/centers` · `/t/{id}/students` · `/t/{id}/history` · `/t/{id}/settings` | The other views |
| `/present/{id}` | The public guest scoreboard (no sign-in) |

Legacy `/t/{id}/scoring` links (the retired field console) land on the
Overview.

- **Home** — the tournament list; every tournament opens on its Overview.
- **Overview · History** — the primary destinations (a glass sidebar on
  desktop, a three-tab bar — Home, Overview, More — on phones). The
  Scoring console was consolidated into the Overview: the event matrix
  is the bird's-eye view, and every event chip opens the same recording
  dialog (podium places or student marks) the console had.
- **Centers · Students · Settings** — occasional management work, grouped
  under *Manage* on the sidebar and inside *More* on phones.
- **The scoreboard is a presentation, not a place** — it never occupies a
  tab; *Present* on the Overview throws it on the projector, and closing
  it returns to your context.

### Guest scoreboard (`/present/{id}`)

A standalone, public live scoreboard for the people watching from the
outside: no sign-in, no app chrome — open the link and watch. It runs
on the same liquid-glass theme as the app itself (aurora and starfield
night sky, frosted glass panels, the steel-blue accent; gold stays
reserved for podium moments), so the guest page and the staff app read
as one product. Standings
arrive over the same Server-Sent Events stream the staff app uses and
reorder live; on phones the leaderboard becomes stacked result cards,
and the latest recorded podium shows as a *Latest result* strip. When
the tournament tracks students, guests get the same two acts the
projector shows: a **Centers / Students** switch flips the page between
the standings table and the student ranking stage. Grab the
link with **Guest link** on the Overview (or from *Settings → WhatsApp
sharing*).

### Events — the matrix is editable

The event matrix was the plan, not a cage: **Add** (next to *Events* on
the Overview, administrators) appends slots to a live tournament —
under an existing category and game, or under **brand-new ones created
right in the dialog** (the game the plan missed, the extra round the
field asks for). Each batch of slots picks its scoring mode up front
(center podium or per-student marks) and numbers itself after whatever
already exists (e.g. *slots 3–4*).

From any event's dialog, administrators can also **rename the slot**,
**switch its scoring mode** (only while it is clean — a recorded result
or mark sheet locks the mode until it is reset) and **remove the slot**
entirely; removal cascades its result, marks and audit trail, and the
standings and progress recompute immediately. Status changes remain
open to every signed-in staff member.

### Centers

The roster is fully editable: add centers in bulk (code + optional name),
**edit any center's code, name and location** inline from the table, and
remove centers (with a confirmation that spells out what the standings
lose). Edits flow everywhere immediately — standings, podium pickers and
shared cards.

### Students: registration stage & student rankings

Some events arrive as **mark sheets** — per-student marks — rather than a
picked center podium. Any event can be scored either way; the event
dialog shows both tabs (*Center podium* / *Student marks*).

- **Registration stage** — students are registered (any signed-in staff
  member can, straight from the field) with their **name, center and
  grade**, and the system issues each one a unique **student ID**
  composed from the tournament's ID pattern — e.g. `402-8-07` (center
  402, grade 8, roll 07). That ID is the field reference everywhere:
  mark sheets list students as `402-8-07 · Kasun Perera`, so two
  students who share a name can never be confused. IDs are issued once
  and never change — correcting a student's center or grade never
  renumbers anyone.
- **Customizable ID pattern** — *Settings → Student IDs* composes the
  pattern from `{center}`, `{grade}`, `{index}` (roll number, zero-
  padded; width via `{index3}`), `{initials}` and `{year}` tokens, with
  a live preview. The roll number scopes to the tokens beside it —
  `{center}-{grade}-{index}` numbers each center-and-grade class
  separately. Students registered before IDs existed get theirs with
  one click (*Generate missing IDs*).
- **Custom marks** — the mark sheet gives each scored student their own
  marks (any non-negative number, decimals included), with as many or as
  few students per center as the event needs — the count can vary by
  event and by center.
- **Derived podium** — each center's event entry is the sum of its
  students' marks; centers are ranked by that sum against the other
  centers, and the top three earn the event's podium places, paying the
  usual fixed points (75/50/25 by default). The preview updates live as
  you type. Ties on sums break by center code. A center may also hold
  several places in one manually-picked podium — a dominant center can
  sweep 1st and 2nd, and the standings pay both places.
- **Student ranking** — the Students view ranks every competitor by total
  marks (tie-break: events contested, then best single mark), live. The
  same ranking is a **presentation act**: the in-app scoreboard
  (*Present*) and the public guest scoreboard both offer a Centers /
  Students switch, and the student view is an awards stage — bronze,
  silver and champion cards rise onto a spotlighted podium (stacked
  1st → 2nd → 3rd on phones), with the rest of the field gliding into
  place live as marks land. A **Print** button (Students view, and the
  scoreboard's student mode) produces an A4 *Student Ranking Sheet* —
  every student with rank, issued ID, center, events, best mark and
  total.
- **Same guardrails** — correcting a mark sheet requires a justification
  and lands in the audit trail; reassigning or removing a student with
  recorded marks re-derives every affected event automatically; resetting
  a student-scored event clears its mark sheet too.
- **Offline field entry** — mark sheets queue on the device and sync
  automatically, exactly like podium results.

This feature ships on the `feature/student-rankings` branch. On the VM it
runs as the **dev slot** of the two-slot deployment — its own worktree,
container, port (`127.0.0.1:8091`), database and session cookie — so the
stable container is never disturbed (see
[deploy/README.md](deploy/README.md)).

### Invitation codes

From *Team & access → Invitations*, generate a code (scorekeeper or
administrator role, optional expiry) and share it. The recipient opens
the sign-in dialog, chooses *Have an invitation code?*, enters the code
and sets their own name, email and password. Codes are single-use and
can be deleted at any time.

### Motion

Every state change moves — nothing snaps. The shared motion vocabulary
lives in `ui-bits.tsx` (spring tokens, stagger variants): views
crossfade with an exit, lists stagger in and glide when rows are added,
removed or re-ranked, podium assignments pop with a spring, dialogs and
sheets slide with an overshoot ease, and live results morph chips and
count up standings in place. All of it respects
`prefers-reduced-motion`.

### WhatsApp sharing

Share results to a WhatsApp group through a self-hosted
[WAHA](https://waha.devlike.pro) server (WhatsApp HTTP API):

1. In *Settings → WhatsApp sharing*, enter the WAHA server address and
   its API key, then *Connect* — the app verifies the connection and
   lists the WhatsApp sessions on that server.
2. Pick the connected session and the destination group, and *Save the
   connection*. The API key is stored app-side and never returned to the
   browser; a *Send test message* probe confirms the wiring end to end.
3. Share from anywhere: *Share* on the Overview sends the overall
   standings; *Share* inside any recorded event sends that podium
   (medals, centers and points).

Broadcasts go out as **styled share cards** — rendered images in the
app's own "liquid glass" design language (deep blue-charcoal night sky
with a starfield constellation, frosted glass panels with lit top
edges, medal coins, progress bar), typeset with real font shaping so
the Sinhala game names render correctly, sent as JPEG with a short
caption via WAHA's `sendImage`. Each broadcast type has its own
silhouette, so the group tells them apart at thumbnail size: an
**event result** is a *podium* — 2nd · 1st · 3rd columns standing on
gold/silver/bronze pedestals under a crown — while the **standings**
are a *classification table* — one glass panel, hairline rows, G/S/B
count columns and the total. The card design is verified
pixel-by-pixel: `scripts/render-sample-cards.ts` renders every variant
and `scripts/check-card-layout.py` asserts the geometry, palette and
ink placement (143 checks). If a card cannot be rendered or delivered
(missing fonts, an engine without `sendImage`, a flaky server), the
equivalent plain-text announcement is sent instead, so the group
always hears the result.

**Every broadcast carries the guest link:** the cards draw a
*Watch live* bar and the image caption (and the text fallback) carries
the full `/present/{id}` URL, which WhatsApp makes tappable — the
group can follow the tournament live from the chat. The link's base
address is taken from the request that triggers the share; if guests
reach the app through a different address (a domain or a tunnel), set
it once in *Public address for guest links* in the settings (or the
`PUBLIC_BASE_URL` environment variable).

**Auto-share:** once the connection is saved, *Auto-share new results*
(Settings) sends the event card automatically the moment a result is
recorded — and a clearly labeled *Corrected result* card whenever one
is corrected. Sharing happens after the save, so a slow WhatsApp
server never delays the scorekeeper, and a failed share never
disturbs result recording (it falls back to text, and failures are
logged server-side instead).

The connected WhatsApp account must be a member of the destination
group. Both WAHA engine families work — the JS cores and the Go core
(`gows`, e.g. the `devlikeapro/waha:gows-arm` image), whose group
lists use Go-style field names. Headless deployments can
pre-configure the connection with `WAHA_BASE_URL`, `WAHA_API_KEY`,
`WAHA_SESSION`, `WAHA_GROUP_CHAT_ID` and `WAHA_AUTO_EVENTS` instead of
the Settings UI.

**Card fonts (local development only):** the cards are typeset with
Poppins + Noto Sans Sinhala, which live in `public/fonts/`. The
Docker image installs them for fontconfig automatically; for local
development, make them visible once:

```bash
mkdir -p ~/.fonts && cp public/fonts/*.ttf ~/.fonts/ && fc-cache -f ~/.fonts
```

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
bun run scripts/battle-test.ts          # core suite (a few assertions are state-dependent)
bun run scripts/student-test.ts         # student rankings suite (roster, mark sheets, derivation)
bun run scripts/event-edit-probe.ts     # event slot editing suite (add/rename/re-score/remove)
bun run scripts/waha-mock.ts 3001 &     # mock WAHA server
BASE_URL=http://localhost:3000 bun run scripts/whatsapp-test.ts
```

The battle suite (149 assertions) exercises authentication, role
enforcement (guest / scorekeeper / administrator), invitation codes
(generation, expiry, single-use redemption, role grants), tournament
lifecycle, result guardrails and standings mathematics, corrections and
the audit trail, center management — bulk add, **editing (code, name,
location, duplicate-code conflicts)** and removal — the URL routes
(including the public present page and 404 fall-through), the live
event stream, concurrent submissions and account management.

The student suite (63 assertions) covers the experimental rankings:
roster management and role enforcement (staff add, admin edit/move/remove,
same-name students with distinct internal ids), mark sheet guardrails
(empty/negative/duplicate-student rejections), the derived center podium
and fixed place points from per-center sums, the student leaderboard and
its ordering, corrections with mandatory justification (audit-trailed),
the manual-podium lockout on student events, automatic re-derivation
after reassignment and removal, reset (clearing the mark sheet) and a
classic-podium regression pass.

The event-edit suite (36 assertions) covers the editable matrix:
appending slots to an existing category/game pair (numbering, scoring
mode, judge lockout), inline creation of a brand-new category and game
(duplicate-code rejection), renaming slots (admin-only), the scoring
mode lock while a result or mark sheet exists, judge access to status
changes, student standings and the derived podium, and slot removal
(cascade + progress recompute).

The undo-reset suite (47 assertions) covers the recovery flow: podium
reset → undo (byte-exact restore of places, notes and status), mark
sheet reset → undo (all marks plus the derived podium back), the audit
feed's undoability flags, role enforcement (judges can neither reset
nor undo), stale-snapshot refusal once newer data is recorded, the
single-use snapshot (second undo refused), and roster drift between
reset and undo (removed students skipped, derived podium recomputed
from the surviving marks).

The WhatsApp suite (100 assertions) covers access control on every
endpoint, config save/masking, session + group discovery, all three
message kinds (delivered payloads are inspected — image cards for
standings and events, text for the probe, the plain-text fallback when
`sendImage` fails), error mapping for wrong keys, unreachable servers
and unrecorded events, the guest link in every caption (configured
public address, request-origin fallback and on auto-shares), auto-share
— enable via minimal patch, record → announce, correct → labeled
follow-up, disable → silence — and the share-card builders themselves
(escaping, partial podiums, name fitting, the watch-live bar), against
the bundled WAHA mock, so no real group is messaged while testing.

## Deployment

Self-contained Docker containers with an embedded database, tuned for small
VMs (~80–150 MB RAM per slot, hard 512 MB cap). One repo folder runs TWO
slots — a stable release and a dev build, each from its own branch:

```bash
./deploy/deploy.sh setup            # first time: worktrees, secrets, build, start
./deploy/deploy.sh update stable    # rebuild one slot from its branch
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
| `PUBLIC_BASE_URL` | Optional: public address used for guest links in shared messages (defaults to the request's host) |
| `SESSION_COOKIE_NAME` | Optional: session cookie name — the dev slot of the two-slot deployment sets `tourny_session_dev` so `:8090` and `:8091` never fight over the browser cookie (cookies are scoped by domain, not port) |
| `APP_VARIANT` | Optional: set to `experimental` to badge the UI with an amber "Exp" chip (used by the dev slot in `deploy/docker-compose.yml`) |
