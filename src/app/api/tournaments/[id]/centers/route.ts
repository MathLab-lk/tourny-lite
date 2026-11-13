import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseCentersText } from '@/lib/tournament-service'
import { emitTournamentChanged } from '@/lib/bus'
import { friendlyError, requireRole } from '@/lib/auth'

type Ctx = { params: Promise<{ id: string }> }

/** Administrator only: adds participating centers in bulk. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response
  const { id } = await ctx.params

  try {
    const body = await req.json()
    const parsed =
      typeof body.centersText === 'string'
        ? parseCentersText(body.centersText)
        : Array.isArray(body.centers)
          ? (body.centers as { code: string; name?: string }[]).map((c) => ({
              code: String(c.code).trim(),
              name: String(c.name ?? '').trim(),
            }))
          : []
    const valid = parsed.filter((c) => c.code)
    if (valid.length === 0)
      return NextResponse.json({ error: 'No valid center codes provided' }, { status: 400 })

    const existing = await db.center.findMany({
      where: { tournamentId: id, centerCode: { in: valid.map((c) => c.code) } },
      select: { centerCode: true },
    })
    const existingCodes = new Set(existing.map((c) => c.centerCode))
    const toCreate = valid.filter((c) => !existingCodes.has(c.code))
    if (toCreate.length > 0) {
      await db.center.createMany({
        data: toCreate.map((c) => ({ tournamentId: id, centerCode: c.code, centerName: c.name })),
      })
    }
    emitTournamentChanged(id)
    return NextResponse.json({ added: toCreate.length, skipped: valid.length - toCreate.length })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to add centers')
    return NextResponse.json({ error: message }, { status })
  }
}

/** Administrator only: edits a center's code, name or location. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response
  const { id } = await ctx.params

  try {
    const body = await req.json()
    if (!body.centerId) return NextResponse.json({ error: 'centerId required' }, { status: 400 })
    const center = await db.center.findUnique({ where: { id: String(body.centerId) } })
    if (!center || center.tournamentId !== id) {
      return NextResponse.json({ error: 'Center not found' }, { status: 404 })
    }

    const data: { centerCode?: string; centerName?: string; location?: string } = {}
    if (body.code !== undefined) {
      const code = String(body.code).trim()
      if (!code) {
        return NextResponse.json(
          { error: 'The center code cannot be empty' },
          { status: 400 }
        )
      }
      if (code !== center.centerCode) {
        const dupe = await db.center.findUnique({
          where: { tournamentId_centerCode: { tournamentId: id, centerCode: code } },
          select: { id: true },
        })
        if (dupe) {
          return NextResponse.json(
            { error: `Center code ${code} is already taken in this tournament` },
            { status: 409 }
          )
        }
      }
      data.centerCode = code
    }
    if (body.name !== undefined) data.centerName = String(body.name).trim()
    if (body.location !== undefined) data.location = String(body.location).trim()

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const updated = await db.center.update({ where: { id: center.id }, data })
    emitTournamentChanged(id)
    return NextResponse.json({
      ok: true,
      center: {
        id: updated.id,
        centerCode: updated.centerCode,
        centerName: updated.centerName,
        location: updated.location,
      },
    })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to update center')
    return NextResponse.json({ error: message }, { status })
  }
}

/** Administrator only: removes a participating center. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response
  const { id } = await ctx.params

  try {
    const body = await req.json()
    if (!body.centerId) return NextResponse.json({ error: 'centerId required' }, { status: 400 })
    await db.center.delete({ where: { id: String(body.centerId) } })
    emitTournamentChanged(id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to remove center')
    return NextResponse.json({ error: message }, { status })
  }
}
