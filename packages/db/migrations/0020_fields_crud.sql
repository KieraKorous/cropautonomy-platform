-- Extends list_org_fields to carry the columns the portal's /fields management
-- page needs to seed its edit form (description + timestamps), on top of the
-- name/area/boundary/centroid the map views already consume.
--
-- create-or-replace can't change a function's OUT columns, so the function is
-- dropped and recreated. Adding columns is backward-compatible: existing callers
-- (field-web PWA map, portal overview, services/api GET /v1/fields) select keys
-- by name and ignore the rest. Mirrors list_org_farms (0019_farms_geojson_rpc.sql).
--
-- Filtering is on org_id (the caller's active organization). Auth + tenant
-- scoping happen in the API layer before calling this — the function is a
-- read-only projection helper, not a security boundary.

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
  'description + timestamps for the portal /fields editor. Used by services/api '
  'GET /v1/fields. Auth + org-membership checks happen in the API layer.';
