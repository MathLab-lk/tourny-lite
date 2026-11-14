'use client'

import { create } from 'zustand'
import { navPush, navReplace } from '@/lib/nav'
import { viewPath, type AppRoute } from '@/lib/app-route'
import type {
  AdminUserDTO,
  AuditEntryDTO,
  CustomTournamentPayload,
  InviteDTO,
  ResultSubmitPayload,
  SessionUserDTO,
  StudentInput,
  StudentScoresSubmitPayload,
  TournamentDetailDTO,
  TournamentSummaryDTO,
} from '@/lib/types'

export type View =
  | 'home'
  | 'overview'
  | 'scoring'
  | 'centers'
  | 'students'
  | 'history'
  | 'settings'
export type PrintMode = 'progress' | 'students' | null

const queueKey = (tid: string) => `tourny_lite_queue_${tid}`

/** Offline submissions are queued on the device until the
 *  connection / session returns. Both scoring modes queue the same
 *  way; entries written before student marks existed have no kind
 *  and are normalized to podium payloads on read. */
type QueuedSubmission =
  | { kind: 'podium'; payload: ResultSubmitPayload }
  | { kind: 'students'; payload: StudentScoresSubmitPayload }

/** Error carrying the HTTP status so callers can branch on 401/403/404. */
class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new ApiError(body.error || `Request failed (${res.status})`, res.status)
  return body
}

function readQueue(tid: string): QueuedSubmission[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = JSON.parse(window.localStorage.getItem(queueKey(tid)) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw.map((item) => {
      const q = item as Partial<QueuedSubmission> & Partial<ResultSubmitPayload>
      if (q && (q as { kind?: string }).kind === 'students') {
        return { kind: 'students', payload: q.payload as StudentScoresSubmitPayload }
      }
      // Legacy entries (pre-student-marks) are bare podium payloads.
      return { kind: 'podium', payload: q as ResultSubmitPayload }
    })
  } catch {
    return []
  }
}

function writeQueue(tid: string, queue: QueuedSubmission[]) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(queueKey(tid), JSON.stringify(queue))
  window.dispatchEvent(new CustomEvent('tourny-queue-changed', { detail: tid }))
}

interface AppState {
  view: View
  activeTournamentId: string | null
  tournaments: TournamentSummaryDTO[]
  detail: TournamentDetailDTO | null
  audit: AuditEntryDTO[]
  loadingTournaments: boolean
  loadingDetail: boolean
  sseConnected: boolean
  lastUpdated: number | null
  online: boolean
  printMode: PrintMode
  hydrated: boolean
  // The scoreboard is a presentation mode (a modal thrown on a
  // projector), not a destination — so it lives outside the view
  // model and never disturbs the underlying navigation state.
  scoreboardOpen: boolean
  // Set when the URL points at a tournament that does not exist;
  // the app root toasts and lands on the tournament list.
  missingTournament: boolean

  // Session (public read / authenticated write)
  session: SessionUserDTO | null
  setupRequired: boolean
  loadingSession: boolean
  authDialogOpen: boolean
  teamDialogOpen: boolean
  users: AdminUserDTO[]
  invites: InviteDTO[]
  loadingInvites: boolean

  setView: (view: View) => void
  openScoreboard: () => void
  closeScoreboard: () => void
  hydrate: () => void
  /** URL → store: the only writer of view / activeTournamentId. */
  applyRoute: (route: AppRoute) => Promise<void>
  /** Clears the active tournament without touching the address bar. */
  applyHome: () => void
  setAuthDialogOpen: (open: boolean) => void
  setTeamDialogOpen: (open: boolean) => void
  loadSession: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  redeemInvite: (
    code: string,
    name: string,
    email: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>
  completeSetup: (name: string, email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  signOut: () => Promise<void>
  loadUsers: () => Promise<void>
  createUser: (input: { name: string; email: string; password: string; role: string }) => Promise<{ ok: boolean; error?: string }>
  updateUser: (id: string, patch: { role?: string; active?: boolean; password?: string }) => Promise<{ ok: boolean; error?: string }>
  deleteUser: (id: string) => Promise<{ ok: boolean; error?: string }>
  loadInvites: () => Promise<void>
  createInvite: (input: {
    role: 'admin' | 'judge'
    expiresInDays?: number
  }) => Promise<{ ok: boolean; code?: string; error?: string }>
  deleteInvite: (id: string) => Promise<{ ok: boolean; error?: string }>

  loadTournaments: () => Promise<void>
  openTournament: (id: string, view?: View) => Promise<void>
  refreshActive: () => Promise<void>
  closeTournament: () => void
  createFromPreset: (presetId: string, nameOverride?: string) => Promise<string | null>
  createCustom: (payload: CustomTournamentPayload) => Promise<string | null>
  cloneTournament: (id: string, name: string) => Promise<string | null>
  deleteTournament: (id: string) => Promise<boolean>
  updateTournament: (id: string, patch: Record<string, unknown>) => Promise<boolean>
  submitResult: (payload: ResultSubmitPayload) => Promise<{ ok: boolean; queued: boolean; error?: string }>
  submitStudentScores: (
    payload: StudentScoresSubmitPayload
  ) => Promise<{ ok: boolean; queued: boolean; error?: string }>
  addStudents: (inputs: StudentInput[]) => Promise<{ ok: boolean; error?: string }>
  updateStudent: (
    studentId: string,
    patch: { name?: string; centerId?: string | null }
  ) => Promise<{ ok: boolean; error?: string }>
  removeStudent: (studentId: string) => Promise<{ ok: boolean; error?: string }>
  resetResult: (eventId: string, reason: string) => Promise<boolean>
  setEventStatus: (eventId: string, status: string) => Promise<boolean>
  /** Adds event slots (and optionally a new category/game inline). */
  addEvents: (input: {
    divisionId?: string
    newDivision?: { code: string; name: string; ageRange?: string; gradeRange?: string }
    gameId?: string
    newGame?: { englishName: string; sinhalaName?: string; rulesSummary?: string }
    count?: number
    scoringMode?: 'podium' | 'students'
  }) => Promise<{ ok: boolean; added?: number; error?: string }>
  /** Edits an event slot: label, scoring mode (clean slots only) or status. */
  updateEvent: (
    eventId: string,
    patch: { label?: string; scoringMode?: 'podium' | 'students'; status?: string }
  ) => Promise<{ ok: boolean; error?: string }>
  /** Removes an event slot and everything recorded on it. */
  deleteEvent: (eventId: string) => Promise<{ ok: boolean; error?: string }>
  sendWhatsApp: (
    kind: 'test' | 'standings' | 'event',
    opts?: { tournamentId?: string; eventId?: string }
  ) => Promise<{ ok: boolean; via?: 'image' | 'text'; groupName?: string; error?: string }>
  addCenters: (centersText: string) => Promise<boolean>
  updateCenter: (
    centerId: string,
    patch: { code?: string; name?: string; location?: string }
  ) => Promise<{ ok: boolean; error?: string }>
  removeCenter: (centerId: string) => Promise<boolean>
  loadAudit: (tournamentId: string) => Promise<void>
  flushQueue: (tid?: string) => Promise<void>
  getQueueCount: (tid: string) => number
  printSheet: (mode: PrintMode) => void
  setOnline: (online: boolean) => void
}

let eventSource: EventSource | null = null
let printListenerBound = false

export const useAppStore = create<AppState>((set, get) => ({
  view: 'home',
  activeTournamentId: null,
  tournaments: [],
  detail: null,
  audit: [],
  loadingTournaments: false,
  loadingDetail: false,
  sseConnected: false,
  lastUpdated: null,
  online: true,
  printMode: null,
  hydrated: false,
  scoreboardOpen: false,
  missingTournament: false,

  session: null,
  setupRequired: false,
  loadingSession: true,
  authDialogOpen: false,
  teamDialogOpen: false,
  users: [],
  invites: [],
  loadingInvites: false,

  // ── Navigation ──────────────────────────────────────────
  // These actions push URLs; the app root applies whatever the
  // URL then says (applyRoute). The address bar is the source of
  // truth, so the store and the URL can never drift apart.

  setView: (view) => {
    navPush(viewPath(view, get().activeTournamentId))
  },

  openScoreboard: () => set({ scoreboardOpen: true }),

  closeScoreboard: () => set({ scoreboardOpen: false }),

  hydrate: () => {
    if (get().hydrated) return
    set({ hydrated: true, online: typeof navigator !== 'undefined' ? navigator.onLine : true })
    void get().loadSession()
    void get().loadTournaments()
    // Which tournament is open is owned by the URL now (see
    // applyRoute) — no stored "last tournament" to restore.
  },

  // ── Session ──────────────────────────────────────────────

  setAuthDialogOpen: (open) => set({ authDialogOpen: open }),
  setTeamDialogOpen: (open) => set({ teamDialogOpen: open }),

  loadSession: async () => {
    try {
      const data = await api<{ user: SessionUserDTO | null; setupRequired: boolean }>(
        '/api/auth/session'
      )
      set({ session: data.user, setupRequired: data.setupRequired, loadingSession: false })
    } catch {
      set({ session: null, loadingSession: false })
    }
  },

  signIn: async (email, password) => {
    try {
      const data = await api<{ user: SessionUserDTO }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      set({ session: data.user, setupRequired: false, authDialogOpen: false })
      void get().flushQueue()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Sign in failed' }
    }
  },

  redeemInvite: async (code, name, email, password) => {
    try {
      const data = await api<{ user: SessionUserDTO }>('/api/auth/redeem', {
        method: 'POST',
        body: JSON.stringify({ code, name, email, password }),
      })
      set({ session: data.user, authDialogOpen: false })
      void get().flushQueue()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Could not create the account' }
    }
  },

  completeSetup: async (name, email, password) => {
    try {
      const data = await api<{ user: SessionUserDTO }>('/api/auth/setup', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      })
      set({ session: data.user, setupRequired: false, authDialogOpen: false })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Setup failed' }
    }
  },

  signOut: async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } catch {
      // clearing local state is what matters
    }
    set({ session: null, users: [], teamDialogOpen: false })
  },

  // ── Team management (admin) ──────────────────────────────

  loadUsers: async () => {
    try {
      const data = await api<{ users: AdminUserDTO[] }>('/api/admin/users')
      set({ users: data.users })
    } catch {
      set({ users: [] })
    }
  },

  createUser: async (input) => {
    try {
      await api('/api/admin/users', { method: 'POST', body: JSON.stringify(input) })
      await get().loadUsers()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Could not create the account' }
    }
  },

  updateUser: async (id, patch) => {
    try {
      await api(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      await get().loadUsers()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Could not update the account' }
    }
  },

  deleteUser: async (id) => {
    try {
      await api(`/api/admin/users/${id}`, { method: 'DELETE' })
      await get().loadUsers()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Could not delete the account' }
    }
  },

  // ── Invitation codes (admin) ───────────────────────────────

  loadInvites: async () => {
    set({ loadingInvites: true })
    try {
      const data = await api<{ invites: InviteDTO[] }>('/api/admin/invites')
      set({ invites: data.invites, loadingInvites: false })
    } catch {
      set({ invites: [], loadingInvites: false })
    }
  },

  createInvite: async (input) => {
    try {
      const data = await api<{ invite: InviteDTO }>('/api/admin/invites', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      set({ invites: [data.invite, ...get().invites] })
      return { ok: true, code: data.invite.code }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Could not generate a code' }
    }
  },

  deleteInvite: async (id) => {
    try {
      await api(`/api/admin/invites/${id}`, { method: 'DELETE' })
      set({ invites: get().invites.filter((i) => i.id !== id) })
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Could not delete the code' }
    }
  },

  // ── Tournaments ──────────────────────────────────────────

  loadTournaments: async () => {
    set({ loadingTournaments: true })
    try {
      const data = await api<{ tournaments: TournamentSummaryDTO[] }>('/api/tournaments')
      set({ tournaments: data.tournaments, loadingTournaments: false })
    } catch {
      set({ loadingTournaments: false })
    }
  },

  // Opening a tournament is a navigation — push the URL; the app
  // root applies it (fetching the detail and wiring the stream).
  openTournament: async (id, view) => {
    navPush(viewPath(view ?? 'overview', id))
  },

  // ── URL → store ─────────────────────────────────────────
  // The app root calls this whenever the route changes (mount,
  // navigation, browser back/forward). It is the only writer of
  // `view` and `activeTournamentId` — navigation actions above
  // only push URLs, so there is exactly one direction of truth.

  applyRoute: async (route) => {
    const s = get()
    if (route.view === 'home') {
      if (s.activeTournamentId !== null) get().applyHome()
      return
    }
    if (route.tid !== s.activeTournamentId) {
      // A different tournament — open it silently (the URL already
      // points here, nothing to push).
      if (eventSource) {
        eventSource.close()
        eventSource = null
      }
      set({
        activeTournamentId: route.tid,
        view: route.view,
        loadingDetail: true,
        sseConnected: false,
      })
      const es = new EventSource(`/api/stream?tournamentId=${encodeURIComponent(route.tid)}`)
      es.addEventListener('ready', () => set({ sseConnected: true }))
      es.addEventListener('change', () => {
        void get().refreshActive()
        void get().loadTournaments()
      })
      es.onerror = () => {
        set({ sseConnected: false })
        // EventSource auto-reconnects; refresh data as a safety net
        void get().refreshActive()
      }
      eventSource = es
      await get().refreshActive()
      if (get().detail === null && get().activeTournamentId === route.tid) {
        // Nothing came back — either a bad link, or the tournament
        // list is still loading and we cannot tell yet.
        if (get().loadingTournaments) await get().loadTournaments()
        if (!get().tournaments.some((t) => t.id === route.tid)) {
          set({ missingTournament: true })
          get().applyHome()
          return
        }
        await get().refreshActive()
      }
      return
    }
    if (route.view !== s.view) set({ view: route.view })
  },

  applyHome: () => {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    set({
      activeTournamentId: null,
      detail: null,
      audit: [],
      view: 'home',
      sseConnected: false,
      scoreboardOpen: false,
    })
  },

  refreshActive: async () => {
    const id = get().activeTournamentId
    if (!id) return
    try {
      const detail = await api<TournamentDetailDTO>(`/api/tournaments/${id}`)
      set({ detail, loadingDetail: false, lastUpdated: Date.now() })
    } catch {
      // Tournament may have been deleted
      if (get().detail === null) set({ loadingDetail: false })
      const stillExists =
        get().loadingTournaments || get().tournaments.some((t) => t.id === id)
      if (!stillExists) {
        // Deleted while we were watching it — leave the URL alone
        // and flag it; the app root lands on the list.
        set({ missingTournament: true })
        get().applyHome()
      }
    }
  },

  // Leaving a tournament is a navigation too — back to the list.
  closeTournament: () => {
    navPush('/')
  },

  createFromPreset: async (presetId, nameOverride) => {
    try {
      const data = await api<{ id: string }>('/api/tournaments', {
        method: 'POST',
        body: JSON.stringify({ presetId, nameOverride }),
      })
      await get().loadTournaments()
      return data.id
    } catch {
      return null
    }
  },

  createCustom: async (payload) => {
    try {
      const data = await api<{ id: string }>('/api/tournaments', {
        method: 'POST',
        body: JSON.stringify({ custom: payload }),
      })
      await get().loadTournaments()
      return data.id
    } catch {
      return null
    }
  },

  cloneTournament: async (id, name) => {
    try {
      const data = await api<{ id: string }>(`/api/tournaments/${id}/clone`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      })
      await get().loadTournaments()
      return data.id
    } catch {
      return null
    }
  },

  deleteTournament: async (id) => {
    try {
      await api(`/api/tournaments/${id}`, { method: 'DELETE' })
      if (get().activeTournamentId === id) {
        // The URL points at a tournament that no longer exists —
        // clear the state and replace the dead address.
        get().applyHome()
        navReplace('/')
      }
      await get().loadTournaments()
      return true
    } catch {
      return false
    }
  },

  updateTournament: async (id, patch) => {
    try {
      await api(`/api/tournaments/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })
      await Promise.all([get().refreshActive(), get().loadTournaments()])
      return true
    } catch {
      return false
    }
  },

  // ── Results ──────────────────────────────────────────────

  submitResult: async (payload) => {
    const tid = get().activeTournamentId
    try {
      await api('/api/results', { method: 'POST', body: JSON.stringify(payload) })
      await Promise.all([get().refreshActive(), get().loadTournaments()])
      return { ok: true, queued: false }
    } catch (err) {
      const offline = err instanceof TypeError
      const unauthenticated = err instanceof ApiError && err.status === 401
      if ((offline || unauthenticated) && tid) {
        // Network down or session expired — keep the result on this device
        // and sync it once the connection / session is restored.
        const queue = readQueue(tid)
        queue.push({ kind: 'podium', payload })
        writeQueue(tid, queue)
        return { ok: true, queued: true }
      }
      const message = err instanceof Error ? err.message : 'Failed to submit result'
      return { ok: false, queued: false, error: message }
    }
  },

  submitStudentScores: async (payload) => {
    const tid = get().activeTournamentId
    try {
      await api('/api/results/students', { method: 'POST', body: JSON.stringify(payload) })
      await Promise.all([get().refreshActive(), get().loadTournaments()])
      return { ok: true, queued: false }
    } catch (err) {
      const offline = err instanceof TypeError
      const unauthenticated = err instanceof ApiError && err.status === 401
      if ((offline || unauthenticated) && tid) {
        // Mark sheets queue offline exactly like podium results.
        const queue = readQueue(tid)
        queue.push({ kind: 'students', payload })
        writeQueue(tid, queue)
        return { ok: true, queued: true }
      }
      const message = err instanceof Error ? err.message : 'Failed to submit student marks'
      return { ok: false, queued: false, error: message }
    }
  },

  // ── Students (roster + rankings) ──────────────────────

  addStudents: async (inputs) => {
    const tid = get().activeTournamentId
    if (!tid) return { ok: false, error: 'No tournament selected' }
    try {
      await api(`/api/tournaments/${tid}/students`, {
        method: 'POST',
        body: JSON.stringify({ students: inputs }),
      })
      await Promise.all([get().refreshActive(), get().loadTournaments()])
      return { ok: true }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not add the students',
      }
    }
  },

  updateStudent: async (studentId, patch) => {
    const tid = get().activeTournamentId
    if (!tid) return { ok: false, error: 'No tournament selected' }
    try {
      await api(`/api/tournaments/${tid}/students`, {
        method: 'PATCH',
        body: JSON.stringify({ studentId, ...patch }),
      })
      await Promise.all([get().refreshActive(), get().loadTournaments()])
      return { ok: true }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not update the student',
      }
    }
  },

  removeStudent: async (studentId) => {
    const tid = get().activeTournamentId
    if (!tid) return { ok: false, error: 'No tournament selected' }
    try {
      await api(`/api/tournaments/${tid}/students`, {
        method: 'DELETE',
        body: JSON.stringify({ studentId }),
      })
      await get().refreshActive()
      return { ok: true }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not remove the student',
      }
    }
  },

  resetResult: async (eventId, reason) => {
    try {
      await api(`/api/results/${eventId}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason }),
      })
      await Promise.all([get().refreshActive(), get().loadTournaments()])
      return true
    } catch {
      return false
    }
  },

  setEventStatus: async (eventId, status) => {
    try {
      await api(`/api/events/${eventId}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      await get().refreshActive()
      return true
    } catch {
      return false
    }
  },

  // ── Event slot management (admin) ───────────────────────

  addEvents: async (input) => {
    const tid = get().activeTournamentId
    if (!tid) return { ok: false, error: 'No tournament selected' }
    try {
      const out = await api<{ added: number }>(`/api/tournaments/${tid}/events`, {
        method: 'POST',
        body: JSON.stringify(input),
      })
      await Promise.all([get().refreshActive(), get().loadTournaments()])
      return { ok: true, added: out.added }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'The events could not be added.' }
    }
  },

  updateEvent: async (eventId, patch) => {
    try {
      await api(`/api/events/${eventId}`, { method: 'PATCH', body: JSON.stringify(patch) })
      await get().refreshActive()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'The event could not be updated.' }
    }
  },

  deleteEvent: async (eventId) => {
    try {
      await api(`/api/events/${eventId}`, { method: 'DELETE' })
      await Promise.all([get().refreshActive(), get().loadTournaments()])
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'The event could not be removed.' }
    }
  },

  // ── WhatsApp sharing (admin, configured in Settings) ─────

  sendWhatsApp: async (kind, opts) => {
    try {
      const data = await api<{ ok: boolean; via?: 'image' | 'text'; groupName?: string }>('/api/whatsapp/send', {
        method: 'POST',
        body: JSON.stringify({ kind, ...opts }),
      })
      return { ok: true, via: data.via, groupName: data.groupName }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'The message could not be sent.' }
    }
  },

  addCenters: async (centersText) => {
    const tid = get().activeTournamentId
    if (!tid) return false
    try {
      await api(`/api/tournaments/${tid}/centers`, {
        method: 'POST',
        body: JSON.stringify({ centersText }),
      })
      await get().refreshActive()
      await get().loadTournaments()
      return true
    } catch {
      return false
    }
  },

  updateCenter: async (centerId, patch) => {
    const tid = get().activeTournamentId
    if (!tid) return { ok: false, error: 'No tournament selected' }
    try {
      await api(`/api/tournaments/${tid}/centers`, {
        method: 'PATCH',
        body: JSON.stringify({ centerId, ...patch }),
      })
      await Promise.all([get().refreshActive(), get().loadTournaments()])
      return { ok: true }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not update the center',
      }
    }
  },

  removeCenter: async (centerId) => {
    const tid = get().activeTournamentId
    if (!tid) return false
    try {
      await api(`/api/tournaments/${tid}/centers`, {
        method: 'DELETE',
        body: JSON.stringify({ centerId }),
      })
      await get().refreshActive()
      return true
    } catch {
      return false
    }
  },

  loadAudit: async (tournamentId) => {
    try {
      const data = await api<{ entries: AuditEntryDTO[] }>(`/api/tournaments/${tournamentId}/audit`)
      set({ audit: data.entries })
    } catch {
      set({ audit: [] })
    }
  },

  flushQueue: async (tidArg) => {
    const tid = tidArg ?? get().activeTournamentId
    if (!tid) return
    const queue = readQueue(tid)
    if (queue.length === 0) return
    const remaining: QueuedSubmission[] = []
    for (const item of queue) {
      try {
        const url = item.kind === 'students' ? '/api/results/students' : '/api/results'
        await api(url, { method: 'POST', body: JSON.stringify(item.payload) })
      } catch (err) {
        const offline = err instanceof TypeError
        const unauthenticated = err instanceof ApiError && err.status === 401
        if (offline || unauthenticated) {
          // Still offline or signed out — keep the rest queued.
          remaining.push(item)
        }
        // Validation errors (other 4xx) are dropped: the event state
        // changed on the server; the operator can re-enter if needed.
      }
    }
    writeQueue(tid, remaining)
    await Promise.all([get().refreshActive(), get().loadTournaments()])
  },

  getQueueCount: (tid) => readQueue(tid).length,

  printSheet: (mode) => {
    set({ printMode: mode })
    if (typeof window === 'undefined') return
    // The class drives the print CSS: everything except the print
    // root is hidden, so stray portals (menus, dialogs, toasts) can
    // never leak into the printout.
    const root = document.documentElement
    root.classList.add('tourny-printing')
    const cleanup = () => {
      root.classList.remove('tourny-printing')
      set({ printMode: null })
    }
    if (!printListenerBound) {
      printListenerBound = true
      window.addEventListener('afterprint', cleanup)
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          window.print()
        } catch {
          cleanup()
        }
      })
    })
  },

  setOnline: (online) => {
    const was = get().online
    set({ online })
    if (!was && online) {
      void get().flushQueue()
    }
  },
}))

/** Convenience selectors for role gating in components. */
export const selectIsAdmin = (s: AppState) => s.session?.role === 'admin'
export const selectIsStaff = (s: AppState) => s.session !== null
