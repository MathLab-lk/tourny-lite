/**
 * Tourny Lite — student rankings test suite.
 *
 * Runs against the live dev server (http://localhost:3000) and
 * exercises the student feature end to end: the ID pattern engine
 * (pure), the registration stage (name + center + grade → issued
 * studentCode, unique per tournament, stable forever), roster
 * management and role enforcement, mark sheet recording with the
 * derived center podium (per-center sums → fixed place points), the
 * student ranking and its tie-breaks, corrections with mandatory
 * justification, re-derivation after roster changes, one center
 * sweeping several podium places, reset, and a regression pass over
 * the classic podium flow.
 *
 * Usage: bun run scripts/student-test.ts   (server must be running)
 */

import {
  idIndexScope,
  nextIndexInScope,
  renderStudentCode,
  validateIdPattern,
} from '../src/lib/student-math'

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

  // ═══ 0. ID pattern engine (pure functions) ═══
  section('0 · ID pattern engine')
  {
    ok('default pattern validates', validateIdPattern('{center}-{grade}-{index}') === null)
    ok('empty pattern rejected', validateIdPattern('') !== null)
    ok('token-less pattern rejected', validateIdPattern('abc') !== null)
    ok('unknown token rejected', validateIdPattern('{grade}-{bogus}') !== null)
    ok('index width token accepted', validateIdPattern('{index3}') === null)

    const code = renderStudentCode('{center}-{grade}-{index}', {
      name: 'Kasun Perera',
      centerCode: '402',
      grade: '8',
      index: 7,
    })
    ok('renders center-grade-index', code === '402-8-07', code)
    ok('sanitizes noisy tokens', renderStudentCode('{center}', { name: 'x', centerCode: '40 2-a', grade: '', index: 1 }) === '402A')
    ok('zero-pads to the requested width', renderStudentCode('{grade}-{index3}', { name: 'x', centerCode: null, grade: '6', index: 4 }) === '6-004')
    ok('initials and year render', /KP-\d{4}/.test(renderStudentCode('{initials}-{year}', { name: 'Kasun Perera', centerCode: null, grade: '', index: 1 })))

    ok('index scopes by the tokens present', idIndexScope('{center}-{grade}-{index}') === 'center-grade' && idIndexScope('{center}-{index}') === 'center' && idIndexScope('{grade}-{index}') === 'grade' && idIndexScope('{index}') === 'global')
    const roster = [
      { studentCode: '6-01', centerId: 'c1', grade: '6' },
      { studentCode: null, centerId: 'c1', grade: '6' }, // legacy — not counted
      { studentCode: '6-02', centerId: 'c2', grade: '6' },
      { studentCode: '7-01', centerId: 'c1', grade: '7' },
    ]
    ok('next index counts coded students in scope', nextIndexInScope('{grade}-{index}', roster, { centerId: 'c1', grade: '6' }) === 3 && nextIndexInScope('{grade}-{index}', roster, { centerId: 'c9', grade: '7' }) === 2)
  }

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
    ok('tournament carries the default ID pattern', detail.data?.tournament?.studentIdPattern === '{center}-{grade}-{index}', detail.data?.tournament?.studentIdPattern)
    ok('events default to podium scoring mode', detail.data?.events?.every((e: any) => e.scoringMode === 'podium'))

    const events: any[] = detail.data.events ?? []
    eventStudent = events.find((e) => e.gameCode === 'written' && e.subEventIndex === 1)?.id ?? ''
    eventPodium = events.find((e) => e.gameCode === 'mental' && e.subEventIndex === 1)?.id ?? ''
    ok('found a student-scored event slot and a podium event slot', Boolean(eventStudent) && Boolean(eventPodium))
  }

  // ═══ 3. Registration stage: issued IDs, roles, on-the-go roster ═══
  section('3 · Registration stage (IDs, roles)')
  let students: any[] = []
  {
    const detail0 = await guest.call('GET', `/api/tournaments/${tid}`)
    const centers0: any[] = detail0.data.centers
    const c401 = centers0.find((c: any) => c.centerCode === '401')
    const c402 = centers0.find((c: any) => c.centerCode === '402')
    const c403 = centers0.find((c: any) => c.centerCode === '403')

    const denied = await guest.call('POST', `/api/tournaments/${tid}/students`, {
      students: [{ name: 'Ghost Student', centerId: c401.id, grade: '6' }],
    })
    ok('guests cannot register students', denied.status === 401, denied)

    const empty = await admin.call('POST', `/api/tournaments/${tid}/students`, { students: [] })
    ok('empty registration batch rejected', empty.status === 400, empty)

    const noCenter = await admin.call('POST', `/api/tournaments/${tid}/students`, {
      students: [{ name: 'No Center', grade: '6' }],
    })
    ok('a pattern with {center} requires a center', noCenter.status === 400, noCenter)

    const noGrade = await admin.call('POST', `/api/tournaments/${tid}/students`, {
      students: [{ name: 'No Grade', centerId: c401.id }],
    })
    ok('a pattern with {grade} requires a grade', noGrade.status === 400, noGrade)

    const badCenter = await admin.call('POST', `/api/tournaments/${tid}/students`, {
      students: [{ name: 'Wrong Center', centerId: 'not-a-center', grade: '6' }],
    })
    ok('rejects a center that does not exist', badCenter.status === 400 || badCenter.status === 404, badCenter)

    const badPattern = await admin.call('PATCH', `/api/tournaments/${tid}`, {
      studentIdPattern: '{grade}-{bogus}',
    })
    ok('unknown pattern tokens rejected', badPattern.status === 400, badPattern)

    // Switch to a center-free pattern so the "roster before centers"
    // flow (student lists arriving late) stays exercisable.
    const rePattern = await admin.call('PATCH', `/api/tournaments/${tid}`, {
      studentIdPattern: '{grade}-{index}',
    })
    ok('admin re-configures the ID pattern', rePattern.status === 200, rePattern)

    const added = await admin.call('POST', `/api/tournaments/${tid}/students`, {
      students: [
        { name: 'Amara Silva', grade: '6' },
        { name: 'Nimal Fernando', grade: '6' },
        { name: 'Kasun Perera', grade: '7' },
        { name: 'Same Name', grade: '6' },
        { name: 'Dilini Rajapaksa', grade: '8' },
        { name: 'Same Name', grade: '7' }, // deliberate duplicate name, different person
        { name: 'Tharindu Dias', grade: '6' },
      ],
    })
    ok('registers students and issues IDs', added.status === 201 && added.data?.added === 7, added)
    students = added.data?.students ?? []
    ok(
      'every registration returns a studentCode',
      students.length === 7 && students.every((s: any) => typeof s.studentCode === 'string' && s.studentCode.length > 0),
      students.map((s: any) => s.studentCode)
    )
    ok('issued IDs are unique', new Set(students.map((s: any) => s.studentCode)).size === 7)
    ok(
      'IDs follow the active {grade}-{index} pattern',
      students.every((s: any) => new RegExp(`^${s.grade}-\\d{2}$`).test(s.studentCode)),
      students.map((s: any) => s.studentCode)
    )
    ok(
      'indexes number within each grade scope',
      students.find((s: any) => s.name === 'Amara Silva')?.studentCode === '6-01' &&
        students.find((s: any) => s.name === 'Dilini Rajapaksa')?.studentCode === '8-01' &&
        students.filter((s: any) => s.grade === '7').every((s: any) => /^7-0[12]$/.test(s.studentCode)),
      students.map((s: any) => s.studentCode)
    )

    const byName = (name: string) => students.filter((s: any) => s.name === name)
    ok(
      'two students may share a name — their IDs differ',
      byName('Same Name').length === 2 && byName('Same Name')[0].studentCode !== byName('Same Name')[1].studentCode
    )

    // Assign centers on the go (admin PATCH) — the "data arrives later" flow.
    const amara = byName('Amara Silva')[0]
    const nimal = byName('Nimal Fernando')[0]
    const kasun = byName('Kasun Perera')[0]
    const sameIn402 = byName('Same Name')[0]
    const dilini = byName('Dilini Rajapaksa')[0]
    const sameUnassigned = byName('Same Name')[1]
    const tharindu = byName('Tharindu Dias')[0]

    const amaraMove = await admin.call('PATCH', `/api/tournaments/${tid}/students`, {
      studentId: amara.id,
      centerId: c401.id,
      grade: '6',
    })
    ok('assigning a center keeps the issued ID stable', amaraMove.status === 200 && amaraMove.data?.student?.studentCode === amara.studentCode, amaraMove.data?.student)

    const assignments = [
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
      grade: '6',
    })
    ok('judges can register students in the field', judgeAdd.status === 201, judgeAdd)
    ok(
      'a later registration continues the sequence (no reused numbers)',
      judgeAdd.data?.students?.[0]?.studentCode === '6-05',
      judgeAdd.data?.students
    )
    students = (await guest.call('GET', `/api/tournaments/${tid}`)).data.students
    ok('roster reflects 8 students', students.length === 8)
    ok(
      'roster exposes IDs and grades',
      students.every((s: any) => (s.studentCode === null || typeof s.studentCode === 'string') && typeof s.grade === 'string')
    )
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

          // A dominant center may hold TWO places in one event —
          // each place pays its own points (the historical bug).
          const sweep = await judge.call('POST', '/api/results', {
            eventId: eventStudent,
            firstPlaceCenterId: c403.id,
            secondPlaceCenterId: c403.id,
            thirdPlaceCenterId: c401.id,
            recordedBy: 'Field Judge',
            reason: 'One center swept 1st and 2nd',
          })
          ok('one center may take two podium places', sweep.status === 200, sweep)
          const sweepDetail = await guest.call('GET', `/api/tournaments/${tid}`)
          const sweepRow = sweepDetail.data.standings.find((r: any) => r.centerCode === '403')
          ok(
            'a sweep pays both place points (75 + 50)',
            sweepRow?.total === 125 && sweepRow?.gold === 1 && sweepRow?.silver === 1,
            sweepRow
          )

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
    ok('/t/{id}/scoring (retired console) lands on the Overview with 200', scoringPage.status === 200)
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
