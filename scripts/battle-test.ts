/**
 * Tourny Lite — automated battle test suite.
 *
 * Runs against the live dev server (http://localhost:3000) and exercises
 * every API surface: authentication, role enforcement, tournament
 * lifecycle, result recording/correction/reset with standings math,
 * center management, the live event stream and concurrent submissions.
 *
 * Usage: bun run scripts/battle-test.ts
 */

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'

// ── tiny test framework ───────────────────────────────────────

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

function section(title: string): void {
  console.log(`\n━━ ${title} ${'━'.repeat(Math.max(0, 58 - title.length))}`)
}

// ── cookie-aware client ───────────────────────────────────────

class Client {
  private cookie = ''

  async call(
    method: string,
    path: string,
    body?: unknown
  ): Promise<{ status: number; data: any }> {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) this.cookie = setCookie.split(';')[0]
    let data: any = null
    try {
      data = await res.json()
    } catch {
      data = null
    }
    return { status: res.status, data }
  }

  clearCookie() {
    this.cookie = ''
  }
}

const guest = new Client()
const admin = new Client()
const judge = new Client()

let initialIds: string[] = []

async function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// ── run ───────────────────────────────────────────────────────

async function main() {
  console.log(`Tourny Lite battle test — target ${BASE}`)

  // ═══ 1. Health & first-run state ═══
  section('1 · Health & first-run state')
  {
    const health = await guest.call('GET', '/api')
    ok('health probe responds ok', health.status === 200 && health.data?.status === 'ok', health)

    const session = await guest.call('GET', '/api/auth/session')
    ok('session endpoint responds', session.status === 200, session)
    ok(
      session.data.setupRequired === true || session.data.setupRequired === false,
      'setupRequired flag present'
    )

    initialIds = (await guest.call('GET', '/api/tournaments')).data?.tournaments?.map(
      (t: any) => t.id
    )
  }

  // ═══ 2. First-run setup ═══
  section('2 · First-run administrator setup')
  let setupWasRequired = false
  {
    const s = await guest.call('GET', '/api/auth/session')
    setupWasRequired = s.data?.setupRequired === true

    if (setupWasRequired) {
      const weak = await guest.call('POST', '/api/auth/setup', {
        name: 'Ops Administrator',
        email: 'admin@tourny.test',
        password: 'short',
      })
      ok('rejects weak password', weak.status === 400, weak)

      const badEmail = await guest.call('POST', '/api/auth/setup', {
        name: 'Ops Administrator',
        email: 'not-an-email',
        password: 'correct horse battery',
      })
      ok('rejects invalid email', badEmail.status === 400, badEmail)

      const good = await admin.call('POST', '/api/auth/setup', {
        name: 'Ops Administrator',
        email: 'admin@tourny.test',
        password: 'correct horse battery',
      })
      ok('creates the first administrator', good.status === 201 && good.data?.user?.role === 'admin', good)

      const whoami = await admin.call('GET', '/api/auth/session')
      ok('administrator session active', whoami.data?.user?.role === 'admin', whoami)

      const again = await guest.call('POST', '/api/auth/setup', {
        name: 'Imposter',
        email: 'imposter@tourny.test',
        password: 'password123',
      })
      ok('second setup attempt blocked', again.status === 403, again)
    } else {
      // Sign in with the known battle-test credentials
      const login = await admin.call('POST', '/api/auth/login', {
        email: 'admin@tourny.test',
        password: 'correct horse battery',
      })
      ok('administrator signs in', login.status === 200 && login.data?.user?.role === 'admin', login)
    }
  }

  // ═══ 3. Sign in validation ═══
  section('3 · Sign in validation')
  {
    const wrongPw = await new Client().call('POST', '/api/auth/login', {
      email: 'admin@tourny.test',
      password: 'wrong password',
    })
    ok('rejects wrong password', wrongPw.status === 401, wrongPw)

    const unknown = await new Client().call('POST', '/api/auth/login', {
      email: 'ghost@tourny.test',
      password: 'whatever123',
    })
    ok('rejects unknown account', unknown.status === 401, unknown)

    const good = await judge.call('POST', '/api/auth/login', {
      email: 'judge@tourny.test',
      password: 'field scoring pass',
    })
    if (good.status !== 200) {
      // Judge account does not exist yet — create it as admin
      const created = await admin.call('POST', '/api/admin/users', {
        name: 'Field Judge',
        email: 'judge@tourny.test',
        password: 'field scoring pass',
        role: 'judge',
      })
      ok('administrator creates scorekeeper account', created.status === 201, created)
      const login = await judge.call('POST', '/api/auth/login', {
        email: 'judge@tourny.test',
        password: 'field scoring pass',
      })
      ok('scorekeeper signs in', login.status === 200 && login.data?.user?.role === 'judge', login)
    } else {
      ok('scorekeeper signs in', true)
    }

    const dup = await admin.call('POST', '/api/admin/users', {
      name: 'Duplicate',
      email: 'judge@tourny.test',
      password: 'another pass 99',
      role: 'judge',
    })
    ok('rejects duplicate email account', dup.status === 400, dup)

    const forbidden = await judge.call('GET', '/api/admin/users')
    ok('scorekeeper cannot list accounts', forbidden.status === 403, forbidden)
  }

  // ═══ 4. Guest write protection ═══
  section('4 · Guest write protection (public read, authenticated write)')
  const createdIds: string[] = []
  let tournamentId = ''
  let eventId = ''
  let centerIds: string[] = []
  {
    const reads = await Promise.all([
      guest.call('GET', '/api/tournaments'),
      guest.call('GET', '/api/auth/session'),
    ])
    ok('guest can list tournaments', reads[0].status === 200)

    const createAttempt = await guest.call('POST', '/api/tournaments', {
      presetId: 'math_comp_2026',
    })
    ok('guest cannot create tournaments', createAttempt.status === 401, createAttempt)

    const resultAttempt = await guest.call('POST', '/api/results', {
      eventId: 'nonexistent',
      firstPlaceCenterId: null,
      secondPlaceCenterId: null,
      thirdPlaceCenterId: null,
      recordedBy: 'Guest',
    })
    ok('guest cannot record results', resultAttempt.status === 401, resultAttempt)

    const patchAttempt = await guest.call('PATCH', '/api/tournaments/some-id', { name: 'Hacked' })
    ok('guest cannot update tournaments', patchAttempt.status === 401, patchAttempt)

    const deleteAttempt = await guest.call('DELETE', '/api/tournaments/some-id')
    ok('guest cannot delete tournaments', deleteAttempt.status === 401, deleteAttempt)

    const centersAttempt = await guest.call('POST', '/api/tournaments/some-id/centers', {
      centersText: '999',
    })
    ok('guest cannot add centers', centersAttempt.status === 401, centersAttempt)

    const statusAttempt = await guest.call('PATCH', '/api/events/some-id', { status: 'completed' })
    ok('guest cannot change event status', statusAttempt.status === 401, statusAttempt)

    const resetAttempt = await guest.call('DELETE', '/api/results/some-id', { reason: 'x' })
    ok('guest cannot reset results', resetAttempt.status === 401, resetAttempt)
  }

  // ═══ 5. Role enforcement for scorekeepers ═══
  section('5 · Scorekeeper role enforcement')
  {
    const create = await judge.call('POST', '/api/tournaments', { presetId: 'math_comp_2026' })
    ok('scorekeeper cannot create tournaments', create.status === 403, create)

    const patch = await judge.call('PATCH', '/api/tournaments/whatever', { status: 'archived' })
    ok('scorekeeper cannot update tournaments', patch.status === 403, patch)

    const del = await judge.call('DELETE', '/api/tournaments/whatever')
    ok('scorekeeper cannot delete tournaments', del.status === 403, del)

    const centers = await judge.call('POST', '/api/tournaments/whatever/centers', { centersText: '1' })
    ok('scorekeeper cannot manage centers', centers.status === 403, centers)

    const reset = await judge.call('DELETE', '/api/results/whatever', { reason: 'x' })
    ok('scorekeeper cannot reset results', reset.status === 403, reset)
  }

  // ═══ 6. Tournament creation (preset) ═══
  section('6 · Preset tournament creation')
  {
    const create = await admin.call('POST', '/api/tournaments', { presetId: 'math_comp_2026' })
    ok('creates tournament from preset', create.status === 201 && !!create.data?.id, create)
    tournamentId = create.data.id
    createdIds.push(tournamentId)

    const list = await admin.call('GET', '/api/tournaments')
    const summary = list.data.tournaments.find((t: any) => t.id === tournamentId)
    ok('summary lists tournament', Boolean(summary), summary)
    ok('preset has 5 divisions', summary?.divisionCount === 5, summary?.divisionCount)
    ok('preset has 7 games', summary?.gameCount === 7, summary?.gameCount)
    ok('preset has 39 event slots', summary?.eventCount === 39, summary?.eventCount)
    ok('preset has 6 centers', summary?.centerCount === 6, summary?.centerCount)
    ok('starts with 0 completed', summary?.completedCount === 0, summary?.completedCount)

    const detail = await guest.call('GET', `/api/tournaments/${tournamentId}`)
    ok('detail is publicly readable', detail.status === 200)
    ok('detail exposes standings', Array.isArray(detail.data?.standings), detail.data?.standings)
    ok('progress reports 0/39', detail.data?.progress?.total === 39 && detail.data?.progress?.completed === 0)
    centerIds = (detail.data?.centers ?? []).map((c: any) => c.id)
    ok('six centers present', centerIds.length === 6, centerIds.length)

    const missing = await admin.call('GET', '/api/tournaments/does-not-exist')
    ok('unknown tournament returns 404', missing.status === 404, missing.status)
  }

  // ═══ 7. Results: guardrails + identity ═══
  section('7 · Result recording guardrails')
  let resultEventId = ''
  {
    const detail = await judge.call('GET', `/api/tournaments/${tournamentId}`)
    const pending = detail.data.events.find((e: any) => e.status === 'pending')
    resultEventId = pending.id
    eventId = pending.id

    const [c1, c2, c3] = centerIds
    const empty = await judge.call('POST', '/api/results', {
      eventId: resultEventId,
      firstPlaceCenterId: null,
      secondPlaceCenterId: null,
      thirdPlaceCenterId: null,
      recordedBy: 'x',
    })
    ok('rejects empty podium', empty.status === 400, empty)

    const dup = await judge.call('POST', '/api/results', {
      eventId: resultEventId,
      firstPlaceCenterId: c1,
      secondPlaceCenterId: c1,
      thirdPlaceCenterId: c2,
      recordedBy: 'x',
    })
    ok('rejects a center in two places', dup.status === 400, dup)

    const foreign = await judge.call('POST', '/api/results', {
      eventId: resultEventId,
      firstPlaceCenterId: 'foreign-center-id',
      secondPlaceCenterId: c2,
      thirdPlaceCenterId: c3,
      recordedBy: 'x',
    })
    ok('rejects a center from another tournament', foreign.status === 400, foreign)

    const invalidEvent = await judge.call('POST', '/api/results', {
      eventId: 'no-such-event',
      firstPlaceCenterId: c1,
      secondPlaceCenterId: null,
      thirdPlaceCenterId: null,
      recordedBy: 'x',
    })
    ok('rejects unknown event with 404', invalidEvent.status === 404, invalidEvent)

    // Spoofing attempt: client sends a fake recordedBy
    const good = await judge.call('POST', '/api/results', {
      eventId: resultEventId,
      firstPlaceCenterId: c1,
      secondPlaceCenterId: c2,
      thirdPlaceCenterId: c3,
      recordedBy: 'Mallory The Spoofer',
      notes: 'battle test entry',
    })
    ok('records a valid result', good.status === 201, good)

    const after = await guest.call('GET', `/api/tournaments/${tournamentId}`)
    const recorded = after.data.events.find((e: any) => e.id === resultEventId)
    ok('event auto-completes', recorded?.status === 'completed', recorded?.status)
    ok('stored result carries the signed-in identity', recorded?.result?.recordedBy === 'Field Judge', recorded?.result?.recordedBy)
    ok('podium codes stored', recorded?.result?.firstPlaceCode != null, recorded?.result)

    // Standings math: 1 gold, 1 silver, 1 bronze with 75/50/25
    const s = after.data.standings
    const gold = s.find((r: any) => r.gold === 1)
    const silver = s.find((r: any) => r.silver === 1)
    const bronze = s.find((r: any) => r.bronze === 1)
    ok('gold center scored 75', gold?.total === 75, gold)
    ok('silver center scored 50', silver?.total === 50, silver)
    ok('bronze center scored 25', bronze?.total === 25, bronze)
  }

  // ═══ 8. Corrections & audit ═══
  section('8 · Corrections, audit trail & reset')
  {
    const [c1, c2, c3] = centerIds
    const noReason = await judge.call('POST', '/api/results', {
      eventId: resultEventId,
      firstPlaceCenterId: c2,
      secondPlaceCenterId: c1,
      thirdPlaceCenterId: c3,
      recordedBy: 'x',
    })
    ok('correction without reason rejected', noReason.status === 400, noReason)

    const corrected = await judge.call('POST', '/api/results', {
      eventId: resultEventId,
      firstPlaceCenterId: c2,
      secondPlaceCenterId: c1,
      thirdPlaceCenterId: c3,
      recordedBy: 'x',
      reason: 'Mark sheet re-checked at the station',
    })
    ok('correction with reason accepted', corrected.status === 200 && corrected.data?.isCorrection === true, corrected)

    const audit = await guest.call('GET', `/api/tournaments/${tournamentId}/audit`)
    const entries = audit.data?.entries ?? []
    ok('audit trail is public', audit.status === 200)
    ok('audit records the correction', entries.some((a: any) => a.action === 'updated'), entries.length)
    ok('audit carries the reason', entries.some((a: any) => a.reason === 'Mark sheet re-checked at the station'))
    ok('audit actor is the signed-in identity', entries.some((a: any) => a.actor === 'Field Judge'))

    // Event status override
    const detail = await guest.call('GET', `/api/tournaments/${tournamentId}`)
    const otherEvent = detail.data.events.find((e: any) => e.id !== resultEventId)
    const inProgress = await judge.call('PATCH', `/api/events/${otherEvent.id}`, { status: 'in_progress' })
    ok('scorekeeper can set event in progress', inProgress.status === 200, inProgress)
    const badStatus = await judge.call('PATCH', `/api/events/${otherEvent.id}`, { status: 'cancelled' })
    ok('invalid status rejected', badStatus.status === 400, badStatus)

    // Reset (admin only) — already verified judge 403 above
    const resetNoReason = await admin.call('DELETE', `/api/results/${resultEventId}`, { reason: '' })
    ok('reset without reason rejected', resetNoReason.status === 400, resetNoReason)

    const reset = await admin.call('DELETE', `/api/results/${resultEventId}`, {
      reason: 'Re-run of the event after an appeal',
    })
    ok('administrator resets the result', reset.status === 200, reset)

    const after = await guest.call('GET', `/api/tournaments/${tournamentId}`)
    const evt = after.data.events.find((e: any) => e.id === resultEventId)
    ok('event returns to pending', evt?.status === 'pending' && evt?.result === null, evt?.status)
    ok('standings cleared for that event', after.data.standings.every((r: any) => r.total === 0))
    const audit2 = await guest.call('GET', `/api/tournaments/${tournamentId}/audit`)
    ok('reset is audited', (audit2.data?.entries ?? []).some((a: any) => a.action === 'reset'))
  }

  // ═══ 9. Custom tournament & validation ═══
  section('9 · Custom tournament configuration')
  {
    const payload = {
      name: 'Battle Test Open 2026',
      organizer: 'Tourny QA',
      pointsFirst: 100,
      pointsSecond: 60,
      pointsThird: 40,
      divisions: [
        { code: 'X', name: 'Category X', ageRange: '10-12', gradeRange: '5, 6' },
        { code: 'Y', name: 'Category Y', ageRange: '13-15', gradeRange: '7, 8' },
      ],
      games: [
        { code: 'chess', englishName: 'Chess', sinhalaName: '', rulesSummary: '' },
        { code: 'drafts', englishName: 'Drafts', sinhalaName: '', rulesSummary: '' },
      ],
      matrix: { X: { chess: 2, drafts: 1 }, Y: { chess: 1 } },
      centersText: '501, 502 — Kandy, 503',
    }
    const create = await admin.call('POST', '/api/tournaments', { custom: payload })
    ok('creates custom tournament', create.status === 201, create)
    const customId = create.data?.id
    if (customId) createdIds.push(customId)

    const detail = await guest.call('GET', `/api/tournaments/${customId}`)
    ok('custom scoring applied', detail.data?.tournament?.pointsFirst === 100, detail.data?.tournament)
    ok('custom has 4 event slots', detail.data?.events?.length === 4, detail.data?.events?.length)
    ok('centers parsed with names', detail.data?.centers?.length === 3, detail.data?.centers)
    const kandy = detail.data?.centers?.find((c: any) => c.centerCode === '502')
    ok('named center captured', kandy?.centerName === 'Kandy', kandy)

    // duplicate division codes → server must reject
    const dupPayload = {
      ...payload,
      name: 'Broken Tournament',
      divisions: [
        { code: 'Z', name: 'Zed', ageRange: '', gradeRange: '' },
        { code: 'Z', name: 'Zed Again', ageRange: '', gradeRange: '' },
      ],
    }
    const dupCreate = await admin.call('POST', '/api/tournaments', { custom: dupPayload })
    ok('rejects duplicate division codes', dupCreate.status === 400, dupCreate)

    // empty name → 400
    const noName = await admin.call('POST', '/api/tournaments', {
      custom: { ...payload, name: '   ' },
    })
    ok('rejects empty tournament name', noName.status === 400, noName)

    // clone
    const clone = await admin.call('POST', `/api/tournaments/${customId}/clone`, {
      name: 'Battle Test Open 2027',
    })
    ok('clones the tournament', clone.status === 201, clone)
    if (clone.data?.id) createdIds.push(clone.data.id)
    const cloneDetail = await guest.call('GET', `/api/tournaments/${clone.data.id}`)
    ok('clone copies event structure', cloneDetail.data?.events?.length === 4)
    ok('clone starts with zero results', cloneDetail.data?.progress?.completed === 0)
  }

  // ═══ 10. Tournament update & missing records ═══
  section('10 · Updates, lifecycle & missing records')
  {
    const patch = await admin.call('PATCH', `/api/tournaments/${tournamentId}`, {
      organizer: 'Seed Ministries — QA',
    })
    ok('administrator updates tournament', patch.status === 200, patch)

    const badStatus = await admin.call('PATCH', `/api/tournaments/${tournamentId}`, {
      status: 'cancelled',
    })
    ok('invalid lifecycle status rejected', badStatus.status === 400, badStatus)

    const missingPatch = await admin.call('PATCH', '/api/tournaments/nonexistent-id', {
      name: 'Ghost',
    })
    ok('patching a missing tournament returns 404', missingPatch.status === 404, missingPatch.status)

    const missingDelete = await admin.call('DELETE', '/api/tournaments/nonexistent-id')
    ok('deleting a missing tournament returns 404', missingDelete.status === 404, missingDelete.status)

    const missingClone = await admin.call('POST', '/api/tournaments/nonexistent-id/clone', {
      name: 'Ghost copy',
    })
    ok('cloning a missing tournament returns 404', missingClone.status === 404, missingClone.status)
  }

  // ═══ 11. Centers management ═══
  section('11 · Center management')
  {
    const add = await admin.call('POST', `/api/tournaments/${tournamentId}/centers`, {
      centersText: '601 — Galle Center\n602, 603',
    })
    ok('adds centers in bulk', add.status === 200 && add.data?.added === 3, add)

    const dup = await admin.call('POST', `/api/tournaments/${tournamentId}/centers`, {
      centersText: '601, 602',
    })
    ok('skips duplicate center codes', dup.status === 200 && dup.data?.added === 0 && dup.data?.skipped === 2, dup)

    const empty = await admin.call('POST', `/api/tournaments/${tournamentId}/centers`, {
      centersText: '   ',
    })
    ok('rejects empty input', empty.status === 400, empty)

    // record a result involving center 601 then remove it — standings must drop
    const detail = await guest.call('GET', `/api/tournaments/${tournamentId}`)
    const pendingEvent = detail.data.events.find((e: any) => e.status === 'pending')
    const galleId = detail.data.centers.find((c: any) => c.centerCode === '601')?.id
    const otherC = detail.data.centers.find((c: any) => c.centerCode === '101')?.id
    const thirdC = detail.data.centers.find((c: any) => c.centerCode === '103')?.id
    await judge.call('POST', '/api/results', {
      eventId: pendingEvent.id,
      firstPlaceCenterId: galleId,
      secondPlaceCenterId: otherC,
      thirdPlaceCenterId: thirdC,
      recordedBy: 'x',
    })

    const remove = await admin.call('DELETE', `/api/tournaments/${tournamentId}/centers`, {
      centerId: galleId,
    })
    ok('removes a center', remove.status === 200, remove)

    const after = await guest.call('GET', `/api/tournaments/${tournamentId}`)
    const gone = !after.data.centers.some((c: any) => c.centerCode === '601')
    ok('center no longer listed', gone)
    const g101 = after.data.standings.find((r: any) => r.centerCode === '101')
    ok('other standings intact (silver 50)', g101?.total === 50 && g101?.silver === 1, g101)
    const anyGalle = after.data.standings.some((r: any) => r.centerCode === '601')
    ok('removed center gone from standings', !anyGalle)

    const removeMissing = await admin.call('DELETE', `/api/tournaments/${tournamentId}/centers`, {
      centerId: 'no-such-center',
    })
    ok('removing a missing center returns 404', removeMissing.status === 404, removeMissing.status)
  }

  // ═══ 12. Live stream (SSE) ═══
  section('12 · Live event stream')
  {
    const controller = new AbortController()
    const res = await fetch(`${BASE}/api/stream?tournamentId=${tournamentId}`, {
      signal: controller.signal,
      headers: { Accept: 'text/event-stream' },
    })
    ok('stream connects', res.status === 200 && (res.headers.get('content-type') ?? '').includes('text/event-stream'))

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let sawChange = false
    const readLoop = (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (decoder.decode(value).includes('event: change')) sawChange = true
        }
      } catch {
        /* aborted */
      }
    })()

    await wait(300)
    // trigger a change: judge marks an event in progress
    const detail = await guest.call('GET', `/api/tournaments/${tournamentId}`)
    const ev = detail.data.events.find((e: any) => e.status === 'pending')
    await judge.call('PATCH', `/api/events/${ev.id}`, { status: 'in_progress' })
    await wait(800)
    controller.abort()
    await readLoop
    ok('change event delivered to subscribers', sawChange)
  }

  // ═══ 13. Concurrency ═══
  section('13 · Concurrent submissions')
  {
    const detail = await guest.call('GET', `/api/tournaments/${tournamentId}`)
    const pendings = detail.data.events.filter((e: any) => e.status === 'pending').slice(0, 5)
    const [c1, c2, c3] = detail.data.centers.map((c: any) => c.id)
    const results = await Promise.all(
      pendings.map((e: any) =>
        judge.call('POST', '/api/results', {
          eventId: e.id,
          firstPlaceCenterId: c1,
          secondPlaceCenterId: c2,
          thirdPlaceCenterId: c3,
          recordedBy: 'x',
        })
      )
    )
    ok('all parallel submissions succeed', results.every((r) => r.status === 201), results.map((r) => r.status))

    const after = await guest.call('GET', `/api/tournaments/${tournamentId}`)
    ok('standings consistent after burst', (() => {
      const top = after.data.standings.find((r: any) => r.centerCode === '101')
      return (
        top &&
        top.gold >= 5 &&
        top.total === top.gold * 75 + top.silver * 50 + top.bronze * 25
      )
    })(), after.data.standings.find((r: any) => r.centerCode === '101'))

    // same-event race: exactly one creation should win
    const raceEvent = after.data.events.find((e: any) => e.status === 'pending')
    if (raceEvent) {
      const [r1, r2, r3] = detail.data.centers.map((c: any) => c.id)
      const racers = await Promise.all(
        [0, 1, 2].map(() =>
          judge.call('POST', '/api/results', {
            eventId: raceEvent.id,
            firstPlaceCenterId: r1,
            secondPlaceCenterId: r2,
            thirdPlaceCenterId: r3,
            recordedBy: 'x',
          })
        )
      )
      const created = racers.filter((r) => r.status === 201).length
      ok('same-event race yields exactly one result', created === 1, racers.map((r) => r.status))
    }
  }

  // ═══ 14. Account management ═══
  section('14 · Account management')
  {
    // temporary account for lifecycle tests
    const tmp = await admin.call('POST', '/api/admin/users', {
      name: 'Temp Scorekeeper',
      email: 'temp@tourny.test',
      password: 'temporary pass 1',
      role: 'judge',
    })
    ok('creates a temporary account', tmp.status === 201, tmp)
    const tmpId = tmp.data?.user?.id

    const suspend = await admin.call('PATCH', `/api/admin/users/${tmpId}`, { active: false })
    ok('suspends the account', suspend.status === 200, suspend)

    const suspendedLogin = await new Client().call('POST', '/api/auth/login', {
      email: 'temp@tourny.test',
      password: 'temporary pass 1',
    })
    ok('suspended account cannot sign in', suspendedLogin.status === 403, suspendedLogin.status)

    const restore = await admin.call('PATCH', `/api/admin/users/${tmpId}`, { active: true })
    ok('restores the account', restore.status === 200, restore)

    const pwReset = await admin.call('PATCH', `/api/admin/users/${tmpId}`, { password: 'brand new pass 22' })
    ok('resets the password', pwReset.status === 200, pwReset)
    const newPwLogin = await new Client().call('POST', '/api/auth/login', {
      email: 'temp@tourny.test',
      password: 'brand new pass 22',
    })
    ok('new password works', newPwLogin.status === 200, newPwLogin.status)

    const roleChange = await admin.call('PATCH', `/api/admin/users/${tmpId}`, { role: 'admin' })
    ok('promotes to administrator', roleChange.status === 200 && roleChange.data?.user?.role === 'admin', roleChange)

    const remove = await admin.call('DELETE', `/api/admin/users/${tmpId}`)
    ok('deletes the account', remove.status === 200, remove)
    const goneLogin = await new Client().call('POST', '/api/auth/login', {
      email: 'temp@tourny.test',
      password: 'brand new pass 22',
    })
    ok('deleted account cannot sign in', goneLogin.status === 401, goneLogin.status)

    // self-protection
    const selfList = await admin.call('GET', '/api/admin/users')
    const selfId = (await admin.call('GET', '/api/auth/session')).data?.user?.id
    const selfDelete = await admin.call('DELETE', `/api/admin/users/${selfId}`)
    ok('cannot delete own account', selfDelete.status === 400, selfDelete.status)
    const selfSuspend = await admin.call('PATCH', `/api/admin/users/${selfId}`, { active: false })
    ok('cannot suspend own account', selfSuspend.status === 400, selfSuspend.status)
    const selfDemote = await admin.call('PATCH', `/api/admin/users/${selfId}`, { role: 'judge' })
    ok('cannot demote own account', selfDemote.status === 400, selfDemote.status)
    ok('account listing works', Array.isArray(selfList.data?.users) && selfList.data.users.length >= 2)
  }

  // ═══ 15. Invitation codes ═══
  section('15 · Invitation codes')
  const redeemedUserIds: string[] = []
  {
    // role guards
    const guestList = await guest.call('GET', '/api/admin/invites')
    ok('guest cannot list invitation codes', guestList.status === 401, guestList.status)
    const judgeList = await judge.call('GET', '/api/admin/invites')
    ok('scorekeeper cannot list invitation codes', judgeList.status === 403, judgeList.status)
    const judgeCreate = await judge.call('POST', '/api/admin/invites', { role: 'judge' })
    ok('scorekeeper cannot generate codes', judgeCreate.status === 403, judgeCreate.status)

    // generation
    const gen1 = await admin.call('POST', '/api/admin/invites', { role: 'judge', expiresInDays: 7 })
    ok('generates a scorekeeper code', gen1.status === 201 && gen1.data?.invite?.code?.length === 8, gen1)
    ok('code role + creator recorded', gen1.data?.invite?.role === 'judge' && typeof gen1.data?.invite?.createdBy === 'string', gen1.data?.invite)
    const code1 = gen1.data?.invite?.code as string

    const gen2 = await admin.call('POST', '/api/admin/invites', { role: 'admin' })
    ok('generates an administrator code without expiry', gen2.status === 201 && gen2.data?.invite?.expiresAt === null, gen2)
    const code2 = gen2.data?.invite?.code as string

    const gen3 = await admin.call('POST', '/api/admin/invites', { role: 'judge', expiresInDays: -1 })
    ok('generates an already-expired code for testing', gen3.status === 201, gen3.status)
    const code3 = gen3.data?.invite?.code as string
    const code3Id = gen3.data?.invite?.id as string

    const list = await admin.call('GET', '/api/admin/invites')
    const codes = (list.data?.invites ?? []).map((i: any) => i.code)
    ok('lists all generated codes', list.status === 200 && codes.includes(code1) && codes.includes(code2), codes.length)

    // redemption validation
    const badCode = await new Client().call('POST', '/api/auth/redeem', {
      code: 'ZZZZZZ99',
      name: 'Nobody',
      email: 'nobody@tourny.test',
      password: 'a good pass 123',
    })
    ok('rejects unknown code', badCode.status === 400, badCode.status)

    const weakPw = await new Client().call('POST', '/api/auth/redeem', {
      code: code1,
      name: 'Invited Judge',
      email: 'invited.judge@tourny.test',
      password: 'short',
    })
    ok('rejects weak password on redemption', weakPw.status === 400, weakPw.status)

    const badEmail = await new Client().call('POST', '/api/auth/redeem', {
      code: code1,
      name: 'Invited Judge',
      email: 'not-an-email',
      password: 'a good pass 123',
    })
    ok('rejects invalid email on redemption', badEmail.status === 400, badEmail.status)

    // successful redemption (typed with dashes + lowercase to prove normalization)
    const redeemer = new Client()
    const redeem = await redeemer.call('POST', '/api/auth/redeem', {
      code: `${code1.slice(0, 4)}-${code1.slice(4)}`.toLowerCase(),
      name: 'Invited Judge',
      email: 'invited.judge@tourny.test',
      password: 'a good pass 123',
    })
    ok('redeems the code and creates the account', redeem.status === 201 && redeem.data?.user?.role === 'judge', redeem)
    ok('redemption signs the new user in', typeof redeem.data?.user?.id === 'string', redeem.data?.user)
    if (redeem.data?.user?.id) redeemedUserIds.push(redeem.data.user.id)

    const sessionCheck = await redeemer.call('GET', '/api/auth/session')
    ok('redeemed user has a live session', sessionCheck.data?.user?.email === 'invited.judge@tourny.test', sessionCheck.data)

    const redeemAgain = await new Client().call('POST', '/api/auth/redeem', {
      code: code1,
      name: 'Second Person',
      email: 'second.person@tourny.test',
      password: 'a good pass 123',
    })
    ok('code is single-use', redeemAgain.status === 400, redeemAgain.status)

    const dupEmail = await new Client().call('POST', '/api/auth/redeem', {
      code: code2,
      name: 'Clone Judge',
      email: 'invited.judge@tourny.test',
      password: 'a good pass 123',
    })
    ok('rejects duplicate email on redemption', dupEmail.status === 400, dupEmail.status)

    const expired = await new Client().call('POST', '/api/auth/redeem', {
      code: code3,
      name: 'Late Judge',
      email: 'late.judge@tourny.test',
      password: 'a good pass 123',
    })
    ok('rejects expired code', expired.status === 400, expired.status)

    // redeemed user can sign in normally afterwards
    const relogin = await new Client().call('POST', '/api/auth/login', {
      email: 'invited.judge@tourny.test',
      password: 'a good pass 123',
    })
    ok('redeemed account signs in normally', relogin.status === 200 && relogin.data?.user?.role === 'judge', relogin.status)

    // admin-role code grants admin
    const adminRedeem = await new Client().call('POST', '/api/auth/redeem', {
      code: code2,
      name: 'Invited Admin',
      email: 'invited.admin@tourny.test',
      password: 'a good pass 123',
    })
    ok('administrator code grants the admin role', adminRedeem.status === 201 && adminRedeem.data?.user?.role === 'admin', adminRedeem)
    if (adminRedeem.data?.user?.id) redeemedUserIds.push(adminRedeem.data.user.id)

    // list reflects usage
    const listAfter = await admin.call('GET', '/api/admin/invites')
    const usedInvite = (listAfter.data?.invites ?? []).find((i: any) => i.code === code1)
    ok('used code shows the redeemer', usedInvite?.usedAt && usedInvite?.usedByName === 'Invited Judge', usedInvite)

    // deletion
    const del = await admin.call('DELETE', `/api/admin/invites/${code3Id}`)
    ok('deletes a code', del.status === 200, del.status)
    const delAgain = await admin.call('DELETE', `/api/admin/invites/${code3Id}`)
    ok('deleting a missing code returns 404', delAgain.status === 404, delAgain.status)
    const listFinal = await admin.call('GET', '/api/admin/invites')
    const finalCodes = (listFinal.data?.invites ?? []).map((i: any) => i.code)
    ok('deleted code no longer listed', !finalCodes.includes(code3), finalCodes.includes(code3))

    // cleanup — remove redeemed test users and leftover codes
    for (const uid of redeemedUserIds) {
      await admin.call('DELETE', `/api/admin/users/${uid}`)
    }
    const cleanupList = await admin.call('GET', '/api/admin/invites')
    for (const invite of cleanupList.data?.invites ?? []) {
      await admin.call('DELETE', `/api/admin/invites/${invite.id}`)
    }
    const finalCheck = await admin.call('GET', '/api/admin/invites')
    ok('battle-test codes cleaned up', (finalCheck.data?.invites ?? []).length === 0, finalCheck.data?.invites?.length)
  }

  // ═══ 16. Sign out & cleanup ═══
  section('16 · Sign out & cleanup')
  {
    const out = await judge.call('POST', '/api/auth/logout')
    ok('signs out', out.status === 200, out)
    const sessionAfter = await judge.call('GET', '/api/auth/session')
    ok('session cleared', sessionAfter.data?.user === null, sessionAfter.data)
    const afterLogout = await judge.call('POST', '/api/results', {
      eventId,
      firstPlaceCenterId: null,
      secondPlaceCenterId: null,
      thirdPlaceCenterId: null,
      recordedBy: 'x',
    })
    ok('stale session cannot write', afterLogout.status === 401, afterLogout.status)

    // remove tournaments created by this run
    for (const id of createdIds) {
      await admin.call('DELETE', `/api/tournaments/${id}`)
    }
    const list = await admin.call('GET', '/api/tournaments')
    const remaining: string[] = (list.data?.tournaments ?? []).map((t: any) => t.id)
    const extra = remaining.filter((id) => !initialIds.includes(id))
    ok('battle-test tournaments cleaned up', extra.length === 0, extra)
  }

  // ── summary ──
  console.log('\n' + '═'.repeat(64))
  console.log(`  RESULT: ${passed} passed · ${failed} failed`)
  if (failed > 0) {
    console.log('\n  Failures:')
    for (const f of failures) console.log(f)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Battle test crashed:', err)
  process.exit(1)
})
