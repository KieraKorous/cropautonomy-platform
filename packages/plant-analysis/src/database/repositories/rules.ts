import type { AnalysisRuleRecord, GrowthStageKey } from "../../types";
import { getDb } from "../db";

// Read-focused in Milestone 1; the write path is knowledge-base seeding. The
// analysis engine (Phase 5/7) consumes these.

/** Enabled rules matching a crop + a specific stage, via [cropId+stage]. */
export async function listRulesByCropAndStage(
  cropId: string,
  stage: GrowthStageKey
): Promise<AnalysisRuleRecord[]> {
  const rules = await getDb()
    .rules.where("[cropId+stage]")
    .equals([cropId, stage])
    .toArray();
  return rules.filter((r) => r.enabled);
}

/** All enabled rules for a crop, including stage-agnostic (crop-wide) rules. */
export async function listEnabledRules(cropId: string): Promise<AnalysisRuleRecord[]> {
  const rules = await getDb().rules.where("cropId").equals(cropId).toArray();
  return rules.filter((r) => r.enabled);
}

export async function bulkPutRules(rules: AnalysisRuleRecord[]): Promise<void> {
  await getDb().rules.bulkPut(rules);
}
