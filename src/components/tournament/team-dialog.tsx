'use client'

import { useEffect, useState } from 'react'
import { KeyRound, Loader2, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/store/app-store'
import type { AdminUserDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Team management (administrator only): create accounts for
 * coordinators and scorekeepers, reset passwords, change roles,
 * deactivate or remove access.
 */
export function TeamDialog() {
  const { toast } = useToast()
  const open = useAppStore((s) => s.teamDialogOpen)
  const setOpen = useAppStore((s) => s.setTeamDialogOpen)
  const session = useAppStore((s) => s.session)
  const users = useAppStore((s) => s.users)
  const loadUsers = useAppStore((s) => s.loadUsers)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'judge'>('judge')
  const [busy, setBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AdminUserDTO | null>(null)

  useEffect(() => {
    if (open) void loadUsers()
  }, [open, loadUsers])

  const createUser = async () => {
    if (!name.trim() || !email.trim() || password.length < 8) return
    setBusy(true)
    const out = await useAppStore.getState().createUser({ name, email, password, role })
    setBusy(false)
    if (out.ok) {
      toast({ title: 'Account created', description: `${name} can now sign in with the password you set.` })
      setName('')
      setEmail('')
      setPassword('')
      setRole('judge')
    } else {
      toast({ title: 'Could not create the account', description: out.error, variant: 'destructive' })
    }
  }

  const toggleActive = async (user: AdminUserDTO) => {
    const out = await useAppStore.getState().updateUser(user.id, { active: !user.active })
    toast(
      out.ok
        ? { title: user.active ? 'Access suspended' : 'Access restored', description: `${user.name} (${user.email})` }
        : { title: 'Update failed', description: out.error, variant: 'destructive' }
    )
  }

  const changeRole = async (user: AdminUserDTO) => {
    const next = user.role === 'admin' ? 'judge' : 'admin'
    const out = await useAppStore.getState().updateUser(user.id, { role: next })
    toast(
      out.ok
        ? { title: 'Role updated', description: `${user.name} is now ${next === 'admin' ? 'an administrator' : 'a scorekeeper'}.` }
        : { title: 'Update failed', description: out.error, variant: 'destructive' }
    )
  }

  const resetPassword = async (user: AdminUserDTO) => {
    const next = window.prompt(
      `Set a new password for ${user.name} (${user.email}). It must be at least 8 characters.`
    )
    if (!next) return
    if (next.length < 8) {
      toast({ title: 'Password too short', description: 'Use at least 8 characters.', variant: 'destructive' })
      return
    }
    const out = await useAppStore.getState().updateUser(user.id, { password: next })
    toast(
      out.ok
        ? { title: 'Password updated', description: `Share the new password with ${user.name} securely.` }
        : { title: 'Update failed', description: out.error, variant: 'destructive' }
    )
  }

  const doDelete = async () => {
    if (!deleteTarget) return
    const out = await useAppStore.getState().deleteUser(deleteTarget.id)
    setDeleteTarget(null)
    toast(
      out.ok
        ? { title: 'Account removed' }
        : { title: 'Could not remove the account', description: out.error, variant: 'destructive' }
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden /> Team &amp; access
            </DialogTitle>
            <DialogDescription>
              Create accounts for coordinators and scorekeepers. Suspended accounts can no longer
              sign in; recorded results keep the original author&apos;s name.
            </DialogDescription>
          </DialogHeader>

          {/* Create account */}
          <form
            className="grid gap-3 rounded-xl border bg-muted/40 p-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault()
              void createUser()
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="team-name" className="text-xs">Full name</Label>
              <Input id="team-name" className="h-9" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nimal Perera" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-email" className="text-xs">Email address</Label>
              <Input id="team-email" className="h-9" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@organisation.org" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-password" className="text-xs">Temporary password</Label>
              <Input id="team-password" className="h-9" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
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
            <Button
              type="submit"
              className="gap-1.5 font-semibold sm:col-span-2"
              disabled={busy || !name.trim() || !email.trim() || password.length < 8}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
              Create account
            </Button>
          </form>

          {/* Accounts list */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Accounts ({users.length})</h3>
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {users.map((u) => {
                const isSelf = u.id === session?.id
                return (
                  <li key={u.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate font-semibold">
                        {u.name}
                        {isSelf ? <span className="text-xs font-normal text-muted-foreground">(you)</span> : null}
                        {!u.active ? (
                          <Badge variant="secondary" className="text-[10px] font-semibold uppercase">Suspended</Badge>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-[10px] font-semibold uppercase',
                        u.role === 'admin' ? 'bg-primary/10 text-primary' : ''
                      )}
                    >
                      {u.role === 'admin' ? 'Administrator' : 'Scorekeeper'}
                    </Badge>
                    <div className="flex flex-wrap items-center gap-1">
                      <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => void changeRole(u)} disabled={isSelf} title={isSelf ? 'You cannot change your own role' : 'Switch role'}>
                        Role
                      </Button>
                      <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => void resetPassword(u)}>
                        <KeyRound className="h-3 w-3" aria-hidden /> Password
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => void toggleActive(u)}
                        disabled={isSelf}
                      >
                        {u.active ? 'Suspend' : 'Restore'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(u)}
                        disabled={isSelf}
                        aria-label={`Remove account ${u.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>
                  </li>
                )
              })}
              {users.length === 0 ? (
                <li className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
                  No accounts yet.
                </li>
              ) : null}
            </ul>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the account. Results already recorded under this name are
              preserved in the audit trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void doDelete()
              }}
            >
              Remove account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
