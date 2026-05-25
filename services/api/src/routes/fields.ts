import type { FastifyPluginAsync } from "fastify";
import { getDb } from "../lib/db.js";

// GeoJSON shape returned by st_asgeojson() in 0007_fields_geojson_rpc.sql.
// We don't fully validate it server-side — the function is the contract.
interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: number[][][];
}
interface GeoJsonPoint {
  type: "Point";
  coordinates: [number, number];
}

interface FieldRow {
  id: string;
  farm_id: string;
  name: string;
  area_acres: number | null;
  boundary: GeoJsonPolygon | null;
  centroid: GeoJsonPoint | null;
}

const fieldsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/v1/fields",
    { preHandler: app.requireAuth("fields.read") },
    async (request, _reply) => {
      const caller = request.auth!;
      const supabase = getDb();

      const { data, error } = await supabase.rpc("list_org_fields", {
        p_org_id: caller.orgId
      });
      if (error) throw error;

      const rows = (data ?? []) as FieldRow[];

      return {
        fields: rows.map((row) => ({
          id: row.id,
          farmId: row.farm_id,
          name: row.name,
          areaAcres: row.area_acres,
          boundary: row.boundary,
          centroid: row.centroid
        }))
      };
    }
  );
};

export default fieldsRoutes;
