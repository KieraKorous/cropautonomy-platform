-- RPC for returning fields with PostGIS geometries serialized as GeoJSON.
-- Used by services/api GET /v1/fields, which the Field Capture PWA's map view
-- consumes to render field outlines + centroids.
--
-- Filtering is on org_id (the caller's active organization). Auth + tenant
-- scoping happen in the API layer before calling this — the function is a
-- read-only projection helper, not a security boundary.

create or replace function public.list_org_fields(p_org_id uuid)
returns table (
  id          uuid,
  farm_id     uuid,
  name        text,
  area_acres  numeric,
  boundary    json,
  centroid    json
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
    f.area_acres,
    case when f.boundary is null then null
         else st_asgeojson(f.boundary)::json end as boundary,
    case when f.centroid is null then null
         else st_asgeojson(f.centroid)::json end as centroid
  from public.fields f
  where f.org_id = p_org_id
  order by f.farm_id, f.name;
$$;

revoke all on function public.list_org_fields(uuid) from public;
grant execute on function public.list_org_fields(uuid) to authenticated, service_role;

comment on function public.list_org_fields(uuid) is
  'Returns fields for an org with PostGIS geometries serialized as GeoJSON. '
  'Used by services/api GET /v1/fields. Auth + org-membership checks happen in the API layer.';
