import { NextRequest, NextResponse } from 'next/server'
import { deleteEvent, updateEvent } from '@/lib/event-service'
import { friendlyError, requireRole } from '@/lib/auth'

type Ctx = { params: Promise<{ eventId: string }> }

/**
 * Signed-in staff: edits an event slot. Status changes are open to
 * any signed-in user (the original behaviour); label and scoring
 * mode changes are structural and admin-only.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const guard = await requireRole('any')
  if (guard.response) return guard.response

  try {
    const { eventId } = await ctx.params
    const body = await req.json()

    const patch: {
      label?: string
      scoringMode?: 'podium' | 'students'
      status?: 'pending' | 'in_progress' | 'completed'
    } = {}

    if (body.label !== undefined) {
      if (guard.session.role !== 'admin') {
        return NextResponse.json(
          { error: 'Only administrators can rename events.' },
          { status: 403 }
        )
      }
      patch.label = String(body.label)
    }
    if (body.scoringMode !== undefined) {
      if (guard.session.role !== 'admin') {
        return NextResponse.json(
          { error: 'Only administrators can change the scoring mode.' },
          { status: 403 }
        )
      }
      patch.scoringMode = body.scoringMode === 'students' ? 'students' : 'podium'
    }
    if (body.status !== undefined) {
      const status = String(body.status)
      if (!['pending', 'in_progress', 'completed'].includes(status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
      }
      patch.status = status as 'pending' | 'in_progress' | 'completed'
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    await updateEvent(eventId, patch)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to update event')
    return NextResponse.json({ error: message }, { status })
  }
}

/** Administrator only: removes an event slot and everything recorded on it. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response

  try {
    const { eventId } = await ctx.params
    await deleteEvent(eventId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to delete event')
    return NextResponse.json({ error: message }, { status })
  }
}
