// Minimal WAHA mock for local end-to-end tests of the WhatsApp
// integration — run with: bun scripts/waha-mock.ts [port]
//
// Emulates the exact REST surface tourny-lite uses:
//   GET  /api/sessions
//   GET  /api/{session}/groups
//   POST /api/sendText
//   POST /api/sendImage
//   POST /__mock/fail           (test-only failure injection)
// Correct API key required via the X-Api-Key header (matching the
// real server's 401 behaviour). Groups come back in the gows (Go
// core — the *-arm images) field shape: { JID, Name, Participants };
// one group is unnamed to prove the name falls back to its id.
// Sent messages land in ./waha-mock.log as JSON lines:
//   { kind: 'text',  ... text }
//   { kind: 'image', ... caption, mime, filename, imageBytes }

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { appendFileSync } from 'node:fs'

const PORT = Number(process.argv[2] ?? 3001)
const API_KEY = process.env.MOCK_API_KEY ?? 'test-key-123'
const SESSIONS = [
  { name: 'default', status: 'WORKING', engine: { engine: 'GOWS' } },
  { name: 'backup', status: 'STOPPED', engine: { engine: 'GOWS' } },
]
const GROUPS = [
  // gows shape: JID / Name / Participants
  { JID: '1203630abcdef123456789@g.us', Name: 'Math Competition 2026 — Results', Participants: [] },
  { JID: '1203630zzzzzz999888777@g.us', Name: 'M&E Coordinators', Participants: [] },
  { JID: '1203630yyyyyy444555666@g.us', Name: '', Participants: [] },
]

// Test-only failure injection: { path, times, status? } — the next
// `times` calls to `path` fail with `status` (default 500). Used by
// the suite to prove the text-fallback path.
const failures = new Map<string, { times: number; status: number }>()

function authorized(req: IncomingMessage): boolean {
  return req.headers['x-api-key'] === API_KEY
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'))
      } catch {
        resolve({})
      }
    })
  })
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)

  if (!authorized(req)) {
    json(res, 401, { message: 'Unauthorized', statusCode: 401 })
    return
  }

  // Test-only: inject failures for a path (see `failures` above).
  if (req.method === 'POST' && url.pathname === '/__mock/fail') {
    const body = await readBody(req)
    const path = String(body.path ?? '')
    const times = Math.max(1, Number(body.times ?? 1))
    if (!path.startsWith('/api/')) {
      json(res, 400, { message: 'path must start with /api/' })
      return
    }
    failures.set(path, { times, status: Number(body.status ?? 500) })
    json(res, 200, { ok: true, path, times })
    return
  }

  const injected = failures.get(url.pathname)
  if (injected && injected.times > 0) {
    injected.times -= 1
    if (injected.times === 0) failures.delete(url.pathname)
    json(res, injected.status, { message: `Injected failure for ${url.pathname}` })
    return
  }

  if (req.method === 'GET' && url.pathname === '/api/sessions') {
    json(res, 200, SESSIONS)
    return
  }

  const groupsMatch = url.pathname.match(/^\/api\/([^/]+)\/groups$/)
  if (req.method === 'GET' && groupsMatch) {
    const session = decodeURIComponent(groupsMatch[1])
    if (!SESSIONS.some((s) => s.name === session)) {
      json(res, 404, { message: `Session "${session}" not found` })
      return
    }
    // Only the connected session can list its groups.
    const working = SESSIONS.find((s) => s.name === session && s.status === 'WORKING')
    json(res, 200, working ? GROUPS : [])
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/sendText') {
    const body = await readBody(req)
    if (!body.session || !body.chatId || !body.text) {
      json(res, 422, { message: 'session, chatId and text are required' })
      return
    }
    const id = `3EB0${Math.random().toString(16).slice(2, 12).toUpperCase()}`
    const entry = {
      kind: 'text' as const,
      at: new Date().toISOString(),
      id,
      session: body.session,
      chatId: body.chatId,
      text: body.text as string,
    }
    appendFileSync(
      new URL('./waha-mock.log', import.meta.url).pathname,
      JSON.stringify(entry) + '\n'
    )
    json(res, 201, { ...entry, fromMe: true })
    return
  }

  if (req.method === 'POST' && url.pathname === '/api/sendImage') {
    const body = await readBody(req)
    const file = body.file as
      | { mimetype?: string; filename?: string; data?: string }
      | undefined
    const data = typeof file?.data === 'string' ? file.data : ''
    if (!body.session || !body.chatId || !file || !data) {
      json(res, 422, { message: 'session, chatId and file.data are required' })
      return
    }
    const jpeg = Buffer.from(data.replace(/^data:[^;]+;base64,/, ''), 'base64')
    if (jpeg.length < 1024 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) {
      json(res, 422, { message: 'file.data is not a JPEG image' })
      return
    }
    const id = `3EB0${Math.random().toString(16).slice(2, 12).toUpperCase()}`
    const entry = {
      kind: 'image' as const,
      at: new Date().toISOString(),
      id,
      session: body.session,
      chatId: body.chatId,
      caption: (body.caption ?? '') as string,
      mime: file.mimetype ?? '',
      filename: file.filename ?? '',
      imageBytes: jpeg.length,
    }
    appendFileSync(
      new URL('./waha-mock.log', import.meta.url).pathname,
      JSON.stringify(entry) + '\n'
    )
    json(res, 201, { ...entry, fromMe: true })
    return
  }

  json(res, 404, { message: 'Not found' })
})

server.listen(PORT, () => {
  console.log(`WAHA mock listening on http://localhost:${PORT} (X-Api-Key: ${API_KEY})`)
  console.log(`Sessions: ${SESSIONS.map((s) => `${s.name}=${s.status}`).join(', ')}`)
})
