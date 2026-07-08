-- 0031_field_scout_zone_permissions.sql
--
-- Let Field Scouts (technician) add and edit zones.
--
-- 0002 seeded the technician role read-only on land (farms/fields/zones.read
-- only). Product intent for the field scout is now: they may edit small details
-- and add zones, but make no major changes to farms or fields. Zones are the
-- granular sub-area of a field, so `zones.create` + `zones.update` is the right
-- grant — it stops short of `farms.*`/`fields.*` writes (which include editing
-- field boundaries, a major structural change) and short of any `*.delete`.
--
-- Role hierarchy after this migration (land):
--   viewer     (Observer)     — read-only
--   technician (Field Scout)  — read + zones.create/update            <- this file
--   manager    (Agronomist)   — read + create/update on farms/fields/zones
--   admin      (Farm Manager) — everything, including delete
--   owner      (Owner)        — everything
--
-- Idempotent: safe to re-run.
--
-- Apply via: psql "$DATABASE_URL" -f packages/db/migrations/0031_field_scout_zone_permissions.sql
-- (or paste into the Supabase SQL editor).
------------------------------------------------------------------------------

insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.key = 'technician' and r.is_system = true
    and p.key in ('zones.create', 'zones.update')
on conflict do nothing;
