import { db } from '@/lib/db'
import type { EventDTO, TournamentDetailDTO } from '@/lib/types'

// ─────────────────────────────────────────────────────────────
// WhatsApp sharing via WAHA (WhatsApp HTTP API).
//
// The app talks to a self-hosted WAHA server (devlikeapro/waha).
// Verified REST surface (docs + live probe):
//   GET  /api/sessions          → [{ name, status, ... }]
//   GET  /api/{session}/groups  → groups the account belongs to
//   POST /api/sendText          → { session, chatId, text }
// Every request carries the `X-Api-Key` header when a key is set.
// Engines name the group fields differently — the JS cores return
// { id, name }, the Go core (gows, e.g. the *-arm images) returns
// { JID, Name }; `subject` covers older cores. All three are read.
//
// The connection is configured by the administrator in Settings
// (stored in the AppSetting table); environment variables act as
// a headless fallback when nothing has been saved yet.
// ─────────────────────────────────────────────────────────────

export interface WhatsAppConfig {
  baseUrl: string
  apiKey: string
  session: string
  groupChatId: string
  groupName: string
}

export interface WhatsAppPublicConfig {
  configured: boolean
  baseUrl: string
  session: string
  groupChatId: string
  groupName: string
  apiKeySet: boolean
  apiKeyHint: string
}

export interface WahaSessionInfo {
  name: string
  status: string
}

export interface WahaGroupInfo {
  id: string
  name: string
}

const SETTING_KEY = 'whatsapp'
const GROUP_SUFFIX = '@g.us'

// ── stored configuration ──────────────────────────────────────

function configFromEnv(): Partial<WhatsAppConfig> {
  return {
    baseUrl: process.env.WAHA_BASE_URL?.trim() ?? '',
    apiKey: process.env.WAHA_API_KEY?.trim() ?? '',
    session: process.env.WAHA_SESSION?.trim() ?? 'default',
    groupChatId: process.env.WAHA_GROUP_CHAT_ID?.trim() ?? '',
  }
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

/** Reads the saved configuration; falls back to environment
 *  variables (all-or-nothing) when nothing has been stored. */
export async function getWhatsAppConfig(): Promise<WhatsAppConfig | null> {
  const row = await db.appSetting.findUnique({ where: { key: SETTING_KEY } })
  const env = configFromEnv()
  if (row) {
    try {
      const stored = JSON.parse(row.value) as Partial<WhatsAppConfig>
      return {
        baseUrl: normalizeBaseUrl(stored.baseUrl ?? ''),
        apiKey: stored.apiKey ?? '',
        session: stored.session?.trim() || 'default',
        groupChatId: stored.groupChatId?.trim() ?? '',
        groupName: stored.groupName ?? '',
      }
    } catch {
      // corrupted row — fall through to the env fallback
    }
  }
  const merged: WhatsAppConfig = {
    baseUrl: normalizeBaseUrl(env.baseUrl ?? ''),
    apiKey: env.apiKey ?? '',
    session: env.session?.trim() || 'default',
    groupChatId: env.groupChatId ?? '',
    groupName: '',
  }
  if (!merged.baseUrl || !merged.groupChatId) return null
  return merged
}

/** Upserts the configuration; empty `apiKey` keeps the stored key. */
export async function saveWhatsAppConfig(
  patch: Partial<WhatsAppConfig>
): Promise<WhatsAppConfig> {
  const current = (await getWhatsAppConfig()) ?? {
    baseUrl: '',
    apiKey: '',
    session: 'default',
    groupChatId: '',
    groupName: '',
  }
  const next: WhatsAppConfig = {
    baseUrl: patch.baseUrl !== undefined ? normalizeBaseUrl(patch.baseUrl) : current.baseUrl,
    apiKey: patch.apiKey?.trim() ? patch.apiKey.trim() : current.apiKey,
    session: patch.session?.trim() || 'default',
    groupChatId: patch.groupChatId !== undefined ? patch.groupChatId.trim() : current.groupChatId,
    groupName: patch.groupName !== undefined ? patch.groupName : current.groupName,
  }
  await db.appSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: JSON.stringify(next) },
    create: { key: SETTING_KEY, value: JSON.stringify(next) },
  })
  return next
}

/** Client-safe projection — the key never leaves the server. */
export function toPublicConfig(cfg: WhatsAppConfig | null): WhatsAppPublicConfig {
  const complete = Boolean(cfg && cfg.baseUrl && cfg.apiKey && cfg.groupChatId)
  return {
    configured: complete,
    baseUrl: cfg?.baseUrl ?? '',
    session: cfg?.session ?? 'default',
    groupChatId: cfg?.groupChatId ?? '',
    groupName: cfg?.groupName ?? '',
    apiKeySet: Boolean(cfg?.apiKey),
    apiKeyHint: cfg?.apiKey ? `${cfg.apiKey.slice(0, 3)}…${cfg.apiKey.slice(-2)}` : '',
  }
}

// ── WAHA HTTP client ──────────────────────────────────────────

export class WahaError extends Error {
  status: number
  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

async function wahaRequest<T>(
  cfg: { baseUrl: string; apiKey: string },
  path: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${normalizeBaseUrl(cfg.baseUrl)}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { 'X-Api-Key': cfg.apiKey } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    })
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'TimeoutError'
    throw new WahaError(
      aborted
        ? 'The WhatsApp server took too long to respond (timeout).'
        : 'Could not reach the WhatsApp server — check the address.',
      504
    )
  }
  if (res.status === 401 || res.status === 403) {
    throw new WahaError('The WhatsApp server rejected the API key.', 502)
  }
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { message?: string; error?: string } | null
    const reason = detail?.message || detail?.error || `HTTP ${res.status}`
    throw new WahaError(`The WhatsApp server said: ${reason}`, 502)
  }
  try {
    return (await res.json()) as T
  } catch {
    throw new WahaError('The WhatsApp server returned an unreadable response.', 502)
  }
}

/** Lists sessions with their status (WORKING = connected & ready). */
export async function listWahaSessions(baseUrl: string, apiKey: string): Promise<WahaSessionInfo[]> {
  const sessions = await wahaRequest<{ name?: string; status?: string }[]>({ baseUrl, apiKey }, '/api/sessions')
  return sessions
    .filter((s) => s && typeof s.name === 'string')
    .map((s) => ({ name: s.name as string, status: s.status ?? 'UNKNOWN' }))
}

// Field spellings differ per engine: JS cores use { id, name }, the
// Go core (gows) returns { JID, Name }, older cores { id, subject }.
interface RawGroup {
  id?: string
  JID?: string
  name?: string
  Name?: string
  subject?: string
}

function normalizeGroups(raw: RawGroup[]): WahaGroupInfo[] {
  return raw
    .map((g) => {
      const id = g.id ?? g.JID
      const name = (g.name ?? g.Name ?? g.subject)?.trim()
      return id ? { id, name: name || id } : null
    })
    .filter((g): g is WahaGroupInfo => g !== null && g.id.endsWith(GROUP_SUFFIX))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Lists the groups the connected account belongs to, sorted by
 *  name. Group ids must end in @g.us; unnamed groups show their id. */
export async function listWahaGroups(
  baseUrl: string,
  apiKey: string,
  session: string
): Promise<WahaGroupInfo[]> {
  // No query params: engines disagree on which are supported (gows
  // rejects unknown sortBy values, ignores `exclude`), so the plain
  // endpoint is the one surface every core answers — sorting happens
  // client-side instead.
  const groups = await wahaRequest<RawGroup[]>(
    { baseUrl, apiKey },
    `/api/${encodeURIComponent(session)}/groups`
  )
  return normalizeGroups(groups)
}

/** Sends plain text to the configured group. */
export async function sendWhatsAppText(cfg: WhatsAppConfig, text: string): Promise<void> {
  await wahaRequest(cfg, '/api/sendText', {
    method: 'POST',
    body: { session: cfg.session, chatId: cfg.groupChatId, text },
  })
}

// ── message builders ──────────────────────────────────────────
// WhatsApp renders *bold* / _italic_; emoji medals keep the
// message readable on every phone without images.

const MEDALS = ['🥇', '🥈', '🥉'] as const

function shareStamp(): string {
  return new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function centerLabel(row: { centerCode: string; centerName: string }): string {
  return row.centerName ? `${row.centerName} (${row.centerCode})` : row.centerCode
}

/** Overall standings — one line per center that has scored. */
export function buildStandingsMessage(detail: TournamentDetailDTO): string {
  const { tournament, standings, progress } = detail
  const scored = standings.filter((r) => r.total > 0)
  if (scored.length === 0) {
    throw new WahaError('No results have been recorded yet — nothing to share.', 400)
  }
  const lines = scored.map((row, i) => {
    const prefix = i < 3 ? MEDALS[i] : `${i + 1}.`
    return `${prefix} ${centerLabel(row)} — ${row.total} pts`
  })
  return [
    `🏆 *${tournament.name}* — Standings`,
    tournament.organizer ? tournament.organizer : '',
    '',
    ...lines,
    '',
    `_${progress.completed} of ${progress.total} events completed · ${shareStamp()}_`,
  ]
    .filter((line) => line !== '')
    .join('\n')
}

/** Single event podium — the "event result" announcement. */
export function buildEventMessage(detail: TournamentDetailDTO, eventId: string): string {
  const { tournament, divisions, centers } = detail
  const event = detail.events.find((e) => e.id === eventId) as EventDTO | undefined
  if (!event) throw new WahaError('Event not found.', 404)
  const result = event.result
  if (!result) {
    throw new WahaError('This event has no recorded result yet — nothing to share.', 400)
  }

  const division = divisions.find((d) => d.code === event.divisionCode)
  const divisionLine = division
    ? `Cat ${division.code}${division.ageRange ? ` · ${division.ageRange}` : ''}`
    : `Cat ${event.divisionCode}`
  const nameByCode = new Map(centers.map((c) => [c.centerCode, c]))

  const places: { medal: string; code: string; pts: number }[] = []
  if (result.firstPlaceCode) {
    places.push({ medal: MEDALS[0], code: result.firstPlaceCode, pts: tournament.pointsFirst })
  }
  if (result.secondPlaceCode) {
    places.push({ medal: MEDALS[1], code: result.secondPlaceCode, pts: tournament.pointsSecond })
  }
  if (result.thirdPlaceCode) {
    places.push({ medal: MEDALS[2], code: result.thirdPlaceCode, pts: tournament.pointsThird })
  }

  const lines = places.map((p) => {
    const center = nameByCode.get(p.code)
    const label = center ? centerLabel(center) : p.code
    return `${p.medal} ${label} — ${p.pts} pts`
  })

  return [
    `🏁 *${tournament.name}*`,
    `*${event.gameName}*${event.gameSinhalaName ? ` — ${event.gameSinhalaName}` : ''}`,
    `${divisionLine}${event.subEventIndex > 1 ? ` · Slot ${event.subEventIndex}` : ''}`,
    '',
    ...lines,
    '',
    `_${shareStamp()}_`,
  ]
    .filter((line) => line !== '')
    .join('\n')
}

/** Short connectivity probe used by the "Send test message" button. */
export function buildTestMessage(): string {
  return [
    '✅ *Tourny Lite* — WhatsApp connection test',
    'Results from your tournaments will be shared in this group.',
  ].join('\n')
}
