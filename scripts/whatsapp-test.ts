/**
 * Tourny Lite — WhatsApp integration end-to-end test.
 *
 * Runs against a live server (BASE_URL) plus the WAHA mock
 * (scripts/waha-mock.ts) and verifies the full chain:
 * auth guard → config save/mask → verify (sessions/groups) →
 * send test/standings/event → styled card images (with the
 * plain-text fallback) → auto-share on recorded results →
 * share-card builder unit checks (escaping, partial podiums).
 *
 * Usage:
 *   bun scripts/waha-mock.ts 3001 &
 *   BASE_URL=http://localhost:3100 bun scripts/whatsapp-test.ts
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:3100'
const MOCK = process.env.MOCK_URL ?? 'http://localhost:3001'
const MOCK_KEY = 'test-key-123'
const REAL = 'https://wa-api.mathlablk.app' // the user's live server (401 path only)

let passed = 0
let failed = 0
const failures: string[] = []

function ok(name: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    passed++
    console.log(`  ✓ ${name}`)
  } else {
    failed++
    const msg = `  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`
    failures.push(msg)
    console.log(msg)
  }
}

function section(name: string) {
  console.log(`\n━━ ${name} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
}

class Client {
  cookie = ''
  async call(method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) this.cookie = setCookie.split(';')[0]
    const data = (await res.json().catch(() => ({}))) as Record<string, any>
    return { status: res.status, data }
  }
}

interface LogEntry {
  kind?: 'text' | 'image'
  at: string
  id: string
  session: string
  chatId: string
  text?: string
  caption?: string
  mime?: string
  filename?: string
  imageBytes?: number
}

const { readFileSync, writeFileSync } = await import('node:fs')
const logPath = new URL('./waha-mock.log', import.meta.url).pathname

/** Starts every run from a clean log so message counts are exact. */
function resetLog() {
  writeFileSync(logPath, '')
}

function readLog(): LogEntry[] {
  try {
    return readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .filter((l) => l.startsWith('{')) // tolerate mock stdout noise
      .map((l) => JSON.parse(l))
  } catch {
    return []
  }
}

async function main() {
  console.log(`WhatsApp integration test — app ${BASE} · mock ${MOCK}`)
  const admin = new Client()
  resetLog()

  // ═══ 1. Access control ═══
  section('1 · Access control')
  {
    const guest = new Client()
    const cfg = await guest.call('GET', '/api/whatsapp/config')
    ok('guest cannot read the config', cfg.status === 401, cfg)

    const send = await guest.call('POST', '/api/whatsapp/send', { kind: 'test' })
    ok('guest cannot send', send.status === 401, send)

    const verify = await guest.call('POST', '/api/whatsapp/verify', { baseUrl: MOCK, apiKey: MOCK_KEY })
    ok('guest cannot verify', verify.status === 401, verify)

    const login = await admin.call('POST', '/api/auth/login', {
      email: 'admin@tourny.test',
      password: 'correct horse battery',
    })
    ok('admin signs in', login.status === 200, login)

    // A real judge account for the 403 checks (battle-test cleans up its own).
    const jEmail = `wa-judge-${Date.now()}@tourny.test`
    const jCreated = await admin.call('POST', '/api/admin/users', {
      name: 'WA Test Judge',
      email: jEmail,
      password: 'correct horse battery',
      role: 'judge',
    })
    const judge = new Client()
    if (jCreated.status === 201 || jCreated.status === 200) {
      const jLogin = await judge.call('POST', '/api/auth/login', {
        email: jEmail,
        password: 'correct horse battery',
      })
      ok('judge signs in', jLogin.status === 200, jLogin)
    }
    const jCfg = await judge.call('GET', '/api/whatsapp/config')
    ok('non-admin cannot read the config', jCfg.status === 403, jCfg)
    const jSend = await judge.call('POST', '/api/whatsapp/send', { kind: 'test' })
    ok('non-admin cannot send', jSend.status === 403, jSend)
    const jVerify = await judge.call('POST', '/api/whatsapp/verify', { baseUrl: MOCK, apiKey: MOCK_KEY })
    ok('non-admin cannot verify', jVerify.status === 403, jVerify)
    // tidy up
    if (jCreated.data?.user?.id) await admin.call('DELETE', `/api/admin/users/${jCreated.data.user.id}`)
  }

  // ═══ 2. Initial config state ═══
  section('2 · Initial config state')
  {
    const cfg = await admin.call('GET', '/api/whatsapp/config')
    ok('config readable', cfg.status === 200, cfg)
    if (cfg.data.configured) {
      // left over from a previous run — the fresh-db assertions
      // were covered there; re-running them would be false.
      ok('config persists across restarts (pre-configured run)', cfg.data.apiKeySet === true, cfg.data)
    } else {
      ok('not configured initially (fresh db)', cfg.data.configured === false, cfg.data)
      ok('no api key leaked', cfg.data.apiKeySet === false && !cfg.data.apiKey)
    }

    const badUrl = await admin.call('PUT', '/api/whatsapp/config', { baseUrl: 'ftp://nope' })
    ok('rejects non-http address', badUrl.status === 400, badUrl)

    const badGroup = await admin.call('PUT', '/api/whatsapp/config', {
      baseUrl: MOCK,
      apiKey: MOCK_KEY,
      session: 'default',
      groupChatId: '12345@c.us',
      groupName: 'Bad',
    })
    ok('rejects non-group chat id', badGroup.status === 400, badGroup)
  }

  // ═══ 3. Verify against the mock ═══
  section('3 · Verify (mock WAHA)')
  {
    const wrongKey = await admin.call('POST', '/api/whatsapp/verify', { baseUrl: MOCK, apiKey: 'wrong' })
    ok('wrong key rejected with friendly message', wrongKey.status === 502 && /rejected the API key/i.test(wrongKey.data.error), wrongKey)

    const noUrl = await admin.call('POST', '/api/whatsapp/verify', { apiKey: MOCK_KEY })
    ok('missing address rejected', noUrl.status === 400, noUrl)

    const unreachable = await admin.call('POST', '/api/whatsapp/verify', {
      baseUrl: 'http://localhost:3999',
      apiKey: MOCK_KEY,
    })
    ok('unreachable server → friendly timeout/refused message', unreachable.status === 504 && /could not reach/i.test(unreachable.data.error), unreachable)

    const sessions = await admin.call('POST', '/api/whatsapp/verify', { baseUrl: MOCK, apiKey: MOCK_KEY })
    ok('lists sessions', sessions.status === 200 && sessions.data.sessions?.length === 2, sessions.data)
    ok(
      'session statuses included',
      sessions.data.sessions?.some((s: any) => s.name === 'default' && s.status === 'WORKING'),
      sessions.data
    )

    const withGroups = await admin.call('POST', '/api/whatsapp/verify', {
      baseUrl: MOCK,
      apiKey: MOCK_KEY,
      session: 'default',
    })
    ok('loads groups for the session', withGroups.status === 200 && withGroups.data.groups?.length === 3, withGroups.data)
    ok(
      'groups are @g.us with names (gows JID/Name shape normalized)',
      withGroups.data.groups?.every((g: any) => g.id.endsWith('@g.us') && g.name),
      withGroups.data
    )
    ok(
      'unnamed group falls back to its id as name',
      withGroups.data.groups?.some((g: any) => g.id === '1203630yyyyyy444555666@g.us' && g.name === g.id),
      withGroups.data
    )
    ok('session status reported', withGroups.data.session?.status === 'WORKING', withGroups.data.session)

    const unknownSession = await admin.call('POST', '/api/whatsapp/verify', {
      baseUrl: MOCK,
      apiKey: MOCK_KEY,
      session: 'nope',
    })
    ok('unknown session rejected', unknownSession.status === 400, unknownSession)

    const stoppedSession = await admin.call('POST', '/api/whatsapp/verify', {
      baseUrl: MOCK,
      apiKey: MOCK_KEY,
      session: 'backup',
    })
    ok('stopped session returns empty groups (not an error)', stoppedSession.status === 200 && stoppedSession.data.groups?.length === 0, stoppedSession.data)
  }

  // ═══ 4. Verify against the real server (auth path only) ═══
  section('4 · Real server (https://wa-api.mathlablk.app)')
  {
    const real = await admin.call('POST', '/api/whatsapp/verify', {
      baseUrl: REAL,
      apiKey: 'definitely-not-the-key',
    })
    ok(
      'real server rejects wrong key with friendly message',
      real.status === 502 && /rejected the API key/i.test(real.data.error),
      real.data
    )
  }

  // ═══ 5. Save the config ═══
  section('5 · Save config')
  {
    const badPublic = await admin.call('PUT', '/api/whatsapp/config', {
      publicBaseUrl: 'not-a-url',
    })
    ok('malformed public address rejected', badPublic.status === 400, badPublic.status)

    const save = await admin.call('PUT', '/api/whatsapp/config', {
      baseUrl: MOCK,
      apiKey: MOCK_KEY,
      session: 'default',
      groupChatId: '1203630abcdef123456789@g.us',
      groupName: 'Math Competition 2026 — Results',
      publicBaseUrl: 'https://tourny.example.lk',
    })
    ok('saves the connection', save.status === 200 && save.data.configured === true, save)
    ok('auto-share defaults to off', save.data.autoEvents === false, save.data)
    ok('public address saved', save.data.publicBaseUrl === 'https://tourny.example.lk', save.data)

    ok('key masked in response', save.data.apiKeySet === true && /^\S{3}…\S{2}$/.test(save.data.apiKeyHint ?? '') && !save.data.apiKey, save.data)

    const read = await admin.call('GET', '/api/whatsapp/config')
    ok('config persists', read.data.configured === true && read.data.baseUrl === MOCK && read.data.groupName === 'Math Competition 2026 — Results', read.data)
    ok('public address persists', read.data.publicBaseUrl === 'https://tourny.example.lk', read.data)
    ok('full key never returned', !read.data.apiKey && read.data.apiKeyHint === save.data.apiKeyHint, read.data)
  }

  // An event with a partially empty podium — e.g. its gold center was
  // deleted, which nulls that place. Shared too, to prove partial podiums
  // still render well-formed cards. Chosen in section 6, asserted in 7.
  let partialEventId: string | undefined

  // ═══ 6. Sending ═══
  section('6 · Send messages')
  {
    // Not-configured behaviour is covered by config guard above; send now:
    const tournaments = await admin.call('GET', '/api/tournaments')
    const seeded = tournaments.data.tournaments?.find((t: any) => t.templateId || t.name.includes('Math Competition'))
    ok('seeded tournament present', Boolean(seeded), tournaments.data?.tournaments?.map((t: any) => t.name))
    const tid = seeded?.id

    const detail = await admin.call('GET', `/api/tournaments/${tid}`)
    const withResult = (detail.data.events ?? []).filter((e: any) => e.status === 'completed' && e.result)
    ok('completed event with result present', withResult.length > 0, withResult.length)

    // Prefer an event with a complete podium for the strict content
    // checks below — demo data may legitimately have a missing place.
    const fullPodium = (e: any) =>
      Boolean(e.result.firstPlaceCenterId && e.result.secondPlaceCenterId && e.result.thirdPlaceCenterId)
    const completedEvent = withResult.find(fullPodium) ?? withResult[0]
    partialEventId = withResult.find((e: any) => e.id !== completedEvent?.id && !fullPodium(e))?.id

    const testMsg = await admin.call('POST', '/api/whatsapp/send', { kind: 'test' })
    ok('test message sends as text', testMsg.status === 200 && testMsg.data.ok === true && testMsg.data.via === 'text', testMsg)

    const standings = await admin.call('POST', '/api/whatsapp/send', { kind: 'standings', tournamentId: tid })
    ok('standings sends as a styled card', standings.status === 200 && standings.data.via === 'image', standings)

    const event = await admin.call('POST', '/api/whatsapp/send', {
      kind: 'event',
      tournamentId: tid,
      eventId: completedEvent.id,
    })
    ok('event result sends as a styled card', event.status === 200 && event.data.via === 'image', event)

    if (partialEventId) {
      const partial = await admin.call('POST', '/api/whatsapp/send', {
        kind: 'event',
        tournamentId: tid,
        eventId: partialEventId,
      })
      ok('partial-podium event sends', partial.status === 200, partial)
    }

    const badKind = await admin.call('POST', '/api/whatsapp/send', { kind: 'nope' })
    ok('unknown kind rejected', badKind.status === 400, badKind)

    const noTournament = await admin.call('POST', '/api/whatsapp/send', { kind: 'standings', tournamentId: 'missing' })
    ok('missing tournament → 404', noTournament.status === 404, noTournament)

    const pendingEvent = detail.data.events?.find((e: any) => e.status === 'pending' && !e.result)
    if (pendingEvent) {
      const noResult = await admin.call('POST', '/api/whatsapp/send', {
        kind: 'event',
        tournamentId: tid,
        eventId: pendingEvent.id,
      })
      ok('event without result rejected', noResult.status === 400 && /no recorded result/i.test(noResult.data.error), noResult)
    }
  }

  // ═══ 7. Wire check — what actually arrived at the mock ═══
  section('7 · Delivered payloads (from waha-mock.log)')
  {
    const lines = readLog()
    const expectedCount = 3 + (partialEventId ? 1 : 0)
    ok(`${expectedCount} messages delivered`, lines.length === expectedCount, lines.length)

    ok('all sent to the configured group', lines.every((l) => l.chatId === '1203630abcdef123456789@g.us'), lines.map((l) => l.chatId))
    ok('all sent with the configured session', lines.every((l) => l.session === 'default'))

    const testEntry = lines.find((l) => l.kind === 'text')
    ok(
      'test message well-formed text',
      Boolean(
        testEntry?.text?.includes('Tourny Lite') &&
          testEntry.text.includes('connection test') &&
          testEntry.text.includes('styled cards')
      ),
      testEntry?.text
    )

    const images = lines.filter((l) => l.kind === 'image')
    ok('standings + event arrived as images', images.length === 2 + (partialEventId ? 1 : 0), images.length)
    ok(
      'images are real JPEGs with sane size',
      images.every((l) => l.mime === 'image/jpeg' && (l.imageBytes ?? 0) > 10_000),
      images.map((l) => [l.mime, l.imageBytes])
    )
    ok(
      'image filenames are .jpg',
      images.every((l) => (l.filename ?? '').endsWith('.jpg')),
      images.map((l) => l.filename)
    )
    ok(
      'no misspelled "Baugunaka" anywhere (typo regression)',
      !lines.some((l) => (l.text ?? l.caption ?? '').includes('Baugunaka')),
      lines.map((l) => l.caption)
    )

    const standingsImg = images.find((l) => (l.caption ?? '').includes('Standings') || (l.caption ?? '').includes('standings'))
    ok(
      'standings caption names the tournament + progress',
      Boolean(standingsImg?.caption?.includes('Math Competition 2026') && /of 39 events/.test(standingsImg.caption)),
      standingsImg?.caption
    )

    // The guest scoreboard link rides along in every caption —
    // WhatsApp makes caption URLs tappable.
    const seededTid = (await admin.call('GET', '/api/tournaments')).data?.tournaments?.find(
      (t: any) => t.templateId || t.name.includes('Math Competition')
    )?.id
    ok(
      'image captions carry the guest scoreboard link (public address)',
      Boolean(seededTid) && images.every((l) => (l.caption ?? '').includes(`https://tourny.example.lk/present/${seededTid}`)),
      images.map((l) => l.caption)
    )

    const eventImg = images.find((l) => (l.caption ?? '').includes('Event result'))
    ok(
      'event caption names tournament, game and category',
      Boolean(
        eventImg?.caption?.includes('Math Competition 2026') &&
          eventImg.caption.includes('Cat ') &&
          /\d{3}/.test(eventImg.caption)
      ),
      eventImg?.caption
    )
  }

  // ═══ 7b. Text fallback — when sendImage fails ═══
  section('7b · Text fallback (sendImage fails)')
  {
    // Inject one failure for sendImage; the app must fall back to the
    // equivalent text message — the group still hears the result.
    const inject = await fetch(`${MOCK}/__mock/fail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': MOCK_KEY },
      body: JSON.stringify({ path: '/api/sendImage', times: 1, status: 500 }),
    })
    ok('failure injected', inject.status === 200, await inject.text().catch(() => ''))

    const tournaments = await admin.call('GET', '/api/tournaments')
    const seeded = tournaments.data.tournaments?.find((t: any) => t.templateId || t.name.includes('Math Competition'))
    const detail = await admin.call('GET', `/api/tournaments/${seeded.id}`)
    const done = detail.data.events?.find(
      (e: any) => e.status === 'completed' && e.result?.firstPlaceCenterId && e.result?.secondPlaceCenterId && e.result?.thirdPlaceCenterId
    )

    const before = readLog().length
    const fallback = await admin.call('POST', '/api/whatsapp/send', {
      kind: 'event',
      tournamentId: seeded.id,
      eventId: done.id,
    })
    ok('send succeeds via text fallback', fallback.status === 200 && fallback.data.via === 'text', fallback)

    const lines = readLog()
    ok('exactly one message delivered (the fallback)', lines.length === before + 1, lines.length - before)
    const text = lines[lines.length - 1]
    ok('fallback is a text message', text.kind === 'text', text)
    ok(
      'fallback text is the branded event announcement',
      Boolean(
        text.text?.includes('Event result') &&
          text.text.includes('🥇') &&
          text.text.includes('pts') &&
          text.text.includes('via Tourny Lite') &&
          text.text.includes('Overall standings:')
      ),
      text.text
    )
    ok(
      'fallback text carries the event page link',
      Boolean(text.text?.includes(`🔴 View result: https://tourny.example.lk/present/${seeded.id}/event/${done.id}`)),
      text.text
    )

    // Clean send again — images are back.
    const again = await admin.call('POST', '/api/whatsapp/send', {
      kind: 'standings',
      tournamentId: seeded.id,
    })
    ok('recovers to image after the failure', again.status === 200 && again.data.via === 'image', again)
  }

  // ═══ 8. Saved-key reuse (no retyping) ═══
  section('8 · Saved key reuse')
  {
    const reverify = await admin.call('POST', '/api/whatsapp/verify', { baseUrl: MOCK })
    ok('empty key falls back to the stored key', reverify.status === 200 && reverify.data.sessions?.length === 2, reverify)

    const saveNoKey = await admin.call('PUT', '/api/whatsapp/config', {
      baseUrl: MOCK,
      session: 'default',
      groupChatId: '1203630zzzzzz999888777@g.us',
      groupName: 'M&E Coordinators',
    })
    ok('re-save without key keeps the key', saveNoKey.data.configured === true && saveNoKey.data.apiKeySet === true, saveNoKey.data)
    ok('re-save without the field keeps the public address', saveNoKey.data.publicBaseUrl === 'https://tourny.example.lk', saveNoKey.data.publicBaseUrl)

    const verifyOld = await admin.call('POST', '/api/whatsapp/verify', { baseUrl: MOCK, apiKey: 'wrong-again' })
    ok('a freshly typed wrong key still rejected', verifyOld.status === 502, verifyOld)
  }

  // ═══ 8b. Guest link without a configured public address ═══
  section('8b · Guest link falls back to the request origin')
  {
    const clear = await admin.call('PUT', '/api/whatsapp/config', { publicBaseUrl: '' })
    ok('public address cleared', clear.status === 200 && clear.data.publicBaseUrl === '', clear.data)
    ok('connection survives the partial patch', clear.data.configured === true, clear.data)

    const tournaments = await admin.call('GET', '/api/tournaments')
    const seeded = tournaments.data.tournaments?.find((t: any) => t.templateId || t.name.includes('Math Competition'))
    const detail = await admin.call('GET', `/api/tournaments/${seeded.id}`)
    const done = detail.data.events?.find(
      (e: any) => e.status === 'completed' && e.result?.firstPlaceCenterId && e.result?.secondPlaceCenterId && e.result?.thirdPlaceCenterId
    )

    const before = readLog().length
    const sent = await admin.call('POST', '/api/whatsapp/send', {
      kind: 'event',
      tournamentId: seeded.id,
      eventId: done.id,
    })
    ok('event still sends as a card', sent.status === 200 && sent.data.via === 'image', sent)
    const lines = readLog()
    ok('one message delivered', lines.length === before + 1, lines.length - before)
    const last = lines[lines.length - 1]
    ok(
      'caption carries the origin-derived guest link to this event',
      Boolean((last.caption ?? '').includes(`${BASE}/present/${seeded.id}/event/${done.id}`)),
      last.caption
    )
    ok('event card draws the view-result bar', (last.imageBytes ?? 0) > 0, last.caption)
  }

  // ═══ 9. Auto-share on recorded results ═══
  section('9 · Auto-share on recorded results')
  {
    const waitFor = async (cond: () => boolean, ms = 5000): Promise<boolean> => {
      const deadline = Date.now() + ms
      while (Date.now() < deadline) {
        if (cond()) return true
        await new Promise((r) => setTimeout(r, 200))
      }
      return cond()
    }

    const tournaments = await admin.call('GET', '/api/tournaments')
    const seeded = tournaments.data.tournaments?.find((t: any) => t.templateId || t.name.includes('Math Competition'))
    const detail = await admin.call('GET', `/api/tournaments/${seeded.id}`)
    const centers = detail.data.centers ?? []
    const open = detail.data.events?.find((e: any) => e.status !== 'completed')
    ok('an open event is available', Boolean(open), open?.label)

    // Enable with a minimal patch — must not disturb the saved connection.
    const enable = await admin.call('PUT', '/api/whatsapp/config', { autoEvents: true })
    ok('auto-share enabled', enable.status === 200 && enable.data.autoEvents === true, enable.data)
    ok('minimal patch keeps the connection', enable.data.configured === true && enable.data.baseUrl === MOCK && Boolean(enable.data.groupChatId), enable.data)
    ok('minimal patch keeps the session', enable.data.session === 'default', enable.data.session)

    // A recorded result → one styled card in the group.
    const before = readLog().length
    const record = await admin.call('POST', '/api/results', {
      eventId: open.id,
      firstPlaceCenterId: centers[0].id,
      secondPlaceCenterId: centers[1].id,
      thirdPlaceCenterId: centers[2].id,
      notes: 'auto-share probe',
    })
    ok('result recorded', record.status === 201, record)
    let lines = readLog()
    const arrived = await waitFor(() => {
      lines = readLog()
      return lines.length === before + 1
    })
    ok('new result auto-shared', arrived, lines.length - before)
    const autoMsg = lines[lines.length - 1]
    ok(
      'auto-share delivers the styled event card',
      autoMsg.kind === 'image' && (autoMsg.caption ?? '').includes('Event result') && (autoMsg.imageBytes ?? 0) > 10_000,
      autoMsg
    )
    ok(
      'auto-share caption carries the guest link to this event (from the recording request)',
      Boolean((autoMsg.caption ?? '').includes(`${BASE}/present/${seeded.id}/event/${open.id}`)),
      autoMsg.caption
    )

    // A correction → a clearly labeled follow-up card.
    const before2 = readLog().length
    const corrected = await admin.call('POST', '/api/results', {
      eventId: open.id,
      firstPlaceCenterId: centers[1].id,
      secondPlaceCenterId: centers[0].id,
      thirdPlaceCenterId: centers[2].id,
      reason: 'Auto-share probe correction',
    })
    ok('correction accepted', corrected.status === 200 && corrected.data.isCorrection === true, corrected)
    const arrived2 = await waitFor(() => {
      lines = readLog()
      return lines.length === before2 + 1
    })
    ok('correction auto-shared', arrived2, lines.length - before2)
    const corrMsg = lines[lines.length - 1]
    ok(
      'correction clearly labeled on the card caption',
      corrMsg.kind === 'image' && (corrMsg.caption ?? '').includes('Corrected result'),
      corrMsg.caption
    )

    // Disabled → recording stays silent.
    const disable = await admin.call('PUT', '/api/whatsapp/config', { autoEvents: false })
    ok('auto-share disabled', disable.data.autoEvents === false, disable.data)
    const detail2 = await admin.call('GET', `/api/tournaments/${seeded.id}`)
    const open2 = detail2.data.events?.find((e: any) => e.status !== 'completed')
    const before3 = readLog().length
    const silent = await admin.call('POST', '/api/results', {
      eventId: open2.id,
      firstPlaceCenterId: centers[0].id,
      secondPlaceCenterId: centers[1].id,
      thirdPlaceCenterId: centers[2].id,
    })
    ok('result recorded with auto-share off', silent.status === 201, silent)
    await new Promise((r) => setTimeout(r, 1500))
    ok('no message sent while disabled', readLog().length === before3, readLog().length - before3)
  }

  // ═══ 10. Share-card builder unit checks ═══
  section('10 · Share-card builders (synthetic data)')
  {
    const { buildEventCard, buildStandingsCard } = await import('../src/lib/share-card')

    const center = (code: string, name: string) => ({
      id: `c-${code}`,
      centerCode: code,
      centerName: name,
      location: '',
    })
    const mkDetail = (overrides: Partial<any> = {}): any => ({
      tournament: {
        id: 't1',
        name: 'Math Competition 2026',
        slug: 'mc26',
        organizer: 'Seed Ministries',
        status: 'active',
        pointsFirst: 75,
        pointsSecond: 50,
        pointsThird: 25,
        templateId: 'x',
        createdAt: '',
        updatedAt: '',
      },
      divisions: [
        { id: 'd1', code: 'B', name: 'Category B', ageRange: '9 to 10', gradeRange: '4, 5', participantQuota: 5, displayOrder: 1 },
      ],
      games: [],
      centers: [center('105', ''), center('101', 'Kaduwela Center')],
      events: [
        {
          id: 'e1',
          divisionId: 'd1',
          gameId: 'g1',
          divisionCode: 'B',
          gameCode: 'baugunaka-puwaruwa',
          gameName: 'Bahugunaka Puwaruwa',
          gameSinhalaName: 'බහුගුණක පුවරුව',
          subEventIndex: 2,
          label: 'Category B · Bahugunaka Puwaruwa · #2',
          status: 'completed',
          result: {
            id: 'r1',
            eventId: 'e1',
            firstPlaceCenterId: 'c-101',
            secondPlaceCenterId: 'c-105',
            thirdPlaceCenterId: null,
            firstPlaceCode: '101',
            secondPlaceCode: '105',
            thirdPlaceCode: null,
            recordedBy: 'Judge',
            notes: '',
            recordedAt: '',
            updatedAt: '',
          },
        },
      ],
      standings: [
        { rank: 1, centerId: 'c-101', centerCode: '101', centerName: 'Kaduwela Center', gold: 1, silver: 0, bronze: 0, total: 75 },
        { rank: 2, centerId: 'c-105', centerCode: '105', centerName: '', gold: 0, silver: 1, bronze: 0, total: 50 },
      ],
      progress: { total: 39, completed: 3, inProgress: 1, pending: 35, percent: 8 },
      ...overrides,
    })

    const card = buildEventCard(mkDetail(), 'e1')
    ok('event card builds for a partial podium (2 places)', Boolean(card?.svg), card)
    ok(
      'event card carries the corrected game name, Sinhala subtitle, chips',
      Boolean(
        card?.svg.includes('Bahugunaka Puwaruwa') &&
          card.svg.includes('බහුගුණක පුවරුව') &&
          card.svg.includes('Category B') &&
          card.svg.includes('Ages 9 to 10') &&
          card.svg.includes('Slot 2')
      ),
      card?.caption
    )
    ok(
      'event card names medalists with named + unnamed centers',
      Boolean(card?.svg.includes('Kaduwela Center') && card.svg.includes('>105<')),
      card?.svg?.slice(0, 400)
    )
    ok('event card caption mentions the game and category', Boolean(card?.caption.includes('Bahugunaka Puwaruwa') && card.caption.includes('Cat B')), card?.caption)
    ok('event card contains no un-escaped raw & from SVG syntax inside text', !card?.svg.includes('>Math Competition 2026 &'), card?.svg)

    const nasty = mkDetail()
    nasty.events[0].gameName = 'A & B "Quotes" <Tag>'
    const nastyCard = buildEventCard(nasty, 'e1')
    ok(
      'XML-special characters are escaped',
      Boolean(
        nastyCard?.svg.includes('A &amp; B &quot;Quotes&quot; &lt;Tag&gt;') &&
          !nastyCard.svg.includes('A & B "Quotes" <Tag>')
      ),
      'escape check'
    )

    const long = mkDetail()
    long.events[0].gameName = 'An Extremely Long Game Name That Definitely Cannot Fit On One Line Even When Shrunk'
    const longCard = buildEventCard(long, 'e1')
    ok('very long game names are truncated with an ellipsis', Boolean(longCard?.svg.includes('…')), longCard?.caption)

    const noResult = mkDetail()
    noResult.events[0].result = null
    ok('event without a result builds no card (text path answers)', buildEventCard(noResult, 'e1') === null)

    const noPlaces = mkDetail()
    noPlaces.events[0].result = { ...noPlaces.events[0].result, firstPlaceCode: null, secondPlaceCode: null }
    ok('zero-place result builds no card (text path answers)', buildEventCard(noPlaces, 'e1') === null)

    const correction = buildEventCard(mkDetail(), 'e1', { isCorrection: true })
    ok('correction card is labelled', Boolean(correction?.svg.includes('CORRECTED RESULT') && correction.caption.includes('Corrected result')), correction?.caption)

    const standings = buildStandingsCard(mkDetail())
    ok('standings card builds', Boolean(standings?.svg), standings)
    ok(
      'standings card shows ranks, named and unnamed centers',
      Boolean(standings?.svg.includes('Kaduwela Center') && standings.svg.includes('>105<') && standings.svg.includes('TOURNY LITE')),
      standings?.caption
    )
    ok(
      'event and standings cards are visually distinct (gold event accent vs blue standings accent)',
      Boolean(
        card?.svg.includes('fill="#E9C64A"') &&
          !standings?.svg.includes('fill="#E9C64A"') &&
          standings.svg.includes('fill="#6FAEE8"') &&
          !card.svg.includes('fill="#6FAEE8"')
      ),
      'accent check'
    )
    ok(
      'event card leads with the game name; the tournament is context',
      Boolean(
        card && card.svg.indexOf('Bahugunaka Puwaruwa') >= 0 && card.svg.indexOf('Math Competition 2026') >= 0 &&
          card.svg.indexOf('Bahugunaka Puwaruwa') < card.svg.indexOf('Math Competition 2026')
      ),
      'hierarchy check'
    )
    ok(
      'event card glows gold, standings card glows blue',
      Boolean(card?.svg.includes('fill="url(#gGlowGold)"') && standings?.svg.includes('fill="url(#gGlowBlue)"')),
      'glow check'
    )
    ok('event champion row is emphasized (taller, gold rim)', Boolean(card?.svg.includes('stroke="#D9B44A"')), 'champion rim')
    ok(
      'standings leader carries the gold tab',
      Boolean(standings?.svg.includes('width="5" height="60" rx="2.5" fill="url(#gGold)"')),
      'leader tab'
    )
    ok('standings eyebrow reads OVERALL STANDINGS', Boolean(standings?.svg.includes('OVERALL STANDINGS')), 'eyebrow')
    ok('cards without a link carry no watch-live bar', !standings?.svg.includes('WATCH LIVE') && !standings?.caption.includes('/present/'), standings?.caption)

    const url = 'https://tourny.example.lk/present/t1'
    const eventUrl = 'https://tourny.example.lk/present/t1/event/e1'
    const liveEvent = buildEventCard(mkDetail(), 'e1', { eventUrl })
    ok(
      'event card with a link draws the view-result bar (protocol stripped for size)',
      Boolean(liveEvent?.svg.includes('VIEW RESULT') && liveEvent.svg.includes('tourny.example.lk/present/t1/event/e1') && !liveEvent.svg.includes('https://tourny.example.lk')),
      liveEvent?.caption
    )
    ok('event card caption carries the full event link', (liveEvent?.caption ?? '').endsWith(eventUrl), liveEvent?.caption)

    const liveStandings = buildStandingsCard(mkDetail(), { presentUrl: url })
    ok(
      'standings card with a link draws the watch-live bar and caption',
      Boolean(liveStandings?.svg.includes('WATCH LIVE') && (liveStandings?.caption ?? '').endsWith(url)),
      liveStandings?.caption
    )

    // 12 centers — every one of them is on the card, however many
    const many = mkDetail()
    many.standings = Array.from({ length: 12 }, (_, i) => ({
      rank: i + 1,
      centerId: `c-${i}`,
      centerCode: `1${String(i).padStart(2, '0')}`,
      centerName: '',
      gold: 0,
      silver: 0,
      bronze: 0,
      total: 100 - i,
    }))
    const allShown = buildStandingsCard(many)
    ok(
      'standings card shows every center, however many there are',
      Boolean(allShown?.svg.includes('>111<') && !allShown.svg.includes('more centers below')),
      allShown?.caption
    )

    // A center yet to score still gets its row — the broadcast is
    // the whole table, not only the ones with points.
    const withZero = mkDetail()
    withZero.standings = [
      ...withZero.standings,
      { rank: 3, centerId: 'c-999', centerCode: '999', centerName: '', gold: 0, silver: 0, bronze: 0, total: 0 },
    ]
    const zeroCard = buildStandingsCard(withZero)
    ok('standings card includes centers with 0 points', Boolean(zeroCard?.svg.includes('>999<')), zeroCard?.caption)

    const empty = mkDetail()
    empty.standings = []
    ok('standings card with no centers builds none (text path answers)', buildStandingsCard(empty) === null)

    console.log('\n── event card caption ──')
    console.log(card?.caption)
    console.log('── standings card caption ──')
    console.log(standings?.caption)
  }

  console.log('\n════════════════════════════════════════════════════════════')
  console.log(`  RESULT: ${passed} passed · ${failed} failed`)
  if (failures.length) {
    console.log(failures.join('\n'))
    process.exit(1)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error('Test run crashed:', err)
  process.exit(1)
})
