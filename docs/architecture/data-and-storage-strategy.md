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
- zones
- crop types
- **captures** — the unified observation record across all sources (phone, drone, rover, sensor). See [Capture Pipeline](./capture-pipeline.md) for the full schema. Replaces the older `crop_scans` + `scan_assets` split.
- **capture_sessions** — operator live sessions
- analysis jobs
- analysis results
- devices
- telemetry events
- notifications
- audit events

Migrations live in `packages/db/migrations/`. See [Database Schema](./database-schema.md) for the full reference. Current ordering:

- `0001_public_leads.sql` — marketing-side lead capture (pre-existing).
- `0002_platform_core.sql` — extensions, identity, tenancy, roles, permissions, and the seeded permission set.
- `0003_geography_and_devices.sql` — farms, fields, zones, crop types, crop plantings, devices.
- `0004_captures_and_analysis.sql` — capture sessions, captures, analysis jobs, analysis results. Schema for `captures` and `capture_sessions` is copied verbatim from [Capture Pipeline](./capture-pipeline.md).
- `0005_telemetry_notifications_audit.sql` — telemetry, notifications, audit log.
- `0006_rls_policies.sql` — RLS enabled and org-scoped read policies attached.

## Storage Buckets

Buckets:

- `scan-originals` — original capture media (photos, video, burst frames). Object paths are server-chosen and lead with `org/{orgId}/capture/{captureId}` so cross-tenant access is structurally impossible. Authenticated users have no direct read; they fetch via signed URLs minted server-side per request. See [Capture Pipeline](./capture-pipeline.md) for the full path convention and signed-URL upload protocol.
- `scan-derived` — thumbnails, transcoded video, processed derivatives. Same `org/{orgId}/…` path prefix discipline.
- `reports` — generated PDF/HTML analysis reports.
- `device-artifacts` — device firmware logs, calibration files, telemetry archives.
- `public-brand-assets` — the only bucket with public-read; for marketing-site imagery.

Original uploaded files should be retained unless policy says otherwise. Derived assets should be linked back to source captures and analysis jobs.

## Capture Data

A capture (the unit-of-observation record) should preserve:

- organization
- farm
- field
- zone (optional)
- crop type (optional)
- capture session (optional, but required for live-preview workflows)
- capture source (`field_capture_pwa`, `gaia_r`, `gaia_d`, `gaia_s`, `bulk_upload`, `integration`)
- uploader user or source device
- on-device captured timestamp + server uploaded timestamp
- location and GPS accuracy if available
- media type (photo, burst frame, video) and media metadata (size, mime, checksum, video duration, burst index)
- storage bucket + path
- lifecycle status (`pending_upload` → `uploading` → `uploaded` → `analysis_queued` → `analysis_running` → `analyzed` | `failed`)
- link to the analysis job + results

Full schema and lifecycle in [Capture Pipeline](./capture-pipeline.md).

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
