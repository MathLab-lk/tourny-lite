#!/usr/bin/env node
/**
 * Tourny Lite — standalone output preparer (Next.js 16 / Turbopack layout)
 *
 * Next 16 nests the standalone server under `.next/standalone/<package-name>/`
 * instead of the standalone root. This script locates the app directory (the
 * one containing server.js) and places the static assets and public files
 * where the server expects them:
 *
 *   .next/standalone/<app>/.next/static   <- from .next/static
 *   .next/standalone/<app>/public         <- from public/
 *
 * It also supports the classic flat layout (server.js at the standalone root)
 * so it keeps working if the layout changes again.
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const standaloneDir = join(root, '.next', 'standalone')

if (!existsSync(standaloneDir)) {
  console.error('[prepare-standalone] .next/standalone not found — did `next build` run?')
  process.exit(1)
}

// Locate the directory containing server.js (Next 16 nests it one level down)
const nested = readdirSync(standaloneDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
  .map((entry) => join(standaloneDir, entry.name))
  .find((dir) => existsSync(join(dir, 'server.js')))

const appDir = existsSync(join(standaloneDir, 'server.js'))
  ? standaloneDir // classic flat layout
  : nested

if (!appDir) {
  console.error('[prepare-standalone] Could not locate server.js inside .next/standalone')
  process.exit(1)
}

// Static chunks -> <app>/.next/static
mkdirSync(join(appDir, '.next'), { recursive: true })
cpSync(join(root, '.next', 'static'), join(appDir, '.next', 'static'), { recursive: true })

// Public assets -> <app>/public
if (existsSync(join(root, 'public'))) {
  cpSync(join(root, 'public'), join(appDir, 'public'), { recursive: true })
}

const rel = relative(root, appDir)
console.log(`[prepare-standalone] Standalone entrypoint: ${rel}/server.js`)
console.log('[prepare-standalone] Copied .next/static and public/ into the standalone bundle')
