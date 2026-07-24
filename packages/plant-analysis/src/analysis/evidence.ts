import type { AnalysisRuleRecord } from "../types";
import type { MeasurementValue } from "./evaluateRule";

// Human-readable evidence strings for a finding (PRD §10.12). Unit-aware for
// known measurements; falls back to a bare value otherwise. Kept crop-generic —
// the label/unit table is small and additive.

const UNITS: Record<string, string> = {
  soilMoisturePercent: "%",
  humidityPercent: "%",
  temperatureC: " °C",
  soilTemperatureC: " °C",
  heightCm: " cm",
  canopyWidthCm: " cm",
  stemWidthMm: " mm",
  soilPh: ""
};

function unit(measurement: string): string {
  return UNITS[measurement] ?? "";
}

function fmt(measurement: string, value: number | string): string {
  return `${value}${typeof value === "number" ? unit(measurement) : ""}`;
}

/** What was recorded, e.g. "32%", "yellow", "yes". */
export function observedText(rule: AnalysisRuleRecord, value: MeasurementValue): string | undefined {
  if (value === undefined || value === null) {
    return rule.operator === "isMissing" ? "not recorded" : undefined;
  }
  if (typeof value === "boolean") return value ? "yes" : "no";
  return fmt(rule.measurement, value);
}

/** The healthy expectation the rule encodes, e.g. "≥ 45%", "not yellow", "no". */
export function expectedText(rule: AnalysisRuleRecord): string | undefined {
  const u = unit(rule.measurement);
  const v = rule.value;
  switch (rule.operator) {
    case "lessThan":
      return `≥ ${v}${u}`;
    case "lessThanOrEqual":
      return `> ${v}${u}`;
    case "greaterThan":
      return `≤ ${v}${u}`;
    case "greaterThanOrEqual":
      return `< ${v}${u}`;
    case "equals":
      if (typeof v === "boolean") return v ? "no" : "yes";
      return `not ${v}`;
    case "notEquals":
      return `${v}`;
    case "between":
    case "outsideRange":
      return `${rule.minimum}–${rule.maximum}${u}`;
    case "isTrue":
      return "no";
    case "isFalse":
      return "yes";
    case "isPresent":
    case "isMissing":
      return "recorded";
    default:
      return undefined;
  }
}
