import type { ObservationRecord } from "../../types";
import { newId, nowIso } from "../../utilities/index";
import { getDb } from "../db";

export async function createObservation(
  input: Omit<ObservationRecord, "id" | "createdAt" | "updatedAt">
): Promise<ObservationRecord> {
  const now = nowIso();
  const record: ObservationRecord = {
    ...input,
    id: newId("obs"),
    createdAt: now,
    updatedAt: now
  };
  await getDb().observations.put(record);
  return record;
}

export async function getObservation(id: string): Promise<ObservationRecord | undefined> {
  return getDb().observations.get(id);
}

/** Newest observation first, via the [plantId+recordedAt] compound index. */
export async function listObservationsByPlant(plantId: string): Promise<ObservationRecord[]> {
  return getDb()
    .observations.where("[plantId+recordedAt]")
    .between([plantId, ""], [plantId, "￿"])
    .reverse()
    .toArray();
}

export async function latestObservationForPlant(
  plantId: string
): Promise<ObservationRecord | undefined> {
  return getDb()
    .observations.where("[plantId+recordedAt]")
    .between([plantId, ""], [plantId, "￿"])
    .last();
}

export async function listObservationsByField(fieldId: string): Promise<ObservationRecord[]> {
  return getDb().observations.where("fieldId").equals(fieldId).reverse().sortBy("recordedAt");
}

export async function updateObservation(
  id: string,
  patch: Partial<Omit<ObservationRecord, "id" | "createdAt">>
): Promise<ObservationRecord | null> {
  const db = getDb();
  const current = await db.observations.get(id);
  if (!current) return null;
  const next: ObservationRecord = { ...current, ...patch, updatedAt: nowIso() };
  await db.observations.put(next);
  return next;
}

export async function deleteObservation(id: string): Promise<void> {
  await getDb().observations.delete(id);
}
