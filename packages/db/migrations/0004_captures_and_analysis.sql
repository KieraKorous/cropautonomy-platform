-- Captures, capture sessions, and the analysis pipeline.
--
-- captures and capture_sessions are copied verbatim from
-- docs/architecture/capture-pipeline.md (the canonical spec).
-- The forward FK from captures.analysis_job_id to analysis_jobs(id) is added
-- at the bottom because the two tables reference each other.

------------------------------------------------------------------------
-- capture_sessions
--
-- Operator-initiated work spans (Field Capture PWA today; rover/drone missions
-- later). Required for live-preview workflows; optional for one-off uploads.
------------------------------------------------------------------------

create table public.capture_sessions (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,

  started_by_user_id          uuid not null references public.users(id) on delete restrict,
  started_by_device_id        uuid references public.devices(id) on delete set null,

  farm_id                     uuid references public.farms(id) on delete set null,
  field_id                    uuid references public.fields(id) on delete set null,
  crop_type_id                uuid references public.crop_types(id) on delete set null,

  status                      text not null default 'starting' check (status in (
                                'starting',
                                'live',
                                'paused',
                                'ended',
                                'error'
                              )),

  started_at                  timestamptz not null default now(),
  ended_at                    timestamptz,

  last_known_location         geography(point, 4326),
  last_heartbeat_at           timestamptz,

  capture_count               integer not null default 0,

  metadata                    jsonb not null default '{}'::jsonb,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index capture_sessions_org_status_idx
  on public.capture_sessions (org_id, status)
  where status in ('starting', 'live', 'paused');

create index capture_sessions_org_started_at_idx
  on public.capture_sessions (org_id, started_at desc);

create trigger capture_sessions_set_updated_at
  before update on public.capture_sessions
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------
-- captures
--
-- The unit-of-observation table. One row per media artifact.
-- captured_by_user_id references public.users(id) (our internal uuid). The
-- capture-pipeline.md text mentions a Clerk user id; the schema resolves to our
-- mirrored user record. The Clerk-side mapping happens in API code before insert.
------------------------------------------------------------------------

create table public.captures (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  farm_id                     uuid references public.farms(id) on delete set null,
  field_id                    uuid references public.fields(id) on delete set null,
  zone_id                     uuid references public.zones(id) on delete set null,
  crop_type_id                uuid references public.crop_types(id) on delete set null,

  session_id                  uuid references public.capture_sessions(id) on delete set null,

  -- who/what produced it
  source                      text not null check (source in (
                                'field_capture_pwa',
                                'bulk_upload',
                                'gaia_r',
                                'gaia_d',
                                'gaia_s',
                                'integration'
                              )),
  captured_by_user_id         uuid references public.users(id) on delete set null,
  source_device_id            uuid references public.devices(id) on delete set null,

  -- media
  media_type                  text not null check (media_type in ('photo', 'burst_frame', 'video')),
  burst_index                 integer,
  video_duration_ms           integer,
  mime_type                   text not null,
  size_bytes                  bigint not null,
  checksum_sha256             text,

  -- storage
  storage_bucket              text not null default 'scan-originals',
  storage_path                text not null,
  thumbnail_path              text,

  -- when/where
  captured_at                 timestamptz not null,
  uploaded_at                 timestamptz,
  location                    geography(point, 4326),
  gps_accuracy_meters         numeric,
  heading_degrees             numeric,

  -- lifecycle
  status                      text not null default 'pending_upload' check (status in (
                                'pending_upload',
                                'uploading',
                                'uploaded',
                                'analysis_queued',
                                'analysis_running',
                                'analyzed',
                                'failed'
                              )),
  status_message              text,
  analysis_job_id             uuid,   -- FK added after analysis_jobs is created below

  -- extensibility
  metadata                    jsonb not null default '{}'::jsonb,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index captures_org_field_captured_at_idx
  on public.captures (org_id, field_id, captured_at desc);

create index captures_session_id_idx
  on public.captures (session_id) where session_id is not null;

create index captures_status_idx
  on public.captures (status)
  where status in ('pending_upload', 'uploading', 'analysis_queued', 'analysis_running');

create index captures_org_captured_at_idx
  on public.captures (org_id, captured_at desc);

create index captures_location_gix
  on public.captures using gist (location);

create trigger captures_set_updated_at
  before update on public.captures
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------
-- analysis_jobs
--
-- One job per capture (1:1 for v0). started_at / completed_at bracket the
-- worker's actual processing time so we can measure backlog vs throughput.
------------------------------------------------------------------------

create table public.analysis_jobs (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  capture_id                  uuid not null references public.captures(id) on delete cascade,

  status                      text not null default 'queued' check (status in (
                                'queued',
                                'running',
                                'succeeded',
                                'failed',
                                'cancelled'
                              )),
  pipeline_version            text,                       -- which model/pipeline produced this run
  error                       text,
  error_code                  text,

  queued_at                   timestamptz not null default now(),
  started_at                  timestamptz,
  completed_at                timestamptz,

  metadata                    jsonb not null default '{}'::jsonb,

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- One in-flight job per capture; historical jobs (succeeded/failed/cancelled)
-- may coexist if a capture is reanalyzed later.
create unique index analysis_jobs_capture_active_uidx
  on public.analysis_jobs (capture_id)
  where status in ('queued', 'running');

create index analysis_jobs_org_status_idx
  on public.analysis_jobs (org_id, status)
  where status in ('queued', 'running');

create index analysis_jobs_org_queued_at_idx
  on public.analysis_jobs (org_id, queued_at desc);

create trigger analysis_jobs_set_updated_at
  before update on public.analysis_jobs
  for each row execute function public.set_updated_at();

-- Close the cycle: captures.analysis_job_id -> analysis_jobs.id.
alter table public.captures
  add constraint captures_analysis_job_id_fkey
  foreign key (analysis_job_id)
  references public.analysis_jobs(id)
  on delete set null;

------------------------------------------------------------------------
-- analysis_results
--
-- DECISION: one row per detection (high cardinality), not one row per run with
-- a jsonb array. Reasoning:
--   - Primary query is "all <category> detections in this field this season"
--     (e.g. tar spot heat map). That's a relational filter, not jsonb unnest.
--   - Per-detection rows have stable ids that the realtime detection event
--     can reference (events carry detectionId; result rows are the durable record).
--   - Per-detection rows let us index on (category, confidence) for "show me
--     the most-confident new detections" without scanning every job's payload.
--   - The per-run summary (counts, duration) already lives on analysis_jobs.
------------------------------------------------------------------------

create table public.analysis_results (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  analysis_job_id             uuid not null references public.analysis_jobs(id) on delete cascade,
  capture_id                  uuid not null references public.captures(id) on delete cascade,

  category                    text not null,             -- e.g. 'tar_spot', 'volunteer_corn', 'stress_zone'
  subcategory                 text,
  confidence                  numeric(5, 4) not null check (confidence >= 0 and confidence <= 1),

  -- detection location: either a point on the ground (geo) or a bounding box
  -- in image pixel space (bbox). geo may be null for image-only detections.
  location                    geography(point, 4326),
  bounding_box                jsonb,                     -- { x, y, w, h } in pixels, normalized 0..1

  payload                     jsonb not null default '{}'::jsonb,

  created_at                  timestamptz not null default now()
);

create index analysis_results_capture_id_idx
  on public.analysis_results (capture_id);

create index analysis_results_job_id_idx
  on public.analysis_results (analysis_job_id);

create index analysis_results_org_category_confidence_idx
  on public.analysis_results (org_id, category, confidence desc);

create index analysis_results_location_gix
  on public.analysis_results using gist (location);
