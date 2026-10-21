import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { friendlyError, hashPassword, requireRole } from '@/lib/auth'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** Updates an account: role, active flag or password reset (administrator only). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response
  const { id } = await ctx.params

  try {
    const body = (await req.json()) as {
      role?: string
      active?: boolean
      password?: string
    }
    const data: { role?: string; active?: boolean; passwordHash?: string } = {}

    if (body.role !== undefined) {
      if (body.role !== 'admin' && body.role !== 'judge') {
        return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
      }
      data.role = body.role
    }
    if (body.active !== undefined) data.active = Boolean(body.active)
    if (body.password !== undefined) {
      if (String(body.password).length < 8) {
        return NextResponse.json({ error: 'Choose a password of at least 8 characters.' }, { status: 400 })
      }
      data.passwordHash = hashPassword(String(body.password))
    }

    if (id === guard.session.id && data.active === false) {
      return NextResponse.json({ error: 'You cannot deactivate your own account.' }, { status: 400 })
    }
    if (id === guard.session.id && data.role === 'judge') {
      return NextResponse.json({ error: 'You cannot remove your own administrator role.' }, { status: 400 })
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
    }

    const updated = await db.user.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
    })
    return NextResponse.json({ user: updated })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Could not update the account.')
    return NextResponse.json({ error: message }, { status })
  }
}

/** Permanently removes an account (administrator only). */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response
  const { id } = await ctx.params

  if (id === guard.session.id) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 })
  }
  try {
    await db.user.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Could not delete the account.')
    return NextResponse.json({ error: message }, { status })
  }
}
