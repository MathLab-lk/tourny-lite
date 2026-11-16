'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BadgeCheck,
  Check,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Sparkles,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { AnimatedNumber, EmptyState, PageHeader, easeOutExpo, medalText } from '@/components/tournament/ui-bits'
import { useAppStore } from '@/store/app-store'
import { nextIndexInScope, renderStudentCode, studentShortId } from '@/lib/student-math'
import { cn } from '@/lib/utils'
import type { StudentStandingRow } from '@/lib/types'

const NO_CENTER = '__none__'

/**
 * Students — the registration stage and the student ranking, side by
 * side in one table (the Centers pattern). Every registration issues
 * a unique student ID composed from the tournament's ID pattern
 * (Settings → Student IDs, e.g. {center}-{grade}-{index} →
 * "402-8-07"): name + center + grade go in, the field reference
 * comes out. Marks are entered per event from the Overview matrix —
 * students are picked by their issued ID, so two students who share
 * a name can never be confused.
 */
export function StudentsView() {
  const { toast } = useToast()
  const detail = useAppStore((s) => s.detail)
  const loading = useAppStore((s) => s.loadingDetail)
  const session = useAppStore((s) => s.session)
  const isAdmin = session?.role === 'admin'
  const registerStudents = useAppStore((s) => s.registerStudents)
  const backfillStudentCodes = useAppStore((s) => s.backfillStudentCodes)
  const updateStudent = useAppStore((s) => s.updateStudent)
  const removeStudent = useAppStore((s) => s.removeStudent)
  const printSheet = useAppStore((s) => s.printSheet)

  const [newName, setNewName] = useState('')
  const [newCenterId, setNewCenterId] = useState<string>(NO_CENTER)
  const [newGrade, setNewGrade] = useState('')
  const [adding, setAdding] = useState(false)
  const [backfilling, setBackfilling] = useState(false)

  const [editTarget, setEditTarget] = useState<StudentStandingRow | null>(null)
  const [editName, setEditName] = useState('')
  const [editGrade, setEditGrade] = useState('')
  const [editCenterId, setEditCenterId] = useState<string>(NO_CENTER)
  const [saving, setSaving] = useState(false)

  const [removeTarget, setRemoveTarget] = useState<StudentStandingRow | null>(null)
  const [removing, setRemoving] = useState(false)

  const pattern = detail?.tournament.studentIdPattern ?? '{center}-{grade}-{index}'
  const needsCenter = pattern.includes('{center}')
  const needsGrade = pattern.includes('{grade}')

  // Live preview of the NEXT ID the current form inputs will issue.
  // The server is the source of truth (it re-checks against the
  // freshest roster and bumps on collisions); this is a close
  // estimate against the loaded roster.
  const previewCode = useMemo(() => {
    if (!detail) return null
    const roster = detail.students.map((s) => ({
      studentCode: s.studentCode,
      centerId: s.centerId,
      grade: s.grade,
    }))
    const centerId = newCenterId === NO_CENTER ? null : newCenterId
    const centerCode =
      centerId != null ? detail.centers.find((c) => c.id === centerId)?.centerCode ?? null : null
    const index = nextIndexInScope(pattern, roster, { centerId, grade: newGrade.trim() })
    return renderStudentCode(pattern, {
      name: newName.trim() || 'New Student',
      centerCode,
      grade: newGrade.trim(),
      index,
    })
  }, [detail, pattern, newCenterId, newGrade, newName])

  if (loading && !detail) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6">
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-6 h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 pt-10 sm:px-6">
        <EmptyState title="No tournament selected" hint="Choose a tournament to get started." />
      </div>
    )
  }

  const { centers, students, studentStandings } = detail
  const unassigned = students.filter((s) => !s.centerId)
  const uncoded = students.filter((s) => !s.studentCode)
  const scoredStudents = studentStandings.filter((s) => s.events > 0)

  const missingCenterForRegistration = needsCenter && newCenterId === NO_CENTER
  const missingGradeForRegistration = needsGrade && !newGrade.trim()

  const doRegister = async () => {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    const out = await registerStudents([
      {
        name,
        centerId: newCenterId === NO_CENTER ? null : newCenterId,
        grade: newGrade.trim(),
      },
    ])
    setAdding(false)
    if (out.ok) {
      setNewName('')
      const issued = out.students?.map((s) => s.studentCode).filter(Boolean) ?? []
      toast({
        title: 'Student registered',
        description: issued.length > 0 ? `Issued ID: ${issued.join(', ')}` : name,
      })
    } else {
      toast({ title: 'Could not register the student', description: out.error, variant: 'destructive' })
    }
  }

  const doBackfill = async () => {
    setBackfilling(true)
    const out = await backfillStudentCodes()
    setBackfilling(false)
    if (out.ok) {
      toast({
        title:
          out.issued && out.issued > 0
            ? `Issued ${out.issued} missing ID${out.issued === 1 ? '' : 's'}`
            : 'No missing IDs to generate',
        description:
          out.issued && out.issued > 0
            ? 'Students whose details don\'t satisfy the ID pattern stayed uncoded — assign their center or grade first.'
            : undefined,
      })
    } else {
      toast({ title: 'Could not generate the missing IDs', description: out.error, variant: 'destructive' })
    }
  }

  const openEdit = (row: StudentStandingRow) => {
    setEditTarget(row)
    setEditName(row.name)
    setEditGrade(row.grade ?? '')
    setEditCenterId(row.centerId ?? NO_CENTER)
  }

  const doSaveEdit = async () => {
    if (!editTarget || !editName.trim()) return
    setSaving(true)
    const out = await updateStudent(editTarget.studentId, {
      name: editName.trim(),
      grade: editGrade.trim(),
      centerId: editCenterId === NO_CENTER ? null : editCenterId,
    })
    setSaving(false)
    if (out.ok) {
      setEditTarget(null)
      toast({ title: 'Student updated', description: 'Affected results were re-derived where needed.' })
    } else {
      toast({ title: 'Could not update the student', description: out.error, variant: 'destructive' })
    }
  }

  const doRemove = async () => {
    if (!removeTarget) return
    setRemoving(true)
    const out = await removeStudent(removeTarget.studentId)
    setRemoving(false)
    setRemoveTarget(null)
    toast(
      out.ok
        ? { title: 'Student removed', description: 'Marks were cleared and affected events re-derived.' }
        : { title: 'Could not remove the student', description: out.error, variant: 'destructive' }
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.26, ease: easeOutExpo }}
      className="mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6"
    >
      <PageHeader
        title="Students"
        meta={`${students.length} registered · ${scoredStudents.length} scored · ranking updates live`}
        actions={
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={() => printSheet('students')}
            title="Print the student ranking sheet (A4)"
          >
            <Printer className="h-4 w-4" aria-hidden /> Print
          </Button>
        }
      />

      {/* Registration stage — name + center + grade in, issued ID out.
          Any signed-in staff can register; the form previews the next
          ID live so the operator can read it back to the student. */}
      {session ? (
        <div className="mt-5 space-y-3 rounded-lg border bg-card p-3.5">
          <div className="grid gap-2.5 sm:grid-cols-12">
            <div className="sm:col-span-4">
              <Label htmlFor="reg-name" className="text-xs text-muted-foreground">
                Name
              </Label>
              <Input
                id="reg-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Kasun Perera"
                autoComplete="off"
                className="mt-1.5"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !missingCenterForRegistration && !missingGradeForRegistration) {
                    void doRegister()
                  }
                }}
              />
            </div>
            <div className="sm:col-span-4">
              <Label className="text-xs text-muted-foreground">
                Center{needsCenter ? ' (required by ID pattern)' : ''}
              </Label>
              <Select value={newCenterId} onValueChange={setNewCenterId}>
                <SelectTrigger className="mt-1.5 w-full" aria-label="Center">
                  <SelectValue placeholder="Center" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CENTER}>No center yet</SelectItem>
                  {centers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.centerCode}
                      {c.centerName ? ` — ${c.centerName}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="reg-grade" className="text-xs text-muted-foreground">
                Grade{needsGrade ? ' *' : ''}
              </Label>
              <Input
                id="reg-grade"
                value={newGrade}
                onChange={(e) => setNewGrade(e.target.value)}
                placeholder={needsGrade ? 'e.g. 8' : '—'}
                autoComplete="off"
                className="mt-1.5"
                inputMode="numeric"
              />
            </div>
            <div className="flex items-end sm:col-span-2">
              <Button
                className="h-9 w-full gap-1.5"
                onClick={() => void doRegister()}
                disabled={adding || !newName.trim() || missingCenterForRegistration || missingGradeForRegistration}
              >
                {adding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                Register
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Next ID: <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs tabular-nums">{previewCode}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              pattern <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{pattern}</code>
              {isAdmin ? ' — customize in Settings' : ''}
            </span>
          </div>
          {missingCenterForRegistration ? (
            <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
              The ID pattern includes {'{center}'} — pick a center before registering.
            </p>
          ) : null}
          {missingGradeForRegistration ? (
            <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
              The ID pattern includes {'{grade}'} — enter the student&rsquo;s grade before registering.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Legacy students registered before IDs existed — one click
          issues their codes from the current pattern. */}
      {isAdmin && uncoded.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-sky-600/30 bg-sky-500/5 px-3.5 py-2.5 text-[13px]">
          <BadgeCheck className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
          <p className="min-w-0 flex-1 text-muted-foreground">
            {uncoded.length === 1
              ? 'One student was registered before IDs were introduced and has no code yet.'
              : `${uncoded.length} students were registered before IDs were introduced and have no code yet.`}{' '}
            Generate their IDs from the current pattern ({pattern}).
          </p>
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 gap-1.5"
            onClick={() => void doBackfill()}
            disabled={backfilling}
          >
            {backfilling ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <BadgeCheck className="h-3.5 w-3.5" aria-hidden />}
            Generate missing IDs
          </Button>
        </div>
      ) : null}

      {/* Unassigned warning — their marks count for the student
          ranking but for no center sum until a center is set. */}
      {unassigned.length > 0 ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-600/40 bg-amber-500/10 px-3.5 py-2.5 text-[13px] text-amber-800 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            {unassigned.length === 1
              ? `${unassigned[0].name} is not assigned`
              : `${unassigned.length} students are not assigned`}{' '}
            to a center — their marks count toward the student ranking but toward no center&rsquo;s event places.
            {isAdmin ? ' Assign them below.' : ' An administrator can assign them.'}
          </p>
        </div>
      ) : null}

      {/* Ranking + roster table */}
      <div className="mt-5 overflow-hidden rounded-lg border bg-card">
        {students.length === 0 ? (
          <EmptyState
            title="No students yet"
            hint={
              session
                ? 'Register the first student above — name and center are all it takes.'
                : 'Sign in to register students. Their IDs are issued on registration.'
            }
            className="border-0"
          />
        ) : (
          <div className="max-h-[560px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-14 text-center">Rank</TableHead>
                  <TableHead className="w-32">Student ID</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Center</TableHead>
                  <TableHead className="text-center">Events</TableHead>
                  <TableHead className="text-center">Best</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  {isAdmin ? <TableHead className="w-10" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence initial={false}>
                  {studentStandings.map((row) => (
                    <motion.tr
                      key={row.studentId}
                      layout="position"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{
                        duration: 0.3,
                        ease: easeOutExpo,
                        layout: { type: 'spring', stiffness: 320, damping: 34 },
                      }}
                      className="hover:bg-muted/50 border-b transition-colors last:border-0"
                    >
                      <TableCell
                        className={cn(
                          'text-center text-sm font-bold tabular-nums',
                          row.rank === 1 && medalText.gold,
                          row.rank === 2 && medalText.silver,
                          row.rank === 3 && medalText.bronze
                        )}
                      >
                        {row.rank}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs font-semibold tabular-nums">
                          {row.studentCode ?? (
                            <span className="font-sans font-normal text-muted-foreground">
                              {studentShortId(row.studentId)}
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">{row.name}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold tabular-nums text-muted-foreground">
                          {row.centerCode ?? <span className="font-normal text-amber-600 dark:text-amber-400">unassigned</span>}
                        </span>
                      </TableCell>
                      <TableCell className="text-center tabular-nums text-muted-foreground">
                        <AnimatedNumber value={row.events} />
                      </TableCell>
                      <TableCell className="text-center tabular-nums text-muted-foreground">
                        {row.events > 0 ? <AnimatedNumber value={row.best} /> : '—'}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {row.events > 0 ? <AnimatedNumber value={row.total} /> : '—'}
                      </TableCell>
                      {isAdmin ? (
                        <TableCell>
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => openEdit(row)}
                              aria-label={`Edit student ${row.name}`}
                            >
                              <Pencil className="h-4 w-4" aria-hidden />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => setRemoveTarget(row)}
                              aria-label={`Remove student ${row.name}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Student IDs are issued once at registration from the pattern in Settings and never change — use them to
        reference students anywhere. Student marks are entered per event from the Overview matrix (event →{' '}
        <span className="font-medium">Student marks</span>). Each center&rsquo;s event entry is the sum of its
        students&rsquo; marks; centers are then placed against each other and earn the fixed place points. Ties on
        totals break by events, then best single mark.
      </p>

      {/* Edit student dialog */}
      <Dialog open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit student</DialogTitle>
            <DialogDescription>
              {editTarget?.studentCode
                ? `ID ${editTarget.studentCode} stays with this student — IDs never change.`
                : 'This student predates issued IDs — saving issues their ID from the current pattern.'}
              {editTarget && editTarget.events > 0
                ? ` They hold marks in ${editTarget.events} event${editTarget.events === 1 ? '' : 's'} — moving their center re-derives those events' podiums automatically.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="student-name">Name</Label>
              <Input
                id="student-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="e.g. Kasun Perera"
                autoComplete="off"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="student-grade">Grade</Label>
                <Input
                  id="student-grade"
                  value={editGrade}
                  onChange={(e) => setEditGrade(e.target.value)}
                  placeholder="e.g. 8"
                  autoComplete="off"
                  inputMode="numeric"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="student-center">Center</Label>
                <Select value={editCenterId} onValueChange={setEditCenterId}>
                  <SelectTrigger id="student-center" className="w-full">
                    <SelectValue placeholder="Assign a center" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CENTER}>No center yet</SelectItem>
                    {centers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.centerCode}
                        {c.centerName ? ` — ${c.centerName}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void doSaveEdit()} disabled={saving || !editName.trim()}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Check className="mr-2 h-4 w-4" aria-hidden />
              )}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove student confirm */}
      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removeTarget?.name}
              {removeTarget?.studentCode ? ` (${removeTarget.studentCode})` : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget && removeTarget.events > 0
                ? `This student holds marks in ${removeTarget.events} event${removeTarget.events === 1 ? '' : 's'} worth ${removeTarget.total} in total. Removing them deletes those marks and re-derives the affected events' center podiums.`
                : 'This student has no recorded marks. They will be removed from the roster.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep student</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void doRemove()
              }}
            >
              {removing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="mr-2 h-4 w-4" aria-hidden />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}
