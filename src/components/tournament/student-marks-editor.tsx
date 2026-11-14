'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Calculator,
  Loader2,
  Lock,
  Plus,
  Send,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { EmptyState, easeOutExpo, medalText, springPop } from '@/components/tournament/ui-bits'
import { useAppStore } from '@/store/app-store'
import { computeCenterSums, studentShortId } from '@/lib/student-math'
import { cn } from '@/lib/utils'
import type { CenterDTO, EventDTO, StudentDTO } from '@/lib/types'

/**
 * Student mark sheet — the field console for events scored by
 * individual student marks. One collapsible-free list: a section per
 * center, a row per student (pick the student, type their custom
 * marks), as many rows per center as the event needs — the student
 * count per center varies by event.
 *
 * While you type, the derived center podium updates live: each
 * center's entry is the sum of its students' marks, ranked against
 * the other centers, paying the fixed place points.
 */

interface Row {
  key: string
  studentId: string
  marks: string
}

let rowSeq = 0
const nextRowKey = () => `row-${++rowSeq}`

export function StudentMarksEditor({
  event,
  onDone,
}: {
  event: EventDTO
  onDone: () => void
}) {
  const { toast } = useToast()
  const detail = useAppStore((s) => s.detail)
  const session = useAppStore((s) => s.session)
  const submitStudentScores = useAppStore((s) => s.submitStudentScores)
  const addStudents = useAppStore((s) => s.addStudents)

  const centers = detail?.centers ?? []
  const students = detail?.students ?? []
  const allScores = detail?.studentScores ?? []

  // Existing sheet for this event → rows grouped per center. The
  // component is remounted per event (key), so init-once is enough.
  const [rowsByCenter, setRowsByCenter] = useState<Record<string, Row[]>>(() => {
    const initial: Record<string, Row[]> = {}
    for (const c of centers) initial[c.id] = []
    const scoresForEvent = allScores.filter((s) => s.eventId === event.id)
    const studentById = new Map(students.map((s) => [s.id, s]))
    for (const sc of scoresForEvent) {
      const student = studentById.get(sc.studentId)
      if (!student) continue
      const bucket = student.centerId ?? 'unassigned'
      initial[bucket] = initial[bucket] ?? []
      initial[bucket].push({ key: nextRowKey(), studentId: student.id, marks: String(sc.marks) })
    }
    return initial
  })

  const [newStudentFor, setNewStudentFor] = useState<string | null>(null)
  const [newStudentName, setNewStudentName] = useState('')
  const [addingStudent, setAddingStudent] = useState(false)
  const [notes, setNotes] = useState(event.result?.notes ?? '')
  const [reason, setReason] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const isCorrection =
    Boolean(event.result) || allScores.some((s) => s.eventId === event.id)

  const studentsOf = (centerId: string) =>
    students.filter((s) => (centerId === 'unassigned' ? !s.centerId : s.centerId === centerId))

  const duplicateNames = useMemo(() => {
    const seen = new Map<string, number>()
    for (const s of students) seen.set(s.name, (seen.get(s.name) ?? 0) + 1)
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([name]) => name))
  }, [students])

  const studentLabel = (s: StudentDTO) =>
    duplicateNames.has(s.name) ? `${s.name} ${studentShortId(s.id)}` : s.name

  const setRows = (bucket: string, rows: Row[]) =>
    setRowsByCenter((prev) => ({ ...prev, [bucket]: rows }))

  const addRow = (bucket: string) => {
    setRows(bucket, [...(rowsByCenter[bucket] ?? []), { key: nextRowKey(), studentId: '', marks: '' }])
  }

  const removeRow = (bucket: string, key: string) =>
    setRows(bucket, (rowsByCenter[bucket] ?? []).filter((r) => r.key !== key))

  const patchRow = (bucket: string, key: string, patch: Partial<Row>) =>
    setRows(
      bucket,
      (rowsByCenter[bucket] ?? []).map((r) => (r.key === key ? { ...r, ...patch } : r))
    )

  /** Complete rows: a student and a valid non-negative number. */
  const validRows = useMemo(() => {
    const out: { bucket: string; studentId: string; marks: number }[] = []
    for (const [bucket, rows] of Object.entries(rowsByCenter)) {
      for (const r of rows) {
        if (!r.studentId) continue
        const marks = Number(r.marks)
        if (!Number.isFinite(marks) || marks < 0 || String(r.marks).trim() === '') continue
        out.push({ bucket, studentId: r.studentId, marks })
      }
    }
    return out
  }, [rowsByCenter])

  /** Rows that name a student but carry unusable marks — must be
   *  fixed (or cleared) before the sheet can be submitted. */
  const brokenRowCount = useMemo(() => {
    let broken = 0
    for (const rows of Object.values(rowsByCenter)) {
      for (const r of rows) {
        if (!r.studentId) continue
        const marks = Number(r.marks)
        if (!Number.isFinite(marks) || marks < 0 || String(r.marks).trim() === '') broken++
      }
    }
    return broken
  }, [rowsByCenter])

  const usedStudentIds = useMemo(
    () => new Set(validRows.map((r) => r.studentId)),
    [validRows]
  )

  // Live preview of what the sheet implies: center sums → podium.
  const centerSums = useMemo(
    () =>
      computeCenterSums(
        validRows.map((r) => ({ studentId: r.studentId, marks: r.marks })),
        students.map((s) => ({ id: s.id, centerId: s.centerId })),
        centers
      ),
    [validRows, students, centers]
  )
  const podiumPreview = centerSums.filter((c) => c.place > 0)

  const canSubmit = session !== null && validRows.length > 0 && brokenRowCount === 0

  const quickAddStudent = async (bucket: string) => {
    const name = newStudentName.trim()
    if (!name) return
    setAddingStudent(true)
    const centerId = bucket === 'unassigned' ? null : bucket
    const out = await addStudents([{ name, centerId }])
    setAddingStudent(false)
    if (!out.ok) {
      toast({ title: 'Could not add the student', description: out.error, variant: 'destructive' })
      return
    }
    // The store refreshed the detail; find the freshly created row.
    const fresh = useAppStore.getState().detail?.students ?? []
    const match = fresh
      .filter((s) => s.name === name && (s.centerId ?? null) === centerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    setNewStudentName('')
    setNewStudentFor(null)
    if (match) {
      setRows(bucket, [...(rowsByCenter[bucket] ?? []), { key: nextRowKey(), studentId: match.id, marks: '' }])
    }
  }

  const doSubmit = async () => {
    setSubmitting(true)
    const out = await submitStudentScores({
      eventId: event.id,
      scores: validRows.map((r) => ({ studentId: r.studentId, marks: r.marks })),
      recordedBy: session?.name ?? '',
      notes,
      reason: reason.trim() || 'Re-entered from the scoring console',
    })
    setSubmitting(false)
    setConfirmOpen(false)
    if (out.ok && out.queued) {
      toast({
        title: 'Saved on this device',
        description: 'It will sync automatically once the connection is restored.',
      })
      onDone()
    } else if (out.ok) {
      toast({ title: isCorrection ? 'Mark sheet corrected' : 'Mark sheet recorded', description: event.label })
      onDone()
    } else {
      toast({ title: 'Could not save the mark sheet', description: out.error, variant: 'destructive' })
    }
  }

  if (centers.length === 0) {
    return (
      <EmptyState
        title="No centers yet"
        hint="Student marks group by center — add centers from the Centers page first."
      />
    )
  }

  if (!session) {
    return (
      <div className="rounded-lg border border-dashed p-5 text-center">
        <Lock className="mx-auto h-5 w-5 text-muted-foreground/60" aria-hidden />
        <p className="mt-2 text-sm font-medium">Sign in to record student marks</p>
      </div>
    )
  }

  const confirmText =
    podiumPreview.length > 0
      ? podiumPreview
          .map((c, i) => `${['1st', '2nd', '3rd'][i]} ${c.centerCode} (${c.sum})`)
          .join(', ')
      : 'No center has assigned students yet — only the student ranking will change.'

  const renderBucket = (bucket: string, label: React.ReactNode) => {
    const rows = rowsByCenter[bucket] ?? []
    const bucketStudents = studentsOf(bucket)
    const sum = validRows
      .filter((r) => r.bucket === bucket)
      .reduce((acc, r) => acc + r.marks, 0)
    return (
      <div key={bucket} className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2">
          {label}
          <div className="flex items-center gap-2">
            {validRows.some((r) => r.bucket === bucket) ? (
              <motion.span
                key={sum}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={springPop}
                className="text-xs font-semibold tabular-nums text-primary"
              >
                Σ {Math.round(sum * 100) / 100}
              </motion.span>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => setNewStudentFor(newStudentFor === bucket ? null : bucket)}
              disabled={addingStudent}
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden /> New student
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => addRow(bucket)}
              disabled={bucketStudents.length === 0 && newStudentFor !== bucket}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden /> Row
            </Button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {newStudentFor === bucket ? (
            <motion.div
              key={`new-${bucket}`}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.24, ease: easeOutExpo }}
              className="overflow-hidden border-b bg-primary/[0.04]"
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <Input
                  autoFocus
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  placeholder="New student's name"
                  className="h-8"
                  disabled={addingStudent}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void quickAddStudent(bucket)
                    }
                  }}
                />
                <Button
                  size="sm"
                  className="h-8 shrink-0 gap-1"
                  onClick={() => void quickAddStudent(bucket)}
                  disabled={addingStudent || !newStudentName.trim()}
                >
                  {addingStudent ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
                  Add
                </Button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {rows.length === 0 && newStudentFor !== bucket ? (
          <p className="px-3 py-2.5 text-xs text-muted-foreground">
            No students entered for this center — use Row if its students are registered, or New student to register one now.
          </p>
        ) : (
          <ul className="divide-y">
            <AnimatePresence initial={false}>
              {rows.map((row) => {
                const selected = bucketStudents.find((s) => s.id === row.studentId)
                const marksValue = row.marks
                const marksInvalid =
                  row.studentId !== '' &&
                  (String(marksValue).trim() === '' || !Number.isFinite(Number(marksValue)) || Number(marksValue) < 0)
                return (
                  <motion.li
                    key={row.key}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: easeOutExpo }}
                    className="flex items-center gap-2 px-3 py-2"
                  >
                    <Select
                      value={row.studentId || undefined}
                      onValueChange={(v) => patchRow(bucket, row.key, { studentId: v })}
                    >
                      <SelectTrigger size="sm" className="min-w-0 flex-1" aria-label="Student">
                        <SelectValue placeholder="Pick student" />
                      </SelectTrigger>
                      <SelectContent>
                        {bucketStudents.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-muted-foreground">
                            No students registered for this center yet
                          </div>
                        ) : null}
                        {bucketStudents.map((s) => (
                          <SelectItem key={s.id} value={s.id} disabled={usedStudentIds.has(s.id) && s.id !== row.studentId}>
                            {studentLabel(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      inputMode="decimal"
                      value={marksValue}
                      onChange={(e) => patchRow(bucket, row.key, { marks: e.target.value })}
                      placeholder="Marks"
                      aria-label={`Marks for ${selected?.name ?? 'student'}`}
                      className={cn(
                        'h-8 w-24 shrink-0 tabular-nums',
                        marksInvalid && 'border-destructive focus-visible:ring-destructive/30'
                      )}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(bucket, row.key)}
                      aria-label="Remove row"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </Button>
                  </motion.li>
                )
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 text-sm font-semibold">{event.label}</span>
        </div>
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
          Student marks
        </span>
      </div>

      {isCorrection ? (
        <p className="rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
          A mark sheet is already recorded — saving again corrects it, re-derives the center podium and adds a history entry.
        </p>
      ) : null}

      <div className="space-y-3">
        {centers.map((c: CenterDTO) =>
          renderBucket(
            c.id,
            <span className="min-w-0 text-[13px] font-semibold">
              <span className="tabular-nums">{c.centerCode}</span>
              {c.centerName ? <span className="font-normal text-muted-foreground"> — {c.centerName}</span> : null}
            </span>
          )
        )}
        {/* Students not yet assigned to any center may still be scored —
            their marks count for the student ranking only. */}
        {students.some((s) => !s.centerId) ? (
          renderBucket(
            'unassigned',
            <span className="min-w-0 text-[13px] font-semibold text-amber-700 dark:text-amber-400">
              No center assigned
              <span className="block text-[11px] font-normal text-muted-foreground">
                Marks count for the student ranking only
              </span>
            </span>
          )
        ) : null}
      </div>

      {/* Live derived podium */}
      {centerSums.length > 0 ? (
        <div className="rounded-lg border bg-muted/30 px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Calculator className="h-3.5 w-3.5" aria-hidden />
            Derived center podium — sums of each center&rsquo;s student marks
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-semibold tabular-nums">
            {podiumPreview.map((c, i) => (
              <span key={c.centerId} className={cn(i === 0 && medalText.gold, i === 1 && medalText.silver, i === 2 && medalText.bronze)}>
                {['1st', '2nd', '3rd'][i]} · {c.centerCode} <span className="font-normal text-muted-foreground">({c.sum})</span>
              </span>
            ))}
            {centerSums.length > 3 ? (
              <span className="font-normal text-muted-foreground">
                +{centerSums.length - 3} off the podium
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Centers earn the fixed place points ({detail?.tournament.pointsFirst}/{detail?.tournament.pointsSecond}/{detail?.tournament.pointsThird});
            ties on sums break by center code.
          </p>
        </div>
      ) : null}

      {brokenRowCount > 0 ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
          {brokenRowCount} row{brokenRowCount === 1 ? '' : 's'} name a student but the marks are missing or invalid — fix or clear {brokenRowCount === 1 ? 'it' : 'them'} to submit.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="student-sheet-notes" className="text-xs text-muted-foreground">Notes (optional)</Label>
        <Textarea
          id="student-sheet-notes"
          className="min-h-14"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Mark sheet #3, two students per center…"
        />
      </div>

      {isCorrection ? (
        <div className="space-y-1.5">
          <Label htmlFor="student-sheet-reason" className="text-xs text-muted-foreground">Justification (required for corrections)</Label>
          <Textarea
            id="student-sheet-reason"
            className={cn('min-h-14', !reason.trim() && 'border-amber-600/50')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Transcription error on the mark sheet"
          />
        </div>
      ) : null}

      <Button
        size="lg"
        className="h-12 w-full gap-2 text-[15px] font-semibold"
        disabled={!canSubmit}
        onClick={() => setConfirmOpen(true)}
      >
        <Send className="h-4 w-4" aria-hidden />
        {isCorrection ? 'Correct mark sheet' : 'Record mark sheet'}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm mark sheet</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <span className="block">
                  {validRows.length} student mark{validRows.length === 1 ? '' : 's'} across{' '}
                  {new Set(validRows.map((r) => r.bucket)).size} center
                  {new Set(validRows.map((r) => r.bucket)).size === 1 ? '' : 's'}. Derived podium:
                </span>
                <span className="block rounded-md bg-muted px-3 py-2 text-sm font-semibold">{confirmText}</span>
                {isCorrection ? (
                  <span className="block text-amber-700 dark:text-amber-400">
                    This replaces the existing mark sheet and is recorded in the history.
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
