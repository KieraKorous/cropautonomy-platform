"use client";

import { useState } from "react";

// Runtime DB access goes through dynamic import() inside handlers so the
// browser-only Dexie module never loads during SSR. Types are erased at compile
// time, so a type-only import stays SSR-safe.
async function db() {
  return import("@gaia/plant-analysis/database");
}
async function tomato() {
  return import("@gaia/plant-analysis/knowledge/tomato");
}

export function SmokeClient() {
  const [output, setOutput] = useState<string>("");
  const [busy, setBusy] = useState(false);

  function show(label: string, data: unknown) {
    setOutput(`// ${label} @ ${new Date().toLocaleTimeString()}\n${JSON.stringify(data, null, 2)}`);
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setOutput(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const onSeed = () =>
    run(async () => {
      const { seedCrop, createField, createPlant, createObservation } = await db();
      const { tomatoSeed, TOMATO_CROP_ID } = await tomato();

      await seedCrop(tomatoSeed());

      const field = await createField({ name: "Prototype Field", rows: 4, columns: 4 });
      const plant = await createPlant({
        fieldId: field.id,
        cropProfileId: TOMATO_CROP_ID,
        name: "Tomato 001",
        row: 1,
        column: 1,
        growthStageId: "vegetative",
        status: "active"
      });
      // Mirrors the PRD §33 prototype observation.
      const obs = await createObservation({
        plantId: plant.id,
        fieldId: field.id,
        recordedAt: new Date().toISOString(),
        source: "manual",
        heightCm: 24,
        leafColor: "yellow",
        soilMoisturePercent: 32,
        temperatureC: 34,
        wilting: true,
        yellowing: true,
        holesInLeaves: false
      });
      show("seeded", { field, plant, observation: obs });
    });

  const onRead = () =>
    run(async () => {
      const {
        listFields,
        listPlantsByField,
        listObservationsByPlant,
        latestObservationForPlant,
        getCropProfile,
        listGrowthStages,
        listEnabledRules
      } = await db();
      const { TOMATO_CROP_ID } = await tomato();

      const fields = await listFields();
      const tree = [];
      for (const f of fields) {
        const plants = await listPlantsByField(f.id);
        const withObs = [];
        for (const p of plants) {
          withObs.push({
            plant: p,
            observations: await listObservationsByPlant(p.id),
            latest: await latestObservationForPlant(p.id)
          });
        }
        tree.push({ field: f, plants: withObs });
      }
      show("read", {
        fieldCount: fields.length,
        knowledge: {
          profile: await getCropProfile(TOMATO_CROP_ID),
          stageCount: (await listGrowthStages(TOMATO_CROP_ID)).length,
          enabledRuleCount: (await listEnabledRules(TOMATO_CROP_ID)).length
        },
        tree
      });
    });

  const onClear = () =>
    run(async () => {
      const { getDb } = await db();
      const instance = getDb();
      await Promise.all(instance.tables.map((t) => t.clear()));
      show("cleared", { tables: instance.tables.map((t) => t.name) });
    });

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <button className="btn btn-primary btn-sm" onClick={onSeed} disabled={busy}>
          Seed
        </button>
        <button className="btn btn-sm" onClick={onRead} disabled={busy}>
          Read
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onClear} disabled={busy}>
          Clear
        </button>
      </div>
      <pre className="mt-4 max-h-[60vh] overflow-auto rounded-lg bg-base-300 p-4 text-xs">
        {output || "Click Seed, then Read. Then hard-refresh and Read again."}
      </pre>
    </div>
  );
}
