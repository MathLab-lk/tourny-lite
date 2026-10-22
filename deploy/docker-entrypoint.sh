#!/bin/sh
# ------------------------------------------------------------------------------
# Tourny Lite — container entrypoint
#   1. Repair SQLite volume ownership, then drop to the unprivileged app user
#   2. Apply the Prisma schema to the SQLite volume (idempotent)
#   3. Enable WAL journaling (concurrent readers for the live scoreboard)
#   4. Start the standalone Next.js server
# ------------------------------------------------------------------------------
set -e

# When started as root: fix volume permissions, then re-run as "app".
# Bind-mounted volumes are created root-owned by Docker; the app user needs
# write access for the SQLite database and its WAL files.
if [ "$(id -u)" = "0" ]; then
  chown -R app:app /app/db 2>/dev/null || true
  exec su-exec app:app "$0" "$@"
fi

echo "[entrypoint] Applying database schema…"
./node_modules/.bin/prisma db push --skip-generate --accept-data-loss

echo "[entrypoint] Enabling SQLite WAL journaling…"
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.\$queryRawUnsafe('PRAGMA journal_mode=WAL;').then(async r=>{console.log('[entrypoint] journal_mode:',r[0]&&r[0].journal_mode);await p.\$disconnect()}).catch(e=>{console.error('[entrypoint] WAL setup skipped:',e.message)})"

echo "[entrypoint] Starting Tourny Lite on ${HOSTNAME:-0.0.0.0}:${PORT:-8090}…"
exec "$@"
