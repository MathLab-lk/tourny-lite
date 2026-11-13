import { after, NextRequest, NextResponse } from 'next/server'
import { submitResult } from '@/lib/result-service'
import { autoShareEventResult, originFromRequest } from '@/lib/whatsapp'
import { friendlyError, requireRole } from '@/lib/auth'
import type { ResultSubmitPayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * Signed-in staff only: records or corrects a podium result.
 * The recorded-by identity always comes from the signed-in session —
 * it cannot be spoofed by the client.
 *
 * When WhatsApp auto-share is enabled (Settings), the announcement
 * goes out after the response — a slow WhatsApp server never delays
 * the scorekeeper.
 */
export async function POST(req: NextRequest) {
  const guard = await requireRole('any')
  if (guard.response) return guard.response

  try {
    const payload = (await req.json()) as ResultSubmitPayload
    const out = await submitResult({ ...payload, recordedBy: guard.session.name })
    // Capture the origin while the request is alive — the share
    // runs after the response, when req may already be gone.
    const origin = originFromRequest(req)
    after(() =>
      void autoShareEventResult(out.tournamentId, out.eventId, {
        isCorrection: out.isCorrection,
        origin,
      })
    )
    return NextResponse.json(out, { status: out.isCorrection ? 200 : 201 })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to submit result')
    return NextResponse.json({ error: message }, { status })
  }
}
