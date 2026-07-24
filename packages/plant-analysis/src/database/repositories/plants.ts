import type { GrowthStageKey, PlantRecord } from "../../types";
import { newId, nowIso } from "../../utilities/index";
import { getDb } from "../db";

export async function createPlant(
  input: Omit<PlantRecord, "id" | "createdAt" | "updatedAt">
): Promise<PlantRecord> {
  const now = nowIso();
  const record: PlantRecord = { ...input, id: newId("plant"), createdAt: now, updatedAt: now };
  await getDb().plants.put(record);
  return record;
}

export async function getPlant(id: string): Promise<PlantRecord | undefined> {
  return getDb().plants.get(id);
}

export async function listPlantsByField(fieldId: string): Promise<PlantRecord[]> {
  return getDb().plants.where("fieldId").equals(fieldId).reverse().sortBy("updatedAt");
}

export async function listPlantsByFieldAndStage(
  fieldId: string,
  stage: GrowthStageKey
): Promise<PlantRecord[]> {
  // Backed by the [fieldId+growthStageId] compound index.
  return getDb().plants.where("[fieldId+growthStageId]").equals([fieldId, stage]).toArray();
}

export async function updatePlant(
  id: string,
  patch: Partial<Omit<PlantRecord, "id" | "createdAt">>
): Promise<PlantRecord | null> {
  const db = getDb();
  const current = await db.plants.get(id);
  if (!current) return null;
  const next: PlantRecord = { ...current, ...patch, updatedAt: nowIso() };
  await db.plants.put(next);
  return next;
}

export async function setPlantStage(
  id: string,
  stage: GrowthStageKey
): Promise<PlantRecord | null> {
  return updatePlant(id, { growthStageId: stage });
}

/** Deletes a plant and cascades to its observations, results, findings, images. */
export async function deletePlant(id: string): Promise<void> {
  const db = getDb();
  await db.transaction(
    "rw",
    [db.plants, db.observations, db.results, db.findings, db.images],
    async () => {
      const resultIds = await db.results.where("plantId").equals(id).primaryKeys();
      await db.findings.where("analysisResultId").anyOf(resultIds).delete();
      await db.results.where("plantId").equals(id).delete();
      await db.images.where("plantId").equals(id).delete();
      await db.observations.where("plantId").equals(id).delete();
      await db.plants.delete(id);
    }
  );
}
