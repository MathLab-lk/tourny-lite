'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  CloudOff,
  Home,
  LayoutGrid,
  LogIn,
  LogOut,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  Trophy,
  UserRound,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'

const VIEW_TABS = [
  { key: 'judge', label: 'Scoring', icon: Trophy },
  { key: 'scoreboard', label: 'Scoreboard', icon: LayoutGrid },
  { key: 'me', label: 'M&E Console', icon: ShieldCheck },
] as const

export function TopNav() {
  const { theme, setTheme } = useTheme()
  const [queueCount, setQueueCount] = useState(0)

  const view = useAppStore((s) => s.view)
  const tournaments = useAppStore((s) => s.tournaments)
  const activeTournamentId = useAppStore((s) => s.activeTournamentId)
  const detail = useAppStore((s) => s.detail)
  const sseConnected = useAppStore((s) => s.sseConnected)
  const online = useAppStore((s) => s.online)
  const session = useAppStore((s) => s.session)
  const setView = useAppStore((s) => s.setView)
  const openTournament = useAppStore((s) => s.openTournament)
  const closeTournament = useAppStore((s) => s.closeTournament)
  const setAuthDialogOpen = useAppStore((s) => s.setAuthDialogOpen)
  const setTeamDialogOpen = useAppStore((s) => s.setTeamDialogOpen)
  const getQueueCount = useAppStore((s) => s.getQueueCount)
  const flushQueue = useAppStore((s) => s.flushQueue)

  useEffect(() => {
    const update = () => {
      if (activeTournamentId) setQueueCount(getQueueCount(activeTournamentId))
      else setQueueCount(0)
    }
    const t = setTimeout(update, 0)
    window.addEventListener('tourny-queue-changed', update)
    return () => {
      clearTimeout(t)
      window.removeEventListener('tourny-queue-changed', update)
    }
  }, [activeTournamentId, getQueueCount])

  const activeTournament = detail?.tournament

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:gap-3 sm:px-6">
        {/* Brand */}
        <button
          type="button"
          onClick={() => (activeTournamentId ? closeTournament() : setView('home'))}
          className="flex shrink-0 items-center gap-2.5 font-semibold tracking-tight"
          aria-label="Tourny Lite home"
        >
          <img src="/logo.svg" alt="" className="h-7 w-7 rounded-lg" width={28} height={28} />
          <span className="hidden text-[15px] sm:inline">Tourny&nbsp;Lite</span>
        </button>

        {/* Tournament switcher */}
        <div className="ml-1 flex min-w-0 flex-1 items-center gap-2">
          {tournaments.length > 0 ? (
            <Select
              value={activeTournamentId ?? '__home__'}
              onValueChange={(v) => (v === '__home__' ? closeTournament() : void openTournament(v))}
            >
              <SelectTrigger
                className="h-9 max-w-[200px] bg-card text-sm font-medium sm:max-w-[280px]"
                aria-label="Switch tournament"
              >
                <SelectValue placeholder="Select a tournament" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__home__">
                  <span className="flex items-center gap-2">
                    <Home className="h-3.5 w-3.5" aria-hidden /> All tournaments
                  </span>
                </SelectItem>
                {tournaments.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          {activeTournament ? (
            <Badge
              variant="outline"
              className={cn(
                'hidden gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize md:inline-flex',
                activeTournament.status === 'active' && 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                activeTournament.status === 'completed' && 'border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
                (activeTournament.status === 'draft' || activeTournament.status === 'archived') && 'text-muted-foreground'
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', activeTournament.status === 'active' ? 'bg-emerald-500' : 'bg-current')} />
              {activeTournament.status}
            </Badge>
          ) : null}
        </div>

        {/* View tabs */}
        {activeTournamentId ? (
          <nav className="flex items-center gap-0.5 rounded-lg border bg-card p-0.5" aria-label="Tournament views">
            {VIEW_TABS.map((tab) => {
              const Icon = tab.icon
              const active = view === tab.key
              return (
                <Button
                  key={tab.key}
                  variant={active ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setView(tab.key)}
                  className={cn('h-8 gap-1.5 px-2.5 text-[13px] sm:px-3', active && 'font-semibold')}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span className={cn(tab.key === 'me' ? 'hidden xl:inline' : 'hidden lg:inline')}>{tab.label}</span>
                </Button>
              )
            })}
          </nav>
        ) : null}

        {/* Connectivity */}
        <div className="flex items-center gap-1.5">
          {!online ? (
            <span className="flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-1 text-[11px] font-semibold text-destructive">
              <CloudOff className="h-3 w-3" aria-hidden /> Offline
            </span>
          ) : activeTournamentId ? (
            <span
              className={cn(
                'hidden items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold sm:flex',
                sseConnected
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'border-amber-600/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
              )}
              title={sseConnected ? 'Live updates connected' : 'Reconnecting…'}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', sseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500')} />
              {sseConnected ? 'Live' : 'Syncing…'}
            </span>
          ) : null}

          {queueCount > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-amber-600/50 text-[11px] font-semibold text-amber-700 dark:text-amber-400"
              onClick={() => void flushQueue()}
              title={`${queueCount} result(s) saved on this device — sync now`}
            >
              <RefreshCw className="h-3 w-3" aria-hidden />
              {queueCount} pending
            </Button>
          ) : null}

          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle light or dark theme"
          >
            <Sun className="hidden h-4 w-4 dark:block" aria-hidden />
            <Moon className="block h-4 w-4 dark:hidden" aria-hidden />
          </Button>

          {/* Session */}
          {session ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 px-2 font-normal">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {session.name
                      .split(' ')
                      .map((p) => p[0])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join('')
                      .toUpperCase()}
                  </span>
                  <span className="hidden max-w-[120px] truncate text-sm font-medium lg:inline">
                    {session.name}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <p className="truncate font-semibold">{session.name}</p>
                  <p className="truncate text-xs font-normal text-muted-foreground">{session.email}</p>
                  <Badge variant="secondary" className="mt-1.5 bg-primary/10 text-[10px] font-semibold uppercase text-primary">
                    {session.role === 'admin' ? 'Administrator' : 'Scorekeeper'}
                  </Badge>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {session.role === 'admin' ? (
                  <DropdownMenuItem onSelect={() => setTeamDialogOpen(true)}>
                    <Users className="mr-2 h-4 w-4" aria-hidden /> Team &amp; access
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={() => void useAppStore.getState().signOut()}>
                  <LogOut className="mr-2 h-4 w-4" aria-hidden /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button size="sm" className="h-9 gap-1.5 font-semibold" onClick={() => setAuthDialogOpen(true)}>
              <LogIn className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Sign in</span>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
