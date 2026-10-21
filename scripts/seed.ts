/**
 * Demo seed — instantiates the "Seed Ministries Math Competition 2026"
 * preset with a partial set of results (10 completed events, 1 in progress,
 * 1 correction) so every view shows meaningful data immediately.
 *
 * Run: bun scripts/seed.ts
 */
import { db } from '../src/lib/db'
import { createFromPreset } from '../src/lib/tournament-service'
import { submitResult, setEventStatus } from '../src/lib/result-service'

interface PodiumPlan {
  division: string
  game: string
  sub: number
  first: string
  second: string
  third: string
  by: string
}

const PLAN: PodiumPlan[] = [
  { division: 'A', game: 'domino', sub: 1, first: '101', second: '103', third: '105', by: 'Station 1 — Ms. Fernando' },
  { division: 'A', game: 'domino', sub: 2, first: '401', second: '101', third: '111', by: 'Station 1 — Ms. Fernando' },
  { division: 'A', game: 'card', sub: 1, first: '103', second: '414', third: '101', by: 'Station 2 — Mr. Silva' },
  { division: 'B', game: 'niranchi', sub: 1, first: '105', second: '111', third: '414', by: 'Station 3 — Mr. Perera' },
  { division: 'B', game: 'card', sub: 1, first: '101', second: '105', third: '414', by: 'Station 3 — Mr. Perera' },
  { division: 'C', game: 'carrom', sub: 1, first: '414', second: '401', third: '103', by: 'Station 4 — Mrs. Jayawardena' },
  { division: 'C', game: 'card', sub: 1, first: '111', second: '101', third: '401', by: 'Station 4 — Mrs. Jayawardena' },
  { division: 'D', game: 'thai-dham', sub: 1, first: '103', second: '414', third: '105', by: 'Station 5 — Mr. Bandara' },
  { division: 'E', game: 'niranchi', sub: 1, first: '105', second: '101', third: '414', by: 'Station 6 — Ms. Rajapaksa' },
]

// This one gets recorded then corrected, to demonstrate the audit trail
const CORRECTION: PodiumPlan = {
  division: 'E',
  game: 'card',
  sub: 1,
  first: '101',
  second: '111',
  third: '103',
  by: 'Station 6 — Ms. Rajapaksa',
}

async function main() {
  const existing = await db.tournament.findFirst({ where: { templateId: 'math_comp_2026' } })
  if (existing) {
    console.log(`Preset tournament already exists: ${existing.name} (${existing.id}) — skipping seed.`)
    return
  }

  const tournamentId = await createFromPreset('math_comp_2026')
  const tournament = await db.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    include: {
      divisions: true,
      games: true,
      centers: true,
      events: { include: { division: true, game: true } },
    },
  })
  console.log(`Created tournament: ${tournament.name} with ${tournament.events.length} events`)

  const centerByCode = new Map(tournament.centers.map((c) => [c.centerCode, c]))
  const findEvent = (p: PodiumPlan) =>
    tournament.events.find(
      (e) => e.division.code === p.division && e.game.code === p.game && e.subEventIndex === p.sub
    )

  for (const plan of PLAN) {
    const event = findEvent(plan)
    if (!event) {
      console.warn(`  ! Event not found: Cat ${plan.division} ${plan.game} #${plan.sub}`)
      continue
    }
    await submitResult({
      eventId: event.id,
      firstPlaceCenterId: centerByCode.get(plan.first)?.id ?? null,
      secondPlaceCenterId: centerByCode.get(plan.second)?.id ?? null,
      thirdPlaceCenterId: centerByCode.get(plan.third)?.id ?? null,
      recordedBy: plan.by,
      notes: '',
    })
    console.log(`  ✓ ${event.label} → 1st ${plan.first}, 2nd ${plan.second}, 3rd ${plan.third}`)
  }

  // Record + correct the audit-demo event
  const corrEvent = findEvent(CORRECTION)
  if (corrEvent) {
    await submitResult({
      eventId: corrEvent.id,
      firstPlaceCenterId: centerByCode.get(CORRECTION.first)?.id ?? null,
      secondPlaceCenterId: centerByCode.get(CORRECTION.second)?.id ?? null,
      thirdPlaceCenterId: centerByCode.get(CORRECTION.third)?.id ?? null,
      recordedBy: CORRECTION.by,
      notes: '',
    })
    await submitResult({
      eventId: corrEvent.id,
      firstPlaceCenterId: centerByCode.get('111')?.id ?? null,
      secondPlaceCenterId: centerByCode.get('101')?.id ?? null,
      thirdPlaceCenterId: centerByCode.get('103')?.id ?? null,
      recordedBy: 'M&E Coordinator',
      notes: 'Corrected per station report',
      reason: 'Mark sheet transcription error — podium verified with station judge by phone',
    })
    console.log(`  ✓ ${corrEvent.label} → recorded then corrected (audit entry created)`)
  }

  // One event in progress to show that state
  const inProgress = tournament.events.find(
    (e) => e.division.code === 'D' && e.game.code === 'card' && e.subEventIndex === 1
  )
  if (inProgress) {
    await setEventStatus(inProgress.id, 'in_progress')
    console.log(`  ◔ ${inProgress.label} → in_progress`)
  }

  console.log('Seed complete.')
}

main()
  .catch((err) => {
    console.error('Seed failed:', err)
    process.exitCode = 1
  })
  .finally(() => {
    void db.$disconnect()
  })
