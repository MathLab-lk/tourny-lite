import type { CenterSumRow, StudentDTO, StudentStandingRow } from '@/lib/types'

/**
 * Pure student-ranking math — no database, no server imports, safe
 * for client bundles (the marks editor previews the derived podium
 * live as marks are typed) and for the API layer alike.
 */

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Short, human-friendly slice of the internal id — shown only for
 *  legacy students registered before codes were introduced. */
export function studentShortId(id: string): string {
  return `#${id.slice(-4)}`
}

// ── student ID pattern engine ─────────────────────────────────
// A tournament's studentIdPattern composes the human-readable code
// issued to every registered student, e.g. "{center}-{grade}-{index}"
// renders "402-8-07" for the 7th registered grade-8 student of center
// 402. Pure functions only — the settings page previews and the
// registration service render through the same code, so what the
// admin sees is exactly what the field receives.

export const DEFAULT_STUDENT_ID_PATTERN = '{center}-{grade}-{index}'

/** Every token a pattern may contain (index additionally accepts a
 *  width digit, e.g. {index3} → zero-padded to 3). */
export const STUDENT_ID_TOKENS = ['center', 'grade', 'index', 'initials', 'year'] as const

const TOKEN_OR_WIDTH = /^(center|grade|index\d{0,4}|initials|year)$/

/** Validates an ID pattern. Returns null when valid, a friendly
 *  error message otherwise. */
export function validateIdPattern(pattern: string): string | null {
  const p = pattern.trim()
  if (!p) return 'The ID pattern cannot be empty.'
  if (p.length > 48) return 'Keep the ID pattern to 48 characters or fewer.'
  const tokens = [...p.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1])
  if (tokens.length === 0) {
    return `The pattern needs at least one token — e.g. ${STUDENT_ID_TOKENS.map((t) => `{${t}}`).join(', ')}.`
  }
  for (const t of tokens) {
    if (!TOKEN_OR_WIDTH.test(t)) {
      return `Unknown token {${t}} — allowed: {center}, {grade}, {index} (optionally {index2}…{index4}), {initials}, {year}.`
    }
  }
  return null
}

function sanitizeToken(v: string): string {
  // Codes must survive being read off paper and typed back in —
  // keep letters and digits only, uppercase.
  return v.replace(/[^0-9A-Za-z]+/g, '').toUpperCase()
}

export interface StudentCodeParts {
  name: string
  centerCode: string | null
  grade: string
  /** 1-based sequence number within the pattern's index scope. */
  index: number
}

/** Renders a student code from a pattern. Missing parts fall back to
 *  placeholders (previews only — real registration validates first). */
export function renderStudentCode(pattern: string, parts: StudentCodeParts): string {
  const widthMatch = /\{index(\d{0,4})\}/.exec(pattern)
  const width = Math.min(4, Math.max(1, Number(widthMatch?.[1] || '2') || 2))
  const initials =
    parts.name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'S'
  return pattern
    .replace(/\{center\}/g, sanitizeToken(parts.centerCode ?? 'XX'))
    .replace(/\{grade\}/g, sanitizeToken(parts.grade) || 'G')
    .replace(/\{index\d{0,4}\}/g, String(parts.index).padStart(width, '0'))
    .replace(/\{initials\}/g, initials)
    .replace(/\{year\}/g, String(new Date().getFullYear()))
}

/** Which slice of the roster the {index} counts within — the tokens
 *  that appear alongside it scope the sequence, like a class roll
 *  number: "{center}-{grade}-{index}" numbers students within each
 *  (center, grade) pair, "{center}-{index}" within each center. */
export function idIndexScope(
  pattern: string
): 'center-grade' | 'center' | 'grade' | 'global' {
  const hasCenter = pattern.includes('{center}')
  const hasGrade = pattern.includes('{grade}')
  if (hasCenter && hasGrade) return 'center-grade'
  if (hasCenter) return 'center'
  if (hasGrade) return 'grade'
  return 'global'
}

/** The next free sequence number for an input's index scope —
 *  counted from the codes already issued, so numbers are never
 *  re-used even after a student was removed. Shared by the
 *  registration service (source of truth) and the registration
 *  form's live preview (estimate against the loaded roster). */
export function nextIndexInScope(
  pattern: string,
  roster: { studentCode: string | null; centerId: string | null; grade: string | null }[],
  input: { centerId: string | null; grade: string }
): number {
  const scope = idIndexScope(pattern)
  const sameScope = roster.filter((s) => {
    if (!s.studentCode) return false
    switch (scope) {
      case 'center-grade':
        return s.centerId === input.centerId && s.grade === input.grade
      case 'center':
        return s.centerId === input.centerId
      case 'grade':
        return s.grade === input.grade
      default:
        return true
    }
  })
  return sameScope.length + 1
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
      studentCode: s.studentCode ?? null,
      grade: s.grade ?? null,
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
