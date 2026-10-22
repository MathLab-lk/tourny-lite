import { NextRequest, NextResponse } from 'next/server'
import { submitResult } from '@/lib/result-service'
import { friendlyError, requireRole } from '@/lib/auth'
import type { ResultSubmitPayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

/**
 * Signed-in staff only: records or corrects a podium result.
 * The recorded-by identity always comes from the signed-in session —
 * it cannot be spoofed by the client.
 */
export async function POST(req: NextRequest) {
  const guard = await requireRole('any')
  if (guard.response) return guard.response

  try {
    const payload = (await req.json()) as ResultSubmitPayload
    const out = await submitResult({ ...payload, recordedBy: guard.session.name })
    return NextResponse.json(out, { status: out.isCorrection ? 200 : 201 })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to submit result')
    return NextResponse.json({ error: message }, { status })
  }
}
