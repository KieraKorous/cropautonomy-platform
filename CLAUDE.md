# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Shape

pnpm workspace monorepo (`pnpm@10.12.1`, Node toolchain) building toward a multi-tenant autonomous agriculture platform. The current code is only the first slice: two marketing landing pages with shared lead capture. Architecture decisions should still anticipate the August 2026 multi-tenant prototype described in `docs/`.

- `apps/cropautonomy-web` — Next.js 16 / React 19 landing for `cropautonomy.com` (port 3000)
- `apps/gaiabots-web` — Next.js 16 / React 19 landing for `gaiabots.ai` (port 3001)
- `apps/portal-web` — Next.js 16 / React 19 authenticated portal for `app.cropautonomy.com` (port 3002). Separate deployable from the marketing apps — do not merge. Vercel for v0, GKE long-term.
- `apps/field-web` — **Vite + React + Workbox** PWA for `field.cropautonomy.com` (port 5173, served at `field.lvh.me:5173` in dev). Deliberate exception to the Next.js consistency of the rest of the workspace — offline-first PWA is a different runtime model than the portal. Do not try to "normalize" it onto Next.js. Imports `@gaia/realtime`, `@gaia/ui/theme.css`; does not share build tooling. See [`apps/field-web/README.md`](apps/field-web/README.md) and `docs/product/field-capture-prd.md`.
- `packages/config` — shared `next.config.mjs`, `postcss.config.mjs`, and `tsconfig.json` re-exported via subpath exports (`@gaia/config/next`, `/postcss`, `/tsconfig`)
- `packages/domain` — pure TypeScript domain types (`PublicLead`, `LeadInterest`, `LeadSource`)
- `packages/leads` — server-side `capturePublicLead()` that fans out to Supabase + Resend via `Promise.allSettled`
- `packages/realtime` — channel name helpers, zod-validated event schemas, React subscribe hook, client/server publish APIs. **Only legal importer of `@supabase/supabase-js` realtime APIs in the workspace.** v0 client publishes proxy through `app.cropautonomy.com/api/realtime/publish`; subscribes use the anon client with channel-name tenant scoping. See [`docs/architecture/realtime-package-spec.md`](docs/architecture/realtime-package-spec.md).
- `packages/ui` — DaisyUI 5 theme (`gaia-field`) + shared brand constants; consumed by Next apps via `transpilePackages` in `packages/config/next.config.mjs`. Field PWA imports `@gaia/ui/theme.css` only — its components are field-specific, built in `apps/field-web/src/components`.
- `packages/db/migrations` — raw SQL migrations (apply manually to Supabase); start with `0001_public_leads.sql`. Captures + capture_sessions land in `0004_captures_and_analysis.sql`. See [`CAPTURES_SETUP.md`](CAPTURES_SETUP.md).
- `services/{api,telemetry,vision}` — reserved placeholders. Per `services/README.md`: Fastify for `api`, Go for `telemetry`, Python for `vision`. Do **not** add Express here.

All internal packages are referenced as `@gaia/*` with `workspace:*`.

## Commands

```powershell
pnpm install                                  # bootstrap
pnpm dev                                      # run cropautonomy + gaiabots + portal in parallel
pnpm dev:cropautonomy                         # cropautonomy-web only (localhost:3000)
pnpm dev:gaiabots                             # gaiabots-web only     (localhost:3001)
pnpm dev:portal                               # portal-web only       (app.lvh.me:3002)
pnpm --filter @gaia/field-web dev             # field-web (field.lvh.me:5173) — not in `pnpm dev` because it needs different env + the portal running for SSO
pnpm build                                    # pnpm -r build
pnpm typecheck                                # pnpm -r typecheck
pnpm lint                                     # alias for typecheck — `lint` runs `tsc --noEmit` in each app
```

For the field PWA to authenticate, run portal-web and field-web together; the Clerk session cookie is scoped to `.lvh.me`. See [`CLERK_SETUP.md`](CLERK_SETUP.md) for one-time Clerk dashboard config.

There is no test runner, ESLint config, or formatter wired up yet. `lint` is intentionally just `tsc --noEmit`; do not assume Jest/Vitest/ESLint exists.

Run a single package's script with `pnpm --filter @gaia/<name> <script>` (e.g. `pnpm --filter @gaia/cropautonomy-web typecheck`).

## Lead Capture Flow

Both apps expose `POST /api/leads` (`apps/*/app/api/leads/route.ts`). The route parses `FormData`, validates `interest` against a hard-coded allow-list matching the `LeadInterest` union, requires `consent`, stamps the correct `source` literal (`"cropautonomy.com"` vs `"gaiabots.ai"`), then delegates to `capturePublicLead` from `@gaia/leads`.

`capturePublicLead` runs `persistLead` (Supabase service-role insert into `public_leads`) and `notifyLead` (Resend email) concurrently via `Promise.allSettled` and throws if either rejects. Required env vars (the package reads `process.env` directly, no central config):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `SUPABASE_LEADS_TABLE` (default `public_leads`)
- `RESEND_API_KEY`, `LEADS_NOTIFY_TO`, `LEADS_NOTIFY_FROM`

When extending lead types, update **three** places together: the `LeadInterest`/`LeadSource` unions in `packages/domain`, the `validInterests` set in each app's route handler, and the SQL `check` constraints in `packages/db/migrations/`.

## Capture Pipeline

The platform's authoritative observation record is a **capture** (one photo / burst frame / video). Field Capture (the `apps/field-web` PWA) is the first concrete producer. Pipeline: reserve → direct browser-to-Storage upload → finalize → analysis. Full spec in [`docs/architecture/capture-pipeline.md`](docs/architecture/capture-pipeline.md).

API surface in portal-web (cross-origin from field.cropautonomy.com, Clerk session cookie scoped to `.cropautonomy.com`):

- `POST /api/captures` — reserves a `captures` row, mints a signed PUT URL into `scan-originals/org/{orgId}/capture/{captureId}.{ext}` (server-chosen path), responds with `{ captureId, uploadUrl, uploadToken, expiresAt }`. Validates the caller is `technician`-or-higher in the referenced org and that any farm/field/zone/cropType/session IDs belong to that org. ([route](apps/portal-web/app/api/captures/route.ts))
- `POST /api/captures/{id}/finalize` — verifies the object exists at the expected size, transitions `pending_upload → uploaded → analysis_queued`, inserts an `analysis_jobs` row. Optional `thumbnailDataUrl` is uploaded to `{path}_thumb.jpg`. ([route](apps/portal-web/app/api/captures/[id]/finalize/route.ts))
- `POST /api/capture-sessions` — starts a session row + publishes `capture.session.started`. ([route](apps/portal-web/app/api/capture-sessions/route.ts))
- `PATCH /api/capture-sessions/{id}` — `{ action: "pause" | "resume" | "end" }` + publishes the matching lifecycle event. ([route](apps/portal-web/app/api/capture-sessions/[id]/route.ts))
- `POST /api/realtime/publish` — proxy publish from the browser. Validates the event against the `@gaia/realtime` zod registry and re-broadcasts via service role. Used by the field PWA until the Clerk → Supabase JWT bridge is in place. ([route](apps/portal-web/app/api/realtime/publish/route.ts))
- `POST /api/webhooks/clerk` — Svix-signed Clerk webhook; upserts `public.users` so every other table can FK to an internal uuid. `CLERK_WEBHOOK_SECRET` required. ([route](apps/portal-web/app/api/webhooks/clerk/route.ts))

Bucket: `scan-originals` (private). Path convention: `org/{orgId}/capture/{captureId}.{ext}` — chosen by the server, never the client. v0 uploads single-shot PUT to a `createSignedUploadUrl` token; the TUS resumable path is wired in `apps/field-web/src/lib/upload.ts:uploadBinaryTus` and lights up when Storage RLS + JWT bridge are in place.

When extending the capture pipeline, update **four** places together: the SQL in [`packages/db/migrations/0004_captures_and_analysis.sql`](packages/db/migrations/0004_captures_and_analysis.sql), the request schema in [`apps/portal-web/app/api/captures/route.ts`](apps/portal-web/app/api/captures/route.ts), the IndexedDB record + drain worker in [`apps/field-web/src/lib/db.ts`](apps/field-web/src/lib/db.ts) + [`upload.ts`](apps/field-web/src/lib/upload.ts), and the event schemas in [`packages/realtime/src/events.ts`](packages/realtime/src/events.ts) if a new lifecycle event is added.

## Realtime

`@gaia/realtime` is the only legal importer of `@supabase/supabase-js` realtime APIs. Application code subscribes via `useRealtimeChannel(channels.x(...))` and publishes via `publishFromClient` (browser) or `publish` (server). Channel names always start with `org.{orgId}.…` so tenant scoping is structural. Event envelopes are zod-validated at publish AND receive; invalid events at receive are dropped with a console warn, never crash the consumer. See [`docs/architecture/realtime-package-spec.md`](docs/architecture/realtime-package-spec.md) and [`docs/architecture/realtime-strategy.md`](docs/architecture/realtime-strategy.md).

v0 transports: subscribes go direct to Supabase Realtime broadcast with the anon key (channel-name tenancy); browser publishes proxy through `app.cropautonomy.com/api/realtime/publish` (server holds the service role). Swapping to direct browser publish is a one-line `configurePublishFromClient({ kind: "supabase", … })` change in `apps/field-web/src/main.tsx` once the Clerk → Supabase JWT template is in place.

WebRTC live preview uses mesh topology in v0 (PWA holds one `RTCPeerConnection` per portal viewer; signaling rides on `org.{orgId}.capture.{sessionId}.signal`). ICE config comes from `apps/field-web/src/lib/ice.ts` — STUN-only by default, TURN is a `VITE_TURN_*` env var flip.

## Styling

Tailwind v4 with the DaisyUI v4 plugin loaded from CSS. Each app's `globals.css` is a single `@import "@gaia/ui/theme.css"` — the theme, palette, and `gaia-field` DaisyUI theme tokens all live in `packages/ui/src/theme.css`. Layouts set `data-theme="gaia-field"` on `<html>`. PostCSS is configured via `@gaia/config/postcss` which loads `@tailwindcss/postcss`.

## Project Conventions (from `docs/agent-engineering-guide.md`)

These are explicit project decisions, not generic advice — follow them:

- **Auth**: Clerk for identity. Do **not** use Supabase Auth. Do **not** treat Clerk organizations as the source of truth for platform membership — model org/farm/field/device/membership tables yourself.
- **Backend runtime choice**: Fastify (Node), Python (vision/AI), or Go (telemetry/ingestion). Express is disallowed by default.
- **Queueing**: pg-boss. **Email**: Resend. **Analytics**: PostHog. **Hosting target**: GKE long-term, Cloudflare acceptable for landing pages, Vercel for the portal v0.
- **Multi-tenancy from day one** — never hard-code single-org/single-farm assumptions, even in marketing-adjacent code.
- **Real-time is a core capability, not bolted on** — the portal is an operations console; operators must see device and Field Capture activity live. Subscribe and publish through `packages/realtime` (planned), never import `@supabase/supabase-js` realtime APIs directly in app or device code. v0 transport is Supabase Realtime for state events + WebRTC for Field Capture media; the abstraction exists so the transport is swappable when Supabase Realtime is outgrown. See `docs/architecture/realtime-strategy.md`.
- **Field Capture ships as a dedicated PWA**, not a route in the portal. The portal is for watchers; the field PWA is for doers. Different surface, different deploy, different toolchain (Vite). See `docs/product/field-capture-prd.md`.
- **`captures` is the unified observation record** across all sources (phone, drone, rover, sensor). The older `crop_scans` / `scan_assets` split is deprecated. Schema + upload protocol in `docs/architecture/capture-pipeline.md`.
- **Cross-subdomain SSO via shared root-scoped Clerk cookie** — primary `app.cropautonomy.com`, peer `field.cropautonomy.com`, session cookie scoped to `.cropautonomy.com`. **Not** Clerk's paid satellite-domain feature; both surfaces share the same publishable key and read the same cookie. Don't reintroduce `isSatellite` / `domain` props on `<ClerkProvider>`. See `docs/architecture/authentication-and-tenancy.md § Cross-Surface SSO`.
- **Map provider**: Mapbox GL JS via `react-map-gl/mapbox`. No MapLibre or Google Maps fallback. `NEXT_PUBLIC_MAPBOX_TOKEN` is required at portal runtime.
- **Design posture**: industrial, agricultural, precise, calm. Avoid generic SaaS dashboard aesthetics, playful consumer visuals, or claims that overstate hardware readiness. Per-app `PRODUCT.md` + `DESIGN.md` live at `apps/<app>/` (not at the repo root). Run `/impeccable …` commands from inside the target app directory (or set `IMPECCABLE_CONTEXT_DIR`) so the context loader picks up the right files; running from the repo root finds nothing and produces generic output.
- Keep public marketing pages structurally separate from authenticated platform concerns.

When you make decisions that affect repo structure, env vars, API boundaries, schema, auth, deployment, design tokens, brand messaging, device taxonomy, or background jobs — update the corresponding doc under `docs/`.

## Docs to Consult

`docs/README.md` is the index. For non-trivial work, read the relevant doc first rather than inferring from code — the code is intentionally thin relative to the planned architecture:

- `docs/project-vision.md`, `docs/product-roadmap.md`
- `docs/architecture/` (overview, monorepo-strategy, authentication-and-tenancy, data-and-storage-strategy, queueing-email-analytics, realtime-strategy, realtime-package-spec, capture-pipeline, deployment-strategy, robotics-and-edge-architecture)
- `docs/product/` (landing-pages-prd, cropautonomy-platform-prd, field-capture-prd, gaiabots-knowledge-base-prd)
- `docs/brand/` for tone, palette rationale, and brand briefs
