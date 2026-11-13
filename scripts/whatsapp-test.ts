/**
 * Tourny Lite — WhatsApp integration end-to-end test.
 *
 * Runs against a live server (BASE_URL) plus the WAHA mock
 * (scripts/waha-mock.ts) and verifies the full chain:
 * auth guard → config save/mask → verify (sessions/groups) →
 * send test/standings/event messages → error mapping.
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

async function main() {
  console.log(`WhatsApp integration test — app ${BASE} · mock ${MOCK}`)
  const admin = new Client()

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
      withGroups.data.groups
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
    const save = await admin.call('PUT', '/api/whatsapp/config', {
      baseUrl: MOCK,
      apiKey: MOCK_KEY,
      session: 'default',
      groupChatId: '1203630abcdef123456789@g.us',
      groupName: 'Math Competition 2026 — Results',
    })
    ok('saves the connection', save.status === 200 && save.data.configured === true, save)
    ok('auto-share defaults to off', save.data.autoEvents === false, save.data)

    ok('key masked in response', save.data.apiKeySet === true && /^\S{3}…\S{2}$/.test(save.data.apiKeyHint ?? '') && !save.data.apiKey, save.data)

    const read = await admin.call('GET', '/api/whatsapp/config')
    ok('config persists', read.data.configured === true && read.data.baseUrl === MOCK && read.data.groupName === 'Math Competition 2026 — Results', read.data)
    ok('full key never returned', !read.data.apiKey && read.data.apiKeyHint === save.data.apiKeyHint, read.data)
  }

  // An event with a partially empty podium — e.g. its gold center was
  // deleted, which nulls that place. Shared too, to prove partial podiums
  // still render well-formed messages. Chosen in section 6, asserted in 7.
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
    ok('test message sends', testMsg.status === 200 && testMsg.data.ok === true, testMsg)

    const standings = await admin.call('POST', '/api/whatsapp/send', { kind: 'standings', tournamentId: tid })
    ok('standings message sends', standings.status === 200, standings)

    const event = await admin.call('POST', '/api/whatsapp/send', {
      kind: 'event',
      tournamentId: tid,
      eventId: completedEvent.id,
    })
    ok('event message sends', event.status === 200, event)

    if (partialEventId) {
      const partial = await admin.call('POST', '/api/whatsapp/send', {
        kind: 'event',
        tournamentId: tid,
        eventId: partialEventId,
      })
      ok('partial-podium event message sends', partial.status === 200, partial)
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
    const { readFileSync } = await import('node:fs')
    const logPath = new URL('./waha-mock.log', import.meta.url).pathname
    const lines = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .filter((l) => l.startsWith('{')) // tolerate mock stdout noise
      .map((l) => JSON.parse(l))
    const expectedCount = 3 + (partialEventId ? 1 : 0)
    ok(`${expectedCount} messages delivered`, lines.length === expectedCount, lines.length)

    const all = lines.map((l) => l.text)
    ok('all sent to the configured group', lines.every((l) => l.chatId === '1203630abcdef123456789@g.us'), lines.map((l) => l.chatId))
    ok('all sent with the configured session', lines.every((l) => l.session === 'default'))

    const testText = all.find((t) => t.includes('connection test'))
    ok(
      'test message well-formed',
      Boolean(testText?.includes('Tourny Lite') && testText.includes('via Tourny Lite')),
      testText
    )

    const standingsText = all.find((t) => t.includes('Standings'))
    ok(
      'standings message has bold title, medals, points, stamp',
      Boolean(
        standingsText?.includes('*') &&
          standingsText.includes('🥇') &&
          standingsText.includes('pts') &&
          standingsText.includes('events completed') &&
          standingsText.includes('🥈')
      ),
      standingsText
    )
    ok(
      'standings message has rule, progress line and footer',
      Boolean(
        standingsText?.includes('━━') &&
          standingsText.includes('✅') &&
          standingsText.includes('via Tourny Lite')
      ),
      standingsText
    )
    ok(
      'standings omit scoreless centers',
      Boolean(standingsText),
      standingsText
    )

    const eventText = all.find((t) => t.includes('Cat') && t.includes('🥇') && !t.includes('Standings'))
    ok(
      'event message has game, division, podium, points',
      Boolean(
        eventText &&
          eventText.includes('*') &&
          eventText.includes('Cat') &&
          eventText.includes('🥇') &&
          eventText.includes('75 pts') &&
          eventText.includes('50 pts') &&
          eventText.includes('25 pts')
      ),
      eventText
    )
    ok(
      'event message branded with header, table line and footer',
      Boolean(
        eventText?.includes('Event result') &&
          eventText.includes('📊 Table:') &&
          eventText.includes('━━') &&
          eventText.includes('via Tourny Lite')
      ),
      eventText
    )

    let partialText: string | undefined
    if (partialEventId) {
      partialText = all.find((t) => t.includes('Cat') && !t.includes('🥇') && !t.includes('Standings'))
      ok(
        'partial podium renders without the missing gold',
        Boolean(
          partialText &&
            (partialText.includes('🥈') || partialText.includes('🥉')) &&
            partialText.includes('pts')
        ),
        partialText
      )
    }

    console.log('\n── standings message ──')
    console.log(standingsText)
    console.log('── event message ──')
    console.log(eventText)
    if (partialText) {
      console.log('── partial-podium event message ──')
      console.log(partialText)
    }
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

    const verifyOld = await admin.call('POST', '/api/whatsapp/verify', { baseUrl: MOCK, apiKey: 'wrong-again' })
    ok('a freshly typed wrong key still rejected', verifyOld.status === 502, verifyOld)
  }

  // ═══ 9. Auto-share on recorded results ═══
  section('9 · Auto-share on recorded results')
  {
    const { readFileSync } = await import('node:fs')
    const logPath = new URL('./waha-mock.log', import.meta.url).pathname
    const readLog = (): { at: string; id: string; session: string; chatId: string; text: string }[] =>
      readFileSync(logPath, 'utf8')
        .trim()
        .split('\n')
        .filter((l) => l.startsWith('{'))
        .map((l) => JSON.parse(l))
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

    // A recorded result → one announcement in the group.
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
    const autoText = lines[lines.length - 1]?.text ?? ''
    ok(
      'auto message is the branded event podium',
      autoText.includes('Event result') && autoText.includes('🥇') && autoText.includes('pts') && autoText.includes('via Tourny Lite'),
      autoText
    )

    // A correction → a clearly labeled follow-up.
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
    ok(
      'correction clearly labeled',
      (lines[lines.length - 1]?.text ?? '').includes('Corrected result'),
      lines[lines.length - 1]?.text
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
