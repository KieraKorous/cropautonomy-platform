import type { Table } from "dexie";
import type { ImageRecord } from "../types";
import { getDb } from "../database/db";
import { dataUrlToBlob } from "./blobCodec";
import { BACKUP_TABLES, type BackupEnvelope } from "./backupTypes";

export interface TableImport {
  added: number;
  updated: number;
}

export interface ImportSummary {
  added: number;
  updated: number;
  byTable: Record<string, TableImport>;
}

/**
 * Imports a validated backup by UPSERTING every record on its own id (PRD §13,
 * §22). Because ids are preserved, relationships stay intact and re-importing the
 * same file is idempotent — a record that already exists is updated in place, not
 * duplicated. The summary reports added vs. updated per table so the user sees
 * what a restore actually changed.
 */
export async function importBackup(envelope: BackupEnvelope): Promise<ImportSummary> {
  const db = getDb();
  const data = envelope.data;

  // Deserialize images (data URL → Blob) up front, outside the transaction.
  const images: ImageRecord[] = (data.images ?? []).map(({ dataUrl, ...rest }) => ({
    ...rest,
    blob: dataUrlToBlob(dataUrl)
  }));

  const tableMap: Record<string, Table<{ id: string }, string>> = {
    cropProfiles: db.cropProfiles as unknown as Table<{ id: string }, string>,
    growthStages: db.growthStages as unknown as Table<{ id: string }, string>,
    rules: db.rules as unknown as Table<{ id: string }, string>,
    sources: db.sources as unknown as Table<{ id: string }, string>,
    fields: db.fields as unknown as Table<{ id: string }, string>,
    plants: db.plants as unknown as Table<{ id: string }, string>,
    observations: db.observations as unknown as Table<{ id: string }, string>,
    results: db.results as unknown as Table<{ id: string }, string>,
    findings: db.findings as unknown as Table<{ id: string }, string>,
    images: db.images as unknown as Table<{ id: string }, string>
  };

  const byTable: Record<string, TableImport> = {};

  await db.transaction("rw", Object.values(tableMap), async () => {
    for (const name of BACKUP_TABLES) {
      const records = (data[name] ?? []) as { id: string }[];
      byTable[name] = await upsert(tableMap[name], records);
    }
    byTable.images = await upsert(tableMap.images, images);
  });

  const added = Object.values(byTable).reduce((s, t) => s + t.added, 0);
  const updated = Object.values(byTable).reduce((s, t) => s + t.updated, 0);
  return { added, updated, byTable };
}

async function upsert(
  table: Table<{ id: string }, string>,
  records: { id: string }[]
): Promise<TableImport> {
  if (records.length === 0) return { added: 0, updated: 0 };
  const existing = await table.bulkGet(records.map((r) => r.id));
  const updated = existing.filter(Boolean).length;
  await table.bulkPut(records);
  return { added: records.length - updated, updated };
}
