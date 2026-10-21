import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getTournamentDetail } from '@/lib/tournament-service'
import { emitTournamentChanged } from '@/lib/bus'
import { friendlyError, requireRole } from '@/lib/auth'

type Ctx = { params: Promise<{ id: string }> }

/** Public: full tournament detail (divisions, games, centers, events, standings). */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const detail = await getTournamentDetail(id)
  if (!detail) return NextResponse.json({ error: 'Tournament not found' }, { status: 404 })
  return NextResponse.json(detail)
}

/** Administrator only: updates details, scoring scheme or lifecycle status. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response
  const { id } = await ctx.params

  try {
    const body = await req.json()
    const data: Record<string, string | number> = {}

    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
    if (typeof body.organizer === 'string') data.organizer = body.organizer.trim()
    if (body.status !== undefined) {
      if (
        typeof body.status !== 'string' ||
        !['draft', 'active', 'completed', 'archived'].includes(body.status)
      ) {
        return NextResponse.json(
          { error: 'Status must be one of: draft, active, completed, archived.' },
          { status: 400 }
        )
      }
      data.status = body.status
    }
    for (const key of ['pointsFirst', 'pointsSecond', 'pointsThird'] as const) {
      if (body[key] !== undefined) {
        const n = Number(body[key])
        if (Number.isFinite(n) && n >= 0) data[key] = Math.round(n)
      }
    }

    const updated = await db.tournament.update({ where: { id }, data })
    emitTournamentChanged(id)
    return NextResponse.json({ id: updated.id })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to update tournament')
    return NextResponse.json({ error: message }, { status })
  }
}

/** Administrator only: permanently removes a tournament and all of its data. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response
  const { id } = await ctx.params

  try {
    await db.tournament.delete({ where: { id } })
    emitTournamentChanged(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to delete tournament')
    return NextResponse.json({ error: message }, { status })
  }
}
