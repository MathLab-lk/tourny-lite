import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, friendlyError } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Deletes an invitation code (administrator only). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response

  const { id } = await params
  try {
    await db.invitationCode.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Could not delete the invitation code.')
    return NextResponse.json({ error: message }, { status })
  }
}
