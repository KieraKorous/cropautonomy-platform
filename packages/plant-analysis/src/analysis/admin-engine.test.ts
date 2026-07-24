import { describe, expect, it } from "vitest";
import { createField } from "../database/repositories/fields";
import { createObservation } from "../database/repositories/observations";
import { createPlant } from "../database/repositories/plants";
import { seedCrop } from "../database/repositories/cropProfiles";
import { createRule, setRuleEnabled } from "../database/repositories/rules";
import { TOMATO_CROP_ID, tomatoSeed } from "../knowledge/crops/tomato/index";
import { analyzePlant } from "./analyzePlant";

async function setup() {
  await seedCrop(tomatoSeed());
  const field = await createField({ name: "F", rows: 1, columns: 1 });
  const plant = await createPlant({
    fieldId: field.id,
    cropProfileId: TOMATO_CROP_ID,
    name: "T1",
    growthStageId: "vegetative",
    status: "active"
  });
  return plant;
}

describe("admin edits reach the engine", () => {
  it("a disabled rule is not evaluated (PRD §12 completion criterion)", async () => {
    const plant = await setup();
    const obs = await createObservation({
      plantId: plant.id,
      fieldId: plant.fieldId,
      recordedAt: new Date().toISOString(),
      source: "manual",
      wilting: true
    });

    const before = await analyzePlant(plant.id, obs.id);
    expect(before.findings.some((f) => f.ruleId === "tomato-wilting")).toBe(true);

    await setRuleEnabled("tomato-wilting", false);

    const obs2 = await createObservation({
      plantId: plant.id,
      fieldId: plant.fieldId,
      recordedAt: new Date().toISOString(),
      source: "manual",
      wilting: true
    });
    const after = await analyzePlant(plant.id, obs2.id);
    expect(after.findings.some((f) => f.ruleId === "tomato-wilting")).toBe(false);
  });

  it("a newly created rule is evaluated", async () => {
    const plant = await setup();
    const created = await createRule(TOMATO_CROP_ID, {
      name: "Acidic soil",
      measurement: "soilPh",
      operator: "lessThan",
      value: 5.5,
      severity: "warning",
      scorePenalty: 10,
      condition: "Acidic soil",
      message: "Soil pH is low.",
      enabled: true
    });

    const obs = await createObservation({
      plantId: plant.id,
      fieldId: plant.fieldId,
      recordedAt: new Date().toISOString(),
      source: "manual",
      soilPh: 5
    });
    const result = await analyzePlant(plant.id, obs.id);
    const finding = result.findings.find((f) => f.ruleId === created.id);
    expect(finding).toBeDefined();
    expect(finding?.observedValue).toBe("5");
    expect(finding?.expectedValue).toBe("≥ 5.5");
  });
});
