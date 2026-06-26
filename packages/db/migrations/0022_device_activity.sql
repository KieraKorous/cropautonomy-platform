-- Per-device activity rollup.
--
-- Surfaces, for each device in an org:
--   * last_used_at — the latest real activity: the most recent capture the device
--     produced (captures.source_device_id) OR the most recent live-session
--     activity it drove (capture_sessions.started_by_device_id). This is distinct
--     from devices.last_seen_at, which today is only stamped at pairing.
--   * is_live — whether the field app is capturing/streaming on the device right
--     now: an active capture session (starting/live/paused), not disconnected,
--     with a heartbeat in the last 45s (mirrors the Live wall's staleness window).
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
  with cap as (
    select source_device_id as did, max(captured_at) as ts
    from public.captures
    where org_id = p_org_id and source_device_id is not null
    group by source_device_id
  ),
  sess as (
    select
      started_by_device_id as did,
      max(coalesce(last_heartbeat_at, started_at)) as ts,
      bool_or(
        status in ('starting', 'live', 'paused')
        and live_disconnected_at is null
        and coalesce(last_heartbeat_at, started_at) > now() - interval '45 seconds'
      ) as live
    from public.capture_sessions
    where org_id = p_org_id and started_by_device_id is not null
    group by started_by_device_id
  ),
  ids as (
    select did from cap
    union
    select did from sess
  )
  select
    ids.did as device_id,
    -- GREATEST ignores NULLs, so a device with only captures (or only sessions)
    -- still resolves to its single timestamp.
    greatest(cap.ts, sess.ts) as last_used_at,
    coalesce(sess.live, false) as is_live
  from ids
  left join cap on cap.did = ids.did
  left join sess on sess.did = ids.did;
$$;

revoke all on function public.org_device_activity(uuid) from public;
grant execute on function public.org_device_activity(uuid) to authenticated, service_role;

comment on function public.org_device_activity(uuid) is
  'Per-device activity for an org: last_used_at (latest capture or live-session '
  'activity) and is_live (an active capture session with a heartbeat in the last '
  '45s). Used by services/api GET /v1/devices for "last used" + activity status.';
