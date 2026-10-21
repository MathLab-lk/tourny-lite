import { NextRequest, NextResponse } from 'next/server'
import { resetResult } from '@/lib/result-service'
import { friendlyError, requireRole } from '@/lib/auth'

type Ctx = { params: Promise<{ eventId: string }> }

/** Administrator only: clears a recorded result and returns the event to pending. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response

  try {
    const { eventId } = await ctx.params
    const body = await req.json().catch(() => ({}))
    await resetResult(eventId, String(body.reason ?? ''), guard.session.name)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to reset result')
    return NextResponse.json({ error: message }, { status })
  }
}
