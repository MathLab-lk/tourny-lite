'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useTheme } from 'next-themes'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ChevronDown,
  ChevronLeft,
  ClipboardCheck,
  History,
  Home,
  LayoutDashboard,
  LogIn,
  LogOut,
  Moon,
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
import {
  easeOutExpo,
  springPop,
  staggerChild,
  staggerParent,
  tournamentStatusMeta,
} from '@/components/tournament/ui-bits'
import { cn } from '@/lib/utils'
import type { TournamentStatus, TournamentSummaryDTO } from '@/lib/types'

/*
 * Application shell — iOS-inspired adaptive navigation:
 *
 *  - Destinations are places, never actions. The scoreboard (a
 *    projector mode) is presented modally and therefore lives
 *    outside this nav entirely.
 *  - Desktop keeps a glass sidebar; phones get a tab bar with the
 *    same destinations, re-grouped by frequency (Apple's own
 *    sidebar ↔ tab bar split).
 *  - "Back" on mobile is a real, labeled back button — no hidden
 *    logo shortcuts.
 *
 * Content stays the hero; chrome stays out of the way.
 */

interface NavItem {
  key: View
  label: string
  icon: typeof Home
}

const PRIMARY_NAV: NavItem[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'scoring', label: 'Scoring', icon: ClipboardCheck },
  { key: 'history', label: 'History', icon: History },
]

const MANAGE_NAV: NavItem[] = [
  { key: 'centers', label: 'Centers', icon: Users },
  { key: 'settings', label: 'Settings', icon: Settings },
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

  const manageItems = MANAGE_NAV.filter((item) => item.key !== 'settings' || isAdmin)

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
      <Sun className="theme-sun hidden h-4 w-4 dark:block" aria-hidden />
      <Moon className="theme-moon block h-4 w-4 dark:hidden" aria-hidden />
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
    <div className="min-h-screen">
      {/* Ambient background — slow aurora + film grain */}
      <div className="aurora print:hidden" aria-hidden>
        <span />
      </div>
      <div className="noise print:hidden" aria-hidden />

      {/* ── Desktop sidebar ─────────────────────────────────────── */}
      <aside className="glass fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r lg:flex print:hidden">
        {/* Brand */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
          <img src="/logo.svg" alt="" className="h-6 w-6 rounded-md" width={24} height={24} />
          <span className="text-shine text-[15px] font-semibold tracking-tight">Tourny&nbsp;Lite</span>
        </div>

        {/* Tournament switcher */}
        <div className="px-3 pt-4">
          <TournamentSwitcher
            tournaments={tournaments}
            activeTournament={activeTournament}
            onSelect={(id) => (id === null ? closeTournament() : void openTournament(id))}
          />
        </div>

        {/* Navigation — unfolds with the tournament, stows away on exit */}
        <AnimatePresence initial={false}>
          {hasTournament ? (
            <motion.div
              key="tourny-nav"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.34, ease: easeOutExpo }}
              className="overflow-hidden"
            >
              <motion.nav
                variants={staggerParent}
                initial="hidden"
                animate="show"
                className="flex flex-col gap-0.5 px-3 pt-4"
                aria-label="Tournament views"
              >
                {PRIMARY_NAV.map((item) => (
                  <SidebarLink
                    key={item.key}
                    item={item}
                    active={view === item.key}
                    onClick={() => setView(item.key)}
                  />
                ))}
              </motion.nav>

              {/* Manage — occasional, admin-leaning work */}
              {manageItems.length > 0 ? (
                <div className="px-3 pt-5">
                  <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Manage
                  </p>
                  <nav className="flex flex-col gap-0.5" aria-label="Manage">
                    {manageItems.map((item) => (
                      <SidebarLink
                        key={item.key}
                        item={item}
                        active={view === item.key}
                        onClick={() => setView(item.key)}
                      />
                    ))}
                  </nav>
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>

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
      <header className="glass-bar sticky top-0 z-40 flex h-14 items-center gap-1 border-b px-3 lg:hidden print:hidden">
        <AnimatePresence initial={false} mode="popLayout">
          {hasTournament ? (
            <motion.button
              key="back"
              type="button"
              onClick={closeTournament}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }}
              transition={springPop}
              whileTap={{ scale: 0.96 }}
              className="-ml-1 flex h-10 shrink-0 items-center gap-0.5 rounded-lg pl-1.5 pr-2 text-[15px] text-primary"
              aria-label="Back to tournaments"
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
              <span className="font-medium">Tournaments</span>
            </motion.button>
          ) : (
            <motion.img
              key="logo"
              src="/logo.svg"
              alt=""
              width={24}
              height={24}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={springPop}
              className="ml-1 h-6 w-6 shrink-0 rounded-md"
            />
          )}
        </AnimatePresence>
        <span className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold tracking-tight">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={hasTournament ? (activeTournament?.name ?? '') : 'Tourny Lite'}
              initial={{ opacity: 0, y: 7 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -7 }}
              transition={{ duration: 0.18, ease: easeOutExpo }}
              className="block"
            >
              {hasTournament ? (activeTournament?.name ?? '') : 'Tourny Lite'}
            </motion.span>
          </AnimatePresence>
        </span>
        {hasTournament ? <SyncStatus compact /> : null}
        {themeToggle}
        {session ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary"
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
            className="h-8 shrink-0 px-3 text-[13px]"
            onClick={() => setAuthDialogOpen(true)}
          >
            Sign in
          </Button>
        )}
      </header>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="relative z-10 lg:pl-60">
        <main className="pb-24 lg:pb-10">
          {/* Views crossfade: the outgoing page lifts away before the
              next one rises in — no hard cuts anywhere in the app. */}
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16, ease: easeOutExpo }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* ── Mobile tab bar ───────────────────────────────────────── */}
      <nav
        className="glass-bar fixed inset-x-0 bottom-0 z-40 flex border-t pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
        aria-label="Primary"
      >
        <TabLink icon={Home} label="Home" active={view === 'home'} onClick={() => go('home')} />
        {/* Tabs slide in beside Home when a tournament opens, and
            fold away cleanly when it closes. */}
        <AnimatePresence initial={false} mode="popLayout">
          {hasTournament ? (
            <TabLink
              key="overview"
              icon={LayoutDashboard}
              label="Overview"
              active={view === 'overview'}
              onClick={() => go('overview')}
            />
          ) : null}
          {hasTournament ? (
            <TabLink
              key="scoring"
              icon={ClipboardCheck}
              label="Scoring"
              active={view === 'scoring'}
              onClick={() => go('scoring')}
            />
          ) : null}
        </AnimatePresence>
        <TabLink icon={Ellipsis} label="More" active={moreOpen} onClick={() => setMoreOpen(true)} />
      </nav>

      {/* ── More sheet (mobile) ─────────────────────────────────── */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2"
        >
          <div className="mx-auto mb-1 h-1.5 w-10 rounded-full bg-muted-foreground/40" aria-hidden />
          <SheetHeader className="px-2 text-left">
            <SheetTitle className="text-sm">More</SheetTitle>
          </SheetHeader>
          <motion.div
            variants={staggerParent}
            initial="hidden"
            animate="show"
            className="mt-1 grid gap-0.5"
          >
            {hasTournament ? (
              <>
                <SheetLink icon={History} label="History" onClick={() => go('history')} />
                <SheetLink icon={Users} label="Centers" onClick={() => go('centers')} />
                {isAdmin ? <SheetLink icon={Settings} label="Settings" onClick={() => go('settings')} /> : null}
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
          </motion.div>
          <Button
            variant="outline"
            className="mt-2 h-11 w-full text-[15px] font-semibold"
            onClick={() => setMoreOpen(false)}
          >
            Cancel
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  )
}

/* ── Pieces ────────────────────────────────────────────────────── */

const navSpring = { type: 'spring' as const, stiffness: 480, damping: 38 }

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
    <motion.button
      type="button"
      variants={staggerChild}
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors',
        active
          ? 'text-accent-foreground'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      {active ? (
        <motion.span
          layoutId="sidebar-nav-pill"
          transition={navSpring}
          className="absolute inset-0 rounded-md bg-accent shadow-xs"
          aria-hidden
        />
      ) : null}
      <Icon className="relative z-10 h-4 w-4 shrink-0" aria-hidden />
      <span className="relative z-10 truncate">{item.label}</span>
    </motion.button>
  )
}

/** iOS-style tab: color emphasis + a gentle icon bounce on
 *  activation. Lays out, so tabs glide aside as siblings appear
 *  or leave the bar. */
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
    <motion.button
      type="button"
      layout
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.55 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.55 }}
      transition={springPop}
      whileTap={{ scale: 0.9 }}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 py-1 text-[10px] font-medium transition-colors',
        active ? 'text-primary' : 'text-muted-foreground/70'
      )}
    >
      <motion.span
        animate={active ? { scale: [1, 1.18, 1] } : { scale: 1 }}
        transition={{ duration: 0.42, ease: [0.34, 1.56, 0.64, 1] }}
        className="flex"
      >
        <Icon className="h-[22px] w-[22px]" aria-hidden />
      </motion.span>
      {label}
    </motion.button>
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
    <motion.button
      type="button"
      variants={staggerChild}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-[15px] font-medium transition-colors hover:bg-muted/60',
        destructive ? 'text-destructive' : 'text-foreground'
      )}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden />
      {label}
    </motion.button>
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

/** Live / offline / pending-sync indicator. Shows nothing when all is well.
 *  State changes pop in and out — never a hard swap. */
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

  const pill = (key: string, content: ReactNode, className: string, onClick?: () => void) => (
    <motion.span
      key={key}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={springPop}
      className={className}
      {...(onClick
        ? {
            onClick,
            role: 'button',
            tabIndex: 0,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') onClick()
            },
          }
        : {})}
    >
      {content}
    </motion.span>
  )

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {!online
        ? pill(
            'offline',
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />
              Offline
            </>,
            'flex shrink-0 items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1 text-[11px] font-medium text-destructive'
          )
        : queueCount > 0
          ? pill(
              'pending',
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
                {queueCount} pending
              </>,
              'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-amber-600/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-400',
              () => void flushQueue()
            )
          : compact
            ? null
            : pill(
                'live',
                <>
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      sseConnected ? 'bg-emerald-600 animate-pulse dark:bg-emerald-500' : 'bg-amber-500'
                    )}
                    aria-hidden
                  />
                  {sseConnected ? 'Live' : 'Reconnecting…'}
                </>,
                'mx-3 mb-2 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground'
              )}
    </AnimatePresence>
  )
}
