-- 0013_devices_manage_permissions.sql
--
-- Let managers manage devices, not just read them.
--
-- 0002 seeded `devices.update` and `devices.deregister` but only granted them to
-- owner/admin (the manager block got `devices.read` alone). The portal Devices
-- page now offers rename / retire / delete, and those should be available to the
-- `manager` role too — operators (technician) and viewers stay read-only.
--
-- Idempotent: safe to re-run.
--
-- Apply via: psql "$DATABASE_URL" -f packages/db/migrations/0013_devices_manage_permissions.sql
-- (or paste into the Supabase SQL editor).
------------------------------------------------------------------------------

insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.key = 'manager' and r.is_system = true
    and p.key in ('devices.update', 'devices.deregister')
on conflict do nothing;
