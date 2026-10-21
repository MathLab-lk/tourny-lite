import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Health probe — used by Docker healthchecks and uptime monitors.
 */
export async function GET() {
  try {
    await db.tournament.count()
    return NextResponse.json({ status: 'ok', db: 'up', ts: new Date().toISOString() })
  } catch {
    return NextResponse.json({ status: 'degraded', db: 'down' }, { status: 503 })
  }
}
