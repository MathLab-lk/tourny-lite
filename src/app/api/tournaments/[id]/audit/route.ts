import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import type { AuditAction, AuditEntryDTO } from '@/lib/types'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const logs = await db.auditLog.findMany({
    where: { event: { tournamentId: id } },
    orderBy: { timestamp: 'desc' },
    take: 200,
    include: { event: { include: { division: true, game: true } } },
  })
  const entries: AuditEntryDTO[] = logs.map((l) => ({
    id: l.id,
    eventId: l.eventId,
    eventLabel: l.event?.label ?? '',
    action: l.action as AuditAction,
    oldValues: l.oldValues,
    newValues: l.newValues,
    reason: l.reason,
    actor: l.actor,
    timestamp: l.timestamp.toISOString(),
  }))
  return NextResponse.json({ entries })
}
