'use client'

import { useEffect } from 'react'
import { TopNav } from '@/components/tournament/top-nav'
import { HomeView } from '@/components/tournament/home-view'
import { JudgeView } from '@/components/tournament/judge-view'
import { ScoreboardView } from '@/components/tournament/scoreboard-view'
import { MeView } from '@/components/tournament/me-view'
import { PrintSheets } from '@/components/tournament/print-sheets'
import { AuthDialog } from '@/components/tournament/auth-dialog'
import { TeamDialog } from '@/components/tournament/team-dialog'
import { useAppStore } from '@/store/app-store'

export default function Page() {
  const view = useAppStore((s) => s.view)
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

  // Scoreboard is a full-screen projector overlay
  if (view === 'scoreboard') {
    return (
      <>
        <ScoreboardView />
        <PrintSheets />
      </>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-background print:hidden">
      <TopNav />
      <main className="flex-1">
        {view === 'home' ? <HomeView /> : null}
        {view === 'judge' ? <JudgeView /> : null}
        {view === 'me' ? <MeView /> : null}
      </main>
      <footer className="mt-auto border-t bg-muted/30">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground sm:px-6">
          <span>Tourny Lite — tournament management &amp; live scoring</span>
          <span>Results update live · Sign in to record results</span>
        </div>
      </footer>
      <PrintSheets />
      <AuthDialog />
      <TeamDialog />
    </div>
  )
}
