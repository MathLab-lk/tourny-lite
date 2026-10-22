'use client'

import { useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { EmptyState, PageHeader, medalText } from '@/components/tournament/ui-bits'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'
import type { StandingRow } from '@/lib/types'

/**
 * Centers — the roster and its standings, side by side in one table.
 */
export function CentersView() {
  const { toast } = useToast()
  const detail = useAppStore((s) => s.detail)
  const loading = useAppStore((s) => s.loadingDetail)
  const session = useAppStore((s) => s.session)
  const isAdmin = session?.role === 'admin'
  const addCenters = useAppStore((s) => s.addCenters)
  const removeCenter = useAppStore((s) => s.removeCenter)

  const [centersText, setCentersText] = useState('')
  const [addingCenters, setAddingCenters] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<StandingRow | null>(null)
  const [removing, setRemoving] = useState(false)

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
        <EmptyState title="No tournament selected" hint="Pick a tournament from the sidebar." />
      </div>
    )
  }

  const { centers, standings } = detail

  const doAddCenters = async () => {
    if (!centersText.trim()) return
    setAddingCenters(true)
    const ok = await addCenters(centersText)
    setAddingCenters(false)
    if (ok) {
      toast({ title: 'Centers added' })
      setCentersText('')
    } else {
      toast({ title: 'Could not add the centers', description: 'Check the format and try again.', variant: 'destructive' })
    }
  }

  const doRemoveCenter = async () => {
    if (!removeTarget) return
    setRemoving(true)
    const ok = await removeCenter(removeTarget.centerId)
    setRemoving(false)
    setRemoveTarget(null)
    toast(ok ? { title: `Center ${removeTarget.centerCode} removed` } : { title: 'Could not remove the center', variant: 'destructive' })
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pt-6 sm:px-6">
      <PageHeader
        title="Centers"
        meta={`${centers.length} participating · standings update live`}
      />

      {/* Add centers (admin) */}
      {isAdmin ? (
        <div className="mt-5 flex flex-col gap-2 rounded-lg border bg-card p-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Textarea
              className="min-h-10"
              value={centersText}
              onChange={(e) => setCentersText(e.target.value)}
              placeholder={'402 — Galle Center, 403, 404'}
              aria-label="Center codes to add"
              rows={1}
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Comma or newline separated · optional name after a dash
            </p>
          </div>
          <Button
            className="h-9 shrink-0 gap-1.5"
            onClick={doAddCenters}
            disabled={addingCenters || !centersText.trim()}
          >
            {addingCenters ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Add
          </Button>
        </div>
      ) : null}

      {/* Roster table */}
      <div className="mt-5 overflow-hidden rounded-lg border bg-card">
        {centers.length === 0 ? (
          <EmptyState
            title="No centers yet"
            hint={isAdmin ? 'Add center codes above to build the roster.' : 'An administrator manages the center roster.'}
            className="border-0"
          />
        ) : (
          <div className="max-h-[560px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead className="w-20">Code</TableHead>
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
                    <TableCell className={cn('text-center font-semibold tabular-nums', medalText.gold)}>{row.gold}</TableCell>
                    <TableCell className="text-center font-semibold tabular-nums">{row.silver}</TableCell>
                    <TableCell className={cn('text-center font-semibold tabular-nums', medalText.bronze)}>{row.bronze}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{row.total}</TableCell>
                    {isAdmin ? (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
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
      </div>

      {/* Remove center confirm */}
      <AlertDialog open={removeTarget !== null} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove center {removeTarget?.centerCode}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget && removeTarget.gold + removeTarget.silver + removeTarget.bronze > 0
                ? `This center holds ${removeTarget.gold} first, ${removeTarget.silver} second and ${removeTarget.bronze} third places worth ${removeTarget.total} points. Removing it clears those places from the standings.`
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
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
