# syntax=docker/dockerfile:1.7
#
# field-web (@gaia/field-web): Vite + React + Workbox PWA for field.cropautonomy.com.
# Build context must be the repo root:
#   docker build -f apps/field-web/Dockerfile -t field:dev .
#
# VITE_* env vars are baked into the client bundle at build time (Vite inlines
# them). CI passes them as --build-arg from GitHub Actions secrets. Runtime
# Kubernetes env vars are *not* read by the served JavaScript — nginx just
# serves static assets.

ARG NODE_VERSION=22.12.0
ARG PNPM_VERSION=10.12.1
ARG NGINX_VERSION=1.27-alpine

# ─── deps ────────────────────────────────────────────────────────────────────
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
      --filter @gaia/field-web... \
      --filter @gaia/ui \
      --filter @gaia/realtime

# ─── build ───────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS build
ARG PNPM_VERSION
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

# Vite inlines VITE_* into the bundle at build time. CI passes from GHA secrets.
ARG VITE_CLERK_PUBLISHABLE_KEY=""
ARG VITE_CLERK_SATELLITE_DOMAIN=""
ARG VITE_CLERK_SIGN_IN_URL=""
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
ARG VITE_API_BASE=""
ARG VITE_STUN_URLS=""
ARG VITE_TURN_URL=""
ARG VITE_TURN_USERNAME=""
ARG VITE_TURN_CREDENTIAL=""

ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY \
    VITE_CLERK_SATELLITE_DOMAIN=$VITE_CLERK_SATELLITE_DOMAIN \
    VITE_CLERK_SIGN_IN_URL=$VITE_CLERK_SIGN_IN_URL \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_API_BASE=$VITE_API_BASE \
    VITE_STUN_URLS=$VITE_STUN_URLS \
    VITE_TURN_URL=$VITE_TURN_URL \
    VITE_TURN_USERNAME=$VITE_TURN_USERNAME \
    VITE_TURN_CREDENTIAL=$VITE_TURN_CREDENTIAL

COPY --from=deps /repo /repo
COPY . .

RUN pnpm --filter @gaia/field-web build

# ─── runtime: nginx serving the static bundle ────────────────────────────────
# Tiny image (~25MB). Aggressive cache headers on hashed assets; html + the
# service worker are no-cache so updates roll out on the next page load.
FROM nginx:${NGINX_VERSION} AS runtime
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /repo/apps/field-web/dist /usr/share/nginx/html
COPY apps/field-web/nginx.conf /etc/nginx/conf.d/default.conf

# nginx alpine runs as root by default to bind :80. We use port 8080 so the
# container can run unprivileged under Pod Security Standards `restricted`.
RUN chown -R 101:101 /var/cache/nginx /var/run /var/log/nginx /etc/nginx/conf.d \
 && touch /var/run/nginx.pid \
 && chown 101:101 /var/run/nginx.pid
USER 101
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
