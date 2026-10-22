'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, Loader2, Presentation, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store/app-store'
import { useToast } from '@/hooks/use-toast'
import { EventDialog } from '@/components/tournament/event-dialog'
import { AuditRow } from '@/components/tournament/manage/audit-row'
import {
  EmptyState,
  PageHeader,
  StatStrip,
  TournamentStatusChip,
  eventStatusMeta,
} from '@/components/tournament/ui-bits'
import { cn } from '@/lib/utils'
import type { EventDTO } from '@/lib/types'

/**
 * Overview — the tournament at a glance: progress, the event matrix
 * and the latest activity. Everything actionable, nothing redundant.
 */
export function OverviewView() {
  const { toast } = useToast()
  const detail = useAppStore((s) => s.detail)
  const loading = useAppStore((s) => s.loadingDetail)
  const activeId = useAppStore((s) => s.activeTournamentId)
  const audit = useAppStore((s) => s.audit)
  const loadAudit = useAppStore((s) => s.loadAudit)
  const printSheet = useAppStore((s) => s.printSheet)
  const setView = useAppStore((s) => s.setView)

  const [selectedEvent, setSelectedEvent] = useState<EventDTO | null>(null)

  useEffect(() => {
    if (activeId) void loadAudit(activeId)
  }, [activeId, detail?.progress.completed, loadAudit])

  const liveSelectedEvent = useMemo(
    () => (selectedEvent && detail ? (detail.events.find((e) => e.id === selectedEvent.id) ?? selectedEvent) : null),
    [selectedEvent, detail]
  )

  if (loading && !detail) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="mt-6 h-24 animate-pulse rounded-lg bg-muted" />
        <div className="mt-6 h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  if (!detail || !activeId) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6">
        <EmptyState title="No tournament selected" hint="Pick a tournament from the sidebar." />
      </div>
    )
  }

  const { tournament, divisions, games, centers, events, progress } = detail

  const doPrint = (mode: 'progress' | 'awards') => {
    try {
      printSheet(mode)
    } catch {
      toast({ title: 'Could not open the print sheet', variant: 'destructive' })
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {tournament.name}
            <TournamentStatusChip status={tournament.status} />
          </span>
        }
        meta={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {tournament.organizer ? <span>{tournament.organizer}</span> : null}
            <span aria-hidden>·</span>
            <span className="tabular-nums">
              1st {tournament.pointsFirst} / 2nd {tournament.pointsSecond} / 3rd {tournament.pointsThird} pts
            </span>
          </span>
        }
        actions={
          <>
            <Button size="sm" className="h-8 gap-1.5" onClick={() => setView('scoreboard')}>
              <Presentation className="h-4 w-4" aria-hidden /> Scoreboard
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 gap-1.5">
                  <Printer className="h-4 w-4" aria-hidden /> Print
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => doPrint('progress')}>
                  <Printer className="mr-2 h-4 w-4" aria-hidden /> Progress sheet
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => doPrint('awards')}>
                  <Printer className="mr-2 h-4 w-4" aria-hidden /> Awards scorecard
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/* Progress stats */}
      <StatStrip
        className="mt-5"
        items={[
          {
            label: 'Completed',
            value: `${progress.completed}/${progress.total}`,
            hint: (
              <span className="block h-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-emerald-600/80 transition-all dark:bg-emerald-500/80"
                  style={{ width: `${progress.percent}%` }}
                />
              </span>
            ),
          },
          { label: 'In progress', value: progress.inProgress },
          { label: 'Pending', value: progress.pending },
          { label: 'Centers', value: centers.length },
        ]}
      />

      {/* Event matrix */}
      <section className="mt-7" aria-label="Events">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Events</h2>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            {(['pending', 'in_progress', 'completed'] as const).map((st) => (
              <span key={st} className="flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', eventStatusMeta(st).dot)} aria-hidden />
                {eventStatusMeta(st).label}
              </span>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="w-28 p-2.5 text-left text-xs font-medium text-muted-foreground">Division</th>
                {games.map((g) => (
                  <th key={g.id} className="p-2.5 text-center text-xs font-medium text-muted-foreground">
                    {g.englishName}
                    {g.sinhalaName ? (
                      <span className="block text-[10px] font-normal opacity-70 sinhala">{g.sinhalaName}</span>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {divisions.map((d) => (
                <tr key={d.id} className="border-b last:border-0">
                  <td className="p-2.5">
                    <p className="text-[13px] font-semibold">Cat {d.code}</p>
                    <p className="text-[11px] leading-tight text-muted-foreground">
                      {d.ageRange}
                      {d.gradeRange ? ` · Gr ${d.gradeRange}` : ''}
                    </p>
                  </td>
                  {games.map((g) => {
                    const slots = events
                      .filter((e) => e.divisionId === d.id && e.gameId === g.id)
                      .sort((a, b) => a.subEventIndex - b.subEventIndex)
                    return (
                      <td key={g.id} className="p-2.5 text-center align-top">
                        {slots.length === 0 ? (
                          <span className="text-muted-foreground/30">—</span>
                        ) : (
                          <div className="flex flex-wrap justify-center gap-1.5">
                            {slots.map((e) => {
                              const meta = eventStatusMeta(e.status)
                              return (
                                <button
                                  key={e.id}
                                  type="button"
                                  onClick={() => setSelectedEvent(e)}
                                  className={cn(
                                    'min-h-10 min-w-10 rounded-md px-2 py-1 text-xs font-semibold transition-transform hover:scale-105',
                                    meta.chip
                                  )}
                                  title={
                                    e.label +
                                    (e.result
                                      ? ` — 1st ${e.result.firstPlaceCode ?? '—'}, 2nd ${e.result.secondPlaceCode ?? '—'}, 3rd ${e.result.thirdPlaceCode ?? '—'}`
                                      : '')
                                  }
                                  aria-label={`${e.label}, ${meta.label}`}
                                >
                                  {e.subEventIndex}
                                  {e.result ? (
                                    <span className="block text-[9px] font-medium leading-tight opacity-75 tabular-nums">
                                      {e.result.firstPlaceCode ?? '—'}/{e.result.secondPlaceCode ?? '—'}/{e.result.thirdPlaceCode ?? '—'}
                                    </span>
                                  ) : null}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent activity */}
      <section className="mt-7" aria-label="Recent activity">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recent activity</h2>
          {audit.length > 0 ? (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setView('history')}>
              View all
            </Button>
          ) : null}
        </div>
        <div className="overflow-hidden rounded-lg border bg-card">
          {audit.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">
              {loading ? 'Loading…' : 'No results recorded yet.'}
            </p>
          ) : (
            <ul className="divide-y">
              {audit.slice(0, 5).map((a) => (
                <AuditRow key={a.id} entry={a} dense />
              ))}
            </ul>
          )}
        </div>
      </section>

      <EventDialog key={liveSelectedEvent?.id ?? 'none'} event={liveSelectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  )
}
