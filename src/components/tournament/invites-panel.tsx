'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, Loader2, Plus, Ticket, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { easeOutExpo, springPop } from '@/components/tournament/ui-bits'
import { useAppStore } from '@/store/app-store'
import { cn } from '@/lib/utils'
import type { InviteDTO } from '@/lib/types'

/** ABCDEFGH → ABCD-EFGH, so codes stay readable when shared aloud. */
export function formatInviteCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code
}

function inviteStatus(invite: InviteDTO): { label: string; chip: string } {
  if (invite.usedAt) {
    return {
      label: invite.usedByName ? `Used — ${invite.usedByName}` : 'Used',
      chip: 'bg-muted text-muted-foreground',
    }
  }
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) {
    return { label: 'Expired', chip: 'bg-destructive/10 text-destructive' }
  }
  return { label: 'Available', chip: 'bg-emerald-600/12 text-emerald-700 dark:text-emerald-400' }
}

function expiryLabel(invite: InviteDTO): string | null {
  if (!invite.expiresAt || invite.usedAt) return null
  const ms = new Date(invite.expiresAt).getTime() - Date.now()
  if (ms <= 0) return null
  const days = Math.max(1, Math.ceil(ms / 86400000))
  return `Expires in ${days} day${days === 1 ? '' : 's'}`
}

/**
 * Invitation code management (administrator only): generate
 * single-use codes, copy them out, clean old ones up. The
 * recipient redeems a code from the sign-in dialog and sets up
 * their own account details.
 */
export function InvitesPanel() {
  const { toast } = useToast()
  const invites = useAppStore((s) => s.invites)
  const loading = useAppStore((s) => s.loadingInvites)
  const loadInvites = useAppStore((s) => s.loadInvites)
  const createInvite = useAppStore((s) => s.createInvite)
  const deleteInvite = useAppStore((s) => s.deleteInvite)

  const [role, setRole] = useState<'judge' | 'admin'>('judge')
  const [expiry, setExpiry] = useState('never')
  const [busy, setBusy] = useState(false)
  const [latest, setLatest] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void loadInvites()
  }, [loadInvites])

  const generate = async () => {
    setBusy(true)
    setCopied(false)
    const out = await createInvite({
      role,
      expiresInDays: expiry === 'never' ? undefined : Number(expiry),
    })
    setBusy(false)
    if (out.ok && out.code) {
      setLatest(out.code)
    } else {
      toast({ title: 'Could not generate a code', description: out.error, variant: 'destructive' })
    }
  }

  const copyLatest = async () => {
    if (!latest) return
    try {
      await navigator.clipboard.writeText(formatInviteCode(latest))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: 'Copy failed', description: 'Select the code and copy it manually.', variant: 'destructive' })
    }
  }

  const remove = async (invite: InviteDTO) => {
    const out = await deleteInvite(invite.id)
    if (!out.ok) toast({ title: 'Could not delete the code', description: out.error, variant: 'destructive' })
    if (latest === invite.code) setLatest(null)
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground">
        Anyone with a code creates their own account — no passwords to hand over.
      </p>

      {/* Generate */}
      <div className="grid gap-2 rounded-xl border bg-muted/40 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-muted-foreground">Role</span>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={role === 'judge' ? 'default' : 'outline'}
              className="h-9 flex-1"
              onClick={() => setRole('judge')}
            >
              Scorekeeper
            </Button>
            <Button
              type="button"
              size="sm"
              variant={role === 'admin' ? 'default' : 'outline'}
              className="h-9 flex-1"
              onClick={() => setRole('admin')}
            >
              Administrator
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-muted-foreground">Valid for</span>
          <Select value={expiry} onValueChange={setExpiry}>
            <SelectTrigger className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="never">No expiry</SelectItem>
              <SelectItem value="1">1 day</SelectItem>
              <SelectItem value="7">7 days</SelectItem>
              <SelectItem value="30">30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="button" className="gap-1.5 font-semibold" disabled={busy} onClick={() => void generate()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          Generate
        </Button>
      </div>

      {/* Freshly generated code — the star moment: springs in,
          proud and copyable. */}
      <AnimatePresence initial={false} mode="popLayout">
        {latest ? (
          <motion.div
            key={latest}
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={springPop}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3"
          >
            <Ticket className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="font-mono text-lg font-bold tracking-[0.2em]">{formatInviteCode(latest)}</span>
            <span className="text-xs text-muted-foreground">
              {role === 'admin' ? 'Administrator' : 'Scorekeeper'} · single use
              {expiry === 'never' ? '' : ` · ${expiry} day${expiry === '1' ? '' : 's'}`}
            </span>
            <Button size="sm" variant="outline" className="ml-auto h-8 gap-1.5" onClick={() => void copyLatest()}>
              <motion.span
                key={copied ? 'copied' : 'copy'}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={springPop}
                className="flex"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              </motion.span>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Code list */}
      {loading && invites.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </div>
      ) : invites.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          No codes yet.
        </p>
      ) : (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
          <AnimatePresence initial={false} mode="popLayout">
            {invites.map((invite) => {
              const status = inviteStatus(invite)
              const exp = expiryLabel(invite)
              return (
                <motion.li
                  key={invite.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{
                    duration: 0.26,
                    ease: easeOutExpo,
                    layout: { type: 'spring', stiffness: 320, damping: 34 },
                  }}
                  className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
                >
                <span
                  className={cn(
                    'font-mono text-sm font-semibold tracking-widest',
                    invite.usedAt || (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now())
                      ? 'text-muted-foreground line-through decoration-muted-foreground/40'
                      : ''
                  )}
                >
                  {formatInviteCode(invite.code)}
                </span>
                <Badge
                  variant="secondary"
                  className={cn('text-[10px] font-semibold uppercase', invite.role === 'admin' ? 'bg-primary/10 text-primary' : '')}
                >
                  {invite.role === 'admin' ? 'Administrator' : 'Scorekeeper'}
                </Badge>
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium leading-4', status.chip)}>
                  {status.label}
                </span>
                {exp ? <span className="text-[11px] text-muted-foreground">{exp}</span> : null}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => void remove(invite)}
                  aria-label={`Delete code ${formatInviteCode(invite.code)}`}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}
