import { NextRequest, NextResponse } from 'next/server'
import { addStudents, removeStudent, updateStudent } from '@/lib/student-service'
import { emitTournamentChanged } from '@/lib/bus'
import { friendlyError, requireRole } from '@/lib/auth'
import type { StudentInput } from '@/lib/types'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Students — the on-the-go roster behind the student rankings.
 *
 *  - POST   any signed-in staff: scorekeepers meet unregistered
 *           students in the field, so adding to the roster is a
 *           field action (name + optional center).
 *  - PATCH  administrator: rename or reassign a student's center.
 *  - DELETE administrator: remove a student (and their marks).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const guard = await requireRole('any')
  if (guard.response) return guard.response
  const { id } = await ctx.params

  try {
    const body = await req.json()
    const inputs: StudentInput[] = Array.isArray(body.students)
      ? body.students
      : body.name !== undefined
        ? [{ name: body.name, centerId: body.centerId ?? null }]
        : []
    if (inputs.length === 0) {
      return NextResponse.json({ error: 'No student names provided' }, { status: 400 })
    }
    const students = await addStudents(id, inputs)
    emitTournamentChanged(id)
    return NextResponse.json({ added: students.length, students }, { status: 201 })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to add students')
    return NextResponse.json({ error: message }, { status })
  }
}

/** Administrator only: renames a student or moves them to another center. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response
  const { id } = await ctx.params

  try {
    const body = await req.json()
    if (!body.studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 })

    const patch: { name?: string; centerId?: string | null } = {}
    if (body.name !== undefined) patch.name = String(body.name)
    if (body.centerId !== undefined) patch.centerId = body.centerId === null ? null : String(body.centerId)

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    const student = await updateStudent(id, String(body.studentId), patch, guard.session.name)
    return NextResponse.json({ ok: true, student })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to update student')
    return NextResponse.json({ error: message }, { status })
  }
}

/** Administrator only: removes a student and their marks. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const guard = await requireRole('admin')
  if (guard.response) return guard.response
  const { id } = await ctx.params

  try {
    const body = await req.json()
    if (!body.studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 })
    await removeStudent(id, String(body.studentId), guard.session.name)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to remove student')
    return NextResponse.json({ error: message }, { status })
  }
}
