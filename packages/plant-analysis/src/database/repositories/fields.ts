import type { FieldRecord } from "../../types";
import { newId, nowIso } from "../../utilities/index";
import { getDb } from "../db";

// Free-function repository (mirrors apps/field-web/src/lib/db.ts). Create fns
// stamp id/createdAt/updatedAt; patch fns re-stamp updatedAt and return null on a
// missing row; list fns return pre-sorted arrays so the UI never re-sorts.

export async function createField(
  input: Omit<FieldRecord, "id" | "createdAt" | "updatedAt">
): Promise<FieldRecord> {
  const now = nowIso();
  const record: FieldRecord = { ...input, id: newId("field"), createdAt: now, updatedAt: now };
  await getDb().fields.put(record);
  return record;
}

export async function getField(id: string): Promise<FieldRecord | undefined> {
  return getDb().fields.get(id);
}

export async function listFields(): Promise<FieldRecord[]> {
  // Newest-updated first.
  return getDb().fields.orderBy("updatedAt").reverse().toArray();
}

export async function updateField(
  id: string,
  patch: Partial<Omit<FieldRecord, "id" | "createdAt">>
): Promise<FieldRecord | null> {
  const db = getDb();
  const current = await db.fields.get(id);
  if (!current) return null;
  const next: FieldRecord = { ...current, ...patch, updatedAt: nowIso() };
  await db.fields.put(next);
  return next;
}

/**
 * Deletes a field and cascades to its plants, their observations, results,
 * findings, and images — Dexie has no foreign-key cascade, so we do it here in a
 * single transaction. (Images/results/findings tables are wired in Phase 4/5; the
 * cascade already covers them so the delete stays correct as they fill in.)
 */
export async function deleteField(id: string): Promise<void> {
  const db = getDb();
  await db.transaction(
    "rw",
    [db.fields, db.plants, db.observations, db.results, db.findings, db.images],
    async () => {
      const plantIds = await db.plants.where("fieldId").equals(id).primaryKeys();
      const resultIds = await db.results.where("plantId").anyOf(plantIds).primaryKeys();
      await db.findings.where("analysisResultId").anyOf(resultIds).delete();
      await db.results.where("plantId").anyOf(plantIds).delete();
      await db.images.where("plantId").anyOf(plantIds).delete();
      await db.observations.where("plantId").anyOf(plantIds).delete();
      await db.plants.where("fieldId").equals(id).delete();
      await db.fields.delete(id);
    }
  );
}
