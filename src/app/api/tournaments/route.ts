import { NextRequest, NextResponse } from 'next/server'
import { createFromCustom, createFromPreset, listTournaments } from '@/lib/tournament-service'
import { emitTournamentChanged } from '@/lib/bus'
import { friendlyError, requireRole } from '@/lib/auth'
import type { CustomTournamentPayload } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** Public: lists every tournament with summary counts. */
export async function GET() {
  const tournaments = await listTournaments()
  return NextResponse.json({ tournaments })
}

/** Administrator only: creates a tournament from a preset or a custom configuration. */
export async function POST(req: NextRequest) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response

  try {
    const body = await req.json()
    let id: string

    if (body.presetId) {
      id = await createFromPreset(String(body.presetId), body.nameOverride)
    } else if (body.custom) {
      id = await createFromCustom(body.custom as CustomTournamentPayload)
    } else {
      return NextResponse.json({ error: 'Provide presetId or custom payload' }, { status: 400 })
    }

    emitTournamentChanged(id)
    return NextResponse.json({ id }, { status: 201 })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to create tournament')
    return NextResponse.json({ error: message }, { status })
  }
}
