import { beforeEach, describe, expect, it } from "vitest";
import { createField } from "../database/repositories/fields";
import { createObservation } from "../database/repositories/observations";
import { createPlant } from "../database/repositories/plants";
import { listFindingsByResult } from "../database/repositories/findings";
import { latestResultForPlant } from "../database/repositories/results";
import { seedCrop } from "../database/repositories/cropProfiles";
import { TOMATO_CROP_ID, tomatoSeed } from "../knowledge/crops/tomato/index";
import type { PlantRecord } from "../types";
import { analyzePlant } from "./analyzePlant";

async function tomatoPlant(stage: PlantRecord["growthStageId"] = "vegetative") {
  await seedCrop(tomatoSeed());
  const field = await createField({ name: "Prototype Field", rows: 4, columns: 4 });
  return createPlant({
    fieldId: field.id,
    cropProfileId: TOMATO_CROP_ID,
    name: "Tomato 001",
    growthStageId: stage,
    status: "active"
  });
}

describe("analyzePlant", () => {
  beforeEach(async () => {
    // Fresh DB per test is handled by test/setup.ts afterEach; nothing to do here.
  });

  it("reproduces the PRD §33 prototype: moisture 32, yellow, 34 °C, wilting → Critical", async () => {
    const plant = await tomatoPlant("vegetative");
    const observation = await createObservation({
      plantId: plant.id,
      fieldId: plant.fieldId,
      recordedAt: new Date("2026-07-22T10:00:00Z").toISOString(),
      source: "manual",
      heightCm: 24,
      soilMoisturePercent: 32,
      leafColor: "yellow",
      temperatureC: 34,
      wilting: true,
      holesInLeaves: false
    });

    const { result, findings } = await analyzePlant(plant.id, observation.id);

    expect(result.status).toBe("critical");
    expect(result.healthScore).toBe(35); // 100 − 15 − 15 − 15 − 20
    expect(findings).toHaveLength(4);

    const byRule = new Map(findings.map((f) => [f.ruleId, f]));
    expect(byRule.has("tomato-low-moisture")).toBe(true);
    expect(byRule.has("tomato-leaf-yellow")).toBe(true);
    expect(byRule.has("tomato-high-temp")).toBe(true);
    expect(byRule.get("tomato-wilting")?.severity).toBe("critical");

    // Evidence + rule snapshot are captured on the finding.
    const moisture = byRule.get("tomato-low-moisture")!;
    expect(moisture.observedValue).toBe("32%");
    expect(moisture.expectedValue).toBe("≥ 45%");
    expect(moisture.ruleVersion).toBe(1);

    // Persisted and retrievable.
    const latest = await latestResultForPlant(plant.id);
    expect(latest?.id).toBe(result.id);
    const stored = await listFindingsByResult(result.id);
    expect(stored).toHaveLength(4);
    // Critical-first ordering from the findings repository.
    expect(stored[0].severity).toBe("critical");
  });

  it("returns insufficient-data when no measurements are provided", async () => {
    const plant = await tomatoPlant();
    const observation = await createObservation({
      plantId: plant.id,
      fieldId: plant.fieldId,
      recordedAt: new Date().toISOString(),
      source: "manual",
      notes: "just a note"
    });
    const { result, findings } = await analyzePlant(plant.id, observation.id);
    expect(result.status).toBe("insufficient-data");
    expect(result.healthScore).toBe(100);
    expect(findings).toHaveLength(0);
  });

  it("returns healthy for an in-range observation", async () => {
    const plant = await tomatoPlant();
    const observation = await createObservation({
      plantId: plant.id,
      fieldId: plant.fieldId,
      recordedAt: new Date().toISOString(),
      source: "manual",
      soilMoisturePercent: 60,
      temperatureC: 24,
      humidityPercent: 60,
      leafColor: "green",
      wilting: false,
      leafSpots: false,
      pestObserved: false
    });
    const { result, findings } = await analyzePlant(plant.id, observation.id);
    expect(result.status).toBe("healthy");
    expect(result.healthScore).toBe(100);
    expect(findings).toHaveLength(0);
    expect(result.cropProfileVersion).toBe(2);
  });
});
