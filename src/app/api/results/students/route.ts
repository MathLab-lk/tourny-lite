import { NextRequest, NextResponse } from 'next/server'
import { submitStudentScores } from '@/lib/student-service'
import { friendlyError, requireRole } from '@/lib/auth'
import type { StudentScoresSubmitPayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * Signed-in staff only: records or corrects an event's complete
 * student mark sheet. The center podium for the event is derived
 * from the per-center sums of these marks — centers still earn the
 * fixed place points; students earn their custom marks.
 *
 * The recorded-by identity always comes from the signed-in session.
 */
export async function POST(req: NextRequest) {
  const guard = await requireRole('any')
  if (guard.response) return guard.response

  try {
    const payload = (await req.json()) as StudentScoresSubmitPayload
    const out = await submitStudentScores({ ...payload, recordedBy: guard.session.name }, guard.session.name)
    return NextResponse.json(out, { status: out.isCorrection ? 200 : 201 })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to submit student marks')
    return NextResponse.json({ error: message }, { status })
  }
}
