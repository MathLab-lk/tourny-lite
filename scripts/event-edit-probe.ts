/**
 * Probe — cinematic student stage + event editing.
 *
 * Run: bun scripts/event-edit-probe.ts
 */
const BASE = 'http://localhost:3000'

interface Res {
  status: number
  data: any
}

class Client {
  cookie = ''
  async call(method: string, path: string, body?: unknown): Promise<Res> {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) this.cookie = setCookie.split(';')[0]
    let data: any = null
    try {
      data = await res.json()
    } catch {}
    return { status: res.status, data }
  }
}

let passed = 0
let failed = 0
function ok(label: string, cond: boolean, extra?: unknown) {
  if (cond) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    console.log(`  ✗ ${label}`, extra ?? '')
  }
}

function section(s: string) {
  console.log(`\n══ ${s} ══`)
}

async function main() {
  const admin = new Client()
  const judge = new Client()

  section('1 · Sign in')
  {
    const login = await admin.call('POST', '/api/auth/login', {
      email: 'admin@tourny.test',
      password: 'correct horse battery',
    })
    ok('admin signs in', login.status === 200, login)
    const jLogin = await judge.call('POST', '/api/auth/login', {
      email: 'judge@tourny.test',
      password: 'field scoring pass',
    })
    ok('judge signs in', jLogin.status === 200, jLogin)
  }

  let tid = ''
  section('2 · Create a fresh tournament')
  {
    const create = await admin.call('POST', '/api/tournaments', {
      custom: {
        name: `Event Edit Probe ${Date.now()}`,
        organizer: 'Probe',
        pointsFirst: 75,
        pointsSecond: 50,
        pointsThird: 25,
        divisions: [
          { code: 'A', name: 'Category A', ageRange: '8-10', gradeRange: '' },
        ],
        games: [{ code: 'quiz', englishName: 'Quiz', sinhalaName: '', rulesSummary: '' }],
        matrix: { A: { quiz: 1 } },
        centersText: '101 - Alpha\n102 - Beta\n103 - Gamma',
      },
    })
    ok('tournament created', create.status === 201 || create.status === 200, create)
    tid = create.data?.id ?? ''
  }

  section('3 · Add events — existing pair')
  {
    const detail = await admin.call('GET', `/api/tournaments/${tid}`)
    const div = detail.data.divisions[0]
    const game = detail.data.games[0]
    ok('detail loads', detail.status === 200)
    ok('starts with 1 event', detail.data.events.length === 1, detail.data.events.length)

    const add = await admin.call('POST', `/api/tournaments/${tid}/events`, {
      divisionId: div.id,
      gameId: game.id,
      count: 2,
      scoringMode: 'students',
    })
    ok('appends 2 student-mode slots', add.status === 200 && add.data.added === 2, add)

    const after = await admin.call('GET', `/api/tournaments/${tid}`)
    ok('now 3 events', after.data.events.length === 3, after.data.events.length)
    const students = after.data.events.filter((e: any) => e.scoringMode === 'students')
    ok('new slots are student-mode', students.length === 2, students.map((e: any) => e.scoringMode))
    ok('slots numbered 2,3', after.data.events.filter((e: any) => e.subEventIndex >= 2).length === 2)

    const judgeAdd = await judge.call('POST', `/api/tournaments/${tid}/events`, {
      divisionId: div.id,
      gameId: game.id,
    })
    ok('judge cannot add events (403)', judgeAdd.status === 403, judgeAdd)
  }

  section('4 · Add events — new game + new category inline')
  {
    const addNew = await admin.call('POST', `/api/tournaments/${tid}/events`, {
      newDivision: { code: 'B', name: 'Category B' },
      newGame: { englishName: 'Relay Round', sinhalaName: 'රිලේ' },
      count: 1,
      scoringMode: 'podium',
    })
    ok('creates division + game + slot', addNew.status === 200 && addNew.data.added === 1, addNew)

    const after = await admin.call('GET', `/api/tournaments/${tid}`)
    ok('4 events now', after.data.events.length === 4, after.data.events.length)
    ok('new division listed', after.data.divisions.some((d: any) => d.code === 'B'))
    ok('new game listed', after.data.games.some((g: any) => g.englishName === 'Relay Round'))

    const dupeDiv = await admin.call('POST', `/api/tournaments/${tid}/events`, {
      newDivision: { code: 'B', name: 'Category B again' },
      newGame: { englishName: 'Relay Round' },
    })
    ok('duplicate category rejected (400)', dupeDiv.status === 400, dupeDiv)
  }

  let slotId = ''
  section('5 · Edit an event — label + scoring mode')
  {
    const detail = await admin.call('GET', `/api/tournaments/${tid}`)
    const slot = detail.data.events.find((e: any) => e.subEventIndex === 1)
    slotId = slot.id

    const rename = await admin.call('PATCH', `/api/events/${slotId}`, { label: 'Quiz — Grand Finale' })
    ok('label renamed', rename.status === 200, rename)

    const after = await admin.call('GET', `/api/tournaments/${tid}`)
    ok('label persisted', after.data.events.find((e: any) => e.id === slotId).label === 'Quiz — Grand Finale')

    const judgeRename = await judge.call('PATCH', `/api/events/${slotId}`, { label: 'Nope' })
    ok('judge cannot rename (403)', judgeRename.status === 403, judgeRename)

    // Record a podium result on slot 1, then the mode must lock.
    const center = detail.data.centers[0]
    const record = await admin.call('POST', '/api/results', {
      eventId: slotId,
      firstPlaceCenterId: center.id,
      secondPlaceCenterId: null,
      thirdPlaceCenterId: null,
      recordedBy: 'Probe',
    })
    ok('podium recorded', record.status === 200 || record.status === 201, record)

    const switchMode = await admin.call('PATCH', `/api/events/${slotId}`, { scoringMode: 'students' })
    ok('mode locked while result exists (400)', switchMode.status === 400, switchMode)

    const judgeStatus = await judge.call('PATCH', `/api/events/${slotId}`, { status: 'in_progress' })
    ok('judge can still change status', judgeStatus.status === 200, judgeStatus)
  }

  section('6 · Student marks + standings (for the stage)')
  {
    // Registration issues IDs — the default pattern needs center +
    // grade, so look the centers up first.
    const before = await admin.call('GET', `/api/tournaments/${tid}`)
    const centersBefore: any[] = before.data.centers
    const addStudents = await admin.call('POST', `/api/tournaments/${tid}/students`, {
      students: [
        { name: 'Amara Silva', centerId: centersBefore[0]?.id ?? null, grade: '6' },
        { name: 'Amara Silva', centerId: centersBefore[1]?.id ?? null, grade: '6' },
        { name: 'Nimal Fernando', centerId: centersBefore[2]?.id ?? null, grade: '6' },
      ],
    })
    ok('students registered (same-name disambiguation via issued IDs)', addStudents.status === 200 || addStudents.status === 201, addStudents)

    const detail = await admin.call('GET', `/api/tournaments/${tid}`)
    const students = detail.data.students
    ok('3 students registered', students.length === 3, students.length)
    ok('every student carries an issued ID', students.every((s: any) => typeof s.studentCode === 'string' && s.studentCode.length > 0), students.map((s: any) => s.studentCode))

    // Record marks on the student-mode slot (slot 2)
    const slot2 = detail.data.events.find((e: any) => e.subEventIndex === 2)
    const marks = await admin.call('POST', '/api/results/students', {
      eventId: slot2.id,
      scores: [
        { studentId: students[0].id, marks: 91 },
        { studentId: students[1].id, marks: 84 },
        { studentId: students[2].id, marks: 77 },
      ],
      recordedBy: 'Probe',
    })
    ok('student marks recorded', marks.status === 200 || marks.status === 201, marks)

    const after = await admin.call('GET', `/api/tournaments/${tid}`)
    const standings = after.data.studentStandings
    ok('student standings computed', standings.length === 3, standings)
    ok('rank 1 is the 91-mark student', standings[0].total === 91 && standings[0].rank === 1, standings)
    ok('same-name students both present', standings.filter((s: any) => s.name === 'Amara Silva').length === 2)

    // Derived podium: center sums decide places
    const slot2After = after.data.events.find((e: any) => e.id === slot2.id)
    ok('center podium derived from sums', slot2After?.result?.derivedFromStudents === true, JSON.stringify(slot2After?.result))

    // Mode is now locked for slot 2 as well (has marks)
    const switchMode = await admin.call('PATCH', `/api/events/${slot2.id}`, { scoringMode: 'podium' })
    ok('mode locked while marks exist (400)', switchMode.status === 400, switchMode)
  }

  section('7 · Delete an event')
  {
    const detail = await admin.call('GET', `/api/tournaments/${tid}`)
    const slot3 = detail.data.events.find((e: any) => e.subEventIndex === 3)
    const judgeDel = await judge.call('DELETE', `/api/events/${slot3.id}`)
    ok('judge cannot delete (403)', judgeDel.status === 403, judgeDel)

    const del = await admin.call('DELETE', `/api/events/${slot3.id}`)
    ok('admin deletes the slot', del.status === 200, del)

    const after = await admin.call('GET', `/api/tournaments/${tid}`)
    ok('event count drops', after.data.events.length === 3, after.data.events.length)
    ok('progress recomputed', after.data.progress.total === 3, after.data.progress)
  }

  section('8 · Present board payload')
  {
    const page = await fetch(`${BASE}/present/${tid}`)
    ok('guest page renders', page.status === 200)
    const detail = await admin.call('GET', `/api/tournaments/${tid}`)
    ok('detail carries studentStandings for the stage', Array.isArray(detail.data.studentStandings), detail.data.studentStandings)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
