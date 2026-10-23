'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  ChevronRight,
  Copy,
  Ellipsis,
  LayoutTemplate,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { WizardDialog } from '@/components/tournament/wizard-dialog'
import { EmptyState, PageHeader, TournamentStatusChip } from '@/components/tournament/ui-bits'
import { useAppStore } from '@/store/app-store'
import { MATH_COMP_2026_PRESET, countPresetEvents } from '@/lib/preset'

/**
 * Tournament list — a dense, scannable utility list. No hero, no cards,
 * no filler copy. Rows carry the whole story: name, status, progress.
 */
export function HomeView() {
  const { toast } = useToast()
  const tournaments = useAppStore((s) => s.tournaments)
  const loading = useAppStore((s) => s.loadingTournaments)
  const session = useAppStore((s) => s.session)
  const isAdmin = session?.role === 'admin'
  const createFromPreset = useAppStore((s) => s.createFromPreset)
  const cloneTournament = useAppStore((s) => s.cloneTournament)
  const deleteTournament = useAppStore((s) => s.deleteTournament)
  const openTournament = useAppStore((s) => s.openTournament)

  const [newOpen, setNewOpen] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [cloneTarget, setCloneTarget] = useState<{ id: string; name: string } | null>(null)
  const [cloneName, setCloneName] = useState('')
  const [cloneBusy, setCloneBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; eventCount: number } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const launchPreset = async () => {
    setLaunching(true)
    const id = await createFromPreset(MATH_COMP_2026_PRESET.id)
    setLaunching(false)
    if (id) {
      toast({ title: 'Tournament ready' })
      setNewOpen(false)
      await openTournament(id, 'overview')
    } else {
      toast({ title: 'Could not set up the tournament', variant: 'destructive' })
    }
  }

  const doClone = async () => {
    if (!cloneTarget) return
    setCloneBusy(true)
    const id = await cloneTournament(cloneTarget.id, cloneName)
    setCloneBusy(false)
    if (id) {
      toast({ title: 'Tournament duplicated' })
      setCloneTarget(null)
    } else {
      toast({ title: 'Could not duplicate the tournament', variant: 'destructive' })
    }
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    const ok = await deleteTournament(deleteTarget.id)
    setDeleteBusy(false)
    setDeleteTarget(null)
    toast(ok ? { title: 'Tournament deleted' } : { title: 'Could not delete the tournament', variant: 'destructive' })
  }

  // Every tap opens the tournament the same way — its Overview.
  // From there the tabs lead to scoring or the projector.
  const openRow = (id: string) => void openTournament(id)

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-6 sm:px-6 lg:pt-8">
      <PageHeader
        title="Tournaments"
        actions={
          isAdmin ? (
            <Button size="sm" className="h-8 gap-1.5" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden /> New tournament
            </Button>
          ) : undefined
        }
      />

      <div className="mt-5">
        {loading && tournaments.length === 0 ? (
          <div className="divide-y rounded-lg border">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-4">
                <div className="h-9 w-9 animate-pulse rounded-md bg-muted" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-48 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                </div>
                <div className="h-3.5 w-16 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : tournaments.length === 0 ? (
          <EmptyState
            title="No tournaments yet"
            hint={
              isAdmin
                ? 'Start from the ready-made template or set up a custom one.'
                : 'Tournaments created by organizers will appear here.'
            }
            action={
              isAdmin ? (
                <Button size="sm" className="gap-1.5" onClick={() => setNewOpen(true)}>
                  <Plus className="h-4 w-4" aria-hidden /> New tournament
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y rounded-lg border bg-card shadow-xs">
            {tournaments.map((t, i) => {
              const percent = t.eventCount === 0 ? 0 : Math.round((t.completedCount / t.eventCount) * 100)
              return (
                <motion.li
                  key={t.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: Math.min(i * 0.045, 0.32),
                    duration: 0.4,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  className="group relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:gap-4"
                >
                  <button
                    type="button"
                    onClick={() => openRow(t.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left sm:gap-4"
                    aria-label={`Open ${t.name}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{t.name}</span>
                        <TournamentStatusChip status={t.status} className="shrink-0" />
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {t.organizer || '—'}
                      </span>
                    </span>
                    <span className="hidden w-32 shrink-0 sm:block">
                      <span className="flex items-center justify-between text-xs tabular-nums text-muted-foreground">
                        <span>{t.completedCount}/{t.eventCount}</span>
                        <span>{percent}%</span>
                      </span>
                      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-primary/70 transition-all"
                          style={{ width: `${percent}%` }}
                        />
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground md:block">
                      {t.centerCount} centers
                    </span>
                  </button>
                  <ChevronRight
                    className="h-4 w-4 shrink-0 text-muted-foreground/50"
                    aria-hidden
                  />
                  {isAdmin ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground opacity-100 transition-opacity hover:text-foreground sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
                          aria-label={`Actions for ${t.name}`}
                        >
                          <Ellipsis />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          onSelect={() => {
                            const base = t.name.replace(/\s*\(.*\)$/, '').replace(/\s*—\s*Copy$/, '')
                            setCloneTarget({ id: t.id, name: `${base} (Copy)` })
                            setCloneName(`${base} (Copy)`)
                          }}
                        >
                          <Copy className="mr-2 h-4 w-4" aria-hidden /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteTarget(t)}>
                          <Trash2 className="mr-2 h-4 w-4" aria-hidden /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </motion.li>
              )
            })}
          </ul>
        )}
      </div>

      {/* New tournament picker */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New tournament</DialogTitle>
            <DialogDescription>Start from a template or configure your own.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={launchPreset}
              disabled={launching}
              className="lift flex items-center gap-3 rounded-lg border p-3.5 text-left transition-colors hover:bg-muted/50 hover:border-primary/40 disabled:opacity-60"
            >
              <LayoutTemplate className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{MATH_COMP_2026_PRESET.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {MATH_COMP_2026_PRESET.divisions.length} divisions · {MATH_COMP_2026_PRESET.games.length} games ·{' '}
                  {countPresetEvents(MATH_COMP_2026_PRESET)} events · {MATH_COMP_2026_PRESET.centerCodes.length} centers
                </span>
              </span>
              {launching ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
              ) : (
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setNewOpen(false)
                setWizardOpen(true)
              }}
              className="lift flex items-center gap-3 rounded-lg border p-3.5 text-left transition-colors hover:bg-muted/50 hover:border-primary/40"
            >
              <Plus className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Custom tournament</span>
                <span className="block text-xs text-muted-foreground">
                  Your own divisions, games, events and centers
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <WizardDialog open={wizardOpen} onOpenChange={setWizardOpen} />

      {/* Duplicate dialog */}
      <Dialog open={cloneTarget !== null} onOpenChange={(open) => !open && setCloneTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicate tournament</DialogTitle>
            <DialogDescription>
              Copies the structure and centers. Results start fresh.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="clone-name">Name</Label>
            <Input id="clone-name" value={cloneName} onChange={(e) => setCloneName(e.target.value)} placeholder="Math Competition 2027" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloneTarget(null)}>Cancel</Button>
            <Button onClick={doClone} disabled={cloneBusy || !cloneName.trim()}>
              {cloneBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Copy className="mr-2 h-4 w-4" aria-hidden />}
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the tournament with its {deleteTarget?.eventCount ?? 0} event slots,
              all results and the history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void doDelete()
              }}
            >
              {deleteBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="mr-2 h-4 w-4" aria-hidden />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
