import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import { getTournamentDetail } from '@/lib/tournament-service'
import {
  buildTestMessage,
  eventLink,
  getWhatsAppConfig,
  guestLink,
  originFromRequest,
  sendWhatsAppText,
  shareEventResult,
  shareStandings,
  WahaError,
} from '@/lib/whatsapp'

type SendKind = 'test' | 'standings' | 'event'

/**
 * Administrator only: sends a message to the configured WhatsApp
 * group through WAHA. Standings and event podiums go out as styled
 * share cards (images), falling back to plain text automatically.
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
    if (!cfg || !cfg.baseUrl || !cfg.groupChatId) {
      return NextResponse.json(
        { error: 'WhatsApp sharing is not set up yet — open Settings to connect it first.' },
        { status: 400 }
      )
    }
    if (!cfg.apiKey && !cfg.username && !cfg.password) {
      return NextResponse.json(
        { error: 'The WhatsApp server needs credentials — open Settings and save them.' },
        { status: 400 }
      )
    }

    let via: 'image' | 'text'
    const origin = originFromRequest(req)
    if (kind === 'test') {
      await sendWhatsAppText(cfg, buildTestMessage())
      via = 'text'
    } else if (kind === 'standings') {
      const detail = await getTournamentDetail(String(body.tournamentId ?? ''))
      if (!detail) return NextResponse.json({ error: 'Tournament not found.' }, { status: 404 })
      // Standings point at the overall guest scoreboard.
      via = await shareStandings(cfg, detail, {
        presentUrl: guestLink(cfg, origin, detail.tournament.id),
      })
    } else {
      const detail = await getTournamentDetail(String(body.tournamentId ?? ''))
      if (!detail) return NextResponse.json({ error: 'Tournament not found.' }, { status: 404 })
      const eventId = String(body.eventId ?? '')
      // An event podium points at that event's own live page.
      via = await shareEventResult(cfg, detail, eventId, {
        eventUrl: eventLink(cfg, origin, detail.tournament.id, eventId),
      })
    }

    return NextResponse.json({ ok: true, via, groupName: cfg.groupName || cfg.groupChatId })
  } catch (err) {
    const { message, status } =
      err instanceof WahaError
        ? { message: err.message, status: err.status }
        : { message: 'The message could not be sent.', status: 400 }
    return NextResponse.json({ error: message }, { status })
  }
}
