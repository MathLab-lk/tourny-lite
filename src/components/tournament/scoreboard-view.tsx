'use client'

import { useEffect, useState } from 'react'
import {
  Award,
  Crown,
  Expand,
  Medal,
  Printer,
  Trophy,
  Wifi,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'

/**
 * Full-screen projector scoreboard — high-contrast dark theme with
 * gold / silver / bronze rank accents, mirroring the printed mark sheet.
 */
export function ScoreboardView() {
  const detail = useAppStore((s) => s.detail)
  const loading = useAppStore((s) => s.loadingDetail)
  const sseConnected = useAppStore((s) => s.sseConnected)
  const lastUpdated = useAppStore((s) => s.lastUpdated)
  const setView = useAppStore((s) => s.setView)
  const closeTournament = useAppStore((s) => s.closeTournament)
  const printSheet = useAppStore((s) => s.printSheet)

  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const tournament = detail?.tournament
  const standings = detail?.standings ?? []
  const progress = detail?.progress

  const goFullscreen = () => {
    if (typeof document === 'undefined') return
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.()
    } else {
      void document.exitFullscreen?.()
    }
  }

  const rankStyle = (rank: number) => {
    if (rank === 1) return 'border-l-amber-400 bg-gradient-to-r from-amber-400/15 to-transparent'
    if (rank === 2) return 'border-l-zinc-400 bg-gradient-to-r from-zinc-400/10 to-transparent'
    if (rank === 3) return 'border-l-orange-700 bg-gradient-to-r from-orange-700/15 to-transparent'
    return 'border-l-transparent'
  }

  const RankIcon = ({ rank }: { rank: number }) => {
    if (rank === 1) return <Crown className="h-5 w-5 text-amber-400" aria-hidden />
    if (rank === 2) return <Medal className="h-5 w-5 text-zinc-300" aria-hidden />
    if (rank === 3) return <Award className="h-5 w-5 text-orange-600" aria-hidden />
    return <span className="font-semibold text-zinc-500 tabular-nums">{rank}</span>
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950 text-zinc-100 print:!hidden">
      {/* subtle radial glow */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.07),transparent_55%)]" aria-hidden />

      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex items-center justify-end gap-2 bg-gradient-to-b from-zinc-950/90 to-transparent p-3 print:hidden">
        <span className={cn('mr-auto flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wider', sseConnected ? 'border-emerald-500/40 text-emerald-400' : 'border-amber-500/40 text-amber-400')}>
          <Wifi className="h-3.5 w-3.5" aria-hidden />
          {sseConnected ? 'LIVE' : 'RECONNECTING…'}
        </span>
        <Button size="sm" variant="ghost" className="gap-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white" onClick={() => printSheet('awards')}>
          <Printer className="h-4 w-4" aria-hidden /> Awards sheet
        </Button>
        <Button size="sm" variant="ghost" className="gap-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white" onClick={goFullscreen}>
          <Expand className="h-4 w-4" aria-hidden /> Fullscreen
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 text-zinc-300 hover:bg-zinc-800 hover:text-white"
          onClick={() => (tournament ? setView('me') : closeTournament())}
        >
          <X className="h-4 w-4" aria-hidden /> Exit
        </Button>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-8">
        {/* Header */}
        <header className="pt-2 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-amber-400/90">
            {tournament?.organizer || 'Live Scoreboard'}
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-6xl">
            {tournament?.name ?? 'Tournament'}
          </h1>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold">
            <span className="rounded-full border border-amber-400/40 px-3 py-1 text-amber-300">
              1st × {tournament?.pointsFirst ?? 75}
            </span>
            <span className="rounded-full border border-zinc-400/40 px-3 py-1 text-zinc-300">
              2nd × {tournament?.pointsSecond ?? 50}
            </span>
            <span className="rounded-full border border-orange-600/50 px-3 py-1 text-orange-400">
              3rd × {tournament?.pointsThird ?? 25}
            </span>
          </div>
        </header>

        {/* Progress */}
        {progress ? (
          <div className="mx-auto mt-8 max-w-3xl">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-zinc-300">
                Completed: <span className="text-amber-400 tabular-nums">{progress.completed}</span>
                {' / '}{progress.total} events
              </span>
              <span className="font-semibold tabular-nums text-white">{progress.percent}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-700"
                style={{ width: `${progress.percent}%` }}
                role="progressbar"
                aria-valuenow={progress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Events completed"
              />
            </div>
          </div>
        ) : null}

        {/* Leaderboard table */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-2xl backdrop-blur">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/90 text-xs uppercase tracking-widest text-zinc-400">
                <th className="px-4 py-4 text-center font-semibold sm:px-6">Rank</th>
                <th className="px-4 py-4 font-semibold sm:px-6">Center</th>
                <th className="px-4 py-4 font-semibold sm:px-6">Name</th>
                <th className="px-4 py-4 text-center font-semibold text-amber-400/90 sm:px-6">1st (×{tournament?.pointsFirst ?? 75})</th>
                <th className="px-4 py-4 text-center font-semibold text-zinc-300 sm:px-6">2nd (×{tournament?.pointsSecond ?? 50})</th>
                <th className="px-4 py-4 text-center font-semibold text-orange-400/90 sm:px-6">3rd (×{tournament?.pointsThird ?? 25})</th>
                <th className="px-4 py-4 text-right font-semibold text-white sm:px-6">Total</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => (
                <tr
                  key={row.centerId}
                  className={cn('border-b border-zinc-800/70 border-l-4 transition-colors last:border-0 hover:bg-zinc-800/40', rankStyle(row.rank))}
                >
                  <td className="px-4 py-4 text-center sm:px-6">
                    <span className="flex items-center justify-center font-semibold">
                      <RankIcon rank={row.rank} />
                    </span>
                  </td>
                  <td className="px-4 py-4 sm:px-6">
                    <span className="text-2xl font-semibold tabular-nums tracking-wide text-white sm:text-3xl">{row.centerCode}</span>
                  </td>
                  <td className="px-4 py-4 text-zinc-300 sm:px-6">
                    {row.centerName || <span className="text-zinc-500">—</span>}
                  </td>
                  <td className="px-4 py-4 text-center text-xl font-semibold tabular-nums text-amber-400 sm:px-6">{row.gold}</td>
                  <td className="px-4 py-4 text-center text-xl font-semibold tabular-nums text-zinc-200 sm:px-6">{row.silver}</td>
                  <td className="px-4 py-4 text-center text-xl font-semibold tabular-nums text-orange-400 sm:px-6">{row.bronze}</td>
                  <td className="px-4 py-4 text-right sm:px-6">
                    <span className="text-3xl font-semibold tabular-nums text-white sm:text-4xl">{row.total}</span>
                  </td>
                </tr>
              ))}
              {standings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-zinc-400">
                    {loading ? 'Loading…' : 'Standings appear here as soon as centers are added and results are recorded.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Footer meta */}
        <p className="mt-5 flex flex-wrap items-center justify-center gap-3 text-[11px] text-zinc-500">
          <span className="flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5" aria-hidden />
            Tie-break order: total, then first, second and third places
          </span>
          <span aria-hidden>·</span>
          {lastUpdated ? (
            <span className="tabular-nums">
              Updated {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              {now ? ` · ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}
            </span>
          ) : null}
        </p>
      </div>
    </div>
  )
}
