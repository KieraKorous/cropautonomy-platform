# syntax=docker/dockerfile:1.7
#
# Single image containing both services/api and services/workers built from the
# workspace root. The two Kubernetes Deployments share this image and differ
# only in `command`. See docs/architecture/api-architecture.md § Container strategy.
#
# Build context must be the repo root:
#   docker build -f services/Dockerfile -t gaia-services:dev .

ARG NODE_VERSION=22.12.0
ARG PNPM_VERSION=10.12.1

# ─── deps ────────────────────────────────────────────────────────────────────
# Copy only manifests + lockfile so this layer is cached unless deps change.
# pnpm needs every workspace's package.json present even when filtering,
# otherwise the per-package node_modules symlink layout breaks.
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
      --filter @gaia/api... \
      --filter @gaia/workers...

# ─── build ───────────────────────────────────────────────────────────────────
FROM deps AS build
COPY packages/ ./packages/
COPY services/api/ ./services/api/
COPY services/workers/ ./services/workers/
COPY tsconfig.base.json ./

RUN pnpm --filter @gaia/api build \
 && pnpm --filter @gaia/workers build

# ─── deploy: pnpm produces a pruned, prod-only deployable subtree per service
# ─────────────────────────────────────────────────────────────────────────────
FROM build AS deploy
RUN pnpm --filter @gaia/api --prod deploy /out/api \
 && pnpm --filter @gaia/workers --prod deploy /out/workers

# ─── runtime: distroless node 22; ~75MB base, image typically ~120MB ─────────
FROM gcr.io/distroless/nodejs22-debian12 AS runtime
WORKDIR /app
COPY --from=deploy /out/api /app/api
COPY --from=deploy /out/workers /app/workers
ENV NODE_ENV=production
EXPOSE 8080
# Default to the API; the workers Deployment overrides this with:
#   command: ["/nodejs/bin/node", "/app/workers/dist/index.js"]
CMD ["/app/api/dist/index.js"]
