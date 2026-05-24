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

## Analytics Principles

- Define event names intentionally.
- Include organization context where appropriate.
- Avoid sending sensitive crop imagery or private notes as analytics properties.
- Keep analytics useful for product decisions, not vanity tracking.
