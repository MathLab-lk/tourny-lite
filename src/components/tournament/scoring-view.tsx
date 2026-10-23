'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Award,
  Loader2,
  Lock,
  Send,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useToast } from '@/hooks/use-toast'
import { useIsDesktop } from '@/hooks/use-mobile'
import { PodiumEditor, type PodiumValue } from '@/components/tournament/podium-editor'
import { EmptyState, StatusChip, medalText } from '@/components/tournament/ui-bits'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'
import type { EventDTO } from '@/lib/types'

/**
 * Scoring console — pick a division, pick a game, tap through the podium.
 * Optimized for fast, repeatable field entry on touch and desktop alike.
 */

export function ScoringView() {
  const { toast } = useToast()
  const detail = useAppStore((s) => s.detail)
  const loading = useAppStore((s) => s.loadingDetail)
  const session = useAppStore((s) => s.session)
  const submitResult = useAppStore((s) => s.submitResult)
  const setAuthDialogOpen = useAppStore((s) => s.setAuthDialogOpen)
  const isDesktop = useIsDesktop()

  const [divisionId, setDivisionId] = useState<string | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)
  const [podium, setPodium] = useState<PodiumValue>({ first: null, second: null, third: null })
  const [notes, setNotes] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const divisions = detail?.divisions ?? []
  const centers = detail?.centers ?? []
  const events = detail?.events ?? []
  const tournament = detail?.tournament

  // Effective selections — fall back to the first available without effects
  const effectiveDivisionId = divisions.some((d) => d.id === divisionId)
    ? divisionId
    : (divisions[0]?.id ?? null)

  const gamesInDivision = useMemo(() => {
    if (!effectiveDivisionId) return []
    const games = (detail?.games ?? []).filter((g) =>
      events.some((e) => e.divisionId === effectiveDivisionId && e.gameId === g.id)
    )
    return games.map((g) => ({
      ...g,
      eventCount: events.filter((e) => e.gameId === g.id && e.divisionId === effectiveDivisionId).length,
    }))
  }, [effectiveDivisionId, events, detail])

  const effectiveGameId = gamesInDivision.some((g) => g.id === gameId)
    ? gameId
    : (gamesInDivision[0]?.id ?? null)

  const slots = useMemo(
    () =>
      events
        .filter((e) => e.divisionId === effectiveDivisionId && e.gameId === effectiveGameId)
        .sort((a, b) => a.subEventIndex - b.subEventIndex),
    [events, effectiveDivisionId, effectiveGameId]
  )

  const selectedEvent = slots.find((e) => e.id === eventId) ?? null
  const isCorrection = Boolean(selectedEvent?.result)

  const openEvent = (e: EventDTO) => {
    setEventId(e.id)
    setPodium({
      first: e.result?.firstPlaceCenterId ?? null,
      second: e.result?.secondPlaceCenterId ?? null,
      third: e.result?.thirdPlaceCenterId ?? null,
    })
    setNotes(e.result?.notes ?? '')
  }

  const clearSelection = () => {
    setEventId(null)
    setPodium({ first: null, second: null, third: null })
    setNotes('')
  }

  const centerCode = (id: string | null) => centers.find((c) => c.id === id)?.centerCode ?? '—'

  const confirmText = selectedEvent
    ? `${selectedEvent.label} — 1st: ${centerCode(podium.first)}, 2nd: ${centerCode(podium.second)}, 3rd: ${centerCode(podium.third)}`
    : ''

  const doSubmit = async () => {
    if (!selectedEvent) return
    setSubmitting(true)
    const out = await submitResult({
      eventId: selectedEvent.id,
      firstPlaceCenterId: podium.first,
      secondPlaceCenterId: podium.second,
      thirdPlaceCenterId: podium.third,
      recordedBy: session?.name ?? '',
      notes,
      reason: isCorrection ? 'Re-entered from the scoring console' : undefined,
    })
    setSubmitting(false)
    setConfirmOpen(false)
    if (out.ok && out.queued) {
      toast({
        title: 'Saved on this device',
        description: 'It will sync automatically once the connection is restored.',
      })
      clearSelection()
    } else if (out.ok) {
      toast({ title: isCorrection ? 'Result corrected' : 'Result recorded', description: confirmText })
      clearSelection()
    } else {
      toast({ title: 'Could not save the result', description: out.error, variant: 'destructive' })
    }
  }

  if (loading && !detail) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6">
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 w-20 animate-pulse rounded-full bg-muted" />
          ))}
        </div>
        <div className="mt-6 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg border bg-card" />
          ))}
        </div>
      </div>
    )
  }

  if (!detail || !tournament) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 pt-10 sm:px-6">
        <EmptyState title="No tournament selected" hint="Choose a tournament to get started." />
      </div>
    )
  }

  const recordPanel = selectedEvent ? (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Award className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 text-sm font-semibold">{selectedEvent.label}</span>
          <StatusChip status={selectedEvent.status} />
        </div>
      </div>

      {isCorrection ? (
        <p className="rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
          A result is already recorded — saving again corrects it and adds a history entry.
        </p>
      ) : null}

      <PodiumEditor
        centers={centers}
        points={{ first: tournament.pointsFirst, second: tournament.pointsSecond, third: tournament.pointsThird }}
        value={podium}
        onChange={setPodium}
        disabled={!session}
      />

      {session ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="judge-notes" className="text-xs text-muted-foreground">Notes (optional)</Label>
            <Textarea id="judge-notes" className="min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tie-breaks, disqualifications…" />
          </div>
          <Button
            size="lg"
            className="h-12 w-full gap-2 text-[15px] font-semibold"
            disabled={!podium.first && !podium.second && !podium.third}
            onClick={() => setConfirmOpen(true)}
          >
            <Send className="h-4 w-4" aria-hidden />
            {isCorrection ? 'Correct result' : 'Record result'}
          </Button>
        </>
      ) : (
        <div className="rounded-lg border border-dashed p-5 text-center">
          <Lock className="mx-auto h-5 w-5 text-muted-foreground/60" aria-hidden />
          <p className="mt-2 text-sm font-medium">Sign in to record</p>
          <Button size="sm" className="mt-3" onClick={() => setAuthDialogOpen(true)}>
            Sign in
          </Button>
        </div>
      )}
    </div>
  ) : null

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6">
      {/* Divisions */}
      {divisions.length > 0 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Divisions">
          {divisions.map((d) => {
            const divEvents = events.filter((e) => e.divisionId === d.id)
            const done = divEvents.filter((e) => e.status === 'completed').length
            const active = effectiveDivisionId === d.id
            return (
              <button
                key={d.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setDivisionId(d.id)}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:bg-muted/60'
                )}
              >
                Cat {d.code}
                <span className={cn('text-xs tabular-nums', active ? 'opacity-80' : 'text-muted-foreground')}>
                  {done}/{divEvents.length}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      {/* Games */}
      {gamesInDivision.length > 0 ? (
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Games">
          {gamesInDivision.map((g) => {
            const active = effectiveGameId === g.id
            return (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setGameId(g.id)}
                className={cn(
                  'shrink-0 rounded-md border px-3 py-1.5 text-[13px] transition-colors',
                  active
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-card text-foreground hover:bg-muted/60'
                )}
              >
                {g.englishName}
                {g.sinhalaName ? (
                  <span className={cn('ml-1.5 text-xs', active ? 'opacity-70' : 'text-muted-foreground sinhala')}>
                    {g.sinhalaName}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}

      {centers.length < 3 ? (
        <div className="mt-4 rounded-lg border border-amber-600/40 bg-amber-500/10 px-3.5 py-2.5 text-[13px] text-amber-800 dark:text-amber-300">
          A podium needs at least 3 centers — add them from the Centers page.
        </div>
      ) : null}

      {/* Events + record panel */}
      {slots.length === 0 && gamesInDivision.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No events scheduled" hint="This tournament has no event slots yet." />
        </div>
      ) : slots.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No events for this game" />
        </div>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {/* Event slots */}
          <div>
            <ul className="divide-y overflow-hidden rounded-lg border bg-card">
              {slots.map((e) => {
                const r = e.result
                const active = eventId === e.id
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => openEvent(e)}
                      aria-pressed={active}
                      className={cn(
                        'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
                        active ? 'bg-accent/60' : 'hover:bg-muted/40'
                      )}
                    >
                      <span className="shrink-0 text-sm font-medium">Event {e.subEventIndex}</span>
                      {r ? (
                        <span className="flex min-w-0 flex-1 items-center gap-2 text-[13px] font-semibold tabular-nums">
                          <span className={cn('truncate', medalText.gold)}>1·{r.firstPlaceCode ?? '—'}</span>
                          <span className={cn('truncate', medalText.silver)}>2·{r.secondPlaceCode ?? '—'}</span>
                          <span className={cn('truncate', medalText.bronze)}>3·{r.thirdPlaceCode ?? '—'}</span>
                        </span>
                      ) : (
                        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                          {session ? 'No result yet' : 'No result yet'}
                        </span>
                      )}
                      <StatusChip status={e.status} className="shrink-0" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Record panel — sticky on desktop */}
          {isDesktop ? (
            <div className="sticky top-6 self-start">
              {selectedEvent ? (
                <div className="rounded-lg border bg-card p-5 shadow-sm">{recordPanel}</div>
              ) : (
                <div className="rounded-lg border border-dashed px-6 py-16 text-center">
                  <p className="text-[13px] text-muted-foreground">
                    Select an event to {session ? 'record its podium' : 'view its result'}.
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Record panel — dialog on mobile/tablet */}
      {!isDesktop ? (
        <Dialog open={selectedEvent !== null} onOpenChange={(open) => !open && clearSelection()}>
          <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader className="sr-only">
              <DialogTitle>{selectedEvent?.label ?? 'Record result'}</DialogTitle>
              <DialogDescription>
                Assign the podium places for this event and record the result.
              </DialogDescription>
            </DialogHeader>
            {recordPanel}
          </DialogContent>
        </Dialog>
      ) : null}

      {/* Confirm */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm result</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <span className="block">Verify the podium before recording:</span>
                <span className="block rounded-md bg-muted px-3 py-2 text-sm font-semibold">{confirmText}</span>
                {isCorrection ? (
                  <span className="block text-amber-700 dark:text-amber-400">
                    This replaces the existing result and is recorded in the history.
                  </span>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Review again</AlertDialogCancel>
            <AlertDialogAction
              className="gap-1.5 bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
              onClick={(e) => {
                e.preventDefault()
                void doSubmit()
              }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Confirm &amp; record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
