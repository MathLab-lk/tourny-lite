'use client'

import { create } from 'zustand'
import type {
  AdminUserDTO,
  AuditEntryDTO,
  CustomTournamentPayload,
  ResultSubmitPayload,
  SessionUserDTO,
  TournamentDetailDTO,
  TournamentSummaryDTO,
} from '@/lib/types'

export type View = 'home' | 'judge' | 'scoreboard' | 'me'
export type PrintMode = 'progress' | 'awards' | null

const ACTIVE_KEY = 'tourny_lite_active'
const queueKey = (tid: string) => `tourny_lite_queue_${tid}`

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

function readQueue(tid: string): ResultSubmitPayload[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(window.localStorage.getItem(queueKey(tid)) ?? '[]') as ResultSubmitPayload[]
  } catch {
    return []
  }
}

function writeQueue(tid: string, queue: ResultSubmitPayload[]) {
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

  // Session (public read / authenticated write)
  session: SessionUserDTO | null
  setupRequired: boolean
  loadingSession: boolean
  authDialogOpen: boolean
  teamDialogOpen: boolean
  users: AdminUserDTO[]

  setView: (view: View) => void
  hydrate: () => void
  setAuthDialogOpen: (open: boolean) => void
  setTeamDialogOpen: (open: boolean) => void
  loadSession: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  completeSetup: (name: string, email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  signOut: () => Promise<void>
  loadUsers: () => Promise<void>
  createUser: (input: { name: string; email: string; password: string; role: string }) => Promise<{ ok: boolean; error?: string }>
  updateUser: (id: string, patch: { role?: string; active?: boolean; password?: string }) => Promise<{ ok: boolean; error?: string }>
  deleteUser: (id: string) => Promise<{ ok: boolean; error?: string }>

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
  resetResult: (eventId: string, reason: string) => Promise<boolean>
  setEventStatus: (eventId: string, status: string) => Promise<boolean>
  addCenters: (centersText: string) => Promise<boolean>
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

  session: null,
  setupRequired: false,
  loadingSession: true,
  authDialogOpen: false,
  teamDialogOpen: false,
  users: [],

  setView: (view) => set({ view }),

  hydrate: () => {
    if (get().hydrated) return
    const active =
      typeof window !== 'undefined' ? window.localStorage.getItem(ACTIVE_KEY) : null
    set({ hydrated: true, online: typeof navigator !== 'undefined' ? navigator.onLine : true })
    void get().loadSession()
    get().loadTournaments().then(() => {
      if (active && get().tournaments.some((t) => t.id === active)) {
        get().openTournament(active)
      }
    })
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

  openTournament: async (id, view) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(ACTIVE_KEY, id)
    set({ activeTournamentId: id, view: view ?? 'judge', loadingDetail: true })
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    const es = new EventSource(`/api/stream?tournamentId=${encodeURIComponent(id)}`)
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
      const stillExists = get().tournaments.some((t) => t.id === id)
      if (!stillExists) get().closeTournament()
    }
  },

  closeTournament: () => {
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    if (typeof window !== 'undefined') window.localStorage.removeItem(ACTIVE_KEY)
    set({ activeTournamentId: null, detail: null, audit: [], view: 'home', sseConnected: false })
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
      if (get().activeTournamentId === id) get().closeTournament()
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
        queue.push(payload)
        writeQueue(tid, queue)
        return { ok: true, queued: true }
      }
      const message = err instanceof Error ? err.message : 'Failed to submit result'
      return { ok: false, queued: false, error: message }
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
    const remaining: ResultSubmitPayload[] = []
    for (const payload of queue) {
      try {
        await api('/api/results', { method: 'POST', body: JSON.stringify(payload) })
      } catch (err) {
        const offline = err instanceof TypeError
        const unauthenticated = err instanceof ApiError && err.status === 401
        if (offline || unauthenticated) {
          // Still offline or signed out — keep the rest queued.
          remaining.push(payload)
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
    if (!printListenerBound) {
      printListenerBound = true
      window.addEventListener('afterprint', () => set({ printMode: null }))
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          window.print()
        } catch {
          set({ printMode: null })
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
