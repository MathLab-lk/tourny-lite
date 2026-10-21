import { db } from '@/lib/db'
import { emitTournamentChanged } from '@/lib/bus'
import type { ResultSubmitPayload } from '@/lib/types'

interface PodiumSnapshot {
  first: string | null
  second: string | null
  third: string | null
}

async function snapshot(resultId: string): Promise<PodiumSnapshot> {
  const r = await db.eventResult.findUnique({
    where: { id: resultId },
    include: {
      firstCenter: { select: { centerCode: true } },
      secondCenter: { select: { centerCode: true } },
      thirdCenter: { select: { centerCode: true } },
    },
  })
  if (!r) return { first: null, second: null, third: null }
  return {
    first: r.firstCenter?.centerCode ?? null,
    second: r.secondCenter?.centerCode ?? null,
    third: r.thirdCenter?.centerCode ?? null,
  }
}

/**
 * Submit (create) or correct (update) a podium result for an event slot.
 * Guardrails:
 *  - centers must belong to the same tournament
 *  - a center cannot occupy two podium places
 *  - overwriting an existing result requires a justification reason (audit)
 */
export async function submitResult(payload: ResultSubmitPayload) {
  const event = await db.tournamentEvent.findUnique({
    where: { id: payload.eventId },
    include: { tournament: true },
  })
  if (!event) throw new Error('Event not found')
  if (event.tournament.status === 'archived') throw new Error('Tournament is archived')

  const placeIds = [payload.firstPlaceCenterId, payload.secondPlaceCenterId, payload.thirdPlaceCenterId]
  const filled = placeIds.filter((v): v is string => Boolean(v))
  if (filled.length === 0) throw new Error('Assign at least one podium place before submitting')

  const uniqueFilled = new Set(filled)
  if (uniqueFilled.size !== filled.length) {
    throw new Error('A center cannot take two podium places in the same event')
  }

  const centers = await db.center.findMany({
    where: { tournamentId: event.tournamentId },
    select: { id: true },
  })
  const validIds = new Set(centers.map((c) => c.id))
  for (const id of filled) {
    if (!validIds.has(id)) throw new Error('Selected center does not belong to this tournament')
  }

  const existing = await db.eventResult.findUnique({ where: { eventId: event.id } })
  const isCorrection = Boolean(existing)
  if (isCorrection && !payload.reason?.trim()) {
    throw new Error('A justification reason is required to correct an existing result')
  }

  const data = {
    tournamentId: event.tournamentId,
    firstPlaceCenterId: payload.firstPlaceCenterId || null,
    secondPlaceCenterId: payload.secondPlaceCenterId || null,
    thirdPlaceCenterId: payload.thirdPlaceCenterId || null,
    recordedBy: payload.recordedBy.trim() || 'Unknown judge',
    notes: (payload.notes ?? '').trim(),
    recordedAt: new Date(),
  }

  let resultId: string
  if (existing) {
    const oldValues = await snapshot(existing.id)
    await db.eventResult.update({ where: { id: existing.id }, data })
    resultId = existing.id
    await db.auditLog.create({
      data: {
        eventId: event.id,
        action: 'updated',
        oldValues: JSON.stringify(oldValues),
        newValues: JSON.stringify({
          first: (await centerCodeOf(data.firstPlaceCenterId)) ?? null,
          second: (await centerCodeOf(data.secondPlaceCenterId)) ?? null,
          third: (await centerCodeOf(data.thirdPlaceCenterId)) ?? null,
        }),
        reason: payload.reason?.trim() ?? '',
        actor: data.recordedBy,
      },
    })
  } else {
    const created = await db.eventResult.create({ data: { ...data, eventId: event.id } })
    resultId = created.id
    await db.auditLog.create({
      data: {
        eventId: event.id,
        action: 'created',
        oldValues: '',
        newValues: JSON.stringify({
          first: (await centerCodeOf(data.firstPlaceCenterId)) ?? null,
          second: (await centerCodeOf(data.secondPlaceCenterId)) ?? null,
          third: (await centerCodeOf(data.thirdPlaceCenterId)) ?? null,
        }),
        reason: '',
        actor: data.recordedBy,
      },
    })
  }

  await db.tournamentEvent.update({
    where: { id: event.id },
    data: { status: 'completed' },
  })

  emitTournamentChanged(event.tournamentId)
  return { resultId, isCorrection }
}

async function centerCodeOf(centerId: string | null | undefined): Promise<string | null> {
  if (!centerId) return null
  const c = await db.center.findUnique({ where: { id: centerId }, select: { centerCode: true } })
  return c?.centerCode ?? null
}

/** Reset (delete) a result — requires reason, logs audit, returns event to pending. */
export async function resetResult(eventId: string, reason: string, actor: string) {
  const result = await db.eventResult.findUnique({ where: { eventId } })
  if (!result) throw new Error('No result recorded for this event')
  if (!reason.trim()) throw new Error('A justification reason is required to reset a result')

  const oldValues = await snapshot(result.id)
  await db.auditLog.create({
    data: {
      eventId,
      action: 'reset',
      oldValues: JSON.stringify(oldValues),
      newValues: '',
      reason: reason.trim(),
      actor: actor.trim() || 'M&E Console',
    },
  })
  await db.eventResult.delete({ where: { id: result.id } })
  await db.tournamentEvent.update({ where: { id: eventId }, data: { status: 'pending' } })

  emitTournamentChanged(result.tournamentId)
}

/** Manual event status override from the M&E console. */
export async function setEventStatus(eventId: string, status: 'pending' | 'in_progress' | 'completed') {
  const event = await db.tournamentEvent.findUnique({ where: { id: eventId } })
  if (!event) throw new Error('Event not found')
  await db.tournamentEvent.update({ where: { id: eventId }, data: { status } })
  emitTournamentChanged(event.tournamentId)
}
