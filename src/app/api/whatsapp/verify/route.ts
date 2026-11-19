import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import {
  getWahaMe,
  listWahaGroups,
  listWahaSessions,
  refreshWahaGroups,
  resolveWahaCredentials,
  WahaError,
  type WahaGroupInfo,
  type WahaSessionInfo,
} from '@/lib/whatsapp'

/**
 * Administrator only: verifies a WhatsApp connection before saving.
 *
 *  - { baseUrl, apiKey|username+password }          → sessions on the server
 *  - { …, session }                                 → + that session's groups
 *  - { …, session, refresh: true }                  → groups re-synced first
 *
 * When the chosen session is WORKING, the response also carries `me`
 * — the WhatsApp account behind it, so the card can show which
 * number is broadcasting.
 *
 * Blank credential fields reuse the stored values, so a saved
 * connection can be re-verified without retyping any secret.
 */
export async function POST(req: NextRequest) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response

  try {
    const body = await req.json()
    const resolved = await resolveWahaCredentials(body)
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 400 })
    }
    const { creds } = resolved
    const session = typeof body.session === 'string' ? body.session.trim() : ''
    const refresh = body.refresh === true

    const sessions: WahaSessionInfo[] = await listWahaSessions(creds)
    if (!session) {
      return NextResponse.json({ ok: true, sessions })
    }

    const current = sessions.find((s) => s.name === session)
    if (!current) {
      return NextResponse.json(
        { error: `Session "${session}" does not exist on the WhatsApp server.` },
        { status: 400 }
      )
    }
    const groups: WahaGroupInfo[] = refresh
      ? await refreshWahaGroups(creds, session)
      : await listWahaGroups(creds, session)

    // Which account answers — only meaningful while it is connected.
    const me = current.status === 'WORKING' ? await getWahaMe(creds, session) : null

    return NextResponse.json({ ok: true, session: current, sessions, groups, me })
  } catch (err) {
    const { message, status } =
      err instanceof WahaError
        ? { message: err.message, status: err.status }
        : { message: 'Verification failed.', status: 400 }
    return NextResponse.json({ error: message }, { status })
  }
}
