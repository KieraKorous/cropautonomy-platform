# Deployment Strategy

## Direction

Use GKE as the long-term hosting target for the full platform. Use Cloudflare (or Vercel) as a practical low-cost option for public landing pages while the platform is under development. Run the authenticated portal on Vercel for v0 and migrate to GKE once the supporting services (`services/api`, `services/telemetry`, `services/vision`) come online and warrant a single cluster owning the whole platform plane.

## Surfaces and Domains

Three production surfaces, three hostnames:

- `cropautonomy.com` — CropAutonomy marketing landing (`apps/cropautonomy-web`)
- `gaiabots.ai` — GAIAbots marketing landing (`apps/gaiabots-web`)
- `app.cropautonomy.com` — authenticated CropAutonomy portal (`apps/portal-web`)

`app.` was chosen over `portal.`, `ops.`, `console.`, etc. because it carries universal SaaS muscle memory, doesn't lock the surface into a "gateway" metaphor when the portal **is** the product, and leaves room for future siblings (`admin.`, `api.`, `docs.`, `status.`) without renaming.

Reserved for later:

- per-tenant subdomains (e.g. `korous.cropautonomy.com`) are not in scope for v0; the shared `app.` host serves all tenants and resolves the tenant from the Clerk session
- if a GAIAbots-specific operator surface ever splits from CropAutonomy, it lives at `app.gaiabots.ai` — but the current direction is one unified operator surface at `app.cropautonomy.com` since GAIA devices feed the CropAutonomy platform

Clerk session cookies should be scoped to `.cropautonomy.com` so SSO works on the marketing → app handoff.

## Landing Pages

The landing pages must stay deployable independently from the authenticated portal.

Approach:

- host public pages on Cloudflare Pages or Vercel during early phases
- keep pages static or mostly static when possible
- use server actions or API endpoints only where lead capture requires them
- route lead capture to a durable backend path

## Portal

The authenticated CropAutonomy portal (`apps/portal-web`, served at `app.cropautonomy.com`) ships on Vercel for v0, then migrates to GKE.

Vercel for v0 because:

- fastest path to production for a Next.js app with Clerk + Supabase + Mapbox
- preview deployments per PR map cleanly to design iteration
- no cluster ops while the surface is still fixtures and a handful of routes

Migrate to GKE when:

- `services/api` (Fastify), `services/telemetry` (Go), or `services/vision` (Python) come online and need to live next to the web tier
- pg-boss workers, long-running jobs, or telemetry ingestion need to share a cluster with the portal
- robotics integrations require controlled platform infrastructure

The migration should be a hostname cutover, not a rewrite — keep the portal portable (no Vercel-only primitives that don't have a GKE analogue).

## Environment Separation

Plan for:

- local
- preview
- staging
- production

Each environment should have explicit environment variables and service configuration.

## Required Services

Expected services:

- Next.js web apps
- Postgres through Supabase
- Supabase Storage
- pg-boss workers
- Resend
- PostHog
- Clerk
- future AI provider or model service
- future telemetry ingestion service

## Deployment Principles

- Landing pages should stay cheap and fast.
- Platform services should be built with observability and scaling in mind.
- Workers should be deployable separately from web apps.
- Keep the portal portable across Vercel and GKE — no host-specific primitives without a documented migration path.
- Secrets should never be committed.
- Deployment docs should be updated as soon as real infrastructure is chosen.

