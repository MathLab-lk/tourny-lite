'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
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
import { AnimatedNumber } from '@/components/tournament/ui-bits'
import { RankingsModeToggle, StudentRankingsStage, type RankingsMode } from '@/components/tournament/student-rankings-stage'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'

/**
 * Full-screen projector scoreboard — the same liquid-glass night
 * as the rest of the app (aurora, starfield, glass panels, one
 * steel-blue accent), with medal tones reserved for podium
 * semantics. Presented modally on top of the app; closing it returns
 * to the presenter's context. Two acts on the same stage: the
 * center standings table, and — when the tournament scores
 * students — the student ranking with its awards-ceremony podium
 * reveal.
 */
export function ScoreboardView() {
  const detail = useAppStore((s) => s.detail)
  const loading = useAppStore((s) => s.loadingDetail)
  const sseConnected = useAppStore((s) => s.sseConnected)
  const lastUpdated = useAppStore((s) => s.lastUpdated)
  const closeScoreboard = useAppStore((s) => s.closeScoreboard)
  const printSheet = useAppStore((s) => s.printSheet)

  const [mode, setMode] = useState<RankingsMode>('centers')

  const tournament = detail?.tournament
  const standings = detail?.standings ?? []
  const progress = detail?.progress
  const studentStandings = detail?.studentStandings ?? []
  const hasStudents = (detail?.students.length ?? 0) > 0

  // Escape dismisses the presentation, like any modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeScoreboard()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeScoreboard])

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
    if (rank === 1) return <Crown className="h-5 w-5 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]" aria-hidden />
    if (rank === 2) return <Medal className="h-5 w-5 text-zinc-300" aria-hidden />
    if (rank === 3) return <Award className="h-5 w-5 text-orange-600" aria-hidden />
    return <span className="font-semibold text-muted-foreground tabular-nums">{rank}</span>
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="dark fixed inset-0 z-50 overflow-y-auto bg-background text-foreground print:hidden"
    >
      {/* The app's atmosphere, full strength — same world as the app
          behind it and the guest scoreboard. */}
      <div className="aurora print:hidden" aria-hidden />
      <div className="stars print:hidden" aria-hidden />
      <div className="stars-twinkle print:hidden" aria-hidden />
      <div className="vignette print:hidden" aria-hidden />
      <div className="noise print:hidden" aria-hidden />

      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex items-center justify-end gap-2 bg-gradient-to-b from-background/90 to-transparent p-3">
        <span
          className={cn(
            'mr-auto flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wider',
            sseConnected ? 'border-emerald-500/40 text-emerald-400' : 'border-amber-500/40 text-amber-400'
          )}
        >
          <Wifi className={cn('h-3.5 w-3.5', sseConnected && 'animate-pulse')} aria-hidden />
          {sseConnected ? 'LIVE' : 'RECONNECTING…'}
        </span>
        <Button size="sm" variant="ghost" className="gap-1.5 text-foreground/70 hover:bg-white/10 hover:text-foreground" onClick={goFullscreen}>
          <Expand className="h-4 w-4" aria-hidden /> Fullscreen
        </Button>
        {mode === 'students' ? (
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-foreground/70 hover:bg-white/10 hover:text-foreground"
            onClick={() => printSheet('students')}
            title="Print the student ranking sheet"
          >
            <Printer className="h-4 w-4" aria-hidden /> Print
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5 text-foreground/70 hover:bg-white/10 hover:text-foreground"
          onClick={closeScoreboard}
        >
          <X className="h-4 w-4" aria-hidden /> Exit
        </Button>
      </div>

      <div className="relative z-[1] mx-auto w-full max-w-6xl px-4 pb-16 sm:px-8">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="pt-2 text-center"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-primary">
            {tournament?.organizer || 'Live Scoreboard'}
          </p>
          <h1 className="mt-2 text-balance text-4xl font-semibold tracking-tight text-foreground drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] sm:text-6xl">
            {tournament?.name ?? 'Tournament'}
          </h1>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold">
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-amber-400">
              1st × {tournament?.pointsFirst ?? 75}
            </span>
            <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-zinc-300">
              2nd × {tournament?.pointsSecond ?? 50}
            </span>
            <span className="rounded-full border border-orange-400/30 bg-orange-400/10 px-3 py-1 text-orange-400">
              3rd × {tournament?.pointsThird ?? 25}
            </span>
          </div>
        </motion.header>

        {/* Progress */}
        {progress ? (
          <div className="mx-auto mt-8 max-w-3xl">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-muted-foreground">
                Completed: <span className="text-primary tabular-nums">{progress.completed}</span>
                {' / '}{progress.total} events
              </span>
              <span className="font-semibold text-foreground">
                <AnimatedNumber value={progress.percent} />%
              </span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-foreground/10 ring-1 ring-white/5">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress.percent}%` }}
                transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary shadow-[0_0_18px_var(--glow)]"
                role="progressbar"
                aria-valuenow={progress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Events completed"
              />
            </div>
          </div>
        ) : null}

        {/* Act switch — center standings or the student ranking
            stage. Only offered when the tournament actually tracks
            students. */}
        {hasStudents ? (
          <div className="mt-8 flex justify-center">
            <RankingsModeToggle mode={mode} onChange={setMode} />
          </div>
        ) : null}

        {mode === 'students' ? (
          /* The student ranking — awards-ceremony podium reveal,
             then the live field. */
          <StudentRankingsStage rows={studentStandings} className="mt-6" />
        ) : (
        <>
        {/* Leaderboard — 3D stage entrance */}
        <div className="mt-8 [perspective:1400px]">
          <motion.div
            initial={{ rotateX: -9, y: 28, opacity: 0 }}
            animate={{ rotateX: 0, y: 0, opacity: 1 }}
            transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            style={{ transformOrigin: 'top center' }}
            className="overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl shadow-black/40 backdrop-blur"
          >
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-white/10 bg-secondary/50 text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="px-4 py-4 text-center font-semibold sm:px-6">Rank</th>
                  <th className="px-4 py-4 font-semibold sm:px-6">Center</th>
                  <th className="px-4 py-4 font-semibold sm:px-6">Name</th>
                  <th className="px-4 py-4 text-center font-semibold text-amber-400/90 sm:px-6">1st (×{tournament?.pointsFirst ?? 75})</th>
                  <th className="px-4 py-4 text-center font-semibold text-zinc-300 sm:px-6">2nd (×{tournament?.pointsSecond ?? 50})</th>
                  <th className="px-4 py-4 text-center font-semibold text-orange-400/90 sm:px-6">3rd (×{tournament?.pointsThird ?? 25})</th>
                  <th className="px-4 py-4 text-right font-semibold text-foreground sm:px-6">Total</th>
                </tr>
              </thead>
              <tbody>
                {/* Rows glide when live results re-order the
                    standings — a rank change is a smooth climb, not
                    a jump. */}
                {standings.map((row, i) => (
                  <motion.tr
                    key={row.centerId}
                    layout="position"
                    initial={{ opacity: 0, x: -18 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      delay: 0.35 + i * 0.07,
                      duration: 0.5,
                      ease: [0.16, 1, 0.3, 1],
                      layout: { type: 'spring', stiffness: 300, damping: 32 },
                    }}
                    className={cn(
                      'border-b border-white/5 border-l-4 transition-colors last:border-0 hover:bg-white/[0.04]',
                      rankStyle(row.rank)
                    )}
                  >
                    <td className="px-4 py-4 text-center sm:px-6">
                      <span className="flex items-center justify-center font-semibold">
                        <RankIcon rank={row.rank} />
                      </span>
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <span className="text-2xl font-semibold tabular-nums tracking-wide text-foreground sm:text-3xl">{row.centerCode}</span>
                    </td>
                    <td className="px-4 py-4 text-muted-foreground sm:px-6">
                      {row.centerName || <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className={cn('px-4 py-4 text-center text-xl font-semibold sm:px-6', row.gold > 0 ? 'text-amber-400' : 'text-foreground/25')}>
                      <AnimatedNumber value={row.gold} />
                    </td>
                    <td className={cn('px-4 py-4 text-center text-xl font-semibold sm:px-6', row.silver > 0 ? 'text-zinc-200' : 'text-foreground/25')}>
                      <AnimatedNumber value={row.silver} />
                    </td>
                    <td className={cn('px-4 py-4 text-center text-xl font-semibold sm:px-6', row.bronze > 0 ? 'text-orange-400' : 'text-foreground/25')}>
                      <AnimatedNumber value={row.bronze} />
                    </td>
                    <td className="px-4 py-4 text-right sm:px-6">
                      <span className="text-3xl font-semibold text-foreground drop-shadow-[0_2px_12px_rgba(255,255,255,0.15)] sm:text-4xl">
                        <AnimatedNumber value={row.total} />
                      </span>
                    </td>
                  </motion.tr>
                ))}
                {standings.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center text-muted-foreground">
                      {loading ? 'Loading…' : 'Standings appear here as soon as centers are added and results are recorded.'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </motion.div>
        </div>
        </>
        )}

        {/* Footer meta */}
        <p className="mt-5 flex flex-wrap items-center justify-center gap-3 text-[11px] text-muted-foreground/70">
          {mode === 'centers' ? (
            <span className="flex items-center gap-1.5">
              <Trophy className="h-3.5 w-3.5" aria-hidden />
              Tie-break order: total, then first, second and third places
            </span>
          ) : null}
          {lastUpdated ? (
            <>
              <span aria-hidden>·</span>
              <span className="tabular-nums">
                Updated {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </>
          ) : null}
        </p>
      </div>
    </motion.div>
  )
}
