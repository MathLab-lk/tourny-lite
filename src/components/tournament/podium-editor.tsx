'use client'

import { useState } from 'react'
import { Award, Crown, Medal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CenterDTO } from '@/lib/types'

export type PodiumSlot = 'first' | 'second' | 'third'
export interface PodiumValue {
  first: string | null
  second: string | null
  third: string | null
}

interface PodiumEditorProps {
  centers: CenterDTO[]
  points: { first: number; second: number; third: number }
  value: PodiumValue
  onChange: (value: PodiumValue) => void
  disabled?: boolean
  compact?: boolean
}

/** Medal semantics: gold / silver / bronze — used exclusively for podium places. */
const SLOT_META: Record<PodiumSlot, { label: string; icon: typeof Crown; active: string; chip: string; text: string }> = {
  first: {
    label: '1st place',
    icon: Crown,
    active: 'border-amber-500 bg-amber-50 ring-amber-400 dark:bg-amber-950/30',
    chip: 'bg-amber-400 text-amber-950',
    text: 'text-amber-700 dark:text-amber-400',
  },
  second: {
    label: '2nd place',
    icon: Medal,
    active: 'border-slate-400 bg-slate-50 ring-slate-400 dark:bg-slate-900/50',
    chip: 'bg-slate-300 text-slate-900',
    text: 'text-slate-600 dark:text-slate-300',
  },
  third: {
    label: '3rd place',
    icon: Award,
    active: 'border-orange-700/70 bg-orange-50 ring-orange-700/70 dark:bg-orange-950/30',
    chip: 'bg-orange-700 text-orange-50',
    text: 'text-orange-800 dark:text-orange-400',
  },
}

const ORDER: PodiumSlot[] = ['first', 'second', 'third']

export function PodiumEditor({ centers, points, value, onChange, disabled, compact }: PodiumEditorProps) {
  // Slot the user explicitly selected (overrides auto-advance)
  const [explicitSlot, setExplicitSlot] = useState<PodiumSlot | null>(null)

  // Derived active slot: explicit user choice, else the first unfilled place.
  // When every place is filled and none was selected, no slot is active —
  // preventing accidental overwrites of a full podium.
  const activeSlot: PodiumSlot | null =
    explicitSlot ?? (ORDER.find((s) => !value[s]) ?? null)

  const selectSlot = (slot: PodiumSlot) => {
    if (!disabled) setExplicitSlot(slot)
  }

  const assign = (centerId: string) => {
    if (disabled || !activeSlot) return
    const slot = activeSlot
    onChange({ ...value, [slot]: centerId })
    // Fall back to the next unfilled place (or lock when the podium is full)
    setExplicitSlot(null)
  }

  const clearSlot = (slot: PodiumSlot) => {
    if (disabled) return
    onChange({ ...value, [slot]: null })
    setExplicitSlot(slot)
  }

  const centerOf = (id: string | null) => centers.find((c) => c.id === id) ?? null

  return (
    <div className="space-y-4">
      {/* Podium slots */}
      <div className={cn('grid gap-3', compact ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-3')}>
        {ORDER.map((slot) => {
          const meta = SLOT_META[slot]
          const center = centerOf(value[slot])
          const isActive = activeSlot === slot
          const Icon = meta.icon
          return (
            <button
              key={slot}
              type="button"
              onClick={() => selectSlot(slot)}
              disabled={disabled}
              className={cn(
                'group relative rounded-xl border-2 p-3 text-left transition-all min-h-[76px]',
                isActive ? cn(meta.active, 'ring-2 ring-offset-2 ring-offset-background') : 'border-border bg-card hover:bg-muted/50',
                disabled && 'cursor-not-allowed opacity-60'
              )}
              aria-pressed={isActive}
            >
              <div className="flex items-center justify-between">
                <span className={cn('flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide', meta.text)}>
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {meta.label}
                </span>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', meta.chip)}>
                  {points[slot]} pts
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                {center ? (
                  <span className="truncate text-lg font-semibold leading-tight tabular-nums">
                    {center.centerCode}
                    {center.centerName ? (
                      <span className="ml-2 text-sm font-normal text-muted-foreground">{center.centerName}</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {isActive && !disabled ? 'Select a center below…' : 'Select to assign'}
                  </span>
                )}
                {center && !isActive ? (
                  <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Change</span>
                ) : null}
                {center && !disabled ? (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Clear ${meta.label}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      clearSlot(slot)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.stopPropagation()
                        clearSlot(slot)
                      }
                    }}
                    className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </span>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>

      {/* Center buttons */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {disabled
            ? 'Sign in to assign places'
            : activeSlot
              ? 'Select a center for the highlighted place'
              : 'All places assigned — select a place card above to change it'}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {centers.map((c) => {
            const takenBy = ORDER.find((s) => value[s] === c.id)
            const assignedHere = activeSlot !== null && value[activeSlot] === c.id
            return (
              <Button
                key={c.id}
                type="button"
                variant={assignedHere ? 'default' : 'outline'}
                disabled={disabled || !activeSlot || (takenBy !== undefined && !assignedHere)}
                onClick={() => assign(c.id)}
                className={cn(
                  'h-14 flex-col items-center justify-center gap-0.5 text-base font-semibold tabular-nums',
                  takenBy !== undefined && !assignedHere && 'opacity-40'
                )}
                aria-label={`Center ${c.centerCode}${takenBy ? `, already assigned to ${takenBy} place` : ''}`}
              >
                {c.centerCode}
                {c.centerName ? (
                  <span className="max-w-full truncate text-[11px] font-normal text-muted-foreground">
                    {c.centerName}
                  </span>
                ) : null}
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
