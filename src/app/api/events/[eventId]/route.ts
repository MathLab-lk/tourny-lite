import { NextRequest, NextResponse } from 'next/server'
import { setEventStatus } from '@/lib/result-service'
import { friendlyError, requireRole } from '@/lib/auth'

type Ctx = { params: Promise<{ eventId: string }> }

/** Signed-in staff only: overrides an event's status (pending / in progress / completed). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const guard = await requireRole('any')
  if (guard.response) return guard.response

  try {
    const { eventId } = await ctx.params
    const body = await req.json()
    const status = String(body.status)
    if (!['pending', 'in_progress', 'completed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    await setEventStatus(eventId, status as 'pending' | 'in_progress' | 'completed')
    return NextResponse.json({ ok: true })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to update event status')
    return NextResponse.json({ error: message }, { status })
  }
}
