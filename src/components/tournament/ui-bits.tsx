'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { animate, motion, useReducedMotion, type Variants } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { EventStatus, TournamentStatus } from '@/lib/types'

/*
 * Shared UI primitives — one source of truth for status styling,
 * page headers and empty states. Every view imports from here so
 * the whole app speaks the same visual language.
 */

/* ── Motion kit ─────────────────────────────────────────────── */

/*
 * The app-wide motion vocabulary. Everything that enters, exits
 * or re-orders uses these tokens so the whole product moves with
 * one voice: quick, springy, never sluggish.
 */

/** Silky expo-out — entrances that arrive fast and settle softly. */
export const easeOutExpo: [number, number, number, number] = [0.16, 1, 0.3, 1]

/** The house spring — a gentle, tactile overshoot. */
export const springSoft = { type: 'spring' as const, stiffness: 420, damping: 34 }

/** Snappier spring — small controls (pills, chips, icons). */
export const springPop = { type: 'spring' as const, stiffness: 550, damping: 32 }

/** Parent: reveals children one after another (capped, so long
 *  lists never keep the user waiting). */
export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.03 } },
}

/** Child of staggerParent: a quick fade + rise. */
export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: easeOutExpo } },
}

/** Single-use entrance: fade + rise. For elements outside a
 *  stagger group (empty states, panels, fresh cards). */
export function FadeIn({
  children,
  className,
  delay = 0,
  y = 10,
}: {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: easeOutExpo, delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/* ── Event status ─────────────────────────────────────────────── */

const EVENT_STATUS_META: Record<EventStatus, { label: string; dot: string; chip: string }> = {
  pending: {
    label: 'Pending',
    dot: 'bg-muted-foreground/40',
    chip: 'bg-muted text-muted-foreground',
  },
  in_progress: {
    label: 'In progress',
    dot: 'bg-amber-500',
    chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  },
  completed: {
    label: 'Completed',
    dot: 'bg-emerald-600 dark:bg-emerald-500',
    chip: 'bg-emerald-600/12 text-emerald-700 dark:text-emerald-400',
  },
}

export function eventStatusMeta(status: EventStatus) {
  return EVENT_STATUS_META[status] ?? EVENT_STATUS_META.pending
}

/** Small status chip used on events, slots and dialogs. Colors
 *  morph smoothly when a live update changes a status. */
export function StatusChip({
  status,
  className,
}: {
  status: EventStatus
  className?: string
}) {
  const meta = eventStatusMeta(status)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 transition-colors duration-300',
        meta.chip,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full transition-colors duration-300', meta.dot)} aria-hidden />
      {meta.label}
    </span>
  )
}

/* ── Tournament status ────────────────────────────────────────── */

const TOURNAMENT_STATUS_META: Record<TournamentStatus, { label: string; chip: string; dot: string }> = {
  active: {
    label: 'Active',
    chip: 'bg-emerald-600/12 text-emerald-700 dark:text-emerald-400',
    dot: 'bg-emerald-600 dark:bg-emerald-500',
  },
  completed: {
    label: 'Completed',
    chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
    dot: 'bg-amber-500',
  },
  draft: {
    label: 'Draft',
    chip: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/40',
  },
  archived: {
    label: 'Archived',
    chip: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/40',
  },
}

export function tournamentStatusMeta(status: TournamentStatus) {
  return TOURNAMENT_STATUS_META[status] ?? TOURNAMENT_STATUS_META.draft
}

export function TournamentStatusChip({
  status,
  className,
}: {
  status: TournamentStatus
  className?: string
}) {
  const meta = tournamentStatusMeta(status)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 transition-colors duration-300',
        meta.chip,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full transition-colors duration-300', meta.dot)} aria-hidden />
      {meta.label}
    </span>
  )
}

/* ── Medal text (podium semantics only) ───────────────────────── */

export const medalText = {
  gold: 'text-amber-600 dark:text-amber-400',
  silver: 'text-slate-500 dark:text-slate-300',
  bronze: 'text-orange-700 dark:text-orange-400',
} as const

/* ── Animated number ───────────────────────────────────────────── */

/** Count-up number — springs to new values as data arrives live. */
export function AnimatedNumber({
  value,
  className,
}: {
  value: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(value)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) {
      prev.current = value
      if (ref.current) ref.current.textContent = String(Math.round(value))
      return
    }
    const controls = animate(prev.current, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = String(Math.round(v))
      },
    })
    prev.current = value
    return () => controls.stop()
  }, [value, reduced])

  return (
    <span ref={ref} className={cn('nums', className)}>
      {Math.round(value)}
    </span>
  )
}

/* ── Page header ──────────────────────────────────────────────── */

/** Consistent view header: iOS-flavored large title + optional meta
 *  and actions. One typographic voice across every page. */
export function PageHeader({
  title,
  meta,
  actions,
  className,
}: {
  title: ReactNode
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 className="truncate text-[22px] font-bold leading-tight tracking-tight sm:text-2xl">{title}</h1>
        {meta ? <div className="mt-1 text-[13px] text-muted-foreground">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 pt-0.5">{actions}</div> : null}
    </div>
  )
}

/* ── Empty state ──────────────────────────────────────────────── */

/** Terse, centered empty state with an optional action. Rises
 *  in with the same spring every entrance uses. */
export function EmptyState({
  title,
  hint,
  action,
  className,
}: {
  title: string
  hint?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={springSoft}
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-6 py-16 text-center',
        className
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="max-w-sm text-[13px] text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </motion.div>
  )
}

/* ── Stat strip ───────────────────────────────────────────────── */

/** Flat stat row divided by hairlines — no cards, no icon boxes.
 *  Carries staggerChild so it slots into a view's reveal flow. */
export function StatStrip({
  items,
  className,
}: {
  items: { label: string; value: ReactNode; hint?: ReactNode }[]
  className?: string
}) {
  return (
    <motion.div
      variants={staggerChild}
      className={cn(
        'lift grid grid-cols-2 divide-border rounded-lg border bg-card shadow-xs sm:grid-cols-4 sm:divide-x',
        className
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="px-4 py-3">
          <p className="text-xs text-muted-foreground">{item.label}</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums leading-tight">{item.value}</p>
          {item.hint ? <div className="mt-1.5">{item.hint}</div> : null}
        </div>
      ))}
    </motion.div>
  )
}
