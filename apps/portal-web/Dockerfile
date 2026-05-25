# syntax=docker/dockerfile:1.7
#
# portal-web (@gaia/portal-web): Next.js 16 standalone runtime for app.cropautonomy.com.
# Build context must be the repo root:
#   docker build -f apps/portal-web/Dockerfile -t portal:dev .

ARG NODE_VERSION=22.12.0
ARG PNPM_VERSION=10.12.1

# ─── deps ────────────────────────────────────────────────────────────────────
# Install every workspace's manifests so pnpm's symlink layout matches what
# tsc/next will see at build time. Missing one means a workspace can't resolve
# its third-party deps when next build runs.
FROM node:${NODE_VERSION}-bookworm-slim AS deps
ARG PNPM_VERSION
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc tsconfig.base.json ./
COPY patches/ ./patches/

COPY apps/cropautonomy-web/package.json apps/cropautonomy-web/
COPY apps/field-web/package.json apps/field-web/
COPY apps/gaiabots-web/package.json apps/gaiabots-web/
COPY apps/portal-web/package.json apps/portal-web/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/domain/package.json packages/domain/
COPY packages/leads/package.json packages/leads/
COPY packages/realtime/package.json packages/realtime/
COPY packages/ui/package.json packages/ui/
COPY services/api/package.json services/api/
COPY services/workers/package.json services/workers/

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store \
 && pnpm install --frozen-lockfile \
      --filter @gaia/portal-web... \
      --filter @gaia/ui \
      --filter @gaia/realtime \
      --filter @gaia/domain \
      --filter @gaia/config

# ─── build ───────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS build
ARG PNPM_VERSION
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Next.js inlines NEXT_PUBLIC_* into the client bundle at build time, so they
# must exist here, not at runtime. CI passes them as --build-arg from GitHub
# Actions secrets.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
ARG NEXT_PUBLIC_MAPBOX_TOKEN=""
ARG NEXT_PUBLIC_SUPABASE_URL=""
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=""
ARG NEXT_PUBLIC_API_BASE_URL=""

ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY \
    NEXT_PUBLIC_MAPBOX_TOKEN=$NEXT_PUBLIC_MAPBOX_TOKEN \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

COPY --from=deps /repo /repo
COPY . .

RUN pnpm --filter @gaia/portal-web build

# ─── runtime ─────────────────────────────────────────────────────────────────
# Next standalone output is self-contained: server.js + the minimum node_modules
# needed at runtime. We additionally copy .next/static (not traced) and public/.
# outputFileTracingRoot in next.config.mjs is set to the repo root so the
# standalone tree includes @gaia/* workspace packages.
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3002 \
    HOSTNAME=0.0.0.0

RUN useradd --system --create-home --shell /usr/sbin/nologin --uid 1001 gaia

COPY --from=build --chown=gaia:gaia /repo/apps/portal-web/.next/standalone ./
COPY --from=build --chown=gaia:gaia /repo/apps/portal-web/.next/static ./apps/portal-web/.next/static
COPY --from=build --chown=gaia:gaia /repo/apps/portal-web/public ./apps/portal-web/public

USER gaia
EXPOSE 3002

CMD ["node", "apps/portal-web/server.js"]
