import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDb } from "../lib/db.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import {
  canSeeResource,
  partitionVisibleIds,
  resolveTeamScope
} from "../lib/team-scope.js";

const UUID_RE = /^[0-9a-f-]{36}$/i;

// GeoJSON point shape returned by st_asgeojson() in 0019_farms_geojson_rpc.sql.
// We don't fully validate it server-side — the function is the contract.
interface GeoJsonPoint {
  type: "Point";
  coordinates: [number, number];
}

// Row shape returned by the list_org_farms RPC (location serialized as GeoJSON,
// field_count + area_acres aggregated from the farm's fields).
interface FarmListRow {
  id: string;
  name: string;
  description: string | null;
  address_line1: string | null;
  address_line2: string | null;
  address_locality: string | null;
  address_region: string | null;
  address_postal_code: string | null;
  address_country: string | null;
  timezone: string | null;
  location: GeoJsonPoint | null;
  field_count: number;
  area_acres: number | null;
  created_at: string;
  updated_at: string;
}

// A lat/lng centroid for the farm. null clears it; an object (re)writes the
// PostGIS point. The five address fields + timezone are the rest of the farm's
// editable metadata.
const locationSchema = z
  .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
  .nullable();

const createFarmSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  addressLine1: z.string().max(200).nullable().optional(),
  addressLine2: z.string().max(200).nullable().optional(),
  addressLocality: z.string().max(120).nullable().optional(),
  addressRegion: z.string().max(120).nullable().optional(),
  addressPostalCode: z.string().max(40).nullable().optional(),
  addressCountry: z.string().max(120).nullable().optional(),
  timezone: z.string().max(80).nullable().optional(),
  location: locationSchema.optional()
});

const updateFarmSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    addressLine1: z.string().max(200).nullable().optional(),
    addressLine2: z.string().max(200).nullable().optional(),
    addressLocality: z.string().max(120).nullable().optional(),
    addressRegion: z.string().max(120).nullable().optional(),
    addressPostalCode: z.string().max(40).nullable().optional(),
    addressCountry: z.string().max(120).nullable().optional(),
    timezone: z.string().max(80).nullable().optional(),
    location: locationSchema.optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided."
  });

type FarmWrite = z.infer<typeof createFarmSchema>;

// EWKT for a lat/lng centroid, matching the form captures.ts uses for capture
// locations. null when the farm has no point set.
function locationToEwkt(location: FarmWrite["location"]): string | null {
  return location ? `SRID=4326;POINT(${location.lng} ${location.lat})` : null;
}

// Map the supplied (camelCase) write keys onto the snake_case farm columns,
// writing ONLY the keys the caller provided so a PATCH leaves the rest intact.
function buildFarmPatch(body: Partial<FarmWrite>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.addressLine1 !== undefined) patch.address_line1 = body.addressLine1;
  if (body.addressLine2 !== undefined) patch.address_line2 = body.addressLine2;
  if (body.addressLocality !== undefined) patch.address_locality = body.addressLocality;
  if (body.addressRegion !== undefined) patch.address_region = body.addressRegion;
  if (body.addressPostalCode !== undefined) patch.address_postal_code = body.addressPostalCode;
  if (body.addressCountry !== undefined) patch.address_country = body.addressCountry;
  if (body.timezone !== undefined) patch.timezone = body.timezone;
  if (body.location !== undefined) patch.location = locationToEwkt(body.location);
  return patch;
}

// One RPC row → the portal-facing summary. field_count/area_acres arrive as
// postgres numerics, which supabase-js may hand back as strings — coerce.
function toFarmSummary(row: FarmListRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    addressLocality: row.address_locality,
    addressRegion: row.address_region,
    addressPostalCode: row.address_postal_code,
    addressCountry: row.address_country,
    timezone: row.timezone,
    location: row.location,
    fieldCount: Number(row.field_count),
    areaAcres: row.area_acres === null ? null : Number(row.area_acres),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Re-read a single farm through the RPC so create/update/get-one all share one
// serialization path (location → GeoJSON, plus the field aggregates). Farm lists
// per org are small, so the full-list round-trip is cheap. Returns null if the
// farm isn't in the caller's org (the caller already org-checked on writes).
async function loadFarmSummary(
  supabase: ReturnType<typeof getDb>,
  orgId: string,
  farmId: string
) {
  const { data, error } = await supabase.rpc("list_org_farms", { p_org_id: orgId });
  if (error) throw error;
  const row = ((data ?? []) as FarmListRow[]).find((r) => r.id === farmId);
  return row ? toFarmSummary(row) : null;
}

const farmsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/farms — the org's farms for the portal /farms grid. canManage lets
  // the page render the New farm / edit / delete controls (the permission set was
  // already loaded for the farms.read check above).
  app.get<{ Querystring: { teamId?: string } }>(
    "/v1/farms",
    { preHandler: app.requireAuth("farms.read") },
    async (request, _reply) => {
      const caller = request.auth!;
      const supabase = getDb();

      const { data, error } = await supabase.rpc("list_org_farms", { p_org_id: caller.orgId });
      if (error) throw error;

      const canManage = await request.permissions!.hasPermission(
        { userId: caller.userId, orgId: caller.orgId },
        "farms.update"
      );

      let rows = (data ?? []) as FarmListRow[];

      // Team access boundary (+ optional ?teamId= narrow). Post-filter the RPC
      // rows in JS — farm lists per org are small. No-op for admins.
      const scope = await resolveTeamScope(supabase, request.permissions!, {
        userId: caller.userId,
        orgId: caller.orgId
      });
      const teamId = request.query.teamId;
      if (!scope.bypass || teamId) {
        const visible = await partitionVisibleIds(
          supabase,
          caller.orgId,
          "farm",
          scope,
          rows.map((r) => r.id),
          teamId
        );
        rows = rows.filter((r) => visible.has(r.id));
      }

      return { orgId: caller.orgId, canManage, farms: rows.map(toFarmSummary) };
    }
  );

  // POST /v1/farms — create a farm in the caller's org.
  app.post("/v1/farms", { preHandler: app.requireAuth("farms.create") }, async (request, reply) => {
    const caller = request.auth!;
    const parsed = createFarmSchema.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest("farms.invalid_input", "Invalid farm body.", {
        issues: parsed.error.issues
      });
    }
    const body = parsed.data;
    const supabase = getDb();

    const { data: inserted, error: insertErr } = await supabase
      .from("farms")
      .insert({
        org_id: caller.orgId,
        name: body.name,
        description: body.description ?? null,
        address_line1: body.addressLine1 ?? null,
        address_line2: body.addressLine2 ?? null,
        address_locality: body.addressLocality ?? null,
        address_region: body.addressRegion ?? null,
        address_postal_code: body.addressPostalCode ?? null,
        address_country: body.addressCountry ?? null,
        timezone: body.timezone ?? null,
        location: locationToEwkt(body.location)
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;

    const farm = await loadFarmSummary(supabase, caller.orgId, (inserted as { id: string }).id);
    reply.status(201);
    return farm;
  });

  // GET /v1/farms/:id — single farm. Org-scoped; 404 across tenants. Supports a
  // future /farms/[id] detail page; the list already carries enough for the grid.
  app.get<{ Params: { id: string } }>(
    "/v1/farms/:id",
    { preHandler: app.requireAuth("farms.read") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) throw badRequest("farms.invalid_id", "Invalid farm id.");
      const caller = request.auth!;
      const supabase = getDb();

      const farm = await loadFarmSummary(supabase, caller.orgId, id);
      if (!farm) throw notFound("farms.not_found", "Farm not found.");

      // Team access boundary: a farm on a team the caller isn't on is 404.
      const scope = await resolveTeamScope(supabase, request.permissions!, {
        userId: caller.userId,
        orgId: caller.orgId
      });
      if (!(await canSeeResource(supabase, caller.orgId, "farm", id, scope))) {
        throw notFound("farms.not_found", "Farm not found.");
      }
      return farm;
    }
  );

  // PATCH /v1/farms/:id — edit any subset of a farm's fields. location:null clears
  // the centroid; {lat,lng} rewrites it. Org-scoped load + 404 before writing.
  app.patch<{ Params: { id: string } }>(
    "/v1/farms/:id",
    { preHandler: app.requireAuth("farms.update") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) throw badRequest("farms.invalid_id", "Invalid farm id.");
      const parsed = updateFarmSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("farms.invalid_input", "Invalid farm update.", {
          issues: parsed.error.issues
        });
      }
      const caller = request.auth!;
      const supabase = getDb();

      const { data: existing, error: loadErr } = await supabase
        .from("farms")
        .select("id, org_id")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!existing || (existing as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("farms.not_found", "Farm not found.");
      }

      const { error: updErr } = await supabase
        .from("farms")
        .update(buildFarmPatch(parsed.data))
        .eq("id", id)
        .eq("org_id", caller.orgId);
      if (updErr) throw updErr;

      const farm = await loadFarmSummary(supabase, caller.orgId, id);
      if (!farm) throw notFound("farms.not_found", "Farm not found.");
      return farm;
    }
  );

  // DELETE /v1/farms/:id — permanent delete. The FK cascades to fields/zones, so
  // we refuse to delete a farm that still has fields (409); the operator must
  // clear them first. Org-scoped load + 404.
  app.delete<{ Params: { id: string } }>(
    "/v1/farms/:id",
    { preHandler: app.requireAuth("farms.delete") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) throw badRequest("farms.invalid_id", "Invalid farm id.");
      const caller = request.auth!;
      const supabase = getDb();

      const { data: existing, error: loadErr } = await supabase
        .from("farms")
        .select("id, org_id")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!existing || (existing as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("farms.not_found", "Farm not found.");
      }

      const { count, error: countErr } = await supabase
        .from("fields")
        .select("id", { count: "exact", head: true })
        .eq("farm_id", id)
        .eq("org_id", caller.orgId);
      if (countErr) throw countErr;
      if ((count ?? 0) > 0) {
        throw conflict("farms.has_fields", "Remove this farm's fields before deleting it.", {
          fieldCount: count ?? 0
        });
      }

      const { error: delErr } = await supabase
        .from("farms")
        .delete()
        .eq("id", id)
        .eq("org_id", caller.orgId);
      if (delErr) throw delErr;

      return { farmId: id, deleted: true };
    }
  );
};

export default farmsRoutes;
