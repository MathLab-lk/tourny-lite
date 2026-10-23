'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { springPop } from '@/components/tournament/ui-bits'
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
const SLOT_META: Record<PodiumSlot, { label: string; short: string; active: string; text: string }> = {
  first: {
    label: '1st place',
    short: '1st',
    active: 'border-amber-500/70 bg-amber-500/10 ring-amber-400/60 dark:bg-amber-950/30',
    text: 'text-amber-700 dark:text-amber-400',
  },
  second: {
    label: '2nd place',
    short: '2nd',
    active: 'border-slate-400/80 bg-slate-400/10 ring-slate-400/60 dark:bg-slate-900/50',
    text: 'text-slate-600 dark:text-slate-300',
  },
  third: {
    label: '3rd place',
    short: '3rd',
    active: 'border-orange-700/60 bg-orange-700/10 ring-orange-700/60 dark:bg-orange-950/30',
    text: 'text-orange-800 dark:text-orange-400',
  },
}

const ORDER: PodiumSlot[] = ['first', 'second', 'third']

/** The slot's payload: the assigned center code pops in when it
 *  lands, the hint fades — assignments never hard-swap. */
function SlotPayload({
  code,
  active,
  disabled,
}: {
  code: string | null
  active: boolean
  disabled?: boolean
}) {
  if (code) {
    return (
      <motion.span
        key={code}
        initial={{ opacity: 0, scale: 0.55 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={springPop}
        className="min-w-0 truncate text-base font-semibold leading-tight tabular-nums"
      >
        {code}
      </motion.span>
    )
  }
  return (
    <motion.span
      key="hint"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="text-xs text-muted-foreground"
    >
      {active && !disabled ? 'Tap a center' : 'Empty'}
    </motion.span>
  )
}

export function PodiumEditor({ centers, points, value, onChange, disabled }: PodiumEditorProps) {
  // Slot the user explicitly selected (overrides auto-advance)
  const [explicitSlot, setExplicitSlot] = useState<PodiumSlot | null>(null)

  // Derived active slot: explicit choice, else the first unfilled place.
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
    <div className="space-y-3">
      {/* Podium slots */}
      <div className="grid grid-cols-3 gap-2">
        {ORDER.map((slot) => {
          const meta = SLOT_META[slot]
          const center = centerOf(value[slot])
          const isActive = activeSlot === slot
          return (
            <motion.button
              key={slot}
              type="button"
              onClick={() => selectSlot(slot)}
              disabled={disabled}
              animate={{ scale: isActive ? 1.02 : 1 }}
              transition={springPop}
              whileTap={{ scale: 0.97 }}
              className={cn(
                'relative rounded-lg border p-2.5 text-left transition-all',
                isActive ? cn(meta.active, 'ring-2') : 'border-border bg-card hover:bg-muted/40',
                disabled && 'cursor-not-allowed opacity-60'
              )}
              aria-pressed={isActive}
            >
              <span className="flex items-center justify-between gap-1">
                <span className={cn('text-[11px] font-semibold', meta.text)}>{meta.short}</span>
                <span className="text-[10px] tabular-nums text-muted-foreground">{points[slot]} pts</span>
              </span>
              <span className="mt-1 flex items-center justify-between gap-1">
                <SlotPayload code={center?.centerCode ?? null} active={isActive} disabled={disabled} />
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
                    className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </span>
                ) : null}
              </span>
            </motion.button>
          )
        })}
      </div>

      {/* Center buttons */}
      <div>
        <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
          {disabled
            ? 'Sign in to assign places'
            : activeSlot
              ? `Select the ${SLOT_META[activeSlot].label.toLowerCase()} center`
              : 'All places assigned — tap a place to change it'}
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
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
                  'h-14 flex-col items-center justify-center gap-0.5 text-base font-semibold tabular-nums transition-all duration-200',
                  takenBy !== undefined && !assignedHere && 'opacity-40'
                )}
                aria-label={`Center ${c.centerCode}${takenBy ? `, already ${takenBy} place` : ''}`}
              >
                {c.centerCode}
                {c.centerName ? (
                  <span className="max-w-full truncate text-[10px] font-normal text-muted-foreground">
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
