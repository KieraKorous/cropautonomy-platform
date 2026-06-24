import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDb } from "../lib/db.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";

const UUID_RE = /^[0-9a-f-]{36}$/i;

// GeoJSON shapes returned by st_asgeojson() in 0007/0020. We don't fully
// validate them server-side — the function is the contract.
interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: number[][][];
}
interface GeoJsonPoint {
  type: "Point";
  coordinates: [number, number];
}

// Row shape returned by the list_org_fields RPC (geometries serialized as
// GeoJSON, plus description + timestamps added in 0020_fields_crud.sql).
interface FieldListRow {
  id: string;
  farm_id: string;
  name: string;
  description: string | null;
  area_acres: number | null;
  boundary: GeoJsonPolygon | null;
  centroid: GeoJsonPoint | null;
  crop_type_id: string | null;
  crop_common_name: string | null;
  crop_variety: string | null;
  crop_status: string | null;
  planted_at: string | null;
  created_at: string;
  updated_at: string;
}

// A lat/lng centroid for the field — the center of its boundary box. null clears
// it; an object (re)writes the PostGIS point.
const centroidSchema = z
  .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
  .nullable();

// The field's boundary, an axis-aligned rectangle the operator draws/resizes in
// the portal. A GeoJSON Polygon; the client derives it from length × width +
// center. null clears it. Validated loosely — the editor is the contract.
const boundarySchema = z
  .object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()])).min(4)).min(1)
  })
  .nullable();

// area_acres is numeric(10,3) in the DB; cap well under its 9,999,999.999 max.
const acresSchema = z.number().min(0).max(10_000_000).nullable();

// The field's current crop. An object upserts the field's single active planting;
// null clears it. Mirrors the crop_plantings status check constraint.
const cropStatusEnum = z.enum([
  "planned",
  "planted",
  "growing",
  "harvested",
  "failed",
  "cancelled"
]);
const cropSchema = z
  .object({
    cropTypeId: z.string().uuid(),
    variety: z.string().max(200).nullable().optional(),
    plantedAt: z.string().datetime().nullable().optional(),
    status: cropStatusEnum.optional()
  })
  .nullable();

const createFieldSchema = z.object({
  name: z.string().min(1).max(200),
  farmId: z.string().uuid(),
  description: z.string().max(2000).nullable().optional(),
  areaAcres: acresSchema.optional(),
  centroid: centroidSchema.optional(),
  boundary: boundarySchema.optional(),
  crop: cropSchema.optional()
});

const updateFieldSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    farmId: z.string().uuid().optional(),
    description: z.string().max(2000).nullable().optional(),
    areaAcres: acresSchema.optional(),
    centroid: centroidSchema.optional(),
    boundary: boundarySchema.optional(),
    crop: cropSchema.optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided."
  });

type FieldWrite = z.infer<typeof createFieldSchema>;

// EWKT for a lat/lng centroid, matching the form captures.ts/farms.ts use.
// null when the field has no point set.
function centroidToEwkt(centroid: FieldWrite["centroid"]): string | null {
  return centroid ? `SRID=4326;POINT(${centroid.lng} ${centroid.lat})` : null;
}

// EWKT for the boundary polygon's exterior ring. Defensively closes the ring
// (PostGIS rejects an open ring). null when the field has no boundary.
function boundaryToEwkt(boundary: FieldWrite["boundary"]): string | null {
  if (!boundary) return null;
  const ring = [...boundary.coordinates[0]];
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx !== lx || fy !== ly) ring.push(ring[0]);
  const pts = ring.map(([lng, lat]) => `${lng} ${lat}`).join(", ");
  return `SRID=4326;POLYGON((${pts}))`;
}

// Map the supplied (camelCase) write keys onto the snake_case field columns,
// writing ONLY the keys the caller provided so a PATCH leaves the rest intact.
function buildFieldPatch(body: Partial<FieldWrite>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.farmId !== undefined) patch.farm_id = body.farmId;
  if (body.description !== undefined) patch.description = body.description;
  if (body.areaAcres !== undefined) patch.area_acres = body.areaAcres;
  if (body.centroid !== undefined) patch.centroid = centroidToEwkt(body.centroid);
  if (body.boundary !== undefined) patch.boundary = boundaryToEwkt(body.boundary);
  return patch;
}

// One RPC row → the portal-facing summary. area_acres arrives as a postgres
// numeric, which supabase-js may hand back as a string — coerce.
function toFieldSummary(row: FieldListRow) {
  return {
    id: row.id,
    farmId: row.farm_id,
    name: row.name,
    description: row.description,
    areaAcres: row.area_acres === null ? null : Number(row.area_acres),
    boundary: row.boundary,
    centroid: row.centroid,
    cropTypeId: row.crop_type_id,
    cropCommonName: row.crop_common_name,
    cropVariety: row.crop_variety,
    cropStatus: row.crop_status,
    plantedAt: row.planted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Re-read a single field through the RPC so create/update/get-one all share one
// serialization path (geometries → GeoJSON). Org fields are small, so the
// full-list round-trip is cheap. Returns null if the field isn't in the
// caller's org (the caller already org-checked on writes).
async function loadFieldSummary(
  supabase: ReturnType<typeof getDb>,
  orgId: string,
  fieldId: string
) {
  const { data, error } = await supabase.rpc("list_org_fields", { p_org_id: orgId });
  if (error) throw error;
  const row = ((data ?? []) as FieldListRow[]).find((r) => r.id === fieldId);
  return row ? toFieldSummary(row) : null;
}

// Verify the referenced farm exists in the caller's org before a field write.
// Throws badRequest on a missing / cross-tenant farm (never leaks existence).
async function assertFarmInOrg(
  supabase: ReturnType<typeof getDb>,
  orgId: string,
  farmId: string
) {
  const { data, error } = await supabase
    .from("farms")
    .select("id, org_id")
    .eq("id", farmId)
    .maybeSingle();
  if (error) throw error;
  if (!data || (data as { org_id: string }).org_id !== orgId) {
    throw badRequest("fields.invalid_farm", "Farm not found in this organization.");
  }
}

// Verify the crop type is visible to the org (platform-wide org_id null, or the
// caller's own custom type). Throws badRequest otherwise.
async function assertCropTypeInOrg(
  supabase: ReturnType<typeof getDb>,
  orgId: string,
  cropTypeId: string
) {
  const { data, error } = await supabase
    .from("crop_types")
    .select("id, org_id")
    .eq("id", cropTypeId)
    .maybeSingle();
  if (error) throw error;
  const ownerOrg = (data as { org_id: string | null } | null)?.org_id;
  if (!data || (ownerOrg !== null && ownerOrg !== orgId)) {
    throw badRequest("fields.invalid_crop_type", "Crop type not available to this organization.");
  }
}

type FieldCrop = z.infer<typeof cropSchema>;

// Upsert the field's single CURRENT crop (active crop_plantings row). `undefined`
// leaves plantings untouched (the caller didn't address crop); an object updates
// the active planting or inserts one; null clears the active planting(s). MVP:
// one current crop per field — full planting history is a later slice.
async function applyFieldCrop(
  supabase: ReturnType<typeof getDb>,
  orgId: string,
  fieldId: string,
  crop: FieldCrop | undefined
) {
  if (crop === undefined) return;

  const { data: existing, error: findErr } = await supabase
    .from("crop_plantings")
    .select("id")
    .eq("field_id", fieldId)
    .eq("org_id", orgId)
    .in("status", ["planted", "growing"])
    .order("planted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (findErr) throw findErr;
  const existingId = (existing as { id: string } | null)?.id ?? null;

  if (crop === null) {
    if (existingId) {
      const { error: delErr } = await supabase
        .from("crop_plantings")
        .delete()
        .eq("field_id", fieldId)
        .eq("org_id", orgId)
        .in("status", ["planted", "growing"]);
      if (delErr) throw delErr;
    }
    return;
  }

  await assertCropTypeInOrg(supabase, orgId, crop.cropTypeId);
  const fields = {
    crop_type_id: crop.cropTypeId,
    variety: crop.variety ?? null,
    status: crop.status ?? "growing",
    planted_at: crop.plantedAt ?? new Date().toISOString()
  };

  if (existingId) {
    const { error: updErr } = await supabase
      .from("crop_plantings")
      .update(fields)
      .eq("id", existingId)
      .eq("org_id", orgId);
    if (updErr) throw updErr;
  } else {
    const { error: insErr } = await supabase
      .from("crop_plantings")
      .insert({ org_id: orgId, field_id: fieldId, ...fields });
    if (insErr) throw insErr;
  }
}

const fieldsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/fields — the org's fields for the portal /fields page + the map
  // views. canManage lets the page render the New / edit / delete controls.
  app.get("/v1/fields", { preHandler: app.requireAuth("fields.read") }, async (request, _reply) => {
    const caller = request.auth!;
    const supabase = getDb();

    const { data, error } = await supabase.rpc("list_org_fields", { p_org_id: caller.orgId });
    if (error) throw error;

    const canManage = await request.permissions!.hasPermission(
      { userId: caller.userId, orgId: caller.orgId },
      "fields.update"
    );

    const rows = (data ?? []) as FieldListRow[];
    return { orgId: caller.orgId, canManage, fields: rows.map(toFieldSummary) };
  });

  // POST /v1/fields — create a field under a farm in the caller's org.
  app.post("/v1/fields", { preHandler: app.requireAuth("fields.create") }, async (request, reply) => {
    const caller = request.auth!;
    const parsed = createFieldSchema.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest("fields.invalid_input", "Invalid field body.", {
        issues: parsed.error.issues
      });
    }
    const body = parsed.data;
    const supabase = getDb();

    await assertFarmInOrg(supabase, caller.orgId, body.farmId);

    const { data: inserted, error: insertErr } = await supabase
      .from("fields")
      .insert({
        org_id: caller.orgId,
        farm_id: body.farmId,
        name: body.name,
        description: body.description ?? null,
        area_acres: body.areaAcres ?? null,
        centroid: centroidToEwkt(body.centroid),
        boundary: boundaryToEwkt(body.boundary)
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;

    const fieldId = (inserted as { id: string }).id;
    await applyFieldCrop(supabase, caller.orgId, fieldId, body.crop);

    const field = await loadFieldSummary(supabase, caller.orgId, fieldId);
    reply.status(201);
    return field;
  });

  // GET /v1/fields/:id — single field. Org-scoped; 404 across tenants.
  app.get<{ Params: { id: string } }>(
    "/v1/fields/:id",
    { preHandler: app.requireAuth("fields.read") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) throw badRequest("fields.invalid_id", "Invalid field id.");
      const caller = request.auth!;
      const supabase = getDb();

      const field = await loadFieldSummary(supabase, caller.orgId, id);
      if (!field) throw notFound("fields.not_found", "Field not found.");
      return field;
    }
  );

  // PATCH /v1/fields/:id — edit any subset of a field's columns. centroid:null
  // clears the pin; {lat,lng} rewrites it. Moving a field to another farm
  // re-checks org ownership. Org-scoped load + 404 before writing.
  app.patch<{ Params: { id: string } }>(
    "/v1/fields/:id",
    { preHandler: app.requireAuth("fields.update") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) throw badRequest("fields.invalid_id", "Invalid field id.");
      const parsed = updateFieldSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("fields.invalid_input", "Invalid field update.", {
          issues: parsed.error.issues
        });
      }
      const caller = request.auth!;
      const supabase = getDb();

      const { data: existing, error: loadErr } = await supabase
        .from("fields")
        .select("id, org_id")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!existing || (existing as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("fields.not_found", "Field not found.");
      }

      if (parsed.data.farmId !== undefined) {
        await assertFarmInOrg(supabase, caller.orgId, parsed.data.farmId);
      }

      // The crop lives in crop_plantings, not the fields row — apply it
      // separately and only touch the fields row when a column actually changed.
      const patch = buildFieldPatch(parsed.data);
      if (Object.keys(patch).length > 0) {
        const { error: updErr } = await supabase
          .from("fields")
          .update(patch)
          .eq("id", id)
          .eq("org_id", caller.orgId);
        if (updErr) throw updErr;
      }
      await applyFieldCrop(supabase, caller.orgId, id, parsed.data.crop);

      const field = await loadFieldSummary(supabase, caller.orgId, id);
      if (!field) throw notFound("fields.not_found", "Field not found.");
      return field;
    }
  );

  // DELETE /v1/fields/:id — permanent delete. zones/crop_plantings cascade and
  // captures SET-NULL their field_id, so we refuse to delete a field that still
  // has captures (the authoritative observation record) — the operator must
  // reassign them first. Org-scoped load + 404.
  app.delete<{ Params: { id: string } }>(
    "/v1/fields/:id",
    { preHandler: app.requireAuth("fields.delete") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) throw badRequest("fields.invalid_id", "Invalid field id.");
      const caller = request.auth!;
      const supabase = getDb();

      const { data: existing, error: loadErr } = await supabase
        .from("fields")
        .select("id, org_id")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!existing || (existing as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("fields.not_found", "Field not found.");
      }

      const { count, error: countErr } = await supabase
        .from("captures")
        .select("id", { count: "exact", head: true })
        .eq("field_id", id)
        .eq("org_id", caller.orgId);
      if (countErr) throw countErr;
      if ((count ?? 0) > 0) {
        throw conflict(
          "fields.has_captures",
          "Remove or reassign this field's captures before deleting it.",
          { captureCount: count ?? 0 }
        );
      }

      const { error: delErr } = await supabase
        .from("fields")
        .delete()
        .eq("id", id)
        .eq("org_id", caller.orgId);
      if (delErr) throw delErr;

      return { fieldId: id, deleted: true };
    }
  );
};

export default fieldsRoutes;
