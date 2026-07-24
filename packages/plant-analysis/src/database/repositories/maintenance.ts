import { getDb } from "../db";

/**
 * Deletes ALL local plant-analysis data (PRD §10.19 — delete-all-data flow).
 * Clears every table in one transaction. Irreversible — the UI must confirm first.
 * Crop knowledge is cleared too; ensureTomatoSeeded re-seeds it on next load.
 */
export async function deleteAllData(): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
