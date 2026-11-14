'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MotionConfig } from 'framer-motion'
import { useToast } from '@/hooks/use-toast'
import { registerAppRouter, navReplace } from '@/lib/nav'
import type { AppRoute } from '@/lib/app-route'
import { useAppStore } from '@/store/app-store'
import { AppShell } from '@/components/tournament/app-shell'
import { HomeView } from '@/components/tournament/home-view'
import { ScoringView } from '@/components/tournament/scoring-view'
import { ScoreboardView } from '@/components/tournament/scoreboard-view'
import { OverviewView } from '@/components/tournament/manage/overview-view'
import { CentersView } from '@/components/tournament/manage/centers-view'
import { StudentsView } from '@/components/tournament/manage/students-view'
import { HistoryView } from '@/components/tournament/manage/history-view'
import { SettingsView } from '@/components/tournament/manage/settings-view'
import { PrintSheets } from '@/components/tournament/print-sheets'
import { AuthDialog } from '@/components/tournament/auth-dialog'
import { TeamDialog } from '@/components/tournament/team-dialog'

/**
 * The application root. The route (from the URL) is applied to the
 * store on every change — the address bar is the single source of
 * truth for where you are; navigation actions only ever push URLs.
 *
 * `variant` comes from the server (APP_VARIANT env) so the
 * experimental build can badge itself in the shell.
 */
export function TournyApp({ route, variant = '' }: { route: AppRoute; variant?: string }) {
  const router = useRouter()
  const { toast } = useToast()
  const view = useAppStore((s) => s.view)
  const scoreboardOpen = useAppStore((s) => s.scoreboardOpen)
  const hydrate = useAppStore((s) => s.hydrate)
  const setOnline = useAppStore((s) => s.setOnline)
  const applyRoute = useAppStore((s) => s.applyRoute)
  const missingTournament = useAppStore((s) => s.missingTournament)

  // Hand the router to the store so navigation actions can push.
  useEffect(() => {
    registerAppRouter(router)
    return () => registerAppRouter(null)
  }, [router])

  useEffect(() => {
    hydrate()
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    setOnline(navigator.onLine)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [hydrate, setOnline])

  // URL → store. Runs on mount and on every navigation (including
  // the browser's back and forward buttons).
  useEffect(() => {
    void applyRoute(route)
  }, [applyRoute, route])

  // A link to a tournament that no longer exists (deleted, or a
  // mistyped address) — say so once, then land on the list.
  useEffect(() => {
    if (!missingTournament) return
    useAppStore.setState({ missingTournament: false })
    navReplace('/')
    toast({ title: 'Tournament not found', description: 'It may have been removed.' })
  }, [missingTournament, toast])

  return (
    <MotionConfig reducedMotion="user">
      <AppShell variant={variant}>
        {view === 'home' ? <HomeView /> : null}
        {view === 'scoring' ? <ScoringView /> : null}
        {view === 'overview' ? <OverviewView /> : null}
        {view === 'centers' ? <CentersView /> : null}
        {view === 'students' ? <StudentsView /> : null}
        {view === 'history' ? <HistoryView /> : null}
        {view === 'settings' ? <SettingsView /> : null}
      </AppShell>
      <AuthDialog />
      <TeamDialog />
      {/* The scoreboard is a full-screen presentation mode. It mounts
          above the app chrome without disturbing navigation — closing
          it always returns to wherever the presenter came from. */}
      {scoreboardOpen ? <ScoreboardView /> : null}
      {/* Print sheet lives at the root, outside every app wrapper,
          and only mounts while a print is in flight. */}
      <PrintSheets />
    </MotionConfig>
  )
}
