#!/usr/bin/env node
/**
 * Tourny Lite — standalone output normalizer (Next.js 16 / Turbopack)
 *
 * Two environment-dependent behaviors of Next 16 standalone output are
 * normalized here so the runtime layout is identical everywhere:
 *
 *  1. Nesting — without a pinned tracing root, Next nests the bundle under
 *     the app's path relative to the nearest ancestor workspace (lockfile)
 *     root, which differs between machines, CI and Docker. next.config.ts
 *     pins `outputFileTracingRoot` to the project directory; this script
 *     additionally flattens any nested bundle as a safety net.
 *
 *  2. Absolute symlinks — Turbopack's traced output can reference traced
 *     packages via absolute symlinks (e.g. the hash-aliased @prisma/client
 *     external module). Absolute paths never survive relocation into a
 *     container, so every symlink inside the bundle is rewritten to a
 *     relative one (or materialized when it points outside the bundle).
 *
 * Result — the classic flat, relocatable bundle:
 *
 *   .next/standalone/server.js        <- entrypoint (stable path)
 *   .next/standalone/.next/static     <- client chunks from .next/static
 *   .next/standalone/public           <- public assets
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

const root = process.cwd()
const standaloneDir = join(root, '.next', 'standalone')

if (!existsSync(standaloneDir)) {
  console.error('[prepare-standalone] .next/standalone not found — did `next build` run?')
  process.exit(1)
}

// Locate the directory containing server.js (covers flat and nested layouts)
function findAppDir(dir, depth = 0) {
  if (existsSync(join(dir, 'server.js'))) return dir
  if (depth >= 6) return null
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const found = findAppDir(join(dir, entry.name), depth + 1)
    if (found) return found
  }
  return null
}

const appDir = findAppDir(standaloneDir)

if (!appDir) {
  console.error('[prepare-standalone] Could not locate server.js inside .next/standalone')
  process.exit(1)
}

// 1. Static chunks + public assets into the app bundle
mkdirSync(join(appDir, '.next'), { recursive: true })
cpSync(join(root, '.next', 'static'), join(appDir, '.next', 'static'), { recursive: true })
if (existsSync(join(root, 'public'))) {
  cpSync(join(root, 'public'), join(appDir, 'public'), { recursive: true })
}

// 2. Flatten a nested bundle up to the standalone root
if (appDir !== standaloneDir) {
  for (const entry of readdirSync(appDir, { withFileTypes: true })) {
    const src = join(appDir, entry.name)
    const dest = join(standaloneDir, entry.name)
    if (entry.isDirectory() && entry.name === 'node_modules') {
      // Merge the traced dependencies over the root-level tree (same
      // versions from the same lockfile — union, like a Docker COPY).
      cpSync(src, dest, { recursive: true, force: true })
    } else {
      rmSync(dest, { recursive: true, force: true })
      cpSync(src, dest, { recursive: true })
    }
  }
  rmSync(appDir, { recursive: true, force: true })
  console.log(`[prepare-standalone] Flattened nested bundle (${relative(standaloneDir, appDir)}) to the standalone root`)
}

// 3. Make every symlink in the bundle relocatable. After flattening, paths
//    that lived under the nested app dir now live at the standalone root.
const remap = (p) =>
  appDir !== standaloneDir && p.startsWith(appDir + '/')
    ? join(standaloneDir, p.slice(appDir.length + 1))
    : p

const symlinks = []
;(function collect(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isSymbolicLink()) symlinks.push(p)
    else if (entry.isDirectory()) collect(p)
  }
})(standaloneDir)

let rewritten = 0
let materialized = 0
for (const link of symlinks) {
  const raw = readlinkSync(link)
  let target = isAbsolute(raw) ? raw : resolve(dirname(link), raw)
  target = remap(target)

  if (!existsSync(target)) {
    console.warn(`[prepare-standalone] warning: dangling symlink ${relative(standaloneDir, link)} -> ${raw}`)
    continue
  }
  if (target === standaloneDir || target.startsWith(standaloneDir + '/')) {
    // Inside the bundle: rewrite as a relative link — survives relocation.
    rmSync(link, { force: true })
    symlinkSync(relative(dirname(link), target), link)
    rewritten++
  } else {
    // Outside the bundle (e.g. the project's own node_modules): materialize
    // it so the bundle is self-contained.
    rmSync(link, { force: true })
    cpSync(target, link, { recursive: true, dereference: true })
    materialized++
  }
}
if (rewritten || materialized) {
  console.log(`[prepare-standalone] Relocatable symlinks: ${rewritten} rewritten, ${materialized} materialized`)
}

console.log('[prepare-standalone] Standalone entrypoint: .next/standalone/server.js')
