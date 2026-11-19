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
    <div className="dark min-h-screen bg-background text-foreground">
      {/* The app's atmosphere — same liquid-glass night as the guest
          scoreboard and the staff app. The gold framing below is the
          podium story this page tells; everything structural is the
          app's steel-blue glass. */}
      <div className="aurora" aria-hidden />
      <div className="stars" aria-hidden />
      <div className="stars-twinkle" aria-hidden />
      <div className="vignette" aria-hidden />
      <div className="noise" aria-hidden />

      {/* Connection pill + fullscreen */}
      <div className="sticky top-0 z-10 flex items-center justify-center gap-2 bg-gradient-to-b from-background/90 to-transparent p-3">
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
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-foreground/70 backdrop-blur transition-colors hover:bg-white/10 hover:text-foreground"
          >
            <Expand className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="relative z-[1] mx-auto w-full max-w-3xl px-4 pb-20 sm:px-8">
        {gone ? (
          <div className="pt-24 text-center">
            <Trophy className="mx-auto h-10 w-10 text-foreground/30" aria-hidden />
            <h1 className="mt-4 text-2xl font-semibold text-foreground">Tournament not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              It may have been removed — ask the organizer for a fresh link.
            </p>
          </div>
        ) : !detail ? (
          <div className="pt-24 text-center">
            <div className="mx-auto h-10 w-10 animate-pulse rounded-full border-2 border-primary/40 border-t-primary" aria-hidden />
            <p className="mt-5 text-sm text-muted-foreground">Loading the event…</p>
          </div>
        ) : !event ? (
          <div className="pt-24 text-center">
            <Trophy className="mx-auto h-10 w-10 text-foreground/30" aria-hidden />
            <h1 className="mt-4 text-2xl font-semibold text-foreground">Event not found</h1>
            <a
              href={`/present/${id}`}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80"
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
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur transition-colors hover:border-white/25 hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                Full standings
              </a>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.35em] text-primary sm:text-sm">
                {tournament?.organizer || 'Live Result'}
              </p>
              <h2 className="mt-2 text-balance text-xl font-semibold tracking-tight text-foreground/90 drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] sm:text-3xl">
                {tournament?.name ?? 'Tournament'}
              </h2>
            </motion.header>

            {/* The event — identity card, gold-framed: this page is
                about one event's podium, and says so before you read
                a word */}
            <motion.section
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
              className="mt-7 rounded-2xl border border-amber-400/30 bg-card bg-gradient-to-b from-amber-400/[0.08] to-transparent p-5 text-center shadow-2xl shadow-black/40 backdrop-blur sm:p-7"
            >
              <p
                className={cn(
                  'flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.3em] sm:text-xs',
                  event.result ? 'text-amber-400/90' : 'text-muted-foreground'
                )}
              >
                <Trophy className="h-3.5 w-3.5" aria-hidden />
                {event.result ? (corrected ? 'Corrected result' : 'Event result') : 'Result pending'}
              </p>
              <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight text-foreground drop-shadow-[0_4px_24px_rgba(0,0,0,0.6)] sm:text-5xl">
                {event.gameName}
              </h1>
              {event.gameSinhalaName ? (
                <p className="mt-1.5 sinhala text-base text-muted-foreground sm:text-lg">{event.gameSinhalaName}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs font-semibold">
                <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-amber-400">
                  {division?.name ?? `Category ${event.divisionCode}`}
                </span>
                {division?.ageRange ? (
                  <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-muted-foreground">
                    Ages {division.ageRange}
                  </span>
                ) : null}
                {event.subEventIndex > 1 ? (
                  <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-muted-foreground">
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
                      const champ = rank === 1
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
                            'flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-2xl shadow-black/40 backdrop-blur sm:gap-5',
                            champ
                              ? 'border-amber-400/40 bg-gradient-to-r from-amber-400/[0.08] to-transparent p-5 sm:p-6'
                              : 'border-white/10 p-4 sm:p-5'
                          )}
                        >
                          <span
                            className={cn(
                              'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold ring-2',
                              skins,
                              champ
                                ? 'h-16 w-16 text-2xl sm:h-20 sm:w-20 sm:text-3xl'
                                : 'h-14 w-14 text-xl sm:h-16 sm:w-16 sm:text-2xl',
                              rank === 1 ? 'text-amber-950' : rank === 2 ? 'text-zinc-700' : 'text-orange-950'
                            )}
                          >
                            {rank}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                'block font-semibold tabular-nums tracking-wide text-foreground',
                                champ ? 'text-3xl sm:text-5xl' : 'text-2xl sm:text-4xl'
                              )}
                            >
                              {code}
                            </span>
                            {center?.centerName ? (
                              <span
                                className={cn(
                                  'block truncate',
                                  champ ? 'text-base text-foreground/80 sm:text-lg' : 'text-sm text-muted-foreground sm:text-base'
                                )}
                              >
                                {center.centerName}
                              </span>
                            ) : null}
                            {center?.location ? (
                              <span className="block truncate text-xs text-muted-foreground/70 sm:text-sm">
                                {center.location}
                              </span>
                            ) : null}
                            {champ ? (
                              <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.25em] text-amber-300/90">
                                Champion
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-right">
                            <span
                              className={cn(
                                'block font-semibold text-foreground tabular-nums',
                                champ ? 'text-3xl sm:text-5xl' : 'text-2xl sm:text-4xl'
                              )}
                            >
                              <AnimatedNumber value={pts} />
                            </span>
                            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/60">
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
                    className="flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-card px-5 py-10 text-center shadow-2xl shadow-black/40 backdrop-blur"
                  >
                    <Timer className="h-5 w-5 animate-pulse text-primary" aria-hidden />
                    <p className="text-sm text-foreground/90 sm:text-base">
                      The result has not been recorded yet.
                      <span className="block text-muted-foreground">
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
                className="mt-8 rounded-2xl border border-white/10 bg-card p-5 backdrop-blur sm:p-6"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground/70">
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
                        <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                          {row.rank}
                        </span>
                        <span className="truncate text-sm font-medium text-foreground">
                          {row.centerName ? (
                            <>
                              {row.centerName}{' '}
                              <span className="tabular-nums text-muted-foreground">({row.centerCode})</span>
                            </>
                          ) : (
                            <span className="tabular-nums">{row.centerCode}</span>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 text-base font-semibold text-foreground tabular-nums">
                        {row.total}
                        <span className="ml-1 text-xs font-normal text-muted-foreground/70">pts</span>
                      </span>
                    </li>
                  ))}
                </ol>
                <a
                  href={`/present/${id}`}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                >
                  Watch the full scoreboard live
                  <ChevronLeft className="h-4 w-4 rotate-180" aria-hidden />
                </a>
              </motion.section>
            ) : null}

            {/* Footer meta */}
            <p className="mt-6 flex flex-wrap items-center justify-center gap-3 text-[11px] text-muted-foreground/70">
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
            <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-[0.3em] text-foreground/30">
              Tourny Lite
            </p>
          </>
        )}
      </div>
    </div>
  )
}
