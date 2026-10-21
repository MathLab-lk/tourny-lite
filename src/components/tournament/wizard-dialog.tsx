'use client'

import { useMemo, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Minus,
  Plus,
  Trash2,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/store/app-store'
import { MASTER_GAME_LIBRARY, type PresetGame } from '@/lib/preset'
import type { CustomTournamentPayload } from '@/lib/types'
import { cn } from '@/lib/utils'

interface WizardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const QUICK_SCHEMES = [
  { label: '75 / 50 / 25', first: 75, second: 50, third: 25 },
  { label: '100 / 60 / 40', first: 100, second: 60, third: 40 },
  { label: '5 / 3 / 1', first: 5, second: 3, third: 1 },
]

interface DivisionDraft {
  code: string
  name: string
  ageRange: string
  gradeRange: string
}

const DEFAULT_DIVISIONS: DivisionDraft[] = [
  { code: 'A', name: 'Category A', ageRange: '5 to 8', gradeRange: '1, 2, 3' },
  { code: 'B', name: 'Category B', ageRange: '9 to 10', gradeRange: '4, 5' },
  { code: 'C', name: 'Category C', ageRange: '11 to 12', gradeRange: '6, 7' },
  { code: 'D', name: 'Category D', ageRange: '13 to 15', gradeRange: '8, 9, 10' },
  { code: 'E', name: 'Category E', ageRange: '15+', gradeRange: 'Open' },
]

const STEPS = ['Details & scoring', 'Divisions & games', 'Centers']

export function WizardDialog({ open, onOpenChange }: WizardDialogProps) {
  const { toast } = useToast()
  const createCustom = useAppStore((s) => s.createCustom)
  const openTournament = useAppStore((s) => s.openTournament)

  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)

  // Step 1
  const [name, setName] = useState('')
  const [organizer, setOrganizer] = useState('')
  const [points, setPoints] = useState({ first: 75, second: 50, third: 25 })

  // Step 2
  const [divisions, setDivisions] = useState<DivisionDraft[]>(DEFAULT_DIVISIONS)
  const [selectedGames, setSelectedGames] = useState<string[]>(['domino', 'card', 'carrom'])
  const [customGames, setCustomGames] = useState<PresetGame[]>([])
  const [customName, setCustomName] = useState('')
  const [customSinhala, setCustomSinhala] = useState('')
  const [matrix, setMatrix] = useState<Record<string, Record<string, number>>>(() => {
    const m: Record<string, Record<string, number>> = {}
    for (const d of DEFAULT_DIVISIONS) m[d.code] = {}
    return m
  })

  // Step 3
  const [centersText, setCentersText] = useState('101, 103, 105, 111, 401, 414')

  const allGames: PresetGame[] = useMemo(
    () => [
      ...MASTER_GAME_LIBRARY.filter((g) => selectedGames.includes(g.code)),
      ...customGames,
    ],
    [selectedGames, customGames]
  )

  const totalEvents = useMemo(
    () =>
      divisions.reduce(
        (sum, d) => sum + allGames.reduce((s, g) => s + (matrix[d.code]?.[g.code] ?? 0), 0),
        0
      ),
    [divisions, allGames, matrix]
  )

  const filledCodes = divisions.filter((d) => d.code.trim()).map((d) => d.code.trim().toUpperCase())
  const hasDuplicateCodes = new Set(filledCodes).size !== filledCodes.length

  const step1Valid = name.trim().length > 0
  const step2Valid =
    filledCodes.length > 0 && !hasDuplicateCodes && allGames.length > 0 && totalEvents > 0

  const reset = () => {
    setStep(1)
    setName('')
    setOrganizer('')
    setPoints({ first: 75, second: 50, third: 25 })
    setDivisions(DEFAULT_DIVISIONS)
    setSelectedGames(['domino', 'card', 'carrom'])
    setCustomGames([])
    setCustomName('')
    setCustomSinhala('')
    const m: Record<string, Record<string, number>> = {}
    for (const d of DEFAULT_DIVISIONS) m[d.code] = {}
    setMatrix(m)
    setCentersText('101, 103, 105, 111, 401, 414')
  }

  const setCell = (divCode: string, gameCode: string, delta: number) => {
    setMatrix((prev) => {
      const row = { ...(prev[divCode] ?? {}) }
      const next = Math.max(0, Math.min(20, (row[gameCode] ?? 0) + delta))
      if (next === 0) delete row[gameCode]
      else row[gameCode] = next
      return { ...prev, [divCode]: row }
    })
  }

  const addDivision = () => {
    const used = new Set(divisions.map((d) => d.code.toUpperCase()))
    let letter = 'A'
    while (used.has(letter) && letter.charCodeAt(0) < 90) letter = String.fromCharCode(letter.charCodeAt(0) + 1)
    setDivisions((prev) => [...prev, { code: letter, name: `Category ${letter}`, ageRange: '', gradeRange: '' }])
    setMatrix((prev) => ({ ...prev, [letter]: {} }))
  }

  const removeDivision = (code: string) => {
    setDivisions((prev) => prev.filter((d) => d.code !== code))
  }

  const updateDivision = (code: string, patch: Partial<DivisionDraft>) => {
    setDivisions((prev) => prev.map((d) => (d.code === code ? { ...d, ...patch } : d)))
  }

  const toggleGame = (code: string) => {
    setSelectedGames((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]))
  }

  const addCustomGame = () => {
    const trimmed = customName.trim()
    if (!trimmed) return
    const code = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    if (allGames.some((g) => g.code === code)) {
      toast({ title: 'A game with a similar name already exists', variant: 'destructive' })
      return
    }
    setCustomGames((prev) => [...prev, { code, englishName: trimmed, sinhalaName: customSinhala.trim(), rulesSummary: '' }])
    setCustomName('')
    setCustomSinhala('')
  }

  const submit = async () => {
    if (!step1Valid || !step2Valid) return
    setBusy(true)
    const payload: CustomTournamentPayload = {
      name,
      organizer,
      pointsFirst: points.first,
      pointsSecond: points.second,
      pointsThird: points.third,
      divisions: divisions
        .filter((d) => d.code.trim())
        .map((d) => ({ code: d.code.trim().toUpperCase(), name: d.name.trim() || `Category ${d.code}`, ageRange: d.ageRange, gradeRange: d.gradeRange })),
      games: allGames.map((g) => ({ code: g.code, englishName: g.englishName, sinhalaName: g.sinhalaName, rulesSummary: g.rulesSummary })),
      matrix,
      centersText,
    }
    const id = await createCustom(payload)
    setBusy(false)
    if (id) {
      toast({ title: 'Tournament created', description: `${totalEvents} event slots were generated and are ready for scoring.` })
      onOpenChange(false)
      reset()
      await openTournament(id, 'me')
    } else {
      toast({ title: 'Could not create the tournament', description: 'Please review the configuration and try again.', variant: 'destructive' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Design a tournament</DialogTitle>
          <DialogDescription>
            Step {step} of 3 — {STEPS[step - 1]}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <ol className="flex items-center gap-2" aria-label="Setup progress">
          {STEPS.map((label, i) => {
            const n = i + 1
            const done = step > n
            const current = step === n
            return (
              <li key={label} className="flex flex-1 items-center gap-2">
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    current && 'bg-primary text-primary-foreground',
                    done && 'bg-emerald-600 text-white',
                    !current && !done && 'bg-muted text-muted-foreground'
                  )}
                  aria-current={current ? 'step' : undefined}
                >
                  {done ? <Check className="h-4 w-4" aria-hidden /> : n}
                </span>
                <span className={cn('hidden text-xs font-medium sm:block', current ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
                {i < STEPS.length - 1 ? <span className="h-px flex-1 bg-border" aria-hidden /> : null}
              </li>
            )
          })}
        </ol>

        {/* STEP 1 */}
        {step === 1 ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="wiz-name">Tournament name *</Label>
                <Input id="wiz-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Inter-Center Sports Meet 2026" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wiz-organizer">Organiser</Label>
                <Input id="wiz-organizer" value={organizer} onChange={(e) => setOrganizer(e.target.value)} placeholder="Seed Ministries" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Podium scoring scheme</Label>
              <div className="flex flex-wrap gap-2">
                {QUICK_SCHEMES.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setPoints({ first: s.first, second: s.second, third: s.third })}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors tabular-nums',
                      points.first === s.first && points.second === s.second && points.third === s.third
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'hover:bg-muted'
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-p1" className="text-amber-700 dark:text-amber-400">1st place points</Label>
                  <Input id="wiz-p1" type="number" min={0} value={points.first} onChange={(e) => setPoints((p) => ({ ...p, first: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-p2" className="text-slate-600 dark:text-slate-300">2nd place points</Label>
                  <Input id="wiz-p2" type="number" min={0} value={points.second} onChange={(e) => setPoints((p) => ({ ...p, second: Number(e.target.value) }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wiz-p3" className="text-orange-800 dark:text-orange-400">3rd place points</Label>
                  <Input id="wiz-p3" type="number" min={0} value={points.third} onChange={(e) => setPoints((p) => ({ ...p, third: Number(e.target.value) }))} />
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* STEP 2 */}
        {step === 2 ? (
          <div className="space-y-5">
            {/* Divisions editor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Divisions / categories</Label>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={addDivision}>
                  <Plus className="h-3.5 w-3.5" aria-hidden /> Add division
                </Button>
              </div>
              {hasDuplicateCodes ? (
                <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
                  Two divisions share the same code. Give every division a unique code to continue.
                </p>
              ) : null}
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {divisions.map((d, i) => {
                  const duplicate =
                    filledCodes.filter((c) => c === d.code.trim().toUpperCase()).length > 1
                  return (
                    <div key={`${d.code}-${i}`} className="flex items-center gap-2">
                      <Input
                        className={cn(
                          'h-9 w-16 shrink-0 text-center font-semibold uppercase',
                          duplicate && 'border-destructive focus-visible:ring-destructive/40'
                        )}
                        value={d.code}
                        onChange={(e) => updateDivision(d.code, { code: e.target.value.toUpperCase().slice(0, 3) })}
                        aria-label="Division code"
                      />
                      <Input className="h-9" value={d.name} onChange={(e) => updateDivision(d.code, { name: e.target.value })} aria-label="Division name" placeholder="Category name" />
                      <Input className="h-9 w-28 shrink-0" value={d.ageRange} onChange={(e) => updateDivision(d.code, { ageRange: e.target.value })} aria-label="Age range" placeholder="Age" />
                      <Input className="h-9 w-28 shrink-0" value={d.gradeRange} onChange={(e) => updateDivision(d.code, { gradeRange: e.target.value })} aria-label="Grades" placeholder="Grades" />
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0 text-destructive hover:text-destructive" onClick={() => removeDivision(d.code)} aria-label={`Remove division ${d.code}`}>
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Game selection */}
            <div className="space-y-2">
              <Label>Games</Label>
              <div className="flex flex-wrap gap-2">
                {MASTER_GAME_LIBRARY.map((g) => {
                  const on = selectedGames.includes(g.code)
                  return (
                    <button
                      key={g.code}
                      type="button"
                      onClick={() => toggleGame(g.code)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                        on ? 'border-primary bg-primary/10' : 'hover:bg-muted'
                      )}
                      aria-pressed={on}
                    >
                      <span className="font-semibold">{g.englishName}</span>
                      {g.sinhalaName ? <span className="ml-1.5 text-xs text-muted-foreground sinhala">{g.sinhalaName}</span> : null}
                    </button>
                  )
                })}
                {customGames.map((g) => (
                  <span key={g.code} className="flex items-center gap-1 rounded-lg border border-primary bg-primary/10 px-3 py-2 text-sm">
                    <span className="font-semibold">{g.englishName}</span>
                    <button type="button" onClick={() => setCustomGames((p) => p.filter((x) => x.code !== g.code))} className="text-destructive hover:text-destructive/80" aria-label={`Remove ${g.englishName}`}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-2">
                <div className="min-w-36 flex-1 space-y-1">
                  <Label htmlFor="wiz-game-name" className="text-xs">Add another game</Label>
                  <Input id="wiz-game-name" className="h-9" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="e.g. Chess Blitz" />
                </div>
                <div className="min-w-28 flex-1 space-y-1">
                  <Label htmlFor="wiz-game-si" className="text-xs">Name in Sinhala (optional)</Label>
                  <Input id="wiz-game-si" className="h-9 sinhala" value={customSinhala} onChange={(e) => setCustomSinhala(e.target.value)} />
                </div>
                <Button type="button" variant="outline" className="h-9 gap-1" onClick={addCustomGame} disabled={!customName.trim()}>
                  <Plus className="h-3.5 w-3.5" aria-hidden /> Add
                </Button>
              </div>
            </div>

            {/* Event count matrix */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Event slots per division × game</Label>
                <Badge variant="secondary" className="tabular-nums">{totalEvents} events</Badge>
              </div>
              {allGames.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Select at least one game above.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[540px] text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="p-2 text-left font-semibold">Division</th>
                        {allGames.map((g) => (
                          <th key={g.code} className="p-2 text-center font-semibold">{g.englishName}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {divisions.filter((d) => d.code.trim()).map((d) => (
                        <tr key={d.code} className="border-b last:border-0">
                          <td className="p-2 font-semibold">{d.code}</td>
                          {allGames.map((g) => {
                            const n = matrix[d.code]?.[g.code] ?? 0
                            return (
                              <td key={g.code} className="p-1.5 text-center">
                                <div className="inline-flex items-center gap-1">
                                  <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setCell(d.code, g.code, -1)} disabled={n === 0} aria-label={`Remove one ${g.englishName} event for category ${d.code}`}>
                                    <Minus className="h-3.5 w-3.5" aria-hidden />
                                  </Button>
                                  <span className={cn('w-7 text-center font-semibold tabular-nums', n > 0 ? '' : 'text-muted-foreground/40')}>{n}</span>
                                  <Button type="button" variant="outline" size="icon" className="h-7 w-7" onClick={() => setCell(d.code, g.code, 1)} aria-label={`Add one ${g.englishName} event for category ${d.code}`}>
                                    <Plus className="h-3.5 w-3.5" aria-hidden />
                                  </Button>
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* STEP 3 */}
        {step === 3 ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wiz-centers">Participating centers</Label>
              <textarea
                id="wiz-centers"
                className="min-h-28 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={centersText}
                onChange={(e) => setCentersText(e.target.value)}
                placeholder={'101, 103, 105\n401 — Kandy Center\n414'}
              />
              <p className="text-xs text-muted-foreground">
                Separate codes with commas or new lines. Optionally include a name after a dash,
                e.g. <span className="font-mono">401 — Kandy Center</span>. Centers can also be
                managed later from the coordination console.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {['101', '103', '105', '111', '401', '414'].map((code) => (
                <Button
                  key={code}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => setCentersText((prev) => (prev.split(/[\n,]+/).map((s) => s.trim()).includes(code) ? prev : `${prev.replace(/,\s*$/, '')}, ${code}`.replace(/^,\s*/, '')))}
                >
                  <Plus className="mr-1 h-3 w-3" aria-hidden /> {code}
                </Button>
              ))}
            </div>
            <div className="rounded-lg border bg-muted/40 p-4">
              <h4 className="text-sm font-semibold">Summary</h4>
              <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
                <li><span className="font-medium text-foreground">{name || 'Untitled'}</span>{organizer ? ` · ${organizer}` : ''}</li>
                <li className="tabular-nums">Scoring: 1st = {points.first}, 2nd = {points.second}, 3rd = {points.third} points</li>
                <li className="tabular-nums">{divisions.filter((d) => d.code.trim()).length} divisions · {allGames.length} games · <span className="font-semibold text-foreground">{totalEvents} event slots</span></li>
                <li className="tabular-nums">{centersText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).length} centers</li>
              </ul>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => (step === 1 ? onOpenChange(false) : setStep(step - 1))}>
            {step === 1 ? 'Cancel' : (<><ChevronLeft className="mr-1 h-4 w-4" aria-hidden /> Back</>)}
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep(step + 1)} disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}>
              Continue <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <Button className="gap-2 font-semibold" onClick={submit} disabled={busy || !step1Valid || !step2Valid}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
              Create tournament
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
