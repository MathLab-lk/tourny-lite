'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Loader2, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
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
import { studentShortId } from '@/lib/student-math'
import { cn } from '@/lib/utils'
import type { StudentStandingRow } from '@/lib/types'

const NO_CENTER = '__none__'

/**
 * Students — the on-the-go roster and the student ranking, side by
 * side in one table (the Centers pattern). Students are identified
 * by name in the field; the internal id only surfaces as a short
 * suffix when two students share a name, so they can never be
 * confused. Marks are entered per event from the Scoring console.
 */
export function StudentsView() {
  const { toast } = useToast()
  const detail = useAppStore((s) => s.detail)
  const loading = useAppStore((s) => s.loadingDetail)
  const session = useAppStore((s) => s.session)
  const isAdmin = session?.role === 'admin'
  const addStudents = useAppStore((s) => s.addStudents)
  const updateStudent = useAppStore((s) => s.updateStudent)
  const removeStudent = useAppStore((s) => s.removeStudent)

  const [ newName, setNewName ] = useState('')
  const [ newCenterId, setNewCenterId ] = useState<string>(NO_CENTER)
  const [ adding, setAdding ] = useState(false)

  const [ editTarget, setEditTarget ] = useState<StudentStandingRow | null>(null)
  const [ editName, setEditName ] = useState('')
  const [ editCenterId, setEditCenterId ] = useState<string>(NO_CENTER)
  const [ saving, setSaving ] = useState(false)

  const [ removeTarget, setRemoveTarget ] = useState<StudentStandingRow | null>(null)
  const [ removing, setRemoving ] = useState(false)

  // Names that exist more than once — their rows carry the short
  // internal id so scorekeepers can tell the two apart.
  const duplicateNames = useMemo(() => {
    if (!detail) return new Set<string>()
    const seen = new Map<string, number>()
    for (const s of detail.students) seen.set(s.name, (seen.get(s.name) ?? 0) + 1)
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([name]) => name))
  }, [detail])

  if (loading && !detail) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 pt-6 sm:px-6">
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
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

  const { centers, students, studentStandings } = detail
  const unassigned = students.filter((s) => !s.centerId)
  const scoredStudents = studentStandings.filter((s) => s.events > 0)

  const doAdd = async () => {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    const out = await addStudents([{ name, centerId: newCenterId === NO_CENTER ? null : newCenterId }])
    setAdding(false)
    if (out.ok) {
      setNewName('')
      toast({ title: 'Student added', description: name })
    } else {
      toast({ title: 'Could not add the student', description: out.error, variant: 'destructive' })
    }
  }

  const openEdit = (row: StudentStandingRow) => {
    setEditTarget(row)
    setEditName(row.name)
    setEditCenterId(row.centerId ?? NO_CENTER)
  }

  const doSaveEdit = async () => {
    if (!editTarget || !editName.trim()) return
    setSaving(true)
    const out = await updateStudent(editTarget.studentId, {
      name: editName.trim(),
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
      className="mx-auto w-full max-w-4xl px-4 pt-6 sm:px-6"
    >
      <PageHeader
        title="Students"
        meta={`${students.length} registered · ${scoredStudents.length} scored · ranking updates live`}
      />

      {/* Add student (any signed-in staff — the roster is built in the field) */}
      {session ? (
        <div className="mt-5 flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Student name"
              aria-label="Student name"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void doAdd()
              }}
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Two students can share a name — the system tells them apart internally
            </p>
          </div>
          <Select value={newCenterId} onValueChange={setNewCenterId}>
            <SelectTrigger className="w-full sm:w-52" aria-label="Center">
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
          <Button
            className="h-9 shrink-0 gap-1.5"
            onClick={() => void doAdd()}
            disabled={adding || !newName.trim()}
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Add
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
              : `${unassigned.length} students are not assigned`}${' '}
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
                ? 'Add the first student above — centers can be assigned later as the lists arrive.'
                : 'Sign in to add students. The roster is built as mark sheets arrive from the field.'
            }
            className="border-0"
          />
        ) : (
          <div className="max-h-[560px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-14 text-center">Rank</TableHead>
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
                        <span className="text-sm font-medium">{row.name}</span>
                        {duplicateNames.has(row.name) ? (
                          <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                            {studentShortId(row.studentId)}
                          </span>
                        ) : null}
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
        Student marks are entered per event from the Scoring console (event → <span className="font-medium">Student marks</span>).
        Each center&rsquo;s event entry is the sum of its students&rsquo; marks; centers are then placed against each other and
        earn the fixed place points. Ties on totals break by events, then best single mark.
      </p>

      {/* Edit student dialog */}
      <Dialog open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit student</DialogTitle>
            <DialogDescription>
              {editTarget && editTarget.events > 0
                ? `This student has marks in ${editTarget.events} event${editTarget.events === 1 ? '' : 's'} — moving their center re-derives those events' podiums automatically.`
                : 'Rename the student or assign them to a center.'}
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
              {removeTarget && duplicateNames.has(removeTarget.name)
                ? ` (${studentShortId(removeTarget.studentId)})`
                : ''}
              ?
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
