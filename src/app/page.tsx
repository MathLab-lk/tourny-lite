'use client'

import { useEffect } from 'react'
import { AppShell } from '@/components/tournament/app-shell'
import { HomeView } from '@/components/tournament/home-view'
import { ScoringView } from '@/components/tournament/scoring-view'
import { ScoreboardView } from '@/components/tournament/scoreboard-view'
import { OverviewView } from '@/components/tournament/manage/overview-view'
import { CentersView } from '@/components/tournament/manage/centers-view'
import { HistoryView } from '@/components/tournament/manage/history-view'
import { SettingsView } from '@/components/tournament/manage/settings-view'
import { PrintSheets } from '@/components/tournament/print-sheets'
import { AuthDialog } from '@/components/tournament/auth-dialog'
import { TeamDialog } from '@/components/tournament/team-dialog'
import { useAppStore } from '@/store/app-store'
import { MotionConfig } from 'framer-motion'

export default function Page() {
  const view = useAppStore((s) => s.view)
  const scoreboardOpen = useAppStore((s) => s.scoreboardOpen)
  const hydrate = useAppStore((s) => s.hydrate)
  const setOnline = useAppStore((s) => s.setOnline)

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

  return (
    <MotionConfig reducedMotion="user">
      <AppShell>
        {view === 'home' ? <HomeView /> : null}
        {view === 'scoring' ? <ScoringView /> : null}
        {view === 'overview' ? <OverviewView /> : null}
        {view === 'centers' ? <CentersView /> : null}
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
