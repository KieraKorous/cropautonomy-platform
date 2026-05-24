# Capture Pipeline

End-to-end specification for how a crop observation (photo, burst, video) flows from operator → Supabase Storage → analysis → result. Used by the Field Capture PWA, the future GAIA device firmware, and the portal's analysis surfaces.

## Terminology

A **capture** is the unit of observation: one photo, one burst frame, one video. Every capture is linked to org / farm / field / operator (or device) / location / timestamp.

A **capture session** is an operator's in-field work span — they start a session, capture multiple things, end the session. Sessions are optional for one-off uploads but required for live-preview workflows.

An **analysis job** is the asynchronous AI processing that runs on one or more captures. A job belongs to a capture (1:1 for v0). Analysis results are stored alongside the capture.

> **Terminology note:** Earlier docs (`authentication-and-tenancy.md`, `data-and-storage-strategy.md`) refer to `crop_scans` and `scans`. **`captures` is the unified name going forward** — every input source (phone, drone, rover, sensor) produces captures. The "scan" concept is being deprecated as a top-level entity. The `analysis_jobs` table remains as the job record produced from a capture. Update older docs as they're touched.

## Source decisions

- **Object storage:** Supabase Storage, bucket `scan-originals` (kept for compatibility with existing storage doc; rename to `captures-original` is acceptable but not required).
- **Upload pattern:** **direct browser → Supabase Storage via signed upload URLs**. The PWA never streams file bytes through an application server. The server's job is to mint the signed URL and register the capture row.
- **Capture API surface:** lives in the portal Next.js app under `app.cropautonomy.com/api/captures/*` for v0. Cross-origin call from `field.cropautonomy.com` with the Clerk session cookie (scoped to `.cropautonomy.com`). Migrate to a dedicated `services/api` Fastify service when the field PWA is no longer the only client and the portal Next.js app is a wrong tenant for the responsibility.
- **Resumability:** Supabase Storage's resumable upload protocol (TUS) where supported; otherwise multipart with chunk-level retry.
- **Analysis handoff:** capture row transitions to `uploaded` → server enqueues a pg-boss `scan.analysis.requested` job → worker publishes realtime progress events.

## Database schema

Two new tables, plus refinements to existing entities.

### `captures`

The unit-of-observation table. Every row is exactly one media artifact.

```sql
create table captures (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references organizations(id) on delete cascade,
  farm_id               uuid references farms(id),
  field_id              uuid references fields(id),
  zone_id               uuid references zones(id),
  crop_type_id          uuid references crop_types(id),

  session_id            uuid references capture_sessions(id),

  -- who/what produced it
  source                text not null check (source in (
                          'field_capture_pwa',
                          'bulk_upload',
                          'gaia_r',
                          'gaia_d',
                          'gaia_s',
                          'integration'
                        )),
  captured_by_user_id   text,                     -- clerk user id, null for autonomous device captures
  source_device_id      uuid references devices(id),

  -- media
  media_type            text not null check (media_type in ('photo', 'burst_frame', 'video')),
  burst_index           integer,                  -- 0-based position within a burst; null for non-burst
  video_duration_ms     integer,                  -- null for non-video
  mime_type             text not null,
  size_bytes            bigint not null,
  checksum_sha256       text,                     -- for resumable upload integrity

  -- storage
  storage_bucket        text not null default 'scan-originals',
  storage_path          text not null,            -- e.g. org/{orgId}/capture/{captureId}.jpg
  thumbnail_path        text,                     -- optional small derivative for fast portal display

  -- when/where
  captured_at           timestamptz not null,     -- on-device timestamp
  uploaded_at           timestamptz,              -- server timestamp when upload finalized
  location              geography(point, 4326),   -- nullable
  gps_accuracy_meters   numeric,
  heading_degrees       numeric,

  -- lifecycle
  status                text not null default 'pending_upload' check (status in (
                          'pending_upload',
                          'uploading',
                          'uploaded',
                          'analysis_queued',
                          'analysis_running',
                          'analyzed',
                          'failed'
                        )),
  status_message        text,                     -- last error or status detail
  analysis_job_id       uuid references analysis_jobs(id),

  -- extensibility
  metadata              jsonb not null default '{}'::jsonb,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index captures_org_field_captured_at_idx
  on captures (org_id, field_id, captured_at desc);
create index captures_session_id_idx
  on captures (session_id) where session_id is not null;
create index captures_status_idx
  on captures (status) where status in ('pending_upload', 'uploading', 'analysis_queued', 'analysis_running');
```

### `capture_sessions`

Operator-initiated session spanning multiple captures. Required for live-preview workflows.

```sql
create table capture_sessions (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references organizations(id) on delete cascade,

  started_by_user_id    text not null,            -- clerk user id
  started_by_device_id  uuid references devices(id),

  farm_id               uuid references farms(id),
  field_id              uuid references fields(id),
  crop_type_id          uuid references crop_types(id),

  status                text not null default 'starting' check (status in (
                          'starting',
                          'live',
                          'paused',
                          'ended',
                          'error'
                        )),

  started_at            timestamptz not null default now(),
  ended_at              timestamptz,

  last_known_location   geography(point, 4326),
  last_heartbeat_at     timestamptz,

  capture_count         integer not null default 0,    -- denormalized count, updated by trigger or worker

  metadata              jsonb not null default '{}'::jsonb,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index capture_sessions_org_status_idx
  on capture_sessions (org_id, status)
  where status in ('starting', 'live', 'paused');
```

The `status in (...) where status in (...)` partial index is what makes "show me all active sessions for this org" fast — the dataset is bounded by `currently active`, not all sessions ever.

### Migration ordering

`captures` and `capture_sessions` land in `packages/db/migrations/0004_captures_and_analysis.sql`, which sits on top of `0002_platform_core.sql` (orgs / users / roles) and `0003_geography_and_devices.sql` (farms / fields / zones / crop_types / devices). `analysis_jobs` and `analysis_results` are introduced in the same `0004` migration so the circular FK between `captures.analysis_job_id` and `analysis_jobs.capture_id` can be resolved in one atomic apply. See [Database Schema](./database-schema.md) for the full migration list.

There is no `crop_scans` / `scan_assets` split anywhere in the schema — `captures` rows are themselves the asset records. References to the older split in legacy docs should be updated as those files are touched.

## Storage layout

Files are addressed by org-prefixed paths so cross-tenant access is structurally impossible:

```
scan-originals/
  org/{orgId}/
    capture/{captureId}.{ext}              — original media
    capture/{captureId}_thumb.jpg          — derived thumbnail (optional)
```

The path is set by the server when minting the signed URL; the field PWA does not choose its own path. This prevents path injection and keeps the convention enforceable.

## Upload protocol

Five steps, three round trips.

### 1. Reserve capture

Field PWA → portal API:

```
POST https://app.cropautonomy.com/api/captures
Cookie: __session=<clerk session, scoped to .cropautonomy.com>
Content-Type: application/json

{
  "orgId": "...",
  "farmId": "...",
  "fieldId": "...",
  "zoneId": null,
  "cropTypeId": "...",
  "sessionId": "...",                       // optional
  "source": "field_capture_pwa",
  "mediaType": "photo",
  "burstIndex": null,
  "videoDurationMs": null,
  "mimeType": "image/jpeg",
  "sizeBytes": 3215488,
  "checksumSha256": "...",
  "capturedAt": "2026-05-23T15:42:11.230Z",
  "location": { "lat": 39.8412, "lng": -95.5722, "accuracyMeters": 4.2 },
  "headingDegrees": 138,
  "metadata": {}
}
```

Server:

1. Authenticates the Clerk session and resolves the user
2. Validates the user has `technician` role (or higher) for `orgId`
3. Validates that `farmId`, `fieldId`, etc. belong to `orgId`
4. Inserts a `captures` row with `status = 'pending_upload'`
5. Mints a signed upload URL against `scan-originals` at the canonical path
6. Returns:

```json
{
  "captureId": "...",
  "uploadUrl": "https://....supabase.co/storage/v1/upload/resumable/...",
  "uploadMethod": "tus",                   // or "put" for non-resumable fallback
  "uploadHeaders": { "x-upsert": "false" },
  "expiresAt": "2026-05-23T16:42:11.230Z"
}
```

### 2. Upload to storage

Field PWA → Supabase Storage directly using TUS protocol (chunked, resumable):

- Initiates upload at `uploadUrl`
- Uploads in chunks; pauses/resumes survive offline
- Validates checksum on completion (Supabase Storage verifies on its side)

The PWA does not need to call the portal during the upload — it's a direct browser-to-storage transfer.

If a session is in progress, the PWA also publishes a `capture.recorded` event on the session's state channel as soon as it has a `captureId` (immediately after step 1, not waiting for upload to finish) so the portal Live page can show the new capture instantly. The thumbnail in the event is a small inline data URL; the full asset arrives later.

### 3. Finalize upload

Field PWA → portal API:

```
POST https://app.cropautonomy.com/api/captures/{captureId}/finalize
Cookie: __session=...
Content-Type: application/json

{
  "actualSizeBytes": 3215488,
  "actualChecksumSha256": "...",
  "thumbnailDataUrl": "data:image/jpeg;base64,..."   // optional
}
```

Server:

1. Authenticates and authorizes
2. Verifies the object exists in Supabase Storage at the expected path with the expected size + checksum
3. If a thumbnail was provided, uploads it to `{path}_thumb.jpg`
4. Transitions `status` to `uploaded`, sets `uploaded_at`
5. Enqueues a pg-boss `scan.analysis.requested` job with `{ captureId }`
6. Transitions `status` to `analysis_queued`
7. Returns the updated `captures` row

### 4. Analysis (server-side, asynchronous)

pg-boss worker picks up the job:

1. Loads the capture row, downloads the asset
2. Transitions `status` to `analysis_running`, publishes `scan.started` event
3. Runs analysis (Phase 2 is a stub or basic vision model; Phase 5+ is the real pipeline)
4. As detections are found, publishes `scan.detection` events
5. Periodically publishes `scan.progress`
6. On completion, writes `analysis_results` rows, transitions `status` to `analyzed`, publishes `scan.completed`
7. On failure, transitions to `failed`, publishes `scan.failed` with retry flag

See [`packages/realtime` spec](./realtime-package-spec.md) for the exact event schemas.

### 5. Result delivery

The portal subscribes to scan events for any open scan detail view, and to org-wide notifications for "analysis complete" toasts. Resend sends the email notification per the existing notification flow.

The field PWA does **not** subscribe to analysis events for v0 — it's the producer, not the reviewer. Field techs check results back in the portal. (Push notifications to the PWA are a later-phase nicety.)

## Offline / queued path

When the field PWA is offline:

1. Capture is saved to IndexedDB with all the same metadata as the reserve-capture request body
2. PWA also records the binary blob in IndexedDB
3. PWA's upload worker runs whenever connectivity is detected
4. Worker calls step 1 (reserve capture) — gets back a `captureId` and upload URL
5. Worker runs step 2 (upload) — TUS handles partial uploads if connectivity drops mid-upload
6. Worker runs step 3 (finalize)
7. Local IndexedDB record marked synced; blob deleted

If a capture is created during a live session but the PWA is offline:

- `capture.recorded` event cannot publish in real time; it queues alongside the upload
- When the upload finalizes, the event publishes with the same `capturedAt` timestamp — viewers see it appear in the timeline at its real time, just late

## Authorization checks

Server-side enforcement at every API call:

- The Clerk session must be valid
- The user must have an active membership in `orgId`
- The user's role must be at least `technician` for capture creation/finalization
- All referenced IDs (`farmId`, `fieldId`, `zoneId`, `cropTypeId`, `sessionId`) must belong to `orgId`
- The path in the signed URL is server-chosen, never client-chosen

Storage bucket policy (Supabase RLS):

- Service role has full access (server signs URLs)
- Authenticated users have no direct read access to `scan-originals` — they fetch via signed URLs minted server-side per request
- Public access is denied

## What this doc doesn't cover yet

- Push notifications to the field PWA when analysis completes (later phase)
- Long-form video transcoding pipeline (treat videos as raw for v0; transcode in a later phase if needed)
- Bulk re-analysis for older captures when the model improves
- Capture deletion / retention / GDPR-style erasure flows (deferred to `data-and-storage-strategy.md § Data Governance`)
- Cross-org capture sharing or research partner read access (open question in `authentication-and-tenancy.md`)
