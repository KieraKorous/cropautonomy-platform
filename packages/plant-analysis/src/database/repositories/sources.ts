import type { SourceRecord } from "../../types";
import { newId } from "../../utilities/index";
import { getDb } from "../db";

// Source references — read by findings/evidence display, full CRUD for the admin
// knowledge editor (PRD §7.7, §10.18).

export async function listSources(cropId: string): Promise<SourceRecord[]> {
  return getDb().sources.where("cropId").equals(cropId).toArray();
}

export async function getSource(id: string): Promise<SourceRecord | undefined> {
  return getDb().sources.get(id);
}

export async function createSource(
  cropId: string,
  input: Omit<SourceRecord, "id" | "cropId">
): Promise<SourceRecord> {
  const record: SourceRecord = { ...input, id: newId("source"), cropId };
  await getDb().sources.put(record);
  return record;
}

export async function updateSource(
  id: string,
  patch: Partial<Omit<SourceRecord, "id" | "cropId">>
): Promise<SourceRecord | null> {
  const db = getDb();
  const current = await db.sources.get(id);
  if (!current) return null;
  const next: SourceRecord = { ...current, ...patch };
  await db.sources.put(next);
  return next;
}

export async function deleteSource(id: string): Promise<void> {
  await getDb().sources.delete(id);
}
