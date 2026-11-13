import { measureText } from '@/lib/card-fonts'
import type { EventDTO, TournamentDetailDTO } from '@/lib/types'

// ─────────────────────────────────────────────────────────────
// Share cards — the styled image broadcasts sent to WhatsApp.
//
// Messages are laid out as SVG (1080 px wide, height follows the
// content) and rasterized to JPEG by `renderCardJpeg`. Rasterizing
// goes through sharp's bundled librsvg + pango, so complex-script
// shaping (the Sinhala game names) is typeset by HarfBuzz exactly
// like the rest of the platform. The fonts live in public/fonts
// and must be visible to fontconfig (the Docker image installs
// them; for local development see README → "Share cards").
//
// Every text element is fitted with measured widths (card-fonts)
// so long center or game names shrink before they ever overflow.
// ─────────────────────────────────────────────────────────────

const W = 1080 // canvas width — displays full-width in WhatsApp
const M = 64 // side margin
const CW = W - 2 * M // content width

// Brand — the app's own palette (see globals.css, oklch converted):
// deep emerald on sage-tinted paper, gold as the champion accent.
const INK = '#101512'
const MUTED = '#525A55'
const FAINT = '#6B7570'
const PAPER = '#F7FAF7'
const CARD = '#FFFFFF'
const STROKE = '#E4EAE6'
const EMERALD = '#007F51'
const EMERALD_DEEP = '#0E422E'
const EMERALD_SOFT = '#DDF0E6'
const GOLD = '#EFBD24'
const GOLD_DEEP = '#D9A514'

const LATIN = 'Poppins, Noto Sans Sinhala, sans-serif'
const SINHALA = 'Noto Sans Sinhala, Poppins, sans-serif'

export interface ShareCard {
  svg: string
  /** Short line shown under the image in the WhatsApp bubble. */
  caption: string
}

// ── text plumbing ────────────────────────────────────────────

function esc(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

/** Rough cap-height centering for a single line in a box. */
function baseline(top: number, height: number, size: number, sinhala = false): number {
  return top + height / 2 + (sinhala ? 0.4 : 0.36) * size
}

function width(text: string, weight: 'regular' | 'medium' | 'semibold', size: number, letterSpacing = 0): number {
  return measureText(text, weight, size) + Math.max(0, text.length - 1) * letterSpacing
}

/** Truncates with an ellipsis so the text fits `maxWidth`. */
function truncate(text: string, weight: 'regular' | 'medium' | 'semibold', size: number, maxWidth: number): string {
  if (width(text, weight, size) <= maxWidth) return text
  let lo = 1
  let hi = text.length - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (width(`${text.slice(0, mid)}…`, weight, size) <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return `${text.slice(0, lo)}…`
}

/** Shrinks first, truncates last — never overflows `maxWidth`. */
function fit(text: string, weight: 'regular' | 'medium' | 'semibold', size: number, maxWidth: number, minSize = Math.round(size * 0.72)): { text: string; size: number } {
  for (let s = size; s > minSize; s -= 2) {
    if (width(text, weight, s) <= maxWidth) return { text, size: s }
  }
  return { text: truncate(text, weight, minSize, maxWidth), size: minSize }
}

interface TextOpts {
  x: number
  y: number
  size: number
  weight?: 'regular' | 'medium' | 'semibold'
  fill?: string
  anchor?: 'start' | 'middle' | 'end'
  letterSpacing?: number
  sinhala?: boolean
}

function text(t: string, o: TextOpts): string {
  const attrs = [
    `x="${o.x}"`,
    `y="${Math.round(o.y)}"`,
    `font-family="${o.sinhala ? SINHALA : LATIN}"`,
    `font-size="${o.size}"`,
    `font-weight="${o.weight === 'semibold' ? 600 : o.weight === 'medium' ? 500 : 400}"`,
    o.fill ? `fill="${o.fill}"` : '',
    o.anchor ? `text-anchor="${o.anchor}"` : '',
    o.letterSpacing ? `letter-spacing="${o.letterSpacing}"` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return `<text ${attrs}>${esc(t)}</text>`
}

// ── building blocks ──────────────────────────────────────────

/** A rounded outline chip ("Category B", "Ages 9 to 10"). */
function chip(
  t: string,
  x: number,
  top: number,
  opts?: { filled?: boolean; height?: number }
): { svg: string; right: number } | null {
  const size = opts?.height && opts.height < 50 ? 25 : 28
  const h = opts?.height ?? 58
  const padX = opts?.height && opts.height < 50 ? 20 : 26
  const w = Math.round(width(t, 'medium', size) + padX * 2)
  if (x + w > W - M) return null // never overflow — drop the chip instead
  const svg = [
    `<rect x="${x}" y="${top}" width="${w}" height="${h}" rx="${h / 2}" fill="${opts?.filled ? EMERALD_SOFT : 'none'}" stroke="${opts?.filled ? 'none' : STROKE}" stroke-width="2"/>`,
    text(t, { x: x + w / 2, y: baseline(top, h, size), size, weight: 'medium', fill: opts?.filled ? EMERALD_DEEP : MUTED, anchor: 'middle' }),
  ].join('')
  return { svg, right: x + w }
}

/** The rank medal — a gradient coin with the place numeral. */
function medalBadge(cx: number, cy: number, r: number, rank: 1 | 2 | 3): string {
  const skins = {
    1: { grad: 'gGold', ring: '#C29410', numeral: '#FFFFFF' },
    2: { grad: 'gSilver', ring: '#8A948E', numeral: '#3C453F' },
    3: { grad: 'gBronze', ring: '#96562A', numeral: '#FFFFFF' },
  }[rank]
  const size = Math.round(r * 0.95)
  return [
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${skins.grad})" stroke="${skins.ring}" stroke-width="3"/>`,
    text(String(rank), { x: cx, y: cy + r * 0.36, size, weight: 'semibold', fill: skins.numeral, anchor: 'middle' }),
  ].join('')
}

/** Emerald masthead with the eyebrow label, title and organizer. */
function masthead(eyebrow: string, title: string, organizer: string): { svg: string; bottom: number } {
  const H = 316
  const parts: string[] = [
    `<defs>`,
    `<linearGradient id="gHead" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00875A"/><stop offset="1" stop-color="${EMERALD_DEEP}"/></linearGradient>`,
    `<linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EFC63E"/><stop offset="1" stop-color="#C99410"/></linearGradient>`,
    `<linearGradient id="gSilver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E3E9E6"/><stop offset="1" stop-color="#96A19B"/></linearGradient>`,
    `<linearGradient id="gBronze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#DCA36C"/><stop offset="1" stop-color="#A9662F"/></linearGradient>`,
    `<linearGradient id="gFill" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#00A263"/><stop offset="1" stop-color="${EMERALD}"/></linearGradient>`,
    `<clipPath id="clipHead"><rect width="${W}" height="${H}" rx="0"/></clipPath>`,
    `</defs>`,
    `<rect width="${W}" height="${H}" fill="url(#gHead)"/>`,
    `<g clip-path="url(#clipHead)">`,
    `<circle cx="1008" cy="36" r="180" fill="#FFFFFF" opacity="0.05"/>`,
    `<circle cx="70" cy="330" r="130" fill="#FFFFFF" opacity="0.04"/>`,
    `<circle cx="948" cy="304" r="64" fill="#FFFFFF" opacity="0.06"/>`,
    `</g>`,
    text(eyebrow, { x: M, y: 124, size: 30, weight: 'semibold', fill: GOLD, letterSpacing: 7 }),
  ]
  const fitted = fit(title, 'semibold', 60, CW, 44)
  parts.push(text(fitted.text, { x: M, y: 124 + 64 + (60 - fitted.size) / 2, size: fitted.size, weight: 'semibold', fill: '#FFFFFF' }))
  if (organizer.trim()) {
    const f = fit(organizer.trim(), 'regular', 30, CW, 24)
    parts.push(text(f.text, { x: M, y: 250 + (30 - f.size) / 2, size: f.size, weight: 'regular', fill: '#CDE8DA' }))
  }
  parts.push(`<rect y="${H}" width="${W}" height="6" fill="url(#gGold)"/>`)
  return { svg: parts.join('\n'), bottom: H + 6 }
}

/** Progress bar, brand wordmark and date — shared footer. */
function footer(detail: TournamentDetailDTO, y: number): { svg: string; bottom: number } {
  const { progress } = detail
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const ratio = progress.total > 0 ? Math.min(1, progress.completed / progress.total) : 0
  const filled = Math.max(progress.completed > 0 ? 10 : 0, Math.round(CW * ratio))
  const parts: string[] = [
    `<line x1="${M}" y1="${y}" x2="${W - M}" y2="${y}" stroke="${STROKE}" stroke-width="2"/>`,
    text(`${progress.completed} of ${progress.total} events completed`, { x: M, y: y + 58, size: 28, weight: 'regular', fill: MUTED }),
    `<rect x="${M}" y="${y + 84}" width="${CW}" height="10" rx="5" fill="${STROKE}"/>`,
    filled > 0 ? `<rect x="${M}" y="${y + 84}" width="${filled}" height="10" rx="5" fill="url(#gFill)"/>` : '',
    `<rect x="${M}" y="${y + 142}" width="14" height="14" rx="4" fill="${EMERALD}"/>`,
    text('TOURNY LITE', { x: M + 26, y: y + 155, size: 24, weight: 'semibold', fill: FAINT, letterSpacing: 4.5 }),
    text(date, { x: W - M, y: y + 155, size: 26, weight: 'regular', fill: MUTED, anchor: 'end' }),
  ]
  return { svg: parts.join('\n'), bottom: y + 200 }
}

function svgDocument(height: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">\n<rect width="${W}" height="${height}" fill="${PAPER}"/>\n${body}\n</svg>`
}

/** A podium row — medal coin, center identity, points.
 *  Centers without a name get their code as a big, confident
 *  team-number (small pills would leave the row feeling empty). */
function podiumRow(
  top: number,
  rank: 1 | 2 | 3,
  place: { code: string; name: string; location?: string },
  pts: number
): { svg: string; bottom: number } {
  const H = 140
  const badgeX = M + 30 + 42
  const nameX = M + 134
  const pointsEnd = W - M - 30
  const nameMax = pointsEnd - 200 - nameX
  const parts: string[] = [
    `<rect x="${M}" y="${top}" width="${CW}" height="${H}" rx="20" fill="${CARD}" stroke="${STROKE}" stroke-width="2"/>`,
    medalBadge(badgeX, top + H / 2, 42, rank),
  ]
  if (place.name) {
    const f = fit(place.name, 'medium', 36, nameMax, 28)
    parts.push(text(f.text, { x: nameX, y: top + 58, size: f.size, weight: 'medium', fill: INK }))
    const c = chip(place.code, nameX, top + 80, { filled: true })
    if (c) parts.push(c.svg)
  } else if (place.location) {
    parts.push(text(place.code, { x: nameX, y: top + 62, size: 40, weight: 'semibold', fill: INK }))
    const loc = fit(place.location, 'regular', 26, nameMax, 22)
    parts.push(text(loc.text, { x: nameX, y: top + 102, size: loc.size, weight: 'regular', fill: MUTED }))
  } else {
    parts.push(text(place.code, { x: nameX, y: top + 84, size: 40, weight: 'semibold', fill: INK }))
  }
  parts.push(
    `<text x="${pointsEnd}" y="${top + 76}" text-anchor="end" font-family="${LATIN}">` +
      `<tspan font-size="46" font-weight="600" fill="${INK}">${pts}</tspan>` +
      `<tspan dx="9" font-size="26" font-weight="400" fill="${MUTED}">pts</tspan>` +
      `</text>`
  )
  return { svg: parts.join('\n'), bottom: top + H }
}

// ── event card ───────────────────────────────────────────────

export function buildEventCard(
  detail: TournamentDetailDTO,
  eventId: string,
  opts?: { isCorrection?: boolean }
): ShareCard | null {
  const { tournament, divisions, centers } = detail
  const event = detail.events.find((e) => e.id === eventId) as EventDTO | undefined
  if (!event || !event.result) return null

  const places = (
    [
      [event.result.firstPlaceCode, 1],
      [event.result.secondPlaceCode, 2],
      [event.result.thirdPlaceCode, 3],
    ] as const
  ).flatMap(([code, rank]): { code: string; rank: 1 | 2 | 3 }[] =>
    code ? [{ code, rank }] : []
  )
  if (places.length === 0) return null // text fallback handles the edge

  const nameByCode = new Map(centers.map((c) => [c.centerCode, c]))
  const division = divisions.find((d) => d.code === event.divisionCode)
  const isCorrection = opts?.isCorrection === true
  const eyebrow = isCorrection ? 'CORRECTED RESULT' : 'EVENT RESULT'

  const parts: string[] = []
  const head = masthead(eyebrow, tournament.name, tournament.organizer)
  parts.push(head.svg)
  let y = head.bottom + 84

  const game = fit(event.gameName, 'semibold', 62, CW, 40)
  parts.push(text(game.text, { x: M, y, size: game.size, weight: 'semibold', fill: INK }))
  if (event.gameSinhalaName) {
    y += 58
    const si = fit(event.gameSinhalaName, 'regular', 40, CW, 32)
    parts.push(text(si.text, { x: M, y, size: si.size, weight: 'regular', fill: '#47504A', sinhala: true }))
  }

  y += 42
  const chips: string[] = []
  let chipX = M
  const chipTop = y
  for (const label of [
    division?.name ?? `Category ${event.divisionCode}`,
    division?.ageRange ? `Ages ${division.ageRange}` : null,
    event.subEventIndex > 1 ? `Slot ${event.subEventIndex}` : null,
  ]) {
    if (!label) continue
    const c = chip(label, chipX, chipTop)
    if (!c) break
    chips.push(c.svg)
    chipX = c.right + 14
  }
  parts.push(chips.join('\n'))
  y = chipTop + 58 + 40

  const medalPts = [tournament.pointsFirst, tournament.pointsSecond, tournament.pointsThird]
  for (const { code, rank } of places) {
    const center = nameByCode.get(code)
    const row = podiumRow(
      y,
      rank,
      { code, name: center?.centerName ?? '', location: center?.location ?? '' },
      medalPts[rank - 1]
    )
    parts.push(row.svg)
    y = row.bottom + 16
  }
  y += 22

  const scored = detail.standings.filter((r) => r.total > 0)
  if (scored.length > 0) {
    const top = scored.slice(0, 3)
    parts.push(text('OVERALL STANDINGS — TOTAL POINTS', { x: M, y: y + 24, size: 23, weight: 'semibold', fill: MUTED, letterSpacing: 5 }))
    const line = fit(
      top
        .map((r, i) => `${i + 1}. ${r.centerName ? `${r.centerName} (${r.centerCode})` : r.centerCode} — ${r.total} pts`)
        .join('  ·  '),
      'medium',
      31,
      CW,
      24
    )
    parts.push(text(line.text, { x: M, y: y + 74, size: line.size, weight: 'medium', fill: INK }))
    y += 110
  }

  const foot = footer(detail, y + 30)
  parts.push(foot.svg)

  const category = division ? `Cat ${division.code}` : `Cat ${event.divisionCode}`
  return {
    svg: svgDocument(foot.bottom, parts.join('\n')),
    caption: `${isCorrection ? '🔁 Corrected result' : '🏁 Event result'} · ${tournament.name} · ${event.gameName} (${category})`,
  }
}

// ── standings card ───────────────────────────────────────────

const MAX_STANDINGS_ROWS = 10

export function buildStandingsCard(detail: TournamentDetailDTO): ShareCard | null {
  const { tournament } = detail
  const scored = detail.standings.filter((r) => r.total > 0)
  if (scored.length === 0) return null

  const parts: string[] = []
  const head = masthead('STANDINGS', tournament.name, tournament.organizer)
  parts.push(head.svg)
  let y = head.bottom + 62

  const shown = scored.slice(0, MAX_STANDINGS_ROWS)
  const hidden = scored.length - shown.length
  const pointsEnd = W - M - 30
  const locationByCode = new Map(detail.centers.map((c) => [c.centerCode, c.location]))

  for (const row of shown) {
    const H = 112
    parts.push(`<rect x="${M}" y="${y}" width="${CW}" height="${H}" rx="20" fill="${CARD}" stroke="${STROKE}" stroke-width="2"/>`)
    if (row.rank <= 3) {
      parts.push(medalBadge(M + 26 + 36, y + H / 2, 36, row.rank as 1 | 2 | 3))
    } else {
      // Neutral coin — same geometry as the medals so every row's
      // identity column lines up, ranks beyond the podium stay quiet.
      parts.push(
        `<circle cx="${M + 62}" cy="${y + H / 2}" r="36" fill="none" stroke="#D5DFD8" stroke-width="2"/>`,
        text(String(row.rank), { x: M + 62, y: y + H / 2 + 14, size: 38, weight: 'semibold', fill: FAINT, anchor: 'middle' })
      )
    }
    const nameX = M + 112
    const nameMax = pointsEnd - 200 - nameX
    if (row.centerName) {
      const f = fit(row.centerName, 'medium', 34, nameMax, 26)
      parts.push(text(f.text, { x: nameX, y: y + 46, size: f.size, weight: 'medium', fill: INK }))
      const c = chip(row.centerCode, nameX, y + 58, { height: 44 })
      if (c) parts.push(c.svg)
    } else {
      const location = locationByCode.get(row.centerCode)
      if (location) {
        parts.push(text(row.centerCode, { x: nameX, y: y + 50, size: 38, weight: 'semibold', fill: INK }))
        const loc = fit(location, 'regular', 24, nameMax, 20)
        parts.push(text(loc.text, { x: nameX, y: y + 82, size: loc.size, weight: 'regular', fill: MUTED }))
      } else {
        parts.push(text(row.centerCode, { x: nameX, y: y + 70, size: 38, weight: 'semibold', fill: INK }))
      }
    }
    parts.push(
      `<text x="${pointsEnd}" y="${y + 64}" text-anchor="end" font-family="${LATIN}">` +
        `<tspan font-size="42" font-weight="600" fill="${INK}">${row.total}</tspan>` +
        `<tspan dx="9" font-size="24" font-weight="400" fill="${MUTED}">pts</tspan>` +
        `</text>`
    )
    y += H + 14
  }
  y -= 14

  if (hidden > 0) {
    parts.push(text(`and ${hidden} more center${hidden === 1 ? '' : 's'} below`, { x: W / 2, y: y + 52, size: 28, weight: 'regular', fill: FAINT, anchor: 'middle' }))
    y += 66
  }

  const foot = footer(detail, y + 30)
  parts.push(foot.svg)

  const { progress } = detail
  return {
    svg: svgDocument(foot.bottom, parts.join('\n')),
    caption: `🏆 ${tournament.name} — standings after ${progress.completed} of ${progress.total} events`,
  }
}

// ── rasterization ────────────────────────────────────────────

/**
 * Renders a card SVG to JPEG (WhatsApp's recommended image format —
 * smaller than PNG for these flat designs and previews crisply).
 */
export async function renderCardJpeg(svg: string): Promise<Buffer> {
  const { default: sharp } = await import('sharp')
  return sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer()
}
