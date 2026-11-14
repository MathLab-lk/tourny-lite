/**
 * Tourny Lite — student rankings test suite (experimental feature).
 *
 * Runs against the live dev server (http://localhost:3000) and
 * exercises the student feature end to end: roster management and
 * role enforcement, mark sheet recording with the derived center
 * podium (per-center sums → fixed place points), the student
 * ranking and its tie-breaks, corrections with mandatory
 * justification, re-derivation after roster changes, reset, and a
 * regression pass over the classic podium flow.
 *
 * Usage: bun run scripts/student-test.ts   (server must be running)
 */

// Module scope — keeps these helpers out of the shared scripts program.
export {}

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
}

const guest = new Client()
const admin = new Client()
const judge = new Client()

async function main() {
  console.log(`Tourny Lite student test — target ${BASE}`)

  // ═══ 1. First-run setup / sign-in ═══
  section('1 · Accounts')
  let tid = ''
  let eventStudent = ''
  let eventPodium = ''
  {
    const s = await guest.call('GET', '/api/auth/session')
    if (s.data?.setupRequired === true) {
      const created = await admin.call('POST', '/api/auth/setup', {
        name: 'Student Test Admin',
        email: 'admin@tourny.test',
        password: 'correct horse battery',
      })
      ok('creates the first administrator', created.status === 201 && created.data?.user?.role === 'admin', created)
    } else {
      const login = await admin.call('POST', '/api/auth/login', {
        email: 'admin@tourny.test',
        password: 'correct horse battery',
      })
      ok('administrator signs in', login.status === 200 && login.data?.user?.role === 'admin', login)
    }

    const mkJudge = await admin.call('POST', '/api/admin/users', {
      name: 'Field Judge',
      email: 'student-judge@tourny.test',
      password: 'correct horse battery',
      role: 'judge',
    })
    ok('judge account exists', mkJudge.status === 201 || mkJudge.status === 400, mkJudge)

    const jLogin = await judge.call('POST', '/api/auth/login', {
      email: 'student-judge@tourny.test',
      password: 'correct horse battery',
    })
    ok('judge signs in', jLogin.status === 200 && jLogin.data?.user?.role === 'judge', jLogin)
  }

  // ═══ 2. Tournament scaffold ═══
  section('2 · Tournament scaffold')
  {
    const created = await admin.call('POST', '/api/tournaments', {
      custom: {
        name: `Student Rankings Probe ${Date.now()}`,
        organizer: 'Student Test',
        pointsFirst: 75,
        pointsSecond: 50,
        pointsThird: 25,
        divisions: [{ code: 'A', name: 'Category A', ageRange: '10-12', gradeRange: '6-7' }],
        games: [
          { code: 'written', englishName: 'Written Test', sinhalaName: '', rulesSummary: '' },
          { code: 'mental', englishName: 'Mental Math', sinhalaName: '', rulesSummary: '' },
        ],
        matrix: { A: { written: 2, mental: 1 } },
        centersText: '401, 402 - Kandy Center, 403, 404',
      },
    })
    ok('creates a custom tournament', created.status === 201 && Boolean(created.data?.id), created)
    tid = created.data.id

    const detail = await guest.call('GET', `/api/tournaments/${tid}`)
    ok('detail exposes students array', Array.isArray(detail.data?.students) && detail.data.students.length === 0, detail.data?.students)
    ok('detail exposes studentScores array', Array.isArray(detail.data?.studentScores))
    ok('detail exposes studentStandings array', Array.isArray(detail.data?.studentStandings))
    ok('events default to podium scoring mode', detail.data?.events?.every((e: any) => e.scoringMode === 'podium'))

    const events: any[] = detail.data.events ?? []
    eventStudent = events.find((e) => e.gameCode === 'written' && e.subEventIndex === 1)?.id ?? ''
    eventPodium = events.find((e) => e.gameCode === 'mental' && e.subEventIndex === 1)?.id ?? ''
    ok('found a student-scored event slot and a podium event slot', Boolean(eventStudent) && Boolean(eventPodium))
  }

  // ═══ 3. Roster management & role enforcement ═══
  section('3 · Roster management & roles')
  let students: any[] = []
  {
    const denied = await guest.call('POST', `/api/tournaments/${tid}/students`, {
      students: [{ name: 'Ghost Student' }],
    })
    ok('guests cannot add students', denied.status === 401, denied)

    const empty = await admin.call('POST', `/api/tournaments/${tid}/students`, { students: [] })
    ok('empty roster batch rejected', empty.status === 400, empty)

    const added = await admin.call('POST', `/api/tournaments/${tid}/students`, {
      students: [
        { name: 'Amara Silva' }, // center assigned below (on the go)
        { name: 'Nimal Fernando' },
        { name: 'Kasun Perera' },
        { name: 'Same Name' },
        { name: 'Dilini Rajapaksa' },
        { name: 'Same Name' }, // deliberate duplicate name, different person
        { name: 'Tharindu Dias' },
      ],
    })
    ok('adds students without centers', added.status === 201 && added.data?.added === 7, added)
    students = added.data?.students ?? []
    ok('every student has a distinct internal id', new Set(students.map((s: any) => s.id)).size === 7)

    const byName = (name: string) => students.filter((s: any) => s.name === name)
    ok('two students may share a name', byName('Same Name').length === 2)

    const badCenter = await admin.call('POST', `/api/tournaments/${tid}/students`, {
      students: [{ name: 'Wrong Center', centerId: 'not-a-center' }],
    })
    ok('rejects a center that does not exist', badCenter.status === 400 || badCenter.status === 404, badCenter)

    // Assign centers on the go (admin PATCH) — the "data arrives later" flow.
    const detail = await guest.call('GET', `/api/tournaments/${tid}`)
    const centers: any[] = detail.data.centers
    const c401 = centers.find((c: any) => c.centerCode === '401')
    const c402 = centers.find((c: any) => c.centerCode === '402')
    const c403 = centers.find((c: any) => c.centerCode === '403')

    const amara = byName('Amara Silva')[0]
    const nimal = byName('Nimal Fernando')[0]
    const kasun = byName('Kasun Perera')[0]
    const sameIn402 = byName('Same Name')[0]
    const dilini = byName('Dilini Rajapaksa')[0]
    const sameUnassigned = byName('Same Name')[1]
    const tharindu = byName('Tharindu Dias')[0]

    const assignments = [
      [amara, c401],
      [nimal, c401],
      [kasun, c402],
      [sameIn402, c402],
      [dilini, c403],
    ] as const
    for (const [student, center] of assignments) {
      const res = await admin.call('PATCH', `/api/tournaments/${tid}/students`, {
        studentId: student.id,
        centerId: center.id,
      })
      if (res.status !== 200) ok(`assigns ${student.name} to ${center.centerCode}`, false, res)
    }
    ok('assigns five students to centers', true)
    ok('leaves two students unassigned', sameUnassigned.centerId === null && tharindu.centerId === null)

    const judgePatch = await judge.call('PATCH', `/api/tournaments/${tid}/students`, {
      studentId: tharindu.id,
      name: 'Renamed By Judge',
    })
    ok('judges cannot edit students', judgePatch.status === 403, judgePatch)

    const judgeDelete = await judge.call('DELETE', `/api/tournaments/${tid}/students`, {
      studentId: tharindu.id,
    })
    ok('judges cannot remove students', judgeDelete.status === 403, judgeDelete)

    const judgeAdd = await judge.call('POST', `/api/tournaments/${tid}/students`, {
      name: 'Judge Added',
      centerId: c401.id,
    })
    ok('judges can add students in the field', judgeAdd.status === 201, judgeAdd)
    students = (await guest.call('GET', `/api/tournaments/${tid}`)).data.students
    ok('roster reflects 8 students', students.length === 8)
  }

  // ═══ 4. Mark sheet: derived podium & standings ═══
  section('4 · Mark sheet → derived podium')
  {
    const fresh = await guest.call('GET', `/api/tournaments/${tid}`)
    const centers: any[] = fresh.data.centers
    const roster: any[] = fresh.data.students
    const find = (name: string, code: string | null) =>
      roster.find(
        (s: any) => s.name === name && (centers.find((c: any) => c.id === s.centerId)?.centerCode ?? null) === code
      )
    const c401 = centers.find((c: any) => c.centerCode === '401')
    const c402 = centers.find((c: any) => c.centerCode === '402')
    const c403 = centers.find((c: any) => c.centerCode === '403')
    const c404 = centers.find((c: any) => c.centerCode === '404')

    const denied = await guest.call('POST', '/api/results/students', {
      eventId: eventStudent,
      scores: [{ studentId: find('Amara Silva', '401').id, marks: 80 }],
    })
    ok('guests cannot submit mark sheets', denied.status === 401, denied)

    const emptySheet = await judge.call('POST', '/api/results/students', {
      eventId: eventStudent,
      scores: [],
    })
    ok('empty mark sheet rejected', emptySheet.status === 400, emptySheet)

    const negative = await judge.call('POST', '/api/results/students', {
      eventId: eventStudent,
      scores: [{ studentId: find('Amara Silva', '401').id, marks: -5 }],
    })
    ok('negative marks rejected', negative.status === 400, negative)

    const dupStudent = await judge.call('POST', '/api/results/students', {
      eventId: eventStudent,
      scores: [
        { studentId: find('Amara Silva', '401').id, marks: 10 },
        { studentId: find('Amara Silva', '401').id, marks: 20 },
      ],
    })
    ok('duplicate student on one sheet rejected', dupStudent.status === 400, dupStudent)

    // The mark sheet: two students per center for 401/402, one for 403,
    // plus two unassigned students whose marks count for no center.
    const sheet = [
      { studentId: find('Amara Silva', '401').id, marks: 80 },
      { studentId: find('Nimal Fernando', '401').id, marks: 65 },
      { studentId: find('Kasun Perera', '402').id, marks: 90 },
      { studentId: find('Same Name', '402').id, marks: 40 },
      { studentId: find('Dilini Rajapaksa', '403').id, marks: 100 },
      { studentId: find('Same Name', null).id, marks: 95 },
      { studentId: find('Judge Added', '401').id, marks: 0 },
    ]
    const submitted = await judge.call('POST', '/api/results/students', {
      eventId: eventStudent,
      scores: sheet,
      recordedBy: 'Field Judge',
    })
    ok('judge records the mark sheet', submitted.status === 201, submitted)
    ok('response reports the center sums', Array.isArray(submitted.data?.centerSums) && submitted.data.centerSums.length === 3, submitted.data)

    const detail = await guest.call('GET', `/api/tournaments/${tid}`)
    const ev = detail.data.events.find((e: any) => e.id === eventStudent)
    ok('event flips to students scoring mode', ev?.scoringMode === 'students')
    ok('event completes', ev?.status === 'completed')
    ok('result flagged as derived from students', ev?.result?.derivedFromStudents === true)
    // 401 = 80+65+0 = 145 · 402 = 90+40 = 130 · 403 = 100
    ok('derived 1st place is 401 (sum 145)', ev?.result?.firstPlaceCode === '401', ev?.result)
    ok('derived 2nd place is 402 (sum 130)', ev?.result?.secondPlaceCode === '402')
    ok('derived 3rd place is 403 (sum 100)', ev?.result?.thirdPlaceCode === '403')

    const standings: any[] = detail.data.standings
    const row401 = standings.find((r: any) => r.centerCode === '401')
    const row402 = standings.find((r: any) => r.centerCode === '402')
    const row403 = standings.find((r: any) => r.centerCode === '403')
    const row404 = standings.find((r: any) => r.centerCode === '404')
    ok('centers earn fixed place points (75/50/25)', row401?.total === 75 && row402?.total === 50 && row403?.total === 25 && row404?.total === 0, { row401, row402, row403, row404 })
    ok('medal counts feed the tie-breakers', row401?.gold === 1 && row402?.silver === 1 && row403?.bronze === 1)

    ok('seven marks stored', detail.data.studentScores.length === 7, detail.data.studentScores?.length)

    const ss: any[] = detail.data.studentStandings
    const rank = (name: string) => ss.find((r: any) => r.name === name)
    const order = ss.map((r: any) => r.name)
    ok(
      'student ranking orders by total marks',
      order.indexOf('Dilini Rajapaksa') < order.indexOf('Same Name') &&
        order.indexOf('Same Name') < order.indexOf('Kasun Perera'),
      order
    )
    ok('student totals sum every event mark', rank('Amara Silva')?.total === 80 && rank('Kasun Perera')?.total === 90)
    ok('unassigned students still rank', rank('Tharindu Dias')?.total === 0 && rank('Same Name')?.events === 1)
    ok('zero marks still count as participation', rank('Judge Added')?.events === 1 && rank('Judge Added')?.total === 0)

    // ═══ 5. Corrections ═══
    section('5 · Corrections & guardrails')
    {
      const noReason = await judge.call('POST', '/api/results/students', {
        eventId: eventStudent,
        scores: sheet,
      })
      ok('correction without a reason rejected', noReason.status === 400, noReason)

      const manual = await judge.call('POST', '/api/results', {
        eventId: eventStudent,
        firstPlaceCenterId: c404.id,
        secondPlaceCenterId: null,
        thirdPlaceCenterId: null,
        recordedBy: 'Field Judge',
        reason: 'trying to hand-pick a derived podium',
      })
      ok('manual podium on a student event blocked', manual.status === 400, manual)

      // Amara 80 → 30: 401 drops to 95, podium becomes 402/403/401.
      const correctedSheet = sheet.map((row) =>
        row.studentId === find('Amara Silva', '401').id ? { ...row, marks: 30 } : row
      )
      const corrected = await judge.call('POST', '/api/results/students', {
        eventId: eventStudent,
        scores: correctedSheet,
        reason: 'Transcription error on the mark sheet',
      })
      ok('correction with a reason accepted', corrected.status === 200 && corrected.data?.isCorrection === true, corrected)

      const after = await guest.call('GET', `/api/tournaments/${tid}`)
      const ev2 = after.data.events.find((e: any) => e.id === eventStudent)
      ok('podium re-derived after correction', ev2?.result?.firstPlaceCode === '402' && ev2?.result?.secondPlaceCode === '403' && ev2?.result?.thirdPlaceCode === '401', ev2?.result)
      const st2 = after.data.standings
      ok(
        'standings follow the corrected podium',
        st2.find((r: any) => r.centerCode === '402')?.total === 75 &&
          st2.find((r: any) => r.centerCode === '403')?.total === 50 &&
          st2.find((r: any) => r.centerCode === '401')?.total === 25,
        st2
      )
      const audit = await guest.call('GET', `/api/tournaments/${tid}/audit`)
      const entries = audit.data?.entries ?? []
      ok(
        'corrections land in the audit trail',
        entries.some((a: any) => a.action === 'updated' && a.reason.includes('Transcription')),
        entries.slice(0, 3)
      )

      // ═══ 6. Roster changes re-derive ═══
      section('6 · Roster changes re-derive results')
      {
        // Move Same Name (40 marks) from 402 to 403:
        // 402: 130-40=90 · 403: 100+40=140 · 401: 95 → 403/401/402.
        const moved = await admin.call('PATCH', `/api/tournaments/${tid}/students`, {
          studentId: find('Same Name', '402').id,
          centerId: c403.id,
        })
        ok('reassigning a scored student succeeds', moved.status === 200, moved)

        const afterMove = await guest.call('GET', `/api/tournaments/${tid}`)
        const ev3 = afterMove.data.events.find((e: any) => e.id === eventStudent)
        ok('podium re-derived after reassignment', ev3?.result?.firstPlaceCode === '403' && ev3?.result?.secondPlaceCode === '401' && ev3?.result?.thirdPlaceCode === '402', ev3?.result)

        // Remove Kasun (90 marks in 402): 402 drops to 0 → 403/401 stay.
        const removed = await admin.call('DELETE', `/api/tournaments/${tid}/students`, {
          studentId: find('Kasun Perera', '402').id,
        })
        ok('removing a scored student succeeds', removed.status === 200, removed)

        const afterRemove = await guest.call('GET', `/api/tournaments/${tid}`)
        const ev4 = afterRemove.data.events.find((e: any) => e.id === eventStudent)
        ok('podium re-derived after removal', ev4?.result?.firstPlaceCode === '403' && ev4?.result?.secondPlaceCode === '401', ev4?.result)
        ok('removed student leaves the ranking', !(afterRemove.data.studentStandings ?? []).some((r: any) => r.name === 'Kasun Perera'))
        ok('their marks are gone', (afterRemove.data.studentScores ?? []).filter((s: any) => s.eventId === eventStudent).length === 6)

        // ═══ 7. Reset & classic podium regression ═══
        section('7 · Reset & classic podium regression')
        {
          const reset = await admin.call('DELETE', `/api/results/${eventStudent}`, {
            reason: 'Voiding the event for the probe',
          })
          ok('admin resets the student result', reset.status === 200, reset)

          const afterReset = await guest.call('GET', `/api/tournaments/${tid}`)
          const ev5 = afterReset.data.events.find((e: any) => e.id === eventStudent)
          ok('result cleared and event pending again', ev5?.status === 'pending' && ev5?.result === null, ev5?.status)
          ok('mark sheet cleared with the result', (afterReset.data.studentScores ?? []).length === 0)
          ok('standings zeroed for the event', afterReset.data.standings.every((r: any) => r.total === 0))

          // Manual podium works again after reset (no student scores left).
          const manualOk = await judge.call('POST', '/api/results', {
            eventId: eventStudent,
            firstPlaceCenterId: c403.id,
            secondPlaceCenterId: c401.id,
            thirdPlaceCenterId: c402.id,
            recordedBy: 'Field Judge',
          })
          ok('manual podium allowed after reset', manualOk.status === 201, manualOk)

          // Classic podium flow on the untouched event.
          const classic = await judge.call('POST', '/api/results', {
            eventId: eventPodium,
            firstPlaceCenterId: c402.id,
            secondPlaceCenterId: c404.id,
            thirdPlaceCenterId: c401.id,
            recordedBy: 'Field Judge',
          })
          ok('classic podium flow unaffected', classic.status === 201, classic)
          const final = await guest.call('GET', `/api/tournaments/${tid}`)
          const mental = final.data.events.find((e: any) => e.id === eventPodium)
          ok('classic event stays in podium mode', mental?.scoringMode === 'podium' && mental?.result?.derivedFromStudents === false)
        }
      }
    }
  }

  // ═══ 8. URL routes ═══
  section('8 · URL routes')
  {
    const studentsPage = await fetch(`${BASE}/t/${tid}/students`)
    ok('/t/{id}/students renders', studentsPage.status === 200)
    const scoringPage = await fetch(`${BASE}/t/${tid}/scoring`)
    ok('/t/{id}/scoring still renders', scoringPage.status === 200)
    const present = await fetch(`${BASE}/present/${tid}`)
    ok('guest scoreboard still renders', present.status === 200)
    const bogus = await fetch(`${BASE}/t/${tid}/not-a-view`)
    ok('unknown view still 404s', bogus.status === 404)
  }

  // ── summary ─────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(64)}`)
  console.log(`  ${passed} passed · ${failed} failed`)
  if (failed > 0) {
    console.log(failures.join('\n'))
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('suite crashed:', err)
  process.exit(1)
})
