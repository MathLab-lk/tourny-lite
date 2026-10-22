'use client'

import { cn } from '@/lib/utils'
import type { AuditEntryDTO } from '@/lib/types'

/*
 * Shared audit row — used by the History view and the Overview
 * activity feed. One rendering of the same data, everywhere.
 */

const ACTION_META: Record<string, { label: string; chip: string }> = {
  created: { label: 'Recorded', chip: 'bg-emerald-600/12 text-emerald-700 dark:text-emerald-400' },
  updated: { label: 'Corrected', chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  reset: { label: 'Reset', chip: 'bg-destructive/10 text-destructive' },
}

export function parsePodium(json: string): string {
  if (!json) return '—'
  try {
    const v = JSON.parse(json) as { first?: string | null; second?: string | null; third?: string | null }
    return [v.first, v.second, v.third].filter(Boolean).join(' / ') || '—'
  } catch {
    return '—'
  }
}

export function AuditRow({ entry, dense }: { entry: AuditEntryDTO; dense?: boolean }) {
  const meta = ACTION_META[entry.action] ?? { label: entry.action, chip: 'bg-muted text-muted-foreground' }
  return (
    <li className={cn('flex flex-col gap-1 px-4 sm:flex-row sm:items-center sm:gap-3', dense ? 'py-2.5' : 'py-3')}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', meta.chip)}>
          {meta.label}
        </span>
        <span className="truncate text-[13px] font-medium">{entry.eventLabel}</span>
        {entry.action === 'updated' ? (
          <span className="flex min-w-0 items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5 line-through opacity-60">{parsePodium(entry.oldValues)}</span>
            <span aria-hidden>→</span>
            <span className="rounded bg-emerald-600/10 px-1.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-400">
              {parsePodium(entry.newValues)}
            </span>
          </span>
        ) : entry.action === 'reset' ? (
          <span className="text-xs tabular-nums text-muted-foreground line-through opacity-60">
            {parsePodium(entry.oldValues)}
          </span>
        ) : (
          <span className="rounded bg-emerald-600/10 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
            {parsePodium(entry.newValues)}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2.5 text-xs text-muted-foreground">
        {entry.actor ? <span>{entry.actor}</span> : null}
        <span className="tabular-nums">
          {new Date(entry.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
        </span>
      </div>
      {entry.reason && !dense ? (
        <p className="w-full text-xs italic text-muted-foreground">“{entry.reason}”</p>
      ) : null}
    </li>
  )
}
