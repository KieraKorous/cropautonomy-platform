import type { AnalysisResultRecord, FindingRecord } from "../types";
import { getCropProfile } from "../database/repositories/cropProfiles";
import { getObservation } from "../database/repositories/observations";
import { getPlant } from "../database/repositories/plants";
import { listEnabledRules } from "../database/repositories/rules";
import { saveResult } from "../database/repositories/results";
import { newId, nowIso } from "../utilities/index";
import { calculateHealthScore } from "./calculateHealthScore";
import { determinePlantStatus } from "./determinePlantStatus";
import { evaluateRules, rulesForStage } from "./evaluateRules";
import type { AnalysisOutcome } from "./types";

/**
 * The analysis orchestrator (PRD §15.1). Loads the plant, its observation, and
 * the crop's enabled rules; evaluates the rules for the plant's growth stage;
 * computes the health score + status; and persists a result plus one finding per
 * triggered rule. Each finding SNAPSHOTS its rule (id, version, condition,
 * severity, message, penalty, recommendation, source) so the stored result stays
 * reproducible even if the rule is later edited or disabled (PRD §22).
 */
export async function analyzePlant(
  plantId: string,
  observationId: string
): Promise<AnalysisOutcome> {
  const plant = await getPlant(plantId);
  if (!plant) throw new Error(`Plant ${plantId} not found`);
  const observation = await getObservation(observationId);
  if (!observation) throw new Error(`Observation ${observationId} not found`);

  const profile = await getCropProfile(plant.cropProfileId);
  const enabled = await listEnabledRules(plant.cropProfileId);
  const rules = rulesForStage(enabled, plant.growthStageId);

  const { triggered, evaluableCount } = evaluateRules(rules, observation);
  const healthScore = calculateHealthScore(triggered);
  const status = determinePlantStatus(healthScore, triggered, evaluableCount);

  const result: AnalysisResultRecord = {
    id: newId("result"),
    plantId,
    observationId,
    analyzedAt: nowIso(),
    status,
    healthScore,
    cropProfileVersion: profile?.version ?? 0
  };

  const findings: FindingRecord[] = triggered.map((t) => ({
    id: newId("finding"),
    analysisResultId: result.id,
    ruleId: t.rule.id,
    ruleVersion: t.rule.version,
    condition: t.rule.condition,
    severity: t.rule.severity,
    message: t.rule.message,
    scorePenalty: t.rule.scorePenalty,
    recommendation: t.rule.recommendation,
    sourceId: t.rule.sourceId,
    provisional: t.rule.provisional,
    observedValue: t.observedValue,
    expectedValue: t.expectedValue
  }));

  await saveResult(result, findings);
  return { result, findings };
}
