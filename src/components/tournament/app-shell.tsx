'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useTheme } from 'next-themes'
import {
  ChevronDown,
  ClipboardCheck,
  History,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  Moon,
  Presentation,
  Settings,
  Users,
  Sun,
  Ellipsis,
  UserRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useAppStore, type View } from '@/store/app-store'
import { tournamentStatusMeta } from '@/components/tournament/ui-bits'
import { cn } from '@/lib/utils'
import type { TournamentStatus, TournamentSummaryDTO } from '@/lib/types'

/*
 * Application shell — a quiet, Linear-style inverted L:
 * desktop sidebar for navigation, mobile top bar + bottom tabs.
 * Chrome stays out of the way; content does the talking.
 */

interface NavItem {
  key: View
  label: string
  icon: typeof Home
}

const TOURNAMENT_NAV: NavItem[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'judge', label: 'Scoring', icon: ClipboardCheck },
  { key: 'scoreboard', label: 'Scoreboard', icon: Presentation },
  { key: 'centers', label: 'Centers', icon: Users },
  { key: 'history', label: 'History', icon: History },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { theme, setTheme } = useTheme()
  const [moreOpen, setMoreOpen] = useState(false)

  const view = useAppStore((s) => s.view)
  const tournaments = useAppStore((s) => s.tournaments)
  const activeTournamentId = useAppStore((s) => s.activeTournamentId)
  const activeTournament = useAppStore((s) => s.detail?.tournament ?? null)
  const session = useAppStore((s) => s.session)
  const isAdmin = session?.role === 'admin'
  const setView = useAppStore((s) => s.setView)
  const openTournament = useAppStore((s) => s.openTournament)
  const closeTournament = useAppStore((s) => s.closeTournament)
  const setAuthDialogOpen = useAppStore((s) => s.setAuthDialogOpen)
  const setTeamDialogOpen = useAppStore((s) => s.setTeamDialogOpen)

  const hasTournament = activeTournamentId !== null

  const navItems: NavItem[] = hasTournament
    ? [
        ...TOURNAMENT_NAV,
        ...(isAdmin ? [{ key: 'settings' as View, label: 'Settings', icon: Settings }] : []),
      ]
    : []

  const go = (next: View) => {
    setView(next)
    setMoreOpen(false)
  }

  const themeToggle = (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-muted-foreground hover:text-foreground"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label="Toggle light or dark theme"
    >
      <Sun className="hidden h-4 w-4 dark:block" aria-hidden />
      <Moon className="block h-4 w-4 dark:hidden" aria-hidden />
    </Button>
  )

  const initials = (name: string) =>
    name
      .split(' ')
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase()

  return (
    <div className="min-h-screen bg-background">
      {/* ── Desktop sidebar ─────────────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-sidebar lg:flex print:hidden">
        {/* Brand */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
          <img src="/logo.svg" alt="" className="h-6 w-6 rounded-md" width={24} height={24} />
          <span className="text-[15px] font-semibold tracking-tight">Tourny&nbsp;Lite</span>
        </div>

        {/* Tournament switcher */}
        <div className="px-3 pt-4">
          <TournamentSwitcher
            tournaments={tournaments}
            activeTournament={activeTournament}
            onSelect={(id) => (id === null ? closeTournament() : void openTournament(id))}
          />
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-0.5 px-3 pt-4" aria-label="Tournament views">
          {navItems.map((item) => (
            <SidebarLink
              key={item.key}
              item={item}
              active={view === item.key}
              onClick={() => setView(item.key)}
            />
          ))}
        </nav>

        <div className="flex-1" />

        {/* Sync status */}
        {hasTournament ? <SyncStatus compact /> : null}

        {/* User */}
        <div className="border-t p-3">
          {session ? (
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-muted/60"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                      {initials(session.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium leading-tight">{session.name}</span>
                      <span className="block text-[11px] leading-tight text-muted-foreground">
                        {session.role === 'admin' ? 'Administrator' : 'Scorekeeper'}
                      </span>
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <UserMenuContent />
              </DropdownMenu>
              {themeToggle}
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 flex-1 gap-1.5 text-[13px]"
                onClick={() => setAuthDialogOpen(true)}
              >
                <LogIn className="h-3.5 w-3.5" aria-hidden /> Sign in
              </Button>
              {themeToggle}
            </div>
          )}
        </div>
      </aside>

      {/* ── Mobile top bar ──────────────────────────────────────── */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur lg:hidden print:hidden">
        <button
          type="button"
          onClick={() => (hasTournament ? closeTournament() : undefined)}
          className="flex shrink-0 items-center gap-2"
          aria-label="Tourny Lite"
        >
          <img src="/logo.svg" alt="" className="h-6 w-6 rounded-md" width={24} height={24} />
        </button>
        <span className="min-w-0 flex-1 truncate text-center text-sm font-medium">
          {activeTournament?.name ?? 'Tourny Lite'}
        </span>
        {hasTournament ? <SyncStatus compact /> : null}
        {themeToggle}
        {session ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary"
                aria-label="Account"
              >
                {initials(session.name)}
              </button>
            </DropdownMenuTrigger>
            <UserMenuContent />
          </DropdownMenu>
        ) : (
          <Button
            size="sm"
            className="h-8 px-3 text-[13px]"
            onClick={() => setAuthDialogOpen(true)}
          >
            Sign in
          </Button>
        )}
      </header>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="lg:pl-60">
        <main className="pb-24 lg:pb-10">{children}</main>
      </div>

      {/* ── Mobile bottom tabs ──────────────────────────────────── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden"
        aria-label="Primary"
      >
        <TabLink icon={Home} label="Home" active={view === 'home'} onClick={() => go('home')} />
        {hasTournament ? (
          <>
            <TabLink icon={LayoutDashboard} label="Overview" active={view === 'overview'} onClick={() => go('overview')} />
            <TabLink icon={ClipboardCheck} label="Scoring" active={view === 'judge'} onClick={() => go('judge')} />
            <TabLink icon={Presentation} label="Board" active={view === 'scoreboard'} onClick={() => go('scoreboard')} />
          </>
        ) : null}
        <TabLink icon={Ellipsis} label="More" active={false} onClick={() => setMoreOpen(true)} />
      </nav>

      {/* ── More sheet (mobile) ─────────────────────────────────── */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl px-3 pb-4 pt-2">
          <SheetHeader className="px-2 text-left">
            <SheetTitle className="text-sm">Browse</SheetTitle>
          </SheetHeader>
          <div className="mt-1 grid gap-0.5">
            {hasTournament ? (
              <>
                {TOURNAMENT_NAV.filter((n) => !['overview', 'judge', 'scoreboard'].includes(n.key)).map(
                  (item) => (
                    <SheetLink
                      key={item.key}
                      icon={item.icon}
                      label={item.label}
                      onClick={() => go(item.key)}
                    />
                  )
                )}
                {isAdmin ? (
                  <SheetLink icon={Settings} label="Settings" onClick={() => go('settings')} />
                ) : null}
              </>
            ) : null}
            {isAdmin ? (
              <SheetLink
                icon={UserRound}
                label="Team & access"
                onClick={() => {
                  setMoreOpen(false)
                  setTeamDialogOpen(true)
                }}
              />
            ) : null}
            <div className="my-1.5 border-t" />
            {session ? (
              <SheetLink
                icon={LogOut}
                label="Sign out"
                destructive
                onClick={() => {
                  setMoreOpen(false)
                  void useAppStore.getState().signOut()
                }}
              />
            ) : (
              <SheetLink
                icon={LogIn}
                label="Sign in"
                onClick={() => {
                  setMoreOpen(false)
                  setAuthDialogOpen(true)
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

/* ── Pieces ────────────────────────────────────────────────────── */

function SidebarLink({
  item,
  active,
  onClick,
}: {
  item: NavItem
  active: boolean
  onClick: () => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">{item.label}</span>
    </button>
  )
}

function TabLink({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Home
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-1 text-[10px] font-medium transition-colors',
        active ? 'text-foreground' : 'text-muted-foreground/80'
      )}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
      {label}
    </button>
  )
}

function SheetLink({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: typeof Home
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-[15px] font-medium transition-colors hover:bg-muted/60',
        destructive ? 'text-destructive' : 'text-foreground'
      )}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
      {label}
    </button>
  )
}

function UserMenuContent() {
  const session = useAppStore((s) => s.session)
  if (!session) return null
  return (
    <DropdownMenuContent align="start" side="top" className="w-56">
      <DropdownMenuLabel>
        <p className="truncate text-[13px] font-semibold">{session.name}</p>
        <p className="truncate text-xs font-normal text-muted-foreground">{session.email}</p>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      {session.role === 'admin' ? (
        <DropdownMenuItem onSelect={() => useAppStore.getState().setTeamDialogOpen(true)}>
          <UserRound className="mr-2 h-4 w-4" aria-hidden /> Team &amp; access
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem onSelect={() => void useAppStore.getState().signOut()}>
        <LogOut className="mr-2 h-4 w-4" aria-hidden /> Sign out
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}

/** Tournament picker — compact, status-dotted, no jargon. */
function TournamentSwitcher({
  tournaments,
  activeTournament,
  onSelect,
}: {
  tournaments: TournamentSummaryDTO[]
  activeTournament: { name: string; status: TournamentStatus } | null
  onSelect: (id: string | null) => void
}) {
  const status = activeTournament ? tournamentStatusMeta(activeTournament.status) : null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md border bg-card px-2.5 py-2 text-left transition-colors hover:bg-muted/50"
          aria-label="Switch tournament"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Tournament
            </span>
            <span className="flex items-center gap-1.5">
              {status && activeTournament?.status === 'active' ? (
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', status.dot)} aria-hidden />
              ) : null}
              <span className="truncate text-[13px] font-medium">
                {activeTournament?.name ?? 'All tournaments'}
              </span>
            </span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem onSelect={() => onSelect(null)}>
          <Home className="mr-2 h-4 w-4" aria-hidden /> All tournaments
        </DropdownMenuItem>
        {tournaments.length > 0 ? <DropdownMenuSeparator /> : null}
        {tournaments.map((t) => {
          const meta = tournamentStatusMeta(t.status)
          return (
            <DropdownMenuItem key={t.id} onSelect={() => onSelect(t.id)}>
              <span className={cn('mr-2 h-1.5 w-1.5 shrink-0 rounded-full', meta.dot)} aria-hidden />
              <span className="truncate">{t.name}</span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Live / offline / pending-sync indicator. Shows nothing when all is well. */
function SyncStatus({ compact }: { compact?: boolean }) {
  const [queueCount, setQueueCount] = useState(0)
  const online = useAppStore((s) => s.online)
  const sseConnected = useAppStore((s) => s.sseConnected)
  const activeId = useAppStore((s) => s.activeTournamentId)
  const getQueueCount = useAppStore((s) => s.getQueueCount)
  const flushQueue = useAppStore((s) => s.flushQueue)

  useEffect(() => {
    const update = () => setQueueCount(activeId ? getQueueCount(activeId) : 0)
    const t = setTimeout(update, 0)
    window.addEventListener('tourny-queue-changed', update)
    return () => {
      clearTimeout(t)
      window.removeEventListener('tourny-queue-changed', update)
    }
  }, [activeId, getQueueCount])

  if (!online) {
    return (
      <span className="mx-3 mb-2 flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive">
        <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />
        Offline — saved locally
      </span>
    )
  }
  if (queueCount > 0) {
    return (
      <button
        type="button"
        onClick={() => void flushQueue()}
        className="mx-3 mb-2 flex items-center gap-1.5 rounded-md border border-amber-600/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
        {queueCount} pending — sync
      </button>
    )
  }
  if (compact) return null
  return (
    <span className="mx-3 mb-2 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          sseConnected ? 'bg-emerald-600 animate-pulse dark:bg-emerald-500' : 'bg-amber-500'
        )}
        aria-hidden
      />
      {sseConnected ? 'Live' : 'Reconnecting…'}
    </span>
  )
}
