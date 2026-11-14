import { db } from '@/lib/db'
import { emitTournamentChanged } from '@/lib/bus'
import { computeCenterSums } from '@/lib/student-math'
import type { ResultSubmitPayload } from '@/lib/types'

interface PodiumSnapshot {
  first: string | null
  second: string | null
  third: string | null
}

// ── Undo-reset recovery points ─────────────────────────────────
// A reset deletes real data (podium row + whole mark sheet). The
// audit trail keeps a human-readable summary; the ResetSnapshot
// keeps the actual rows so an admin can undo the reset entirely.

interface SnapshotPayloadScore {
  studentId: string
  marks: number
  recordedBy: string
  notes: string
  recordedAt: string
}

interface SnapshotPayload {
  version: 1
  result: {
    firstPlaceCenterId: string | null
    secondPlaceCenterId: string | null
    thirdPlaceCenterId: string | null
    derivedFromStudents: boolean
    recordedBy: string
    notes: string
    recordedAt: string
  } | null
  scores: SnapshotPayloadScore[]
  eventStatus: string
  scoringMode: string
}

/** Drops any undo snapshot for the event — call the moment newer
 *  data is recorded, because undoing a reset from before that
 *  recording would silently clobber the newer result. */
export async function discardResetSnapshot(eventId: string) {
  await db.resetSnapshot.deleteMany({ where: { eventId } })
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

  // An event scored by student marks derives its podium from the
  // per-center sums — it is corrected by editing the mark sheet,
  // never by moving podium places by hand.
  const studentScoreCount = await db.studentScore.count({ where: { eventId: event.id } })
  if (studentScoreCount > 0) {
    throw new Error(
      'This event is scored by student marks — correct the mark sheet (or reset the result) instead of assigning the podium manually'
    )
  }

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
    data: { status: 'completed', scoringMode: 'podium' },
  })
  // New data landed — any pre-reset undo snapshot is stale now.
  await discardResetSnapshot(event.id)

  emitTournamentChanged(event.tournamentId)
  return { resultId, isCorrection, tournamentId: event.tournamentId, eventId: event.id }
}

async function centerCodeOf(centerId: string | null | undefined): Promise<string | null> {
  if (!centerId) return null
  const c = await db.center.findUnique({ where: { id: centerId }, select: { centerCode: true } })
  return c?.centerCode ?? null
}

/** Reset (delete) a result — requires reason, logs audit, returns
 *  event to pending. For student-scored events this also clears the
 *  mark sheet, so the event starts clean whichever way it is re-scored.
 *  A full recovery snapshot (podium row + every student mark) is kept
 *  so the reset can be undone until something new is recorded. */
export async function resetResult(eventId: string, reason: string, actor: string) {
  const event = await db.tournamentEvent.findUnique({
    where: { id: eventId },
    include: { tournament: true },
  })
  if (!event) throw new Error('Event not found')
  if (event.tournament.status === 'archived') throw new Error('Tournament is archived')

  const result = await db.eventResult.findUnique({ where: { eventId } })
  if (!result) throw new Error('No result recorded for this event')
  if (!reason.trim()) throw new Error('A justification reason is required to reset a result')

  const oldValues = await snapshot(result.id)
  const scores = await db.studentScore.findMany({ where: { eventId } })

  // Recovery point for undo — the exact rows being deleted, not
  // just the podium summary the audit trail shows. Upserted per
  // event: only the latest reset stays undoable, which is the only
  // reset it is ever safe to undo.
  const payload: SnapshotPayload = {
    version: 1,
    result: {
      firstPlaceCenterId: result.firstPlaceCenterId,
      secondPlaceCenterId: result.secondPlaceCenterId,
      thirdPlaceCenterId: result.thirdPlaceCenterId,
      derivedFromStudents: result.derivedFromStudents,
      recordedBy: result.recordedBy,
      notes: result.notes,
      recordedAt: result.recordedAt.toISOString(),
    },
    scores: scores.map((s) => ({
      studentId: s.studentId,
      marks: s.marks,
      recordedBy: s.recordedBy,
      notes: s.notes,
      recordedAt: s.recordedAt.toISOString(),
    })),
    eventStatus: event.status,
    scoringMode: event.scoringMode,
  }
  await db.resetSnapshot.upsert({
    where: { eventId },
    create: {
      eventId,
      tournamentId: event.tournamentId,
      payload: JSON.stringify(payload),
      resetBy: actor.trim() || 'M&E Console',
    },
    update: {
      payload: JSON.stringify(payload),
      resetBy: actor.trim() || 'M&E Console',
      createdAt: new Date(),
    },
  })

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
  await db.studentScore.deleteMany({ where: { eventId } })
  await db.eventResult.delete({ where: { id: result.id } })
  await db.tournamentEvent.update({ where: { id: eventId }, data: { status: 'pending' } })

  emitTournamentChanged(result.tournamentId)
}

/** Undo the most recent reset of an event: restores the podium row
 *  and the mark sheet, and logs the restore in the audit trail.
 *  Refused (and the stale snapshot dropped) when anything was
 *  recorded after the reset — undo must never clobber newer data.
 *  Roster drift is handled gracefully: a deleted center's podium
 *  place restores as empty, marks of removed students are skipped,
 *  and a student-derived podium is recomputed from the surviving
 *  marks so it never names a center with no live marks. */
export async function undoReset(eventId: string, actor: string) {
  const event = await db.tournamentEvent.findUnique({
    where: { id: eventId },
    include: { tournament: true },
  })
  if (!event) throw new Error('Event not found')
  if (event.tournament.status === 'archived') throw new Error('Tournament is archived')

  const snap = await db.resetSnapshot.findUnique({ where: { eventId } })
  if (!snap) throw new Error('No reset left to undo for this event')

  const existingResult = await db.eventResult.findUnique({ where: { eventId } })
  const existingScoreCount = await db.studentScore.count({ where: { eventId } })
  if (existingResult || existingScoreCount > 0) {
    // Newer data exists — the snapshot describes a past this event
    // has moved on from. Drop it so the UI stops offering undo.
    await db.resetSnapshot.delete({ where: { eventId } }).catch(() => {})
    throw new Error('Something was recorded after the reset — it can no longer be undone')
  }

  let payload: SnapshotPayload
  try {
    payload = JSON.parse(snap.payload) as SnapshotPayload
    if (payload.version !== 1) throw new Error('bad version')
  } catch {
    await db.resetSnapshot.delete({ where: { eventId } }).catch(() => {})
    throw new Error('The reset snapshot is unreadable — it cannot be undone')
  }

  const tournamentId = event.tournamentId

  const centers = await db.center.findMany({
    where: { tournamentId },
    select: { id: true, centerCode: true },
  })
  // A deleted center's place restores as empty (mirrors the FK's
  // SetNull semantics).
  const centerIds = new Set(centers.map((c) => c.id))
  const placeOf = (id: string | null | undefined) => (id && centerIds.has(id) ? id : null)

  // Marks only come back for students still on the roster — a
  // removed student's scores died with the student (cascade).
  const studentsNow = await db.student.findMany({
    where: { tournamentId },
    select: { id: true, centerId: true },
  })
  const studentIds = new Set(studentsNow.map((s) => s.id))
  const scores = payload.scores.filter((s) => studentIds.has(s.studentId))
  if (scores.length > 0) {
    await db.studentScore.createMany({
      data: scores.map((s) => ({
        tournamentId,
        eventId,
        studentId: s.studentId,
        marks: s.marks,
        recordedBy: s.recordedBy,
        notes: s.notes,
        recordedAt: new Date(s.recordedAt),
      })),
    })
  }

  let restoredResultId: string | null = null
  if (payload.result && !payload.result.derivedFromStudents) {
    // Manually picked podium — restore it verbatim, minus any
    // places whose center was deleted since.
    const r = payload.result
    const created = await db.eventResult.create({
      data: {
        tournamentId,
        eventId,
        firstPlaceCenterId: placeOf(r.firstPlaceCenterId),
        secondPlaceCenterId: placeOf(r.secondPlaceCenterId),
        thirdPlaceCenterId: placeOf(r.thirdPlaceCenterId),
        derivedFromStudents: false,
        recordedBy: r.recordedBy,
        notes: r.notes,
        recordedAt: new Date(r.recordedAt),
      },
    })
    restoredResultId = created.id
  } else if (payload.result?.derivedFromStudents) {
    // Derived podium — recompute it from the marks that survived
    // the roster drift instead of trusting the snapshot verbatim:
    // the app's invariant is "derived podium = f(mark sheet)", and
    // a restored podium naming a center with no live marks would
    // contradict the sheet and poison the standings. No center
    // sums left → no result, the event stays pending — exactly
    // like the roster-change clearing path.
    const scored = await db.studentScore.findMany({
      where: { eventId },
      select: { studentId: true, marks: true },
    })
    const sums = computeCenterSums(
      scored.map((s) => ({ studentId: s.studentId, marks: s.marks })),
      studentsNow.map((s) => ({ id: s.id, centerId: s.centerId })),
      centers
    )
    if (sums.length > 0) {
      const created = await db.eventResult.create({
        data: {
          tournamentId,
          eventId,
          firstPlaceCenterId: sums[0]?.centerId ?? null,
          secondPlaceCenterId: sums[1]?.centerId ?? null,
          thirdPlaceCenterId: sums[2]?.centerId ?? null,
          derivedFromStudents: true,
          recordedBy: payload.result.recordedBy,
          notes: payload.result.notes,
          recordedAt: new Date(payload.result.recordedAt),
        },
      })
      restoredResultId = created.id
    }
  }

  // The event returns to the shape it had before the reset — the
  // scoring mode included. Status: whatever it was whenever a
  // result exists, pending when the restore produced none.
  const wasScoredByStudents = payload.scoringMode === 'students' || scores.length > 0
  await db.tournamentEvent.update({
    where: { id: eventId },
    data: {
      status: restoredResultId ? payload.eventStatus : 'pending',
      scoringMode: wasScoredByStudents ? 'students' : event.scoringMode,
    },
  })

  const restoredPodium = restoredResultId ? await snapshot(restoredResultId) : null
  await db.auditLog.create({
    data: {
      eventId,
      action: 'restored',
      oldValues: '',
      newValues: JSON.stringify(restoredPodium ?? { first: null, second: null, third: null }),
      reason: `Undo of reset${snap.resetBy ? ` by ${snap.resetBy}` : ''}`,
      actor: actor.trim() || 'M&E Console',
    },
  })

  await db.resetSnapshot.delete({ where: { eventId } })

  emitTournamentChanged(tournamentId)
  return {
    restoredResult: Boolean(restoredResultId),
    restoredScores: scores.length,
    tournamentId,
    eventId,
  }
}
