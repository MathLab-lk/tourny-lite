import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getTournamentDetail } from '@/lib/tournament-service'
import {
  buildEventMessage,
  buildStandingsMessage,
  buildTestMessage,
  getWhatsAppConfig,
  sendWhatsAppText,
  WahaError,
} from '@/lib/whatsapp'

type SendKind = 'test' | 'standings' | 'event'

/**
 * Administrator only: sends a message to the configured WhatsApp
 * group through WAHA.
 *
 *   { kind: 'test' }                            — connectivity probe
 *   { kind: 'standings', tournamentId }          — overall standings
 *   { kind: 'event', tournamentId, eventId }     — one event podium
 */
export async function POST(req: NextRequest) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response

  try {
    const body = await req.json()
    const kind = body.kind as SendKind
    if (!['test', 'standings', 'event'].includes(kind)) {
      return NextResponse.json({ error: 'Unknown message kind.' }, { status: 400 })
    }

    const cfg = await getWhatsAppConfig()
    if (!cfg || !cfg.baseUrl || !cfg.apiKey || !cfg.groupChatId) {
      return NextResponse.json(
        { error: 'WhatsApp sharing is not set up yet — open Settings to connect it first.' },
        { status: 400 }
      )
    }

    let text: string
    if (kind === 'test') {
      text = buildTestMessage()
    } else if (kind === 'standings') {
      const detail = await getTournamentDetail(String(body.tournamentId ?? ''))
      if (!detail) return NextResponse.json({ error: 'Tournament not found.' }, { status: 404 })
      text = buildStandingsMessage(detail)
    } else {
      const detail = await getTournamentDetail(String(body.tournamentId ?? ''))
      if (!detail) return NextResponse.json({ error: 'Tournament not found.' }, { status: 404 })
      text = buildEventMessage(detail, String(body.eventId ?? ''))
    }

    await sendWhatsAppText(cfg, text)
    return NextResponse.json({ ok: true, groupName: cfg.groupName || cfg.groupChatId })
  } catch (err) {
    const { message, status } =
      err instanceof WahaError
        ? { message: err.message, status: err.status }
        : { message: 'The message could not be sent.', status: 400 }
    return NextResponse.json({ error: message }, { status })
  }
}
