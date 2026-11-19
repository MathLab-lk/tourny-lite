'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Loader2, Link2, MessageCircle, Plus, Presentation, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/app-store'
import { useToast } from '@/hooks/use-toast'
import { EventDialog } from '@/components/tournament/event-dialog'
import { AddEventDialog } from '@/components/tournament/add-event-dialog'
import { AuditRow } from '@/components/tournament/manage/audit-row'
import {
  EmptyState,
  PageHeader,
  StatStrip,
  TournamentStatusChip,
  AnimatedNumber,
  easeOutExpo,
  eventStatusMeta,
  springPop,
  staggerChild,
  staggerParent,
} from '@/components/tournament/ui-bits'
import { cn, copyText } from '@/lib/utils'
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
  const openScoreboard = useAppStore((s) => s.openScoreboard)
  const setView = useAppStore((s) => s.setView)
  const session = useAppStore((s) => s.session)
  const isAdmin = session?.role === 'admin'
  const sendWhatsApp = useAppStore((s) => s.sendWhatsApp)

  const [selectedEvent, setSelectedEvent] = useState<EventDTO | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const copyGuestLink = async () => {
    if (!activeId) return
    const url = `${window.location.origin}/present/${activeId}`
    const ok = await copyText(url)
    if (ok) {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } else {
      toast({ title: 'Copy failed', description: url, variant: 'destructive' })
    }
  }

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
        <EmptyState title="No tournament selected" hint="Choose a tournament to get started." />
      </div>
    )
  }

  const { tournament, divisions, games, centers, events, progress } = detail

  const doPrint = () => {
    try {
      printSheet('progress')
    } catch {
      toast({ title: 'Could not open the print sheet', variant: 'destructive' })
    }
  }

  const shareStandings = async () => {
    if (!activeId) return
    setSharing(true)
    const out = await sendWhatsApp('standings', { tournamentId: activeId })
    setSharing(false)
    if (out.ok) {
      toast({
        title: 'Standings card shared',
        description: `${out.via === 'text' ? 'Sent as a text message' : 'Sent as a styled card'} to ${out.groupName ?? 'the WhatsApp group'}.`,
      })
    } else {
      toast({ title: 'Could not share the standings', description: out.error, variant: 'destructive' })
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: easeOutExpo }}
      className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6"
    >
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
            <Button size="sm" className="h-8 gap-1.5" onClick={openScoreboard}>
              <Presentation className="h-4 w-4" aria-hidden /> Present
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={doPrint}>
              <Printer className="h-4 w-4" aria-hidden /> Print
            </Button>
            {isAdmin ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5"
                onClick={() => void shareStandings()}
                disabled={sharing}
                title="Send the standings to the WhatsApp group"
              >
                {sharing ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <MessageCircle className="h-4 w-4" aria-hidden />
                )}
                Share
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={() => void copyGuestLink()}
              title="Copy the public link guests open to watch the live scoreboard"
            >
              {linkCopied ? (
                <Check className="h-4 w-4 text-emerald-600" aria-hidden />
              ) : (
                <Link2 className="h-4 w-4" aria-hidden />
              )}
              {linkCopied ? 'Copied' : 'Guest link'}
            </Button>
          </>
        }
      />

      {/* The page reveals as one flowing sequence — stats,
          matrix, activity — never three hard-cut blocks. */}
      <motion.div variants={staggerParent} initial="hidden" animate="show">
        {/* Progress stats */}
        <StatStrip
          className="mt-5 sm:grid-cols-5"
          items={[
            {
              label: 'Completed',
              value: `${progress.completed}/${progress.total}`,
              hint: (
                <span className="block h-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-emerald-600/80 transition-all duration-500 dark:bg-emerald-500/80"
                    style={{ width: `${progress.percent}%` }}
                  />
                </span>
              ),
            },
            { label: 'In progress', value: <AnimatedNumber value={progress.inProgress} /> },
            { label: 'Pending', value: <AnimatedNumber value={progress.pending} /> },
            { label: 'Centers', value: <AnimatedNumber value={centers.length} /> },
            { label: 'Students', value: <AnimatedNumber value={detail.students.length} /> },
          ]}
        />

        {/* Event matrix */}
        <motion.section variants={staggerChild} className="mt-7" aria-label="Events">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Events</h2>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            {isAdmin ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={() => setAddOpen(true)}
                title="Append event slots — under an existing or a brand-new category and game"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> Add
              </Button>
            ) : null}
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
                      <span className="block text-[10px] font-normal text-muted-foreground sinhala">{g.sinhalaName}</span>
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
                                    'min-h-10 min-w-10 rounded-md px-2 py-1 text-xs font-semibold transition duration-300 hover:scale-105',
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
                                    <motion.span
                                      key={`${e.result.firstPlaceCode ?? ''}/${e.result.secondPlaceCode ?? ''}/${e.result.thirdPlaceCode ?? ''}`}
                                      initial={{ opacity: 0, scale: 0.7 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      transition={springPop}
                                      className="block text-[9px] font-medium leading-tight opacity-75 tabular-nums"
                                    >
                                      {e.result.firstPlaceCode ?? '—'}/{e.result.secondPlaceCode ?? '—'}/{e.result.thirdPlaceCode ?? '—'}
                                    </motion.span>
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
        </motion.section>

        {/* Recent activity */}
        <motion.section variants={staggerChild} className="mt-7" aria-label="Recent activity">
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
        </motion.section>
      </motion.div>

      <EventDialog key={liveSelectedEvent?.id ?? 'none'} event={liveSelectedEvent} onClose={() => setSelectedEvent(null)} />
      <AddEventDialog open={addOpen} onOpenChange={setAddOpen} />
    </motion.div>
  )
}
