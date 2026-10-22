import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  SESSION_COOKIE,
  createSessionToken,
  hashPassword,
  sessionCookieOptions,
  type SessionUser,
} from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Redeems an invitation code: creates the account with the role
 * baked into the code, marks the code as used and signs the new
 * user in straight away. Public endpoint — the code is the credential.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      code?: string
      name?: string
      email?: string
      password?: string
    }

    const code = String(body.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    const name = String(body.name ?? '').trim()
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')

    if (code.length < 6) {
      return NextResponse.json({ error: 'Enter the invitation code you received.' }, { status: 400 })
    }
    if (name.length < 2) {
      return NextResponse.json({ error: 'Enter your full name.' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Choose a password of at least 8 characters.' }, { status: 400 })
    }

    const invite = await db.invitationCode.findUnique({ where: { code } })
    if (!invite) {
      return NextResponse.json({ error: 'This invitation code is not valid.' }, { status: 400 })
    }
    if (invite.usedAt) {
      return NextResponse.json(
        { error: 'This invitation code has already been used.' },
        { status: 400 }
      )
    }
    if (invite.expiresAt && invite.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ error: 'This invitation code has expired.' }, { status: 400 })
    }

    const emailTaken = await db.user.findUnique({ where: { email } })
    if (emailTaken) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Sign in instead.' },
        { status: 400 }
      )
    }

    // Create the account and burn the code atomically. The updateMany
    // guard makes a double-redeem of the same code impossible even under
    // concurrent requests.
    let created: { id: string; email: string; name: string; role: string } | null = null
    try {
      created = await db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email, name, passwordHash: hashPassword(password), role: invite.role },
          select: { id: true, email: true, name: true, role: true },
        })
        const burned = await tx.invitationCode.updateMany({
          where: { id: invite.id, usedAt: null },
          data: { usedAt: new Date(), usedById: user.id },
        })
        if (burned.count === 0) throw new Error('code-already-used')
        return user
      })
    } catch (err) {
      if (err instanceof Error && err.message === 'code-already-used') {
        return NextResponse.json(
          { error: 'This invitation code has already been used.' },
          { status: 400 }
        )
      }
      const prismaError = err as { code?: string }
      if (prismaError?.code === 'P2002') {
        return NextResponse.json(
          { error: 'An account with this email already exists. Sign in instead.' },
          { status: 400 }
        )
      }
      throw err
    }

    const sessionUser: SessionUser = {
      id: created.id,
      email: created.email,
      name: created.name,
      role: created.role as SessionUser['role'],
    }
    const res = NextResponse.json({ user: sessionUser }, { status: 201 })
    res.cookies.set(SESSION_COOKIE, createSessionToken(sessionUser), sessionCookieOptions())
    return res
  } catch {
    return NextResponse.json({ error: 'Could not create the account. Please try again.' }, { status: 400 })
  }
}
