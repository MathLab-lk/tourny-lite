#!/usr/bin/env node
/**
 * Tourny Lite — one-off data fix: renames the misspelled game
 * "Baugunaka Puwaruwa" → "Bahugunaka Puwaruwa" in existing databases.
 *
 * The 2026 preset shipped with the typo; tournaments created from it
 * stored the misspelled display name (the internal game code is
 * unchanged, so results and events are untouched). Run once after
 * updating to the fixed version:
 *
 *   node scripts/fix-game-name.mjs
 *
 * Safe to re-run (updates only exact old spellings).
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const RENAMES = [
  { from: 'Baugunaka Puwaruwa', to: 'Bahugunaka Puwaruwa' },
]

async function main() {
  for (const { from, to } of RENAMES) {
    const updated = await prisma.gameType.updateMany({
      where: { englishName: from },
      data: { englishName: to },
    })
    console.log(
      updated.count > 0
        ? `Renamed ${updated.count} game row(s): "${from}" → "${to}"`
        : `No rows named "${from}" — nothing to do (already fixed?)`
    )
  }
}

main()
  .catch((err) => {
    console.error('Fix failed:', err.message)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
