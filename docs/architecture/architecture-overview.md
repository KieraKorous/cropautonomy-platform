# Architecture Overview

## Architectural Direction

The project should start as a monorepo and remain ready for future separation.

The first public deliverables are landing pages, but the architecture must support a multi-tenant agricultural intelligence platform with future robotics, telemetry, AI analysis, and device operations.

## Proposed Monorepo Shape

Suggested top-level structure:

```text
apps/
  cropautonomy-web/
  gaiabots-web/
  cropautonomy-portal/
packages/
  ui/
  config/
  db/
  auth/
  analytics/
  email/
  jobs/
  domain/
  eslint-config/
  typescript-config/
docs/
services/
  api/
  vision/
  telemetry/
```

The exact structure can evolve, but applications should avoid deeply coupling to each other. Shared packages should hold reusable design tokens, UI primitives, domain types, configuration, and service adapters.

## Core Stack

- Next.js `16.2.6`
- Tailwind CSS `4.3.0`
- DaisyUI `5.5.20`
- Clerk for identity
- Supabase for Postgres, Storage, Realtime, and Edge Functions
- pg-boss for queueing
- Resend for email
- PostHog for analytics
- Fastify for lightweight Node backend/API services
- Python for image scanning, computer vision, and AI/model workflows
- Go for telemetry, device ingestion, concurrent workers, and performance-sensitive systems services
- GKE for long-term platform hosting
- Cloudflare for low-cost public landing page hosting if useful

Backend technology should be selected by workload fit. Do not default to outdated or familiar tools when another runtime is more appropriate.

## System Boundaries

### Public Web

Public web includes:

- CropAutonomy landing page
- GaiaBots landing page
- future public marketing pages
- future GaiaBots knowledge base

Public web should not require authentication.

### Portal

The CropAutonomy portal includes:

- authenticated application shell
- organization management
- farms and fields
- crop scan workflows — phone capture and bulk upload (branded **Field Capture**) is the v1 capture input; drone, rover, and sensor sources are modeled in the schema and arrive as the GAIA hardware lineup matures
- analysis reports
- notifications
- future device and fleet management

All capture sources — operator phone captures (Field Capture), GAIA-R rover, GAIA-D drone, GAIA-S sensor — write into the same `captures` surface and run through the same asynchronous analysis pipeline. The source is metadata on the capture, not a separate code path.

### Backend Services

Backend services include:

- database access
- queue workers
- AI analysis orchestration
- email sending
- analytics event capture
- telemetry ingestion
- storage operations

The browser-facing API surface is `services/api` (Fastify); all browser data paths funnel through it (no `@gaia/db` client in any UI app). Background work runs in `services/workers` (pg-boss consumers). See [API Architecture](./api-architecture.md) for the full rule, the surface/runtime table, and the standards (envelope, errors, auth, pagination, idempotency) that govern every endpoint on `api.cropautonomy.com`.

Runtime fit by workload:

- **Fastify (Node)** — `services/api`. Long-lived containers on GKE.
- **Node long-lived** — `services/workers`. pg-boss consumers; shares the Dockerfile with `services/api` in v0.
- **Python** — `services/vision`. Model inference, image preprocessing, computer vision pipelines. Called by workers, not browsers.
- **Go** — `services/telemetry`. Device ingestion, high-concurrency systems work. Called by devices, not browsers.

### Robotics and Edge

Robotics and edge systems include:

- future GAIA-R rover clients
- future GAIA-D drone clients
- simulated telemetry sources
- edge inference
- local capture and sync workflows

Note: operator phone capture (Field Capture) is not a robotics/edge client — it lives in the portal as a browser/PWA flow. It shares the downstream `captures` surface but is not part of the device taxonomy. Do not introduce a "GAIA-U" / "GAIA-Handheld" device family.

## Architectural Principles

- Multi-tenancy is a foundational requirement.
- Auth identity and application membership are separate concerns.
- AI analysis should run asynchronously.
- Storage should preserve original assets and derived outputs.
- Telemetry should be append-first and auditable.
- Public pages should not be blocked by portal infrastructure complexity.
- Device concepts should be modeled early but implemented incrementally.
- Runtime choices should be made for product and operational fit, not developer familiarity alone.
