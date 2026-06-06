# Queueing, Email, and Analytics

## Queueing: pg-boss

Use pg-boss for durable background work backed by Postgres.

### pg-boss installation

pg-boss installs into the **same Supabase Postgres database** as the application schema, under its own dedicated `pgboss` schema. Sibling-database isolation was considered and rejected for v0:

- Sibling DB adds a second Postgres to provision, back up, monitor, and migrate.
- Cross-DB transactions are not available, so "create capture row + enqueue analysis job" loses atomicity. Same-DB lets workers do this in a single transaction.
- The DB is the bottleneck under load, not the queue schema. Splitting it doesn't relieve the real pressure.

Revisit when there is a concrete reason — workers saturating the primary's connection pool, retention growth on `pgboss.job` impacting backup windows, or a need to run pg-boss workers in a network segment that can't reach the application DB.

Initialization order:

1. Apply our own migrations (`packages/db/migrations/000N_*.sql`).
2. Start pg-boss with a service-role connection string. On first run, pg-boss creates `pgboss` schema and its internal tables automatically (`new PgBoss(connectionString).start()`).
3. Workers register handlers and run continuously.

We do **not** ship a migration for pg-boss — its schema is owned by the library and may change between versions. No grants are required beyond what the service role already has.

Initial queues may include:

- `lead.capture.received`
- `email.send`
- `scan.analysis.requested`
- `scan.analysis.completed`
- `scan.analysis.failed`
- `notification.create`
- `telemetry.ingest`

## Queueing vs Realtime

pg-boss and the realtime layer ([Realtime Strategy](./realtime-strategy.md)) are complementary, not interchangeable. Pick the right one and don't blur the boundary:

| Need | Use | Why |
|------|-----|-----|
| Work must run even if nobody is watching, with retries and idempotency | pg-boss | Durable, recoverable, observable |
| Tell every watching operator something just happened | Realtime | Ephemeral, low-latency, fan-out |
| Both — durable work plus live progress feedback | pg-boss runs the work; the worker publishes progress events to Realtime as it goes | Each layer does one job well |

Example: `scan.analysis.requested` is a pg-boss job. As the worker processes it, it publishes `scan.progress` events to `org.{orgId}.scan.{scanId}.progress` so the operator sees the bar advance. If the operator closes the tab, the job still completes; if the worker crashes, pg-boss retries; the real-time channel is purely the live feedback layer.

## Queueing Principles

- Do not run slow AI work inline with user requests.
- Make jobs idempotent where possible.
- Store job status in domain tables when users need to see progress.
- Capture failure details for debugging.
- Use retries for transient failures.
- Avoid queue payloads that contain large binary data; store assets and pass references.
- When a job has user-visible progress, publish realtime events from inside the worker. The job is the source of truth; the events are the live view of it.

## Email: Resend

Use Resend for:

- internal lead capture notifications
- lead capture confirmations
- early access follow-ups
- organization invitations
- scan analysis completion
- operational alerts
- account and notification emails

Email templates should eventually live in a shared package.

Lead capture should write durable lead records to the database and also send email notifications through Resend. Email is not the source of truth.

Initial implementation:

- both public apps post to `/api/leads`
- `@gaia/leads` writes to Supabase and sends a Resend notification
- `packages/db/migrations/0001_public_leads.sql` defines the lead table

## Email Principles

- Keep transactional email clear and useful.
- Avoid over-emailing.
- Respect consent on marketing updates.
- Log sent email metadata without storing unnecessary message bodies.

## Analytics: PostHog

Use PostHog for product analytics and interaction instrumentation.

Initial public-site events:

- `public_page_viewed`
- `public_cta_clicked`
- `lead_form_started`
- `lead_form_submitted`
- `lead_form_failed`

Initial portal events:

- `portal_signed_in`
- `organization_created`
- `farm_created`
- `field_created`
- `scan_created`
- `scan_analysis_requested`
- `scan_analysis_viewed`
- `device_viewed`
- `live_page_viewed`
- `live_stream_opened`
- `live_stream_closed`

## Analytics Implementation

PostHog is wrapped by the `@gaia/analytics` package — the only place app code touches `posthog-js`. Application code imports typed helpers, never the SDK directly (mirroring how `@gaia/realtime` owns Supabase Realtime).

- `@gaia/analytics/events` — typed event registry (`events.ts`). The single source of truth for event names; this list and the catalogue above must stay in sync.
- `@gaia/analytics` (`client.ts`) — `initAnalytics`, `capture(event, props)`, `identify`, `setOrganization`, `reset`. Every function is a **safe no-op until `initAnalytics` runs with a key**, so a blank `NEXT_PUBLIC_POSTHOG_KEY` (the dev default) disables analytics without breaking callers.
- `@gaia/analytics/next` — `AnalyticsProvider`, a client provider for the Next App Router. Initializes PostHog once and emits a semantic pageview on each soft navigation (posthog's automatic `$pageview` is disabled to avoid double-counting). Added to `transpilePackages` in `packages/config/next.config.mjs`.

Wiring (v0):

- **Marketing** (`cropautonomy-web`, `gaiabots-web`): `AnalyticsProvider` in the root layout emits `public_page_viewed`. `public_cta_clicked` fires from the shared `CtaLink` (`@gaia/ui`) used by the header + hero CTAs. `lead_form_*` fire from the shared `LeadForm`.
- **Portal** (`portal-web`): `PortalAnalyticsProvider` initializes PostHog and `identify()`s the signed-in Clerk user (`portal_signed_in`). Wired events: `live_page_viewed`, `live_stream_opened`/`live_stream_closed` (per camera tile), `device_viewed`, `scan_analysis_viewed` (capture detail page), `scan_analysis_requested` (Retry/reanalyze).
- **Not yet wired**: `organization_created`, `farm_created`, `field_created`, `scan_created` — those flows are ComingSoon stubs or happen in the field PWA, not the portal. They stay declared in `events.ts` so wiring later is type-safe. Org grouping (`setOrganization`) is also deferred: Clerk orgs are not the platform's tenancy source of truth and the platform orgId isn't surfaced to the portal client at the layout layer yet — attach `orgId` per-event where it's already known.

## Analytics Principles

- Define event names intentionally.
- Include organization context where appropriate.
- Avoid sending sensitive crop imagery or private notes as analytics properties.
- Keep analytics useful for product decisions, not vanity tracking.
