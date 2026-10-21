import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, requireRole } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/** Lists all accounts (administrator only). */
export async function GET() {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response

  const users = await db.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
  })
  return NextResponse.json({ users })
}

/** Creates a new account (administrator only). */
export async function POST(req: NextRequest) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response

  try {
    const body = (await req.json()) as {
      name?: string
      email?: string
      password?: string
      role?: string
    }
    const name = String(body.name ?? '').trim()
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const role = body.role === 'admin' ? 'admin' : 'judge'

    if (name.length < 2) {
      return NextResponse.json({ error: 'Enter the person’s full name.' }, { status: 400 })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Choose a password of at least 8 characters.' }, { status: 400 })
    }

    const exists = await db.user.findUnique({ where: { email } })
    if (exists) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 400 })
    }

    const created = await db.user.create({
      data: { email, name, passwordHash: hashPassword(password), role },
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    })
    return NextResponse.json({ user: created }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Could not create the account.' }, { status: 400 })
  }
}
