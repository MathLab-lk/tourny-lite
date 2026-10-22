import { NextRequest, NextResponse } from 'next/server'
import { randomInt } from 'crypto'
import { db } from '@/lib/db'
import { requireRole, type SessionUser } from '@/lib/auth'
import type { InviteDTO } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Unambiguous alphabet — no I, L, O, U, 0, 1 so codes stay
// readable when handwritten or read aloud.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

function generateCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)]
  return code
}

function toDTO(
  invite: {
    id: string
    code: string
    role: string
    createdBy: string
    createdAt: Date
    expiresAt: Date | null
    usedAt: Date | null
    usedBy?: { name: string } | null
  }
): InviteDTO {
  return {
    id: invite.id,
    code: invite.code,
    role: invite.role === 'admin' ? 'admin' : 'judge',
    createdBy: invite.createdBy,
    createdAt: invite.createdAt.toISOString(),
    expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
    usedAt: invite.usedAt ? invite.usedAt.toISOString() : null,
    usedByName: invite.usedBy?.name ?? null,
  }
}

/** Lists all invitation codes (administrator only). */
export async function GET() {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response

  const invites = await db.invitationCode.findMany({
    orderBy: { createdAt: 'desc' },
    include: { usedBy: { select: { name: true } } },
  })
  return NextResponse.json({ invites: invites.map(toDTO) })
}

/** Generates a new invitation code (administrator only). */
export async function POST(req: NextRequest) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response
  const session = guard.session as SessionUser

  try {
    const body = (await req.json()) as { role?: string; expiresInDays?: number }
    const role = body.role === 'admin' ? 'admin' : 'judge'
    let expiresAt: Date | null = null
    if (typeof body.expiresInDays === 'number' && Number.isFinite(body.expiresInDays)) {
      expiresAt = new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)
    }

    // Retry on the (very unlikely) collision with an existing code.
    let invite: {
      id: string
      code: string
      role: string
      createdBy: string
      createdAt: Date
      expiresAt: Date | null
      usedAt: Date | null
    } | null = null
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        invite = await db.invitationCode.create({
          data: { code: generateCode(), role, createdBy: session.name, expiresAt },
        })
        break
      } catch (err) {
        const prismaError = err as { code?: string }
        if (prismaError?.code !== 'P2002') throw err
      }
    }
    if (!invite) {
      return NextResponse.json({ error: 'Could not generate a unique code. Try again.' }, { status: 500 })
    }

    return NextResponse.json({ invite: toDTO(invite) }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Could not generate the invitation code.' }, { status: 400 })
  }
}
