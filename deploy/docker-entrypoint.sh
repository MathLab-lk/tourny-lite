#!/bin/sh
# ------------------------------------------------------------------------------
# Tourny Lite — container entrypoint
# Applies the Prisma schema to the SQLite volume (idempotent), enables WAL
# journaling for concurrent readers (SSE scoreboard) + writers (judges),
# then starts the standalone Next.js server.
# ------------------------------------------------------------------------------
set -e

echo "[entrypoint] Applying database schema (prisma db push)…"
./node_modules/.bin/prisma db push --skip-generate --accept-data-loss

echo "[entrypoint] Enabling SQLite WAL mode…"
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.\$queryRawUnsafe('PRAGMA journal_mode=WAL;').then(async r=>{console.log('journal_mode:',r[0]&&r[0].journal_mode);await p.\$disconnect()}).catch(e=>{console.error('WAL enable failed (continuing):',e.message);process.exit(0)})"

echo "[entrypoint] Starting Tourny Lite on ${HOSTNAME:-0.0.0.0}:${PORT:-8090}…"
exec "$@"
