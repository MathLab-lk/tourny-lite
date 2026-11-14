'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, Expand, Timer, Trophy, Wifi, WifiOff } from 'lucide-react'
import { AnimatedNumber } from '@/components/tournament/ui-bits'
import { cn } from '@/lib/utils'
import type { TournamentDetailDTO } from '@/lib/types'

/**
 * Public live page for a single event — where an event-result message
 * points its guests. The twin of the share card that was sent: the
 * same podium (medal coins, center identity, points) rendered as a
 * page, updating live over the same SSE stream the staff app uses.
 * Until the result is recorded the page waits with the guest — the
 * moment it lands, the podium appears. The overall standings ride
 * along below, linking to the full guest scoreboard.
 */
export function PresentEventBoard({ id, eventId }: { id: string; eventId: string }) {
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

  const event = useMemo(() => detail?.events.find((e) => e.id === eventId) ?? null, [detail, eventId])

  const tournament = detail?.tournament
  const division = useMemo(
    () => detail?.divisions.find((d) => d.code === event?.divisionCode) ?? null,
    [detail, event]
  )
  const centerByCode = useMemo(
    () => new Map((detail?.centers ?? []).map((c) => [c.centerCode, c])),
    [detail]
  )
  const overallTop = useMemo(
    () => (detail?.standings ?? []).filter((r) => r.total > 0).slice(0, 3),
    [detail]
  )

  // A podium correction is visible in the timestamps: the result was
  // touched again well after it was first recorded.
  const corrected =
    event?.result != null &&
    Date.parse(event.result.updatedAt) - Date.parse(event.result.recordedAt) > 60_000

  const places = useMemo(() => {
    const r = event?.result
    if (!r || !tournament) return []
    const pts = [tournament.pointsFirst, tournament.pointsSecond, tournament.pointsThird]
    return (
      [
        [r.firstPlaceCode, 1],
        [r.secondPlaceCode, 2],
        [r.thirdPlaceCode, 3],
      ] as const
    ).flatMap(([code, rank], i): { code: string; rank: 1 | 2 | 3; pts: number }[] =>
      code ? [{ code, rank: rank as 1 | 2 | 3, pts: pts[i] ?? 0 }] : []
    )
  }, [event, tournament])

  const goFullscreen = () => {
    if (typeof document === 'undefined') return
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.()
    else void document.exitFullscreen?.()
  }

  return (
    <div className="dark min-h-screen bg-zinc-950 text-zinc-100">
      {/* The same layered night sky as the guest scoreboard */}
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

      {/* Connection pill + fullscreen */}
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

      <div className="relative z-[1] mx-auto w-full max-w-3xl px-4 pb-20 sm:px-8">
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
            <p className="mt-5 text-sm text-zinc-400">Loading the event…</p>
          </div>
        ) : !event ? (
          <div className="pt-24 text-center">
            <Trophy className="mx-auto h-10 w-10 text-zinc-600" aria-hidden />
            <h1 className="mt-4 text-2xl font-semibold text-white">Event not found</h1>
            <a
              href={`/present/${id}`}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-amber-400 hover:text-amber-300"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Open the full scoreboard
            </a>
          </div>
        ) : (
          <>
            {/* Header — the tournament is the context, the event is the story */}
            <motion.header
              initial={{ opacity: 0, y: -14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="pt-2 text-center"
            >
              <a
                href={`/present/${id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-xs font-semibold text-zinc-300 backdrop-blur transition-colors hover:border-white/25 hover:text-white"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                Full standings
              </a>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.35em] text-amber-400/90 sm:text-sm">
                {tournament?.organizer || 'Live Result'}
              </p>
              <h2 className="mt-2 text-balance text-xl font-semibold tracking-tight text-zinc-200 drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] sm:text-3xl">
                {tournament?.name ?? 'Tournament'}
              </h2>
            </motion.header>

            {/* The event — identity card */}
            <motion.section
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
              className="mt-7 rounded-2xl border border-white/10 bg-zinc-900/60 p-5 text-center shadow-2xl shadow-black/60 backdrop-blur sm:p-7"
            >
              <p
                className={cn(
                  'text-[10px] font-semibold uppercase tracking-[0.3em] sm:text-xs',
                  event.result ? 'text-amber-400/90' : 'text-zinc-500'
                )}
              >
                {event.result ? (corrected ? 'Corrected result' : 'Event result') : 'Result pending'}
              </p>
              <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] sm:text-5xl">
                {event.gameName}
              </h1>
              {event.gameSinhalaName ? (
                <p className="mt-1.5 text-base text-zinc-400 sm:text-lg">{event.gameSinhalaName}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold">
                <span className="rounded-full border border-amber-400/40 bg-amber-400/5 px-3 py-1 text-amber-300">
                  {division?.name ?? `Category ${event.divisionCode}`}
                </span>
                {division?.ageRange ? (
                  <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-zinc-300">
                    Ages {division.ageRange}
                  </span>
                ) : null}
                {event.subEventIndex > 1 ? (
                  <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-zinc-300">
                    Slot {event.subEventIndex}
                  </span>
                ) : null}
              </div>
            </motion.section>

            {/* The podium — or the wait */}
            <div className="mt-5 [perspective:1400px]">
              <AnimatePresence initial={false} mode="wait">
                {places.length > 0 ? (
                  <motion.div
                    key={`podium-${event.result?.id ?? 'x'}`}
                    initial={{ rotateX: -8, y: 24, opacity: 0 }}
                    animate={{ rotateX: 0, y: 0, opacity: 1 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    style={{ transformOrigin: 'top center' }}
                    className="space-y-3.5"
                  >
                    {places.map(({ code, rank, pts }, i) => {
                      const center = centerByCode.get(code)
                      const skins = {
                        1: 'from-amber-300 to-amber-600 ring-amber-500/60 shadow-[0_0_28px_rgba(251,191,36,0.35)]',
                        2: 'from-zinc-200 to-zinc-500 ring-zinc-400/50 shadow-[0_0_24px_rgba(228,228,231,0.22)]',
                        3: 'from-orange-400 to-orange-800 ring-orange-700/60 shadow-[0_0_24px_rgba(234,88,12,0.25)]',
                      }[rank]
                      return (
                        <motion.div
                          key={`${rank}-${code}`}
                          initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.18 + i * 0.12, duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                          className={cn(
                            'flex items-center gap-4 rounded-2xl border border-white/10 bg-zinc-900/60 p-4 shadow-2xl shadow-black/60 backdrop-blur sm:gap-5 sm:p-5',
                            rank === 1 && 'border-amber-400/25'
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xl font-bold ring-2 sm:h-16 sm:w-16 sm:text-2xl',
                              skins,
                              rank === 1 ? 'text-amber-950' : rank === 2 ? 'text-zinc-700' : 'text-orange-950'
                            )}
                          >
                            {rank}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-2xl font-semibold tabular-nums tracking-wide text-white sm:text-4xl">
                              {code}
                            </span>
                            {center?.centerName ? (
                              <span className="block truncate text-sm text-zinc-300 sm:text-base">
                                {center.centerName}
                              </span>
                            ) : null}
                            {center?.location ? (
                              <span className="block truncate text-xs text-zinc-500 sm:text-sm">
                                {center.location}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-2xl font-semibold text-white tabular-nums sm:text-4xl">
                              <AnimatedNumber value={pts} />
                            </span>
                            <span className="block text-[10px] uppercase tracking-wider text-zinc-500">
                              pts
                            </span>
                          </span>
                        </motion.div>
                      )
                    })}
                  </motion.div>
                ) : (
                  <motion.div
                    key="pending"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    className="flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-zinc-900/60 px-5 py-10 text-center shadow-2xl shadow-black/60 backdrop-blur"
                  >
                    <Timer className="h-5 w-5 animate-pulse text-amber-400" aria-hidden />
                    <p className="text-sm text-zinc-300 sm:text-base">
                      The result has not been recorded yet.
                      <span className="block text-zinc-500">
                        This page updates live the moment it is.
                      </span>
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Overall standings — the bigger story, one hop away */}
            {overallTop.length > 0 ? (
              <motion.section
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
                className="mt-8 rounded-2xl border border-white/10 bg-zinc-900/40 p-5 backdrop-blur sm:p-6"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                  Overall standings — top 3
                </p>
                <ol className="mt-3 space-y-2">
                  {overallTop.map((row) => (
                    <li
                      key={row.centerId}
                      className={cn(
                        'flex items-center justify-between gap-3 rounded-xl border-l-4 bg-white/[0.03] px-4 py-2.5',
                        row.rank === 1
                          ? 'border-l-amber-400'
                          : row.rank === 2
                            ? 'border-l-zinc-400'
                            : 'border-l-amber-700'
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="text-sm font-semibold tabular-nums text-zinc-400">
                          {row.rank}
                        </span>
                        <span className="truncate text-sm font-medium text-zinc-100">
                          {row.centerName ? (
                            <>
                              {row.centerName}{' '}
                              <span className="tabular-nums text-zinc-400">({row.centerCode})</span>
                            </>
                          ) : (
                            <span className="tabular-nums">{row.centerCode}</span>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 text-base font-semibold text-white tabular-nums">
                        {row.total}
                        <span className="ml-1 text-xs font-normal text-zinc-500">pts</span>
                      </span>
                    </li>
                  ))}
                </ol>
                <a
                  href={`/present/${id}`}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-amber-400 transition-colors hover:text-amber-300"
                >
                  Watch the full scoreboard live
                  <ChevronLeft className="h-4 w-4 rotate-180" aria-hidden />
                </a>
              </motion.section>
            ) : null}

            {/* Footer meta */}
            <p className="mt-6 flex flex-wrap items-center justify-center gap-3 text-[11px] text-zinc-500">
              <span className="flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5" aria-hidden />
                {tournament
                  ? `1st × ${tournament.pointsFirst} · 2nd × ${tournament.pointsSecond} · 3rd × ${tournament.pointsThird}`
                  : null}
              </span>
              {updatedAt ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="tabular-nums">
                    Updated{' '}
                    {new Date(updatedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </>
              ) : null}
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
