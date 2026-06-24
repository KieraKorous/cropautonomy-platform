import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDb } from "../lib/db.js";
import { badRequest, notFound } from "../lib/errors.js";

const UUID_RE = /^[0-9a-f-]{36}$/i;

// GeoJSON polygon as serialized by st_asgeojson() in 0021. The function is the
// contract; we don't fully validate it server-side.
interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: number[][][];
}

// Row shape from the list_org_zones RPC.
interface ZoneListRow {
  id: string;
  field_id: string;
  name: string;
  description: string | null;
  boundary: GeoJsonPolygon | null;
  created_at: string;
  updated_at: string;
}

// A zone's boundary — an axis-aligned rectangle drawn within the parent field.
// GeoJSON Polygon; null clears it. Validated loosely — the editor is the contract.
const boundarySchema = z
  .object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(z.tuple([z.number(), z.number()])).min(4)).min(1)
  })
  .nullable();

const createZoneSchema = z.object({
  fieldId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  boundary: boundarySchema.optional()
});

const updateZoneSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    boundary: boundarySchema.optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided."
  });

type ZoneWrite = z.infer<typeof createZoneSchema>;

// EWKT for the boundary polygon's exterior ring. Defensively closes the ring
// (PostGIS rejects an open ring). null when the zone has no boundary.
function boundaryToEwkt(boundary: ZoneWrite["boundary"]): string | null {
  if (!boundary) return null;
  const ring = [...boundary.coordinates[0]];
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx !== lx || fy !== ly) ring.push(ring[0]);
  const pts = ring.map(([lng, lat]) => `${lng} ${lat}`).join(", ");
  return `SRID=4326;POLYGON((${pts}))`;
}

function buildZonePatch(body: Partial<ZoneWrite>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.description !== undefined) patch.description = body.description;
  if (body.boundary !== undefined) patch.boundary = boundaryToEwkt(body.boundary);
  return patch;
}

function toZoneSummary(row: ZoneListRow) {
  return {
    id: row.id,
    fieldId: row.field_id,
    name: row.name,
    description: row.description,
    boundary: row.boundary,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Re-read a single zone through the RPC so create/update share one serialization
// path (boundary → GeoJSON). Returns null if it isn't in the caller's org.
async function loadZoneSummary(
  supabase: ReturnType<typeof getDb>,
  orgId: string,
  zoneId: string
) {
  const { data, error } = await supabase.rpc("list_org_zones", { p_org_id: orgId });
  if (error) throw error;
  const row = ((data ?? []) as ZoneListRow[]).find((r) => r.id === zoneId);
  return row ? toZoneSummary(row) : null;
}

// Verify the parent field exists in the caller's org before a zone write.
async function assertFieldInOrg(
  supabase: ReturnType<typeof getDb>,
  orgId: string,
  fieldId: string
) {
  const { data, error } = await supabase
    .from("fields")
    .select("id, org_id")
    .eq("id", fieldId)
    .maybeSingle();
  if (error) throw error;
  if (!data || (data as { org_id: string }).org_id !== orgId) {
    throw badRequest("zones.invalid_field", "Field not found in this organization.");
  }
}

const zonesRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/zones — the org's zones (optionally scoped to one field). canManage
  // lets the portal render the New / edit / delete controls.
  app.get<{ Querystring: { fieldId?: string } }>(
    "/v1/zones",
    { preHandler: app.requireAuth("zones.read") },
    async (request, _reply) => {
      const caller = request.auth!;
      const { fieldId } = request.query;
      if (fieldId && !UUID_RE.test(fieldId)) {
        throw badRequest("zones.invalid_field_id", "Invalid field id.");
      }
      const supabase = getDb();

      const { data, error } = await supabase.rpc("list_org_zones", { p_org_id: caller.orgId });
      if (error) throw error;

      const canManage = await request.permissions!.hasPermission(
        { userId: caller.userId, orgId: caller.orgId },
        "zones.update"
      );

      let rows = (data ?? []) as ZoneListRow[];
      if (fieldId) rows = rows.filter((r) => r.field_id === fieldId);
      return { orgId: caller.orgId, canManage, zones: rows.map(toZoneSummary) };
    }
  );

  // POST /v1/zones — create a zone within a field in the caller's org.
  app.post("/v1/zones", { preHandler: app.requireAuth("zones.create") }, async (request, reply) => {
    const caller = request.auth!;
    const parsed = createZoneSchema.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest("zones.invalid_input", "Invalid zone body.", {
        issues: parsed.error.issues
      });
    }
    const body = parsed.data;
    const supabase = getDb();

    await assertFieldInOrg(supabase, caller.orgId, body.fieldId);

    const { data: inserted, error: insertErr } = await supabase
      .from("zones")
      .insert({
        org_id: caller.orgId,
        field_id: body.fieldId,
        name: body.name,
        description: body.description ?? null,
        boundary: boundaryToEwkt(body.boundary)
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;

    const zone = await loadZoneSummary(supabase, caller.orgId, (inserted as { id: string }).id);
    reply.status(201);
    return zone;
  });

  // PATCH /v1/zones/:id — edit a subset of a zone's columns. Org-scoped load + 404.
  app.patch<{ Params: { id: string } }>(
    "/v1/zones/:id",
    { preHandler: app.requireAuth("zones.update") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) throw badRequest("zones.invalid_id", "Invalid zone id.");
      const parsed = updateZoneSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("zones.invalid_input", "Invalid zone update.", {
          issues: parsed.error.issues
        });
      }
      const caller = request.auth!;
      const supabase = getDb();

      const { data: existing, error: loadErr } = await supabase
        .from("zones")
        .select("id, org_id")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!existing || (existing as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("zones.not_found", "Zone not found.");
      }

      const { error: updErr } = await supabase
        .from("zones")
        .update(buildZonePatch(parsed.data))
        .eq("id", id)
        .eq("org_id", caller.orgId);
      if (updErr) throw updErr;

      const zone = await loadZoneSummary(supabase, caller.orgId, id);
      if (!zone) throw notFound("zones.not_found", "Zone not found.");
      return zone;
    }
  );

  // DELETE /v1/zones/:id — permanent delete. crop_plantings.zone_id SET-NULLs, so
  // no dependent guard is needed. Org-scoped load + 404.
  app.delete<{ Params: { id: string } }>(
    "/v1/zones/:id",
    { preHandler: app.requireAuth("zones.delete") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) throw badRequest("zones.invalid_id", "Invalid zone id.");
      const caller = request.auth!;
      const supabase = getDb();

      const { data: existing, error: loadErr } = await supabase
        .from("zones")
        .select("id, org_id")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!existing || (existing as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("zones.not_found", "Zone not found.");
      }

      const { error: delErr } = await supabase
        .from("zones")
        .delete()
        .eq("id", id)
        .eq("org_id", caller.orgId);
      if (delErr) throw delErr;

      return { zoneId: id, deleted: true };
    }
  );
};

export default zonesRoutes;
