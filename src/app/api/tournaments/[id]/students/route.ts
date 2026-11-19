import { NextRequest, NextResponse } from 'next/server'
import { backfillStudentCodes, registerStudents, removeStudent, updateStudent } from '@/lib/student-service'
import { emitTournamentChanged } from '@/lib/bus'
import { friendlyError, requireRole } from '@/lib/auth'
import type { StudentInput } from '@/lib/types'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Students — the registration stage behind the student rankings.
 *
 *  - POST   any signed-in staff: register students (name + center
 *           + grade as the ID pattern needs). Each registration
 *           issues a unique studentCode from the tournament's ID
 *           pattern — the field reference for marks.
 *  - PATCH  administrator: rename, re-grade or reassign a student's
 *           center. Codes are stable and never regenerate.
 *  - DELETE administrator: remove a student (and their marks).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const guard = await requireRole('any')
  if (guard.response) return guard.response
  const { id } = await ctx.params

  try {
    const body = await req.json()
    const raw: StudentInput[] = Array.isArray(body.students)
      ? body.students
      : body.name !== undefined
        ? [{ name: body.name, centerId: body.centerId ?? null, grade: body.grade ?? '' }]
        : []
    const inputs = raw.map((s) => ({
      name: String(s.name ?? ''),
      centerId: s.centerId ?? null,
      grade: s.grade ?? '',
    }))
    if (inputs.length === 0 || inputs.every((s) => !s.name.trim())) {
      return NextResponse.json({ error: 'No student names provided' }, { status: 400 })
    }
    const students = await registerStudents(id, inputs)
    emitTournamentChanged(id)
    return NextResponse.json({ added: students.length, students }, { status: 201 })
  } catch (err) {
    const { message, status } = friendlyError(err, 'Failed to register students')
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

    const patch: { name?: string; centerId?: string | null; grade?: string | null } = {}
    if (body.name !== undefined) patch.name = String(body.name)
    if (body.grade !== undefined) patch.grade = body.grade === null ? null : String(body.grade)
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
