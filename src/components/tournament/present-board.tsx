'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Award, ChevronRight, Crown, Expand, Medal, Trophy, Wifi, WifiOff } from 'lucide-react'
import { AnimatedNumber } from '@/components/tournament/ui-bits'
import { cn } from '@/lib/utils'
import type { TournamentDetailDTO } from '@/lib/types'

/**
 * Public live scoreboard — the guest-facing twin of the in-app
 * presentation. No sign-in, no chrome: open the shared link from
 * WhatsApp and watch. Standings arrive over the same SSE stream the
 * staff app uses and reorder live; on phones the leaderboard table
 * becomes stacked result cards.
 */
export function PresentBoard({ id }: { id: string }) {
  const [detail, setDetail] = useState<TournamentDetailDTO | null>(null)
  const [connected, setConnected] = useState(false)
  const [gone, setGone] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)

  useEffect(() => {
    let es: EventSource | null = null
    let closed = false

    const load = async () => {
      try {
        const res = await fetch(`/api/tournaments/${encodeURIComponent(id)}`, {
          cache: 'no-store',
        })
        if (closed) return
        if (res.status === 404) {
          setGone(true)
          return
        }
        if (!res.ok) return // transient — the stream keeps retrying
        const data = (await res.json()) as TournamentDetailDTO
        if (closed) return
        setDetail(data)
        setGone(false)
        setUpdatedAt(Date.now())
      } catch {
        // Offline — EventSource reconnects and re-triggers the load.
      }
    }

    void load()
    es = new EventSource(`/api/stream?tournamentId=${encodeURIComponent(id)}`)
    es.addEventListener('ready', () => {
      setConnected(true)
      void load() // catch up on anything missed while disconnected
    })
    es.addEventListener('change', () => void load())
    es.onerror = () => setConnected(false) // it reconnects on its own

    return () => {
      closed = true
      es?.close()
    }
  }, [id])

  // The freshest recorded podium — the "what just happened" strip.
  const latest = useMemo(() => {
    if (!detail) return null
    const withResult = detail.events.filter((e) => e.result)
    if (withResult.length === 0) return null
    return withResult.reduce((a, b) =>
      Date.parse(b.result!.updatedAt) > Date.parse(a.result!.updatedAt) ? b : a
    )
  }, [detail])

  const tournament = detail?.tournament
  const standings = detail?.standings ?? []
  const progress = detail?.progress

  const goFullscreen = () => {
    if (typeof document === 'undefined') return
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.()
    else void document.exitFullscreen?.()
  }

  const rankStyle = (rank: number) => {
    if (rank === 1) return 'border-l-amber-400 bg-gradient-to-r from-amber-400/15 to-transparent'
    if (rank === 2) return 'border-l-zinc-400 bg-gradient-to-r from-zinc-400/10 to-transparent'
    if (rank === 3) return 'border-l-amber-700 bg-gradient-to-r from-amber-700/15 to-transparent'
    return 'border-l-transparent'
  }

  const RankIcon = ({ rank }: { rank: number }) => {
    if (rank === 1)
      return (
        <Crown
          className="h-5 w-5 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]"
          aria-hidden
        />
      )
    if (rank === 2) return <Medal className="h-5 w-5 text-zinc-300" aria-hidden />
    if (rank === 3) return <Award className="h-5 w-5 text-orange-600" aria-hidden />
    return <span className="font-semibold text-zinc-400 tabular-nums">{rank}</span>
  }

  return (
    <div className="dark min-h-screen bg-zinc-950 text-zinc-100">
      {/* Layered atmosphere: the app's starfield (full strength in the
          dark scope), gold spotlight, cool counter-glow, vignette, grain */}
      <div className="stars fixed" aria-hidden />
      <div className="stars-twinkle fixed" aria-hidden />
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(251,191,36,0.09),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(45,212,191,0.06),transparent_50%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.55))]"
        aria-hidden
      />
      <div className="noise" aria-hidden />

      {/* Connection pill + fullscreen — pinned to the top, never
          floating over the standings */}
      <div className="sticky top-0 z-10 flex items-center justify-center gap-2 bg-gradient-to-b from-zinc-950/90 to-transparent p-3">
        <span
          className={cn(
            'flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wider',
            connected
              ? 'border-emerald-500/40 text-emerald-400'
              : 'border-amber-500/40 text-amber-400'
          )}
        >
          {connected ? (
            <Wifi className="h-3.5 w-3.5 animate-pulse" aria-hidden />
          ) : (
            <WifiOff className="h-3.5 w-3.5" aria-hidden />
          )}
          {gone ? 'NOT FOUND' : connected ? 'LIVE' : 'RECONNECTING…'}
        </span>
        {!gone ? (
          <button
            type="button"
            onClick={goFullscreen}
            aria-label="Toggle fullscreen"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-zinc-900/70 text-zinc-300 backdrop-blur transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <Expand className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="relative z-[1] mx-auto w-full max-w-6xl px-4 pb-20 sm:px-8">
        {gone ? (
          <div className="pt-24 text-center">
            <Trophy className="mx-auto h-10 w-10 text-zinc-600" aria-hidden />
            <h1 className="mt-4 text-2xl font-semibold text-white">Tournament not found</h1>
            <p className="mt-2 text-sm text-zinc-400">
              It may have been removed — ask the organizer for a fresh link.
            </p>
          </div>
        ) : !detail ? (
          <div className="pt-24 text-center">
            <div className="mx-auto h-10 w-10 animate-pulse rounded-full border-2 border-amber-400/40 border-t-amber-400" aria-hidden />
            <p className="mt-5 text-sm text-zinc-400">Loading the scoreboard…</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <motion.header
              initial={{ opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="pt-2 text-center"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-400/90 sm:text-sm">
                {tournament?.organizer || 'Live Scoreboard'}
              </p>
              <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] sm:text-6xl">
                {tournament?.name ?? 'Tournament'}
              </h1>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold">
                <span className="rounded-full border border-amber-400/40 bg-amber-400/5 px-3 py-1 text-amber-300">
                  1st × {tournament?.pointsFirst ?? 75}
                </span>
                <span className="rounded-full border border-zinc-400/40 bg-zinc-400/5 px-3 py-1 text-zinc-300">
                  2nd × {tournament?.pointsSecond ?? 50}
                </span>
                <span className="rounded-full border border-orange-600/50 bg-orange-600/5 px-3 py-1 text-orange-400">
                  3rd × {tournament?.pointsThird ?? 25}
                </span>
              </div>
            </motion.header>

            {/* Progress */}
            {progress ? (
              <div className="mx-auto mt-8 max-w-3xl">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-zinc-300">
                    Completed: <span className="text-amber-400 tabular-nums">{progress.completed}</span>
                    {' / '}
                    {progress.total} events
                  </span>
                  <span className="font-semibold text-white">
                    <AnimatedNumber value={progress.percent} />%
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-800/80 ring-1 ring-white/5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress.percent}%` }}
                    transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full rounded-full bg-gradient-to-r from-amber-600 via-amber-500 to-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.45)]"
                    role="progressbar"
                    aria-valuenow={progress.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Events completed"
                  />
                </div>
              </div>
            ) : null}

            {/* Latest result — the "what just happened" strip; opens
                that event's own live page */}
            <AnimatePresence initial={false} mode="wait">
              {latest && latest.result ? (
                <motion.a
                  key={latest.result.updatedAt}
                  href={`/present/${id}/event/${latest.id}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                  className="mx-auto mt-7 flex max-w-3xl items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 text-left backdrop-blur transition-colors hover:border-amber-400/40 hover:bg-white/[0.09]"
                >
                  <span className="min-w-0 flex-1 text-center">
                    <span className="block text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                      Latest result
                    </span>
                    <span className="mt-1 block text-sm font-semibold text-white sm:text-base">
                      {latest.gameName}
                      <span className="font-normal text-zinc-400">
                        {' '}
                        · Cat {latest.divisionCode}
                        {latest.subEventIndex > 1 ? ` · Slot ${latest.subEventIndex}` : ''}
                      </span>
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm font-semibold">
                      {latest.result.firstPlaceCode ? (
                        <span className="text-amber-400">🥇 {latest.result.firstPlaceCode}</span>
                      ) : null}
                      {latest.result.secondPlaceCode ? (
                        <span className="text-zinc-300">🥈 {latest.result.secondPlaceCode}</span>
                      ) : null}
                      {latest.result.thirdPlaceCode ? (
                        <span className="text-orange-400">🥉 {latest.result.thirdPlaceCode}</span>
                      ) : null}
                    </span>
                  </span>
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-zinc-500 transition-colors"
                    aria-hidden
                  />
                </motion.a>
              ) : null}
            </AnimatePresence>

            {/* Leaderboard — table on screens, stacked cards on phones.
                The section label says what this page is (the overall
                standings, not one event) before a single row is read. */}
            <div className="mt-10">
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500">
                  Overall standings
                </h2>
                {updatedAt ? (
                  <span className="text-[11px] tabular-nums text-zinc-500">
                    Updated{' '}
                    {new Date(updatedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                ) : null}
              </div>
              <div className="[perspective:1400px]">
              <motion.div
                initial={{ rotateX: -9, y: 28, opacity: 0 }}
                animate={{ rotateX: 0, y: 0, opacity: 1 }}
                transition={{ duration: 0.95, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                style={{ transformOrigin: 'top center' }}
                className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/60 shadow-2xl shadow-black/60 backdrop-blur"
              >
                {/* Screens: the full table */}
                <table className="hidden w-full min-w-[640px] border-collapse text-left sm:table">
                  <thead>
                    <tr className="border-b border-white/10 bg-zinc-900/90 text-xs uppercase tracking-widest text-zinc-400">
                      <th className="px-4 py-4 text-center font-semibold sm:px-6">Rank</th>
                      <th className="px-4 py-4 font-semibold sm:px-6">Center</th>
                      <th className="px-4 py-4 font-semibold sm:px-6">Name</th>
                      <th className="px-4 py-4 text-center font-semibold text-amber-400/90 sm:px-6">
                        1st (×{tournament?.pointsFirst ?? 75})
                      </th>
                      <th className="px-4 py-4 text-center font-semibold text-zinc-300 sm:px-6">
                        2nd (×{tournament?.pointsSecond ?? 50})
                      </th>
                      <th className="px-4 py-4 text-center font-semibold text-orange-400/90 sm:px-6">
                        3rd (×{tournament?.pointsThird ?? 25})
                      </th>
                      <th className="px-4 py-4 text-right font-semibold text-white sm:px-6">Total</th>
                    </tr>
                  </thead>
                  <tbody>
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
                          'border-b border-white/5 border-l-4 transition-colors last:border-0 hover:bg-zinc-800/40',
                          rankStyle(row.rank)
                        )}
                      >
                        <td className="px-4 py-4 text-center sm:px-6">
                          <span className="flex items-center justify-center font-semibold">
                            <RankIcon rank={row.rank} />
                          </span>
                        </td>
                        <td className="px-4 py-4 sm:px-6">
                          <span className="text-2xl font-semibold tabular-nums tracking-wide text-white sm:text-3xl">
                            {row.centerCode}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-zinc-300 sm:px-6">
                          {row.centerName || <span className="text-zinc-500">—</span>}
                        </td>
                        <td className={cn('px-4 py-4 text-center text-xl font-semibold sm:px-6', row.gold > 0 ? 'text-amber-400' : 'text-zinc-600')}>
                          <AnimatedNumber value={row.gold} />
                        </td>
                        <td className={cn('px-4 py-4 text-center text-xl font-semibold sm:px-6', row.silver > 0 ? 'text-zinc-200' : 'text-zinc-600')}>
                          <AnimatedNumber value={row.silver} />
                        </td>
                        <td className={cn('px-4 py-4 text-center text-xl font-semibold sm:px-6', row.bronze > 0 ? 'text-orange-400' : 'text-zinc-600')}>
                          <AnimatedNumber value={row.bronze} />
                        </td>
                        <td className="px-4 py-4 text-right sm:px-6">
                          <span className="text-3xl font-semibold text-white drop-shadow-[0_2px_12px_rgba(255,255,255,0.15)] sm:text-4xl">
                            <AnimatedNumber value={row.total} />
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                    {standings.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-6 py-16 text-center text-zinc-400">
                          Standings appear here as soon as results are recorded.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>

                {/* Phones: one card per center — the whole story at a glance */}
                <div className="divide-y divide-white/5 sm:hidden">
                  {standings.map((row, i) => (
                    <motion.div
                      key={row.centerId}
                      layout="position"
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        delay: 0.3 + i * 0.06,
                        duration: 0.45,
                        ease: [0.16, 1, 0.3, 1],
                        layout: { type: 'spring', stiffness: 300, damping: 32 },
                      }}
                      className={cn('flex items-center gap-3 border-l-4 py-3.5 pl-4 pr-4', rankStyle(row.rank))}
                    >
                      <span className="flex w-7 shrink-0 items-center justify-center">
                        <RankIcon rank={row.rank} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-2xl font-semibold tabular-nums tracking-wide text-white">
                          {row.centerCode}
                        </span>
                        {row.centerName ? (
                          <span className="block truncate text-[13px] text-zinc-400">{row.centerName}</span>
                        ) : null}
                        <span className="mt-1 flex items-center gap-2.5 text-xs font-medium text-zinc-400 tabular-nums">
                          <span className="text-amber-400/90">1st × {row.gold}</span>
                          <span>2nd × {row.silver}</span>
                          <span className="text-orange-400/90">3rd × {row.bronze}</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-3xl font-semibold text-white tabular-nums">
                          <AnimatedNumber value={row.total} />
                        </span>
                        <span className="block text-[10px] uppercase tracking-wider text-zinc-500">pts</span>
                      </span>
                    </motion.div>
                  ))}
                  {standings.length === 0 ? (
                    <p className="px-6 py-14 text-center text-sm text-zinc-400">
                      Standings appear here as soon as results are recorded.
                    </p>
                  ) : null}
                </div>
              </motion.div>
              </div>
            </div>

            {/* Footer meta */}
            <p className="mt-5 flex flex-wrap items-center justify-center gap-3 text-[11px] text-zinc-500">
              <span className="flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5" aria-hidden />
                Tie-break order: total, then first, second and third places
              </span>
            </p>
            <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-zinc-600">
              Tourny Lite
            </p>
          </>
        )}
      </div>
    </div>
  )
}
