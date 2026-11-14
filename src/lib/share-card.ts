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
// The design mirrors the app's "liquid glass" theme: a deep
// blue-charcoal night sky with a constellation of glowing dots,
// glass panels with hairline light borders and specular top rims
// (the starfield ghosts through at 90% panel opacity), one
// steel-blue accent, and gold reserved for the champion.
//
// Every text element is fitted with measured widths (card-fonts)
// so long center or game names shrink before they ever overflow.
// ─────────────────────────────────────────────────────────────

const W = 1080 // canvas width — displays full-width in WhatsApp
const M = 64 // side margin
const CW = W - 2 * M // content width

// Brand — the app's "liquid glass night" palette (see globals.css):
// deep blue-charcoal sky, steel-blue accent, gold for the champion.
const INK = '#F2F4F9'
const MUTED = '#B3BCCB'
const FAINT = '#8E97AB'
const SINHALA_INK = '#C3CBDA'
const ACCENT = '#6FAEE8'
const ACCENT_URL = '#D9E8F8'
const PANEL_EDGE = '#5A6A8C'
const COIN_EDGE = '#7C8BAD'
// The event accent — gold marks a single event's podium (the glow
// of victory); steel blue stays the voice of the overall standings.
// One color per story, so the group tells them apart at a glance.
const GOLD = '#E9C64A'
const GOLD_EDGE = '#D9B44A'

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

// ── starfield ────────────────────────────────────────────────

/** Deterministic PRNG — the same card always renders the same sky. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const STAR_COLORS = ['#9FB2D8', '#C4CFE8', '#8A7BA8']

/** A constellation of glowing dots with hairline connections —
 *  the card's night sky, laid under everything (it shows through
 *  the glass panels). `quietBands` clears the sky around small
 *  text blocks that sit directly on it, so nothing competes with
 *  a caption baseline. */
function starfield(w: number, h: number, quietBands: Array<[number, number]> = []): string {
  const inQuietBand = (y: number): boolean =>
    quietBands.some(([a, b]) => y > a - 26 && y < b + 26)
  // Dots only clear out of the content column (they never sit under
  // text there); the margins keep their sky at every height.
  const quietDot = (x: number, y: number): boolean =>
    x > M - 30 && x < w - M + 30 && inQuietBand(y)
  const rand = mulberry32(0x5eed42)
  const parts: string[] = []
  const dots: { x: number; y: number }[] = []
  const count = Math.max(46, Math.round((w * h) / 15000))
  for (let i = 0; i < count; i++) {
    const x = Math.round(rand() * w * 10) / 10
    const y = Math.round(rand() * h * 10) / 10
    if (quietDot(x, y)) continue
    const r = Math.round((0.9 + rand() * 2.1) * 100) / 100
    const color = STAR_COLORS[Math.floor(rand() * STAR_COLORS.length)] ?? STAR_COLORS[0]
    const opacity = Math.round((0.12 + rand() * 0.26) * 1000) / 1000
    dots.push({ x, y })
    // a soft halo on the brighter stars
    if (rand() < 0.2) {
      parts.push(`<circle cx="${x}" cy="${y}" r="${Math.round(r * 3.6 * 10) / 10}" fill="${color}" opacity="${Math.round(opacity * 200) / 1000}"/>`)
    }
    parts.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${opacity}"/>`)
  }
  // a few hairline connections between neighbouring stars —
  // never across a quiet band (lines are long, full-width quiet)
  let links = 0
  for (let i = 0; i < dots.length && links < 11; i++) {
    const a = dots[i]
    for (let j = i + 1; j < dots.length; j++) {
      const b = dots[j]
      const d2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2
      if (d2 > 70 * 70 && d2 < 170 * 170 && rand() < 0.09) {
        if (!inQuietBand(a.y) && !inQuietBand(b.y) && !inQuietBand((a.y + b.y) / 2)) {
          parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#7A8DBD" stroke-opacity="0.09" stroke-width="1"/>`)
          links++
        }
        break
      }
    }
  }
  return parts.join('\n')
}

// ── building blocks ──────────────────────────────────────────

/** Shared gradient + filter definitions (emitted once per card). */
function defs(): string {
  return [
    `<defs>`,
    `<linearGradient id="gBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A1C25"/><stop offset="1" stop-color="#12131A"/></linearGradient>`,
    `<radialGradient id="gGlowGold" cx="0.5" cy="0" r="0.85"><stop offset="0" stop-color="#E9C64A" stop-opacity="0.09"/><stop offset="1" stop-color="#E9C64A" stop-opacity="0"/></radialGradient>`,
    `<radialGradient id="gGlowBlue" cx="0.5" cy="0" r="0.85"><stop offset="0" stop-color="#4A8FD0" stop-opacity="0.1"/><stop offset="1" stop-color="#4A8FD0" stop-opacity="0"/></radialGradient>`,
    `<linearGradient id="gPanel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3B465E"/><stop offset="1" stop-color="#2A3242"/></linearGradient>`,
    `<linearGradient id="gEdge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8FA3C8" stop-opacity="0.9"/><stop offset="1" stop-color="#8FA3C8" stop-opacity="0.28"/></linearGradient>`,
    `<linearGradient id="gWatch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22588B"/><stop offset="1" stop-color="#17466E"/></linearGradient>`,
    `<linearGradient id="gFill" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4A8FD0"/><stop offset="1" stop-color="#2E639C"/></linearGradient>`,
    `<linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#EFC63E"/><stop offset="1" stop-color="#C99410"/></linearGradient>`,
    `<linearGradient id="gSilver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E3E9E6"/><stop offset="1" stop-color="#96A19B"/></linearGradient>`,
    `<linearGradient id="gBronze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#DCA36C"/><stop offset="1" stop-color="#A9662F"/></linearGradient>`,
    `<filter id="fSoft" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="11"/></filter>`,
    `</defs>`,
  ].join('')
}

/** A glass panel — soft ambient shadow, translucent body (the
 *  starfield shows through), a light border that is brighter along
 *  the top edge, and a specular top rim. The signature surface of
 *  the theme. `edge` overrides the border (the champion's gold). */
function panel(x: number, y: number, w: number, h: number, rx = 30, edge?: string): string {
  const border = edge
    ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="none" stroke="${edge}" stroke-opacity="0.85" stroke-width="2"/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="none" stroke="url(#gEdge)" stroke-width="2"/>`
  return [
    `<rect x="${x + 8}" y="${y + 14}" width="${w - 16}" height="${h}" rx="${rx}" fill="#06070B" opacity="0.55" filter="url(#fSoft)"/>`,
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="url(#gPanel)" fill-opacity="0.82"/>`,
    border,
    `<rect x="${x + 16}" y="${y + 2}" width="${Math.max(0, w - 32)}" height="3" rx="1.5" fill="#FFFFFF" opacity="0.16"/>`,
  ].join('\n')
}

/** A rounded glass chip ("Category B", "Ages 9 to 10"). */
function chip(
  t: string,
  x: number,
  top: number,
  opts?: { filled?: boolean; height?: number }
): { svg: string; right: number } | null {
  const size = opts?.height && opts?.height < 50 ? 25 : 28
  const h = opts?.height ?? 58
  const padX = opts?.height && opts?.height < 50 ? 20 : 26
  const w = Math.round(width(t, 'medium', size) + padX * 2)
  if (x + w > W - M) return null // never overflow — drop the chip instead
  const svg = [
    `<rect x="${x}" y="${top}" width="${w}" height="${h}" rx="${h / 2}" fill="none" stroke="${PANEL_EDGE}" stroke-opacity="0.75" stroke-width="2"/>`,
    text(t, { x: x + w / 2, y: baseline(top, h, size), size, weight: 'medium', fill: MUTED, anchor: 'middle' }),
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
    `<circle cx="${cx - r * 0.34}" cy="${cy - r * 0.4}" r="${r * 0.16}" fill="#FFFFFF" opacity="0.4"/>`,
    text(String(rank), { x: cx, y: cy + r * 0.36, size, weight: 'semibold', fill: skins.numeral, anchor: 'middle' }),
  ].join('')
}

/** Title block on the night sky for the standings card — blue
 *  eyebrow, the tournament as the hero (it is the story there),
 *  organizer below, closed by a hairline. */
function masthead(eyebrow: string, title: string, organizer: string): { svg: string; bottom: number } {
  const parts: string[] = [
    text(eyebrow, { x: M, y: 124, size: 30, weight: 'semibold', fill: ACCENT, letterSpacing: 7 }),
  ]
  const fitted = fit(title, 'semibold', 60, CW, 44)
  parts.push(text(fitted.text, { x: M, y: 188 + (60 - fitted.size) / 2, size: fitted.size, weight: 'semibold', fill: INK }))
  if (organizer.trim()) {
    const f = fit(organizer.trim(), 'regular', 30, CW, 24)
    parts.push(text(f.text, { x: M, y: 250 + (30 - f.size) / 2, size: f.size, weight: 'regular', fill: MUTED }))
  }
  parts.push(`<rect x="${M}" y="292" width="${CW}" height="2" rx="1" fill="#FFFFFF" opacity="0.08"/>`)
  return { svg: parts.join('\n'), bottom: 294 }
}

/** Header for the event card — there the game is the story, so it
 *  leads: gold eyebrow, the game name as the hero, its Sinhala
 *  name, then the tournament and organizer as one quiet context
 *  line. Someone glancing at the thumbnail reads who won what
 *  before anything else. */
function eventHeader(
  eyebrow: string,
  game: string,
  sinhala: string,
  tournament: string,
  organizer: string
): { svg: string; bottom: number; quiet: Array<[number, number]> } {
  const quiet: Array<[number, number]> = []
  const parts: string[] = [
    text(eyebrow, { x: M, y: 124, size: 30, weight: 'semibold', fill: GOLD, letterSpacing: 7 }),
  ]
  const hero = fit(game, 'semibold', 64, CW, 46)
  parts.push(text(hero.text, { x: M, y: 190 + (64 - hero.size) / 2, size: hero.size, weight: 'semibold', fill: INK }))
  let y = 248
  if (sinhala.trim()) {
    const si = fit(sinhala.trim(), 'regular', 38, CW, 30)
    parts.push(text(si.text, { x: M, y: y + (38 - si.size) / 2, size: si.size, weight: 'regular', fill: SINHALA_INK, sinhala: true }))
    quiet.push([y - 34, y + 12])
    y += 52
  }
  const context = [tournament, organizer.trim()].filter(Boolean).join('  ·  ')
  const ctx = fit(context, 'regular', 30, CW, 24)
  parts.push(text(ctx.text, { x: M, y: y + (30 - ctx.size) / 2, size: ctx.size, weight: 'regular', fill: MUTED }))
  quiet.push([y - 28, y + 10])
  y += 46
  parts.push(`<rect x="${M}" y="${y}" width="${CW}" height="2" rx="1" fill="#FFFFFF" opacity="0.08"/>`)
  return { svg: parts.join('\n'), bottom: y + 2, quiet }
}

/** Progress bar, brand wordmark and date — shared footer. */
function footer(detail: TournamentDetailDTO, y: number): { svg: string; bottom: number } {
  const { progress } = detail
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const ratio = progress.total > 0 ? Math.min(1, progress.completed / progress.total) : 0
  const filled = Math.max(progress.completed > 0 ? 10 : 0, Math.round(CW * ratio))
  const parts: string[] = [
    `<rect x="${M}" y="${y}" width="${CW}" height="2" rx="1" fill="#FFFFFF" opacity="0.08"/>`,
    text(`${progress.completed} of ${progress.total} events completed`, { x: M, y: y + 58, size: 28, weight: 'regular', fill: MUTED }),
    `<rect x="${M}" y="${y + 84}" width="${CW}" height="10" rx="5" fill="#FFFFFF" opacity="0.1"/>`,
    filled > 0
      ? `<rect x="${M}" y="${y + 84}" width="${filled}" height="10" rx="5" fill="url(#gFill)"/>` +
        `<rect x="${M + 2}" y="${y + 85.5}" width="${Math.max(0, filled - 4)}" height="2" rx="1" fill="#FFFFFF" opacity="0.3"/>`
      : '',
    `<rect x="${M}" y="${y + 142}" width="14" height="14" rx="4" fill="url(#gFill)"/>`,
    text('TOURNY LITE', { x: M + 26, y: y + 155, size: 24, weight: 'semibold', fill: FAINT, letterSpacing: 4.5 }),
    text(date, { x: W - M, y: y + 155, size: 26, weight: 'regular', fill: MUTED, anchor: 'end' }),
  ]
  return { svg: parts.join('\n'), bottom: y + 200 }
}

/** The guest link bar — a lit glass pill inviting the group to
 *  open the live scoreboard (`live`, the overall standings page) or
 *  this result's own page (`result`). The full URL rides along in
 *  the image caption (where WhatsApp makes it tappable); the bar
 *  shows it without the protocol so it stays as large as possible. */
function watchLiveBar(y: number, url: string, kind: 'live' | 'result' = 'live'): { svg: string; bottom: number } {
  const H = 92
  const padX = 26
  const icoR = 15
  const icoCx = M + padX + icoR
  const labelX = icoCx + icoR + 20
  const label = kind === 'result' ? 'VIEW RESULT' : 'WATCH LIVE'
  const labelW = width(label, 'semibold', 26, 3)
  // A clear gap + a faint divider keeps the label and the address
  // from running together when the URL is long.
  const gap = 38
  const urlX = labelX + labelW + gap
  const urlMax = W - M - padX - urlX
  const display = url.replace(/^https?:\/\//, '')
  const fitted = fit(display, 'medium', 29, urlMax, 22)
  // Play triangle for the live scoreboard; a podium glyph for a
  // single event's result page.
  const icon =
    kind === 'result'
      ? [
          `<rect x="${icoCx - 11}" y="${y + H / 2 - 3}" width="6.5" height="10" rx="1.6" fill="#FFFFFF" opacity="0.62"/>`,
          `<rect x="${icoCx - 3.25}" y="${y + H / 2 - 10}" width="6.5" height="17" rx="1.6" fill="#FFFFFF"/>`,
          `<rect x="${icoCx + 4.5}" y="${y + H / 2 - 1}" width="6.5" height="8" rx="1.6" fill="#FFFFFF" opacity="0.62"/>`,
        ].join('')
      : `<path d="M ${icoCx - 5} ${y + H / 2 - 7} L ${icoCx + 8} ${y + H / 2} L ${icoCx - 5} ${y + H / 2 + 7} Z" fill="#FFFFFF"/>`
  return {
    svg: [
      `<rect x="${M + 6}" y="${y + 12}" width="${CW - 12}" height="${H}" rx="${H / 2}" fill="#06070B" opacity="0.5" filter="url(#fSoft)"/>`,
      `<rect x="${M}" y="${y}" width="${CW}" height="${H}" rx="${H / 2}" fill="url(#gWatch)" fill-opacity="0.96"/>`,
      `<rect x="${M}" y="${y}" width="${CW}" height="${H}" rx="${H / 2}" fill="none" stroke="#4E8FCB" stroke-opacity="0.55" stroke-width="2"/>`,
      `<rect x="${M + 18}" y="${y + 3}" width="${CW - 36}" height="3" rx="1.5" fill="#FFFFFF" opacity="0.12"/>`,
      `<circle cx="${icoCx}" cy="${y + H / 2}" r="${icoR}" fill="#FFFFFF" opacity="0.26"/>`,
      icon,
      text(label, { x: labelX, y: baseline(y, H, 26), size: 26, weight: 'semibold', fill: '#FFFFFF', letterSpacing: 3 }),
      `<rect x="${Math.round(labelX + labelW + gap / 2)}" y="${y + H / 2 - 14}" width="2" height="28" rx="1" fill="#FFFFFF" opacity="0.45"/>`,
      text(fitted.text, { x: urlX, y: baseline(y, H, fitted.size), size: fitted.size, weight: 'medium', fill: ACCENT_URL }),
    ].join('\n'),
    bottom: y + H,
  }
}

function svgDocument(
  height: number,
  body: string,
  quietBands: Array<[number, number]> = [],
  glow: 'gold' | 'blue' = 'blue'
): string {
  const glowRect = `<rect width="${W}" height="${height}" fill="url(#gGlow${glow === 'gold' ? 'Gold' : 'Blue'})"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">\n${defs()}\n<rect width="${W}" height="${height}" fill="url(#gBg)"/>\n${glowRect}\n${starfield(W, height, quietBands)}\n${body}\n</svg>`
}

/** A podium row — medal coin, center identity, points. The
 *  champion's row is taller with a larger coin and a gold rim, so
 *  the eye lands on the winner first; silver and bronze read as
 *  the supporting cast. Centers without a name get their code as a
 *  big, confident team-number. */
function podiumRow(
  top: number,
  rank: 1 | 2 | 3,
  place: { code: string; name: string; location?: string },
  pts: number
): { svg: string; bottom: number } {
  const champ = rank === 1
  const H = champ ? 176 : 140
  const r = champ ? 50 : 42
  const badgeX = M + 28 + r
  const nameX = M + 28 + 2 * r + (champ ? 26 : 24)
  const pointsEnd = W - M - 30
  const nameMax = pointsEnd - 200 - nameX
  const parts: string[] = [
    panel(M, top, CW, H, 28, champ ? GOLD_EDGE : undefined),
    medalBadge(badgeX, top + H / 2, r, rank),
  ]
  if (place.name) {
    const f = fit(place.name, champ ? 'semibold' : 'medium', champ ? 42 : 36, nameMax, champ ? 32 : 28)
    parts.push(text(f.text, { x: nameX, y: champ ? top + 66 : top + 54, size: f.size, weight: champ ? 'semibold' : 'medium', fill: INK }))
    const c = chip(place.code, nameX, champ ? top + 84 : top + 72, { height: champ ? 52 : 48 })
    if (c) parts.push(c.svg)
  } else if (place.location) {
    parts.push(text(place.code, { x: nameX, y: champ ? top + 76 : top + 62, size: champ ? 46 : 40, weight: 'semibold', fill: INK }))
    const loc = fit(place.location, 'regular', 26, nameMax, 22)
    parts.push(text(loc.text, { x: nameX, y: champ ? top + 120 : top + 102, size: loc.size, weight: 'regular', fill: MUTED }))
  } else {
    parts.push(text(place.code, { x: nameX, y: champ ? top + 104 : top + 84, size: champ ? 46 : 40, weight: 'semibold', fill: INK }))
  }
  const big = champ ? 52 : 46
  const small = champ ? 28 : 26
  parts.push(
    `<text x="${pointsEnd}" y="${top + H / 2 + (champ ? 18 : 12)}" text-anchor="end" font-family="${LATIN}">` +
      `<tspan font-size="${big}" font-weight="600" fill="${INK}">${pts}</tspan>` +
      `<tspan dx="9" font-size="${small}" font-weight="400" fill="${MUTED}">pts</tspan>` +
      `</text>`
  )
  return { svg: parts.join('\n'), bottom: top + H }
}

// ── event card ───────────────────────────────────────────────

export function buildEventCard(
  detail: TournamentDetailDTO,
  eventId: string,
  opts?: { isCorrection?: boolean; eventUrl?: string | null }
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
  const quiet: Array<[number, number]> = []
  const head = eventHeader(
    eyebrow,
    event.gameName,
    event.gameSinhalaName,
    tournament.name,
    tournament.organizer
  )
  parts.push(head.svg)
  quiet.push(...head.quiet)
  let y = head.bottom + 54

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
  quiet.push([chipTop - 12, chipTop + 70])
  y = chipTop + 58 + 30

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
    y = row.bottom + (rank === 1 ? 18 : 16)
  }
  y += 22

  // The quiet overall line — the top of the table without the
  // podium fanfare: names and points, nothing else.
  const scored = detail.standings.filter((r) => r.total > 0)
  if (scored.length > 0) {
    const top = scored.slice(0, 3)
    parts.push(text('OVERALL STANDINGS', { x: M, y: y + 24, size: 23, weight: 'semibold', fill: FAINT, letterSpacing: 5 }))
    const line = fit(
      top
        .map((r, i) => `${i + 1}. ${r.centerName || r.centerCode} ${r.total} pts`)
        .join('  ·  '),
      'medium',
      31,
      CW,
      24
    )
    parts.push(text(line.text, { x: M, y: y + 74, size: line.size, weight: 'medium', fill: '#E3E8F2' }))
    quiet.push([y - 10, y + 88])
    y += 110
  }

  if (opts?.eventUrl) {
    const bar = watchLiveBar(y + 22, opts.eventUrl, 'result')
    parts.push(bar.svg)
    quiet.push([y + 4, bar.bottom])
    y = bar.bottom + 12
  }

  const foot = footer(detail, y + 30)
  parts.push(foot.svg)
  quiet.push([y + 26, foot.bottom])

  const category = division ? `Cat ${division.code}` : `Cat ${event.divisionCode}`
  return {
    svg: svgDocument(foot.bottom, parts.join('\n'), quiet, 'gold'),
    caption:
      `${isCorrection ? '🔁 Corrected result' : '🏁 Event result'} · ${tournament.name} · ${event.gameName} (${category})` +
      (opts?.eventUrl ? `\n${opts.eventUrl}` : ''),
  }
}

// ── standings card ───────────────────────────────────────────

const MAX_STANDINGS_ROWS = 10

export function buildStandingsCard(
  detail: TournamentDetailDTO,
  opts?: { presentUrl?: string | null }
): ShareCard | null {
  const { tournament } = detail
  const scored = detail.standings.filter((r) => r.total > 0)
  if (scored.length === 0) return null

  const parts: string[] = []
  const quiet: Array<[number, number]> = [[218, 268]] // organizer line
  const head = masthead('OVERALL STANDINGS', tournament.name, tournament.organizer)
  parts.push(head.svg)
  let y = head.bottom + 46

  const shown = scored.slice(0, MAX_STANDINGS_ROWS)
  const hidden = scored.length - shown.length
  const pointsEnd = W - M - 30
  const locationByCode = new Map(detail.centers.map((c) => [c.centerCode, c.location]))

  for (const row of shown) {
    const H = 112
    parts.push(panel(M, y, CW, H, 28))
    // The leader carries a small gold tab on the left edge — who is
    // winning overall is the one question every reader brings.
    if (row.rank === 1) {
      parts.push(`<rect x="${M + 5}" y="${y + 26}" width="5" height="${H - 52}" rx="2.5" fill="url(#gGold)"/>`)
    }
    if (row.rank <= 3) {
      parts.push(medalBadge(M + 26 + 36, y + H / 2, 36, row.rank as 1 | 2 | 3))
    } else {
      // Neutral coin — same geometry as the medals so every row's
      // identity column lines up, ranks beyond the podium stay quiet.
      parts.push(
        `<circle cx="${M + 62}" cy="${y + H / 2}" r="36" fill="none" stroke="${COIN_EDGE}" stroke-opacity="0.95" stroke-width="2"/>`,
        text(String(row.rank), { x: M + 62, y: y + H / 2 + 14, size: 38, weight: 'semibold', fill: MUTED, anchor: 'middle' })
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
    quiet.push([y + 18, y + 58])
    y += 66
  }

  if (opts?.presentUrl) {
    const bar = watchLiveBar(y + 22, opts.presentUrl)
    parts.push(bar.svg)
    quiet.push([y + 4, bar.bottom])
    y = bar.bottom + 12
  }

  const foot = footer(detail, y + 30)
  parts.push(foot.svg)
  quiet.push([y + 26, foot.bottom])

  const { progress } = detail
  return {
    svg: svgDocument(foot.bottom, parts.join('\n'), quiet),
    caption:
      `🏆 ${tournament.name} — standings after ${progress.completed} of ${progress.total} events` +
      (opts?.presentUrl ? `\n${opts.presentUrl}` : ''),
  }
}

// ── rasterization ────────────────────────────────────────────

/**
 * Renders a card SVG to JPEG (WhatsApp's recommended image format —
 * smaller than PNG and previews crisply).
 */
export async function renderCardJpeg(svg: string): Promise<Buffer> {
  const { default: sharp } = await import('sharp')
  return sharp(Buffer.from(svg)).jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer()
}
