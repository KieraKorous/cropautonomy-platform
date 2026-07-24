import { describe, expect, it } from "vitest";
import type { ObservationRecord } from "../types";
import {
  daysSinceLastObservation,
  detectRepeatedConditions,
  growthRatePerDay,
  growthRatePerWeek,
  healthScoreDelta,
  latestDelta,
  measurementSeries
} from "./trends";

function obs(recordedAt: string, over: Partial<ObservationRecord>): ObservationRecord {
  return {
    id: recordedAt,
    plantId: "p",
    fieldId: "f",
    recordedAt,
    source: "manual",
    createdAt: "",
    updatedAt: "",
    ...over
  };
}

const DAY = "2026-07-";

describe("measurementSeries", () => {
  it("returns ascending points and skips absent/non-numeric values", () => {
    const series = measurementSeries(
      [
        obs(`${DAY}10T00:00:00Z`, { heightCm: 10 }),
        obs(`${DAY}20T00:00:00Z`, { heightCm: 30 }),
        obs(`${DAY}15T00:00:00Z`, {}), // no height → skipped
        obs(`${DAY}12T00:00:00Z`, { heightCm: 18 })
      ],
      "heightCm"
    );
    expect(series.map((p) => p.v)).toEqual([10, 18, 30]); // sorted by time, gap dropped
  });
});

describe("growth rate", () => {
  it("computes cm/day and cm/week from first→last height", () => {
    const observations = [
      obs(`${DAY}10T00:00:00Z`, { heightCm: 10 }),
      obs(`${DAY}20T00:00:00Z`, { heightCm: 30 })
    ];
    expect(growthRatePerDay(observations)).toBeCloseTo(2, 5); // 20cm / 10 days
    expect(growthRatePerWeek(observations)).toBeCloseTo(14, 5);
  });

  it("is null with fewer than two height readings", () => {
    expect(growthRatePerDay([obs(`${DAY}10T00:00:00Z`, { heightCm: 10 })])).toBeNull();
  });
});

describe("latestDelta", () => {
  it("is the change between the last two readings that carry the field", () => {
    const d = latestDelta(
      [
        obs(`${DAY}10T00:00:00Z`, { soilMoisturePercent: 60 }),
        obs(`${DAY}12T00:00:00Z`, { soilMoisturePercent: 45 }),
        obs(`${DAY}14T00:00:00Z`, { soilMoisturePercent: 30 })
      ],
      "soilMoisturePercent"
    );
    expect(d).toEqual({ from: 45, to: 30, delta: -15 });
  });
});

describe("healthScoreDelta", () => {
  it("compares the two most recent results regardless of input order", () => {
    const d = healthScoreDelta([
      { analyzedAt: `${DAY}14T00:00:00Z`, healthScore: 35 },
      { analyzedAt: `${DAY}10T00:00:00Z`, healthScore: 80 },
      { analyzedAt: `${DAY}12T00:00:00Z`, healthScore: 65 }
    ]);
    expect(d).toEqual({ from: 65, to: 35, delta: -30 });
  });
});

describe("daysSinceLastObservation", () => {
  it("floors whole days since the newest observation", () => {
    const now = Date.parse(`${DAY}20T00:00:00Z`);
    const days = daysSinceLastObservation([obs(`${DAY}17T12:00:00Z`, {})], now);
    expect(days).toBe(2); // 2.5 days floored
  });
});

describe("detectRepeatedConditions", () => {
  it("flags conditions present in minCount+ of the recent results, most-frequent first", () => {
    const sets = [
      [{ ruleId: "tomato-wilting", condition: "Wilting detected", severity: "critical" }],
      [
        { ruleId: "tomato-wilting", condition: "Wilting detected", severity: "critical" },
        { ruleId: "tomato-low-moisture", condition: "Possible underwatering", severity: "warning" }
      ],
      [{ ruleId: "tomato-wilting", condition: "Wilting detected", severity: "critical" }]
    ];
    const repeated = detectRepeatedConditions(sets, 2);
    expect(repeated).toHaveLength(1);
    expect(repeated[0]).toMatchObject({ ruleId: "tomato-wilting", count: 3 });
  });

  it("counts a rule at most once per result", () => {
    const sets = [
      [
        { ruleId: "r", condition: "c", severity: "warning" },
        { ruleId: "r", condition: "c", severity: "warning" }
      ]
    ];
    expect(detectRepeatedConditions(sets, 2)).toHaveLength(0); // only 1 result → count 1
  });
});
