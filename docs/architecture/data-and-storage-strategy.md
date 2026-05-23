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

Supabase Realtime may be useful for:

- analysis status updates
- notification updates
- telemetry dashboards
- device online/offline state

Use it where it improves operator experience. Avoid making realtime mandatory for basic workflows.

## Data Governance

Future docs should define:

- retention rules
- deletion rules
- export requirements
- organization data ownership
- privacy posture for imagery
- model training consent
- audit logging
