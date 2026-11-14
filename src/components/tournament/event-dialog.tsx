'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { GraduationCap, Loader2, Lock, MessageCircle, RotateCcw, Save, Undo2 } from 'lucide-react'
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
import { easeOutExpo, medalText, StatusChip } from '@/components/tournament/ui-bits'
import { PodiumEditor, type PodiumValue } from '@/components/tournament/podium-editor'
import { AuditRow } from '@/components/tournament/manage/audit-row'
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
  const sendWhatsApp = useAppStore((s) => s.sendWhatsApp)
  const setAuthDialogOpen = useAppStore((s) => s.setAuthDialogOpen)

  const [podium, setPodium] = useState<PodiumValue>(() => ({
    first: event?.result?.firstPlaceCenterId ?? null,
    second: event?.result?.secondPlaceCenterId ?? null,
    third: event?.result?.thirdPlaceCenterId ?? null,
  }))
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState(event?.result?.notes ?? '')
  const [busy, setBusy] = useState<'save' | 'reset' | 'share' | null>(null)
  const [resetOpen, setResetOpen] = useState(false)

  // NOTE: this dialog is remounted via key={event.id} by the parent,
  // so local state initializes fresh for each opened event.

  const isCorrection = Boolean(event?.result)
  const audit = useAppStore((s) => s.audit)

  // Student mark sheet state for this event (read view).
  const isStudentEvent = useMemo(
    () =>
      Boolean(event) &&
      (event!.scoringMode === 'students' ||
        event!.result?.derivedFromStudents === true ||
        (detail?.studentScores ?? []).some((s) => s.eventId === event!.id)),
    [event, detail]
  )
  const sheetRows = useMemo(() => {
    if (!event || !detail) return []
    const studentById = new Map(detail.students.map((s) => [s.id, s]))
    return detail.studentScores
      .filter((s) => s.eventId === event.id)
      .map((s) => ({ ...s, student: studentById.get(s.studentId) }))
      .filter((r) => r.student)
      .sort((a, b) => b.marks - a.marks)
  }, [event, detail])

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

  const shareResult = async () => {
    setBusy('share')
    const out = await sendWhatsApp('event', {
      tournamentId: detail.tournament.id,
      eventId: event.id,
    })
    setBusy(null)
    if (out.ok) {
      toast({
        title: 'Result card shared',
        description: `${out.via === 'text' ? 'Sent as a text message' : 'Sent as a styled card'} to ${out.groupName ?? 'the WhatsApp group'}.`,
      })
    } else {
      toast({ title: 'Could not share the result', description: out.error, variant: 'destructive' })
    }
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

          {/* Result view — the podium editor for classic events, the
              recorded mark sheet for student-scored ones. */}
          {isStudentEvent ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                <GraduationCap className="h-4 w-4 text-primary" aria-hidden />
                Scored by student marks
              </div>
              {sheetRows.length > 0 ? (
                <div className="overflow-hidden rounded-lg border">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                        <th className="p-2 text-left font-medium">Student</th>
                        <th className="p-2 text-left font-medium">Center</th>
                        <th className="p-2 text-right font-medium">Marks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sheetRows.map((row, i) => (
                        <tr key={row.studentId} className="border-b last:border-0">
                          <td className="p-2">
                            <span className="font-medium">{row.student!.name}</span>
                            {i < 3 ? (
                              <span
                                className={cn(
                                  'ml-1.5 text-[11px] font-bold',
                                  i === 0 && medalText.gold,
                                  i === 1 && medalText.silver,
                                  i === 2 && medalText.bronze
                                )}
                              >
                                {i + 1}
                              </span>
                            ) : null}
                          </td>
                          <td className="p-2 tabular-nums text-muted-foreground">
                            {row.student!.centerCode ?? '—'}
                          </td>
                          <td className="p-2 text-right font-semibold tabular-nums">{row.marks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">No marks recorded.</p>
              )}
              {event.result ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-muted/30 px-3 py-2.5 text-[13px] font-semibold tabular-nums">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Derived podium</span>
                  <span className={medalText.gold}>1st · {event.result.firstPlaceCode ?? '—'}</span>
                  <span className={medalText.silver}>2nd · {event.result.secondPlaceCode ?? '—'}</span>
                  <span className={medalText.bronze}>3rd · {event.result.thirdPlaceCode ?? '—'}</span>
                </div>
              ) : null}
              <p className="text-[11px] text-muted-foreground">
                Each center&rsquo;s entry is the sum of its students&rsquo; marks; the podium above was derived from those
                sums and pays the fixed place points. Corrections are made from the Scoring console → Student marks.
              </p>
            </div>
          ) : (
            <PodiumEditor
              centers={detail.centers}
              points={{ first: tournament.pointsFirst, second: tournament.pointsSecond, third: tournament.pointsThird }}
              value={podium}
              onChange={setPodium}
              disabled={!session}
              compact
            />
          )}

          {session ? (
            <>
              <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="me-notes" className="text-xs text-muted-foreground">Notes</Label>
                  <Textarea id="me-notes" className="min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional remarks" disabled={isStudentEvent} />
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
                {isStudentEvent ? (
                  <p className="text-[13px] text-muted-foreground">
                    This event is scored by student marks — correct it from <span className="font-medium">Scoring → Student marks</span>, or reset it below.
                  </p>
                ) : (
                  <Button
                    className="gap-1.5 font-semibold"
                    onClick={save}
                    disabled={busy !== null || (!podium.first && !podium.second && !podium.third) || (isCorrection && !reason.trim() && dirty)}
                  >
                    {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                    {event.result ? 'Save correction' : 'Record result'}
                  </Button>
                )}
                {event.result && isAdmin ? (
                  <Button
                    variant="ghost"
                    className="gap-1.5"
                    onClick={() => void shareResult()}
                    disabled={busy !== null}
                    title="Send this podium to the WhatsApp group"
                  >
                    {busy === 'share' ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <MessageCircle className="h-4 w-4" aria-hidden />
                    )}
                    Share
                  </Button>
                ) : null}
                {event.result && isAdmin ? (
                  <Button variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setResetOpen((v) => !v)} disabled={busy !== null}>
                    <RotateCcw className="h-4 w-4" aria-hidden /> Reset…
                  </Button>
                ) : null}
              </div>

              {/* Reset confirmation — unfolds in place like a
                  drawer, never snapping open. */}
              <AnimatePresence initial={false}>
                {resetOpen ? (
                  <motion.div
                    key="reset-confirm"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: easeOutExpo }}
                    className="overflow-hidden"
                  >
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
                  </motion.div>
                ) : null}
              </AnimatePresence>
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
