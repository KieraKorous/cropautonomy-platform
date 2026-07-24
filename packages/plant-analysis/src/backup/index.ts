// Backup & restore (PRD Phase 13). Browser-only (reads/writes the Dexie
// database). Import from "@gaia/plant-analysis/backup" inside a client boundary.

export {
  EXPORT_FORMAT_VERSION,
  BACKUP_TABLES,
  type BackupEnvelope,
  type BackupData,
  type SerializedImage
} from "./backupTypes";
export { exportAll, exportField, type ExportOptions } from "./exportDatabase";
export { validateBackup, type ValidationResult } from "./validateBackup";
export { importBackup, type ImportSummary, type TableImport } from "./importDatabase";
export { blobToDataUrl, dataUrlToBlob } from "./blobCodec";
