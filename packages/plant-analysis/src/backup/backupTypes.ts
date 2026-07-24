import type {
  AnalysisResultRecord,
  AnalysisRuleRecord,
  CropProfileRecord,
  FieldRecord,
  FindingRecord,
  GrowthStageRecord,
  ObservationRecord,
  PlantColorAnalysis,
  PlantRecord,
  SourceRecord
} from "../types";

// Versioned backup envelope (PRD §10.19, §22). The two version stamps let import
// branch on format changes and detect a database-schema mismatch: exportFormat is
// the shape of THIS file; schemaVersion is the Dexie DB version the data came from.
export const EXPORT_FORMAT_VERSION = 1;

/** An ImageRecord with its Blob encoded as a data URL (JSON can't hold a Blob). */
export interface SerializedImage {
  id: string;
  plantId: string;
  observationId?: string;
  mimeType: string;
  width?: number;
  height?: number;
  capturedAt?: string;
  createdAt: string;
  notes?: string;
  analysis?: PlantColorAnalysis;
  dataUrl: string;
}

export interface BackupData {
  fields: FieldRecord[];
  plants: PlantRecord[];
  observations: ObservationRecord[];
  results: AnalysisResultRecord[];
  findings: FindingRecord[];
  cropProfiles: CropProfileRecord[];
  growthStages: GrowthStageRecord[];
  rules: AnalysisRuleRecord[];
  sources: SourceRecord[];
  /** Present only when the export included images. */
  images?: SerializedImage[];
}

export interface BackupEnvelope {
  exportFormatVersion: number;
  schemaVersion: number;
  exportedAt: string;
  scope: "all" | "field";
  /** Set when scope === "field". */
  fieldId?: string;
  data: BackupData;
}

/** The record tables carried in a backup, in dependency order (parents first). */
export const BACKUP_TABLES = [
  "cropProfiles",
  "growthStages",
  "rules",
  "sources",
  "fields",
  "plants",
  "observations",
  "results",
  "findings"
] as const;
