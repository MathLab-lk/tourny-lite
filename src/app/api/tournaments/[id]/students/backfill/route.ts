import { NextRequest, NextResponse } from 'next/server'
import { backfillStudentCodes } from '@/lib/student-service'
import { friendlyError, requireRole } from '@/lib/auth'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Administrator only: issues studentCodes to every legacy student
 * registered before the registration stage existed (studentCode is
 * null), using the tournament's current ID pattern. Students that
 * already carry a code are never touched.
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response
  const { id } = await ctx.params

  try {
    const issued = await backfillStudentCodes(id)
    return NextResponse.json({ ok: true, issued })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to generate the missing IDs')
    return NextResponse.json({ error: message }, { status })
  }
}
