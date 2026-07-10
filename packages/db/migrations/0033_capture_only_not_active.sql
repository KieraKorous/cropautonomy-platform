-- 0033_capture_only_not_active.sql
--
-- Capture-only sessions no longer mark a device "Active".
--
-- 0022_device_activity.sql made a device read as is_live when EITHER a live
-- session ran on it (capture_sessions.started_by_device_id) OR it produced
-- captures inside an active capture-only session (captures.session_id join).
-- Product decision: the Devices page "Active" pill should mean "streaming live
-- right now" — a capture-only session (photos / bursts, no live stream) should
-- leave the device Inactive. So is_live now comes ONLY from device-backed live
-- sessions.
--
-- last_used_at is unchanged: a capture-only session still counts as real usage,
-- it just isn't "active/live". The `cap` CTE (most recent capture per device)
-- therefore stays in the last_used_at math; it's only dropped from live_ids.
--
-- Idempotent: create or replace. Read-only projection helper — auth + org
-- scoping happen in the API layer.
--
-- Apply via: psql "$DATABASE_URL" -f packages/db/migrations/0033_capture_only_not_active.sql
-- (or paste into the Supabase SQL editor).
------------------------------------------------------------------------------

create or replace function public.org_device_activity(p_org_id uuid)
returns table (
  device_id    uuid,
  last_used_at timestamptz,
  is_live      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with
  -- Most recent capture each device produced (covers capture-only usage, which
  -- has no started_by_device_id but always stamps source_device_id). Feeds
  -- last_used_at only — NOT is_live.
  cap as (
    select source_device_id as did, max(captured_at) as ts
    from public.captures
    where org_id = p_org_id and source_device_id is not null
    group by source_device_id
  ),
  -- Most recent device-backed (live) session activity per device.
  sess as (
    select started_by_device_id as did, max(coalesce(last_heartbeat_at, started_at)) as ts
    from public.capture_sessions
    where org_id = p_org_id and started_by_device_id is not null
    group by started_by_device_id
  ),
  -- Devices currently streaming live: a device-backed session that's not ended
  -- and has a fresh heartbeat (field app heartbeats every 15s). Capture-only
  -- sessions carry no started_by_device_id, so they never appear here — that's
  -- the whole point of this migration.
  live_ids as (
    select distinct started_by_device_id as did
    from public.capture_sessions
    where org_id = p_org_id
      and started_by_device_id is not null
      and status in ('starting', 'live', 'paused')
      and ended_at is null
      and coalesce(last_heartbeat_at, started_at) > now() - interval '45 seconds'
  ),
  ids as (
    select did from cap
    union select did from sess
    union select did from live_ids
  )
  select
    ids.did as device_id,
    -- GREATEST ignores NULLs, so a device with only captures (or only sessions)
    -- still resolves to its single timestamp.
    greatest(cap.ts, sess.ts) as last_used_at,
    (live_ids.did is not null) as is_live
  from ids
  left join cap on cap.did = ids.did
  left join sess on sess.did = ids.did
  left join live_ids on live_ids.did = ids.did;
$$;

revoke all on function public.org_device_activity(uuid) from public;
grant execute on function public.org_device_activity(uuid) to authenticated, service_role;

comment on function public.org_device_activity(uuid) is
  'Per-device activity for an org: last_used_at (latest capture or live-session '
  'activity) and is_live (a device-backed live session with a heartbeat in the '
  'last 45s; capture-only sessions do NOT count). Used by services/api '
  'GET /v1/devices for "last used" + activity status.';
