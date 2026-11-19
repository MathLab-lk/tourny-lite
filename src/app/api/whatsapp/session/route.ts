import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import {
  createWahaSession,
  getWahaQrCode,
  getWahaSession,
  logoutWahaSession,
  restartWahaSession,
  resolveWahaCredentials,
  startWahaSession,
  stopWahaSession,
  WahaError,
  type WahaSessionInfo,
} from '@/lib/whatsapp'

/**
 * Administrator only: the session console — pair and repair the
 * WhatsApp connection without opening the WAHA dashboard.
 *
 *   { action: 'start'|'stop'|'restart'|'logout', session, …creds }
 *       → { ok, session: { name, status } }
 *   { action: 'create', name, …creds }
 *       → { ok, session: { name, status } }   (created + started)
 *   { action: 'qr', session, …creds }
 *       → { ok, session: { name, status }, qr: dataUrl | null }
 *
 * `qr` is the pairing poll: it answers with the session's live
 * status plus the current QR image when one is being offered (null
 * is normal — the panel keeps polling). Blank credential fields
 * reuse the stored values.
 */
const SESSION_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/

export async function POST(req: NextRequest) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response

  try {
    const body = await req.json()
    const action = String(body.action ?? '')
    const session = typeof body.session === 'string' ? body.session.trim() : ''

    const resolved = await resolveWahaCredentials(body)
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 400 })
    }
    const { creds } = resolved

    if (action === 'create') {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!SESSION_NAME_RE.test(name)) {
        return NextResponse.json(
          { error: 'Session names are 1-64 letters, digits, dashes or underscores.' },
          { status: 400 }
        )
      }
      const created = await createWahaSession(creds, name)
      return NextResponse.json({ ok: true, session: created })
    }

    if (!SESSION_NAME_RE.test(session)) {
      return NextResponse.json({ error: 'Pick a session first.' }, { status: 400 })
    }

    let next: WahaSessionInfo
    if (action === 'start') next = await startWahaSession(creds, session)
    else if (action === 'stop') next = await stopWahaSession(creds, session)
    else if (action === 'restart') next = await restartWahaSession(creds, session)
    else if (action === 'logout') next = await logoutWahaSession(creds, session)
    else if (action === 'qr') {
      const info = await getWahaSession(creds, session)
      if (!info) {
        return NextResponse.json(
          { error: `Session "${session}" does not exist on the WhatsApp server.` },
          { status: 404 }
        )
      }
      const qr = info.status === 'SCAN_QR_CODE' ? await getWahaQrCode(creds, session) : null
      return NextResponse.json({ ok: true, session: info, qr })
    } else {
      return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 400 })
    }

    return NextResponse.json({ ok: true, session: next })
  } catch (err) {
    const { message, status } =
      err instanceof WahaError
        ? { message: err.message, status: err.status }
        : { message: 'The session action failed.', status: 400 }
    return NextResponse.json({ error: message }, { status })
  }
}
