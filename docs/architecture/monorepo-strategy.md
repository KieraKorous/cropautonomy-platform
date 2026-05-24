# Monorepo Strategy

## Decision

Start with a monorepo. Design the repo so applications can be separated later if operational needs change.

## Why Monorepo First

A monorepo is appropriate because the first phases need shared:

- design tokens
- UI components
- brand primitives
- TypeScript config
- linting config
- domain types
- analytics helpers
- email templates
- database schema access
- auth and tenancy utilities

The project is still early enough that keeping decisions close together will reduce coordination overhead.

## Separation Readiness

Avoid making separation painful by:

- keeping app-specific code inside app folders
- keeping shared code in explicit packages
- avoiding cross-app imports
- keeping environment variables documented per app
- making deployment boundaries clear
- avoiding hidden global state

## Suggested Apps

### `apps/cropautonomy-web`

Public website for `cropautonomy.com`.

Initial scope:

- landing page
- lead capture
- public brand narrative

### `apps/gaiabots-web`

Public website for `gaiabots.ai`.

Initial scope:

- landing page
- GAIA-R and GAIA-D positioning
- lead capture
- later knowledge base

### `apps/portal-web`

Authenticated platform portal. Served at `app.cropautonomy.com`. Next.js 16 / React 19.

Initial scope:

- auth shell
- organizations
- farms and fields
- crop scan workflow
- analysis reports
- Live operator surface

### `apps/field-web` (planned)

Field Capture PWA. Served at `field.cropautonomy.com`. **Vite + React + Workbox** — this is a deliberate exception to the Next.js consistency of the rest of the workspace, justified in [Field Capture PRD](../product/field-capture-prd.md) and [Deployment Strategy](./deployment-strategy.md). Do not try to "normalize" the field app onto Next.js — a real offline-first PWA is a different runtime model than the portal, and pretending they're the same causes friction.

Initial scope:

- Clerk sign-in (SSO with portal)
- photo / burst / video capture tagged to org / farm / field / GPS
- live preview sessions (WebRTC) visible in the portal's Live page
- offline queue + resumable upload
- minimal operator HUD (connectivity, GPS, battery, queue, session status)

Shares `packages/realtime`, `packages/domain`, and parts of `packages/ui` with the portal. Does **not** share build tooling.

## Suggested Packages

### `packages/ui`

Shared UI components and design tokens.

### `packages/domain`

Shared domain types for organizations, farms, fields, devices, scans, and telemetry.

### `packages/db`

Database schema, migrations, and typed database clients.

### `packages/auth`

Clerk integration and internal membership helpers.

### `packages/jobs`

pg-boss queues, job names, worker helpers, and job payload schemas.

### `packages/email`

Resend client and transactional email templates.

### `packages/analytics`

PostHog helpers and event naming conventions.

## Guardrails

- Do not put business logic in UI components.
- Do not duplicate domain models across apps.
- Do not let the GaiaBots site depend on CropAutonomy portal internals.
- Do not hard-code deployment assumptions into shared packages.
- Do not assume one build toolchain across the workspace. The marketing apps and portal use Next.js; the field PWA uses Vite for principled reasons. Shared packages must build for both consumers — emit ESM, avoid Next-specific primitives (`next/image`, `next/link`, server-only APIs) in code paths the field app will pull in.

