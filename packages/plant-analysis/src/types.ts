// Data models for the Rule-Based Plant Analysis Database (PRD §13).
//
// This is the single source of truth for every record shape in the local
// (IndexedDB/Dexie) analysis database. Two forward-looking additions beyond the
// bare PRD interfaces are baked in from day one because they are cheap now and
// expensive to retrofit later:
//
//   1. `AnalysisRuleRecord.version` + `provisional` — so historical findings can
//      pin the exact rule revision that produced them (PRD §22) and the UI can
//      badge unvalidated agronomic advice (PRD §16).
//   2. `FindingRecord` snapshot fields — a finding copies the rule's identity and
//      parameters at evaluation time, so editing or disabling a rule later never
//      silently rewrites the meaning of past results (PRD §22).
//
// Conventions:
//   - `id` is a client-generated, prefixed UUID string (see utilities/identifiers).
//   - `cropId` is a STABLE HUMAN SLUG ("tomato"), a natural key used by seeds and
//     the [cropId+stage] index — never generated.
//   - All timestamps are ISO-8601 strings: they sort chronologically, are legible
//     in exports, and index cleanly in Dexie compound keys.

// ── Shared vocabulary ───────────────────────────────────────────────────────

/**
 * Canonical tomato growth stages (Phase 1 scope). Kept as a string union so the
 * value is both the storage key and the [cropId+stage] index key. See
 * knowledge/crops/tomato/TOMATO-SCOPE.md for the mapping to the Virtual Field's
 * 8-stage render enum (packages/virtual-field/src/crop.ts).
 */
export type GrowthStageKey =
  | "seedling"
  | "vegetative"
  | "flowering"
  | "fruiting"
  | "ripening"
  | "harvest";

export type ObservationSource =
  | "manual"
  | "mobile"
  | "sensor"
  | "drone"
  | "rover"
  | "import"
  | "image-processing";

export type RuleOperator =
  | "lessThan"
  | "lessThanOrEqual"
  | "greaterThan"
  | "greaterThanOrEqual"
  | "equals"
  | "notEquals"
  | "between"
  | "outsideRange"
  | "isTrue"
  | "isFalse"
  | "isPresent"
  | "isMissing";

export type Severity = "info" | "warning" | "critical";

export type Confidence = "low" | "moderate" | "high";

export type PlantStatus = "active" | "archived";

export type AnalysisStatus = "healthy" | "attention" | "critical" | "insufficient-data";

// ── Records ─────────────────────────────────────────────────────────────────

export interface FieldRecord {
  id: string;
  name: string;
  description?: string;
  location?: string;
  rows?: number;
  columns?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlantRecord {
  id: string;
  fieldId: string;
  cropProfileId: string;
  varietyId?: string;
  name: string;
  row?: number;
  column?: number;
  plantedAt?: string;
  growthStageId?: GrowthStageKey;
  status: PlantStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ObservationRecord {
  id: string;
  plantId: string;
  // Denormalized from the plant so field-scoped queries don't require a join.
  fieldId: string;
  recordedAt: string;
  source: ObservationSource;

  heightCm?: number;
  leafCount?: number;
  leafColor?: string;
  soilMoisturePercent?: number;
  temperatureC?: number;
  humidityPercent?: number;
  soilTemperatureC?: number;
  soilPh?: number;
  canopyWidthCm?: number;
  stemWidthMm?: number;

  wilting?: boolean;
  leafSpots?: boolean;
  curledLeaves?: boolean;
  holesInLeaves?: boolean;
  browning?: boolean;
  yellowing?: boolean;
  pestObserved?: boolean;

  flowerCount?: number;
  fruitCount?: number;

  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CropProfileRecord {
  id: string;
  // Stable slug ("tomato"). Equal to `id` for seeded crops; kept distinct so a
  // future admin editor can mint uuid-keyed crops with a separate display slug.
  cropId: string;
  commonName: string;
  scientificName?: string;
  description?: string;
  active: boolean;
  version: number;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GrowthStageRecord {
  id: string;
  cropId: string;
  key: GrowthStageKey;
  name: string;
  order: number;
  minimumAgeDays?: number;
  maximumAgeDays?: number;
  description?: string;
}

export interface AnalysisRuleRecord {
  id: string;
  cropId: string;
  varietyId?: string;
  // The growth stage this rule applies to. `undefined`/omitted = crop-wide.
  stage?: GrowthStageKey;

  name: string;
  measurement: string;
  operator: RuleOperator;

  value?: number | string | boolean;
  minimum?: number;
  maximum?: number;

  severity: Severity;
  scorePenalty: number;

  condition: string;
  message: string;
  recommendation?: string;
  sourceId?: string;
  // True until an agronomic source has been reviewed (PRD §16). The UI badges
  // provisional advice so users know it is a sensible default, not vetted.
  provisional?: boolean;

  enabled: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisResultRecord {
  id: string;
  plantId: string;
  observationId: string;
  analyzedAt: string;
  status: AnalysisStatus;
  healthScore: number;
  // The crop profile version in force when this result was computed, so an old
  // result can be reproduced even after the profile is revised.
  cropProfileVersion: number;
}

export interface FindingRecord {
  id: string;
  analysisResultId: string;
  // ── Rule snapshot (copied at evaluation time; do NOT resolve live) ──
  ruleId: string;
  ruleVersion: number;
  condition: string;
  severity: Severity;
  message: string;
  scorePenalty: number;
  recommendation?: string;
  sourceId?: string;
  provisional?: boolean;
  // ── Evidence ──
  observedValue?: string;
  expectedValue?: string;
  confidence?: Confidence;
}

export interface ImageRecord {
  id: string;
  plantId: string;
  observationId?: string;
  blob: Blob;
  mimeType: string;
  width?: number;
  height?: number;
  capturedAt?: string;
  createdAt: string;
  notes?: string;
}

export interface SourceRecord {
  id: string;
  cropId: string;
  title: string;
  organization?: string;
  author?: string;
  url?: string;
  publicationDate?: string;
  reviewedAt?: string;
  notes?: string;
}
