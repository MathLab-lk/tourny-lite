'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { staggerChild } from '@/components/tournament/ui-bits'
import { useAppStore } from '@/store/app-store'
import type { AuditEntryDTO } from '@/lib/types'

/*
 * Shared audit row — used by the History view, the Overview
 * activity feed and the per-event trail inside the event dialog.
 * One rendering of the same data, everywhere. Carries staggerChild,
 * so it staggers inside any stagger parent (History's list) and
 * rides its parent's reveal elsewhere (Overview, dialogs).
 *
 * Reset entries that are still undoable carry an inline Undo button
 * (admins only) — one click restores the podium and mark sheet from
 * the recovery snapshot taken at reset time.
 */

const ACTION_META: Record<string, { label: string; chip: string }> = {
  created: { label: 'Recorded', chip: 'bg-emerald-600/12 text-emerald-700 dark:text-emerald-400' },
  updated: { label: 'Corrected', chip: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  reset: { label: 'Reset', chip: 'bg-destructive/10 text-destructive' },
  restored: { label: 'Restored', chip: 'bg-sky-500/15 text-sky-700 dark:text-sky-400' },
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
  const { toast } = useToast()
  const isAdmin = useAppStore((s) => s.session?.role === 'admin')
  const undoReset = useAppStore((s) => s.undoReset)
  const [undoing, setUndoing] = useState(false)

  const doUndo = async () => {
    if (undoing) return
    setUndoing(true)
    const out = await undoReset(entry.eventId)
    setUndoing(false)
    if (out.ok) {
      toast({
        title: 'Reset undone',
        description: `${entry.eventLabel} — the recorded result${out.restoredScores ? ' and mark sheet' : ''} are back exactly as they were.`,
      })
    } else {
      toast({ title: 'Could not undo the reset', description: out.error, variant: 'destructive' })
    }
  }

  return (
    <motion.li
      variants={staggerChild}
      className={cn('flex flex-col gap-1 px-4 sm:flex-row sm:items-center sm:gap-3', dense ? 'py-2.5' : 'py-3')}
    >
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
        {entry.action === 'reset' && entry.canUndoReset && isAdmin ? (
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 rounded-full px-2.5 text-[11px] font-medium"
            onClick={() => void doUndo()}
            disabled={undoing}
            title={
              entry.undoRestoresMarks
                ? 'Bring back the podium and the whole mark sheet, exactly as they were before the reset'
                : 'Bring back the podium exactly as it was before the reset'
            }
          >
            {undoing ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            ) : (
              <Undo2 className="h-3 w-3" aria-hidden />
            )}
            Undo reset
          </Button>
        ) : null}
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
    </motion.li>
  )
}
