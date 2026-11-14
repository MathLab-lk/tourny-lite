/**
 * Renders sample share cards from the demo database so the design can be
 * inspected (and layout-verified) without a running server.
 *
 *   bun scripts/render-sample-cards.ts [outdir]
 *
 * Writes event.jpg, standings.jpg (and .svg) into /tmp by default.
 */
import { getTournamentDetail } from '../src/lib/tournament-service'
import { buildEventCard, buildStandingsCard, renderCardJpeg } from '../src/lib/share-card'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const outDir = process.argv[2] ?? '/tmp'
const tournaments = await (await import('../src/lib/db')).db.tournament.findMany()
const t = tournaments.find((x) => x.templateId) ?? tournaments[0]
if (!t) {
  console.error('No tournament in the database — run: bun scripts/seed.ts')
  process.exit(1)
}

const d = await getTournamentDetail(t.id)
if (!d) {
  console.error('Tournament detail unavailable')
  process.exit(1)
}

// An event with a full podium (prefer the Sinhala-named game), plus (if
// any) a partial one.
const hasFull = (e: (typeof d.events)[number]) =>
  Boolean(e.result?.firstPlaceCode && e.result?.secondPlaceCode && e.result?.thirdPlaceCode)
const withResult = d.events.filter((e) => e.status === 'completed' && e.result)
const full = withResult.find((e) => hasFull(e) && e.gameCode === 'baugunaka-puwaruwa') ?? withResult.find(hasFull)
const partial = withResult.find((e) => e.id !== full?.id && !hasFull(e))

const cards: [name: string, card: ReturnType<typeof buildEventCard> | ReturnType<typeof buildStandingsCard>][] = [
  ['event', full ? buildEventCard(d, full.id) : null],
  ['event-partial', partial ? buildEventCard(d, partial.id) : null],
  ['standings', buildStandingsCard(d)],
  // With the guest links — what the group actually receives when a
  // public base URL is configured. Event podiums point at that
  // event's own live page; standings at the overall scoreboard.
  [
    'event-live',
    full
      ? buildEventCard(d, full.id, {
          eventUrl: `http://192.168.8.50:3000/present/cmvinbk7c0002n6cc4x9abcs/event/${full.id}`,
        })
      : null,
  ],
  ['standings-live', buildStandingsCard(d, { presentUrl: 'http://192.168.8.50:3000/present/cmvinbk7c0002n6cc4x9abcs' })],
]

for (const [name, card] of cards) {
  if (!card) {
    console.log(`${name}: skipped (no card)`)
    continue
  }
  writeFileSync(join(outDir, `sample-${name}.svg`), card.svg)
  const jpeg = await renderCardJpeg(card.svg)
  writeFileSync(join(outDir, `sample-${name}.jpg`), jpeg)
  const h = /height="(\d+)"/.exec(card.svg)?.[1]
  console.log(`${name}: ${jpeg.length} bytes JPEG · 1080x${h} · caption: ${card.caption}`)
}
