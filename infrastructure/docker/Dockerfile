# Production image for the Next.js app — wired into docker-compose.prod.yml alongside Nginx and
# HTTPS (Phase 13, docs/ARCHITECTURE.md — Section 16).
# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, not read at runtime — so
# this has to be a build ARG, not a docker-compose `environment:` entry on the runner stage.
# DATABASE_URL/REDIS_URL are also required here (not just at runtime): src/lib/env.ts validates
# process.env eagerly at module load, and Next's build evaluates route modules while collecting
# page data even though every route is dynamic (Section 15) — dummy well-formed values are fine
# since nothing actually connects during the build, only `env.ts`'s Zod shape check needs to pass.
ARG NEXT_PUBLIC_REALTIME_URL
ENV NEXT_PUBLIC_REALTIME_URL=${NEXT_PUBLIC_REALTIME_URL}
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV REDIS_URL=redis://localhost:6379
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]

# A one-off migration runner, not the app's own startup command — `.next/standalone` deliberately
# doesn't bundle drizzle-kit (it's not part of the running app), so migrations need node_modules'
# full dev+prod install (the `deps` stage, before it gets pruned down for `runner`). Run
# explicitly and deliberately before rolling out a new version (`docker compose -f
# docker-compose.prod.yml run --rm migrate`), never automatically on every container start — with
# more than one app replica eventually, concurrent auto-migration on boot is a race no one wants.
FROM base AS migrator
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json drizzle.config.ts ./
COPY src/database ./src/database
# `npx drizzle-kit migrate` directly, not `pnpm db:migrate` — pnpm's script runner re-verifies
# the lockfile/workspace state before running, which isn't present in this stage (only deps'
# already-installed node_modules is copied in, not pnpm-lock.yaml/pnpm-workspace.yaml), so it
# was re-resolving and re-downloading the entire dependency tree from the registry on every run.
CMD ["npx", "drizzle-kit", "migrate"]
