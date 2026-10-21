import { db } from '@/lib/db'
import { getPresetById, type TournamentPreset } from '@/lib/preset'
import {
  type CustomTournamentPayload,
  type DivisionDTO,
  type EventDTO,
  type GameTypeDTO,
  type StandingRow,
  type TournamentDetailDTO,
  type TournamentDTO,
  type TournamentProgress,
  type TournamentStatus,
  type TournamentSummaryDTO,
} from '@/lib/types'

// ── helpers ───────────────────────────────────────────────────

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'tournament'
  )
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base)
  let suffix = 2
  for (;;) {
    const existing = await db.tournament.findUnique({ where: { slug }, select: { id: true } })
    if (!existing) return slug
    slug = `${slugify(base)}-${suffix++}`
  }
}

/** Parses "101, 103, 105" or "101 - Kandy Center" (comma or newline separated). */
export function parseCentersText(text: string): { code: string; name: string }[] {
  return text
    .split(/[\n,]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const m = chunk.match(/^(.+?)\s*(?:[-–—:|]\s*)(.+)$/)
      if (m && m[1].trim() && m[2].trim()) {
        return { code: m[1].trim(), name: m[2].trim() }
      }
      return { code: chunk, name: '' }
    })
    .filter((c) => c.code.length > 0)
}

// ── DTO mappers ───────────────────────────────────────────────

function toTournamentDTO(t: {
  id: string
  name: string
  slug: string
  organizer: string
  status: string
  pointsFirst: number
  pointsSecond: number
  pointsThird: number
  templateId: string | null
  createdAt: Date
  updatedAt: Date
}): TournamentDTO {
  return {
    ...t,
    status: t.status as TournamentStatus,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  }
}

// ── standings ─────────────────────────────────────────────────

export function computeStandings(
  centers: { id: string; centerCode: string; centerName: string }[],
  results: {
    firstPlaceCenterId: string | null
    secondPlaceCenterId: string | null
    thirdPlaceCenterId: string | null
  }[],
  weights: { first: number; second: number; third: number }
): StandingRow[] {
  const map = new Map<string, StandingRow>()
  for (const c of centers) {
    map.set(c.id, {
      rank: 0,
      centerId: c.id,
      centerCode: c.centerCode,
      centerName: c.centerName,
      gold: 0,
      silver: 0,
      bronze: 0,
      total: 0,
    })
  }
  for (const r of results) {
    if (r.firstPlaceCenterId && map.has(r.firstPlaceCenterId))
      map.get(r.firstPlaceCenterId)!.gold += 1
    if (r.secondPlaceCenterId && map.has(r.secondPlaceCenterId))
      map.get(r.secondPlaceCenterId)!.silver += 1
    if (r.thirdPlaceCenterId && map.has(r.thirdPlaceCenterId))
      map.get(r.thirdPlaceCenterId)!.bronze += 1
  }
  const rows = [...map.values()].map((row) => ({
    ...row,
    total: row.gold * weights.first + row.silver * weights.second + row.bronze * weights.third,
  }))
  // Deterministic tie-break: total → gold → silver → bronze → center code
  rows.sort(
    (a, b) =>
      b.total - a.total ||
      b.gold - a.gold ||
      b.silver - a.silver ||
      b.bronze - a.bronze ||
      a.centerCode.localeCompare(b.centerCode)
  )
  let rank = 0
  let prevKey = ''
  rows.forEach((row, i) => {
    const key = `${row.total}|${row.gold}|${row.silver}|${row.bronze}`
    if (key !== prevKey) {
      rank = i + 1
      prevKey = key
    }
    row.rank = rank
  })
  return rows
}

function computeProgress(events: { status: string }[]): TournamentProgress {
  const total = events.length
  const completed = events.filter((e) => e.status === 'completed').length
  const inProgress = events.filter((e) => e.status === 'in_progress').length
  const pending = total - completed - inProgress
  return {
    total,
    completed,
    inProgress,
    pending,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  }
}

// ── queries ───────────────────────────────────────────────────

export async function listTournaments(): Promise<TournamentSummaryDTO[]> {
  const rows = await db.tournament.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      divisions: { select: { id: true } },
      games: { select: { id: true } },
      centers: { select: { id: true } },
      events: { select: { status: true } },
    },
  })
  return rows.map((t) => ({
    ...toTournamentDTO(t),
    divisionCount: t.divisions.length,
    gameCount: t.games.length,
    centerCount: t.centers.length,
    eventCount: t.events.length,
    completedCount: t.events.filter((e) => e.status === 'completed').length,
  }))
}

export async function getTournamentDetail(
  tournamentId: string
): Promise<TournamentDetailDTO | null> {
  const t = await db.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      divisions: { orderBy: { displayOrder: 'asc' } },
      games: { orderBy: { englishName: 'asc' } },
      centers: { orderBy: { centerCode: 'asc' } },
      events: {
        orderBy: [{ divisionId: 'asc' }, { gameId: 'asc' }, { subEventIndex: 'asc' }],
        include: {
          division: true,
          game: true,
          result: {
            include: {
              firstCenter: true,
              secondCenter: true,
              thirdCenter: true,
            },
          },
        },
      },
    },
  })
  if (!t) return null

  const divisions: DivisionDTO[] = t.divisions.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    ageRange: d.ageRange,
    gradeRange: d.gradeRange,
    participantQuota: d.participantQuota,
    displayOrder: d.displayOrder,
  }))

  const games: GameTypeDTO[] = t.games.map((g) => ({
    id: g.id,
    code: g.code,
    englishName: g.englishName,
    sinhalaName: g.sinhalaName,
    rulesSummary: g.rulesSummary,
  }))

  const centers = t.centers.map((c) => ({
    id: c.id,
    centerCode: c.centerCode,
    centerName: c.centerName,
    location: c.location,
  }))

  const events: EventDTO[] = t.events.map((e) => ({
    id: e.id,
    divisionId: e.divisionId,
    gameId: e.gameId,
    divisionCode: e.division.code,
    gameCode: e.game.code,
    gameName: e.game.englishName,
    gameSinhalaName: e.game.sinhalaName,
    subEventIndex: e.subEventIndex,
    label: e.label,
    status: e.status as EventDTO['status'],
    result: e.result
      ? {
          id: e.result.id,
          eventId: e.result.eventId,
          firstPlaceCenterId: e.result.firstPlaceCenterId,
          secondPlaceCenterId: e.result.secondPlaceCenterId,
          thirdPlaceCenterId: e.result.thirdPlaceCenterId,
          firstPlaceCode: e.result.firstCenter?.centerCode ?? null,
          secondPlaceCode: e.result.secondCenter?.centerCode ?? null,
          thirdPlaceCode: e.result.thirdCenter?.centerCode ?? null,
          recordedBy: e.result.recordedBy,
          notes: e.result.notes,
          recordedAt: e.result.recordedAt.toISOString(),
          updatedAt: e.result.updatedAt.toISOString(),
        }
      : null,
  }))

  const standings = computeStandings(
    centers,
    t.events.map((e) =>
      e.result
        ? {
            firstPlaceCenterId: e.result.firstPlaceCenterId,
            secondPlaceCenterId: e.result.secondPlaceCenterId,
            thirdPlaceCenterId: e.result.thirdPlaceCenterId,
          }
        : { firstPlaceCenterId: null, secondPlaceCenterId: null, thirdPlaceCenterId: null }
    ),
    { first: t.pointsFirst, second: t.pointsSecond, third: t.pointsThird }
  )

  return {
    tournament: toTournamentDTO(t),
    divisions,
    games,
    centers,
    events,
    standings,
    progress: computeProgress(t.events),
  }
}

// ── creation ──────────────────────────────────────────────────

interface CreateSpec {
  name: string
  organizer: string
  pointsFirst: number
  pointsSecond: number
  pointsThird: number
  templateId: string | null
  divisions: { code: string; name: string; ageRange: string; gradeRange: string; participantQuota: number }[]
  games: { code: string; englishName: string; sinhalaName: string; rulesSummary: string }[]
  eventCounts: Record<string, Record<string, number>>
  centers: { code: string; name: string }[]
}

/**
 * Materialises a full tournament from a spec. Runs inside a transaction —
 * a failure at any step (e.g. a duplicate division code) rolls everything
 * back so no half-built tournament is left behind.
 */
async function instantiate(spec: CreateSpec): Promise<string> {
  const slug = await uniqueSlug(spec.name)

  return db.$transaction(async (tx) => {
    const tournament = await tx.tournament.create({
      data: {
        name: spec.name,
        slug,
        organizer: spec.organizer,
        status: 'active',
        pointsFirst: spec.pointsFirst,
        pointsSecond: spec.pointsSecond,
        pointsThird: spec.pointsThird,
        templateId: spec.templateId,
      },
    })

    const divisionRows: { id: string; code: string }[] = []
    for (const [i, d] of spec.divisions.entries()) {
      divisionRows.push(
        await tx.division.create({
          data: {
            tournamentId: tournament.id,
            code: d.code,
            name: d.name,
            ageRange: d.ageRange,
            gradeRange: d.gradeRange,
            participantQuota: d.participantQuota,
            displayOrder: i + 1,
          },
          select: { id: true, code: true },
        })
      )
    }

    const gameRows: { id: string; code: string; englishName: string }[] = []
    for (const g of spec.games) {
      gameRows.push(
        await tx.gameType.create({
          data: {
            tournamentId: tournament.id,
            code: g.code,
            englishName: g.englishName,
            sinhalaName: g.sinhalaName,
            rulesSummary: g.rulesSummary,
          },
          select: { id: true, code: true, englishName: true },
        })
      )
    }

    // Pre-generate every event slot
    const eventCreateDatas = [] as {
      tournamentId: string
      divisionId: string
      gameId: string
      subEventIndex: number
      label: string
    }[]
    for (const division of divisionRows) {
      const byGame = spec.eventCounts[division.code] ?? {}
      for (const game of gameRows) {
        const count = byGame[game.code] ?? 0
        for (let i = 1; i <= count; i++) {
          eventCreateDatas.push({
            tournamentId: tournament.id,
            divisionId: division.id,
            gameId: game.id,
            subEventIndex: i,
            label: `Cat ${division.code} - ${game.englishName} - Event ${i}`,
          })
        }
      }
    }
    if (eventCreateDatas.length > 0) {
      await tx.tournamentEvent.createMany({ data: eventCreateDatas })
    }

    if (spec.centers.length > 0) {
      await tx.center.createMany({
        data: spec.centers.map((c) => ({
          tournamentId: tournament.id,
          centerCode: c.code,
          centerName: c.name,
        })),
      })
    }

    return tournament.id
  })
}

export async function createFromPreset(presetId: string, nameOverride?: string): Promise<string> {
  const preset = getPresetById(presetId)
  if (!preset) throw new Error('Unknown preset')
  return instantiate(presetToSpec(preset, nameOverride))
}

export function presetToSpec(preset: TournamentPreset, nameOverride?: string): CreateSpec {
  return {
    name: nameOverride?.trim() || preset.name,
    organizer: preset.organizer,
    pointsFirst: preset.pointsFirst,
    pointsSecond: preset.pointsSecond,
    pointsThird: preset.pointsThird,
    templateId: preset.id,
    divisions: preset.divisions.map((d) => ({
      code: d.code,
      name: d.name,
      ageRange: d.ageRange,
      gradeRange: d.gradeRange,
      participantQuota: d.participantQuota,
    })),
    games: preset.games.map((g) => ({
      code: g.code,
      englishName: g.englishName,
      sinhalaName: g.sinhalaName,
      rulesSummary: g.rulesSummary,
    })),
    eventCounts: preset.eventCounts,
    centers: preset.centerCodes.map((code) => ({ code, name: '' })),
  }
}

export async function createFromCustom(payload: CustomTournamentPayload): Promise<string> {
  const name = payload.name.trim()
  if (!name) throw new Error('Tournament name is required')
  const divisions = payload.divisions.filter((d) => d.code.trim())
  const games = payload.games.filter((g) => g.englishName.trim())
  if (divisions.length === 0) throw new Error('At least one division is required')
  if (games.length === 0) throw new Error('At least one game is required')

  const eventCounts: Record<string, Record<string, number>> = {}
  for (const d of divisions) {
    eventCounts[d.code] = {}
    for (const g of games) {
      const n = Math.max(0, Math.min(20, Number(payload.matrix?.[d.code]?.[g.code] ?? 0) || 0))
      if (n > 0) eventCounts[d.code][g.code] = n
    }
  }

  return instantiate({
    name,
    organizer: payload.organizer.trim(),
    pointsFirst: clampPoints(payload.pointsFirst, 75),
    pointsSecond: clampPoints(payload.pointsSecond, 50),
    pointsThird: clampPoints(payload.pointsThird, 25),
    templateId: null,
    divisions: divisions.map((d) => ({
      code: d.code.trim().toUpperCase(),
      name: d.name.trim() || `Category ${d.code.trim().toUpperCase()}`,
      ageRange: d.ageRange.trim(),
      gradeRange: d.gradeRange.trim(),
      participantQuota: 5,
    })),
    games: games.map((g) => ({
      code: (g.code.trim() || slugify(g.englishName)).toLowerCase(),
      englishName: g.englishName.trim(),
      sinhalaName: g.sinhalaName.trim(),
      rulesSummary: g.rulesSummary.trim(),
    })),
    eventCounts,
    centers: parseCentersText(payload.centersText ?? ''),
  })
}

function clampPoints(v: number, fallback: number): number {
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.round(n)
}

// ── clone ─────────────────────────────────────────────────────

export async function cloneTournament(tournamentId: string, newName: string): Promise<string> {
  const t = await db.tournament.findUnique({
    where: { id: tournamentId },
    include: {
      divisions: true,
      games: true,
      centers: true,
    },
  })
  if (!t) throw new Error('Tournament not found')

  return instantiate({
    name: newName.trim() || `${t.name} (Copy)`,
    organizer: t.organizer,
    pointsFirst: t.pointsFirst,
    pointsSecond: t.pointsSecond,
    pointsThird: t.pointsThird,
    templateId: t.templateId,
    divisions: [...t.divisions]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((d) => ({
        code: d.code,
        name: d.name,
        ageRange: d.ageRange,
        gradeRange: d.gradeRange,
        participantQuota: d.participantQuota,
      })),
    games: t.games.map((g) => ({
      code: g.code,
      englishName: g.englishName,
      sinhalaName: g.sinhalaName,
      rulesSummary: g.rulesSummary,
    })),
    eventCounts: await buildEventCountsFromDb(tournamentId),
    centers: t.centers.map((c) => ({ code: c.centerCode, name: c.centerName })),
  })
}

async function buildEventCountsFromDb(tournamentId: string) {
  const events = await db.tournamentEvent.findMany({
    where: { tournamentId },
    select: { division: { select: { code: true } }, game: { select: { code: true } } },
  })
  const counts: Record<string, Record<string, number>> = {}
  for (const e of events) {
    const d = e.division.code
    const g = e.game.code
    counts[d] = counts[d] ?? {}
    counts[d][g] = (counts[d][g] ?? 0) + 1
  }
  return counts
}
