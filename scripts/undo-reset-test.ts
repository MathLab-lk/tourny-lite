/**
 * Tourny Lite — undo-reset test suite.
 *
 * Runs against the live server (BASE_URL, default http://localhost:3111)
 * and exercises the undo-reset feature end to end:
 *
 *  1. podium result → reset → undo → result restored byte-for-byte
 *  2. student mark sheet → reset → undo → marks + derived podium restored
 *  3. audit feed flags (canUndoReset / undoRestoresMarks / restored entries)
 *  4. role enforcement (judges cannot undo)
 *  5. stale-snapshot refusal (record after reset → undo refused, snapshot dropped)
 *  6. snapshot consumed after undo (second undo fails)
 *  7. roster drift (student removed between reset and undo → marks of the
 *     removed student are skipped, everything else restored)
 *
 * Usage: bun run scripts/undo-reset-test.ts   (server must be running)
 */

export {}

const BASE = process.env.BASE_URL ?? 'http://localhost:3111'

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

class Client {
  private cookie = ''

  async call(method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
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
}

const guest = new Client()
const admin = new Client()
const judge = new Client()

async function main() {
  console.log(`Tourny Lite undo-reset test — target ${BASE}`)

  // ═══ 1. Accounts ═══
  section('1 · Accounts')
  {
    const s = await guest.call('GET', '/api/auth/session')
    if (s.data?.setupRequired === true) {
      const created = await admin.call('POST', '/api/auth/setup', {
        name: 'Undo Test Admin',
        email: 'admin@tourny.test',
        password: 'correct horse battery',
      })
      ok('creates the first administrator', created.status === 201 && created.data?.user?.role === 'admin', created)
    } else {
      const login = await admin.call('POST', '/api/auth/login', {
        email: 'admin@tourny.test',
        password: 'correct horse battery',
      })
      ok('administrator signs in', login.status === 200, login)
    }
    const mkJudge = await admin.call('POST', '/api/admin/users', {
      name: 'Field Judge',
      email: 'undo-judge@tourny.test',
      password: 'correct horse battery',
      role: 'judge',
    })
    ok('judge account exists', mkJudge.status === 201 || mkJudge.status === 400, mkJudge)
    const jLogin = await judge.call('POST', '/api/auth/login', {
      email: 'undo-judge@tourny.test',
      password: 'correct horse battery',
    })
    ok('judge signs in', jLogin.status === 200, jLogin)
  }

  // ═══ 2. Tournament scaffold ═══
  section('2 · Tournament scaffold')
  let tid = ''
  let eventPodium = ''
  let eventStudents = ''
  let eventDrift = ''
  let centers: any[] = []
  {
    const created = await admin.call('POST', '/api/tournaments', {
      custom: {
        name: `Undo Reset Probe ${Date.now()}`,
        organizer: 'Undo Test',
        pointsFirst: 75,
        pointsSecond: 50,
        pointsThird: 25,
        divisions: [{ code: 'A', name: 'Category A', ageRange: '10-12', gradeRange: '6-7' }],
        games: [
          { code: 'written', englishName: 'Written Test', sinhalaName: '', rulesSummary: '' },
          { code: 'mental', englishName: 'Mental Math', sinhalaName: '', rulesSummary: '' },
          { code: 'sprint', englishName: 'Sprint Round', sinhalaName: '', rulesSummary: '' },
        ],
        matrix: { A: { written: 1, mental: 1, sprint: 1 } },
        centersText: '501, 502 - Galle Center, 503',
      },
    })
    ok('creates a custom tournament', created.status === 201 && Boolean(created.data?.id), created)
    tid = created.data.id

    const detail = await guest.call('GET', `/api/tournaments/${tid}`)
    centers = detail.data?.centers ?? []
    const events: any[] = detail.data?.events ?? []
    eventPodium = events.find((e: any) => e.gameCode === 'written')?.id ?? ''
    eventStudents = events.find((e: any) => e.gameCode === 'mental')?.id ?? ''
    eventDrift = events.find((e: any) => e.gameCode === 'sprint')?.id ?? ''
    ok('found three event slots', Boolean(eventPodium) && Boolean(eventStudents) && Boolean(eventDrift))
  }

  const c501 = centers.find((c: any) => c.centerCode === '501')
  const c502 = centers.find((c: any) => c.centerCode === '502')
  const c503 = centers.find((c: any) => c.centerCode === '503')

  const auditOf = async () => {
    const out = await guest.call('GET', `/api/tournaments/${tid}/audit`)
    return (out.data?.entries ?? []) as any[]
  }
  const eventDetail = async (eventId: string) => {
    const out = await guest.call('GET', `/api/tournaments/${tid}`)
    return ((out.data?.events ?? []) as any[]).find((e) => e.id === eventId)
  }

  // ═══ 3. Podium result → reset → undo ═══
  section('3 · Podium: reset then undo restores exactly')
  {
    const rec = await admin.call('POST', '/api/results', {
      eventId: eventPodium,
      firstPlaceCenterId: c501.id,
      secondPlaceCenterId: c502.id,
      thirdPlaceCenterId: c503.id,
      recordedBy: 'Undo Admin',
      notes: 'original notes',
    })
    ok('records a podium result', rec.status === 201 || rec.status === 200, rec)

    const deny = await judge.call('DELETE', `/api/results/${eventPodium}`, { reason: 'judge tries to reset' })
    ok('judges cannot reset', deny.status === 403, deny)

    const reset = await admin.call('DELETE', `/api/results/${eventPodium}`, { reason: 'entered wrong podium' })
    ok('admin resets the result', reset.status === 200, reset)

    let ev = await eventDetail(eventPodium)
    ok('event is pending after reset', ev?.status === 'pending' && ev?.result === null, ev?.status)

    let entries = await auditOf()
    const resetEntry = entries.find((a) => a.eventId === eventPodium && a.action === 'reset')
    ok('audit feed flags the reset as undoable', resetEntry?.canUndoReset === true, resetEntry)
    ok('audit feed knows it restores no marks', resetEntry?.undoRestoresMarks === false, resetEntry)

    const jUndo = await judge.call('POST', `/api/results/${eventPodium}/undo-reset`)
    ok('judges cannot undo', jUndo.status === 403, jUndo)

    const undo = await admin.call('POST', `/api/results/${eventPodium}/undo-reset`)
    ok('admin undoes the reset', undo.status === 200 && undo.data?.restoredResult === true, undo)

    ev = await eventDetail(eventPodium)
    ok('result is back', Boolean(ev?.result), ev?.result)
    ok(
      'podium restored exactly',
      ev?.result?.firstPlaceCode === '501' &&
        ev.result.secondPlaceCode === '502' &&
        ev.result.thirdPlaceCode === '503',
      ev?.result
    )
    ok('notes survived the round-trip', ev?.result?.notes === 'original notes', ev?.result?.notes)
    ok('event is completed again', ev?.status === 'completed', ev?.status)

    entries = await auditOf()
    const restoredEntry = entries.find((a) => a.eventId === eventPodium && a.action === 'restored')
    ok('audit trail records the restore', Boolean(restoredEntry), entries.filter((a) => a.eventId === eventPodium))
    const resetEntryAfter = entries.find((a) => a.eventId === eventPodium && a.action === 'reset')
    ok('reset entry no longer offers undo', resetEntryAfter?.canUndoReset !== true, resetEntryAfter)

    const second = await admin.call('POST', `/api/results/${eventPodium}/undo-reset`)
    ok('second undo is refused (snapshot consumed)', second.status === 400 || second.status === 404, second)
  }

  // ═══ 4. Student mark sheet → reset → undo ═══
  section('4 · Students: reset then undo restores the mark sheet')
  let students: any[] = []
  {
    const added = await admin.call('POST', `/api/tournaments/${tid}/students`, {
      students: [
        { name: 'Amara Silva', centerId: c501.id, grade: '6' },
        { name: 'Nimal Fernando', centerId: c501.id, grade: '6' },
        { name: 'Kasun Perera', centerId: c502.id, grade: '6' },
        { name: 'Dilini Rajapaksa', centerId: c502.id, grade: '6' },
        { name: 'Tharindu Dias', centerId: c503.id, grade: '6' },
      ],
    })
    ok('registers a roster (with issued IDs)', added.status === 201, added)
    students = added.data?.students ?? []

    const sheet = await admin.call('POST', '/api/results/students', {
      eventId: eventStudents,
      scores: [
        { studentId: students[0].id, marks: 91 },
        { studentId: students[1].id, marks: 84 },
        { studentId: students[2].id, marks: 88 },
        { studentId: students[3].id, marks: 79 },
        { studentId: students[4].id, marks: 70 },
      ],
      recordedBy: 'Undo Admin',
    })
    ok('records the mark sheet', sheet.status === 201 || sheet.status === 200, sheet)

    const before = await eventDetail(eventStudents)
    ok('derived podium recorded', Boolean(before?.result?.derivedFromStudents), before?.result)

    const reset = await admin.call('DELETE', `/api/results/${eventStudents}`, { reason: 'wrong event marks' })
    ok('admin resets the student event', reset.status === 200, reset)

    const detailAfter = await guest.call('GET', `/api/tournaments/${tid}`)
    const scoresAfter = (detailAfter.data?.studentScores ?? []).filter((s: any) => s.eventId === eventStudents)
    ok('mark sheet cleared by the reset', scoresAfter.length === 0, scoresAfter.length)

    const entries = await auditOf()
    const resetEntry = entries.find((a) => a.eventId === eventStudents && a.action === 'reset')
    ok('audit feed flags the reset as undoable', resetEntry?.canUndoReset === true, resetEntry)
    ok('audit feed knows it restores the marks', resetEntry?.undoRestoresMarks === true, resetEntry)

    const undo = await admin.call('POST', `/api/results/${eventStudents}/undo-reset`)
    ok('admin undoes the reset', undo.status === 200 && undo.data?.restoredScores === 5, undo)

    const detailRestored = await guest.call('GET', `/api/tournaments/${tid}`)
    const scoresRestored = (detailRestored.data?.studentScores ?? []).filter((s: any) => s.eventId === eventStudents)
    ok('all five marks restored', scoresRestored.length === 5, scoresRestored.length)
    const marks = scoresRestored.map((s: any) => s.marks).sort((a: number, b: number) => a - b)
    ok('marks match the original sheet', JSON.stringify(marks) === JSON.stringify([70, 79, 84, 88, 91]), marks)

    const ev = await eventDetail(eventStudents)
    ok('derived podium restored', ev?.result?.derivedFromStudents === true, ev?.result)
    ok(
      'podium sums recomputed to the same centers',
      ev?.result?.firstPlaceCode === '501' && ev.result.secondPlaceCode === '502' && ev.result.thirdPlaceCode === '503',
      ev?.result
    )
    ok('scoring mode stays students', ev?.scoringMode === 'students', ev?.scoringMode)
  }

  // ═══ 5. Record after reset → undo refused, snapshot dropped ═══
  section('5 · New data after reset invalidates undo')
  {
    const reset = await admin.call('DELETE', `/api/results/${eventPodium}`, { reason: 'reset before re-scoring' })
    ok('resets the podium event again', reset.status === 200, reset)

    const reRecord = await admin.call('POST', '/api/results', {
      eventId: eventPodium,
      firstPlaceCenterId: c503.id,
      secondPlaceCenterId: c501.id,
      thirdPlaceCenterId: null,
      recordedBy: 'Undo Admin',
      notes: 'fresh recording',
    })
    ok('records a fresh podium', reRecord.status === 201 || reRecord.status === 200, reRecord)

    const entries = await auditOf()
    const resetEntries = entries.filter((a) => a.eventId === eventPodium && a.action === 'reset')
    ok('no reset entry offers undo anymore', resetEntries.every((a) => a.canUndoReset !== true), resetEntries)

    const undo = await admin.call('POST', `/api/results/${eventPodium}/undo-reset`)
    ok('undo is refused', undo.status === 400 || undo.status === 404, undo)
    ok('refusal names the reason', typeof undo.data?.error === 'string' && undo.data.error.length > 0, undo.data)
  }

  // ═══ 6. Roster drift between reset and undo ═══
  section('6 · Roster drift: removed student is skipped on undo')
  {
    const sheet = await admin.call('POST', '/api/results/students', {
      eventId: eventDrift,
      scores: [
        { studentId: students[0].id, marks: 60 },
        { studentId: students[2].id, marks: 95 },
        { studentId: students[4].id, marks: 40 },
      ],
      recordedBy: 'Undo Admin',
    })
    ok('records the drift mark sheet', sheet.status === 201 || sheet.status === 200, sheet)

    const reset = await admin.call('DELETE', `/api/results/${eventDrift}`, { reason: 'roster is in flux' })
    ok('resets the drift event', reset.status === 200, reset)

    // Remove one scored student between reset and undo.
    const removed = await admin.call('DELETE', `/api/tournaments/${tid}/students`, {
      studentId: students[2].id,
    })
    ok('removes a scored student', removed.status === 200, removed)

    const undo = await admin.call('POST', `/api/results/${eventDrift}/undo-reset`)
    ok('undo succeeds with drift', undo.status === 200 && undo.data?.restoredScores === 2, undo)

    const detail = await guest.call('GET', `/api/tournaments/${tid}`)
    const scores = (detail.data?.studentScores ?? []).filter((s: any) => s.eventId === eventDrift)
    ok('only surviving students got marks back', scores.length === 2, scores)
    ok(
      'the removed student has no marks',
      !scores.some((s: any) => s.studentId === students[2].id),
      scores
    )
    const ev = await eventDetail(eventDrift)
    ok('a podium is still derived from the survivors', Boolean(ev?.result), ev?.result)
    ok(
      'derived podium is recomputed from the surviving marks (501 first, 503 second)',
      ev?.result?.firstPlaceCode === '501' && ev.result.secondPlaceCode === '503' && ev.result.thirdPlaceCode === null,
      ev?.result
    )
    ok('recomputed podium keeps derivedFromStudents', ev?.result?.derivedFromStudents === true, ev?.result)
  }

  // ═══ 7. Summary ═══
  console.log(`\n${'━'.repeat(63)}`)
  if (failed === 0) {
    console.log(`  ALL ${passed} CHECKS PASSED`)
  } else {
    console.log(`  ${passed} passed, ${failed} FAILED`)
    for (const f of failures) console.log(f)
  }
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('test run crashed:', err)
  process.exit(1)
})
