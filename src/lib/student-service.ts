import { db } from '@/lib/db'
import { emitTournamentChanged } from '@/lib/bus'
import { computeCenterSums } from '@/lib/student-math'
import { discardResetSnapshot } from '@/lib/result-service'
import type {
  CenterSumRow,
  StudentDTO,
  StudentInput,
  StudentScoresSubmitPayload,
} from '@/lib/types'

/**
 * Student rankings — the experimental second scoring mode.
 *
 * Centers earn fixed marks per place (75/50/25 by default); students
 * earn custom marks typed off the field mark sheet. For a
 * student-scored event, each center's entry is the SUM of its own
 * students' marks; centers are then ranked by that sum against the
 * other centers, and the top three receive the event's podium
 * places (which pay the usual fixed points).
 *
 * The derived podium is written to the same EventResult the podium
 * flow uses, so standings, the live scoreboard, share cards and the
 * audit trail all keep working without a special case.
 *
 * Pure math (shared with client previews) lives in student-math.ts.
 */

const MAX_MARKS = 100000
const round2 = (n: number) => Math.round(n * 100) / 100

// ── roster management ──────────────────────────────────────────

async function assertCenterInTournament(tournamentId: string, centerId: string) {
  const center = await db.center.findUnique({ where: { id: centerId }, select: { id: true } })
  if (!center) throw new Error('Center not found')
  const inTournament = await db.center.findFirst({
    where: { id: centerId, tournamentId },
    select: { id: true },
  })
  if (!inTournament) throw new Error('Center does not belong to this tournament')
}

/** Adds students to a tournament. The roster is built on the go —
 *  names only, center optional (assignable later). */
export async function addStudents(
  tournamentId: string,
  inputs: StudentInput[]
): Promise<StudentDTO[]> {
  const valid = inputs
    .map((s) => ({ name: String(s.name ?? '').trim(), centerId: s.centerId ?? null }))
    .filter((s) => s.name.length > 0)
  if (valid.length === 0) throw new Error('At least one student name is required')

  const tournament = await db.tournament.findUnique({
    where: { id: tournamentId },
    select: { status: true },
  })
  if (!tournament) throw new Error('Tournament not found')
  if (tournament.status === 'archived') throw new Error('Tournament is archived')

  for (const s of valid) {
    if (s.centerId) await assertCenterInTournament(tournamentId, s.centerId)
  }

  // Created one by one so each new row (and its internal id) comes
  // back — same-name students must stay distinct entities.
  const created: StudentDTO[] = []
  for (const s of valid) {
    const row = await db.student.create({
      data: { tournamentId, name: s.name, centerId: s.centerId },
    })
    created.push({
      id: row.id,
      name: row.name,
      centerId: row.centerId,
      centerCode: null,
      createdAt: row.createdAt.toISOString(),
    })
  }
  emitTournamentChanged(tournamentId)
  return created
}

function toStudentDTO(s: {
  id: string
  name: string
  centerId: string | null
  createdAt: Date
  center?: { centerCode: string } | null
}): StudentDTO {
  return {
    id: s.id,
    name: s.name,
    centerId: s.centerId,
    centerCode: s.center?.centerCode ?? null,
    createdAt: s.createdAt.toISOString(),
  }
}

/** Edits a student (name and/or center). Reassigning a student who
 *  already has marks re-derives every affected event's podium, so
 *  the center sums stay truthful. */
export async function updateStudent(
  tournamentId: string,
  studentId: string,
  patch: { name?: string; centerId?: string | null },
  actor: string
): Promise<StudentDTO> {
  const student = await db.student.findUnique({ where: { id: studentId } })
  if (!student || student.tournamentId !== tournamentId) {
    throw new Error('Student not found')
  }

  const name = patch.name !== undefined ? String(patch.name).trim() : student.name
  if (!name) throw new Error('Student name cannot be empty')

  let centerId = student.centerId
  if (patch.centerId !== undefined) {
    centerId = patch.centerId ?? null
    if (centerId) await assertCenterInTournament(tournamentId, centerId)
  }

  const centerChanged = centerId !== student.centerId
  await db.student.update({ where: { id: studentId }, data: { name, centerId } })

  if (centerChanged) {
    const affected = await db.studentScore.findMany({
      where: { studentId },
      select: { eventId: true },
    })
    for (const { eventId } of affected) {
      await deriveEventPodiumFromStudents(eventId, actor, `Student "${name}" reassigned to another center`)
    }
  }

  emitTournamentChanged(tournamentId)
  const fresh = await db.student.findUnique({
    where: { id: studentId },
    include: { center: { select: { centerCode: true } } },
  })
  if (!fresh) throw new Error('Student not found')
  return toStudentDTO(fresh)
}

/** Removes a student and their marks; affected derived podiums are
 *  re-computed (or reset when no marks remain for the event). */
export async function removeStudent(tournamentId: string, studentId: string, actor: string) {
  const student = await db.student.findUnique({ where: { id: studentId } })
  if (!student || student.tournamentId !== tournamentId) {
    throw new Error('Student not found')
  }

  const affected = await db.studentScore.findMany({
    where: { studentId },
    select: { eventId: true },
  })
  await db.student.delete({ where: { id: studentId } })

  for (const { eventId } of affected) {
    await deriveEventPodiumFromStudents(eventId, actor, `Student "${student.name}" removed from the roster`)
  }

  emitTournamentChanged(tournamentId)
}

// ── scoring ────────────────────────────────────────────────────

interface PodiumSnapshot {
  first: string | null
  second: string | null
  third: string | null
}

async function snapshotResult(resultId: string): Promise<PodiumSnapshot> {
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
 * Records (or corrects) the complete mark sheet for one event, then
 * derives the event's center podium from the per-center sums.
 *
 * Guardrails (mirrors the podium flow):
 *  - students must belong to the same tournament
 *  - a student appears at most once
 *  - overwriting an existing result requires a justification reason
 */
export async function submitStudentScores(payload: StudentScoresSubmitPayload, actor: string) {
  const event = await db.tournamentEvent.findUnique({
    where: { id: payload.eventId },
    include: { tournament: true },
  })
  if (!event) throw new Error('Event not found')
  if (event.tournament.status === 'archived') throw new Error('Tournament is archived')

  const rawScores = Array.isArray(payload.scores) ? payload.scores : []
  const cleaned = rawScores
    .map((s) => ({ studentId: String(s.studentId ?? ''), marks: Number(s.marks) }))
    .filter((s) => s.studentId.length > 0)
  if (cleaned.length === 0) throw new Error('Enter at least one student mark before submitting')

  const seen = new Set<string>()
  for (const s of cleaned) {
    if (seen.has(s.studentId)) throw new Error('A student can only appear once on the mark sheet')
    seen.add(s.studentId)
    if (!Number.isFinite(s.marks) || s.marks < 0) {
      throw new Error('Marks must be a number of zero or more')
    }
    if (s.marks > MAX_MARKS) throw new Error('Marks are implausibly large')
  }

  const students = await db.student.findMany({
    where: { tournamentId: event.tournamentId },
    select: { id: true },
  })
  const validIds = new Set(students.map((s) => s.id))
  for (const s of cleaned) {
    if (!validIds.has(s.studentId)) throw new Error('A selected student does not belong to this tournament')
  }

  const existingResult = await db.eventResult.findUnique({ where: { eventId: event.id } })
  const existingScores = await db.studentScore.findMany({
    where: { eventId: event.id },
    select: { id: true },
  })
  const isCorrection = Boolean(existingResult) || existingScores.length > 0
  if (isCorrection && !payload.reason?.trim()) {
    throw new Error('A justification reason is required to correct an existing result')
  }

  // Full-sheet replace: the payload IS the event's mark sheet.
  if (existingScores.length > 0) {
    await db.studentScore.deleteMany({ where: { eventId: event.id } })
  }
  await db.studentScore.createMany({
    data: cleaned.map((s) => ({
      tournamentId: event.tournamentId,
      eventId: event.id,
      studentId: s.studentId,
      marks: round2(s.marks),
      recordedBy: actor.trim() || 'Unknown judge',
      notes: (payload.notes ?? '').trim(),
    })),
  })
  await db.tournamentEvent.update({
    where: { id: event.id },
    data: { scoringMode: 'students', status: 'completed' },
  })

  const out = await deriveEventPodiumFromStudents(
    event.id,
    actor,
    payload.reason?.trim() || '',
    (payload.notes ?? '').trim()
  )

  return {
    resultId: out.resultId,
    isCorrection,
    tournamentId: event.tournamentId,
    eventId: event.id,
    centerSums: out.centerSums,
  }
}

/**
 * Recomputes an event's center podium from its recorded student
 * marks and writes it to EventResult (derivedFromStudents = true).
 *
 * - No marks left → any derived result is cleared and the event
 *   returns to pending (used when rosters change).
 * - Audit trail: created/updated/reset entries exactly like the
 *   podium flow, with the center sums recorded alongside.
 */
export async function deriveEventPodiumFromStudents(
  eventId: string,
  actor: string,
  reason: string,
  notes?: string
): Promise<{ resultId: string | null; centerSums: CenterSumRow[] }> {
  const event = await db.tournamentEvent.findUnique({
    where: { id: eventId },
    include: { tournament: true },
  })
  if (!event) throw new Error('Event not found')

  const scores = await db.studentScore.findMany({
    where: { eventId },
    include: { student: { include: { center: true } } },
  })
  const centers = await db.center.findMany({
    where: { tournamentId: event.tournamentId },
    select: { id: true, centerCode: true },
  })

  const centerSums = computeCenterSums(
    scores.map((s) => ({ studentId: s.studentId, marks: s.marks })),
    scores.map((s) => ({ id: s.student.id, centerId: s.student.centerId })),
    centers
  )

  const podium = centerSums.filter((c) => c.place > 0)
  const existing = await db.eventResult.findUnique({ where: { eventId } })

  // Nothing scored anymore — clear a derived result and reopen.
  if (centerSums.length === 0 || podium.length === 0) {
    if (existing?.derivedFromStudents) {
      const oldValues = await snapshotResult(existing.id)
      await db.auditLog.create({
        data: {
          eventId,
          action: 'reset',
          oldValues: JSON.stringify(oldValues),
          newValues: '',
          reason: reason.trim() || 'No student marks remain for this event',
          actor: actor.trim() || 'M&E Console',
        },
      })
      await db.eventResult.delete({ where: { id: existing.id } })
      await db.tournamentEvent.update({ where: { id: eventId }, data: { status: 'pending' } })
      emitTournamentChanged(event.tournamentId)
    }
    return { resultId: null, centerSums }
  }

  const first = podium[0]?.centerId ?? null
  const second = podium[1]?.centerId ?? null
  const third = podium[2]?.centerId ?? null
  const sumsText = centerSums.map((c) => `${c.centerCode}=${c.sum}`).join(', ')
  const newValues = JSON.stringify({
    first: podium[0]?.centerCode ?? null,
    second: podium[1]?.centerCode ?? null,
    third: podium[2]?.centerCode ?? null,
    sums: sumsText,
  })

  let resultId: string
  if (existing) {
    const oldValues = await snapshotResult(existing.id)
    await db.eventResult.update({
      where: { id: existing.id },
      data: {
        firstPlaceCenterId: first,
        secondPlaceCenterId: second,
        thirdPlaceCenterId: third,
        derivedFromStudents: true,
        recordedBy: actor.trim() || 'Derived from student marks',
        ...(notes !== undefined ? { notes } : {}),
        recordedAt: new Date(),
      },
    })
    resultId = existing.id
    await db.auditLog.create({
      data: {
        eventId,
        action: 'updated',
        oldValues: JSON.stringify(oldValues),
        newValues,
        reason: reason.trim() || 'Mark sheet corrected',
        actor: actor.trim() || 'M&E Console',
      },
    })
  } else {
    const created = await db.eventResult.create({
      data: {
        tournamentId: event.tournamentId,
        eventId,
        firstPlaceCenterId: first,
        secondPlaceCenterId: second,
        thirdPlaceCenterId: third,
        derivedFromStudents: true,
        recordedBy: actor.trim() || 'Derived from student marks',
        notes: notes ?? '',
      },
    })
    resultId = created.id
    await db.auditLog.create({
      data: {
        eventId,
        action: 'created',
        oldValues: '',
        newValues,
        reason: reason.trim(),
        actor: actor.trim() || 'M&E Console',
      },
    })
  }

  await db.tournamentEvent.update({
    where: { id: eventId },
    data: { status: 'completed' },
  })

  // A result now exists — any undo snapshot from an earlier reset
  // describes a past this event has moved on from.
  await discardResetSnapshot(eventId)

  emitTournamentChanged(event.tournamentId)
  return { resultId, centerSums }
}
