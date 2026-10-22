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
