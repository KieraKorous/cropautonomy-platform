import type {
  AnalysisRuleRecord,
  CropProfileRecord,
  GrowthStageRecord,
  SourceRecord
} from "../../../types";
import { TOMATO_CROP_ID, TOMATO_PROFILE } from "./profile";
import { TOMATO_STAGES } from "./stages";
import { TOMATO_RULES } from "./rules";
import { TOMATO_SOURCES } from "./sources";

export { TOMATO_CROP_ID, TOMATO_PROFILE } from "./profile";
export { TOMATO_STAGES } from "./stages";
export { TOMATO_RULES } from "./rules";
export { TOMATO_SOURCES } from "./sources";

/**
 * The full tomato knowledge base as a single seed payload. Pass straight to
 * `seedCrop()` from "@gaia/plant-analysis/database" — the seed is idempotent.
 */
export function tomatoSeed(): {
  profile: CropProfileRecord;
  stages: GrowthStageRecord[];
  rules: AnalysisRuleRecord[];
  sources: SourceRecord[];
} {
  return {
    profile: TOMATO_PROFILE,
    stages: TOMATO_STAGES,
    rules: TOMATO_RULES,
    sources: TOMATO_SOURCES
  };
}
