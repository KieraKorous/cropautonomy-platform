-- Telemetry, notifications, and audit log.

------------------------------------------------------------------------
-- telemetry_events
--
-- Append-first. recorded_at is the on-device clock (may drift); ingested_at is
-- the server clock at receipt. Splitting them is required for any honest
-- analytics on devices that go offline and replay later.
--
-- Volume target: high. We index for the two hot read patterns:
--   1. "latest telemetry for device X" (the Live page device-detail subscription)
--   2. "recent telemetry across org" (org-wide health panel)
-- Aggregations / historical analytics use a separate downstream store later
-- (out of scope here).
------------------------------------------------------------------------

create table public.telemetry_events (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  device_id                   uuid not null references public.devices(id) on delete cascade,

  event_type                  text not null check (event_type in (
                                'heartbeat',
                                'status',
                                'battery',
                                'gps_position',
                                'sensor_reading',
                                'scan_event',
                                'mission_event',
                                'connectivity',
                                'error'
                              )),

  payload                     jsonb not null default '{}'::jsonb,
  location                    geography(point, 4326),

  recorded_at                 timestamptz not null,      -- device clock
  ingested_at                 timestamptz not null default now()
);

create index telemetry_events_device_recorded_at_idx
  on public.telemetry_events (device_id, recorded_at desc);

create index telemetry_events_org_recorded_at_idx
  on public.telemetry_events (org_id, recorded_at desc);

create index telemetry_events_event_type_idx
  on public.telemetry_events (org_id, event_type, recorded_at desc);

create index telemetry_events_location_gix
  on public.telemetry_events using gist (location);

------------------------------------------------------------------------
-- notifications
--
-- Per-user notification inbox. org_id is set when the notification is org-scoped
-- (most are). type drives rendering on the client.
------------------------------------------------------------------------

create table public.notifications (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references public.users(id) on delete cascade,
  org_id                      uuid references public.organizations(id) on delete cascade,

  type                        text not null,             -- e.g. 'analysis.completed', 'invitation.received'
  title                       text not null,
  body                        text,
  payload                     jsonb not null default '{}'::jsonb,
  action_url                  text,

  read_at                     timestamptz,
  dismissed_at                timestamptz,
  created_at                  timestamptz not null default now()
);

create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null and dismissed_at is null;

create index notifications_user_created_at_idx
  on public.notifications (user_id, created_at desc);

create index notifications_org_created_at_idx
  on public.notifications (org_id, created_at desc)
  where org_id is not null;

------------------------------------------------------------------------
-- audit_events
--
-- Compliance + admin observability. Write-once; never updated after insert.
-- actor_user_id may be null for system / device-initiated actions.
------------------------------------------------------------------------

create table public.audit_events (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  actor_user_id               uuid references public.users(id) on delete set null,
  actor_device_id             uuid references public.devices(id) on delete set null,

  action                      text not null,             -- e.g. 'capture.deleted', 'member.role_changed'
  resource_type               text not null,
  resource_id                 text,                      -- text so non-uuid resources fit (e.g. storage paths)

  payload                     jsonb not null default '{}'::jsonb,

  occurred_at                 timestamptz not null default now()
);

create index audit_events_org_occurred_at_idx
  on public.audit_events (org_id, occurred_at desc);

create index audit_events_org_action_idx
  on public.audit_events (org_id, action, occurred_at desc);

create index audit_events_resource_idx
  on public.audit_events (resource_type, resource_id);
