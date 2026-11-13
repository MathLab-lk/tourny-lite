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
 *  An empty `apiKey` keeps the previously stored key. */
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
    if (body.groupChatId && !String(body.groupChatId).endsWith(GROUP_SUFFIX)) {
      return NextResponse.json(
        { error: 'A group chat id must end with @g.us — pick the group from the list.' },
        { status: 400 }
      )
    }
    const saved = await saveWhatsAppConfig({
      baseUrl,
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : undefined,
      session: typeof body.session === 'string' ? body.session : undefined,
      groupChatId: typeof body.groupChatId === 'string' ? body.groupChatId : undefined,
      groupName: typeof body.groupName === 'string' ? body.groupName : undefined,
    })
    return NextResponse.json(toPublicConfig(saved))
  } catch (err) {
    const { message, status } =
      err instanceof WahaError
        ? { message: err.message, status: err.status }
        : { message: 'Could not save the WhatsApp settings.', status: 400 }
    return NextResponse.json({ error: message }, { status })
  }
}
