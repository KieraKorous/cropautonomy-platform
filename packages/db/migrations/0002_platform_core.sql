-- Platform core: extensions, identity, tenancy, roles and permissions.
--
-- This migration introduces the foundational tables that every other tenant-scoped
-- entity in the schema depends on. It is intentionally self-contained so it can be
-- applied to an empty database (post-0001) in a single step.
--
-- See docs/architecture/authentication-and-tenancy.md and
-- docs/architecture/database-schema.md.

------------------------------------------------------------------------
-- Extensions
------------------------------------------------------------------------

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";     -- case-insensitive email handling
create extension if not exists "postgis";    -- geography(point, polygon)

------------------------------------------------------------------------
-- users  (thin mirror of Clerk identity)
--
-- Populated by the Clerk webhook. All other tables reference users.id (uuid),
-- never clerk_user_id (text). active_organization_id mirrors what app code
-- has placed in Clerk publicMetadata so the JWT template can render it into
-- the `org_id` session claim.
------------------------------------------------------------------------

create table public.users (
  id                          uuid primary key default gen_random_uuid(),
  clerk_user_id               text not null unique,
  email                       citext not null unique,
  display_name                text,
  avatar_url                  text,
  active_organization_id      uuid,   -- FK added after organizations exists
  last_seen_at                timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index users_email_idx on public.users (email);

------------------------------------------------------------------------
-- organizations
------------------------------------------------------------------------

create table public.organizations (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null,
  slug                        text not null unique,
  status                      text not null default 'active' check (status in (
                                'active',
                                'suspended',
                                'archived'
                              )),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index organizations_status_idx
  on public.organizations (status)
  where status in ('active', 'suspended');

-- Backfill the FK on users.active_organization_id now that organizations exists.
alter table public.users
  add constraint users_active_organization_id_fkey
  foreign key (active_organization_id)
  references public.organizations(id)
  on delete set null;

------------------------------------------------------------------------
-- roles  (relational, NOT an enum -- see authentication-and-tenancy.md
--         § Roles and Permissions Schema)
--
-- org_id is nullable: system roles (is_system = true) are platform-wide;
-- org-specific custom roles (future phase) carry an org_id.
------------------------------------------------------------------------

create table public.roles (
  id                          uuid primary key default gen_random_uuid(),
  key                         text not null,
  name                        text not null,
  description                 text,
  is_system                   boolean not null default false,
  org_id                      uuid references public.organizations(id) on delete cascade,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint roles_system_no_org_check check (
    (is_system = true and org_id is null)
    or (is_system = false and org_id is not null)
  )
);

-- A role key is unique within its scope: globally for system roles, per-org
-- for custom roles. Two partial unique indexes cover both halves.
create unique index roles_system_key_uidx
  on public.roles (key) where is_system = true;
create unique index roles_org_key_uidx
  on public.roles (org_id, key) where is_system = false;

------------------------------------------------------------------------
-- permissions
--
-- key follows resource.action[.qualifier] (e.g. captures.create,
-- org.billing.manage). resource_group is a coarse grouping for admin UIs.
------------------------------------------------------------------------

create table public.permissions (
  id                          uuid primary key default gen_random_uuid(),
  key                         text not null unique,
  resource_group              text not null,
  description                 text,
  created_at                  timestamptz not null default now()
);

create index permissions_resource_group_idx on public.permissions (resource_group);

------------------------------------------------------------------------
-- role_permissions  (junction)
------------------------------------------------------------------------

create table public.role_permissions (
  role_id                     uuid not null references public.roles(id) on delete cascade,
  permission_id               uuid not null references public.permissions(id) on delete cascade,
  granted_at                  timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create index role_permissions_permission_id_idx
  on public.role_permissions (permission_id);

------------------------------------------------------------------------
-- organization_memberships
--
-- role_id references roles.id (FK, NOT an enum).
-- A user can only have one ACTIVE membership per org; suspended/removed
-- rows may coexist historically (status holds the lifecycle).
------------------------------------------------------------------------

create table public.organization_memberships (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  user_id                     uuid not null references public.users(id) on delete cascade,
  role_id                     uuid not null references public.roles(id) on delete restrict,
  status                      text not null default 'active' check (status in (
                                'active',
                                'invited',
                                'suspended',
                                'removed'
                              )),
  invited_by_user_id          uuid references public.users(id) on delete set null,
  invited_at                  timestamptz,
  joined_at                   timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create unique index organization_memberships_active_uidx
  on public.organization_memberships (org_id, user_id)
  where status in ('active', 'invited', 'suspended');

create index organization_memberships_user_active_idx
  on public.organization_memberships (user_id)
  where status = 'active';

create index organization_memberships_org_active_idx
  on public.organization_memberships (org_id)
  where status = 'active';

------------------------------------------------------------------------
-- organization_invitations
------------------------------------------------------------------------

create table public.organization_invitations (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  email                       citext not null,
  role_id                     uuid not null references public.roles(id) on delete restrict,
  token                       text not null unique,
  invited_by_user_id          uuid references public.users(id) on delete set null,
  status                      text not null default 'pending' check (status in (
                                'pending',
                                'accepted',
                                'revoked',
                                'expired'
                              )),
  expires_at                  timestamptz not null,
  accepted_at                 timestamptz,
  accepted_by_user_id         uuid references public.users(id) on delete set null,
  created_at                  timestamptz not null default now()
);

create index organization_invitations_pending_idx
  on public.organization_invitations (org_id, email)
  where status = 'pending';

------------------------------------------------------------------------
-- updated_at trigger
------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create trigger roles_set_updated_at
  before update on public.roles
  for each row execute function public.set_updated_at();

create trigger organization_memberships_set_updated_at
  before update on public.organization_memberships
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------
-- Seed: system roles
------------------------------------------------------------------------

insert into public.roles (key, name, description, is_system) values
  ('owner',      'Owner',      'Full control over the organization, including billing and deletion.', true),
  ('admin',      'Admin',      'Manage members, farms, fields, devices, captures and analysis. Cannot manage billing or delete the org.', true),
  ('manager',    'Manager',    'Plan and edit farms, fields, crop plantings, captures, and analysis. No member or device administration.', true),
  ('technician', 'Technician', 'Field operator: create captures, run sessions, request analysis, view operational data.', true),
  ('viewer',     'Viewer',     'Read-only access to operational data. Cannot mutate, invite, or administer.', true);

------------------------------------------------------------------------
-- Seed: permissions
--
-- Keys follow resource.action (or resource.action.qualifier).
-- resource_group is the coarse domain shown in admin UIs.
------------------------------------------------------------------------

insert into public.permissions (key, resource_group, description) values
  -- organization
  ('org.read',                 'organization', 'View organization details.'),
  ('org.update',               'organization', 'Edit organization name, slug, and profile.'),
  ('org.delete',               'organization', 'Delete the organization.'),
  ('org.billing.manage',       'organization', 'Manage billing, subscriptions, and invoices.'),
  ('org.audit.read',           'organization', 'Read the organization audit log.'),

  -- membership & roles
  ('members.read',             'membership',   'List organization members and their roles.'),
  ('members.invite',           'membership',   'Invite users to the organization.'),
  ('members.update',           'membership',   'Change a member''s role or status.'),
  ('members.remove',           'membership',   'Remove a member from the organization.'),
  ('roles.read',               'membership',   'View roles and their permissions.'),
  ('roles.manage',             'membership',   'Create, update, and delete custom roles.'),

  -- farms / fields / zones
  ('farms.read',               'land',         'View farms.'),
  ('farms.create',             'land',         'Create farms.'),
  ('farms.update',             'land',         'Edit farm details.'),
  ('farms.delete',             'land',         'Delete farms.'),
  ('fields.read',              'land',         'View fields.'),
  ('fields.create',            'land',         'Create fields.'),
  ('fields.update',            'land',         'Edit field boundaries and metadata.'),
  ('fields.delete',            'land',         'Delete fields.'),
  ('zones.read',               'land',         'View zones within fields.'),
  ('zones.create',             'land',         'Create zones within fields.'),
  ('zones.update',             'land',         'Edit zones.'),
  ('zones.delete',             'land',         'Delete zones.'),

  -- crops
  ('crop_types.read',          'crops',        'View crop types (platform + org-custom).'),
  ('crop_types.create',        'crops',        'Add org-specific crop types.'),
  ('crop_types.update',        'crops',        'Edit org-specific crop types.'),
  ('crop_types.delete',        'crops',        'Delete org-specific crop types.'),
  ('crop_plantings.read',      'crops',        'View planting records.'),
  ('crop_plantings.create',    'crops',        'Record new plantings.'),
  ('crop_plantings.update',    'crops',        'Update planting status (e.g. mark harvested).'),
  ('crop_plantings.delete',    'crops',        'Delete planting records.'),

  -- devices
  ('devices.read',             'devices',      'View registered devices and their status.'),
  ('devices.register',         'devices',      'Register new devices with the organization.'),
  ('devices.update',           'devices',      'Edit device metadata.'),
  ('devices.deregister',       'devices',      'Deregister a device.'),

  -- captures
  ('captures.read',            'captures',     'View capture records and their media.'),
  ('captures.create',          'captures',     'Reserve and upload captures.'),
  ('captures.update',          'captures',     'Edit capture metadata.'),
  ('captures.delete',          'captures',     'Delete captures.'),

  -- capture sessions
  ('capture_sessions.read',    'captures',     'View capture sessions.'),
  ('capture_sessions.create',  'captures',     'Start a capture session.'),
  ('capture_sessions.update',  'captures',     'Pause/resume/edit a capture session.'),
  ('capture_sessions.end',     'captures',     'End a capture session.'),

  -- analysis
  ('analysis.read',            'analysis',     'View analysis jobs and results.'),
  ('analysis.request',         'analysis',     'Enqueue an analysis job.'),
  ('analysis.delete',          'analysis',     'Delete analysis results.'),

  -- telemetry
  ('telemetry.read',           'telemetry',    'View device telemetry events.'),
  ('telemetry.ingest',         'telemetry',    'Ingest telemetry events on behalf of devices.'),

  -- notifications
  ('notifications.read',       'notifications','Read own notifications.'),
  ('notifications.manage',     'notifications','Manage notification preferences and dismiss org-wide.');

------------------------------------------------------------------------
-- Seed: role_permissions
------------------------------------------------------------------------

-- owner: every seeded permission
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.key = 'owner' and r.is_system = true;

-- admin: everything except org.delete and org.billing.manage
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.key = 'admin' and r.is_system = true
    and p.key not in ('org.delete', 'org.billing.manage');

-- manager: read/write on operational data, no member or role administration
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.key = 'manager' and r.is_system = true
    and p.key in (
      'org.read',
      'members.read',
      'roles.read',
      'farms.read', 'farms.create', 'farms.update',
      'fields.read', 'fields.create', 'fields.update',
      'zones.read', 'zones.create', 'zones.update',
      'crop_types.read', 'crop_types.create', 'crop_types.update',
      'crop_plantings.read', 'crop_plantings.create', 'crop_plantings.update', 'crop_plantings.delete',
      'devices.read',
      'captures.read', 'captures.update', 'captures.delete',
      'capture_sessions.read', 'capture_sessions.update', 'capture_sessions.end',
      'analysis.read', 'analysis.request', 'analysis.delete',
      'telemetry.read',
      'notifications.read', 'notifications.manage'
    );

-- technician: field operator
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.key = 'technician' and r.is_system = true
    and p.key in (
      'org.read',
      'members.read',
      'farms.read',
      'fields.read',
      'zones.read',
      'crop_types.read',
      'crop_plantings.read',
      'devices.read',
      'captures.read', 'captures.create', 'captures.update',
      'capture_sessions.read', 'capture_sessions.create', 'capture_sessions.update', 'capture_sessions.end',
      'analysis.read', 'analysis.request',
      'telemetry.read',
      'notifications.read'
    );

-- viewer: read-only
insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.key = 'viewer' and r.is_system = true
    and p.key in (
      'org.read',
      'members.read',
      'farms.read',
      'fields.read',
      'zones.read',
      'crop_types.read',
      'crop_plantings.read',
      'devices.read',
      'captures.read',
      'capture_sessions.read',
      'analysis.read',
      'telemetry.read',
      'notifications.read'
    );
