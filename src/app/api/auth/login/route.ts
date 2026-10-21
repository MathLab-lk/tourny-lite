import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  verifyPassword,
  type SessionUser,
} from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Signs a user in with email + password and issues the session cookie.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string; password?: string }
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')

    if (!email || !password) {
      return NextResponse.json({ error: 'Enter your email address and password.' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'Incorrect email address or password.' }, { status: 401 })
    }
    if (!user.active) {
      return NextResponse.json(
        { error: 'This account has been deactivated. Contact the tournament administrator.' },
        { status: 403 }
      )
    }

    const sessionUser: SessionUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as SessionUser['role'],
    }
    const res = NextResponse.json({ user: sessionUser })
    res.cookies.set(SESSION_COOKIE, createSessionToken(sessionUser), sessionCookieOptions())
    return res
  } catch {
    return NextResponse.json({ error: 'Sign in failed. Please try again.' }, { status: 400 })
  }
}
