import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { AuditAction, AuditEntryDTO } from '@/lib/types'

type Ctx = { params: Promise<{ id: string }> }

/** A reset entry is undoable when a recovery snapshot exists, the
 *  event carries no newer data (no result, no marks), and this
 *  entry is the event's latest trail entry — anything recorded
 *  after the reset invalidates the snapshot (the write paths drop
 *  it), and an older reset of the same event must not masquerade
 *  as the undoable one. */
async function computeUndoable(tournamentId: string) {
  const snapshots = await db.resetSnapshot.findMany({
    where: { tournamentId },
    select: { eventId: true, payload: true },
  })
  const markfulEventIds = new Set<string>()
  for (const s of snapshots) {
    try {
      const payload = JSON.parse(s.payload) as { scores?: unknown[] }
      if (Array.isArray(payload.scores) && payload.scores.length > 0) {
        markfulEventIds.add(s.eventId)
      }
    } catch {
      // unreadable payload — never claims to restore marks
    }
  }
  const snapshotEventIds = new Set(snapshots.map((s) => s.eventId))

  // Events that already carry a result or marks — their snapshots
  // are stale (or already consumed) and must not offer undo.
  const busyEvents = await db.tournamentEvent.findMany({
    where: {
      tournamentId,
      OR: [{ result: { isNot: null } }, { studentScores: { some: {} } }],
    },
    select: { id: true },
  })
  const busyEventIds = new Set(busyEvents.map((e) => e.id))

  return { snapshotEventIds, markfulEventIds, busyEventIds }
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const [logs, undoable] = await Promise.all([
    db.auditLog.findMany({
      where: { event: { tournamentId: id } },
      orderBy: { timestamp: 'desc' },
      take: 200,
      include: { event: { include: { division: true, game: true } } },
    }),
    computeUndoable(id),
  ])

  // First occurrence per event in desc order = that event's
  // latest trail entry.
  const latestEntryIdPerEvent = new Map<string, string>()
  for (const l of logs) {
    if (!latestEntryIdPerEvent.has(l.eventId)) latestEntryIdPerEvent.set(l.eventId, l.id)
  }

  const entries: AuditEntryDTO[] = logs.map((l) => {
    const isLatest = latestEntryIdPerEvent.get(l.eventId) === l.id
    const canUndo =
      l.action === 'reset' &&
      isLatest &&
      undoable.snapshotEventIds.has(l.eventId) &&
      !undoable.busyEventIds.has(l.eventId)
    return {
      id: l.id,
      eventId: l.eventId,
      eventLabel: l.event?.label ?? '',
      action: l.action as AuditAction,
      oldValues: l.oldValues,
      newValues: l.newValues,
      reason: l.reason,
      actor: l.actor,
      timestamp: l.timestamp.toISOString(),
      ...(canUndo
        ? { canUndoReset: true, undoRestoresMarks: undoable.markfulEventIds.has(l.eventId) }
        : {}),
    }
  })
  return NextResponse.json({ entries })
}
