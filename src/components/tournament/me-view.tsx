'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  CheckCircle2,
  Clock,
  History,
  LayoutGrid,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Printer,
  Save,
  Settings,
  Trash2,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useToast } from '@/hooks/use-toast'
import { EventDialog } from '@/components/tournament/event-dialog'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'
import type { EventDTO, StandingRow, TournamentDetailDTO } from '@/lib/types'

const STATUS_CHIP: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground hover:bg-muted/70',
  in_progress: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-600/40',
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/40',
}

function parsePodium(json: string): string {
  if (!json) return '—'
  try {
    const v = JSON.parse(json) as { first?: string | null; second?: string | null; third?: string | null }
    return [v.first, v.second, v.third].filter(Boolean).join(' / ') || '—'
  } catch {
    return '—'
  }
}

export function MeView() {
  const { toast } = useToast()
  const detail = useAppStore((s) => s.detail)
  const loading = useAppStore((s) => s.loadingDetail)
  const activeId = useAppStore((s) => s.activeTournamentId)
  const session = useAppStore((s) => s.session)
  const isAdmin = session?.role === 'admin'
  const audit = useAppStore((s) => s.audit)
  const loadAudit = useAppStore((s) => s.loadAudit)
  const addCenters = useAppStore((s) => s.addCenters)
  const removeCenter = useAppStore((s) => s.removeCenter)
  const updateTournament = useAppStore((s) => s.updateTournament)
  const printSheet = useAppStore((s) => s.printSheet)
  const setView = useAppStore((s) => s.setView)
  const setAuthDialogOpen = useAppStore((s) => s.setAuthDialogOpen)

  const [selectedEvent, setSelectedEvent] = useState<EventDTO | null>(null)
  const [centersText, setCentersText] = useState('')
  const [addingCenters, setAddingCenters] = useState(false)
  const [auditLoaded, setAuditLoaded] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<StandingRow | null>(null)
  const [removing, setRemoving] = useState(false)

  // Keep the open dialog in sync with refreshed data
  const liveSelectedEvent = useMemo(
    () => (selectedEvent && detail ? (detail.events.find((e) => e.id === selectedEvent.id) ?? selectedEvent) : null),
    [selectedEvent, detail]
  )

  // Refresh the audit trail when tournaments change or new results land
  useEffect(() => {
    if (activeId) {
      loadAudit(activeId).then(() => setAuditLoaded(true))
    }
  }, [activeId, detail?.progress.completed, loadAudit])

  if (loading && !detail) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden />
      </div>
    )
  }
  if (!detail || !activeId) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-20 text-center">
        <LayoutGrid className="h-12 w-12 text-muted-foreground/40" aria-hidden />
        <h2 className="text-lg font-semibold">No tournament selected</h2>
        <p className="text-sm text-muted-foreground">Select a tournament from the selector above.</p>
      </div>
    )
  }

  const { tournament, divisions, games, centers, events, progress, standings } = detail

  const doAddCenters = async () => {
    if (!centersText.trim()) return
    setAddingCenters(true)
    const ok = await addCenters(centersText)
    setAddingCenters(false)
    if (ok) {
      toast({ title: 'Centers added' })
      setCentersText('')
    } else {
      toast({ title: 'Could not add the centers', description: 'Please check the format and try again.', variant: 'destructive' })
    }
  }

  const doRemoveCenter = async () => {
    if (!removeTarget) return
    setRemoving(true)
    const ok = await removeCenter(removeTarget.centerId)
    setRemoving(false)
    setRemoveTarget(null)
    toast(
      ok
        ? { title: `Center ${removeTarget.centerCode} removed` }
        : { title: 'Could not remove the center', variant: 'destructive' }
    )
  }

  const setStatus = async (status: string) => {
    const ok = await updateTournament(activeId, { status })
    toast(ok ? { title: `Tournament marked ${status}` } : { title: 'Update failed', variant: 'destructive' })
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{tournament.name}</h1>
          <p className="text-sm text-muted-foreground">
            {tournament.organizer || 'Coordination console'} · Scoring {tournament.pointsFirst}/{tournament.pointsSecond}/{tournament.pointsThird}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => printSheet('progress')}>
            <Printer className="h-4 w-4" aria-hidden /> Progress sheet
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => printSheet('awards')}>
            <Trophy className="h-4 w-4" aria-hidden /> Awards scorecard
          </Button>
          <Button size="sm" className="gap-1.5 font-semibold" onClick={() => setView('scoreboard')}>
            <BarChart3 className="h-4 w-4" aria-hidden /> Scoreboard
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={CheckCircle2} label="Completed" value={`${progress.completed}/${progress.total}`} tone="emerald" />
        <StatCard icon={Clock} label="In progress" value={String(progress.inProgress)} tone="amber" />
        <StatCard icon={XCircle} label="Pending" value={String(progress.pending)} tone="muted" />
        <StatCard icon={Users} label="Centers" value={String(centers.length)} tone="plain" />
      </div>

      <Tabs defaultValue="grid">
        <TabsList className="mb-4 h-auto flex-wrap">
          <TabsTrigger value="grid" className="gap-1.5"><LayoutGrid className="h-4 w-4" aria-hidden /> Event grid</TabsTrigger>
          <TabsTrigger value="centers" className="gap-1.5"><Users className="h-4 w-4" aria-hidden /> Centers</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5"><History className="h-4 w-4" aria-hidden /> Audit trail</TabsTrigger>
          {isAdmin ? (
            <TabsTrigger value="settings" className="gap-1.5"><Settings className="h-4 w-4" aria-hidden /> Settings</TabsTrigger>
          ) : null}
        </TabsList>

        {/* ── EVENT GRID ─────────────────────────────── */}
        <TabsContent value="grid">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Division × game event matrix</CardTitle>
              <CardDescription>
                {progress.completed} of {progress.total} events completed ({progress.percent}%).
                {session
                  ? ' Select a slot to view, record or correct its result.'
                  : ' Select a slot to view its recorded result.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="w-32 border-b p-2 text-left font-semibold">Division</th>
                      {games.map((g) => (
                        <th key={g.id} className="border-b p-2 text-center font-semibold">
                          {g.englishName}
                          {g.sinhalaName ? <span className="block text-[11px] font-normal text-muted-foreground sinhala">{g.sinhalaName}</span> : null}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {divisions.map((d) => (
                      <tr key={d.id} className="align-top">
                        <td className="border-b p-2">
                          <p className="font-semibold">Cat {d.code}</p>
                          <p className="text-[11px] leading-tight text-muted-foreground">
                            {d.ageRange}
                            {d.gradeRange ? ` · Grades ${d.gradeRange}` : ''}
                          </p>
                        </td>
                        {games.map((g) => {
                          const slots = events
                            .filter((e) => e.divisionId === d.id && e.gameId === g.id)
                            .sort((a, b) => a.subEventIndex - b.subEventIndex)
                          return (
                            <td key={g.id} className="border-b p-2">
                              {slots.length === 0 ? (
                                <span className="block text-center text-muted-foreground/30">—</span>
                              ) : (
                                <div className="flex flex-wrap justify-center gap-1.5">
                                  {slots.map((e) => (
                                    <button
                                      key={e.id}
                                      type="button"
                                      onClick={() => setSelectedEvent(e)}
                                      className={cn(
                                        'min-h-11 min-w-11 rounded-lg px-2 py-1.5 text-xs font-semibold transition-transform hover:scale-105',
                                        STATUS_CHIP[e.status]
                                      )}
                                      title={e.label + (e.result ? ` — 1st ${e.result.firstPlaceCode ?? '—'}, 2nd ${e.result.secondPlaceCode ?? '—'}, 3rd ${e.result.thirdPlaceCode ?? '—'}` : '')}
                                      aria-label={`${e.label}, ${e.status}`}
                                    >
                                      {e.subEventIndex}
                                      {e.result ? (
                                        <span className="block text-[9px] font-medium opacity-80 tabular-nums">
                                          {e.result.firstPlaceCode ?? '—'}/{e.result.secondPlaceCode ?? '—'}/{e.result.thirdPlaceCode ?? '—'}
                                        </span>
                                      ) : null}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-muted" aria-hidden /> Pending</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-amber-600/40 bg-amber-500/15" aria-hidden /> In progress</span>
                <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-emerald-500/40 bg-emerald-500/15" aria-hidden /> Completed</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CENTERS ────────────────────────────────── */}
        <TabsContent value="centers">
          <div className="grid gap-4 lg:grid-cols-3">
            {isAdmin ? (
              <Card className="lg:col-span-1">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Add centers</CardTitle>
                  <CardDescription>Separate codes with commas or new lines. Optionally add a name after a dash.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    className="min-h-20"
                    value={centersText}
                    onChange={(e) => setCentersText(e.target.value)}
                    placeholder={'402 — Galle Center\n403'}
                    aria-label="Center codes to add"
                  />
                  <Button className="w-full gap-1.5 font-semibold" onClick={doAddCenters} disabled={addingCenters || !centersText.trim()}>
                    {addingCenters ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                    Add centers
                  </Button>
                  <div className="flex flex-wrap gap-1.5">
                    {['101', '103', '105', '111', '401', '414'].map((code) => (
                      <Button key={code} type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCentersText((p) => (p.trim() ? `${p.replace(/,\s*$/, '')}, ${code}` : code))}>
                        +{code}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="flex flex-col justify-center border-dashed lg:col-span-1">
                <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
                  <Lock className="h-5 w-5 text-muted-foreground/60" aria-hidden />
                  <p className="text-sm font-medium">Center management</p>
                  <p className="text-xs text-muted-foreground">
                    {session
                      ? 'Only administrators can add or remove participating centers.'
                      : 'Sign in with an administrator account to manage centers.'}
                  </p>
                  {!session ? (
                    <Button size="sm" variant="outline" className="mt-1 font-semibold" onClick={() => setAuthDialogOpen(true)}>
                      Sign in
                    </Button>
                  ) : null}
                </CardContent>
              </Card>
            )}

            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Participating centers ({centers.length})</CardTitle>
                <CardDescription>Standings update automatically as results are recorded.</CardDescription>
              </CardHeader>
              <CardContent>
                {centers.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                    No centers have been added yet.
                  </p>
                ) : (
                  <div className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card">
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead className="text-center">1st</TableHead>
                          <TableHead className="text-center">2nd</TableHead>
                          <TableHead className="text-center">3rd</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          {isAdmin ? <TableHead className="w-10" /> : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {standings.map((row) => (
                          <TableRow key={row.centerId}>
                            <TableCell className="font-semibold tabular-nums">{row.centerCode}</TableCell>
                            <TableCell className="text-muted-foreground">{row.centerName || '—'}</TableCell>
                            <TableCell className="text-center font-semibold text-amber-700 dark:text-amber-400 tabular-nums">{row.gold}</TableCell>
                            <TableCell className="text-center font-semibold tabular-nums">{row.silver}</TableCell>
                            <TableCell className="text-center font-semibold text-orange-700 dark:text-orange-400 tabular-nums">{row.bronze}</TableCell>
                            <TableCell className="text-right font-semibold tabular-nums">{row.total}</TableCell>
                            {isAdmin ? (
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => setRemoveTarget(row)}
                                  aria-label={`Remove center ${row.centerCode}`}
                                >
                                  <Trash2 className="h-4 w-4" aria-hidden />
                                </Button>
                              </TableCell>
                            ) : null}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── AUDIT ──────────────────────────────────── */}
        <TabsContent value="audit">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4 text-primary" aria-hidden /> Score revision history
              </CardTitle>
              <CardDescription>
                Every result is recorded here when it is created, corrected or reset — together
                with the person responsible and their justification.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {audit.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {auditLoaded ? 'No revisions have been recorded yet.' : 'Loading the revision history…'}
                </p>
              ) : (
                <ul className="max-h-[520px] space-y-2.5 overflow-y-auto pr-1">
                  {audit.map((a) => (
                    <li key={a.id} className="rounded-xl border p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[10px] font-semibold uppercase',
                            a.action === 'created' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
                            a.action === 'updated' && 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                            a.action === 'reset' && 'bg-destructive/15 text-destructive'
                          )}
                        >
                          {a.action === 'created' ? 'recorded' : a.action === 'updated' ? 'corrected' : 'reset'}
                        </Badge>
                        <span className="font-semibold">{a.eventLabel}</span>
                        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                          {new Date(a.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                        </span>
                      </div>
                      {a.action === 'updated' ? (
                        <p className="mt-1.5 text-sm">
                          <span className="rounded bg-muted px-1.5 py-0.5 line-through opacity-60">{parsePodium(a.oldValues)}</span>
                          <span className="mx-1.5 text-muted-foreground">→</span>
                          <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-semibold">{parsePodium(a.newValues)}</span>
                        </p>
                      ) : a.action === 'reset' ? (
                        <p className="mt-1.5 text-sm">
                          Cleared: <span className="rounded bg-muted px-1.5 py-0.5 line-through opacity-60">{parsePodium(a.oldValues)}</span>
                        </p>
                      ) : (
                        <p className="mt-1.5 text-sm">
                          Podium: <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-semibold">{parsePodium(a.newValues)}</span>
                        </p>
                      )}
                      {a.reason ? <p className="mt-1 text-xs italic text-muted-foreground">Reason: “{a.reason}”</p> : null}
                      {a.actor ? <p className="mt-0.5 text-xs text-muted-foreground">by {a.actor}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── SETTINGS (admin) ───────────────────────── */}
        {isAdmin ? (
          <TabsContent value="settings">
            <SettingsTab
              key={tournament.id}
              tournament={tournament}
              standings={standings}
              onSetStatus={(st) => void setStatus(st)}
            />
          </TabsContent>
        ) : null}
      </Tabs>

      <EventDialog key={liveSelectedEvent?.id ?? 'none'} event={liveSelectedEvent} onClose={() => setSelectedEvent(null)} />

      {/* Remove center confirm */}
      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove center {removeTarget?.centerCode}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget && removeTarget.gold + removeTarget.silver + removeTarget.bronze > 0
                ? `This center currently holds ${removeTarget.gold} first, ${removeTarget.silver} second and ${removeTarget.bronze} third places worth ${removeTarget.total} points. Removing it clears those places from the standings — recorded results keep it in their history.`
                : 'This center has no recorded places. It will be removed from the roster.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep center</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void doRemoveCenter()
              }}
            >
              {removing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="mr-2 h-4 w-4" aria-hidden />}
              Remove center
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ── Settings tab (administrators; remounts per tournament via key) ── */

function SettingsTab({
  tournament,
  standings,
  onSetStatus,
}: {
  tournament: TournamentDetailDTO['tournament']
  standings: TournamentDetailDTO['standings']
  onSetStatus: (status: string) => void
}) {
  const { toast } = useToast()
  const updateTournament = useAppStore((s) => s.updateTournament)
  const activeId = useAppStore((s) => s.activeTournamentId)
  const [nameDraft, setNameDraft] = useState(tournament.name)
  const [organizerDraft, setOrganizerDraft] = useState(tournament.organizer)
  const [pointsDraft, setPointsDraft] = useState({
    first: tournament.pointsFirst,
    second: tournament.pointsSecond,
    third: tournament.pointsThird,
  })
  const [savingSettings, setSavingSettings] = useState(false)

  const saveSettings = async () => {
    if (!activeId) return
    setSavingSettings(true)
    const ok = await updateTournament(activeId, {
      name: nameDraft,
      organizer: organizerDraft,
      pointsFirst: pointsDraft.first,
      pointsSecond: pointsDraft.second,
      pointsThird: pointsDraft.third,
    })
    setSavingSettings(false)
    toast(ok ? { title: 'Settings saved' } : { title: 'Could not save the settings', variant: 'destructive' })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tournament details</CardTitle>
          <CardDescription>Shown on the scoreboard and printed sheets.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="set-name">Name</Label>
            <Input id="set-name" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="set-organizer">Organiser</Label>
            <Input id="set-organizer" value={organizerDraft} onChange={(e) => setOrganizerDraft(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="set-p1" className="text-amber-700 dark:text-amber-400">1st place points</Label>
              <Input id="set-p1" type="number" min={0} value={pointsDraft.first} onChange={(e) => setPointsDraft((p) => ({ ...p, first: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-p2" className="text-slate-600 dark:text-slate-300">2nd place points</Label>
              <Input id="set-p2" type="number" min={0} value={pointsDraft.second} onChange={(e) => setPointsDraft((p) => ({ ...p, second: Number(e.target.value) }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-p3" className="text-orange-800 dark:text-orange-400">3rd place points</Label>
              <Input id="set-p3" type="number" min={0} value={pointsDraft.third} onChange={(e) => setPointsDraft((p) => ({ ...p, third: Number(e.target.value) }))} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Changing the point values recalculates the standings of every center immediately.
          </p>
          <Button className="gap-1.5 font-semibold" onClick={saveSettings} disabled={savingSettings}>
            {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
            Save settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Lifecycle status</CardTitle>
          <CardDescription>Controls how the tournament is presented across the app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(['active', 'completed', 'archived'] as const).map((st) => (
              <Button
                key={st}
                size="sm"
                variant={tournament.status === st ? 'default' : 'outline'}
                className="capitalize"
                disabled={tournament.status === st}
                onClick={() => onSetStatus(st)}
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Mark {st}
              </Button>
            ))}
          </div>
          <div className="rounded-lg border bg-muted/40 p-4">
            <h4 className="text-sm font-semibold">Current standings</h4>
            <ol className="mt-2 space-y-1 text-sm">
              {standings.slice(0, 5).map((row) => (
                <li key={row.centerId} className="flex items-center justify-between gap-4">
                  <span className="font-medium">
                    <span className={cn('mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
                      row.rank === 1 && 'bg-amber-400 text-amber-950',
                      row.rank === 2 && 'bg-slate-300 text-slate-900',
                      row.rank === 3 && 'bg-orange-700 text-orange-50',
                      row.rank > 3 && 'bg-muted text-muted-foreground')}>{row.rank}</span>
                    {row.centerCode} {row.centerName ? <span className="font-normal text-muted-foreground">{row.centerName}</span> : null}
                  </span>
                  <span className="font-semibold tabular-nums">{row.total}</span>
                </li>
              ))}
              {standings.length === 0 ? <li className="text-muted-foreground">No centers yet.</li> : null}
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: string; tone: 'emerald' | 'amber' | 'muted' | 'plain' }) {
  return (
    <Card className="py-4">
      <CardContent className="flex items-center gap-3 px-4">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            tone === 'emerald' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            tone === 'amber' && 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
            tone === 'muted' && 'bg-muted text-muted-foreground',
            tone === 'plain' && 'bg-primary/10 text-primary'
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tabular-nums leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
