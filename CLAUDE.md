# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Shape

pnpm workspace monorepo (`pnpm@10.12.1`, Node toolchain) building toward a multi-tenant autonomous agriculture platform. The current code is only the first slice: two marketing landing pages with shared lead capture. Architecture decisions should still anticipate the August 2026 multi-tenant prototype described in `docs/`.

- `apps/cropautonomy-web` — Next.js 16 / React 19 landing for `cropautonomy.com` (port 3000)
- `apps/gaiabots-web` — Next.js 16 / React 19 landing for `gaiabots.ai` (port 3001)
- `packages/config` — shared `next.config.mjs`, `postcss.config.mjs`, and `tsconfig.json` re-exported via subpath exports (`@gaia/config/next`, `/postcss`, `/tsconfig`)
- `packages/domain` — pure TypeScript domain types (`PublicLead`, `LeadInterest`, `LeadSource`)
- `packages/leads` — server-side `capturePublicLead()` that fans out to Supabase + Resend via `Promise.allSettled`
- `packages/ui` — DaisyUI 5 theme (`gaia-field`) + shared brand constants; consumed by Next apps via `transpilePackages` in `packages/config/next.config.mjs`
- `packages/db/migrations` — raw SQL migrations (apply manually to Supabase); start with `0001_public_leads.sql`
- `services/{api,telemetry,vision}` — reserved placeholders. Per `services/README.md`: Fastify for `api`, Go for `telemetry`, Python for `vision`. Do **not** add Express here.

All internal packages are referenced as `@gaia/*` with `workspace:*`.

## Commands

```powershell
corepack pnpm install                  # bootstrap
corepack pnpm dev                      # run both landing apps in parallel
corepack pnpm dev:cropautonomy         # cropautonomy-web only (localhost:3000)
corepack pnpm dev:gaiabots             # gaiabots-web only  (localhost:3001)
corepack pnpm build                    # pnpm -r build
corepack pnpm typecheck                # pnpm -r typecheck
corepack pnpm lint                     # alias for typecheck — `lint` runs `tsc --noEmit` in each app
```

There is no test runner, ESLint config, or formatter wired up yet. `lint` is intentionally just `tsc --noEmit`; do not assume Jest/Vitest/ESLint exists.

Run a single package's script with `pnpm --filter @gaia/<name> <script>` (e.g. `pnpm --filter @gaia/cropautonomy-web typecheck`).

## Lead Capture Flow

Both apps expose `POST /api/leads` (`apps/*/app/api/leads/route.ts`). The route parses `FormData`, validates `interest` against a hard-coded allow-list matching the `LeadInterest` union, requires `consent`, stamps the correct `source` literal (`"cropautonomy.com"` vs `"gaiabots.ai"`), then delegates to `capturePublicLead` from `@gaia/leads`.

`capturePublicLead` runs `persistLead` (Supabase service-role insert into `public_leads`) and `notifyLead` (Resend email) concurrently via `Promise.allSettled` and throws if either rejects. Required env vars (the package reads `process.env` directly, no central config):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `SUPABASE_LEADS_TABLE` (default `public_leads`)
- `RESEND_API_KEY`, `LEADS_NOTIFY_TO`, `LEADS_NOTIFY_FROM`

When extending lead types, update **three** places together: the `LeadInterest`/`LeadSource` unions in `packages/domain`, the `validInterests` set in each app's route handler, and the SQL `check` constraints in `packages/db/migrations/`.

## Styling

Tailwind v4 with the DaisyUI v4 plugin loaded from CSS. Each app's `globals.css` is a single `@import "@gaia/ui/theme.css"` — the theme, palette, and `gaia-field` DaisyUI theme tokens all live in `packages/ui/src/theme.css`. Layouts set `data-theme="gaia-field"` on `<html>`. PostCSS is configured via `@gaia/config/postcss` which loads `@tailwindcss/postcss`.

## Project Conventions (from `docs/agent-engineering-guide.md`)

These are explicit project decisions, not generic advice — follow them:

- **Auth**: Clerk for identity. Do **not** use Supabase Auth. Do **not** treat Clerk organizations as the source of truth for platform membership — model org/farm/field/device/membership tables yourself.
- **Backend runtime choice**: Fastify (Node), Python (vision/AI), or Go (telemetry/ingestion). Express is disallowed by default.
- **Queueing**: pg-boss. **Email**: Resend. **Analytics**: PostHog. **Hosting target**: GKE long-term, Cloudflare acceptable for landing pages.
- **Multi-tenancy from day one** — never hard-code single-org/single-farm assumptions, even in marketing-adjacent code.
- **Design posture**: industrial, agricultural, precise, calm. Avoid generic SaaS dashboard aesthetics, playful consumer visuals, or claims that overstate hardware readiness.
- Keep public marketing pages structurally separate from authenticated platform concerns.

When you make decisions that affect repo structure, env vars, API boundaries, schema, auth, deployment, design tokens, brand messaging, device taxonomy, or background jobs — update the corresponding doc under `docs/`.

## Docs to Consult

`docs/README.md` is the index. For non-trivial work, read the relevant doc first rather than inferring from code — the code is intentionally thin relative to the planned architecture:

- `docs/project-vision.md`, `docs/product-roadmap.md`
- `docs/architecture/` (overview, monorepo-strategy, authentication-and-tenancy, data-and-storage-strategy, queueing-email-analytics, deployment-strategy, robotics-and-edge-architecture)
- `docs/product/` (landing-pages-prd, cropautonomy-platform-prd, gaiabots-knowledge-base-prd)
- `docs/brand/` for tone, palette rationale, and brand briefs
