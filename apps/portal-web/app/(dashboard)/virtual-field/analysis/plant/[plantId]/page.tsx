"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useField,
  useLatestObservation,
  useObservationsByPlant,
  usePlant
} from "@gaia/plant-analysis/react";
import { setPlantStage, updatePlant } from "@gaia/plant-analysis/database";
import { TOMATO_STAGES } from "@gaia/plant-analysis/knowledge/tomato";
import type { GrowthStageKey } from "@gaia/plant-analysis";

const STAGE_LABEL = new Map(TOMATO_STAGES.map((s) => [s.key, s.name] as const));

export default function PlantDetailPage() {
  const { plantId } = useParams<{ plantId: string }>();
  const plant = usePlant(plantId);
  const field = useField(plant?.fieldId);
  const latest = useLatestObservation(plantId);
  const observations = useObservationsByPlant(plantId);

  if (plant === undefined) {
    // Both "still loading" and "deleted" surface as undefined from the live query;
    // for this detail view either way we just wait on a value.
    return <p className="text-sm text-base-content/50">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-3 border-b border-base-content/10 pb-6">
        <Link
          href={`/virtual-field/analysis/field/${plant.fieldId}`}
          className="text-xs text-base-content/50 transition-colors hover:text-base-content/80"
        >
          ← {field?.name ?? "Field"}
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral">{plant.name}</h1>
            <p className="text-sm text-base-content/65">
              Tomato
              {plant.row && plant.column ? ` · Row ${plant.row}, Column ${plant.column}` : ""}
              {plant.status === "archived" ? " · Archived" : ""}
            </p>
          </div>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-xl border border-base-content/10 bg-base-100 p-6">
          <h2 className="text-base font-semibold text-neutral">Details</h2>
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-base-content/55">Growth stage</dt>
            <dd>
              <select
                value={plant.growthStageId ?? ""}
                onChange={(e) => void setPlantStage(plant.id, e.target.value as GrowthStageKey)}
                className="rounded-md border border-base-content/15 bg-base-100 px-2 py-1 text-sm outline-none focus:border-primary/50"
              >
                {TOMATO_STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </select>
            </dd>
            <dt className="text-base-content/55">Planted</dt>
            <dd className="text-neutral">
              {plant.plantedAt ? new Date(plant.plantedAt).toLocaleDateString() : "—"}
            </dd>
            <dt className="text-base-content/55">Observations</dt>
            <dd className="text-neutral">{observations?.length ?? 0}</dd>
            <dt className="text-base-content/55">Status</dt>
            <dd>
              <button
                type="button"
                onClick={() =>
                  void updatePlant(plant.id, {
                    status: plant.status === "archived" ? "active" : "archived"
                  })
                }
                className="rounded-md border border-base-content/15 px-2.5 py-1 text-xs font-semibold text-neutral transition-colors hover:bg-base-content/[0.05]"
              >
                {plant.status === "archived" ? "Restore" : "Archive"}
              </button>
            </dd>
          </dl>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-base-content/10 bg-base-100 p-6">
          <h2 className="text-base font-semibold text-neutral">Latest observation</h2>
          {observations === undefined ? (
            <p className="text-sm text-base-content/50">Loading…</p>
          ) : !latest ? (
            <p className="text-sm text-base-content/60">
              No observations yet. Recording observations and health analysis arrive in the next
              step.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="text-base-content/55">
                {new Date(latest.recordedAt).toLocaleString()}
              </span>
              <ObservationSummary
                pairs={[
                  ["Height", latest.heightCm != null ? `${latest.heightCm} cm` : undefined],
                  ["Leaf color", latest.leafColor],
                  [
                    "Soil moisture",
                    latest.soilMoisturePercent != null
                      ? `${latest.soilMoisturePercent}%`
                      : undefined
                  ],
                  ["Temp", latest.temperatureC != null ? `${latest.temperatureC} °C` : undefined],
                  ["Wilting", latest.wilting ? "yes" : undefined],
                  ["Yellowing", latest.yellowing ? "yes" : undefined]
                ]}
              />
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-6">
        <h2 className="text-base font-semibold text-neutral">Health analysis</h2>
        <p className="max-w-xl text-sm text-base-content/60">
          Rule-based health scores and explainable findings will appear here once observation entry
          and the analysis engine land (PRD Phases 5–8).
        </p>
      </section>
    </div>
  );
}

function ObservationSummary({ pairs }: { pairs: [string, string | undefined][] }) {
  const present = pairs.filter(([, v]) => v != null);
  if (present.length === 0) {
    return <span className="text-base-content/50">No measurements recorded.</span>;
  }
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {present.map(([label, value]) => (
        <span key={label} className="text-neutral">
          <span className="text-base-content/55">{label}:</span> {value}
        </span>
      ))}
    </div>
  );
}
