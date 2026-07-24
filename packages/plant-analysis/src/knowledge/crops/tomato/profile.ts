import type { CropProfileRecord } from "../../../types";

export const TOMATO_CROP_ID = "tomato";

// Stable seed timestamp so re-seeding (idempotent put-by-key) doesn't churn
// createdAt/updatedAt on every app boot.
export const SEED_TIMESTAMP = "2026-07-23T00:00:00.000Z";

export const TOMATO_PROFILE: CropProfileRecord = {
  id: TOMATO_CROP_ID,
  cropId: TOMATO_CROP_ID,
  commonName: "Tomato",
  scientificName: "Solanum lycopersicum",
  description:
    "First supported crop. Provides a useful range of measurable growth, moisture, temperature, leaf, and visual conditions (PRD §10.3).",
  active: true,
  // Bump when the seeded knowledge (stages/rules/sources) changes so
  // ensureTomatoSeeded re-seeds existing local databases. v2: leafColor-driven
  // color rules + stage-agnostic numeric thresholds.
  version: 2,
  reviewedAt: SEED_TIMESTAMP,
  createdAt: SEED_TIMESTAMP,
  updatedAt: SEED_TIMESTAMP
};
