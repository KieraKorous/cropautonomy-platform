-- RPC for returning farms with the PostGIS location point serialized as GeoJSON,
-- plus a per-farm field count and total acreage for the portal's /farms list
-- cards. Used by services/api GET /v1/farms.
--
-- Filtering is on org_id (the caller's active organization). Auth + tenant
-- scoping happen in the API layer before calling this — the function is a
-- read-only projection helper, not a security boundary. Mirrors list_org_fields
-- (0007_fields_geojson_rpc.sql).

create or replace function public.list_org_farms(p_org_id uuid)
returns table (
  id                  uuid,
  name                text,
  description         text,
  address_line1       text,
  address_line2       text,
  address_locality    text,
  address_region      text,
  address_postal_code text,
  address_country     text,
  timezone            text,
  location            json,
  field_count         bigint,
  area_acres          numeric,
  created_at          timestamptz,
  updated_at          timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id,
    f.name,
    f.description,
    f.address_line1,
    f.address_line2,
    f.address_locality,
    f.address_region,
    f.address_postal_code,
    f.address_country,
    f.timezone,
    case when f.location is null then null
         else st_asgeojson(f.location)::json end as location,
    count(fl.id)                     as field_count,
    coalesce(sum(fl.area_acres), 0)  as area_acres,
    f.created_at,
    f.updated_at
  from public.farms f
  left join public.fields fl on fl.farm_id = f.id
  where f.org_id = p_org_id
  group by f.id
  order by f.name;
$$;

revoke all on function public.list_org_farms(uuid) from public;
grant execute on function public.list_org_farms(uuid) to authenticated, service_role;

comment on function public.list_org_farms(uuid) is
  'Returns farms for an org with the PostGIS location serialized as GeoJSON, plus '
  'per-farm field count and total acreage. Used by services/api GET /v1/farms. '
  'Auth + org-membership checks happen in the API layer.';
