-- Row Level Security policies for tenant-scoped tables.
--
-- POSTURE: belt-and-suspenders. Application code (running with the service role)
-- remains the primary authorization layer; permission checks happen against the
-- roles / permissions tables in @gaia/db. RLS exists to catch the case where
-- app code forgets to scope a query, NOT as the primary access control.
--
-- POLICY MODEL:
--   - Every tenant-scoped table has RLS enabled, with default deny.
--   - The service role bypasses RLS (Postgres default for the service_role JWT;
--     the service role is also a SUPERUSER on Supabase, so explicit policies
--     are unnecessary, but we still grant `using (true)` so the role can be
--     used in non-superuser contexts without surprise).
--   - The `authenticated` role gets SELECT scoped to its active org claim:
--       auth.jwt() ->> 'org_id' = org_id::text
--     This claim is sourced from Clerk JWT (the Clerk template renders
--     `user.publicMetadata.active_org_id` into the `org_id` claim — see
--     docs/architecture/authentication-and-tenancy.md § Cross-Surface SSO).
--   - WRITES (insert/update/delete) from the authenticated role are NOT granted
--     by RLS. All mutations go through server-side code that uses the service
--     role after running app-layer permission checks. This is deliberate:
--     "the user has captures.delete" is not encoded in the JWT; we resolve it
--     against the roles/permissions tables in app code.
--   - REALTIME: do not write any policies that grant realtime subscription
--     access. We do not use postgres_changes; broadcast channels are scoped
--     by name (`org.{orgId}.…`) and authorized at publish time. See
--     docs/architecture/realtime-strategy.md § Anti-patterns.
--
-- USER-SCOPED tables (notifications): scoped on the user_id claim as well,
-- resolved through public.users.clerk_user_id = auth.jwt() ->> 'sub'.

------------------------------------------------------------------------
-- Helper: resolve the internal user uuid for the current Clerk session.
--
-- Stable + security-definer so it can read public.users from inside a policy
-- without needing the caller to have SELECT on users. Returns NULL when there
-- is no authenticated subject (anon or service role).
------------------------------------------------------------------------

create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.id
  from public.users u
  where u.clerk_user_id = (auth.jwt() ->> 'sub')
  limit 1
$$;

revoke all on function public.current_user_id() from public;
grant execute on function public.current_user_id() to authenticated, service_role;

------------------------------------------------------------------------
-- Helper: active org for the current Clerk session.
------------------------------------------------------------------------

create or replace function public.current_org_id()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'org_id', '')::uuid
$$;

revoke all on function public.current_org_id() from public;
grant execute on function public.current_org_id() to authenticated, service_role;

------------------------------------------------------------------------
-- Enable RLS on every tenant-scoped table.
------------------------------------------------------------------------

alter table public.users                       enable row level security;
alter table public.organizations               enable row level security;
alter table public.roles                       enable row level security;
alter table public.permissions                 enable row level security;
alter table public.role_permissions            enable row level security;
alter table public.organization_memberships    enable row level security;
alter table public.organization_invitations    enable row level security;
alter table public.farms                       enable row level security;
alter table public.fields                      enable row level security;
alter table public.zones                       enable row level security;
alter table public.crop_types                  enable row level security;
alter table public.crop_plantings              enable row level security;
alter table public.devices                     enable row level security;
alter table public.capture_sessions            enable row level security;
alter table public.captures                    enable row level security;
alter table public.analysis_jobs               enable row level security;
alter table public.analysis_results            enable row level security;
alter table public.telemetry_events            enable row level security;
alter table public.notifications               enable row level security;
alter table public.audit_events                enable row level security;

-- public_leads (from 0001) already had RLS enabled but no policies were
-- attached. Leave it deny-all from the authenticated role; the lead-capture
-- API writes via the service role.

------------------------------------------------------------------------
-- service_role bypass on everything.
--
-- Supabase's service_role is a SUPERUSER and bypasses RLS already; these
-- policies are belt-and-suspenders in case it is ever demoted.
------------------------------------------------------------------------

do $$
declare
  t text;
  tables text[] := array[
    'users','organizations','roles','permissions','role_permissions',
    'organization_memberships','organization_invitations',
    'farms','fields','zones','crop_types','crop_plantings','devices',
    'capture_sessions','captures','analysis_jobs','analysis_results',
    'telemetry_events','notifications','audit_events'
  ];
begin
  foreach t in array tables loop
    execute format(
      'create policy %I on public.%I as permissive for all to service_role using (true) with check (true);',
      t || '_service_role_all', t
    );
  end loop;
end$$;

------------------------------------------------------------------------
-- authenticated: scoped SELECT on org-scoped tables.
------------------------------------------------------------------------

-- users: a user can see their own row. Membership-aware lookups (peers in
-- the same org) happen via app code with the service role.
create policy users_select_self
  on public.users
  for select to authenticated
  using (id = public.current_user_id());

-- organizations: a user can see orgs they are an active member of.
create policy organizations_select_member
  on public.organizations
  for select to authenticated
  using (
    exists (
      select 1 from public.organization_memberships m
      where m.org_id = organizations.id
        and m.user_id = public.current_user_id()
        and m.status = 'active'
    )
  );

-- roles: system roles are world-readable to authenticated users; custom org
-- roles are readable only to members of that org.
create policy roles_select
  on public.roles
  for select to authenticated
  using (
    is_system = true
    or org_id = public.current_org_id()
  );

create policy permissions_select
  on public.permissions
  for select to authenticated
  using (true);

create policy role_permissions_select
  on public.role_permissions
  for select to authenticated
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_permissions.role_id
        and (r.is_system = true or r.org_id = public.current_org_id())
    )
  );

-- organization_memberships: members can see all memberships in their active org.
create policy organization_memberships_select_org
  on public.organization_memberships
  for select to authenticated
  using (org_id = public.current_org_id());

-- organization_invitations: members can see pending invitations on their org.
create policy organization_invitations_select_org
  on public.organization_invitations
  for select to authenticated
  using (org_id = public.current_org_id());

-- Org-scoped tables: same shape for all of them.
create policy farms_select_org
  on public.farms for select to authenticated
  using (org_id = public.current_org_id());

create policy fields_select_org
  on public.fields for select to authenticated
  using (org_id = public.current_org_id());

create policy zones_select_org
  on public.zones for select to authenticated
  using (org_id = public.current_org_id());

-- Crop types: platform-wide rows visible to all authenticated users; org-custom
-- rows visible only to members of that org.
create policy crop_types_select
  on public.crop_types for select to authenticated
  using (
    org_id is null
    or org_id = public.current_org_id()
  );

create policy crop_plantings_select_org
  on public.crop_plantings for select to authenticated
  using (org_id = public.current_org_id());

create policy devices_select_org
  on public.devices for select to authenticated
  using (org_id = public.current_org_id());

create policy capture_sessions_select_org
  on public.capture_sessions for select to authenticated
  using (org_id = public.current_org_id());

create policy captures_select_org
  on public.captures for select to authenticated
  using (org_id = public.current_org_id());

create policy analysis_jobs_select_org
  on public.analysis_jobs for select to authenticated
  using (org_id = public.current_org_id());

create policy analysis_results_select_org
  on public.analysis_results for select to authenticated
  using (org_id = public.current_org_id());

create policy telemetry_events_select_org
  on public.telemetry_events for select to authenticated
  using (org_id = public.current_org_id());

-- Notifications: scoped to the user themselves.
create policy notifications_select_self
  on public.notifications for select to authenticated
  using (user_id = public.current_user_id());

-- Audit log: read-only via RLS; requires the org.audit.read permission in app
-- code (RLS only enforces tenant scope, not whether you should see audit at all).
create policy audit_events_select_org
  on public.audit_events for select to authenticated
  using (org_id = public.current_org_id());
