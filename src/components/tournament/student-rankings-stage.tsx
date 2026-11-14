'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Award, Crown, GraduationCap, Medal, Trophy } from 'lucide-react'
import { AnimatedNumber } from '@/components/tournament/ui-bits'
import { studentShortId } from '@/lib/student-math'
import { cn } from '@/lib/utils'
import type { StudentStandingRow } from '@/lib/types'

/** Shared easing for the stage — the same expo curve the boards use. */
const EASE = [0.16, 1, 0.3, 1] as const

export type RankingsMode = 'centers' | 'students'

/**
 * The Centers ↔ Students switch for the live boards. A glass pill
 * with a lit active segment — the same visual language as the app's
 * floating navigation, so the mode change reads as a destination
 * change, not a filter.
 */
export function RankingsModeToggle({
  mode,
  onChange,
  className,
}: {
  mode: RankingsMode
  onChange: (mode: RankingsMode) => void
  className?: string
}) {
  const seg = (active: boolean) =>
    cn(
      'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold tracking-wide transition-colors sm:text-sm',
      active ? 'bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/50' : 'text-zinc-400 hover:text-zinc-200'
    )
  return (
    <div
      role="tablist"
      aria-label="Rankings"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-white/10 bg-zinc-900/70 p-1 backdrop-blur',
        className
      )}
    >
      <button type="button" role="tab" aria-selected={mode === 'centers'} onClick={() => onChange('centers')} className={seg(mode === 'centers')}>
        <Trophy className="h-3.5 w-3.5" aria-hidden /> Centers
      </button>
      <button type="button" role="tab" aria-selected={mode === 'students'} onClick={() => onChange('students')} className={seg(mode === 'students')}>
        <GraduationCap className="h-3.5 w-3.5" aria-hidden /> Students
      </button>
    </div>
  )
}

/** Medal coin — the rank badge on the podium cards. */
function RankCoin({ rank, large }: { rank: 1 | 2 | 3; large?: boolean }) {
  const skins = {
    1: 'from-amber-300 to-amber-600 ring-amber-500/60 shadow-[0_0_30px_rgba(251,191,36,0.45)] text-amber-950',
    2: 'from-zinc-200 to-zinc-500 ring-zinc-400/50 shadow-[0_0_24px_rgba(228,228,231,0.25)] text-zinc-700',
    3: 'from-orange-400 to-orange-800 ring-orange-700/60 shadow-[0_0_24px_rgba(234,88,12,0.3)] text-orange-950',
  }[rank]
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold ring-2',
        skins,
        large ? 'h-16 w-16 text-2xl sm:h-20 sm:w-20 sm:text-3xl' : 'h-13 w-13 text-xl sm:h-16 sm:w-16 sm:text-2xl'
      )}
      aria-hidden
    >
      {rank}
    </span>
  )
}

/**
 * The student leaderboard as an awards stage — the podium reveal
 * (bronze, then silver, then the champion under a gold spotlight)
 * followed by the live ranked list, where rows glide into place as
 * new marks land. Shared by the in-app projector scoreboard and the
 * public guest scoreboard so both tell the same story.
 */
export function StudentRankingsStage({ rows, className }: { rows: StudentStandingRow[]; className?: string }) {
  // Names that exist more than once carry the short internal id so
  // the audience can tell two same-named students apart.
  const duplicateNames = useMemo(() => {
    const seen = new Map<string, number>()
    for (const r of rows) seen.set(r.name, (seen.get(r.name) ?? 0) + 1)
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([name]) => name))
  }, [rows])

  // Walk the ranking in order: the first three scored students take
  // the podium; everyone else (including not-yet-scored students)
  // stays on the list below, in rank order.
  const podium: StudentStandingRow[] = []
  const rest: StudentStandingRow[] = []
  for (const row of rows) {
    if (podium.length < 3 && row.events > 0) podium.push(row)
    else rest.push(row)
  }

  const name = (row: StudentStandingRow) => (
    <span className="block truncate font-semibold text-white">
      {row.name}
      {duplicateNames.has(row.name) ? (
        <span className="ml-1.5 rounded bg-white/10 px-1 py-0.5 text-[10px] font-medium tabular-nums text-zinc-400">
          {studentShortId(row.studentId)}
        </span>
      ) : null}
    </span>
  )

  if (rows.length === 0) {
    return (
      <div className={cn('rounded-2xl border border-white/10 bg-zinc-900/60 px-6 py-16 text-center shadow-2xl shadow-black/60 backdrop-blur', className)}>
        <GraduationCap className="mx-auto h-9 w-9 text-zinc-600" aria-hidden />
        <p className="mt-4 text-sm text-zinc-400">
          Students appear here as soon as they are added and scored.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('[perspective:1400px]', className)}>
      {/* The podium — a stage entrance, medal coins first */}
      {podium.length > 0 ? (
        <div className="relative">
          {/* Gold spotlight pooling under the champion */}
          <div
            className="pointer-events-none absolute -top-10 left-1/2 h-56 w-[36rem] max-w-full -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(251,191,36,0.16),transparent_65%)]"
            aria-hidden
          />
          {/* Desktop: classic podium arrangement — silver, champion, bronze */}
          <div className="hidden items-end gap-3 sm:grid sm:grid-cols-3 sm:gap-4">
            {[podium[1], podium[0], podium[2]].map((row, slot) => {
              if (!row) return <div key={`empty-${slot}`} aria-hidden />
              const rank = (podium.indexOf(row) + 1) as 1 | 2 | 3
              const champ = rank === 1
              // Reveal order: bronze (delay .15) → silver (.32) → champion (.55)
              const delay = rank === 1 ? 0.55 : rank === 2 ? 0.32 : 0.15
              return (
                <motion.div
                  key={row.studentId}
                  initial={{ opacity: 0, y: 46, rotateX: -14 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  transition={{ duration: 0.85, ease: EASE, delay }}
                  style={{ transformOrigin: 'bottom center' }}
                  className={cn(
                    'relative rounded-2xl border bg-zinc-900/70 p-4 text-center shadow-2xl shadow-black/60 backdrop-blur sm:p-5',
                    champ
                      ? 'border-amber-400/40 bg-gradient-to-b from-amber-400/[0.12] to-transparent pb-6 sm:min-h-[15rem] sm:pb-7'
                      : 'border-white/10 sm:min-h-[12.5rem]'
                  )}
                >
                  {champ ? (
                    <Crown
                      className="absolute -top-4 left-1/2 h-8 w-8 -translate-x-1/2 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.6)]"
                      aria-hidden
                    />
                  ) : null}
                  <div className="flex justify-center">
                    <RankCoin rank={rank} large={champ} />
                  </div>
                  <div className="mt-3 min-w-0 px-1">
                    {name(row)}
                    {row.centerCode ? (
                      <span className="mt-1 inline-block rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-300">
                        {row.centerCode}
                      </span>
                    ) : (
                      <span className="mt-1 block text-[11px] text-zinc-500">no center yet</span>
                    )}
                    {champ ? (
                      <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-amber-300/90">
                        Champion
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-3">
                    <span
                      className={cn(
                        'block font-semibold text-white tabular-nums drop-shadow-[0_2px_12px_rgba(255,255,255,0.15)]',
                        champ ? 'text-4xl sm:text-5xl' : 'text-3xl sm:text-4xl'
                      )}
                    >
                      <AnimatedNumber value={row.total} />
                    </span>
                    <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-zinc-500">
                      marks · {row.events} event{row.events === 1 ? '' : 's'}
                    </span>
                  </div>
                </motion.div>
              )
            })}
          </div>
          {/* Phones: stacked 1st → 2nd → 3rd */}
          <div className="space-y-3 sm:hidden">
            {podium.map((row, i) => {
              const rank = (i + 1) as 1 | 2 | 3
              const champ = rank === 1
              return (
                <motion.div
                  key={row.studentId}
                  initial={{ opacity: 0, x: i % 2 === 0 ? -24 : 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.55, ease: EASE, delay: 0.15 + i * 0.14 }}
                  className={cn(
                    'flex items-center gap-3.5 rounded-2xl border bg-zinc-900/70 p-4 shadow-2xl shadow-black/60 backdrop-blur',
                    champ
                      ? 'border-amber-400/40 bg-gradient-to-r from-amber-400/[0.1] to-transparent'
                      : 'border-white/10'
                  )}
                >
                  <RankCoin rank={rank} large={champ} />
                  <span className="min-w-0 flex-1">
                    {name(row)}
                    <span className="mt-0.5 block text-[11px] font-semibold tabular-nums text-zinc-400">
                      {row.centerCode ?? 'no center yet'} · {row.events} event{row.events === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={cn('block font-semibold text-white tabular-nums', champ ? 'text-3xl' : 'text-2xl')}>
                      <AnimatedNumber value={row.total} />
                    </span>
                    <span className="block text-[10px] uppercase tracking-wider text-zinc-500">marks</span>
                  </span>
                </motion.div>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* The field — everyone else, gliding live as ranks move */}
      {rest.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: podium.length > 0 ? 0.75 : 0.15 }}
          style={{ transformOrigin: 'top center' }}
          className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/60 shadow-2xl shadow-black/60 backdrop-blur"
        >
          <div className="border-b border-white/10 bg-zinc-900/90 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-zinc-500 sm:px-6">
            {podium.length > 0 ? 'The field' : 'Student ranking'}
          </div>
          <ol className="divide-y divide-white/5">
            {rest.map((row) => (
              <motion.li
                key={row.studentId}
                layout="position"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: 0.45,
                  ease: EASE,
                  layout: { type: 'spring', stiffness: 300, damping: 32 },
                }}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-zinc-800/40 sm:px-6"
              >
                <span className="w-8 shrink-0 text-center text-base font-semibold tabular-nums text-zinc-400">
                  {row.rank}
                </span>
                <span className="min-w-0 flex-1">
                  {name(row)}
                  <span className="mt-0.5 block text-[11px] font-medium tabular-nums text-zinc-500">
                    {row.centerCode ?? 'no center yet'}
                    {row.events > 0 ? (
                      <>
                        {' · '}
                        {row.events} event{row.events === 1 ? '' : 's'}
                        {row.best > 0 ? <> · best {row.best}</> : null}
                      </>
                    ) : (
                      ' · awaiting marks'
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={cn('block font-semibold tabular-nums', row.events > 0 ? 'text-2xl text-white' : 'text-xl text-zinc-600')}>
                    {row.events > 0 ? <AnimatedNumber value={row.total} /> : '—'}
                  </span>
                  {row.events > 0 ? (
                    <span className="block text-[10px] uppercase tracking-wider text-zinc-500">marks</span>
                  ) : null}
                </span>
              </motion.li>
            ))}
          </ol>
        </motion.div>
      ) : null}

      {/* Footer meta */}
      <p className="mt-4 flex flex-wrap items-center justify-center gap-3 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <Award className="h-3.5 w-3.5" aria-hidden />
          Ties on totals break by events, then best single mark
        </span>
      </p>
    </div>
  )
}

/** Convenience wrapper: the icon + label used by the boards' student tabs. */
export function StudentsTabLabel() {
  return (
    <span className="flex items-center gap-1.5">
      <GraduationCap className="h-3.5 w-3.5" aria-hidden /> Students
    </span>
  )
}
