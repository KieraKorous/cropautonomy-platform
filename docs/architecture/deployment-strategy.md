# Deployment Strategy

## Direction

GKE hosts the authenticated stack — portal, field PWA, API, workers — from v0. Vercel hosts the marketing sites indefinitely (already wired, blast-radius isolated, near-static workload). See [API Architecture](./api-architecture.md) for the runtime/host table and the reasoning behind the split, and the [portal hosting memory](#) for the decision history.

The earlier plan was Vercel-for-v0 → GKE-when-services-come-online. That changed once the client → API → DB architecture landed: `services/api` and `services/workers` need to exist in v0, and `services/workers` needs a long-lived process for pg-boss `LISTEN/NOTIFY`. Standing up GKE for workers and Vercel for the API only to migrate the API to GKE in six months is more platforms and more migrations than just putting everything authenticated on GKE from day one.

## Surfaces and Domains

Production surfaces:

| Hostname | Code | Runtime | Host |
|---|---|---|---|
| `cropautonomy.com` | `apps/cropautonomy-web` | Next.js | Vercel |
| `gaiabots.ai` | `apps/gaiabots-web` | Next.js | Vercel |
| `app.cropautonomy.com` | `apps/portal-web` | Next.js (long-lived container) | GKE |
| `field.cropautonomy.com` | `apps/field-web` (planned) | Vite + React + Workbox | GKE |
| `api.cropautonomy.com` | `services/api` | Fastify (long-lived container) | GKE |
| _(internal, no hostname)_ | `services/workers` | Node long-lived (pg-boss consumer) | GKE |
| `telemetry.cropautonomy.com` (later) | `services/telemetry` | Go | GKE |

`app.` was chosen over `portal.`, `ops.`, `console.`, etc. because it carries universal SaaS muscle memory, doesn't lock the surface into a "gateway" metaphor when the portal **is** the product, and leaves room for future siblings (`admin.`, `status.`) without renaming. `api.` is the conventional choice for the platform's HTTP data surface.

`field.` is a deliberate second authenticated surface — the **Field Capture PWA** ([Field Capture PRD](../product/field-capture-prd.md)). The portal and the field app are different products for different users (watchers vs doers) with different runtime constraints (always-online dashboard vs offline-first installable app). Do not collapse them. Both authenticate via Clerk with cookies scoped to `.cropautonomy.com` so a single sign-in works across both.

Reserved for later:

- per-tenant subdomains (e.g. `korous.cropautonomy.com`) are not in scope for v0; the shared `app.` host serves all tenants and resolves the tenant from the Clerk session
- if a GAIAbots-specific operator surface ever splits from CropAutonomy, it lives at `app.gaiabots.ai` — but the current direction is one unified operator surface at `app.cropautonomy.com` since GAIA devices feed the CropAutonomy platform

Clerk session cookies are scoped to `.cropautonomy.com` so SSO works on the marketing → app handoff and across portal ↔ field.

## Landing Pages (Vercel)

The marketing landing pages stay on Vercel indefinitely. Already wired, zero-ops for the static-ish workload, blast-radius isolated from GKE — a cluster outage doesn't take down the public front door, and a Vercel outage doesn't take down the platform.

Approach:

- keep pages static or mostly static when possible
- lead capture POSTs cross-origin to `api.cropautonomy.com/v1/leads` (covered by the API's CORS allowlist; see [API Architecture § CORS](./api-architecture.md#cors))
- no Vercel-only primitives that don't have a GKE analogue would ever be needed here — marketing is the surface that benefits most from Vercel and the surface least likely to need to migrate

## Portal (GKE)

`apps/portal-web` at `app.cropautonomy.com` runs as a GKE Deployment from v0. Next.js standalone output (`output: 'standalone'`) keeps the image small. Portal is a UI runtime — it does not import `@gaia/db/server` or hold the Supabase service-role credential. All data access goes through `api.cropautonomy.com` (see [API Architecture](./api-architecture.md)).

Sizing: `replicas: 1`, `requests: { cpu: 100m, memory: 256Mi }`, no HPA in v0.

## Field Capture PWA (GKE)

`apps/field-web` at `field.cropautonomy.com` is a Vite-built static bundle served from a tiny container (nginx or `serve`). After the initial bundle loads, the app runs offline against IndexedDB and uploads asynchronously to `api.cropautonomy.com` via signed Storage URLs.

Hosting approach:

- static asset hosting from a GKE Deployment with aggressive long-cache headers on hashed assets so reopen is instant
- service worker handles offline routing and asset cache
- no server-side rendering, no edge functions — the app is a static bundle plus client-side fetches against `api.cropautonomy.com`
- environment config (`VITE_*` vars) for Clerk publishable key, Mapbox token, API base URL

Independent deployment from the portal is important: pushing a portal dashboard tweak should never risk the field app, and shipping a capture flow change should not block on portal release coordination. Separate Deployments, separate CI pipelines, separate image tags.

## API and Workers (GKE)

`services/api` and `services/workers` run as two GKE Deployments built from the same source repository (single Dockerfile, two entrypoints in v0; splits when their dep graphs diverge). See [API Architecture](./api-architecture.md) for the runtime decision and the container strategy.

- `services/api` at `api.cropautonomy.com`: Fastify, holds the Supabase service-role credential, runs Clerk JWT validation, calls `@gaia/db/permissions` before mutations. Public ingress.
- `services/workers`: pg-boss consumer for `analysis.run`, `email.send`, `user.sync`, `capture.finalize`, scheduled jobs. No public ingress. Long-lived process holding `LISTEN/NOTIFY` connection.

Sizing for both in v0: `replicas: 1`, `requests: { cpu: 100m, memory: 128Mi }`, `limits: { cpu: 500m, memory: 512Mi }`. No HPA.

## Vision and Telemetry (later)

`services/vision` (Python) and `services/telemetry` (Go) come online as the platform needs them:

- `services/vision`: called by workers, never by browsers. Internal-only ClusterIP service. Comes online when real model inference is needed (today, analysis can no-op or stub).
- `services/telemetry`: called by devices, not by browsers. Public ingress at `telemetry.cropautonomy.com`. Comes online when real device integration begins.

Both run in the same GKE cluster as portal/field/api/workers, so cross-service calls stay inside the cluster network.

## Environment Separation

Plan for:

- local (Supabase CLI stack, dev Clerk instance, `services/api` and `services/workers` via `pnpm dev`, portal-web on `localhost:3002`, field-web on `localhost:5173`)
- preview (per-PR, ephemeral) — strategy TBD; likely GKE namespace per PR
- staging
- production

Each environment has explicit env vars and service configuration. Marketing apps get Vercel's preview deployments per PR by default.

## Required Services

Expected services in v0:

- Next.js portal (`apps/portal-web`)
- Vite field PWA (`apps/field-web`)
- Fastify API (`services/api`)
- pg-boss workers (`services/workers`)
- Postgres + Storage + Realtime through Supabase (managed; not deployed by us)
- Clerk (managed)
- Resend (managed)
- PostHog (managed)

Later:

- Python vision (`services/vision`)
- Go telemetry (`services/telemetry`)

## Deployment Principles

- Marketing surfaces stay cheap, fast, and isolated from platform fate.
- Portal, field PWA, API, and workers ship as independent GKE Deployments — coupling them in CI or in the cluster is regression.
- Container images are minimized aggressively: multi-stage builds, distroless runtimes, `pnpm deploy` workspace pruning, Next.js standalone output.
- Resource requests are sized for actual v0 load (one operator). Don't pre-size for hypothetical scale.
- Secrets never enter the repo. GKE Workload Identity or Secret Manager binding for cluster workloads; Vercel project env for marketing.
- Deployment docs are updated as soon as real infrastructure choices are made.
