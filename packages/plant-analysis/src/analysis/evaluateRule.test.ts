import { describe, expect, it } from "vitest";
import type { AnalysisRuleRecord, ObservationRecord, RuleOperator } from "../types";
import { evaluateRule } from "./evaluateRule";

function rule(over: Partial<AnalysisRuleRecord> & { operator: RuleOperator }): AnalysisRuleRecord {
  return {
    id: "r",
    cropId: "tomato",
    name: "r",
    measurement: "soilMoisturePercent",
    severity: "warning",
    scorePenalty: 10,
    condition: "c",
    message: "m",
    enabled: true,
    version: 1,
    createdAt: "",
    updatedAt: "",
    ...over
  };
}

function obs(over: Partial<ObservationRecord>): ObservationRecord {
  return {
    id: "o",
    plantId: "p",
    fieldId: "f",
    recordedAt: "2026-07-22T00:00:00.000Z",
    source: "manual",
    createdAt: "",
    updatedAt: "",
    ...over
  };
}

describe("evaluateRule numeric operators", () => {
  it("lessThan triggers below the threshold", () => {
    const r = rule({ operator: "lessThan", value: 45 });
    expect(evaluateRule(r, obs({ soilMoisturePercent: 32 }))).toEqual({
      applicable: true,
      triggered: true
    });
  });

  it("lessThan does not trigger at or above the threshold", () => {
    const r = rule({ operator: "lessThan", value: 45 });
    expect(evaluateRule(r, obs({ soilMoisturePercent: 45 })).triggered).toBe(false);
    expect(evaluateRule(r, obs({ soilMoisturePercent: 60 })).triggered).toBe(false);
  });

  it("greaterThan triggers above the threshold", () => {
    const r = rule({ operator: "greaterThan", measurement: "temperatureC", value: 32 });
    expect(evaluateRule(r, obs({ temperatureC: 34 })).triggered).toBe(true);
    expect(evaluateRule(r, obs({ temperatureC: 30 })).triggered).toBe(false);
  });

  it("between / outsideRange use minimum+maximum", () => {
    const between = rule({ operator: "between", minimum: 45, maximum: 70 });
    expect(evaluateRule(between, obs({ soilMoisturePercent: 60 })).triggered).toBe(true);
    expect(evaluateRule(between, obs({ soilMoisturePercent: 80 })).triggered).toBe(false);
    const outside = rule({ operator: "outsideRange", minimum: 45, maximum: 70 });
    expect(evaluateRule(outside, obs({ soilMoisturePercent: 80 })).triggered).toBe(true);
    expect(evaluateRule(outside, obs({ soilMoisturePercent: 60 })).triggered).toBe(false);
  });

  it("a missing measurement is not applicable and never triggers", () => {
    const r = rule({ operator: "lessThan", value: 45 });
    expect(evaluateRule(r, obs({}))).toEqual({ applicable: false, triggered: false });
  });
});

describe("evaluateRule boolean + presence + equality operators", () => {
  it("isTrue triggers only on true", () => {
    const r = rule({ operator: "isTrue", measurement: "wilting" });
    expect(evaluateRule(r, obs({ wilting: true }))).toEqual({ applicable: true, triggered: true });
    expect(evaluateRule(r, obs({ wilting: false })).triggered).toBe(false);
    // absent boolean → not applicable (can't confirm the symptom)
    expect(evaluateRule(r, obs({})).applicable).toBe(false);
  });

  it("isMissing is applicable on absence and triggers there", () => {
    const r = rule({ operator: "isMissing", measurement: "soilMoisturePercent" });
    expect(evaluateRule(r, obs({}))).toEqual({ applicable: true, triggered: true });
    expect(evaluateRule(r, obs({ soilMoisturePercent: 50 })).triggered).toBe(false);
  });

  it("equals matches an enum string (leafColor)", () => {
    const r = rule({ operator: "equals", measurement: "leafColor", value: "yellow" });
    expect(evaluateRule(r, obs({ leafColor: "yellow" })).triggered).toBe(true);
    expect(evaluateRule(r, obs({ leafColor: "green" })).triggered).toBe(false);
  });
});
