import type { View } from '@/store/app-store'

/*
 * The app's URL model — the address bar is the source of truth for
 * where you are, so every view can be linked, bookmarked, shared and
 * restored with the browser's back button:
 *
 *   /                   → Tournaments (home)
 *   /t/{id}             → a tournament's Overview (the bird's-eye
 *                        event matrix — results are recorded right
 *                        from its event dialogs)
 *   /t/{id}/centers     → Centers
 *   /t/{id}/students    → Students (registration + ranking)
 *   /t/{id}/history     → History
 *   /t/{id}/settings    → Settings (admins)
 *
 * Legacy /t/{id}/scoring links (the retired field console) land on
 * the Overview — its event dialog carries the same recording flows.
 *
 * The public guest scoreboard lives outside this model at
 * /present/{id} — a standalone page with no app chrome and no
 * sign-in, built for links shared over WhatsApp.
 */

export type TournamentView = Exclude<View, 'home'>
export type AppRoute = { view: 'home' } | { view: TournamentView; tid: string }

const VIEW_SEGMENTS: readonly TournamentView[] = [
  'overview',
  'centers',
  'students',
  'history',
  'settings',
] as const

/** Parses a catch-all slug into a route; null means the path does
 *  not exist and should render the app's 404. */
export function parseAppRoute(slug: string[]): AppRoute | null {
  if (slug.length === 0) return { view: 'home' }
  if (slug[0] !== 't' || slug.length < 2 || slug.length > 3) return null
  const tid = slug[1]
  if (!tid) return null
  if (slug.length === 2) return { view: 'overview', tid }
  // The retired Scoring console consolidated into the Overview —
  // keep its old links working.
  if (slug[2] === 'scoring') return { view: 'overview', tid }
  const view = slug[2] as TournamentView
  if (!VIEW_SEGMENTS.includes(view)) return null
  return { view, tid }
}

/** The URL for a view — the single source every navigation goes
 *  through, so the address bar and the app can never drift apart. */
export function viewPath(view: View, tid: string | null): string {
  if (view === 'home' || !tid) return '/'
  const enc = encodeURIComponent(tid)
  return view === 'overview' ? `/t/${enc}` : `/t/${enc}/${view}`
}
