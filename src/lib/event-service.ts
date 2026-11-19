import { db } from '@/lib/db'
import { emitTournamentChanged } from '@/lib/bus'

// ─────────────────────────────────────────────────────────────
// Event slot management — the tournament structure is no longer
// frozen at creation. Slots can be added mid-tournament (a game
// the matrix missed, an extra round, a brand-new category), and
// existing slots can be relabelled, re-scored by a different
// mode, or removed when they were created by mistake.
// ─────────────────────────────────────────────────────────────

/** URL-safe game code from the English name; never empty. */
function gameCode(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return s || 'game'
}

export interface AddEventsInput {
  /** Existing division to file the new slots under. */
  divisionId?: string
  /** Inline creation: a division that does not exist yet. */
  newDivision?: { code: string; name: string; ageRange?: string; gradeRange?: string }
  /** Existing game to file the new slots under. */
  gameId?: string
  /** Inline creation: a game that does not exist yet. */
  newGame?: { englishName: string; sinhalaName?: string; rulesSummary?: string }
  /** How many slots to append (defaults to 1, max 10). */
  count?: number
  /** How each new slot is scored (defaults to podium). */
  scoringMode?: 'podium' | 'students'
}

/**
 * Appends event slots to a tournament. The division and game may be
 * existing rows or created inline (the "stuff" around adding
 * events) — everything runs in one transaction so a bad code rolls
 * the whole addition back.
 */
export async function addEvents(tournamentId: string, input: AddEventsInput, actor: string) {
  const tournament = await db.tournament.findUnique({ where: { id: tournamentId } })
  if (!tournament) throw new Error('Tournament not found')
  if (tournament.status === 'archived') throw new Error('Tournament is archived')

  const count = Math.max(1, Math.min(10, Math.round(Number(input.count ?? 1)) || 1))
  const scoringMode = input.scoringMode === 'students' ? 'students' : 'podium'

  if (!input.divisionId && !input.newDivision) throw new Error('Pick or create a category for the new events')
  if (input.divisionId && input.newDivision) throw new Error('Pick an existing category or create one — not both')
  if (!input.gameId && !input.newGame) throw new Error('Pick or create a game for the new events')
  if (input.gameId && input.newGame) throw new Error('Pick an existing game or create one — not both')

  return db.$transaction(async (tx) => {
    // ── Resolve (or create) the division ──
    let division: { id: string; code: string } | null = null
    if (input.divisionId) {
      division = await tx.division.findFirst({
        where: { id: input.divisionId, tournamentId },
        select: { id: true, code: true },
      })
      if (!division) throw new Error('Category not found in this tournament')
    } else if (input.newDivision) {
      const code = input.newDivision.code.trim().toUpperCase()
      if (!code) throw new Error('The category code cannot be empty')
      const dupe = await tx.division.findUnique({
        where: { tournamentId_code: { tournamentId, code } },
        select: { id: true },
      })
      if (dupe) throw new Error(`Category ${code} already exists — pick it instead of creating it again`)
      const last = await tx.division.findFirst({
        where: { tournamentId },
        orderBy: { displayOrder: 'desc' },
        select: { displayOrder: true },
      })
      division = await tx.division.create({
        data: {
          tournamentId,
          code,
          name: input.newDivision.name.trim() || `Category ${code}`,
          ageRange: (input.newDivision.ageRange ?? '').trim(),
          gradeRange: (input.newDivision.gradeRange ?? '').trim(),
          displayOrder: (last?.displayOrder ?? 0) + 1,
        },
        select: { id: true, code: true },
      })
    }
    if (!division) throw new Error('A category is required')

    // ── Resolve (or create) the game ──
    let game: { id: string; englishName: string } | null = null
    if (input.gameId) {
      game = await tx.gameType.findFirst({
        where: { id: input.gameId, tournamentId },
        select: { id: true, englishName: true },
      })
      if (!game) throw new Error('Game not found in this tournament')
    } else if (input.newGame) {
      const englishName = input.newGame.englishName.trim()
      if (!englishName) throw new Error('The game name cannot be empty')
      const code = gameCode(englishName)
      const dupe = await tx.gameType.findUnique({
        where: { tournamentId_code: { tournamentId, code } },
        select: { id: true },
      })
      if (dupe) throw new Error(`A game called “${englishName}” already exists — pick it instead of creating it again`)
      game = await tx.gameType.create({
        data: {
          tournamentId,
          code,
          englishName,
          sinhalaName: (input.newGame.sinhalaName ?? '').trim(),
          rulesSummary: (input.newGame.rulesSummary ?? '').trim(),
        },
        select: { id: true, englishName: true },
      })
    }
    if (!game) throw new Error('A game is required')

    // ── Append the slots after any existing ones ──
    const existing = await tx.tournamentEvent.findMany({
      where: { tournamentId, divisionId: division.id, gameId: game.id },
      orderBy: { subEventIndex: 'desc' },
      take: 1,
      select: { subEventIndex: true },
    })
    const start = (existing[0]?.subEventIndex ?? 0) + 1

    const created = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        tx.tournamentEvent.create({
          data: {
            tournamentId,
            divisionId: division!.id,
            gameId: game!.id,
            subEventIndex: start + i,
            label: `Cat ${division!.code} - ${game!.englishName} - Event ${start + i}`,
            scoringMode,
          },
          select: { id: true },
        })
      )
    )

    emitTournamentChanged(tournamentId)
    return {
      added: created.length,
      fromSlot: start,
      scoringMode,
      actor: actor.trim() || 'M&E Console',
    }
  })
}

export interface UpdateEventInput {
  label?: string
  scoringMode?: 'podium' | 'students'
  status?: 'pending' | 'in_progress' | 'completed'
}

/**
 * Edits an event slot's own metadata: its label, its scoring mode
 * and its status. The scoring mode only changes while the slot is
 * clean (no recorded podium, no student marks) — once a result
 * exists the mode is a fact of history and is corrected by editing
 * the marks, never by flipping the mode.
 */
export async function updateEvent(eventId: string, patch: UpdateEventInput) {
  const event = await db.tournamentEvent.findUnique({ where: { id: eventId } })
  if (!event) throw new Error('Event not found')

  const data: { label?: string; scoringMode?: string; status?: string } = {}

  if (patch.label !== undefined) {
    const label = patch.label.trim()
    if (!label) throw new Error('The label cannot be empty')
    data.label = label
  }

  if (patch.scoringMode !== undefined && patch.scoringMode !== event.scoringMode) {
    if (patch.scoringMode !== 'podium' && patch.scoringMode !== 'students') {
      throw new Error('Scoring mode must be podium or students')
    }
    const hasResult = await db.eventResult.findUnique({ where: { eventId }, select: { id: true } })
    const hasMarks = await db.studentScore.findFirst({ where: { eventId }, select: { id: true } })
    if (hasResult || hasMarks) {
      throw new Error(
        'This event already has a recorded result — reset it first, then change the scoring mode'
      )
    }
    data.scoringMode = patch.scoringMode
  }

  if (patch.status !== undefined) {
    if (!['pending', 'in_progress', 'completed'].includes(patch.status)) {
      throw new Error('Invalid status')
    }
    data.status = patch.status
  }

  if (Object.keys(data).length === 0) throw new Error('Nothing to update')

  await db.tournamentEvent.update({ where: { id: eventId }, data })
  emitTournamentChanged(event.tournamentId)
  return { ok: true }
}

/**
 * Removes an event slot. Recorded podiums, student marks and the
 * audit trail cascade with it — the standings recompute without it
 * immediately. The confirmation that this is intended lives in the
 * UI; here we just refuse on the last remaining slot of nothing in
 * particular (any number of slots may be deleted, including all).
 */
export async function deleteEvent(eventId: string) {
  const event = await db.tournamentEvent.findUnique({ where: { id: eventId } })
  if (!event) throw new Error('Event not found')
  await db.tournamentEvent.delete({ where: { id: eventId } })
  emitTournamentChanged(event.tournamentId)
  return { ok: true }
}
