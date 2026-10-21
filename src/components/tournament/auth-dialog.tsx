'use client'

import { useState } from 'react'
import { Eye, EyeOff, Loader2, LogIn, ShieldCheck, Trophy } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppStore } from '@/store/app-store'

/**
 * Account dialog with two modes:
 *  - First-run setup: creates the administrator account.
 *  - Sign in: email + password for existing accounts.
 */
export function AuthDialog() {
  const open = useAppStore((s) => s.authDialogOpen)
  const setOpen = useAppStore((s) => s.setAuthDialogOpen)
  const setupRequired = useAppStore((s) => s.setupRequired)
  const session = useAppStore((s) => s.session)

  const isSetup = setupRequired && !session

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      // Reset the form whenever the dialog closes (button, overlay or Escape)
      setName('')
      setEmail('')
      setPassword('')
      setConfirm('')
      setError('')
      setBusy(false)
    }
    setOpen(next)
  }

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setError('')

    if (isSetup) {
      if (password !== confirm) {
        setError('The passwords do not match.')
        return
      }
      setBusy(true)
      const out = await useAppStore.getState().completeSetup(name, email, password)
      setBusy(false)
      if (!out.ok) setError(out.error ?? 'Setup failed')
    } else {
      setBusy(true)
      const out = await useAppStore.getState().signIn(email, password)
      setBusy(false)
      if (!out.ok) setError(out.error ?? 'Sign in failed')
    }
  }

  const canSubmit = isSetup
    ? name.trim().length >= 2 && email.trim().length > 3 && password.length >= 8 && password === confirm
    : email.trim().length > 3 && password.length > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="flex justify-center sm:justify-start">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Trophy className="h-6 w-6" aria-hidden />
          </span>
        </div>
        <DialogHeader>
          <DialogTitle className="text-xl">
            {isSetup ? 'Welcome to Tourny Lite' : 'Sign in'}
          </DialogTitle>
          <DialogDescription>
            {isSetup
              ? 'Create the administrator account for your organisation. You will be able to add scorekeeper accounts afterwards.'
              : 'Tournament results are public to view. Sign in with your account to record or manage results.'}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit}>
          {isSetup ? (
            <div className="space-y-1.5">
              <Label htmlFor="auth-name">Your name</Label>
              <Input
                id="auth-name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Anne Fernando"
                required
              />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="auth-email">Email address</Label>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@organisation.org"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="auth-password">Password</Label>
            <div className="relative">
              <Input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isSetup ? 'new-password' : 'current-password'}
                className="pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSetup ? 'At least 8 characters' : 'Your password'}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              </button>
            </div>
          </div>

          {isSetup ? (
            <div className="space-y-1.5">
              <Label htmlFor="auth-confirm">Confirm password</Label>
              <Input
                id="auth-confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full font-semibold" disabled={busy || !canSubmit}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : isSetup ? (
              <ShieldCheck className="h-4 w-4" aria-hidden />
            ) : (
              <LogIn className="h-4 w-4" aria-hidden />
            )}
            {isSetup ? 'Create administrator account' : 'Sign in'}
          </Button>
        </form>

        {!isSetup ? (
          <p className="text-center text-xs text-muted-foreground">
            Accounts are issued by your tournament administrator.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
