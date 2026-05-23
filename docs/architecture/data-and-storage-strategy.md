# Data and Storage Strategy

## Decision

Use Supabase for:

- Postgres
- Storage
- Realtime where useful
- Edge Functions where they are a good fit

Do not use Supabase Auth.

## Database Priorities

The schema should support the August 2026 prototype and future robotics expansion.

Design early for:

- organizations
- users
- memberships
- farms
- fields
- crop types
- scans
- scan assets
- analysis jobs
- analysis results
- devices
- telemetry events
- notifications
- audit events

Initial migration:

- `packages/db/migrations/0001_public_leads.sql` creates `public.public_leads` for landing-page lead capture.

## Storage Buckets

Likely buckets:

- `scan-originals`
- `scan-derived`
- `reports`
- `device-artifacts`
- `public-brand-assets`

Original uploaded files should be retained unless policy says otherwise. Derived assets should be linked back to source assets and analysis jobs.

## Scan Data

A crop scan should preserve:

- organization
- farm
- field
- capture source
- uploader or device
- timestamp
- location if available
- original image or media assets
- analysis status
- analysis output

## Telemetry Data

Telemetry should be append-first.

Telemetry events may include:

- device status
- battery state
- GPS position
- sensor reading
- scan event
- mission event
- error event
- connectivity event

Early prototypes can simulate telemetry, but the schema should avoid assumptions that block real devices later.

## Realtime

Real-time is a **core platform capability**, not optional polish. See [Realtime Strategy](./realtime-strategy.md) for the full contract; the data layer concerns are:

- Supabase Realtime is the **v0 transport** for state and metadata events (heartbeats, scan progress, detections, notifications). It must be reached only through `packages/realtime` — no application code imports `@supabase/supabase-js` realtime APIs directly. This is what keeps the transport swappable when Supabase Realtime is outgrown.
- Do **not** subscribe to raw `postgres_changes` on application tables. Publish explicit, typed events into logical channels (`org.{orgId}.…`) from server code or database triggers. Coupling subscriptions to schema turns every migration into a realtime breakage and makes the eventual transport swap painful.
- Do **not** use RLS-filtered subscriptions for tenant isolation. RLS-on-Realtime is Postgres-specific; no other transport reproduces it. Scope tenancy structurally in the channel name.
- Realtime events are ephemeral. Postgres is the durable record. A consumer that misses an event recovers by re-reading state, not by replaying the channel.
- Media streams (Field Capture live preview, future device video) do **not** ride Supabase Realtime — they use WebRTC with signaling on a Realtime channel.

## Data Governance

Future docs should define:

- retention rules
- deletion rules
- export requirements
- organization data ownership
- privacy posture for imagery
- model training consent
- audit logging
