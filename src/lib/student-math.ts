import type { CenterSumRow, StudentDTO, StudentStandingRow } from '@/lib/types'

/**
 * Pure student-ranking math — no database, no server imports, safe
 * for client bundles (the scoring console previews the derived
 * podium live as marks are typed) and for the API layer alike.
 */

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Short, human-friendly slice of the internal id — used only to
 *  disambiguate two students who share a name. */
export function studentShortId(id: string): string {
  return `#${id.slice(-4)}`
}

/**
 * Sums student marks per center for one event and ranks the centers.
 * Tie-break: sum desc, then center code asc — deterministic.
 * Students without a center (not yet assigned) are excluded from
 * center sums but keep their marks for the student ranking.
 */
export function computeCenterSums(
  scores: { studentId: string; marks: number }[],
  students: { id: string; centerId: string | null }[],
  centers: { id: string; centerCode: string }[]
): CenterSumRow[] {
  const centerByStudent = new Map(students.map((s) => [s.id, s.centerId]))
  const codeByCenter = new Map(centers.map((c) => [c.id, c.centerCode]))
  const sums = new Map<string, number>()
  for (const sc of scores) {
    const centerId = centerByStudent.get(sc.studentId)
    if (!centerId) continue
    sums.set(centerId, round2((sums.get(centerId) ?? 0) + sc.marks))
  }
  const rows = [...sums.entries()].map(([centerId, sum]) => ({
    centerId,
    centerCode: codeByCenter.get(centerId) ?? '?',
    sum,
    place: 0,
  }))
  rows.sort((a, b) => b.sum - a.sum || a.centerCode.localeCompare(b.centerCode))
  rows.forEach((row, i) => {
    row.place = i < 3 ? i + 1 : 0
  })
  return rows
}

/** Overall student leaderboard: total marks across scored events. */
export function computeStudentStandings(
  students: StudentDTO[],
  scores: { studentId: string; eventId: string; marks: number }[]
): StudentStandingRow[] {
  const byStudent = new Map<string, { total: number; events: Set<string>; best: number }>()
  for (const s of students) byStudent.set(s.id, { total: 0, events: new Set(), best: 0 })
  for (const sc of scores) {
    const agg = byStudent.get(sc.studentId)
    if (!agg) continue
    agg.total = round2(agg.total + sc.marks)
    agg.events.add(sc.eventId)
    agg.best = Math.max(agg.best, sc.marks)
  }
  const rows: StudentStandingRow[] = students.map((s) => {
    const agg = byStudent.get(s.id)!
    return {
      rank: 0,
      studentId: s.id,
      name: s.name,
      centerId: s.centerId,
      centerCode: s.centerCode,
      events: agg.events.size,
      best: round2(agg.best),
      total: agg.total,
    }
  })
  rows.sort(
    (a, b) =>
      b.total - a.total ||
      b.events - a.events ||
      b.best - a.best ||
      a.name.localeCompare(b.name) ||
      a.studentId.localeCompare(b.studentId)
  )
  let rank = 0
  let prevKey = ''
  rows.forEach((row, i) => {
    const key = `${row.total}|${row.events}|${row.best}`
    if (key !== prevKey) {
      rank = i + 1
      prevKey = key
    }
    row.rank = rank
  })
  return rows
}
