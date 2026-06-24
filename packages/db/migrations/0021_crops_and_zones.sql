-- Crop-type assignment + Zones for fields.
--
-- 1. Recreates list_org_fields to also carry the field's CURRENT crop (the latest
--    active crop_plantings row joined to crop_types), so the portal's /fields
--    cards + editor can show and seed it. Adding columns is backward-compatible:
--    existing callers select keys by name and ignore the rest.
-- 2. Adds list_org_zones, a GeoJSON projection for a field's sub-areas, mirroring
--    list_org_fields.
--
-- Filtering is on org_id (the caller's active organization). Auth + tenant
-- scoping happen in the API layer — these functions are read-only projection
-- helpers, not security boundaries.

------------------------------------------------------------------------
-- list_org_fields  (+ current crop)
------------------------------------------------------------------------

drop function if exists public.list_org_fields(uuid);

create or replace function public.list_org_fields(p_org_id uuid)
returns table (
  id               uuid,
  farm_id          uuid,
  name             text,
  description      text,
  area_acres       numeric,
  boundary         json,
  centroid         json,
  crop_type_id     uuid,
  crop_common_name text,
  crop_variety     text,
  crop_status      text,
  planted_at       timestamptz,
  created_at       timestamptz,
  updated_at       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id,
    f.farm_id,
    f.name,
    f.description,
    f.area_acres,
    case when f.boundary is null then null
         else st_asgeojson(f.boundary)::json end as boundary,
    case when f.centroid is null then null
         else st_asgeojson(f.centroid)::json end as centroid,
    crop.crop_type_id,
    ct.common_name as crop_common_name,
    crop.variety   as crop_variety,
    crop.status    as crop_status,
    crop.planted_at,
    f.created_at,
    f.updated_at
  from public.fields f
  left join lateral (
    -- The field's current planting: most recent still-in-ground row.
    select cp.crop_type_id, cp.variety, cp.status, cp.planted_at
    from public.crop_plantings cp
    where cp.field_id = f.id
      and cp.status in ('planted', 'growing')
    order by cp.planted_at desc
    limit 1
  ) crop on true
  left join public.crop_types ct on ct.id = crop.crop_type_id
  where f.org_id = p_org_id
  order by f.farm_id, f.name;
$$;

revoke all on function public.list_org_fields(uuid) from public;
grant execute on function public.list_org_fields(uuid) to authenticated, service_role;

comment on function public.list_org_fields(uuid) is
  'Returns fields for an org with PostGIS geometries serialized as GeoJSON, plus '
  'description, timestamps, and the field''s current crop. Used by services/api '
  'GET /v1/fields. Auth + org-membership checks happen in the API layer.';

------------------------------------------------------------------------
-- list_org_zones
------------------------------------------------------------------------

create or replace function public.list_org_zones(p_org_id uuid)
returns table (
  id          uuid,
  field_id    uuid,
  name        text,
  description text,
  boundary    json,
  created_at  timestamptz,
  updated_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    z.id,
    z.field_id,
    z.name,
    z.description,
    case when z.boundary is null then null
         else st_asgeojson(z.boundary)::json end as boundary,
    z.created_at,
    z.updated_at
  from public.zones z
  where z.org_id = p_org_id
  order by z.field_id, z.name;
$$;

revoke all on function public.list_org_zones(uuid) from public;
grant execute on function public.list_org_zones(uuid) to authenticated, service_role;

comment on function public.list_org_zones(uuid) is
  'Returns zones (field sub-areas) for an org with the PostGIS boundary serialized '
  'as GeoJSON. Used by services/api GET /v1/zones. Auth + org-membership checks '
  'happen in the API layer.';
