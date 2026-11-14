import { NextRequest, NextResponse } from 'next/server'
import { addEvents } from '@/lib/event-service'
import { friendlyError, requireRole } from '@/lib/auth'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Administrator only: appends event slots to a live tournament —
 * for existing categories/games, or brand-new ones created inline.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response
  const { id } = await ctx.params

  try {
    const body = await req.json()
    const out = await addEvents(
      id,
      {
        divisionId: body.divisionId ? String(body.divisionId) : undefined,
        newDivision: body.newDivision,
        gameId: body.gameId ? String(body.gameId) : undefined,
        newGame: body.newGame,
        count: body.count,
        scoringMode: body.scoringMode === 'students' ? 'students' : 'podium',
      },
      (guard.session?.name as string) ?? ''
    )
    return NextResponse.json(out)
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to add events')
    return NextResponse.json({ error: message }, { status })
  }
}
