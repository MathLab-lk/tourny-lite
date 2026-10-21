import { NextRequest } from 'next/server'
import { onTournamentChange, offTournamentChange } from '@/lib/bus'

export const dynamic = 'force-dynamic'

/**
 * Server-Sent Events stream — the lightweight realtime engine.
 * Clients subscribe with ?tournamentId=... and receive `change`
 * events whenever any data in that tournament mutates, then
 * refetch their views. Works through HTTP proxies / Cloudflare
 * Tunnel without WebSocket dropouts.
 */
export async function GET(req: NextRequest) {
  const tournamentId = req.nextUrl.searchParams.get('tournamentId') ?? ''
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const send = (event: string, data: unknown) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          closed = true
        }
      }

      send('ready', { tournamentId, ts: Date.now() })

      const onChange = (tid: string) => {
        if (!tournamentId || tid === tournamentId) send('change', { ts: Date.now() })
      }
      onTournamentChange(onChange)

      // Keep-alive comment ping every 25s (proxy-safe)
      const ping = setInterval(() => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`))
        } catch {
          closed = true
        }
      }, 25000)

      const cleanup = () => {
        if (closed) return
        closed = true
        clearInterval(ping)
        offTournamentChange(onChange)
        try {
          controller.close()
        } catch {
          // already closed
        }
      }
      req.signal.addEventListener('abort', cleanup)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
