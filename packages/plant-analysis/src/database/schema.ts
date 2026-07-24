// Dexie schema for the local Plant Analysis Database.
//
// ── MIGRATION DISCIPLINE (read before touching this file) ───────────────────
// The version-1 `.stores()` string below is FROZEN once any user has data. Dexie
// versioning is declarative and additive: to change a table or index you add a
// NEW `db.version(2).stores({...}).upgrade(tx => …)` block in
// PlantAnalysisDatabase — you never edit SCHEMA_V1 in place. Rewriting a shipped
// version string corrupts existing databases.
//
// Only fields used in `.where()` / `.orderBy()` are indexed. Compound indexes
// `[a+b]` back the exact list queries the repositories run; unindexed paths would
// silently fall back to full-table scans.

export const DB_NAME = "gaia-plant-analysis";
export const DB_VERSION = 1;

// Primary keys are client-generated UUID strings (`id`), so no `++` auto-increment.
export const SCHEMA_V1: Record<string, string> = {
  fields: "id, cropId, updatedAt",
  plants: "id, fieldId, cropProfileId, growthStageId, updatedAt, [fieldId+growthStageId]",
  observations: "id, plantId, fieldId, recordedAt, [plantId+recordedAt]",
  cropProfiles: "id, cropId",
  growthStages: "id, cropId, [cropId+order]",
  rules: "id, cropId, stage, enabled, [cropId+stage]",
  results: "id, plantId, observationId, analyzedAt, [plantId+analyzedAt]",
  findings: "id, analysisResultId, ruleId, severity, [analysisResultId+severity]",
  images: "id, plantId, observationId, [plantId+createdAt]",
  sources: "id, cropId"
};
