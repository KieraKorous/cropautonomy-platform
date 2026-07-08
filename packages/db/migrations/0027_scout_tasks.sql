-- 0027_scout_tasks.sql
--
-- Scout tasks: the day's field-work to-dos — "Walk Doniphan F-22 and confirm the
-- tar spot pattern", assigned to a person, scoped to the team(s) that should see
-- it. Backs the portal's "Today's scout list" page and the field PWA's "My tasks".
--
-- DESIGN
--   - scout_tasks              — one row per to-do. `assignee_user_id` is the
--                                person RESPONSIBLE (drives the avatar + name);
--                                it is NOT a visibility control.
--   - visibility               — reuses the polymorphic `team_assignments` from
--                                0026_teams.sql. A task is visible to a caller iff
--                                (A) admin/owner bypass, (B) it has zero team
--                                assignments (org-visible), or (C) it shares >= 1
--                                team with the caller. Same rule as every other
--                                assignable entity — zero new visibility code.
--   - captures.scout_task_id   — closes the loop: captures collected against a
--                                task point back at it, so the portal can show
--                                "N captures collected" and the task can flip to
--                                in_progress on first capture.
--   - origin_type/origin_capture_id — reserved for a future worker that spawns a
--                                "go confirm" task from an analysis finding. v1
--                                always inserts origin_type = 'manual'.
--
-- Idempotent-ish: table/column creates are not, but permission inserts use
-- `on conflict do nothing`. The team_assignments CHECK swap is drop-if-exists.
--
-- Apply via: psql "$DATABASE_URL" -f packages/db/migrations/0027_scout_tasks.sql
-- (or paste into the Supabase SQL editor). Regenerate packages/db/src/types/database.ts after.
------------------------------------------------------------------------------

------------------------------------------------------------------------
-- scout_tasks
------------------------------------------------------------------------

create table public.scout_tasks (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,

  title                 text not null,
  details               text,

  status                text not null default 'open' check (status in (
                          'open',
                          'in_progress',
                          'done'
                        )),
  -- 'immediate' is the top tier: it floats to the top of the board and renders
  -- with a red border. 'low' < 'normal' < 'high' < 'immediate'.
  priority              text check (priority in ('low', 'normal', 'high', 'immediate')),

  -- Person responsible. NULL = assigned to the team(s) at large, no individual.
  assignee_user_id      uuid references public.users(id) on delete set null,

  -- Location context (all optional — a task can be field-agnostic).
  farm_id               uuid references public.farms(id) on delete set null,
  field_id              uuid references public.fields(id) on delete set null,
  zone_id               uuid references public.zones(id) on delete set null,

  -- Drives the Today / This week grouping on the board.
  due_on                date,

  -- Provenance. v1 is always 'manual'; the columns exist so a future finding
  -- worker can attribute an auto-generated task without a migration.
  origin_type           text not null default 'manual' check (origin_type in (
                          'manual',
                          'analysis_finding'
                        )),
  origin_capture_id     uuid references public.captures(id) on delete set null,

  created_by_user_id    uuid references public.users(id) on delete set null,
  completed_by_user_id  uuid references public.users(id) on delete set null,
  completed_at          timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index scout_tasks_org_status_idx   on public.scout_tasks (org_id, status);
create index scout_tasks_org_due_idx       on public.scout_tasks (org_id, due_on);
create index scout_tasks_org_assignee_idx  on public.scout_tasks (org_id, assignee_user_id);
create index scout_tasks_field_idx         on public.scout_tasks (field_id);

create trigger scout_tasks_set_updated_at
  before update on public.scout_tasks
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------
-- team_assignments: make scout_task an assignable resource type.
--
-- 0026 created the CHECK inline (unnamed), so Postgres auto-named it
-- `team_assignments_resource_type_check`. Drop + re-add with the 6th value.
------------------------------------------------------------------------

alter table public.team_assignments
  drop constraint if exists team_assignments_resource_type_check;

alter table public.team_assignments
  add constraint team_assignments_resource_type_check check (resource_type in (
    'farm',
    'field',
    'device',
    'capture_session',
    'capture',
    'scout_task'
  ));

------------------------------------------------------------------------
-- captures: link a capture back to the scout task it was collected against.
------------------------------------------------------------------------

alter table public.captures
  add column if not exists scout_task_id uuid references public.scout_tasks(id) on delete set null;

create index if not exists captures_scout_task_id_idx on public.captures (scout_task_id);

------------------------------------------------------------------------
-- Permissions + role_permissions
--
-- New keys must be granted to every role explicitly (0002's owner/admin cross
-- join was one-time). Mirrors 0026_teams.sql / 0013_devices_manage_permissions.sql.
--
-- `complete` is intentionally distinct from `update`: a technician can check off
-- a task assigned to them without holding edit rights on the task body. (The
-- route also lets the assignee complete their own task regardless.)
------------------------------------------------------------------------

insert into public.permissions (key, resource_group, description) values
  ('scout_tasks.read',     'scout_tasks', 'View scout tasks visible to your team(s).'),
  ('scout_tasks.create',   'scout_tasks', 'Create scout tasks and assign them to people and teams.'),
  ('scout_tasks.update',   'scout_tasks', 'Edit a scout task''s title, details, assignee, field, due date, or priority.'),
  ('scout_tasks.complete', 'scout_tasks', 'Change a scout task''s status (open / in progress / done).'),
  ('scout_tasks.delete',   'scout_tasks', 'Delete a scout task.')
on conflict (key) do nothing;

-- owner + admin + manager: full control (create/assign/edit/complete/delete).
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.key in ('owner', 'admin', 'manager') and r.is_system = true
    and p.key in ('scout_tasks.read', 'scout_tasks.create', 'scout_tasks.update',
                  'scout_tasks.complete', 'scout_tasks.delete')
on conflict do nothing;

-- technician: read + complete their own work. No create/edit/delete.
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.key = 'technician' and r.is_system = true
    and p.key in ('scout_tasks.read', 'scout_tasks.complete')
on conflict do nothing;

-- viewer: read only.
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.key = 'viewer' and r.is_system = true
    and p.key = 'scout_tasks.read'
on conflict do nothing;

------------------------------------------------------------------------
-- RLS: org-scoped SELECT AND the team visibility rule (B)+(C). Writes flow
-- through the service role in the API (RLS-exempt), same posture as captures.
------------------------------------------------------------------------

alter table public.scout_tasks enable row level security;

create policy scout_tasks_service_role_all
  on public.scout_tasks as permissive for all to service_role
  using (true) with check (true);

create policy scout_tasks_select_org
  on public.scout_tasks for select to authenticated
  using (org_id = public.current_org_id()
         and public.resource_visible('scout_task', scout_tasks.id));
