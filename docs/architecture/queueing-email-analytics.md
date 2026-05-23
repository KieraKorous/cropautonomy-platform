# Queueing, Email, and Analytics

## Queueing: pg-boss

Use pg-boss for durable background work backed by Postgres.

Initial queues may include:

- `lead.capture.received`
- `email.send`
- `scan.analysis.requested`
- `scan.analysis.completed`
- `scan.analysis.failed`
- `notification.create`
- `telemetry.ingest`

## Queueing Principles

- Do not run slow AI work inline with user requests.
- Make jobs idempotent where possible.
- Store job status in domain tables when users need to see progress.
- Capture failure details for debugging.
- Use retries for transient failures.
- Avoid queue payloads that contain large binary data; store assets and pass references.

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

## Analytics Principles

- Define event names intentionally.
- Include organization context where appropriate.
- Avoid sending sensitive crop imagery or private notes as analytics properties.
- Keep analytics useful for product decisions, not vanity tracking.
