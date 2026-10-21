import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  SESSION_COOKIE,
  createSessionToken,
  hashPassword,
  isInitialSetup,
  sessionCookieOptions,
  type SessionUser,
} from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * First-run setup: creates the administrator account. Only available
 * while no account exists; afterwards accounts are managed by the
 * administrator from the app.
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await isInitialSetup())) {
      return NextResponse.json(
        { error: 'Setup is already complete. Ask an administrator for an account.' },
        { status: 403 }
      )
    }

    const body = (await req.json()) as { name?: string; email?: string; password?: string }
    const name = String(body.name ?? '').trim()
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')

    if (name.length < 2) {
      return NextResponse.json({ error: 'Enter your full name.' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Choose a password of at least 8 characters.' }, { status: 400 })
    }

    const created = await db.user.create({
      data: {
        email,
        name,
        passwordHash: hashPassword(password),
        role: 'admin', // the first account administers the app
      },
    })

    const sessionUser: SessionUser = {
      id: created.id,
      email: created.email,
      name: created.name,
      role: 'admin',
    }
    const res = NextResponse.json({ user: sessionUser }, { status: 201 })
    res.cookies.set(SESSION_COOKIE, createSessionToken(sessionUser), sessionCookieOptions())
    return res
  } catch {
    return NextResponse.json({ error: 'Setup failed. Please try again.' }, { status: 400 })
  }
}
