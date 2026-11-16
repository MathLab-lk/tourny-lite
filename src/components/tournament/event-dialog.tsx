'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Award, GraduationCap, Loader2, Lock, MessageCircle, RotateCcw, Save, Settings2, Trash2, Undo2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToastAction } from '@/components/ui/toast'
import { useToast } from '@/hooks/use-toast'
import { easeOutExpo, medalText, StatusChip } from '@/components/tournament/ui-bits'
import { PodiumEditor, type PodiumValue } from '@/components/tournament/podium-editor'
import { StudentMarksEditor } from '@/components/tournament/student-marks-editor'
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
 * with its own revision trail. Admins can also edit the slot
 * itself (its label and scoring mode) or remove it entirely when
 * it was created by mistake.
 */
export function EventDialog({ event, onClose }: EventDialogProps) {
  const { toast } = useToast()
  const detail = useAppStore((s) => s.detail)
  const session = useAppStore((s) => s.session)
  const isAdmin = session?.role === 'admin'
  const submitResult = useAppStore((s) => s.submitResult)
  const resetResult = useAppStore((s) => s.resetResult)
  const undoReset = useAppStore((s) => s.undoReset)
  const setEventStatus = useAppStore((s) => s.setEventStatus)
  const updateEvent = useAppStore((s) => s.updateEvent)
  const deleteEvent = useAppStore((s) => s.deleteEvent)
  const sendWhatsApp = useAppStore((s) => s.sendWhatsApp)
  const setAuthDialogOpen = useAppStore((s) => s.setAuthDialogOpen)

  const [podium, setPodium] = useState<PodiumValue>(() => ({
    first: event?.result?.firstPlaceCenterId ?? null,
    second: event?.result?.secondPlaceCenterId ?? null,
    third: event?.result?.thirdPlaceCenterId ?? null,
  }))
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState(event?.result?.notes ?? '')
  const [busy, setBusy] = useState<'save' | 'reset' | 'share' | 'settings' | 'delete' | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [undoBusy, setUndoBusy] = useState(false)

  // ── Slot settings (admins) — initialised fresh per event because
  // the parent remounts this dialog with key={event.id}.
  const [settingsLabel, setSettingsLabel] = useState(event?.label ?? '')
  const [settingsMode, setSettingsMode] = useState<'podium' | 'students'>(
    event?.scoringMode === 'students' ? 'students' : 'podium'
  )
  const [deleteOpen, setDeleteOpen] = useState(false)

  // NOTE: this dialog is remounted via key={event.id} by the parent,
  // so local state initializes fresh for each opened event.

  // Events already carrying student marks are scored (and corrected)
  // through the mark sheet — the podium console locks for them.
  const studentScoreIds = useMemo(
    () => new Set((detail?.studentScores ?? []).map((s) => s.eventId)),
    [detail]
  )
  const isStudentEvent = Boolean(
    event &&
      (event.scoringMode === 'students' ||
        event.result?.derivedFromStudents === true ||
        studentScoreIds.has(event.id))
  )

  // Which console this dialog shows — marks can be entered right
  // from the overview's bird's-eye matrix. Locked to the mark sheet
  // once student marks exist.
  const [scoreMode, setScoreMode] = useState<'podium' | 'students'>(() =>
    isStudentEvent ? 'students' : 'podium'
  )

  const isCorrection = Boolean(event?.result)
  const audit = useAppStore((s) => s.audit)

  // Recorded mark sheet for this event — the read-only view guests
  // and signed-out visitors see.
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

  // The event's latest reset, when it is still undoable — drives
  // the inline banner and the undo affordances.
  const undoableReset = useMemo(
    () => eventAudit.find((a) => a.action === 'reset' && a.canUndoReset) ?? null,
    [eventAudit]
  )

  if (!event || !detail) return null
  const tournament = detail.tournament
  const dirty =
    podium.first !== (event.result?.firstPlaceCenterId ?? null) ||
    podium.second !== (event.result?.secondPlaceCenterId ?? null) ||
    podium.third !== (event.result?.thirdPlaceCenterId ?? null)

  // Slot settings: the scoring mode is a fact of history once
  // anything is recorded — it only changes on a clean slot.
  const hasMarks = studentScoreIds.has(event.id)
  const modeLocked = Boolean(event.result) || hasMarks
  const settingsDirty = settingsLabel !== event.label || settingsMode !== event.scoringMode

  const saveSettings = async () => {
    if (!settingsDirty || busy) return
    setBusy('settings')
    const out = await updateEvent(event.id, {
      ...(settingsLabel.trim() && settingsLabel.trim() !== event.label ? { label: settingsLabel.trim() } : {}),
      ...(settingsMode !== event.scoringMode ? { scoringMode: settingsMode } : {}),
    })
    setBusy(null)
    if (out.ok) {
      toast({ title: 'Event updated', description: event.label })
    } else {
      toast({ title: 'Could not update the event', description: out.error, variant: 'destructive' })
    }
  }

  const doDelete = async () => {
    setBusy('delete')
    const out = await deleteEvent(event.id)
    setBusy(null)
    setDeleteOpen(false)
    if (out.ok) {
      toast({
        title: 'Event removed',
        description: `${event.label} — standings and progress recomputed without it.`,
      })
      onClose()
    } else {
      toast({ title: 'Could not remove the event', description: out.error, variant: 'destructive' })
    }
  }

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

  const doUndo = async () => {
    if (!event || undoBusy) return
    setUndoBusy(true)
    const out = await undoReset(event.id)
    setUndoBusy(false)
    if (out.ok) {
      toast({
        title: 'Reset undone',
        description: `${event.label} — the recorded result${out.restoredScores ? ' and mark sheet' : ''} are back exactly as they were.`,
      })
    } else {
      toast({ title: 'Could not undo the reset', description: out.error, variant: 'destructive' })
    }
  }

  const doReset = async () => {
    setBusy('reset')
    const ok = await resetResult(event.id, reason.trim() || 'Reset from the console')
    setBusy(null)
    if (ok) {
      toast({
        title: 'Result reset',
        description: `${event.label} is pending again.`,
        action: (
          <ToastAction altText="Undo the reset" onClick={() => void doUndo()}>
            Undo
          </ToastAction>
        ),
      })
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
          {/* Slot settings (admins) — relabel, re-score, remove. The
              scoring mode locks the moment anything is recorded. */}
          {session && isAdmin ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Settings2 className="h-3.5 w-3.5" aria-hidden /> Event settings
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                  disabled={busy !== null}
                  title="Remove this slot and everything recorded on it"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove…
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="me-label" className="text-xs text-muted-foreground">Label</Label>
                  <Input
                    id="me-label"
                    value={settingsLabel}
                    onChange={(e) => setSettingsLabel(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Scoring mode</Label>
                  <Select value={settingsMode} onValueChange={(v) => setSettingsMode(v === 'students' ? 'students' : 'podium')} disabled={modeLocked}>
                    <SelectTrigger className="w-full" aria-label="Scoring mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="podium">Center podium</SelectItem>
                      <SelectItem value="students">Student marks</SelectItem>
                    </SelectContent>
                  </Select>
                  {modeLocked ? (
                    <p className="text-[11px] text-muted-foreground">
                      Locked while a result is recorded — reset it first to switch.
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => void saveSettings()}
                  disabled={busy !== null || !settingsDirty || !settingsLabel.trim()}
                >
                  {busy === 'settings' ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Save className="h-4 w-4" aria-hidden />
                  )}
                  Save changes
                </Button>
              </div>
            </div>
          ) : null}

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

          {/* How this event is scored — marks can be entered right
              here from the overview's bird's-eye matrix. Locked to
              the mark sheet once marks exist. */}
          {session ? (
            <div className="flex gap-1 rounded-lg border bg-muted/30 p-1" role="tablist" aria-label="Scoring mode">
              <button
                type="button"
                role="tab"
                aria-selected={scoreMode === 'podium'}
                disabled={isStudentEvent && scoreMode !== 'podium'}
                onClick={() => setScoreMode('podium')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                  scoreMode === 'podium'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                  isStudentEvent && scoreMode !== 'podium' && 'cursor-not-allowed opacity-50'
                )}
                title={isStudentEvent ? 'This event is scored by student marks' : 'Pick the center podium directly'}
              >
                <Award className="h-3.5 w-3.5" aria-hidden /> Center podium
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={scoreMode === 'students'}
                onClick={() => setScoreMode('students')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                  scoreMode === 'students'
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                title="Enter per-student marks; the podium is derived from each center's sums"
              >
                <GraduationCap className="h-3.5 w-3.5" aria-hidden /> Student marks
              </button>
            </div>
          ) : null}

          {/* Result view — the mark sheet console for signed-in users,
              the recorded read-only sheet for guests on student-scored
              events, the podium editor otherwise. */}
          {session && scoreMode === 'students' ? (
            <StudentMarksEditor event={event} onDone={onClose} />
          ) : isStudentEvent ? (
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
                sums and pays the fixed place points.
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
            scoreMode === 'students' ? (
              // The mark sheet editor above carries its own notes,
              // justification and submit flow — only the admin
              // broadcast controls remain for a recorded result.
              event.result && isAdmin ? (
                <div className="flex flex-wrap items-center gap-2 border-t pt-4">
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
                  <Button variant="ghost" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => setResetOpen((v) => !v)} disabled={busy !== null}>
                    <RotateCcw className="h-4 w-4" aria-hidden /> Reset…
                  </Button>
                </div>
              ) : null
            ) : (
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
              </>
            )
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

          {/* Reset confirmation — unfolds in place like a drawer, never
              snapping open. In students mode the justification lives
              here: the mark sheet editor owns the other inputs. */}
          {session ? (
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
                      {scoreMode === 'students' || isStudentEvent
                        ? 'The podium and the whole mark sheet are cleared and the event returns to pending. A justification is required.'
                        : 'The podium is cleared and the event returns to pending. A justification is required.'}{' '}
                      The reset can be undone until something new is recorded.
                    </p>
                    {scoreMode === 'students' ? (
                      <Textarea
                        aria-label="Reason for the reset"
                        className="mt-2 min-h-14"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. Marks were entered for the wrong event"
                      />
                    ) : null}
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
          ) : null}

          {/* Undo banner — the event sits on a reset that can still
              be walked back. Lives above the trail so it is the
              first thing an admin sees on a wrongly-reset event. */}
          {isAdmin && undoableReset ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-sky-600/30 bg-sky-500/5 p-3">
              <Undo2 className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                The last reset can be undone — the recorded result
                {undoableReset.undoRestoresMarks ? ' and the whole mark sheet' : ''} come back exactly as they were.
              </p>
              <Button size="sm" className="shrink-0 gap-1.5" onClick={() => void doUndo()} disabled={undoBusy}>
                {undoBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Undo2 className="h-4 w-4" aria-hidden />
                )}
                Undo reset
              </Button>
            </div>
          ) : null}

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

      {/* Remove slot confirm — the cascade is the whole point of
          the warning: a recorded result (and any student marks) go
          with the slot, and the standings recompute immediately. */}
      <AlertDialog open={deleteOpen} onOpenChange={(o) => !busy && setDeleteOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this event slot?</AlertDialogTitle>
            <AlertDialogDescription>
              {event.result || hasMarks
                ? `It holds a recorded result${hasMarks ? ' and student marks' : ''} — removing it deletes them, and the standings and progress recompute immediately.`
                : 'It has no recorded result. It will disappear from the matrix.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep event</AlertDialogCancel>
            <AlertDialogAction
              className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void doDelete()
              }}
            >
              {busy === 'delete' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="h-4 w-4" aria-hidden />
              )}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
