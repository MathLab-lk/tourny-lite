'use client'

import { useMemo, useState } from 'react'
import { Loader2, Save, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import { EmptyState, PageHeader } from '@/components/tournament/ui-bits'
import { WhatsAppCard } from '@/components/tournament/manage/whatsapp-card'
import { useAppStore } from '@/store/app-store'
import { renderStudentCode, validateIdPattern } from '@/lib/student-math'
import { cn } from '@/lib/utils'
import type { TournamentDetailDTO } from '@/lib/types'

const STATUSES = ['active', 'completed', 'archived'] as const

/**
 * Settings — tournament details, scoring points and lifecycle status.
 * Admin only; mounted per tournament via key.
 */
export function SettingsView() {
  const { toast } = useToast()
  const detail = useAppStore((s) => s.detail)
  const loading = useAppStore((s) => s.loadingDetail)
  const session = useAppStore((s) => s.session)
  const isAdmin = session?.role === 'admin'
  const updateTournament = useAppStore((s) => s.updateTournament)
  const activeId = useAppStore((s) => s.activeTournamentId)

  if (loading && !detail) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 pt-6 sm:px-6">
        <div className="h-8 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-6 h-64 animate-pulse rounded-lg bg-muted" />
      </div>
    )
  }

  if (!detail || !isAdmin) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 pt-10 sm:px-6">
        <EmptyState
          title={detail ? 'Administrator access required' : 'No tournament selected'}
          hint={detail ? 'Ask an administrator to adjust tournament settings.' : 'Choose a tournament to get started.'}
        />
      </div>
    )
  }

  return (
    <SettingsForm
      key={detail.tournament.id}
      tournament={detail.tournament}
      activeId={activeId}
      updateTournament={updateTournament}
      onToast={toast}
    />
  )
}

function SettingsForm({
  tournament,
  activeId,
  updateTournament,
  onToast,
}: {
  tournament: TournamentDetailDTO['tournament']
  activeId: string | null
  updateTournament: (id: string, patch: Record<string, unknown>) => Promise<boolean>
  onToast: ReturnType<typeof useToast>['toast']
}) {
  const [nameDraft, setNameDraft] = useState(tournament.name)
  const [organizerDraft, setOrganizerDraft] = useState(tournament.organizer)
  const [pointsDraft, setPointsDraft] = useState({
    first: tournament.pointsFirst,
    second: tournament.pointsSecond,
    third: tournament.pointsThird,
  })
  const [patternDraft, setPatternDraft] = useState(tournament.studentIdPattern)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingStatus, setSettingStatus] = useState(false)

  const patternError = useMemo(() => validateIdPattern(patternDraft), [patternDraft])
  const patternPreview = useMemo(
    () =>
      patternError
        ? null
        : renderStudentCode(patternDraft, {
            name: 'Kasun Perera',
            centerCode: '402',
            grade: '8',
            index: 7,
          }),
    [patternDraft, patternError]
  )

  const saveSettings = async () => {
    if (!activeId) return
    setSavingSettings(true)
    const ok = await updateTournament(activeId, {
      name: nameDraft,
      organizer: organizerDraft,
      pointsFirst: pointsDraft.first,
      pointsSecond: pointsDraft.second,
      pointsThird: pointsDraft.third,
      ...(patternDraft.trim() !== tournament.studentIdPattern ? { studentIdPattern: patternDraft.trim() } : {}),
    })
    setSavingSettings(false)
    onToast(ok ? { title: 'Settings saved' } : { title: 'Could not save the settings', variant: 'destructive' })
  }

  const setStatus = async (status: string) => {
    if (!activeId) return
    setSettingStatus(true)
    const ok = await updateTournament(activeId, { status })
    setSettingStatus(false)
    onToast(ok ? { title: `Marked ${status}` } : { title: 'Update failed', variant: 'destructive' })
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6">
      <PageHeader title="Settings" meta={tournament.name} />

      <div className="mt-5 space-y-4">
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="set-name">Name</Label>
                <Input id="set-name" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="set-organizer">Organizer</Label>
                <Input id="set-organizer" value={organizerDraft} onChange={(e) => setOrganizerDraft(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-muted-foreground">Podium points</Label>
              <div className="mt-2 grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="set-p1" className="text-xs text-muted-foreground">1st place</Label>
                  <Input
                    id="set-p1"
                    type="number"
                    min={0}
                    value={pointsDraft.first}
                    onChange={(e) => setPointsDraft((p) => ({ ...p, first: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="set-p2" className="text-xs text-muted-foreground">2nd place</Label>
                  <Input
                    id="set-p2"
                    type="number"
                    min={0}
                    value={pointsDraft.second}
                    onChange={(e) => setPointsDraft((p) => ({ ...p, second: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="set-p3" className="text-xs text-muted-foreground">3rd place</Label>
                  <Input
                    id="set-p3"
                    type="number"
                    min={0}
                    value={pointsDraft.third}
                    onChange={(e) => setPointsDraft((p) => ({ ...p, third: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <p className={cn('mt-2 text-xs text-muted-foreground')}>
                Changing points recalculates all standings immediately.
              </p>
            </div>
            <Button
              className="gap-1.5"
              onClick={saveSettings}
              disabled={savingSettings || Boolean(patternError)}
            >
              {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
              Save changes
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold">Student IDs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="set-id-pattern">ID pattern</Label>
              <Input
                id="set-id-pattern"
                value={patternDraft}
                onChange={(e) => setPatternDraft(e.target.value)}
                className={cn('font-mono', patternError && 'border-destructive focus-visible:ring-destructive/30')}
                aria-invalid={Boolean(patternError)}
                aria-describedby="set-id-pattern-help"
              />
              <p id="set-id-pattern-help" className="text-xs text-muted-foreground">
                Composes the ID issued to every student at registration. Tokens:{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{'{center}'}</code> (center code){' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{'{grade}'}</code>{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{'{index}'}</code> (roll number, zero-padded — width via {'{index3}'}){' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{'{initials}'}</code>{' '}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{'{year}'}</code>. Any other text is copied literally.
              </p>
            </div>
            {patternError ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {patternError}
              </p>
            ) : (
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
                Preview — the 7th grade-8 student of center 402 registers as{' '}
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums">
                  {patternPreview}
                </span>
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              The {'{index}'} roll number counts within the other tokens present — with {'{center}-{grade}-{index}'}
              it numbers each center-and-grade class separately. Already-issued IDs never change; the pattern only
              affects registrations from now on. Set the pattern <span className="font-medium">before</span> the
              registration stage to keep IDs uniform.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-sm font-semibold">Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((st) => (
                <Button
                  key={st}
                  size="sm"
                  variant={tournament.status === st ? 'default' : 'outline'}
                  className="capitalize"
                  disabled={settingStatus}
                  onClick={() => {
                    if (tournament.status !== st) void setStatus(st)
                  }}
                >
                  {st}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* WhatsApp sharing — an app-level connection, not a
            per-tournament setting, but administered from here. */}
        <WhatsAppCard />
      </div>
    </div>
  )
}
