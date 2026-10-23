'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAppStore } from '@/store/app-store'
import { AuditRow } from '@/components/tournament/manage/audit-row'
import { EmptyState, PageHeader, easeOutExpo } from '@/components/tournament/ui-bits'
import { cn } from '@/lib/utils'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'created', label: 'Recorded' },
  { key: 'updated', label: 'Corrected' },
  { key: 'reset', label: 'Reset' },
] as const

type FilterKey = (typeof FILTERS)[number]['key']

/**
 * History — the full revision trail, filterable. Every recorded,
 * corrected or reset result with its author and justification.
 */
export function HistoryView() {
  const detail = useAppStore((s) => s.detail)
  const loading = useAppStore((s) => s.loadingDetail)
  const activeId = useAppStore((s) => s.activeTournamentId)
  const audit = useAppStore((s) => s.audit)
  const loadAudit = useAppStore((s) => s.loadAudit)
  const [filter, setFilter] = useState<FilterKey>('all')

  useEffect(() => {
    if (activeId) void loadAudit(activeId)
  }, [activeId, detail?.progress.completed, loadAudit])

  if (loading && !detail) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 pt-6 sm:px-6">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-6 h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 pt-10 sm:px-6">
        <EmptyState title="No tournament selected" hint="Choose a tournament to get started." />
      </div>
    )
  }

  const entries = filter === 'all' ? audit : audit.filter((a) => a.action === filter)

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: easeOutExpo }}
      className="mx-auto w-full max-w-4xl px-4 pt-6 sm:px-6"
    >
      <PageHeader
        title="History"
        meta="Every result change with its author and justification"
        actions={
          <div
            className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5"
            role="group"
            aria-label="Filter history"
          >
            {FILTERS.map((f) => {
              const active = filter === f.key
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  aria-pressed={active}
                  className={cn(
                    'relative min-h-9 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    active
                      ? 'font-semibold text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="history-segment"
                      transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                      className="absolute inset-0 rounded-md bg-card shadow-md ring-1 ring-black/10"
                      aria-hidden
                    />
                  ) : null}
                  <span className="relative z-10">{f.label}</span>
                </button>
              )
            })}
          </div>
        }
      />

      <div className="mt-5 overflow-hidden rounded-lg border bg-card">
        {entries.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-14 text-[13px] text-muted-foreground">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
              </>
            ) : audit.length === 0 ? (
              'No results recorded yet.'
            ) : (
              'No entries of this kind.'
            )}
          </div>
        ) : (
          <motion.ul
            key={filter}
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
            className="divide-y"
          >
            {entries.map((a) => (
              <AuditRow key={a.id} entry={a} />
            ))}
          </motion.ul>
        )}
      </div>
    </motion.div>
  )
}
