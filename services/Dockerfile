# syntax=docker/dockerfile:1.7
#
# Single image containing both services/api and services/workers built from the
# workspace root. The Kubernetes Deployments differ only in `command` — see
# docs/architecture/api-architecture.md § Container strategy.
#
# Build context must be the repo root:
#   docker build -f services/Dockerfile -t gaia-services:dev .

# -----------------------------------------------------------------------------
# Base — node 22 alpine with pnpm 10.12.1 pinned
# -----------------------------------------------------------------------------
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    npm_config_yes=true
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate
WORKDIR /workspace

# -----------------------------------------------------------------------------
# Deps — install only what services/api and services/workers need
# -----------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/api/package.json ./services/api/
COPY services/workers/package.json ./services/workers/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile \
      --filter @gaia/api... \
      --filter @gaia/workers...

# -----------------------------------------------------------------------------
# Build — compile TypeScript to dist/
# -----------------------------------------------------------------------------
FROM deps AS build
COPY services/api/ ./services/api/
COPY services/workers/ ./services/workers/
RUN pnpm --filter @gaia/api build \
 && pnpm --filter @gaia/workers build

# -----------------------------------------------------------------------------
# Deploy — pnpm produces a pruned, prod-only deployable subtree per service
# -----------------------------------------------------------------------------
FROM build AS deploy
RUN pnpm --filter @gaia/api --prod deploy /out/api \
 && pnpm --filter @gaia/workers --prod deploy /out/workers

# -----------------------------------------------------------------------------
# Runtime — distroless node 22; ~75MB base, image typically ~120MB
# -----------------------------------------------------------------------------
FROM gcr.io/distroless/nodejs22-debian12 AS runtime
WORKDIR /app
COPY --from=deploy /out/api /app/api
COPY --from=deploy /out/workers /app/workers
ENV NODE_ENV=production
EXPOSE 8080
# Default to the API; the workers Deployment overrides this with:
#   command: ["/nodejs/bin/node", "/app/workers/dist/index.js"]
CMD ["/app/api/dist/index.js"]
