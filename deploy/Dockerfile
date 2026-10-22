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
# ------------------------------------------------------------------------------
FROM oven/bun:1-alpine AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

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

# Complete production dependency tree. This is a superset of the modules the
# standalone server traces, so the app AND the Prisma CLI both resolve here.
COPY --from=prod-deps /app/node_modules ./node_modules

# Standalone Next.js server. Next 16 nests the app under a directory named
# after the package (.next/standalone/tourny-lite/), which we copy intact —
# its traced node_modules merge over the prod tree. The build script bakes
# .next/static and public/ into the nested bundle.
COPY --from=builder /app/.next/standalone ./

# Generated Prisma client + query engine binary — overlaid last so it wins
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Prisma schema — the entrypoint applies it to the SQLite volume on startup
COPY --from=builder /app/prisma ./prisma

COPY deploy/docker-entrypoint.sh ./docker-entrypoint.sh
# Fail the build early, with a clear message, if the standalone entrypoint is
# not where CMD expects it. The path derives from the "name" field in
# package.json — update CMD below if the package is renamed.
RUN chmod +x ./docker-entrypoint.sh \
  && mkdir -p /app/db \
  && chown -R app:app /app/db \
  && test -f /app/tourny-lite/server.js \
  || (echo "ERROR: /app/tourny-lite/server.js not found - standalone layout changed?" && exit 1)

# Persistent SQLite volume (database + WAL journal files live here)
VOLUME /app/db

EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8090/api || exit 1

# Starts as root solely to repair volume ownership, then immediately drops to
# the unprivileged "app" user (see docker-entrypoint.sh).
ENTRYPOINT ["./docker-entrypoint.sh"]
# Next 16 standalone nests the server under the package-name directory
CMD ["node", "tourny-lite/server.js"]
