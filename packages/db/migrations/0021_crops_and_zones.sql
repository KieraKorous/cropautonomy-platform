-- Free-text crop on fields + Zones.
--
-- 1. Adds a free-text `crop` column to fields (the operator just types what's
--    growing — e.g. "Corn") and recreates list_org_fields to return it. Adding a
--    column to the function's OUT type requires drop+recreate; backward-compatible
--    since existing callers select keys by name.
-- 2. Adds list_org_zones, a GeoJSON projection for a field's sub-areas.
--
-- Re-runnable: the column add is `if not exists`, the functions are dropped /
-- replaced. Filtering is on org_id — auth + tenant scoping happen in the API
-- layer; these functions are read-only projection helpers, not security
-- boundaries.

------------------------------------------------------------------------
-- fields.crop  (+ list_org_fields)
------------------------------------------------------------------------

alter table public.fields add column if not exists crop text;

drop function if exists public.list_org_fields(uuid);

create or replace function public.list_org_fields(p_org_id uuid)
returns table (
  id          uuid,
  farm_id     uuid,
  name        text,
  description text,
  area_acres  numeric,
  boundary    json,
  centroid    json,
  crop        text,
  created_at  timestamptz,
  updated_at  timestamptz
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
    f.crop,
    f.created_at,
    f.updated_at
  from public.fields f
  where f.org_id = p_org_id
  order by f.farm_id, f.name;
$$;

revoke all on function public.list_org_fields(uuid) from public;
grant execute on function public.list_org_fields(uuid) to authenticated, service_role;

comment on function public.list_org_fields(uuid) is
  'Returns fields for an org with PostGIS geometries serialized as GeoJSON, plus '
  'description, the free-text crop, and timestamps. Used by services/api '
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
