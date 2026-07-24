"use client";

import { useMemo } from "react";
import { useObservationsByPlant, useRecentAnalyses, useResultsByPlant } from "@gaia/plant-analysis/react";
import {
  daysSinceLastObservation,
  detectRepeatedConditions,
  growthRatePerWeek,
  healthScoreDelta,
  latestDelta,
  measurementSeries,
  type SeriesPoint
} from "@gaia/plant-analysis/history";
import { EChart } from "./EChart";
import { lineOption } from "./lineOption";
import { SEVERITY_DISPLAY } from "./display";
import type { Severity } from "@gaia/plant-analysis";

// Phase 9 / Milestone 3 — plant history & trends. Growth rate, recent changes,
// repeated-condition detection, and the three minimum charts (height, soil
// moisture, health score). Charts render only with ≥ 2 points; otherwise a calm
// "not enough data yet" note keeps the layout intact (PRD §10.15, §17.4).

export function TrendsPanel({ plantId }: { plantId: string }) {
  const observations = useObservationsByPlant(plantId);
  const results = useResultsByPlant(plantId);
  const recent = useRecentAnalyses(plantId, 5);

  const heightPoints = useMemo(() => measurementSeries(observations ?? [], "heightCm"), [observations]);
  const moisturePoints = useMemo(
    () => measurementSeries(observations ?? [], "soilMoisturePercent"),
    [observations]
  );
  const healthPoints = useMemo<SeriesPoint[]>(
    () =>
      (results ?? [])
        .map((r) => ({ t: Date.parse(r.analyzedAt), v: r.healthScore }))
        .sort((a, b) => a.t - b.t),
    [results]
  );

  const growthWeek = growthRatePerWeek(observations ?? []);
  const moistureDelta = latestDelta(observations ?? [], "soilMoisturePercent");
  const scoreDelta = healthScoreDelta(results ?? []);
  const daysSince =
    observations && observations.length > 0 ? daysSinceLastObservation(observations, Date.now()) : null;
  const repeated = detectRepeatedConditions(
    (recent ?? []).map((r) => r.findings.map((f) => ({ ruleId: f.ruleId, condition: f.condition, severity: f.severity }))),
    2
  );

  const loading = observations === undefined || results === undefined;
  const hasAnything = (observations?.length ?? 0) > 0;

  if (loading) return <p className="text-sm text-base-content/50">Loading…</p>;

  if (!hasAnything) {
    return (
      <section className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-6">
        <h2 className="text-base font-semibold text-neutral">Trends</h2>
        <p className="max-w-xl text-sm text-base-content/60">
          Record a few observations over time to see growth, soil moisture, and health-score trends.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-base-content/10 bg-base-100 p-6">
      <h2 className="text-base font-semibold text-neutral">Trends</h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Growth / week" value={growthWeek == null ? "—" : `${round(growthWeek)} cm`} />
        <Stat
          label="Health change"
          value={scoreDelta == null ? "—" : signed(scoreDelta.delta)}
          hint={scoreDelta ? `${scoreDelta.from} → ${scoreDelta.to}` : undefined}
        />
        <Stat
          label="Moisture change"
          value={moistureDelta == null ? "—" : `${signed(moistureDelta.delta)}%`}
          hint={moistureDelta ? `${moistureDelta.from}% → ${moistureDelta.to}%` : undefined}
        />
        <Stat label="Last observation" value={daysSince == null ? "—" : daysSince === 0 ? "Today" : `${daysSince}d ago`} />
      </div>

      {repeated.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border border-base-content/10 p-4">
          <span className="text-xs font-medium text-base-content/70">
            Repeated across recent analyses
          </span>
          <ul className="flex flex-col gap-1.5">
            {repeated.map((c) => (
              <li key={c.ruleId} className="flex items-center gap-2 text-sm text-neutral">
                <span
                  className={`h-2 w-2 rounded-full ${SEVERITY_DISPLAY[c.severity as Severity]?.dot ?? "bg-base-content/40"}`}
                  aria-hidden
                />
                {c.condition}
                <span className="text-xs text-base-content/45">· {c.count}×</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-6">
        <ChartCard title="Plant height" unit=" cm" points={heightPoints} />
        <ChartCard title="Soil moisture" unit="%" points={moisturePoints} yMin={0} yMax={100} />
        <ChartCard
          title="Health score"
          unit=""
          points={healthPoints}
          yMin={0}
          yMax={100}
          refLines={[
            { y: 80, label: "healthy" },
            { y: 60, label: "attention" }
          ]}
        />
      </div>
    </section>
  );
}

function ChartCard({
  title,
  unit,
  points,
  yMin,
  yMax,
  refLines
}: {
  title: string;
  unit: string;
  points: SeriesPoint[];
  yMin?: number;
  yMax?: number;
  refLines?: { y: number; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-base-content/70">{title}</span>
      {points.length < 2 ? (
        <p className="text-xs text-base-content/50">Not enough data yet — needs at least two readings.</p>
      ) : (
        <EChart
          ariaLabel={`${title} over time`}
          option={lineOption({ points, unit, yMin, yMax, refLines })}
          height={200}
        />
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-base-content/50">{label}</span>
      <span className="text-lg font-semibold text-neutral">{value}</span>
      {hint ? <span className="text-[11px] text-base-content/45">{hint}</span> : null}
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}
function signed(n: number): string {
  const r = round(n);
  return r > 0 ? `+${r}` : `${r}`;
}
