import type {
  AnalysisRuleRecord,
  CropProfileRecord,
  GrowthStageRecord,
  SourceRecord
} from "../../types";
import { newId, nowIso } from "../../utilities/index";
import { getDb } from "../db";

export async function getCropProfile(cropId: string): Promise<CropProfileRecord | undefined> {
  return getDb().cropProfiles.where("cropId").equals(cropId).first();
}

/** Edits editable crop-profile fields (admin editor). Bumps the profile version. */
export async function updateCropProfile(
  cropId: string,
  patch: Partial<Pick<CropProfileRecord, "commonName" | "scientificName" | "description" | "active">>
): Promise<CropProfileRecord | null> {
  const db = getDb();
  const current = await db.cropProfiles.where("cropId").equals(cropId).first();
  if (!current) return null;
  const next: CropProfileRecord = {
    ...current,
    ...patch,
    version: current.version + 1,
    updatedAt: nowIso()
  };
  await db.cropProfiles.put(next);
  return next;
}

export async function listGrowthStages(cropId: string): Promise<GrowthStageRecord[]> {
  // Ordered by the [cropId+order] compound index.
  return getDb()
    .growthStages.where("[cropId+order]")
    .between([cropId, -Infinity], [cropId, Infinity])
    .toArray();
}

// ── Growth-stage CRUD (admin editor) ────────────────────────────────────────

export async function createGrowthStage(
  input: Omit<GrowthStageRecord, "id">
): Promise<GrowthStageRecord> {
  const record: GrowthStageRecord = { ...input, id: newId("stage") };
  await getDb().growthStages.put(record);
  return record;
}

export async function updateGrowthStage(
  id: string,
  patch: Partial<Omit<GrowthStageRecord, "id" | "cropId">>
): Promise<GrowthStageRecord | null> {
  const db = getDb();
  const current = await db.growthStages.get(id);
  if (!current) return null;
  const next: GrowthStageRecord = { ...current, ...patch };
  await db.growthStages.put(next);
  return next;
}

export async function deleteGrowthStage(id: string): Promise<void> {
  await getDb().growthStages.delete(id);
}

/**
 * Idempotent seed of a crop's knowledge base (profile + stages + rules +
 * sources) in one transaction. Re-running overwrites by primary key, so
 * repeated seeding on app boot is safe.
 */
export async function seedCrop(input: {
  profile: CropProfileRecord;
  stages: GrowthStageRecord[];
  rules: AnalysisRuleRecord[];
  sources: SourceRecord[];
}): Promise<void> {
  const db = getDb();
  await db.transaction("rw", [db.cropProfiles, db.growthStages, db.rules, db.sources], async () => {
    await db.cropProfiles.put(input.profile);
    await db.growthStages.bulkPut(input.stages);
    await db.rules.bulkPut(input.rules);
    await db.sources.bulkPut(input.sources);
  });
}
