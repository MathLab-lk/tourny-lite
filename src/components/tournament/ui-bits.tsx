'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { EventStatus, TournamentStatus } from '@/lib/types'

/*
 * Shared UI primitives — one source of truth for status styling,
 * page headers and empty states. Every view imports from here so
 * the whole app speaks the same visual language.
 */

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

/** Small status chip used on events, slots and dialogs. */
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
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4',
        meta.chip,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} aria-hidden />
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
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4',
        meta.chip,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dot)} aria-hidden />
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

/* ── Page header ──────────────────────────────────────────────── */

/** Consistent view header: title row + optional meta + actions. */
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
        <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">{title}</h1>
        {meta ? <div className="mt-1 text-[13px] text-muted-foreground">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/* ── Empty state ──────────────────────────────────────────────── */

/** Terse, centered empty state with an optional action. */
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
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-6 py-16 text-center',
        className
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="max-w-sm text-[13px] text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  )
}

/* ── Stat strip ───────────────────────────────────────────────── */

/** Flat stat row divided by hairlines — no cards, no icon boxes. */
export function StatStrip({
  items,
  className,
}: {
  items: { label: string; value: ReactNode; hint?: ReactNode }[]
  className?: string
}) {
  return (
    <div className={cn('grid grid-cols-2 divide-border rounded-lg border bg-card sm:grid-cols-4 sm:divide-x', className)}>
      {items.map((item) => (
        <div key={item.label} className="px-4 py-3">
          <p className="text-xs text-muted-foreground">{item.label}</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums leading-tight">{item.value}</p>
          {item.hint ? <div className="mt-1.5">{item.hint}</div> : null}
        </div>
      ))}
    </div>
  )
}
