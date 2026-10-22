'use client'

import { useMemo, useState } from 'react'
import { Loader2, Lock, RotateCcw, Save, Undo2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { PodiumEditor, type PodiumValue } from '@/components/tournament/podium-editor'
import { AuditRow } from '@/components/tournament/manage/audit-row'
import { StatusChip } from '@/components/tournament/ui-bits'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'
import type { AuditEntryDTO, EventDTO } from '@/lib/types'

interface EventDialogProps {
  event: EventDTO | null
  onClose: () => void
}

/**
 * Event detail — view, record, correct or reset a single result,
 * with its own revision trail.
 */
export function EventDialog({ event, onClose }: EventDialogProps) {
  const { toast } = useToast()
  const detail = useAppStore((s) => s.detail)
  const session = useAppStore((s) => s.session)
  const isAdmin = session?.role === 'admin'
  const submitResult = useAppStore((s) => s.submitResult)
  const resetResult = useAppStore((s) => s.resetResult)
  const setEventStatus = useAppStore((s) => s.setEventStatus)
  const setAuthDialogOpen = useAppStore((s) => s.setAuthDialogOpen)

  const [podium, setPodium] = useState<PodiumValue>(() => ({
    first: event?.result?.firstPlaceCenterId ?? null,
    second: event?.result?.secondPlaceCenterId ?? null,
    third: event?.result?.thirdPlaceCenterId ?? null,
  }))
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState(event?.result?.notes ?? '')
  const [busy, setBusy] = useState<'save' | 'reset' | null>(null)
  const [resetOpen, setResetOpen] = useState(false)

  // NOTE: this dialog is remounted via key={event.id} by the parent,
  // so local state initializes fresh for each opened event.

  const isCorrection = Boolean(event?.result)
  const audit = useAppStore((s) => s.audit)

  const eventAudit = useMemo<AuditEntryDTO[]>(
    () => (event ? audit.filter((a) => a.eventId === event.id) : []),
    [audit, event]
  )

  if (!event || !detail) return null
  const tournament = detail.tournament
  const dirty =
    podium.first !== (event.result?.firstPlaceCenterId ?? null) ||
    podium.second !== (event.result?.secondPlaceCenterId ?? null) ||
    podium.third !== (event.result?.thirdPlaceCenterId ?? null)

  const save = async () => {
    if (!session) return
    setBusy('save')
    const out = await submitResult({
      eventId: event.id,
      firstPlaceCenterId: podium.first,
      secondPlaceCenterId: podium.second,
      thirdPlaceCenterId: podium.third,
      recordedBy: session.name,
      notes,
      reason: reason.trim() || 'Correction from the console',
    })
    setBusy(null)
    if (out.ok) {
      toast({ title: isCorrection ? 'Result corrected' : 'Result recorded', description: event.label })
      onClose()
    } else {
      toast({ title: 'Could not save the result', description: out.error, variant: 'destructive' })
    }
  }

  const doReset = async () => {
    setBusy('reset')
    const ok = await resetResult(event.id, reason.trim() || 'Reset from the console')
    setBusy(null)
    if (ok) {
      toast({ title: 'Result reset', description: `${event.label} is pending again.` })
      onClose()
    } else {
      toast({ title: 'Could not reset the result', variant: 'destructive' })
    }
  }

  const changeStatus = async (status: string) => {
    const ok = await setEventStatus(event.id, status)
    if (ok) toast({ title: 'Status updated', description: `${event.label} — ${status.replace('_', ' ')}` })
  }

  return (
    <Dialog open={event !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5 text-base">
            {event.label}
            <StatusChip status={event.status} />
          </DialogTitle>
          <DialogDescription>
            Cat {event.divisionCode} · {event.gameName}
            {event.gameSinhalaName ? <span className="sinhala"> ({event.gameSinhalaName})</span> : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Status control */}
          {session ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Status</span>
              {(['pending', 'in_progress', 'completed'] as const).map((st) => (
                <Button
                  key={st}
                  size="sm"
                  variant={event.status === st ? 'secondary' : 'ghost'}
                  className={cn('h-7 px-2.5 text-xs capitalize', event.status === st && 'font-semibold')}
                  onClick={() => void changeStatus(st)}
                  disabled={event.status === st}
                >
                  {st.replace('_', ' ')}
                </Button>
              ))}
            </div>
          ) : null}

          {/* Podium editor */}
          <PodiumEditor
            centers={detail.centers}
            points={{ first: tournament.pointsFirst, second: tournament.pointsSecond, third: tournament.pointsThird }}
            value={podium}
            onChange={setPodium}
            disabled={!session}
            compact
          />

          {session ? (
            <>
              <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="me-notes" className="text-xs text-muted-foreground">Notes</Label>
                  <Textarea id="me-notes" className="min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional remarks" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="me-reason" className="text-xs text-muted-foreground">
                    Justification {event.result ? '(required for corrections)' : '(optional)'}
                  </Label>
                  <Textarea
                    id="me-reason"
                    className={cn('min-h-16', event.result && !reason.trim() && 'border-amber-600/50')}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={event.result ? 'e.g. Transcription error on the mark sheet' : ''}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                <Button
                  className="gap-1.5 font-semibold"
                  onClick={save}
                  disabled={busy !== null || (!podium.first && !podium.second && !podium.third) || (isCorrection && !reason.trim() && dirty)}
                >
                  {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                  {event.result ? 'Save correction' : 'Record result'}
                </Button>
                {event.result && isAdmin ? (
                  <Button variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setResetOpen((v) => !v)} disabled={busy !== null}>
                    <RotateCcw className="h-4 w-4" aria-hidden /> Reset…
                  </Button>
                ) : null}
              </div>

              {resetOpen ? (
                <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                  <p className="text-sm font-semibold text-destructive">Reset this result?</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    The podium is cleared and the event returns to pending. A justification is required.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="destructive" className="gap-1.5" onClick={doReset} disabled={busy !== null || !reason.trim()}>
                      {busy === 'reset' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Undo2 className="h-4 w-4" aria-hidden />}
                      Confirm reset
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setResetOpen(false)}>Cancel</Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-4">
              <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                Sign in to record or correct this result.
              </p>
              <Button size="sm" className="shrink-0" onClick={() => setAuthDialogOpen(true)}>
                Sign in
              </Button>
            </div>
          )}

          {/* Per-event history */}
          {eventAudit.length > 0 ? (
            <div className="border-t pt-4">
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">History for this event</h3>
              <ul className="max-h-52 divide-y overflow-y-auto rounded-lg border">
                {eventAudit.map((a) => (
                  <AuditRow key={a.id} entry={a} dense />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
