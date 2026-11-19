// Minimal WAHA mock for local end-to-end tests of the WhatsApp
// integration — run with: bun scripts/waha-mock.ts [port]
//
// Emulates the REST surface tourny-lite uses:
//   GET  /api/sessions                     → session list + status
//   GET  /api/sessions/{session}           → one session's status
//   POST /api/sessions                     → create + start a session
//   POST  /api/sessions/{session}/start|stop|restart|logout
//   GET  /api/{session}/auth/qr            → pairing QR (Base64File)
//   GET  /api/{session}/groups             → groups the account joined
//   POST  /api/{session}/groups/refresh    → re-sync + logged
//   GET  /api/sessions/{session}/me        → the connected account
//   POST /api/sendText / POST /api/sendImage
//   POST /__mock/scan                      (test-only: complete pairing)
//   POST /__mock/fail                      (test-only failure injection)
// Auth mirrors the real server's two styles: the X-Api-Key header,
// or basic auth (mock-user / mock-pass — override with
// MOCK_BASIC_USER / MOCK_BASIC_PASS). Groups come back in the gows
// (Go core — the *-arm images) field shape: { JID, Name,
// Participants }; one group is unnamed to prove the name falls back
// to its id. Sent messages land in ./waha-mock.log as JSON lines:
//   { kind: 'text',  ... text }
//   { kind: 'image', ... caption, mime, filename, imageBytes }
//   { kind: 'refresh', ... session }   (groups refresh probe)

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { appendFileSync } from 'node:fs'

const PORT = Number(process.argv[2] ?? 3001)
const API_KEY = process.env.MOCK_API_KEY ?? 'test-key-123'
const BASIC_USER = process.env.MOCK_BASIC_USER ?? 'mock-user'
const BASIC_PASS = process.env.MOCK_BASIC_PASS ?? 'mock-pass'

interface MockSession {
  name: string
  status: string
  engine: { engine: string }
  /** Whether the WhatsApp account is paired — a paired session
 *   comes back WORKING on start; an unpaired one waits for a QR. */
  paired: boolean
}

const SESSIONS: MockSession[] = [
  { name: 'default', status: 'WORKING', engine: { engine: 'GOWS' }, paired: true },
  { name: 'backup', status: 'STOPPED', engine: { engine: 'GOWS' }, paired: true },
]
const GROUPS = [
  // gows shape: JID / Name / Participants
  { JID: '1203630abcdef123456789@g.us', Name: 'Math Competition 2026 — Results', Participants: [] },
  { JID: '1203630zzzzzz999888777@g.us', Name: 'M&E Coordinators', Participants: [] },
  { JID: '1203630yyyyyy444555666@g.us', Name: '', Participants: [] },
]

// A real 1×1 transparent PNG — the pairing QR's stand-in.
const QR_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

// Test-only failure injection: { path, times, status? } — the next
// `times` calls to `path` fail with `status` (default 500). Used by
// the suite to prove the text-fallback path.
const failures = new Map<string, { times: number; status: number }>()

function authorized(req: IncomingMessage): boolean {
  if (req.headers['x-api-key'] === API_KEY) return true
  const auth = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization
  if (auth?.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8')
    return decoded === `${BASIC_USER}:${BASIC_PASS}`
  }
  return false
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

  // Test-only: restore the initial session state — the mock is a
  // long-lived process, the suite creates sessions as it runs.
  if (req.method === 'POST' && url.pathname === '/__mock/reset') {
    SESSIONS.length = 0
    SESSIONS.push(
      { name: 'default', status: 'WORKING', engine: { engine: 'GOWS' }, paired: true },
      { name: 'backup', status: 'STOPPED', engine: { engine: 'GOWS' }, paired: true },
    )
    failures.clear()
    json(res, 200, { ok: true })
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

  if (req.method === 'POST' && url.pathname === '/api/sessions') {
    const body = await readBody(req)
    const name = String(body.name ?? '').trim()
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) {
      json(res, 400, { message: 'name is required (letters, digits, - and _)' })
      return
    }
    if (SESSIONS.some((s) => s.name === name)) {
      json(res, 409, { message: `Session "${name}" already exists` })
      return
    }
    const created: MockSession = {
      name,
      status: body.start === false ? 'STOPPED' : 'SCAN_QR_CODE',
      engine: { engine: 'GOWS' },
      paired: false,
    }
    SESSIONS.push(created)
    json(res, 201, created)
    return
  }

  // Test-only: complete a pending pairing ("the phone scanned").
  if (req.method === 'POST' && url.pathname === '/__mock/scan') {
    const body = await readBody(req)
    const target = SESSIONS.find((s) => s.name === body.session)
    if (!target) {
      json(res, 404, { message: `Session "${body.session}" not found` })
      return
    }
    target.paired = true
    target.status = 'WORKING'
    json(res, 200, target)
    return
  }

  const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/)
  if (req.method === 'GET' && sessionMatch) {
    const session = decodeURIComponent(sessionMatch[1])
    const found = SESSIONS.find((s) => s.name === session)
    if (!found) {
      json(res, 404, { message: `Session "${session}" not found` })
      return
    }
    json(res, 200, found)
    return
  }

  const lifecycleMatch = url.pathname.match(
    /^\/api\/sessions\/([^/]+)\/(start|stop|restart|logout)$/
  )
  if (req.method === 'POST' && lifecycleMatch) {
    const session = decodeURIComponent(lifecycleMatch[1])
    const action = lifecycleMatch[2]
    const found = SESSIONS.find((s) => s.name === session)
    if (!found) {
      json(res, 404, { message: `Session "${session}" not found` })
      return
    }
    if (action === 'stop') {
      found.status = 'STOPPED'
    } else if (action === 'logout') {
      found.paired = false
      found.status = 'STOPPED'
    } else {
      // start / restart — a paired account reconnects at once, an
      // unpaired one waits for its QR scan.
      found.status = found.paired ? 'WORKING' : 'SCAN_QR_CODE'
    }
    json(res, 201, found)
    return
  }

  const meMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/me$/)
  if (req.method === 'GET' && meMatch) {
    const session = decodeURIComponent(meMatch[1])
    const found = SESSIONS.find((s) => s.name === session)
    if (!found) {
      json(res, 404, { message: `Session "${session}" not found` })
      return
    }
    if (found.status !== 'WORKING') {
      json(res, 500, { message: 'Session is not WORKING' })
      return
    }
    json(res, 200, { id: '94771234567@c.us', pushName: 'Tourny WAHA Mock' })
    return
  }

  const qrMatch = url.pathname.match(/^\/api\/([^/]+)\/auth\/qr$/)
  if (req.method === 'GET' && qrMatch) {
    const session = decodeURIComponent(qrMatch[1])
    const found = SESSIONS.find((s) => s.name === session)
    if (!found) {
      json(res, 404, { message: `Session "${session}" not found` })
      return
    }
    // Only a session waiting for its scan offers a QR — matching
    // the real server, which 404s/500s otherwise.
    if (found.status !== 'SCAN_QR_CODE') {
      json(res, 404, { message: 'QR code is not available' })
      return
    }
    json(res, 200, { mimetype: 'image/png', data: QR_PNG_BASE64 })
    return
  }

  const refreshMatch = url.pathname.match(/^\/api\/([^/]+)\/groups\/refresh$/)
  if (req.method === 'POST' && refreshMatch) {
    const session = decodeURIComponent(refreshMatch[1])
    const found = SESSIONS.find((s) => s.name === session)
    if (!found) {
      json(res, 404, { message: `Session "${session}" not found` })
      return
    }
    appendFileSync(
      new URL('./waha-mock.log', import.meta.url).pathname,
      JSON.stringify({ kind: 'refresh', at: new Date().toISOString(), session }) + '\n'
    )
    json(res, 201, { ok: true })
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
  console.log(`WAHA mock listening on http://localhost:${PORT} (X-Api-Key: ${API_KEY} / basic: ${BASIC_USER})`)
  console.log(`Sessions: ${SESSIONS.map((s) => `${s.name}=${s.status}`).join(', ')}`)
})
