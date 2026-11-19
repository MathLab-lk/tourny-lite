'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  Copy,
  Loader2,
  LogOut,
  MessageCircle,
  Play,
  PlugZap,
  Plus,
  QrCode,
  RotateCw,
  Save,
  Square,
  X,
  Zap,
} from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/store/app-store'
import { copyText, cn } from '@/lib/utils'

/*
 * WhatsApp sharing — the admin side of the WAHA integration.
 *
 * One flowing setup: enter the server + credentials (API key, or a
 * username & password, or both), connect, pick the WhatsApp session
 * and the destination group, save. The card doubles as the session
 * console: QR pairing, start/stop/restart/logout and the connected
 * account identity all live here, so a dropped connection is fixed
 * without opening the WAHA dashboard. A "Send test message" probe
 * and the Share actions across the app (standings on the Overview,
 * podiums in the event dialog) use the saved connection.
 */

interface PublicConfig {
  configured: boolean
  baseUrl: string
  session: string
  groupChatId: string
  groupName: string
  autoEvents: boolean
  apiKeySet: boolean
  apiKeyHint: string
  username: string
  passwordSet: boolean
  publicBaseUrl: string
}

interface SessionOption {
  name: string
  status: string
}

interface GroupOption {
  id: string
  name: string
}

interface MeInfo {
  id: string
  pushName: string
}

const SESSION_STATUS: Record<string, { label: string; dot: string }> = {
  WORKING: { label: 'Connected', dot: 'bg-emerald-600 dark:bg-emerald-500' },
  STARTING: { label: 'Starting', dot: 'bg-amber-500' },
  SCAN_QR_CODE: { label: 'Needs QR scan', dot: 'bg-amber-500' },
  PASSKEY_REQUIRED: { label: 'Needs phone approval', dot: 'bg-amber-500' },
  PASSKEY_CONFIRMATION_REQUIRED: { label: 'Awaiting confirmation', dot: 'bg-amber-500' },
  FAILED: { label: 'Failed', dot: 'bg-red-500' },
  STOPPED: { label: 'Stopped', dot: 'bg-muted-foreground/40' },
}

function sessionMeta(status: string) {
  return SESSION_STATUS[status] ?? { label: status.replace(/_/g, ' ').toLowerCase(), dot: 'bg-muted-foreground/40' }
}

/** `94771234567@c.us` → `+94771234567` for the identity line. */
function accountLabel(me: MeInfo): string {
  const number = me.id.replace(/@(c\.us|lid)$/, '')
  return `${number.startsWith('+') ? '' : '+'}${number}${me.pushName ? ` · ${me.pushName}` : ''}`
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`)
  return body
}

/** What the QR panel needs from one pairing poll. */
interface QrPollResult {
  ok: boolean
  session?: SessionOption
  qr?: string | null
}

/** The verify endpoint's payload, as the card consumes it. */
interface VerifyResponse {
  ok: boolean
  sessions?: SessionOption[]
  session?: SessionOption
  groups?: GroupOption[]
  me?: MeInfo | null
}

interface VerifyResult {
  ok: boolean
  status: string | null
  sessions: SessionOption[]
  groups: GroupOption[]
}

export function WhatsAppCard() {
  const { toast } = useToast()
  const sendWhatsApp = useAppStore((s) => s.sendWhatsApp)
  const activeTournamentId = useAppStore((s) => s.activeTournamentId)

  const [saved, setSaved] = useState<PublicConfig | null>(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [session, setSession] = useState('')
  const [groupChatId, setGroupChatId] = useState('')
  const [publicBaseUrl, setPublicBaseUrl] = useState('')
  const [copiedLink, setCopiedLink] = useState(false)

  const [sessions, setSessions] = useState<SessionOption[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [sessionStatus, setSessionStatus] = useState<string | null>(null)
  const [me, setMe] = useState<MeInfo | null>(null)
  const [busy, setBusy] = useState<'connect' | 'save' | 'test' | 'start' | 'restart' | 'stop' | 'logout' | 'create' | null>(null)
  const [loaded, setLoaded] = useState(false)

  // The pairing panel: `pairing` names the session whose QR is shown.
  const [pairing, setPairing] = useState<string | null>(null)
  const [qrImage, setQrImage] = useState<string | null>(null)
  const [showNewSession, setShowNewSession] = useState(false)
  const [newSessionName, setNewSessionName] = useState('tourny')
  const [confirmAction, setConfirmAction] = useState<'stop' | 'logout' | null>(null)

  const groupNameOf = useCallback(
    (id: string) => groups.find((g) => g.id === id)?.name ?? saved?.groupName ?? '',
    [groups, saved]
  )

  // Latest credentials for the polling interval — a ref so the
  // interval never restarts mid-pairing when the inputs change.
  // (Synced in an effect, per react-hooks/refs — declared before the
  // polling effect so the refs are fresh when it first fires.)
  const credsRef = useRef({ baseUrl: '', apiKey: '', username: '', password: '' })
  useEffect(() => {
    credsRef.current = { baseUrl, apiKey, username, password }
  }, [baseUrl, apiKey, username, password])

  /** Merges one session's fresh state into the local list. */
  const applySession = useCallback((next: SessionOption) => {
    setSessionStatus(next.status)
    setSessions((list) => {
      const i = list.findIndex((s) => s.name === next.name)
      if (i === -1) return [...list, next].sort((a, b) => a.name.localeCompare(b.name))
      const copy = [...list]
      copy[i] = next
      return copy
    })
  }, [])

  // ── verify against the WAHA server ─────────────────────────
  // Returns what it also applied to the state, so callers can act
  // on the fresh values without stale-closure traps.
  const verify = useCallback(
    async (opts: { session?: string; refresh?: boolean }): Promise<VerifyResult> => {
      const res = await jsonFetch<VerifyResponse>('/api/whatsapp/verify', {
        method: 'POST',
        body: JSON.stringify({
          baseUrl,
          apiKey,
          username,
          password,
          session: opts.session ?? undefined,
          refresh: opts.refresh === true,
        }),
      })
      if (res.sessions) setSessions(res.sessions)
      if (res.groups) setGroups(res.groups)
      setSessionStatus(res.session?.status ?? null)
      setMe(res.me ?? null)
      return {
        ok: Boolean(res.ok),
        status: res.session?.status ?? null,
        sessions: res.sessions ?? [],
        groups: res.groups ?? [],
      }
    },
    [baseUrl, apiKey, username, password]
  )

  const verifyRef = useRef(verify)
  const toastRef = useRef(toast)
  useEffect(() => {
    verifyRef.current = verify
    toastRef.current = toast
  }, [verify, toast])

  // Load the stored connection once; if it was configured before,
  // immediately re-verify (using the stored credentials) so the card
  // opens with a live session status and a populated group list.
  // NOTE: this posts the just-loaded config values directly — the
  // `verify` callback would close over the empty first-render state.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const cfg = await jsonFetch<PublicConfig>('/api/whatsapp/config')
        if (cancelled) return
        setSaved(cfg)
        setBaseUrl(cfg.baseUrl)
        setUsername(cfg.username)
        setSession(cfg.session)
        setGroupChatId(cfg.groupChatId)
        setPublicBaseUrl(cfg.publicBaseUrl)
        setLoaded(true)
        if (cfg.configured && cfg.baseUrl) {
          setBusy('connect')
          try {
            const res = await jsonFetch<{
              ok: boolean
              sessions?: SessionOption[]
              session?: SessionOption
              groups?: GroupOption[]
              me?: MeInfo | null
            }>('/api/whatsapp/verify', {
              method: 'POST',
              body: JSON.stringify({ baseUrl: cfg.baseUrl, session: cfg.session }),
            })
            if (cancelled) return
            if (res.sessions) setSessions(res.sessions)
            if (res.groups) setGroups(res.groups)
            setSessionStatus(res.session?.status ?? null)
            setMe(res.me ?? null)
            // A saved session that lost its pairing opens the panel
            // right away — that drop is the one thing to fix fast.
            if (res.session?.status === 'SCAN_QR_CODE') setPairing(res.session.name)
          } catch {
            // The stored status still shows; the admin can reconnect.
          }
          if (!cancelled) setBusy(null)
        }
      } catch {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // ── the pairing poll ─────────────────────────────────────────
  // While the QR panel is open: ask WAHA every 5 s for the session's
  // status plus its current QR. WORKING closes the panel and reloads
  // the groups (the account just came online).
  useEffect(() => {
    if (!pairing) return
    let cancelled = false
    const tick = async () => {
      try {
        const res = await jsonFetch<QrPollResult>('/api/whatsapp/session', {
          method: 'POST',
          body: JSON.stringify({ action: 'qr', session: pairing, ...credsRef.current }),
        })
        if (cancelled) return
        if (res.session) {
          applySession(res.session)
          if (res.session.status === 'WORKING') {
            setPairing(null)
            setQrImage(null)
            toastRef.current({
              title: 'WhatsApp paired',
              description: `Session ${res.session.name} is connected.`,
            })
            void verifyRef.current({ session: res.session.name })
            return
          }
          if (res.session.status === 'FAILED' || res.session.status === 'STOPPED') {
            setPairing(null)
            setQrImage(null)
            toastRef.current({
              title: 'Pairing stopped',
              description:
                res.session.status === 'FAILED'
                  ? 'The session failed — try Restart, then scan again.'
                  : 'The session was stopped.',
              variant: 'destructive',
            })
            return
          }
        }
        setQrImage(res.qr ?? null)
      } catch {
        // A transient poll failure is not worth surfacing — the next
        // tick retries, and the panel explains itself.
      }
    }
    void tick()
    const timer = setInterval(() => void tick(), 5000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [pairing, applySession])

  const hasTypedOrSavedAuth =
    apiKey.trim().length > 0 ||
    username.trim().length > 0 ||
    password.length > 0 ||
    Boolean(saved?.apiKeySet) ||
    Boolean(saved?.passwordSet)
  const canConnect = baseUrl.trim().length > 0 && hasTypedOrSavedAuth

  const connect = async () => {
    setBusy('connect')
    try {
      const res = await verify({})
      if (res.sessions.length === 0) {
        toast({
          title: 'No WhatsApp sessions on this server',
          description: 'Create one below — it starts immediately and waits for its QR scan.',
        })
        setShowNewSession(true)
      }
    } catch (err) {
      toast({
        title: 'Could not connect',
        description: err instanceof Error ? err.message : 'Check the address and credentials.',
        variant: 'destructive',
      })
    }
    setBusy(null)
  }

  const refreshGroups = async () => {
    setBusy('connect')
    try {
      await verify({ session: session || undefined, refresh: true })
      toast({ title: 'Groups refreshed', description: 'Newly joined groups now appear in the list.' })
    } catch (err) {
      toast({
        title: 'Could not refresh the groups',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
    setBusy(null)
  }

  const pickSession = async (name: string) => {
    setSession(name)
    setGroupChatId('')
    setGroups([])
    setSessionStatus(null)
    setMe(null)
    setPairing(null)
    setQrImage(null)
    setBusy('connect')
    try {
      const res = await verify({ session: name })
      // A session that lost its pairing opens the QR panel at once.
      if (res.status === 'SCAN_QR_CODE') setPairing(name)
    } catch (err) {
      toast({
        title: 'Could not load the groups',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
    setBusy(null)
  }

  // ── session console actions ─────────────────────────────────
  const runSessionAction = async (
    action: 'start' | 'restart' | 'stop' | 'logout' | 'create',
    opts?: { name?: string }
  ) => {
    setBusy(action)
    try {
      const res = await jsonFetch<{ ok: boolean; session: SessionOption }>('/api/whatsapp/session', {
        method: 'POST',
        body: JSON.stringify({
          action,
          name: opts?.name,
          session: opts?.name ?? session,
          ...credsRef.current,
        }),
      })
      applySession(res.session)
      if (action === 'create') {
        setSession(res.session.name)
        setGroupChatId('')
        setGroups([])
        setMe(null)
        setShowNewSession(false)
        setPairing(res.session.name)
        toast({
          title: 'Session created',
          description: `"${res.session.name}" is starting — scan its QR code to pair the phone.`,
        })
      } else if (action === 'start' || action === 'restart') {
        setQrImage(null)
        if (res.session.status === 'SCAN_QR_CODE') {
          setPairing(res.session.name)
        } else {
          setPairing(null)
        }
        toast({
          title: action === 'start' ? 'Session started' : 'Session restarting',
          description: sessionMeta(res.session.status).label,
        })
      } else if (action === 'stop') {
        setPairing(null)
        setQrImage(null)
        toast({ title: 'Session stopped', description: 'Pairing survives — Start brings it right back.' })
      } else if (action === 'logout') {
        setPairing(null)
        setQrImage(null)
        setMe(null)
        toast({
          title: 'Device logged out',
          description: 'Start the session and scan the QR code again to reconnect.',
        })
      }
    } catch (err) {
      toast({
        title: 'The session action failed',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
    setBusy(null)
  }

  const save = async () => {
    if (!groupChatId) {
      toast({ title: 'Pick a destination group first', variant: 'destructive' })
      return
    }
    setBusy('save')
    try {
      const cfg = await jsonFetch<PublicConfig>('/api/whatsapp/config', {
        method: 'PUT',
        body: JSON.stringify({
          baseUrl,
          apiKey,
          username,
          password,
          session,
          groupChatId,
          groupName: groupNameOf(groupChatId),
          publicBaseUrl,
        }),
      })
      setSaved(cfg)
      setApiKey('')
      setPassword('')
      toast({ title: 'WhatsApp sharing saved', description: `${cfg.groupName || 'Group'} will receive the results.` })
    } catch (err) {
      toast({
        title: 'Could not save',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
    setBusy(null)
  }

  // Removes the stored key — for a server switched to basic auth,
  // so no stale key keeps riding along on every request.
  const clearApiKey = async () => {
    setBusy('save')
    try {
      const cfg = await jsonFetch<PublicConfig>('/api/whatsapp/config', {
        method: 'PUT',
        body: JSON.stringify({ clearApiKey: true }),
      })
      setSaved(cfg)
      toast({ title: 'Saved API key cleared' })
    } catch (err) {
      toast({
        title: 'Could not clear the key',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
    setBusy(null)
  }

  const sendTest = async () => {
    setBusy('test')
    const out = await sendWhatsApp('test')
    setBusy(null)
    if (out.ok) {
      toast({ title: 'Test message sent', description: `Delivered to ${out.groupName ?? 'the group'} — check WhatsApp.` })
    } else {
      toast({ title: 'Test message failed', description: out.error, variant: 'destructive' })
    }
  }

  // ── auto-share toggle (a partial PATCH — only this field) ────
  const toggleAuto = async (on: boolean) => {
    if (!saved) return
    const before = saved
    setSaved({ ...saved, autoEvents: on }) // optimistic
    try {
      const cfg = await jsonFetch<PublicConfig>('/api/whatsapp/config', {
        method: 'PUT',
        body: JSON.stringify({ autoEvents: on }),
      })
      setSaved(cfg)
    } catch (err) {
      setSaved(before)
      toast({
        title: 'Could not change auto-share',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
  }

  const meta = sessionStatus ? sessionMeta(sessionStatus) : null

  // The guest link for the open tournament — the address shared in
  // every WhatsApp message. Falls back to this browser's address.
  const guestUrl = activeTournamentId
    ? `${(publicBaseUrl || saved?.publicBaseUrl || '').trim() || window.location.origin}/present/${activeTournamentId}`
    : null

  const copyGuestLink = async () => {
    if (!guestUrl) return
    const ok = await copyText(guestUrl)
    if (ok) {
      setCopiedLink(true)
      setTimeout(() => setCopiedLink(false), 2000)
    } else {
      toast({ title: 'Copy failed', description: 'Select the address and copy it manually.', variant: 'destructive' })
    }
  }

  // The group picker's state, in words — never claims "Loading"
  // when nothing is in flight (an empty result is not a load).
  const groupPlaceholder =
    groups.length > 0
      ? 'Choose a group'
      : !session
        ? 'Choose a session first'
        : busy === 'connect'
          ? 'Loading groups…'
          : 'No groups found — join one with the account'

  const sessionSelected = session && sessions.some((s) => s.name === session)

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircle className="h-4 w-4 text-muted-foreground" aria-hidden />
          WhatsApp sharing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Send standings and event podiums to a WhatsApp group through your WAHA server
          (the connected account must be a member of the group). Pairing and session
          repairs happen right here — the WAHA dashboard is not needed.
        </p>

        {/* Connection */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wa-url">WAHA server</Label>
            <Input
              id="wa-url"
              placeholder="https://wa-api.example.app"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              autoComplete="url"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="wa-key">API key</Label>
              {saved?.apiKeySet ? (
                <button
                  type="button"
                  className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => void clearApiKey()}
                  disabled={busy !== null}
                  title="Remove the saved key — for servers that only use basic auth"
                >
                  Clear
                </button>
              ) : null}
            </div>
            <Input
              id="wa-key"
              type="password"
              placeholder={saved?.apiKeySet ? `Saved (${saved.apiKeyHint}) — leave blank to keep` : 'X-Api-Key value'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wa-user">Username</Label>
            <Input
              id="wa-user"
              placeholder="basic auth — optional"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wa-pass">Password</Label>
            <Input
              id="wa-pass"
              type="password"
              placeholder={saved?.passwordSet ? 'Saved — leave blank to keep' : 'basic auth — optional'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>
        <p className="-mt-2 text-[11px] leading-relaxed text-muted-foreground">
          Use the API key, a username + password (basic auth), or both — whatever your WAHA
          server accepts. Clearing the username clears the saved password with it.
        </p>

        {/* Guest links — where shared links should lead */}
        <div className="space-y-1.5">
          <Label htmlFor="wa-public-url">Public address for guest links</Label>
          <Input
            id="wa-public-url"
            placeholder="https://tourny.example.lk"
            value={publicBaseUrl}
            onChange={(e) => setPublicBaseUrl(e.target.value)}
            autoComplete="url"
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Every shared message carries a guest link: event podiums open that event's own live
            page, standings open the full scoreboard. Leave empty to use the address you are
            browsing from; set it when guests reach this server through a different address (a
            domain or a tunnel).
          </p>
        </div>

        {/* Session + group — appear as the connection verifies */}
        {sessions.length > 0 ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="wa-session">WhatsApp session</Label>
                <Select value={session} onValueChange={(v) => void pickSession(v)}>
                  <SelectTrigger id="wa-session" className="w-full">
                    <SelectValue placeholder="Choose a session" />
                  </SelectTrigger>
                  <SelectContent>
                    {sessions.map((s) => (
                      <SelectItem key={s.name} value={s.name}>
                        {s.name} — {sessionMeta(s.status).label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="wa-group">Destination group</Label>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => void refreshGroups()}
                    disabled={busy !== null || !session}
                    title="Re-sync the group list from WhatsApp"
                  >
                    <RotateCw
                      className={cn('h-3 w-3', busy === 'connect' && 'animate-spin')}
                      aria-hidden
                    />
                    Refresh
                  </button>
                </div>
                <Select
                  value={groupChatId}
                  onValueChange={setGroupChatId}
                  disabled={groups.length === 0}
                >
                  <SelectTrigger id="wa-group" className="w-full">
                    <SelectValue placeholder={groupPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {meta ? (
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className={cn('h-2 w-2 rounded-full', meta.dot)} aria-hidden />
                Session {session} — {meta.label}
                {me ? (
                  <span className="text-foreground/80">
                    · broadcasting as <span className="font-medium">{accountLabel(me)}</span>
                  </span>
                ) : null}
              </p>
            ) : null}

            {/* Session console — start / restart / stop / log out */}
            {sessionSelected ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {sessionStatus === 'STOPPED' || sessionStatus === 'FAILED' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => void runSessionAction('start')}
                    disabled={busy !== null}
                  >
                    {busy === 'start' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Play className="h-3.5 w-3.5" aria-hidden />
                    )}
                    Start
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => void runSessionAction('restart')}
                    disabled={busy !== null}
                  >
                    <RotateCw
                      className={cn('h-3.5 w-3.5', busy === 'restart' && 'animate-spin')}
                      aria-hidden
                    />
                    Restart
                  </Button>
                )}
                {sessionStatus !== 'STOPPED' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => setConfirmAction('stop')}
                    disabled={busy !== null}
                  >
                    <Square className="h-3.5 w-3.5" aria-hidden />
                    Stop
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={() => setConfirmAction('logout')}
                  disabled={busy !== null}
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden />
                  Log out
                </Button>
                {sessionStatus === 'SCAN_QR_CODE' && pairing !== session ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => setPairing(session)}
                    disabled={busy !== null}
                  >
                    <QrCode className="h-3.5 w-3.5" aria-hidden />
                    Show QR
                  </Button>
                ) : null}
              </div>
            ) : null}

            {/* Pairing panel — the QR plus its live poll */}
            {pairing ? (
              <div className="space-y-3 rounded-lg border border-dashed p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <QrCode className="h-4 w-4 text-muted-foreground" aria-hidden />
                    Pair “{pairing}”
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      setPairing(null)
                      setQrImage(null)
                    }}
                    aria-label="Close the pairing panel"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
                {qrImage ? (
                  <img
                    src={qrImage}
                    alt={`WhatsApp pairing QR code for session ${pairing}`}
                    className="mx-auto h-52 w-52 rounded-lg border bg-white p-2"
                  />
                ) : (
                  <div className="mx-auto flex h-52 w-52 flex-col items-center justify-center gap-2 rounded-lg border bg-muted/30 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    <p className="px-6 text-center text-xs leading-relaxed">
                      Waiting for a QR code — the session offers one a few seconds after start.
                    </p>
                  </div>
                )}
                <p className="text-xs leading-relaxed text-muted-foreground">
                  On the phone that owns the WhatsApp account:{' '}
                  <span className="font-medium text-foreground">
                    Settings → Linked devices → Link a device
                  </span>
                  , then scan. The code refreshes by itself; this panel closes the moment the
                  session connects.
                </p>
              </div>
            ) : null}
          </>
        ) : null}

        {/* New session — inline create, always available */}
        {showNewSession ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              className="h-8 w-44"
              placeholder="tourny"
              aria-label="New session name"
              autoFocus
            />
            <Button
              size="sm"
              className="h-8 gap-1"
              onClick={() => void runSessionAction('create', { name: newSessionName })}
              disabled={busy !== null || !newSessionName.trim()}
            >
              {busy === 'create' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-4 w-4" aria-hidden />
              )}
              Create &amp; pair
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => setShowNewSession(false)}
              disabled={busy !== null}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => {
              setShowNewSession(true)
              setNewSessionName('tourny')
            }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            New WhatsApp session
          </button>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => void connect()}
            disabled={!canConnect || busy !== null || !loaded}
          >
            {busy === 'connect' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <PlugZap className="h-4 w-4" aria-hidden />
            )}
            {sessions.length > 0 ? 'Reconnect' : 'Connect'}
          </Button>
          <Button
            className="gap-1.5"
            onClick={() => void save()}
            disabled={busy !== null || !groupChatId || !session}
          >
            {busy === 'save' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Save className="h-4 w-4" aria-hidden />
            )}
            Save connection
          </Button>
          {saved?.configured ? (
            <Button
              variant="ghost"
              className="gap-1.5"
              onClick={() => void sendTest()}
              disabled={busy !== null}
            >
              {busy === 'test' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <MessageCircle className="h-4 w-4" aria-hidden />
              )}
              Send test message
            </Button>
          ) : null}
        </div>

        {/* Guest scoreboard link — the address every share carries */}
        {saved?.configured && guestUrl ? (
          <div className="flex items-center gap-2 rounded-lg border p-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Guest scoreboard</p>
              <p className="truncate font-mono text-xs text-muted-foreground" title={guestUrl}>
                {guestUrl}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1.5"
              onClick={() => void copyGuestLink()}
            >
              {copiedLink ? (
                <Check className="h-4 w-4 text-emerald-600" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
              {copiedLink ? 'Copied' : 'Copy'}
            </Button>
          </div>
        ) : null}

        {/* Auto-share — once the connection is saved */}
        {saved?.configured ? (
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div className="space-y-1">
              <Label htmlFor="wa-auto" className="flex items-center gap-1.5 text-sm font-medium">
                <Zap className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                Auto-share new results
              </Label>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Every recorded podium — and any correction — is sent to
                {' '}{saved.groupName || 'the group'} automatically, the moment it is saved.
              </p>
            </div>
            <Switch
              id="wa-auto"
              checked={saved.autoEvents}
              onCheckedChange={(v) => void toggleAuto(v)}
              disabled={busy !== null}
              aria-label="Auto-share new results to the WhatsApp group"
            />
          </div>
        ) : null}

        {saved?.configured ? (
          <p className="text-xs text-muted-foreground">
            {saved.groupName
              ? `Sharing to “${saved.groupName}”. `
              : 'Sharing is configured. '}
            Standings can be shared from the Overview; podiums from any recorded event.
          </p>
        ) : null}
      </CardContent>

      {/* Stop / log-out need one honest confirmation */}
      <AlertDialog open={confirmAction !== null} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'stop' ? 'Stop the WhatsApp session?' : 'Log out the paired device?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'stop'
                ? 'The session goes offline and no messages go out until it is started again. Pairing survives a stop.'
                : 'The WhatsApp account is unpaired from this server. Start the session and scan its QR code again to reconnect.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = confirmAction
                setConfirmAction(null)
                if (action) void runSessionAction(action)
              }}
            >
              {confirmAction === 'stop' ? 'Stop session' : 'Log out'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
