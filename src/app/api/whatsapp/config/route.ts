import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth'
import {
  getWhatsAppConfig,
  saveWhatsAppConfig,
  toPublicConfig,
  WahaError,
} from '@/lib/whatsapp'

/** Administrator only: the saved WhatsApp connection (API key masked). */
export async function GET() {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response
  const cfg = await getWhatsAppConfig()
  return NextResponse.json(toPublicConfig(cfg))
}

const GROUP_SUFFIX = '@g.us'

/** Administrator only: saves the WhatsApp connection.
 *  An empty `apiKey` keeps the previously stored key; fields left
 *  out of the body keep their stored values, so a partial update
 *  (e.g. only `autoEvents`) touches nothing else. */
export async function PUT(req: NextRequest) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response

  try {
    const body = await req.json()
    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : ''
    if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
      return NextResponse.json(
        { error: 'The server address must start with http:// or https://' },
        { status: 400 }
      )
    }
    const publicBaseUrl = typeof body.publicBaseUrl === 'string' ? body.publicBaseUrl.trim() : ''
    if (publicBaseUrl && !/^https?:\/\//i.test(publicBaseUrl)) {
      return NextResponse.json(
        { error: 'The public address must start with http:// or https://' },
        { status: 400 }
      )
    }
    if (body.groupChatId && !String(body.groupChatId).endsWith(GROUP_SUFFIX)) {
      return NextResponse.json(
        { error: 'A group chat id must end with @g.us — pick the group from the list.' },
        { status: 400 }
      )
    }
    // Only fields present in the body are patched — absent fields
    // keep their stored values (the auto-share toggle sends just
    // { autoEvents } and must not wipe the connection).
    const patch: Parameters<typeof saveWhatsAppConfig>[0] = {}
    if (typeof body.baseUrl === 'string') patch.baseUrl = body.baseUrl
    if (typeof body.publicBaseUrl === 'string') patch.publicBaseUrl = body.publicBaseUrl
    if (typeof body.apiKey === 'string') patch.apiKey = body.apiKey
    if (body.clearApiKey === true) patch.clearApiKey = true
    if (typeof body.username === 'string') patch.username = body.username
    if (typeof body.password === 'string') patch.password = body.password
    if (typeof body.session === 'string') patch.session = body.session
    if (typeof body.groupChatId === 'string') patch.groupChatId = body.groupChatId
    if (typeof body.groupName === 'string') patch.groupName = body.groupName
    if (typeof body.autoEvents === 'boolean') patch.autoEvents = body.autoEvents

    const saved = await saveWhatsAppConfig(patch)
    return NextResponse.json(toPublicConfig(saved))
  } catch (err) {
    const { message, status } =
      err instanceof WahaError
        ? { message: err.message, status: err.status }
        : { message: 'Could not save the WhatsApp settings.', status: 400 }
    return NextResponse.json({ error: message }, { status })
  }
}
