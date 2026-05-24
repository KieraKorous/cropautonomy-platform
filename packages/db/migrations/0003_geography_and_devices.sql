-- Land model and devices.
--
-- Establishes the spatial entities (farms / fields / zones), crop reference data
-- and planting records, and the device registry. Captures depend on all of these.
--
-- Geography vs geometry: we use geography(point, 4326) and geography(polygon, 4326)
-- throughout so distance / containment math is correct on the sphere without the
-- application having to choose a projection. Storage cost is a touch higher than
-- geometry; the correctness win is worth it for ag use cases that frequently span
-- hundreds of kilometers between farm holdings.

------------------------------------------------------------------------
-- farms
------------------------------------------------------------------------

create table public.farms (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  name                        text not null,
  description                 text,
  location                    geography(point, 4326),     -- representative centroid / homestead
  address_line1               text,
  address_line2               text,
  address_locality            text,
  address_region              text,
  address_postal_code         text,
  address_country             text,
  timezone                    text,                       -- IANA, e.g. 'America/Chicago'
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index farms_org_id_idx on public.farms (org_id);
-- Spatial index for "farms near point" lookups (Live page map, mobile field locator).
create index farms_location_gix on public.farms using gist (location);

create trigger farms_set_updated_at
  before update on public.farms
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------
-- fields
--
-- A field belongs to one farm. boundary is the polygonal extent; area_acres is
-- denormalized for convenience (computed by app code or trigger from boundary).
------------------------------------------------------------------------

create table public.fields (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  farm_id                     uuid not null references public.farms(id) on delete cascade,
  name                        text not null,
  description                 text,
  boundary                    geography(polygon, 4326),
  centroid                    geography(point, 4326),     -- derived; cached for fast list views
  area_acres                  numeric(10, 3),
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index fields_farm_id_idx on public.fields (farm_id);
create index fields_org_id_idx on public.fields (org_id);
create index fields_boundary_gix on public.fields using gist (boundary);
create index fields_centroid_gix on public.fields using gist (centroid);

create trigger fields_set_updated_at
  before update on public.fields
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------
-- zones  (sub-areas within a field; e.g. low-yield block, irrigation zone)
------------------------------------------------------------------------

create table public.zones (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  field_id                    uuid not null references public.fields(id) on delete cascade,
  name                        text not null,
  description                 text,
  boundary                    geography(polygon, 4326),
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index zones_field_id_idx on public.zones (field_id);
create index zones_org_id_idx on public.zones (org_id);
create index zones_boundary_gix on public.zones using gist (boundary);

create trigger zones_set_updated_at
  before update on public.zones
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------
-- crop_types
--
-- Platform-wide reference data with optional org_id for custom varieties.
-- org_id null means "available to every org"; org_id set means "private to that org".
-- The unique index is partial so (null, 'corn') and ('<orgX>', 'corn') don't clash.
------------------------------------------------------------------------

create table public.crop_types (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid references public.organizations(id) on delete cascade,
  key                         text not null,             -- machine identifier, e.g. 'field_corn'
  common_name                 text not null,             -- 'Field Corn'
  scientific_name             text,
  category                    text,                      -- 'grain', 'oilseed', 'vegetable', etc.
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create unique index crop_types_platform_key_uidx
  on public.crop_types (key) where org_id is null;
create unique index crop_types_org_key_uidx
  on public.crop_types (org_id, key) where org_id is not null;

create trigger crop_types_set_updated_at
  before update on public.crop_types
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------
-- crop_plantings
--
-- "What is growing in this field right now?" The active-window partial index
-- makes the dashboard query (open plantings per field/org) cheap.
------------------------------------------------------------------------

create table public.crop_plantings (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  field_id                    uuid not null references public.fields(id) on delete cascade,
  zone_id                     uuid references public.zones(id) on delete set null,
  crop_type_id                uuid not null references public.crop_types(id) on delete restrict,
  variety                     text,
  planted_at                  timestamptz not null,
  expected_harvest_at         timestamptz,
  harvested_at                timestamptz,
  status                      text not null default 'planned' check (status in (
                                'planned',
                                'planted',
                                'growing',
                                'harvested',
                                'failed',
                                'cancelled'
                              )),
  area_acres                  numeric(10, 3),
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index crop_plantings_field_active_idx
  on public.crop_plantings (field_id)
  where status in ('planted', 'growing');

create index crop_plantings_org_active_idx
  on public.crop_plantings (org_id, planted_at desc)
  where status in ('planted', 'growing');

create index crop_plantings_field_planted_at_idx
  on public.crop_plantings (field_id, planted_at desc);

create trigger crop_plantings_set_updated_at
  before update on public.crop_plantings
  for each row execute function public.set_updated_at();

------------------------------------------------------------------------
-- devices
--
-- Pre-seeded device families anticipate the GAIA fleet. field_capture_pwa is
-- intentionally absent: the field PWA is the operator's phone, identified by the
-- captured_by_user_id on each capture, not as a registered device.
------------------------------------------------------------------------

create table public.devices (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  device_family               text not null check (device_family in (
                                'gaia_r',          -- rover
                                'gaia_d',          -- drone
                                'gaia_s',          -- sensor station
                                'third_party',     -- bring-your-own integration
                                'simulator'        -- dev / test fixture
                              )),
  serial_number               text not null,
  display_name                text,
  firmware_version            text,
  status                      text not null default 'unregistered' check (status in (
                                'unregistered',
                                'active',
                                'inactive',
                                'maintenance',
                                'retired'
                              )),
  registered_at               timestamptz,
  registered_by_user_id       uuid references public.users(id) on delete set null,
  last_seen_at                timestamptz,
  last_known_location         geography(point, 4326),
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- Serial uniqueness is per-org (the same physical hardware could be re-deployed).
create unique index devices_org_serial_uidx
  on public.devices (org_id, device_family, serial_number);

create index devices_org_active_idx
  on public.devices (org_id)
  where status in ('active', 'maintenance');

create index devices_last_seen_idx
  on public.devices (last_seen_at desc)
  where status = 'active';

create index devices_last_known_location_gix
  on public.devices using gist (last_known_location);

create trigger devices_set_updated_at
  before update on public.devices
  for each row execute function public.set_updated_at();
