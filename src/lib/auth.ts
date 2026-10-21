import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Lightweight authentication layer.
 *
 * - Passwords are hashed with scrypt (per-user random salt, constant-time compare).
 * - Sessions are stateless HMAC-signed tokens stored in an HttpOnly cookie.
 * - Reading tournament data stays public; every write requires a session.
 *
 * The signature scheme is deliberately dependency-free to keep the runtime
 * footprint small: `base64url(payload).base64url(hmacSha256(payload))`.
 */

export const SESSION_COOKIE = 'tourny_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

export type UserRole = 'admin' | 'judge'

export interface SessionUser {
  id: string
  email: string
  name: string
  role: UserRole
}

interface SessionPayload extends SessionUser {
  exp: number // unix seconds
}

function secret(): string {
  const s = process.env.AUTH_SECRET
  if (s && s.length >= 16) return s
  // Deterministic dev fallback keeps local development friction-free.
  // Production deployments must set AUTH_SECRET (enforced in the README).
  return 'tourny-lite-development-secret-change-me'
}

// ── password hashing ──────────────────────────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}

// ── session tokens ────────────────────────────────────────────

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url')
}

export function createSessionToken(user: SessionUser): string {
  const payload: SessionPayload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }
  const body = b64url(JSON.stringify(payload))
  return `${body}.${sign(body)}`
}

export function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const signature = token.slice(dot + 1)
  const expected = sign(body)
  if (signature.length !== expected.length) return null
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload
    if (typeof payload.exp !== 'number' || payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

// ── request context helpers ───────────────────────────────────

/** Returns the signed-in user, or null for guests. Validates the account still exists and is active. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const payload = verifySessionToken(store.get(SESSION_COOKIE)?.value)
  if (!payload) return null
  const user = await db.user.findUnique({ where: { id: payload.id } })
  if (!user || !user.active) return null
  return { id: user.id, email: user.email, name: user.name, role: user.role as UserRole }
}

/** True while no account exists — drives the first-run setup experience. */
export async function isInitialSetup(): Promise<boolean> {
  const count = await db.user.count()
  return count === 0
}

function unauthorized() {
  return NextResponse.json(
    { error: 'Please sign in to make changes.' },
    { status: 401 }
  )
}

function forbidden() {
  return NextResponse.json(
    { error: 'You do not have permission to perform this action.' },
    { status: 403 }
  )
}

type Guarded<T> = { session: SessionUser; response?: never } | { session?: never; response: NextResponse<T> }

/**
 * Route-handler guard. Wrap write handlers:
 *   const guard = await requireRole('admin')
 *   if (guard.response) return guard.response
 */
export async function requireRole(role: 'admin' | 'judge' | 'any'): Promise<Guarded<unknown>> {
  const user = await getSessionUser()
  if (!user) return { response: unauthorized() }
  if (role === 'admin' && user.role !== 'admin') return { response: forbidden() }
  return { session: user }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  }
}

export function clearedSessionCookieOptions() {
  return { ...sessionCookieOptions(), maxAge: 0 }
}

// ── friendly Prisma error mapping ─────────────────────────────

export function friendlyError(err: unknown, fallback: string): { message: string; status: number } {
  const prismaError = err as { code?: string; meta?: { target?: string[] } }
  if (prismaError?.code === 'P2002') {
    return { message: 'A record with the same unique value already exists.', status: 400 }
  }
  if (prismaError?.code === 'P2025') {
    return { message: 'The requested record no longer exists.', status: 404 }
  }
  if (err instanceof Error && err.message) {
    const notFound = /not found/i.test(err.message)
    return { message: err.message, status: notFound ? 404 : 400 }
  }
  return { message: fallback, status: 400 }
}
