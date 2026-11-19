import { NextRequest, NextResponse } from 'next/server'
import { undoReset } from '@/lib/result-service'
import { friendlyError, requireRole } from '@/lib/auth'

type Ctx = { params: Promise<{ eventId: string }> }

/** Administrator only: undoes the most recent reset of an event by
 *  restoring the recovery snapshot — podium, mark sheet and event
 *  state exactly as they stood before the reset. */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response

  try {
    const { eventId } = await ctx.params
    const out = await undoReset(eventId, guard.session.name)
    return NextResponse.json({ ok: true, ...out })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to undo the reset')
    return NextResponse.json({ error: message }, { status })
  }
}
