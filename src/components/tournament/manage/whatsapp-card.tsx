'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, MessageCircle, PlugZap, Save, Zap } from 'lucide-react'
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
import { cn } from '@/lib/utils'

/*
 * WhatsApp sharing — the admin side of the WAHA integration.
 *
 * One flowing setup: enter the server + API key, connect, pick the
 * WhatsApp session and the destination group, save. Afterwards a
 * "Send test message" probe and the Share actions across the app
 * (standings on the Overview, podiums in the event dialog) use it.
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
}

interface SessionOption {
  name: string
  status: string
}

interface GroupOption {
  id: string
  name: string
}

const SESSION_STATUS: Record<string, { label: string; dot: string }> = {
  WORKING: { label: 'Connected', dot: 'bg-emerald-600 dark:bg-emerald-500' },
  STARTING: { label: 'Starting', dot: 'bg-amber-500' },
  SCAN_QR_CODE: { label: 'Needs QR scan', dot: 'bg-amber-500' },
  FAILED: { label: 'Failed', dot: 'bg-red-500' },
  STOPPED: { label: 'Stopped', dot: 'bg-muted-foreground/40' },
}

function sessionMeta(status: string) {
  return SESSION_STATUS[status] ?? { label: status.replace(/_/g, ' ').toLowerCase(), dot: 'bg-muted-foreground/40' }
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

export function WhatsAppCard() {
  const { toast } = useToast()
  const sendWhatsApp = useAppStore((s) => s.sendWhatsApp)

  const [saved, setSaved] = useState<PublicConfig | null>(null)
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [session, setSession] = useState('')
  const [groupChatId, setGroupChatId] = useState('')

  const [sessions, setSessions] = useState<SessionOption[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [sessionStatus, setSessionStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState<'connect' | 'save' | 'test' | null>(null)
  const [loaded, setLoaded] = useState(false)

  const groupNameOf = useCallback(
    (id: string) => groups.find((g) => g.id === id)?.name ?? saved?.groupName ?? '',
    [groups, saved]
  )

  // ── verify against the WAHA server ─────────────────────────
  const verify = useCallback(
    async (opts: { session?: string; quiet?: boolean }): Promise<boolean> => {
      const res = await jsonFetch<{
        ok: boolean
        sessions?: SessionOption[]
        session?: SessionOption
        groups?: GroupOption[]
      }>('/api/whatsapp/verify', {
        method: 'POST',
        body: JSON.stringify({ baseUrl, apiKey, session: opts.session ?? undefined }),
      })
      if (res.sessions) setSessions(res.sessions)
      if (res.groups) setGroups(res.groups)
      setSessionStatus(res.session?.status ?? null)
      return Boolean(res.groups)
    },
    [baseUrl, apiKey]
  )

  // Load the stored connection once; if it was configured before,
  // immediately re-verify (using the stored key) so the card opens
  // with a live session status and a populated group list.
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
        setSession(cfg.session)
        setGroupChatId(cfg.groupChatId)
        setLoaded(true)
        if (cfg.configured && cfg.baseUrl) {
          setBusy('connect')
          try {
            const res = await jsonFetch<{
              ok: boolean
              sessions?: SessionOption[]
              session?: SessionOption
              groups?: GroupOption[]
            }>('/api/whatsapp/verify', {
              method: 'POST',
              body: JSON.stringify({ baseUrl: cfg.baseUrl, session: cfg.session }),
            })
            if (cancelled) return
            if (res.sessions) setSessions(res.sessions)
            if (res.groups) setGroups(res.groups)
            setSessionStatus(res.session?.status ?? null)
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

  const canConnect = baseUrl.trim().length > 0 && (apiKey.trim().length > 0 || Boolean(saved?.apiKeySet))

  const connect = async () => {
    setBusy('connect')
    try {
      const hasGroups = await verify({})
      if (!hasGroups && sessions.length === 0) {
        toast({ title: 'No sessions on the server', description: 'Start a WhatsApp session in WAHA first.', variant: 'destructive' })
      }
    } catch (err) {
      toast({
        title: 'Could not connect',
        description: err instanceof Error ? err.message : 'Check the address and API key.',
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
    setBusy('connect')
    try {
      await verify({ session: name })
    } catch (err) {
      toast({
        title: 'Could not load the groups',
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
          session,
          groupChatId,
          groupName: groupNameOf(groupChatId),
        }),
      })
      setSaved(cfg)
      setApiKey('')
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
          (the connected account must be a member of the group).
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
            <Label htmlFor="wa-key">API key</Label>
            <Input
              id="wa-key"
              type="password"
              placeholder={saved?.apiKeySet ? `Saved (${saved.apiKeyHint}) — leave blank to keep` : 'X-Api-Key value'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
          </div>
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
                <Label htmlFor="wa-group">Destination group</Label>
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
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className={cn('h-2 w-2 rounded-full', meta.dot)} aria-hidden />
                Session {session} — {meta.label}
              </p>
            ) : null}
          </>
        ) : null}

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
    </Card>
  )
}
