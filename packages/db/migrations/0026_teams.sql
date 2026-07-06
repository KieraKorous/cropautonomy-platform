-- 0026_teams.sql
--
-- Teams: a sub-organization access boundary. An org can carve its farms, fields,
-- devices, capture sessions (Live + Recordings), and captures into teams; team
-- members see/act only on their teams' entities while org admins/owners see
-- everything.
--
-- DESIGN (see docs/architecture/authentication-and-tenancy.md § Open Questions —
-- this answers "Will organizations support sub-teams?"):
--   - teams            — named group within an org.
--   - team_memberships — user <-> team, many-to-many. NO per-team role: the org
--                        role governs what you can DO; the team only governs
--                        WHICH rows you can see.
--   - team_assignments — polymorphic entity <-> team, many-to-many. One table
--                        for all five assignable types so the visibility rule is
--                        written ONCE (RLS helper + API helper), not five times.
--                        The tradeoff (no FK on resource_id) is acceptable: app
--                        code cleans up on delete under the service role, and an
--                        orphan assignment row is inert (matches nothing).
--
-- VISIBILITY RULE (canonical). A caller may see entity row R iff:
--   (A) caller holds team_members.manage  (admin/owner org-wide bypass), OR
--   (B) R has ZERO team_assignments        (unassigned = org-visible; this is why
--                                            rollout is non-breaking — all existing
--                                            rows have zero assignments), OR
--   (C) R shares >= 1 team with the caller.
-- All AND-scoped by org_id (the existing tenant boundary, unchanged).
--
-- The admin/owner bypass is enforced only in the API query layer (the JWT carries
-- no permission claims). RLS enforces (B)+(C)+org as the secondary net; because
-- the API reads via the service role (RLS-exempt), RLS only ever under-shows on a
-- hypothetical direct authenticated query, which is the safe failure mode per
-- 0006_rls_policies.sql's stated posture.
--
-- Idempotent-ish: table creates are not, but the seeding inserts use
-- `on conflict do nothing`.
--
-- Apply via: psql "$DATABASE_URL" -f packages/db/migrations/0026_teams.sql
-- (or paste into the Supabase SQL editor). Regenerate packages/db/src/types/database.ts after.
------------------------------------------------------------------------------

------------------------------------------------------------------------
-- teams
------------------------------------------------------------------------

create table public.teams (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  name                text not null,
  description         text,
  color               text,
  created_by_user_id  uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Team names are unique within an org, case-insensitively.
create unique index teams_org_name_uidx on public.teams (org_id, lower(name));
create index teams_org_idx on public.teams (org_id);

create trigger teams_set_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------
-- team_memberships  (user <-> team, many-to-many)
--
-- org_id is denormalized so scoping never has to join back to teams, and so a
-- stray cross-org (team_id, user_id) can't slip through — app code sets all three
-- from the authenticated caller's org.
------------------------------------------------------------------------

create table public.team_memberships (
  id                  uuid primary key default gen_random_uuid(),
  team_id             uuid not null references public.teams(id) on delete cascade,
  user_id             uuid not null references public.users(id) on delete cascade,
  org_id              uuid not null references public.organizations(id) on delete cascade,
  added_by_user_id    uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (team_id, user_id)
);

create index team_memberships_user_idx on public.team_memberships (user_id);
create index team_memberships_org_user_idx on public.team_memberships (org_id, user_id);

------------------------------------------------------------------------
-- team_assignments  (entity <-> team, many-to-many, polymorphic)
------------------------------------------------------------------------

create table public.team_assignments (
  id                  uuid primary key default gen_random_uuid(),
  team_id             uuid not null references public.teams(id) on delete cascade,
  org_id              uuid not null references public.organizations(id) on delete cascade,
  resource_type       text not null check (resource_type in (
                        'farm',
                        'field',
                        'device',
                        'capture_session',
                        'capture'
                      )),
  resource_id         uuid not null,
  assigned_by_user_id uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (team_id, resource_type, resource_id)
);

-- The hot path for the visibility rule: "give me the assignments for this
-- (type, id)". Also serves the reverse (a team's assignments of a type).
create index team_assignments_resource_idx
  on public.team_assignments (resource_type, resource_id);
create index team_assignments_team_idx on public.team_assignments (team_id);
create index team_assignments_org_idx on public.team_assignments (org_id);

------------------------------------------------------------------------
-- Permissions + role_permissions
--
-- 0002's owner/admin seeding was a one-time cross join against the permission set
-- as it existed then, so these NEW keys must be granted to every role explicitly
-- (mirrors 0013_devices_manage_permissions.sql).
------------------------------------------------------------------------

insert into public.permissions (key, resource_group, description) values
  ('teams.read',          'teams', 'View teams, their membership, and their entity assignments.'),
  ('teams.create',        'teams', 'Create teams.'),
  ('teams.update',        'teams', 'Rename or recolor a team.'),
  ('teams.delete',        'teams', 'Delete a team.'),
  ('teams.assign',        'teams', 'Assign or unassign entities to teams.'),
  ('team_members.manage', 'teams', 'Add or remove users on a team. Doubles as the org-wide team-visibility bypass.')
on conflict (key) do nothing;

-- owner: every teams permission (bypass included).
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.key = 'owner' and r.is_system = true
    and p.key in ('teams.read', 'teams.create', 'teams.update', 'teams.delete',
                  'teams.assign', 'team_members.manage')
on conflict do nothing;

-- admin: every teams permission (bypass included).
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.key = 'admin' and r.is_system = true
    and p.key in ('teams.read', 'teams.create', 'teams.update', 'teams.delete',
                  'teams.assign', 'team_members.manage')
on conflict do nothing;

-- manager: curate grouping (read + assign) but not create/delete teams or manage
-- rosters — and NOT team_members.manage, so managers stay team-scoped (no bypass).
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.key = 'manager' and r.is_system = true
    and p.key in ('teams.read', 'teams.assign')
on conflict do nothing;

-- technician + viewer: read only. Technician self-assignment at capture time is
-- gated by team membership in the create routes, NOT by teams.assign.
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.key in ('technician', 'viewer') and r.is_system = true
    and p.key = 'teams.read'
on conflict do nothing;

------------------------------------------------------------------------
-- RLS helpers
------------------------------------------------------------------------

-- The current session's team ids (its active org only). Security-definer so a
-- policy can read team_memberships without granting the caller SELECT on it.
create or replace function public.user_team_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tm.team_id
  from public.team_memberships tm
  where tm.user_id = public.current_user_id()
    and tm.org_id = public.current_org_id()
$$;

revoke all on function public.user_team_ids() from public;
grant execute on function public.user_team_ids() to authenticated, service_role;

-- Visibility rule (B) OR (C) for one (type, id). Rule (A) — admin/owner bypass —
-- is NOT expressed here; it lives in the API layer (the JWT has no permission
-- claims). See the file header.
create or replace function public.resource_visible(p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- (B) unassigned = org-visible
    not exists (
      select 1 from public.team_assignments a
      where a.resource_type = p_type and a.resource_id = p_id
    )
    -- (C) shares >= 1 team with the caller
    or exists (
      select 1 from public.team_assignments a
      where a.resource_type = p_type and a.resource_id = p_id
        and a.team_id in (select public.user_team_ids())
    );
$$;

revoke all on function public.resource_visible(text, uuid) from public;
grant execute on function public.resource_visible(text, uuid) to authenticated, service_role;

------------------------------------------------------------------------
-- RLS on the three new tables (org-scoped SELECT; finer control in app code).
------------------------------------------------------------------------

alter table public.teams             enable row level security;
alter table public.team_memberships  enable row level security;
alter table public.team_assignments  enable row level security;

do $$
declare
  t text;
  tables text[] := array['teams', 'team_memberships', 'team_assignments'];
begin
  foreach t in array tables loop
    execute format(
      'create policy %I on public.%I as permissive for all to service_role using (true) with check (true);',
      t || '_service_role_all', t
    );
  end loop;
end$$;

create policy teams_select_org
  on public.teams for select to authenticated
  using (org_id = public.current_org_id());

create policy team_memberships_select_org
  on public.team_memberships for select to authenticated
  using (org_id = public.current_org_id());

create policy team_assignments_select_org
  on public.team_assignments for select to authenticated
  using (org_id = public.current_org_id());

------------------------------------------------------------------------
-- Replace the five entity SELECT policies to AND the team visibility rule onto
-- the existing org check. Zones are NOT independently assignable (they inherit
-- their field's context) and keep their org-only policy from 0006.
------------------------------------------------------------------------

drop policy farms_select_org on public.farms;
create policy farms_select_org
  on public.farms for select to authenticated
  using (org_id = public.current_org_id()
         and public.resource_visible('farm', farms.id));

drop policy fields_select_org on public.fields;
create policy fields_select_org
  on public.fields for select to authenticated
  using (org_id = public.current_org_id()
         and public.resource_visible('field', fields.id));

drop policy devices_select_org on public.devices;
create policy devices_select_org
  on public.devices for select to authenticated
  using (org_id = public.current_org_id()
         and public.resource_visible('device', devices.id));

drop policy capture_sessions_select_org on public.capture_sessions;
create policy capture_sessions_select_org
  on public.capture_sessions for select to authenticated
  using (org_id = public.current_org_id()
         and public.resource_visible('capture_session', capture_sessions.id));

drop policy captures_select_org on public.captures;
create policy captures_select_org
  on public.captures for select to authenticated
  using (org_id = public.current_org_id()
         and public.resource_visible('capture', captures.id));
