'use client'

import { useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  LayoutGrid,
  Loader2,
  Lock,
  Plus,
  Trophy,
  Trash2,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
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
import { useAppStore } from '@/store/app-store'
import { MATH_COMP_2026_PRESET, countPresetEvents } from '@/lib/preset'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<string, string> = {
  active: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  completed: 'border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  draft: 'border-border bg-muted text-muted-foreground',
  archived: 'border-border bg-muted text-muted-foreground',
}

export function HomeView() {
  const { toast } = useToast()
  const tournaments = useAppStore((s) => s.tournaments)
  const loading = useAppStore((s) => s.loadingTournaments)
  const session = useAppStore((s) => s.session)
  const isAdmin = session?.role === 'admin'
  const setAuthDialogOpen = useAppStore((s) => s.setAuthDialogOpen)
  const createFromPreset = useAppStore((s) => s.createFromPreset)
  const cloneTournament = useAppStore((s) => s.cloneTournament)
  const deleteTournament = useAppStore((s) => s.deleteTournament)
  const openTournament = useAppStore((s) => s.openTournament)

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
      toast({
        title: 'Tournament ready',
        description: `${MATH_COMP_2026_PRESET.name} has been set up with ${countPresetEvents(MATH_COMP_2026_PRESET)} event slots.`,
      })
      await openTournament(id, 'me')
    } else {
      toast({
        title: 'Could not set up the tournament',
        description: 'Please try again in a moment.',
        variant: 'destructive',
      })
    }
  }

  const doClone = async () => {
    if (!cloneTarget) return
    setCloneBusy(true)
    const id = await cloneTournament(cloneTarget.id, cloneName)
    setCloneBusy(false)
    if (id) {
      toast({
        title: 'Tournament duplicated',
        description: 'The structure and center roster were copied. Results start fresh.',
      })
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
    toast(
      ok
        ? { title: 'Tournament deleted' }
        : { title: 'Could not delete the tournament', variant: 'destructive' }
    )
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      {/* Hero */}
      <div className="mb-10 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Tournament management
        </p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          Run your competition from registration to awards.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          Start from a ready-made template or configure your own scoring scheme, divisions and
          events. Results update live on the projector scoreboard, and every change is recorded in
          a complete audit trail.
        </p>
        {!session ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
            <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">
              You are browsing as a guest — tournaments and results are open to view.
              Sign in to create tournaments and record results.
            </p>
            <Button size="sm" className="shrink-0 font-semibold" onClick={() => setAuthDialogOpen(true)}>
              Sign in
            </Button>
          </div>
        ) : null}
      </div>

      {/* Setup options (administrators) */}
      {isAdmin ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Badge className="bg-primary/10 font-medium text-primary hover:bg-primary/10">
                  Ready-made template
                </Badge>
                <Badge variant="outline" className="font-mono text-muted-foreground">75 / 50 / 25 points</Badge>
              </div>
              <CardTitle className="mt-2 text-xl">{MATH_COMP_2026_PRESET.name}</CardTitle>
              <CardDescription>
                {MATH_COMP_2026_PRESET.organizer} · {MATH_COMP_2026_PRESET.summary}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <PresetStat icon={LayoutGrid} label="Divisions" value={String(MATH_COMP_2026_PRESET.divisions.length)} />
                <PresetStat icon={Trophy} label="Games" value={String(MATH_COMP_2026_PRESET.games.length)} />
                <PresetStat icon={CheckCircle2} label="Event slots" value={String(countPresetEvents(MATH_COMP_2026_PRESET))} />
                <PresetStat icon={Users} label="Centers" value={String(MATH_COMP_2026_PRESET.centerCodes.length)} />
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                Every division, game and event slot is pre-configured, including the standard
                center codes. Launch it as-is and adjust details later.
              </p>
            </CardContent>
            <CardFooter>
              <Button size="lg" className="h-11 gap-2 px-5 font-semibold" onClick={launchPreset} disabled={launching}>
                {launching ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <ArrowRight className="h-4 w-4" aria-hidden />
                )}
                {launching ? 'Setting up…' : 'Launch this tournament'}
              </Button>
            </CardFooter>
          </Card>

          <Card className="flex flex-col justify-between">
            <CardHeader>
              <CardTitle className="text-xl">Custom tournament</CardTitle>
              <CardDescription>
                Your own scoring scheme, divisions, games, event counts and center roster —
                through a guided three-step setup.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><span className="font-medium text-foreground">1.</span> Details &amp; scoring</li>
                <li className="flex gap-2"><span className="font-medium text-foreground">2.</span> Divisions &amp; games</li>
                <li className="flex gap-2"><span className="font-medium text-foreground">3.</span> Participating centers</li>
              </ol>
            </CardContent>
            <CardFooter>
              <Button size="lg" variant="outline" className="h-11 w-full gap-2 font-semibold" onClick={() => setWizardOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden /> Design a tournament
              </Button>
            </CardFooter>
          </Card>
        </div>
      ) : null}

      {/* Tournament catalog */}
      <section className={isAdmin ? 'mt-12' : undefined} aria-label="Tournaments">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Tournaments</h2>
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden /> : null}
        </div>

        {tournaments.length === 0 && !loading ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Trophy className="h-10 w-10 text-muted-foreground/40" aria-hidden />
              <p className="font-medium">
                {isAdmin ? 'No tournaments yet' : 'No tournaments are being run yet'}
              </p>
              <p className="text-sm text-muted-foreground">
                {isAdmin
                  ? 'Launch the template above or design a custom tournament to get started.'
                  : 'When an organiser creates a tournament, it will appear here.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tournaments.map((t) => {
              const percent = t.eventCount === 0 ? 0 : Math.round((t.completedCount / t.eventCount) * 100)
              return (
                <Card key={t.id} className={cn('flex flex-col transition-shadow hover:shadow-md', t.status === 'archived' && 'opacity-70')}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="truncate text-base">{t.name}</CardTitle>
                        <CardDescription className="truncate">{t.organizer || '—'}</CardDescription>
                      </div>
                      <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', STATUS_STYLES[t.status] ?? STATUS_STYLES.draft)}>
                        {t.status}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-3">
                    <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="font-normal">{t.divisionCount} divisions</Badge>
                      <Badge variant="secondary" className="font-normal">{t.gameCount} games</Badge>
                      <Badge variant="secondary" className="font-normal">{t.centerCount} centers</Badge>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                          {t.completedCount} / {t.eventCount} events completed
                        </span>
                        <span className="font-semibold tabular-nums">{percent}%</span>
                      </div>
                      <Progress value={percent} className="h-1.5" aria-label={`${percent}% of events completed`} />
                    </div>
                  </CardContent>
                  <CardFooter className="gap-2">
                    <Button className="flex-1 gap-1.5 font-semibold" onClick={() => void openTournament(t.id, session ? 'judge' : 'scoreboard')}>
                      <Trophy className="h-4 w-4" aria-hidden />
                      {session ? 'Open scoring' : 'View results'}
                    </Button>
                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => void openTournament(t.id, 'scoreboard')} aria-label="Open scoreboard" title="Scoreboard">
                      <LayoutGrid className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => void openTournament(t.id, 'me')} aria-label="Open coordination console" title="M&E Console">
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                    </Button>
                    {isAdmin ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="icon" className="h-9 w-9" aria-label="More actions">
                            <Copy className="h-4 w-4" aria-hidden />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              const base = t.name.replace(/\s*\(.*\)$/, '').replace(/\s*—\s*Copy$/, '')
                              setCloneTarget({ id: t.id, name: `${base} (Copy)` })
                              setCloneName(`${base} (Copy)`)
                            }}
                          >
                            <Copy className="mr-2 h-4 w-4" aria-hidden /> Duplicate…
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteTarget(t)}>
                            <Trash2 className="mr-2 h-4 w-4" aria-hidden /> Delete…
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      <WizardDialog open={wizardOpen} onOpenChange={setWizardOpen} />

      {/* Duplicate dialog */}
      <Dialog open={cloneTarget !== null} onOpenChange={(open) => !open && setCloneTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicate tournament</DialogTitle>
            <DialogDescription>
              Copies the divisions, games, event slots and center roster. Results and the audit
              history are not carried over.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="clone-name">Name for the new tournament</Label>
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
              This permanently removes the tournament and all of its data — divisions, games,
              {' '}{deleteTarget?.eventCount ?? 0} event slots, results and the audit history. This
              action cannot be undone.
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
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PresetStat({ icon: Icon, label, value }: { icon: typeof Trophy; label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
      </div>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}
