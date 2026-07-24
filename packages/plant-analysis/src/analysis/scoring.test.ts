import { describe, expect, it } from "vitest";
import type { AnalysisRuleRecord, Severity } from "../types";
import { calculateHealthScore } from "./calculateHealthScore";
import { determinePlantStatus } from "./determinePlantStatus";
import type { EvaluatedRule } from "./types";

function ev(severity: Severity, scorePenalty: number): EvaluatedRule {
  return {
    rule: { severity, scorePenalty } as AnalysisRuleRecord
  };
}

describe("calculateHealthScore", () => {
  it("starts at 100 and subtracts penalties", () => {
    expect(calculateHealthScore([])).toBe(100);
    expect(calculateHealthScore([ev("warning", 15), ev("warning", 10)])).toBe(75);
  });

  it("clamps to a floor of 0", () => {
    expect(calculateHealthScore([ev("critical", 80), ev("warning", 40)])).toBe(0);
  });
});

describe("determinePlantStatus", () => {
  it("is insufficient-data when nothing could be evaluated", () => {
    expect(determinePlantStatus(100, [], 0)).toBe("insufficient-data");
  });

  it("maps score bands when there are evaluable measurements", () => {
    expect(determinePlantStatus(90, [], 3)).toBe("healthy");
    expect(determinePlantStatus(70, [ev("warning", 30)], 3)).toBe("attention");
    expect(determinePlantStatus(30, [ev("warning", 70)], 3)).toBe("critical");
  });

  it("never leaves a critical finding under a healthy banner", () => {
    // High score but a critical finding present → at least attention.
    expect(determinePlantStatus(90, [ev("critical", 10)], 3)).toBe("attention");
  });
});
