import type { FastifyPluginAsync } from "fastify";
import { getDb } from "../lib/db.js";

// Row shape from the crop_types table (platform reference data + org-custom).
interface CropTypeRow {
  id: string;
  org_id: string | null;
  key: string;
  common_name: string;
  scientific_name: string | null;
  category: string | null;
}

const cropTypesRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/crop-types — the crop types this org can pick from: every
  // platform-wide type (org_id null) plus the org's own custom ones. Used by the
  // field editor's crop selector.
  app.get(
    "/v1/crop-types",
    { preHandler: app.requireAuth("crop_types.read") },
    async (request, _reply) => {
      const caller = request.auth!;
      const supabase = getDb();

      const { data, error } = await supabase
        .from("crop_types")
        .select("id, org_id, key, common_name, scientific_name, category")
        .or(`org_id.is.null,org_id.eq.${caller.orgId}`)
        .order("common_name", { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as CropTypeRow[];
      return {
        cropTypes: rows.map((row) => ({
          id: row.id,
          key: row.key,
          commonName: row.common_name,
          scientificName: row.scientific_name,
          category: row.category,
          orgScoped: row.org_id !== null
        }))
      };
    }
  );
};

export default cropTypesRoutes;
