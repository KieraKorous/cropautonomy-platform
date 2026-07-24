import { beforeEach, describe, expect, it } from "vitest";
import { createField } from "../database/repositories/fields";
import { createObservation } from "../database/repositories/observations";
import { createPlant } from "../database/repositories/plants";
import { saveImage, listImagesByPlant } from "../database/repositories/images";
import { seedCrop } from "../database/repositories/cropProfiles";
import { deleteAllData } from "../database/repositories/maintenance";
import { listFields } from "../database/repositories/fields";
import { listPlantsByField } from "../database/repositories/plants";
import { listObservationsByPlant } from "../database/repositories/observations";
import { analyzePlant } from "../analysis/analyzePlant";
import { latestResultForPlant } from "../database/repositories/results";
import { TOMATO_CROP_ID, tomatoSeed } from "../knowledge/crops/tomato/index";
import { exportAll, exportField } from "./exportDatabase";
import { importBackup } from "./importDatabase";
import { validateBackup } from "./validateBackup";
import { blobToDataUrl, dataUrlToBlob } from "./blobCodec";
import { EXPORT_FORMAT_VERSION } from "./backupTypes";

async function seedSomeData() {
  await seedCrop(tomatoSeed());
  const field = await createField({ name: "Prototype Field", rows: 2, columns: 2 });
  const plant = await createPlant({
    fieldId: field.id,
    cropProfileId: TOMATO_CROP_ID,
    name: "Tomato 001",
    row: 1,
    column: 1,
    growthStageId: "vegetative",
    status: "active"
  });
  const obs = await createObservation({
    plantId: plant.id,
    fieldId: field.id,
    recordedAt: new Date("2026-07-22T10:00:00Z").toISOString(),
    source: "manual",
    soilMoisturePercent: 32,
    leafColor: "yellow",
    temperatureC: 34,
    wilting: true
  });
  await analyzePlant(plant.id, obs.id);
  return { field, plant, obs };
}

describe("blob codec", () => {
  it("round-trips a blob through a data URL", async () => {
    const original = new Blob([new Uint8Array([1, 2, 3, 250, 128, 0])], { type: "image/jpeg" });
    const restored = dataUrlToBlob(await blobToDataUrl(original));
    expect(restored.type).toBe("image/jpeg");
    expect([...new Uint8Array(await restored.arrayBuffer())]).toEqual([1, 2, 3, 250, 128, 0]);
  });
});

describe("validateBackup", () => {
  it("accepts a well-formed envelope", async () => {
    const env = await exportAll();
    expect(validateBackup(env).ok).toBe(true);
  });

  it("rejects a non-object and a missing-data file", () => {
    expect(validateBackup(null).ok).toBe(false);
    expect(validateBackup({ exportFormatVersion: 1 }).ok).toBe(false);
  });

  it("rejects a newer format version", () => {
    const result = validateBackup({ exportFormatVersion: EXPORT_FORMAT_VERSION + 1, data: {} });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("newer");
  });

  it("rejects a record without a string id", () => {
    const result = validateBackup({
      exportFormatVersion: 1,
      data: { fields: [{ name: "no id" }] }
    });
    expect(result.ok).toBe(false);
  });
});

describe("export → delete → import round-trip", () => {
  it("restores fields, plants, observations and results with relationships intact", async () => {
    const { field, plant } = await seedSomeData();
    const envelope = await exportAll();

    await deleteAllData();
    expect(await listFields()).toHaveLength(0);

    const summary = await importBackup(envelope);
    expect(summary.added).toBeGreaterThan(0);

    const fields = await listFields();
    expect(fields.map((f) => f.id)).toContain(field.id);
    const plants = await listPlantsByField(field.id);
    expect(plants.map((p) => p.id)).toContain(plant.id); // FK preserved
    const obs = await listObservationsByPlant(plant.id);
    expect(obs).toHaveLength(1);
    const result = await latestResultForPlant(plant.id);
    expect(result?.status).toBe("critical"); // finding-bearing result restored
  });

  it("is idempotent — re-importing updates rather than duplicating", async () => {
    const { field } = await seedSomeData();
    const envelope = await exportAll();
    const first = await importBackup(envelope);
    const second = await importBackup(envelope);
    expect(second.added).toBe(0);
    expect(second.updated).toBe(first.updated + first.added);
    expect((await listFields()).filter((f) => f.id === field.id)).toHaveLength(1);
  });
});

describe("exportField", () => {
  it("exports only the chosen field's subtree plus its crop knowledge", async () => {
    const { field, plant } = await seedSomeData();
    const other = await createField({ name: "Other" });
    await createPlant({ fieldId: other.id, cropProfileId: TOMATO_CROP_ID, name: "X", status: "active" });

    const envelope = await exportField(field.id);
    expect(envelope.scope).toBe("field");
    expect(envelope.data.fields).toHaveLength(1);
    expect(envelope.data.plants.map((p) => p.id)).toEqual([plant.id]);
    expect(envelope.data.rules.length).toBeGreaterThan(0); // knowledge included → self-contained
  });
});

describe("image export", () => {
  it("includes images only when requested and round-trips the blob", async () => {
    const { plant } = await seedSomeData();
    const blob = new Blob([new Uint8Array([9, 8, 7])], { type: "image/jpeg" });
    await saveImage({ plantId: plant.id, mimeType: "image/jpeg" }, blob);

    const without = await exportAll({ includeImages: false });
    expect(without.data.images).toBeUndefined();

    const withImages = await exportAll({ includeImages: true });
    expect(withImages.data.images).toHaveLength(1);

    await deleteAllData();
    await importBackup(withImages);
    const restored = await listImagesByPlant(plant.id);
    expect(restored).toHaveLength(1);
    expect([...new Uint8Array(await restored[0].blob.arrayBuffer())]).toEqual([9, 8, 7]);
  });
});
