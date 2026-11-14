// Shared domain types used by both API layer and client components.

export type TournamentStatus = 'draft' | 'active' | 'completed' | 'archived'
export type EventStatus = 'pending' | 'in_progress' | 'completed'
export type AuditAction = 'created' | 'updated' | 'reset'
export type UserRole = 'admin' | 'judge'

export interface SessionUserDTO {
  id: string
  email: string
  name: string
  role: UserRole
}

export interface AdminUserDTO extends SessionUserDTO {
  active: boolean
  createdAt: string
}

export interface InviteDTO {
  id: string
  code: string
  role: UserRole
  createdBy: string
  createdAt: string
  expiresAt: string | null
  usedAt: string | null
  usedByName: string | null
}

export interface TournamentDTO {
  id: string
  name: string
  slug: string
  organizer: string
  status: TournamentStatus
  pointsFirst: number
  pointsSecond: number
  pointsThird: number
  templateId: string | null
  createdAt: string
  updatedAt: string
}

export interface DivisionDTO {
  id: string
  code: string
  name: string
  ageRange: string
  gradeRange: string
  participantQuota: number
  displayOrder: number
}

export interface GameTypeDTO {
  id: string
  code: string
  englishName: string
  sinhalaName: string
  rulesSummary: string
}

export interface CenterDTO {
  id: string
  centerCode: string
  centerName: string
  location: string
}

export interface StudentDTO {
  id: string
  name: string
  centerId: string | null
  centerCode: string | null
  createdAt: string
}

export interface StudentScoreDTO {
  eventId: string
  studentId: string
  marks: number
  recordedBy: string
  updatedAt: string
}

/** One center's aggregate in a student-scored event: the sum of its
 *  students' marks and the place that sum earns. */
export interface CenterSumRow {
  centerId: string
  centerCode: string
  sum: number
  place: number // 1 | 2 | 3 | 0 (= off the podium)
}

export interface StudentStandingRow {
  rank: number
  studentId: string
  name: string
  centerId: string | null
  centerCode: string | null
  /** number of scored events this student participated in */
  events: number
  /** best single-event mark */
  best: number
  total: number
}

export interface ResultDTO {
  id: string
  eventId: string
  firstPlaceCenterId: string | null
  secondPlaceCenterId: string | null
  thirdPlaceCenterId: string | null
  firstPlaceCode: string | null
  secondPlaceCode: string | null
  thirdPlaceCode: string | null
  recordedBy: string
  notes: string
  derivedFromStudents: boolean
  recordedAt: string
  updatedAt: string
}

export interface EventDTO {
  id: string
  divisionId: string
  gameId: string
  divisionCode: string
  gameCode: string
  gameName: string
  gameSinhalaName: string
  subEventIndex: number
  label: string
  status: EventStatus
  /** podium = classic 3-tap center podium; students = per-student
   *  marks whose per-center sums derive the podium. */
  scoringMode: 'podium' | 'students'
  result: ResultDTO | null
}

export interface StandingRow {
  rank: number
  centerId: string
  centerCode: string
  centerName: string
  gold: number
  silver: number
  bronze: number
  total: number
}

export interface TournamentProgress {
  total: number
  completed: number
  inProgress: number
  pending: number
  percent: number
}

export interface TournamentDetailDTO {
  tournament: TournamentDTO
  divisions: DivisionDTO[]
  games: GameTypeDTO[]
  centers: CenterDTO[]
  events: EventDTO[]
  standings: StandingRow[]
  students: StudentDTO[]
  studentScores: StudentScoreDTO[]
  studentStandings: StudentStandingRow[]
  progress: TournamentProgress
}

export interface TournamentSummaryDTO extends TournamentDTO {
  divisionCount: number
  gameCount: number
  centerCount: number
  eventCount: number
  completedCount: number
}

export interface AuditEntryDTO {
  id: string
  eventId: string
  eventLabel: string
  action: AuditAction
  oldValues: string
  newValues: string
  reason: string
  actor: string
  timestamp: string
}

// ── Custom wizard payload ─────────────────────────────────────

export interface WizardDivisionInput {
  code: string
  name: string
  ageRange: string
  gradeRange: string
}

export interface WizardGameInput {
  code: string
  englishName: string
  sinhalaName: string
  rulesSummary: string
}

export interface CustomTournamentPayload {
  name: string
  organizer: string
  pointsFirst: number
  pointsSecond: number
  pointsThird: number
  divisions: WizardDivisionInput[]
  games: WizardGameInput[]
  /** matrix[divisionCode][gameCode] = number of event slots */
  matrix: Record<string, Record<string, number>>
  /** "101, 103, 105" or one per line; optional " - Name" suffix */
  centersText: string
}

export interface ResultSubmitPayload {
  eventId: string
  firstPlaceCenterId: string | null
  secondPlaceCenterId: string | null
  thirdPlaceCenterId: string | null
  recordedBy: string
  notes?: string
  /** required when overwriting an existing result (correction) */
  reason?: string
}

export interface StudentInput {
  name: string
  centerId?: string | null
}

export interface StudentScoresSubmitPayload {
  eventId: string
  /** The complete mark sheet for the event: every scored student
   *  with their custom marks. Students omitted from this list lose
   *  any previously recorded marks (full-sheet replace). */
  scores: { studentId: string; marks: number }[]
  recordedBy: string
  notes?: string
  /** required when overwriting an existing result (correction) */
  reason?: string
}
