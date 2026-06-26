-- Per-device activity rollup.
--
-- Surfaces, for each device in an org:
--   * last_used_at — the latest real activity: the most recent capture the device
--     produced (captures.source_device_id) OR the most recent live-session
--     activity it drove (capture_sessions.started_by_device_id). This is distinct
--     from devices.last_seen_at, which today is only stamped at pairing.
--   * is_live — whether the field app is capturing/streaming on the device right
--     now. Covers BOTH session modes:
--       - live sessions: capture_sessions.started_by_device_id = the device.
--       - capture-only sessions: these carry no started_by_device_id (so they
--         stay off the Live wall), so we tie them to a device through the
--         captures they produce (captures.session_id + captures.source_device_id).
--     A session counts as current when it's not ended (status starting/live/
--     paused) and has a heartbeat in the last 45s — the field app heartbeats every
--     15s in either mode, so this is the shared "still in use" signal.
--
-- Powers the portal's device "Last used" display + activity-derived status
-- (Active vs Inactive). Read-only projection helper — auth + org scoping happen
-- in the API layer. Re-runnable (create or replace).

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
  -- has no started_by_device_id but always stamps source_device_id).
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
  -- Sessions in use right now (either mode): not ended, fresh heartbeat.
  active_sessions as (
    select id, started_by_device_id
    from public.capture_sessions
    where org_id = p_org_id
      and status in ('starting', 'live', 'paused')
      and ended_at is null
      and coalesce(last_heartbeat_at, started_at) > now() - interval '45 seconds'
  ),
  -- Devices currently in use: directly for live sessions, or via the captures
  -- they're producing inside an active capture-only (or live) session.
  live_ids as (
    select started_by_device_id as did
    from active_sessions
    where started_by_device_id is not null
    union
    select distinct c.source_device_id as did
    from public.captures c
    join active_sessions s on s.id = c.session_id
    where c.org_id = p_org_id and c.source_device_id is not null
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
  'activity) and is_live (an active capture session with a heartbeat in the last '
  '45s). Used by services/api GET /v1/devices for "last used" + activity status.';
