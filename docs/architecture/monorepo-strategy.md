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

### `apps/cropautonomy-portal`

Authenticated platform portal.

Initial scope:

- auth shell
- organizations
- farms and fields
- crop scan workflow
- analysis reports

This app may begin later if the first implementation focuses only on public pages.

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

