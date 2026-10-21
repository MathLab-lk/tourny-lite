import { NextRequest, NextResponse } from 'next/server'
import { cloneTournament } from '@/lib/tournament-service'
import { emitTournamentChanged } from '@/lib/bus'
import { friendlyError, requireRole } from '@/lib/auth'

type Ctx = { params: Promise<{ id: string }> }

/** Administrator only: duplicates a tournament's structure with results cleared. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response

  try {
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const newId = await cloneTournament(id, String(body.name ?? ''))
    emitTournamentChanged(newId)
    return NextResponse.json({ id: newId }, { status: 201 })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to clone tournament')
    return NextResponse.json({ error: message }, { status })
  }
}
