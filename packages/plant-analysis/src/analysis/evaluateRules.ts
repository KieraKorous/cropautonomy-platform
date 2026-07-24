import type { AnalysisRuleRecord, GrowthStageKey, ObservationRecord } from "../types";
import { evaluateRule, readMeasurement } from "./evaluateRule";
import { expectedText, observedText } from "./evidence";
import type { RuleEvaluation } from "./types";

/**
 * Filters a rule set to those applicable to a growth stage. A rule with no
 * `stage` is crop-wide (applies at every stage); a stage-scoped rule applies only
 * at its stage. (PRD §15.2 — specificity; with the current tomato set all rules
 * are crop-wide, but the filter keeps stage-scoped rules correct as they're added.)
 */
export function rulesForStage(
  rules: AnalysisRuleRecord[],
  stage: GrowthStageKey | undefined
): AnalysisRuleRecord[] {
  return rules.filter((r) => r.enabled && (!r.stage || r.stage === stage));
}

/** Runs every rule against one observation and collects the findings + coverage. */
export function evaluateRules(
  rules: AnalysisRuleRecord[],
  obs: ObservationRecord
): RuleEvaluation {
  const triggered = [];
  let evaluableCount = 0;
  for (const rule of rules) {
    const { applicable, triggered: fired } = evaluateRule(rule, obs);
    if (applicable) evaluableCount += 1;
    if (fired) {
      const value = readMeasurement(obs, rule.measurement);
      triggered.push({
        rule,
        observedValue: observedText(rule, value),
        expectedValue: expectedText(rule)
      });
    }
  }
  return { triggered, evaluableCount };
}
