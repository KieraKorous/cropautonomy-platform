-- 0012_phone_cameras_and_live_requests.sql
--
-- Phone cameras + the request/accept gate for going live, plus authoritative
-- disconnect.
--
--   1. A new `phone` device family — an operator's phone, paired from the portal
--      Devices tab as a first-class camera (distinct from `third_party`, which
--      means a bring-your-own integration).
--   2. `device_pairings` — short-lived codes the portal mints and the phone
--      (Field PWA, already SSO-authenticated) claims to enrol itself as a device.
--   3. `live_requests` — a phone asks to go live; any technician+ watcher accepts
--      on the Live screen, which spawns a normal `capture_session`. Kept separate
--      from capture_sessions so the live wall's ACTIVE_STATUSES roster and the
--      capture.session.started/ended fanout stay unchanged (a rejected request
--      never becomes a session row).
--   4. `capture_sessions.live_disconnected_at` — authoritative, persisted
--      disconnect. Null = engaged. The session stays in ACTIVE_STATUSES (the tile
--      remains on the wall) but renders "Disconnected — Reconnect"; a directed
--      realtime command tells the phone to stop/resume publishing.
--
-- The device link a request needs already exists:
-- capture_sessions.started_by_device_id (0004).
--
-- Idempotent: safe to re-run.
--
-- Apply via: psql "$DATABASE_URL" -f packages/db/migrations/0012_phone_cameras_and_live_requests.sql
-- (or paste into the Supabase SQL editor).
------------------------------------------------------------------------------

------------------------------------------------------------------------
-- 1. phone device family
------------------------------------------------------------------------

alter table public.devices
  drop constraint if exists devices_device_family_check;

alter table public.devices
  add constraint devices_device_family_check check (device_family in (
    'gaia_r',          -- rover
    'gaia_d',          -- drone
    'gaia_s',          -- sensor station
    'phone',           -- operator phone paired as a camera (Field PWA publisher)
    'third_party',     -- bring-your-own integration
    'simulator'        -- dev / test fixture
  ));

------------------------------------------------------------------------
-- 2. authoritative disconnect for live sessions
------------------------------------------------------------------------

alter table public.capture_sessions
  add column if not exists live_disconnected_at timestamptz;

------------------------------------------------------------------------
-- 3. device_pairings
--
-- The portal creates a pending row + short code; the phone claims it with the
-- code, which upserts the devices row and links it here. Codes are single-use
-- and expire. Partial-unique on `code` keeps at most one live pending code per
-- value (claimed/expired codes can collide harmlessly).
------------------------------------------------------------------------

create table if not exists public.device_pairings (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  code                        text not null,
  status                      text not null default 'pending' check (status in (
                                'pending',
                                'claimed',
                                'expired',
                                'cancelled'
                              )),
  created_by_user_id          uuid not null references public.users(id) on delete cascade,
  device_id                   uuid references public.devices(id) on delete set null,
  claimed_by_user_id          uuid references public.users(id) on delete set null,
  expires_at                  timestamptz not null,
  claimed_at                  timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create unique index if not exists device_pairings_pending_code_uidx
  on public.device_pairings (code)
  where status = 'pending';

create index if not exists device_pairings_org_status_idx
  on public.device_pairings (org_id, status);

drop trigger if exists device_pairings_set_updated_at on public.device_pairings;
create trigger device_pairings_set_updated_at
  before update on public.device_pairings
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------
-- 4. live_requests
--
-- A phone (device) asks to go live. On accept the app code creates a normal
-- 'live' capture_session and stores its id here. Partial-unique keeps a device
-- from stacking multiple pending requests.
------------------------------------------------------------------------

create table if not exists public.live_requests (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  device_id                   uuid not null references public.devices(id) on delete cascade,
  requested_by_user_id        uuid not null references public.users(id) on delete cascade,
  status                      text not null default 'pending' check (status in (
                                'pending',
                                'accepted',
                                'rejected',
                                'cancelled',
                                'expired'
                              )),
  session_id                  uuid references public.capture_sessions(id) on delete set null,
  decided_by_user_id          uuid references public.users(id) on delete set null,
  farm_id                     uuid references public.farms(id) on delete set null,
  field_id                    uuid references public.fields(id) on delete set null,
  crop_type_id                uuid references public.crop_types(id) on delete set null,
  requested_at                timestamptz not null default now(),
  decided_at                  timestamptz,
  expires_at                  timestamptz not null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create unique index if not exists live_requests_pending_device_uidx
  on public.live_requests (device_id)
  where status = 'pending';

create index if not exists live_requests_org_status_idx
  on public.live_requests (org_id, status);

drop trigger if exists live_requests_set_updated_at on public.live_requests;
create trigger live_requests_set_updated_at
  before update on public.live_requests
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------
-- 5. RLS — mirror 0006: default-deny, service_role bypass, authenticated SELECT
-- scoped to the active org claim. All writes go through the service-role API.
------------------------------------------------------------------------

alter table public.device_pairings enable row level security;
alter table public.live_requests   enable row level security;

drop policy if exists device_pairings_service_role_all on public.device_pairings;
create policy device_pairings_service_role_all
  on public.device_pairings as permissive for all to service_role
  using (true) with check (true);

drop policy if exists live_requests_service_role_all on public.live_requests;
create policy live_requests_service_role_all
  on public.live_requests as permissive for all to service_role
  using (true) with check (true);

drop policy if exists device_pairings_select_org on public.device_pairings;
create policy device_pairings_select_org
  on public.device_pairings for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists live_requests_select_org on public.live_requests;
create policy live_requests_select_org
  on public.live_requests for select to authenticated
  using (org_id = public.current_org_id());
