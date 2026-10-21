import { NextResponse } from 'next/server'
import { getSessionUser, isInitialSetup } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * Returns the current session (or null for guests) plus whether the
 * first-run administrator setup is still pending.
 */
export async function GET() {
  const [user, setupRequired] = await Promise.all([getSessionUser(), isInitialSetup()])
  return NextResponse.json({ user, setupRequired })
}
