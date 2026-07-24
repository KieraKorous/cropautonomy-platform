import type { AnalysisRuleRecord, ObservationRecord } from "../types";

export type MeasurementValue = string | number | boolean | undefined | null;

/** Reads the observation field a rule targets (e.g. "soilMoisturePercent"). */
export function readMeasurement(obs: ObservationRecord, name: string): MeasurementValue {
  return (obs as unknown as Record<string, MeasurementValue>)[name];
}

export interface SingleRuleResult {
  /** The observation carried enough data to evaluate this rule at all. */
  applicable: boolean;
  /** The rule's condition is met — a finding should be generated. */
  triggered: boolean;
}

function isPresent(v: MeasurementValue): boolean {
  return v !== undefined && v !== null && !(typeof v === "number" && Number.isNaN(v));
}

/**
 * Evaluates one rule against one observation. A rule only "triggers" (produces a
 * finding) when its condition is met; a rule whose measurement is absent is not
 * applicable and never triggers — except the presence operators, which are about
 * absence itself.
 */
export function evaluateRule(rule: AnalysisRuleRecord, obs: ObservationRecord): SingleRuleResult {
  const value = readMeasurement(obs, rule.measurement);
  const present = isPresent(value);
  const presenceOperator = rule.operator === "isPresent" || rule.operator === "isMissing";
  const applicable = present || presenceOperator;
  if (!applicable) return { applicable: false, triggered: false };
  return { applicable: true, triggered: conditionMet(rule, value, present) };
}

function conditionMet(rule: AnalysisRuleRecord, value: MeasurementValue, present: boolean): boolean {
  const num = typeof value === "number" ? value : NaN;
  switch (rule.operator) {
    case "lessThan":
      return typeof rule.value === "number" && num < rule.value;
    case "lessThanOrEqual":
      return typeof rule.value === "number" && num <= rule.value;
    case "greaterThan":
      return typeof rule.value === "number" && num > rule.value;
    case "greaterThanOrEqual":
      return typeof rule.value === "number" && num >= rule.value;
    case "equals":
      return value === rule.value;
    case "notEquals":
      return present && value !== rule.value;
    case "between":
      return (
        typeof rule.minimum === "number" &&
        typeof rule.maximum === "number" &&
        num >= rule.minimum &&
        num <= rule.maximum
      );
    case "outsideRange":
      return (
        typeof rule.minimum === "number" &&
        typeof rule.maximum === "number" &&
        (num < rule.minimum || num > rule.maximum)
      );
    case "isTrue":
      return value === true;
    case "isFalse":
      return value === false;
    case "isPresent":
      return present;
    case "isMissing":
      return !present;
    default:
      return false;
  }
}
