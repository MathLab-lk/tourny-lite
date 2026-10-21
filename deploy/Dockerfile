# ------------------------------------------------------------------------------
# Tourny Lite — Production Multi-Stage Dockerfile
# Adapts the plan's low-footprint blueprint (§6.1) to the Next.js standalone
# stack: single container, embedded SQLite, static-optimized UI + API + SSE.
#
# Build:  docker build -t tourny-lite -f deploy/Dockerfile .
# Run:    see deploy/docker-compose.yml
# ------------------------------------------------------------------------------

# ------------------------------------------------------------------------------
# Stage 1: Install dependencies (bun for lockfile fidelity)
# ------------------------------------------------------------------------------
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ------------------------------------------------------------------------------
# Stage 2: Build the application (Next.js standalone output)
# ------------------------------------------------------------------------------
FROM oven/bun:1-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/app/db/custom.db
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Generate Prisma client, then build the standalone server bundle
RUN bunx prisma generate && bun run build

# ------------------------------------------------------------------------------
# Stage 3: Minimal runtime container
# ------------------------------------------------------------------------------
FROM node:20-alpine AS runner
RUN apk add --no-cache ca-certificates tzdata openssl wget && addgroup -S app && adduser -S app -G app

ENV TZ=Asia/Colombo
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=file:/app/db/custom.db
ENV HOSTNAME=0.0.0.0
ENV PORT=8090

WORKDIR /app

# Standalone server + static assets + public dir + prisma schema (for db push)
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
COPY --from=builder --chown=app:app /app/public ./public
COPY --from=builder --chown=app:app /app/prisma ./prisma
COPY --from=builder --chown=app:app /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=app:app /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --chown=app:app deploy/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

# Persistent SQLite volume (WAL journaling files live here too)
VOLUME /app/db

USER app
EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8090/api || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
