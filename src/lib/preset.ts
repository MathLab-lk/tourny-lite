// ─────────────────────────────────────────────────────────────
// Preset Catalog — zero-typing tournament templates
// Preset 1: "Seed Ministries – Math Competition 2026"
// 5 divisions, 7 games, 39 pre-generated event slots,
// 6 pre-loaded center codes, 75/50/25 scoring scheme.
// ─────────────────────────────────────────────────────────────

export interface PresetDivision {
  code: string
  name: string
  ageRange: string
  gradeRange: string
  participantQuota: number
}

export interface PresetGame {
  code: string
  englishName: string
  sinhalaName: string
  rulesSummary: string
}

export interface TournamentPreset {
  id: string
  name: string
  organizer: string
  pointsFirst: number
  pointsSecond: number
  pointsThird: number
  divisions: PresetDivision[]
  games: PresetGame[]
  /** eventCounts[divisionCode][gameCode] = number of slots */
  eventCounts: Record<string, Record<string, number>>
  centerCodes: string[]
  summary: string
}

export const MATH_COMP_2026_PRESET: TournamentPreset = {
  id: 'math_comp_2026',
  name: 'Math Competition 2026',
  organizer: 'Seed Ministries',
  pointsFirst: 75,
  pointsSecond: 50,
  pointsThird: 25,
  divisions: [
    { code: 'A', name: 'Category A', ageRange: '5 to 8', gradeRange: '1, 2, 3', participantQuota: 5 },
    { code: 'B', name: 'Category B', ageRange: '9 to 10', gradeRange: '4, 5', participantQuota: 5 },
    { code: 'C', name: 'Category C', ageRange: '11 to 12', gradeRange: '6, 7', participantQuota: 5 },
    { code: 'D', name: 'Category D', ageRange: '13 to 15', gradeRange: '8, 9, 10', participantQuota: 5 },
    { code: 'E', name: 'Category E', ageRange: '15+', gradeRange: 'Open', participantQuota: 5 },
  ],
  games: [
    { code: 'niranchi', englishName: 'Niranchi', sinhalaName: 'නිරංචි', rulesSummary: 'Traditional counting-board strategy game.' },
    { code: 'carrom', englishName: 'Carrom', sinhalaName: 'කැරම්', rulesSummary: 'Finger-shooting board game; best of frames.' },
    { code: 'thai-dham', englishName: 'Thai Dham', sinhalaName: 'තායි දාම්', rulesSummary: 'Thai-dam checkers variant on 8x8 board.' },
    { code: 'tri-omino', englishName: 'Tri Omino', sinhalaName: '', rulesSummary: 'Triangular domino tile-matching game.' },
    { code: 'domino', englishName: 'Domino', sinhalaName: 'ඩොමිනෝ', rulesSummary: 'Classic double-six domino matching.' },
    { code: 'baugunaka-puwaruwa', englishName: 'Baugunaka Puwaruwa', sinhalaName: 'බහුගුණක පුවරුව', rulesSummary: 'Multiplication-board arithmetic race.' },
    { code: 'card', englishName: 'Card', sinhalaName: 'ගණිත කාඩ්', rulesSummary: 'Math card draw-and-solve speed round.' },
  ],
  eventCounts: {
    // Cat A: Domino 3, Baugunaka Puwaruwa 2, Card 3 → 8
    A: { domino: 3, 'baugunaka-puwaruwa': 2, card: 3 },
    // Cat B: Niranchi 2, Tri Omino 2, Baugunaka Puwaruwa 2, Card 2 → 8
    B: { niranchi: 2, 'tri-omino': 2, 'baugunaka-puwaruwa': 2, card: 2 },
    // Cat C: Carrom 2, Domino 2, Baugunaka Puwaruwa 2, Card 2 → 8
    C: { carrom: 2, domino: 2, 'baugunaka-puwaruwa': 2, card: 2 },
    // Cat D: Thai Dham 3, Card 3 → 6
    D: { 'thai-dham': 3, card: 3 },
    // Cat E: Niranchi 1, Carrom 2, Thai Dham 1, Tri Omino 1, Domino 1, Baugunaka Puwaruwa 1, Card 2 → 9
    E: {
      niranchi: 1,
      carrom: 2,
      'thai-dham': 1,
      'tri-omino': 1,
      domino: 1,
      'baugunaka-puwaruwa': 1,
      card: 2,
    },
  },
  centerCodes: ['101', '103', '105', '111', '401', '414'],
  summary: '5 divisions · 7 games · 39 events · 6 centers · 75/50/25 points',
}

export const PRESETS: TournamentPreset[] = [MATH_COMP_2026_PRESET]

/** Master game library offered in the custom tournament wizard. */
export const MASTER_GAME_LIBRARY: PresetGame[] = MATH_COMP_2026_PRESET.games

export function getPresetById(id: string): TournamentPreset | undefined {
  return PRESETS.find((p) => p.id === id)
}

export function countPresetEvents(preset: TournamentPreset): number {
  return Object.values(preset.eventCounts).reduce(
    (sum, byGame) => sum + Object.values(byGame).reduce((a, b) => a + b, 0),
    0
  )
}
