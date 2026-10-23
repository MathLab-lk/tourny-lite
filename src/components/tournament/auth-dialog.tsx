'use client'

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Eye, EyeOff, Loader2, LogIn, ShieldCheck, Ticket } from 'lucide-react'
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
import { easeOutExpo, springSoft } from '@/components/tournament/ui-bits'
import { useAppStore } from '@/store/app-store'

type Mode = 'signin' | 'redeem'

/**
 * Account dialog with three modes:
 *  - First-run setup: creates the administrator account.
 *  - Sign in: email + password for existing accounts.
 *  - Join: redeem an invitation code and set your own details.
 */
export function AuthDialog() {
  const open = useAppStore((s) => s.authDialogOpen)
  const setOpen = useAppStore((s) => s.setAuthDialogOpen)
  const setupRequired = useAppStore((s) => s.setupRequired)
  const session = useAppStore((s) => s.session)

  const isSetup = setupRequired && !session
  const [mode, setMode] = useState<Mode>('signin')

  const [code, setCode] = useState('')
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
      setMode('signin')
      setCode('')
      setName('')
      setEmail('')
      setPassword('')
      setConfirm('')
      setError('')
      setBusy(false)
    }
    setOpen(next)
  }

  const needsConfirm = isSetup || mode === 'redeem'

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
      return
    }

    if (mode === 'redeem') {
      if (password !== confirm) {
        setError('The passwords do not match.')
        return
      }
      setBusy(true)
      const out = await useAppStore.getState().redeemInvite(code, name, email, password)
      setBusy(false)
      if (!out.ok) setError(out.error ?? 'Could not create the account')
      return
    }

    setBusy(true)
    const out = await useAppStore.getState().signIn(email, password)
    setBusy(false)
    if (!out.ok) setError(out.error ?? 'Sign in failed')
  }

  const canSubmit = isSetup
    ? name.trim().length >= 2 && email.trim().length > 3 && password.length >= 8 && password === confirm
    : mode === 'redeem'
      ? code.trim().length >= 6 && name.trim().length >= 2 && email.trim().length > 3 && password.length >= 8 && password === confirm
      : email.trim().length > 3 && password.length > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {isSetup ? 'Set up Tourny Lite' : mode === 'redeem' ? 'Join with an invitation code' : 'Sign in'}
          </DialogTitle>
          <DialogDescription>
            {isSetup
              ? 'Create the administrator account. Scorekeeper accounts can be added afterwards.'
              : mode === 'redeem'
                ? 'Enter the code your administrator shared, then set up your account.'
                : 'Sign in to record and manage results.'}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit}>
          {/* Sign in ↔ join: the form slides with the travel
              direction, so switching modes feels like moving
              between two adjacent places. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={isSetup ? 'setup' : mode}
              initial={{ opacity: 0, x: isSetup || mode === 'redeem' ? 22 : -22 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isSetup || mode === 'redeem' ? -22 : 22 }}
              transition={{ duration: 0.2, ease: easeOutExpo }}
              className="space-y-4"
            >
              {mode === 'redeem' ? (
            <div className="space-y-1.5">
              <Label htmlFor="auth-code">Invitation code</Label>
              <Input
                id="auth-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD-EFGH"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="font-mono text-base font-semibold tracking-[0.2em] uppercase"
                required
              />
            </div>
          ) : null}

          {isSetup || mode === 'redeem' ? (
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
                autoComplete={needsConfirm ? 'new-password' : 'current-password'}
                className="pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={needsConfirm ? 'At least 8 characters' : 'Your password'}
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

          {needsConfirm ? (
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
            </motion.div>
          </AnimatePresence>

          {error ? (
            <motion.p
              key={error}
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={springSoft}
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </motion.p>
          ) : null}

          <Button type="submit" className="w-full font-semibold" disabled={busy || !canSubmit}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : isSetup ? (
              <ShieldCheck className="h-4 w-4" aria-hidden />
            ) : mode === 'redeem' ? (
              <Ticket className="h-4 w-4" aria-hidden />
            ) : (
              <LogIn className="h-4 w-4" aria-hidden />
            )}
            {isSetup ? 'Create administrator account' : mode === 'redeem' ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        {!isSetup ? (
          mode === 'redeem' ? (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => {
                setMode('signin')
                setError('')
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Back to sign in
            </button>
          ) : (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => {
                setMode('redeem')
                setError('')
              }}
            >
              <Ticket className="h-3.5 w-3.5" aria-hidden /> Have an invitation code? Create your account
            </button>
          )
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
