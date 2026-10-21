'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Award,
  CheckCircle2,
  CloudOff,
  Loader2,
  Lock,
  PenLine,
  RefreshCw,
  Send,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { PodiumEditor, type PodiumValue } from '@/components/tournament/podium-editor'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'
import type { EventDTO } from '@/lib/types'

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  in_progress: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-600/40',
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40',
}

export function JudgeView() {
  const { toast } = useToast()
  const detail = useAppStore((s) => s.detail)
  const loading = useAppStore((s) => s.loadingDetail)
  const session = useAppStore((s) => s.session)
  const submitResult = useAppStore((s) => s.submitResult)
  const online = useAppStore((s) => s.online)
  const setAuthDialogOpen = useAppStore((s) => s.setAuthDialogOpen)

  const [divisionId, setDivisionId] = useState<string | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)
  const [podium, setPodium] = useState<PodiumValue>({ first: null, second: null, third: null })
  const [notes, setNotes] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [queueCount, setQueueCount] = useState(0)

  const activeId = useAppStore((s) => s.activeTournamentId)
  const getQueueCount = useAppStore((s) => s.getQueueCount)
  const flushQueue = useAppStore((s) => s.flushQueue)

  useEffect(() => {
    const update = () => activeId && setQueueCount(getQueueCount(activeId))
    const t = setTimeout(update, 0)
    window.addEventListener('tourny-queue-changed', update)
    return () => {
      clearTimeout(t)
      window.removeEventListener('tourny-queue-changed', update)
    }
  }, [activeId, getQueueCount])

  const divisions = detail?.divisions ?? []
  const centers = detail?.centers ?? []
  const events = detail?.events ?? []
  const tournament = detail?.tournament

  // Derive effective selections — auto-fall back to first division/game
  // without state-syncing effects
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
        description: 'The connection appears to be unavailable. The result will sync automatically once it is restored.',
      })
      clearSelection()
    } else if (out.ok) {
      toast({
        title: isCorrection ? 'Result corrected' : 'Result recorded',
        description: confirmText,
      })
      clearSelection()
    } else {
      toast({ title: 'Could not save the result', description: out.error, variant: 'destructive' })
    }
  }

  if (loading && !detail) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    )
  }
  if (!detail || !tournament) {
    return <EmptyState />
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-6">
      {/* Identity + sync status */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {session ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
              {session.name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
            </span>
            Recording results as <span className="font-medium text-foreground">{session.name}</span>
          </p>
        ) : (
          <div className="flex w-full max-w-xl items-center gap-2.5 rounded-xl border bg-card px-3.5 py-2.5">
            <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              You are viewing as a guest. Sign in to record results.
            </p>
            <Button size="sm" className="h-8 shrink-0 font-semibold" onClick={() => setAuthDialogOpen(true)}>
              Sign in
            </Button>
          </div>
        )}
        {!online || queueCount > 0 ? (
          <div className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', queueCount > 0 ? 'border-amber-600/50 bg-amber-500/10' : 'border-destructive/40 bg-destructive/10')}>
            <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
            <span className="font-medium">
              {queueCount > 0 ? `${queueCount} result(s) waiting to sync` : 'Offline — results are saved on this device'}
            </span>
            {queueCount > 0 ? (
              <Button size="sm" variant="outline" className="ml-1 h-8 gap-1.5" onClick={() => void flushQueue()}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Sync now
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {centers.length < 3 ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-600/50 bg-amber-500/10 p-4 text-sm">
          <Award className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
          <div>
            <p className="font-semibold">Add participating centers first</p>
            <p className="text-muted-foreground">
              A full podium needs at least three centers. Centers are managed from the
              coordination console.
            </p>
          </div>
        </div>
      ) : null}

      {/* Step 1: Divisions */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Divisions">
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
                'shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:bg-muted/60'
              )}
            >
              {d.name.replace(/^Category\s+/i, '') === d.name ? d.name : `Category ${d.code}`}
              <span className={cn('ml-1.5 text-xs font-medium tabular-nums', active ? 'opacity-80' : 'text-muted-foreground')}>
                {done}/{divEvents.length}
              </span>
            </button>
          )
        })}
      </div>

      {/* Step 2: Games */}
      <div className="mb-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Games">
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
                'shrink-0 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors',
                active ? 'border-foreground bg-foreground text-background' : 'border-border bg-card hover:bg-muted/60'
              )}
            >
              {g.englishName}
              {g.sinhalaName ? <span className={cn('ml-2 text-xs font-normal', active ? 'opacity-75' : 'text-muted-foreground sinhala')}>{g.sinhalaName}</span> : null}
            </button>
          )
        })}
        {gamesInDivision.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No games are scheduled for this division.</p>
        ) : null}
      </div>

      {/* Step 3: Event slots + podium */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Event slots</h2>
          {slots.map((e) => {
            const r = e.result
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => openEvent(e)}
                className={cn(
                  'w-full rounded-xl border p-3.5 text-left transition-colors',
                  eventId === e.id ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border bg-card hover:bg-muted/40'
                )}
                aria-pressed={eventId === e.id}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">Event {e.subEventIndex}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide', STATUS_BADGE[e.status])}>
                    {e.status.replace('_', ' ')}
                  </span>
                </div>
                {r ? (
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
                    <span className="font-semibold text-amber-700 dark:text-amber-400">1st {r.firstPlaceCode ?? '—'}</span>
                    <span className="font-semibold text-slate-500 dark:text-slate-300">2nd {r.secondPlaceCode ?? '—'}</span>
                    <span className="font-semibold text-orange-700 dark:text-orange-400">3rd {r.thirdPlaceCode ?? '—'}</span>
                  </p>
                ) : (
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    {session ? 'No result yet — select to record' : 'No result yet'}
                  </p>
                )}
              </button>
            )
          })}
          {slots.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              There are no event slots for this game in this division.
            </p>
          ) : null}
        </div>

        {/* Podium panel */}
        <div>
          {selectedEvent ? (
            <Card className="sticky top-20">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <Award className="h-5 w-5 text-primary" aria-hidden />
                    {selectedEvent.label}
                  </span>
                  <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={clearSelection}>
                    Close
                  </Button>
                </CardTitle>
                {isCorrection ? (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                    <PenLine className="h-3.5 w-3.5" aria-hidden />
                    A result is already recorded — submitting again will correct it and add an audit entry.
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
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
                      <Textarea id="judge-notes" className="min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Tie-break decisions, disqualifications, remarks…" />
                    </div>
                    <Button
                      size="lg"
                      className="h-13 w-full gap-2 py-3.5 text-base font-semibold"
                      disabled={!podium.first && !podium.second && !podium.third}
                      onClick={() => setConfirmOpen(true)}
                    >
                      <Send className="h-5 w-5" aria-hidden />
                      {isCorrection ? 'Correct result' : 'Record result'}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                      You will be asked to confirm before the result is recorded.
                    </p>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed p-6 text-center">
                    <Lock className="mx-auto h-5 w-5 text-muted-foreground/60" aria-hidden />
                    <p className="mt-2 text-sm font-medium">Sign in to record this result</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Results can only be entered by signed-in scorekeepers.
                    </p>
                    <Button size="sm" className="mt-3 font-semibold" onClick={() => setAuthDialogOpen(true)}>
                      Sign in
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="hidden border-dashed lg:block">
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <CheckCircle2 className="h-9 w-9 text-muted-foreground/30" aria-hidden />
                <p className="text-sm text-muted-foreground">Select an event slot to {session ? 'record its podium.' : 'view its result.'}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Confirm dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm result</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <span className="block">Please verify the podium before recording:</span>
                <span className="block rounded-lg bg-muted px-3 py-2 text-sm font-semibold">{confirmText}</span>
                {isCorrection ? (
                  <span className="block text-amber-700 dark:text-amber-400">
                    This replaces the existing result and is recorded in the audit trail.
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
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
              Confirm &amp; record
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-20 text-center">
      <Award className="h-12 w-12 text-muted-foreground/40" aria-hidden />
      <h2 className="text-lg font-semibold">No tournament selected</h2>
      <p className="text-sm text-muted-foreground">
        Choose a tournament from the selector above, or open one from the tournaments page.
      </p>
    </div>
  )
}
