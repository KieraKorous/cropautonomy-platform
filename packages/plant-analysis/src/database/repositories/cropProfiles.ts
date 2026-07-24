import type {
  AnalysisRuleRecord,
  CropProfileRecord,
  GrowthStageRecord,
  SourceRecord
} from "../../types";
import { getDb } from "../db";

export async function getCropProfile(cropId: string): Promise<CropProfileRecord | undefined> {
  return getDb().cropProfiles.where("cropId").equals(cropId).first();
}

export async function listGrowthStages(cropId: string): Promise<GrowthStageRecord[]> {
  // Ordered by the [cropId+order] compound index.
  return getDb()
    .growthStages.where("[cropId+order]")
    .between([cropId, -Infinity], [cropId, Infinity])
    .toArray();
}

export async function listSources(cropId: string): Promise<SourceRecord[]> {
  return getDb().sources.where("cropId").equals(cropId).toArray();
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
