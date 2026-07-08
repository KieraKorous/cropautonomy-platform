-- 0029_agriculture_role_names.sql
--
-- Renames the five system roles to agriculture-flavored display names. Only the
-- `name` (and matching `description`) change — the `key` stays stable because
-- every permission grant (role_permissions), API guard (SYSTEM_ROLE_KEYS /
-- guards keyed on 'owner'), and portal enum keys off it. 0002's seed carries the
-- same names for fresh databases; this migration brings already-provisioned ones
-- into line. Idempotent — safe to re-run.
--
--   admin       → Farm Manager
--   manager     → Agronomist
--   technician  → Field Scout
--   viewer      → Observer
--   owner       → Owner (description reworded to match)
--
-- Apply via: psql "$DATABASE_URL" -f packages/db/migrations/0029_agriculture_role_names.sql
-- (or paste into the Supabase SQL editor).
------------------------------------------------------------------------------

update public.roles set
  name = 'Owner',
  description = 'Full control over the operation, including billing and deletion.'
where key = 'owner' and is_system = true and org_id is null;

update public.roles set
  name = 'Farm Manager',
  description = 'Run the operation: manage members, farms, fields, devices, captures and analysis. Cannot manage billing or delete the org.'
where key = 'admin' and is_system = true and org_id is null;

update public.roles set
  name = 'Agronomist',
  description = 'Plan and edit farms, fields, crop plantings, captures, and analysis. No member or device administration.'
where key = 'manager' and is_system = true and org_id is null;

update public.roles set
  name = 'Field Scout',
  description = 'Field operator: create captures, run sessions, request analysis, view operational data.'
where key = 'technician' and is_system = true and org_id is null;

update public.roles set
  name = 'Observer',
  description = 'Read-only access to operational data. Cannot mutate, invite, or administer.'
where key = 'viewer' and is_system = true and org_id is null;
