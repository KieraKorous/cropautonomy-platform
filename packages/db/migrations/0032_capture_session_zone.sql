-- Zone on capture_sessions.
--
-- A session already records the farm/field/crop the operator is working; add the
-- field sub-area (zone) so the operator can pick "which part of the field" at
-- session start and the whole session (and its captures, which already carry a
-- zone_id per 0004) is consistently scoped. captures.zone_id already exists; this
-- fills the matching gap on the session record.
--
-- Re-runnable: `if not exists`. on delete set null mirrors the other geography
-- FKs on capture_sessions (farm_id/field_id) — deleting a zone unlinks it, never
-- cascades away the session.

alter table public.capture_sessions
  add column if not exists zone_id uuid references public.zones(id) on delete set null;

comment on column public.capture_sessions.zone_id is
  'Field sub-area (zone) the session is working, chosen at session start in the '
  'field PWA. Nullable — most sessions are field-level. Captures collected in the '
  'session inherit it (captures.zone_id).';
