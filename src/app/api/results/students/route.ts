import { after, NextRequest, NextResponse } from 'next/server'
import { submitStudentScores } from '@/lib/student-service'
import { autoShareEventResult, originFromRequest } from '@/lib/whatsapp'
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
 *
 * When WhatsApp auto-share is enabled (Settings), the announcement
 * goes out after the response — exactly like the podium flow. The
 * hook used to live only on POST /api/results, so mark-sheet events
 * (the student-rankings mode) never announced themselves and every
 * podium had to be shared by hand.
 */
export async function POST(req: NextRequest) {
  const guard = await requireRole('any')
  if (guard.response) return guard.response

  try {
    const payload = (await req.json()) as StudentScoresSubmitPayload
    const out = await submitStudentScores({ ...payload, recordedBy: guard.session.name }, guard.session.name)
    // Capture the origin while the request is alive — the share runs
    // after the response, when req may already be gone. A sheet whose
    // marks sum to no center (e.g. every student unassigned) derives
    // no podium — nothing to announce.
    if (out.resultId) {
      const origin = originFromRequest(req)
      after(() =>
        void autoShareEventResult(out.tournamentId, out.eventId, {
          isCorrection: out.isCorrection,
          origin,
        })
      )
    }
    return NextResponse.json(out, { status: out.isCorrection ? 200 : 201 })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to submit student marks')
    return NextResponse.json({ error: message }, { status })
  }
}
