import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import {
  getWhatsAppConfig,
  listWahaGroups,
  listWahaSessions,
  WahaError,
  type WahaGroupInfo,
  type WahaSessionInfo,
} from '@/lib/whatsapp'

/**
 * Administrator only: verifies a WhatsApp connection before saving.
 *
 *  - { baseUrl, apiKey }            → checks the server + API key,
 *                                     returns the available sessions
 *  - { baseUrl, apiKey, session }   → additionally loads the group
 *                                     list for that session
 *
 * An empty `apiKey` reuses the stored key, so a saved connection can
 * be re-verified without retyping the secret.
 */
export async function POST(req: NextRequest) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response

  try {
    const body = await req.json()
    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : ''
    if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
      return NextResponse.json(
        { error: 'Enter the WhatsApp server address (https://…).' },
        { status: 400 }
      )
    }
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
    const session = typeof body.session === 'string' ? body.session.trim() : ''

    // Prefer the typed key; fall back to the stored one.
    let effectiveKey = apiKey
    if (!effectiveKey) {
      const stored = await getWhatsAppConfig()
      effectiveKey = stored?.apiKey ?? ''
    }
    if (!effectiveKey) {
      return NextResponse.json(
        { error: 'Enter the API key of the WhatsApp server.' },
        { status: 400 }
      )
    }

    const sessions: WahaSessionInfo[] = await listWahaSessions(baseUrl, effectiveKey)
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
    const groups: WahaGroupInfo[] = await listWahaGroups(baseUrl, effectiveKey, session)
    return NextResponse.json({ ok: true, session: current, sessions, groups })
  } catch (err) {
    const { message, status } =
      err instanceof WahaError
        ? { message: err.message, status: err.status }
        : { message: 'Verification failed.', status: 400 }
    return NextResponse.json({ error: message }, { status })
  }
}
