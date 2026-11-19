'use client'

import { useMemo, useState } from 'react'
import { Award, CalendarPlus, GraduationCap, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'

const NEW_DIVISION = '__new_division__'
const NEW_GAME = '__new_game__'

/**
 * Add event slots to a live tournament — the matrix was the plan,
 * not a cage. Slots are appended under an existing category and
 * game, or under brand-new ones created right here (the game the
 * plan missed, the extra round the field asks for). Each new slot
 * picks its scoring mode up front: the classic center podium, or
 * per-student marks whose sums derive the podium.
 *
 * The form lives in its own component inside Radix's unmounted
 * content, so it mounts fresh — clean defaults, no reset effects —
 * every time the dialog opens.
 */
export function AddEventDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <AddEventForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function AddEventForm({ onDone }: { onDone: () => void }) {
  const { toast } = useToast()
  const detail = useAppStore((s) => s.detail)
  const addEvents = useAppStore((s) => s.addEvents)

  const [divisionChoice, setDivisionChoice] = useState(detail?.divisions[0]?.id ?? '')
  const [gameChoice, setGameChoice] = useState(detail?.games[0]?.id ?? '')
  const [newDivisionCode, setNewDivisionCode] = useState('')
  const [newDivisionName, setNewDivisionName] = useState('')
  const [newGameName, setNewGameName] = useState('')
  const [newGameSinhala, setNewGameSinhala] = useState('')
  const [count, setCount] = useState('1')
  const [scoringMode, setScoringMode] = useState<'podium' | 'students'>('podium')
  const [busy, setBusy] = useState(false)

  const divisions = detail?.divisions ?? []
  const games = detail?.games ?? []

  const isNewDivision = divisionChoice === NEW_DIVISION
  const isNewGame = gameChoice === NEW_GAME

  // Where the appended slots will start numbering for an existing
  // pair — "Slots 3–4" reads better than a bare count.
  const nextSlot = useMemo(() => {
    if (!detail || isNewDivision || isNewGame || !divisionChoice || !gameChoice) return null
    const slots = detail.events.filter((e) => e.divisionId === divisionChoice && e.gameId === gameChoice)
    return slots.length === 0 ? 1 : Math.max(...slots.map((e) => e.subEventIndex)) + 1
  }, [detail, divisionChoice, gameChoice, isNewDivision, isNewGame])

  const n = Math.max(1, Math.min(10, Number(count) || 1))
  const slotHint = nextSlot
    ? n === 1
      ? `Appends as slot ${nextSlot}`
      : `Appends as slots ${nextSlot}–${nextSlot + n - 1}`
    : null

  const valid =
    (isNewDivision ? newDivisionCode.trim().length > 0 : divisionChoice !== '') &&
    (isNewGame ? newGameName.trim().length > 0 : gameChoice !== '')

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    const out = await addEvents({
      divisionId: isNewDivision ? undefined : divisionChoice,
      newDivision: isNewDivision
        ? { code: newDivisionCode.trim(), name: newDivisionName.trim() }
        : undefined,
      gameId: isNewGame ? undefined : gameChoice,
      newGame: isNewGame
        ? { englishName: newGameName.trim(), sinhalaName: newGameSinhala.trim() }
        : undefined,
      count: n,
      scoringMode,
    })
    setBusy(false)
    if (out.ok) {
      toast({
        title: `${out.added} event${out.added === 1 ? '' : 's'} added`,
        description: scoringMode === 'students'
          ? 'Each slot scores per-student marks; center places derive from the sums.'
          : 'Each slot scores the classic center podium.',
      })
      onDone()
    } else {
      toast({ title: 'Could not add the events', description: out.error, variant: 'destructive' })
    }
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarPlus className="h-4 w-4 text-primary" aria-hidden />
            Add events
          </DialogTitle>
          <DialogDescription>
            Append slots to the live matrix — under an existing category and game, or new ones created here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Category */}
          <div className="grid gap-2">
            <Label>Category</Label>
            <Select value={divisionChoice} onValueChange={setDivisionChoice}>
              <SelectTrigger className="w-full" aria-label="Category">
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                {divisions.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    Cat {d.code} — {d.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_DIVISION}>+ New category…</SelectItem>
              </SelectContent>
            </Select>
            {isNewDivision ? (
              <div className="grid grid-cols-[7rem_1fr] gap-2">
                <Input
                  value={newDivisionCode}
                  onChange={(e) => setNewDivisionCode(e.target.value.toUpperCase())}
                  placeholder="Code"
                  aria-label="New category code"
                  autoComplete="off"
                  maxLength={8}
                />
                <Input
                  value={newDivisionName}
                  onChange={(e) => setNewDivisionName(e.target.value)}
                  placeholder="Category name (optional)"
                  aria-label="New category name"
                  autoComplete="off"
                />
              </div>
            ) : null}
          </div>

          {/* Game */}
          <div className="grid gap-2">
            <Label>Game</Label>
            <Select value={gameChoice} onValueChange={setGameChoice}>
              <SelectTrigger className="w-full" aria-label="Game">
                <SelectValue placeholder="Pick a game" />
              </SelectTrigger>
              <SelectContent>
                {games.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.englishName}
                    {g.sinhalaName ? <span className="sinhala"> · {g.sinhalaName}</span> : null}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_GAME}>+ New game…</SelectItem>
              </SelectContent>
            </Select>
            {isNewGame ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={newGameName}
                  onChange={(e) => setNewGameName(e.target.value)}
                  placeholder="Game name (English)"
                  aria-label="New game name"
                  autoComplete="off"
                />
                <Input
                  value={newGameSinhala}
                  onChange={(e) => setNewGameSinhala(e.target.value)}
                  placeholder="සිංහල නම (optional)"
                  aria-label="New game Sinhala name"
                  autoComplete="off"
                  className="sinhala"
                />
              </div>
            ) : null}
          </div>

          {/* Slots + scoring mode */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>How many slots</Label>
              <Select value={count} onValueChange={setCount}>
                <SelectTrigger className="w-full" aria-label="Number of slots">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 10 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {i + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {slotHint ? (
                <p className="text-[11px] text-muted-foreground">{slotHint}</p>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label>Scoring</Label>
              <div className="flex gap-1 rounded-lg border bg-muted/30 p-1" role="tablist" aria-label="Scoring mode for new slots">
                <button
                  type="button"
                  role="tab"
                  aria-selected={scoringMode === 'podium'}
                  onClick={() => setScoringMode('podium')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                    scoringMode === 'podium' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Award className="h-3.5 w-3.5" aria-hidden /> Podium
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={scoringMode === 'students'}
                  onClick={() => setScoringMode('students')}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
                    scoringMode === 'students' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <GraduationCap className="h-3.5 w-3.5" aria-hidden /> Students
                </button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onDone} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !valid} className="gap-1.5 font-semibold">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CalendarPlus className="h-4 w-4" aria-hidden />}
            Add {n > 1 ? `${n} events` : 'event'}
          </Button>
        </DialogFooter>
    </>
  )
}
