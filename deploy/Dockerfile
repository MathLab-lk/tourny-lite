# ------------------------------------------------------------------------------
# Tourny Lite — Production Multi-Stage Dockerfile
# Single self-contained container: Next.js standalone server + embedded SQLite
# database + the Prisma toolchain needed to apply the schema on startup.
#
#   Build:  docker build -t tourny-lite -f deploy/Dockerfile .
#   Run:    docker compose -f deploy/docker-compose.yml up -d --build
#
# No external database container is required — data persists in the /app/db
# volume (SQLite + WAL journal files).
# ------------------------------------------------------------------------------

# ------------------------------------------------------------------------------
# Stage 1: Full dependency install (used by the builder)
# ------------------------------------------------------------------------------
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ------------------------------------------------------------------------------
# Stage 2: Production dependencies (shipped in the runtime image)
# Installs the complete dependency tree — including the Prisma CLI and its
# full toolchain (@prisma/engines, @prisma/config, and friends) — which the
# entrypoint needs to apply the database schema on startup.
#
# Engine bake: the @prisma/engines postinstall downloads the native engine
# binaries with `failSilent: true` (any failure is swallowed and the install
# still exits 0), so the freshly installed tree can contain the engine
# PACKAGES without the engine BINARIES. At container start `prisma db push`
# would then try to download them at runtime — as the unprivileged app user,
# into the root-owned node_modules — and crash with:
#   "Can't write to /app/node_modules/@prisma/engines …"
# Running the exact schema-apply command ONCE here (as root, with network
# access) forces the CLI to fetch every engine it will use at runtime into
# this tree, fails the BUILD loudly if the fetch is impossible, and validates
# the schema into the bargain. The throwaway probe database is deleted after.
# ------------------------------------------------------------------------------
FROM oven/bun:1-alpine AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY prisma/schema.prisma ./prisma/
RUN DATABASE_URL="file:/tmp/engine-probe.db" \
      ./node_modules/.bin/prisma db push --skip-generate --accept-data-loss \
    && rm -f /tmp/engine-probe.db* \
    && ls -1 node_modules/@prisma/engines/schema-engine-* \
    && chmod -R a+rwX node_modules/@prisma/engines

# ------------------------------------------------------------------------------
# Stage 3: Build the application (Next.js standalone output)
# ------------------------------------------------------------------------------
FROM oven/bun:1-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/tmp/build.db
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate the Prisma client, then build the standalone server bundle
RUN ./node_modules/.bin/prisma generate && bun run build

# ------------------------------------------------------------------------------
# Stage 4: Minimal runtime container
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner
RUN apk add --no-cache ca-certificates tzdata openssl wget su-exec \
  && addgroup -S app && adduser -S app -G app

ENV TZ=Asia/Colombo
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/app/db/custom.db
ENV HOSTNAME=0.0.0.0
ENV PORT=8090

WORKDIR /app

# Complete production dependency tree (with the baked-in Prisma engine
# binaries). This is a superset of the modules the standalone server traces,
# so the app AND the Prisma CLI both resolve here.
COPY --from=prod-deps /app/node_modules ./node_modules

# Standalone Next.js server, normalized to the classic flat layout by
# scripts/prepare-standalone.mjs (Next 16 otherwise nests it under the app's
# path relative to the detected workspace root, which varies by environment).
# Its traced node_modules merge over the prod tree; static + public are baked
# in by the same script.
COPY --from=builder /app/.next/standalone ./

# Generated Prisma client + query engine binary — overlaid last so it wins
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Prisma schema — the entrypoint applies it to the SQLite volume on startup
COPY --from=builder /app/prisma ./prisma

COPY deploy/docker-entrypoint.sh ./docker-entrypoint.sh
# Fail the build early, with a clear message, if the standalone entrypoint is
# not where CMD expects it (the build script normalizes the bundle so that
# server.js always sits at the /app root).
RUN chmod +x ./docker-entrypoint.sh \
  && mkdir -p /app/db \
  && chown -R app:app /app/db \
  && test -f /app/server.js \
  || (echo "ERROR: /app/server.js not found - standalone normalization failed?" && exit 1)

# Persistent SQLite volume (database + WAL journal files live here)
VOLUME /app/db

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8090/api || exit 1

# Starts as root solely to repair volume ownership, then immediately drops to
# the unprivileged "app" user (see docker-entrypoint.sh).
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
