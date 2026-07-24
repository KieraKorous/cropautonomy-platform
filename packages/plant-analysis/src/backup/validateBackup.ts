import { BACKUP_TABLES, EXPORT_FORMAT_VERSION, type BackupEnvelope } from "./backupTypes";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  envelope?: BackupEnvelope;
}

function isRecordArray(v: unknown): v is { id: unknown }[] {
  return Array.isArray(v) && v.every((r) => r && typeof r === "object");
}

/**
 * Validates a parsed backup before import (PRD §21, §22). Rejects malformed files
 * and refuses a format newer than this build understands. Data only — nothing is
 * executed.
 */
export function validateBackup(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!input || typeof input !== "object") {
    return { ok: false, errors: ["File is not a valid backup object."] };
  }
  const env = input as Partial<BackupEnvelope>;

  if (typeof env.exportFormatVersion !== "number") {
    errors.push("Missing export format version.");
  } else if (env.exportFormatVersion > EXPORT_FORMAT_VERSION) {
    errors.push(
      `Backup format v${env.exportFormatVersion} is newer than this app supports (v${EXPORT_FORMAT_VERSION}).`
    );
  }

  if (!env.data || typeof env.data !== "object") {
    errors.push("Backup has no data.");
    return { ok: false, errors };
  }

  const data = env.data as unknown as Record<string, unknown>;
  for (const table of BACKUP_TABLES) {
    if (data[table] === undefined) continue; // absent table = nothing to import there
    if (!isRecordArray(data[table])) errors.push(`"${table}" is not a valid record list.`);
    else if ((data[table] as { id: unknown }[]).some((r) => typeof r.id !== "string")) {
      errors.push(`"${table}" contains a record without a string id.`);
    }
  }
  if (data.images !== undefined && !Array.isArray(data.images)) {
    errors.push('"images" is not a valid list.');
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, errors: [], envelope: input as BackupEnvelope };
}
