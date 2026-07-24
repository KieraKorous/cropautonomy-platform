"use client";

import { useObservationsByPlant } from "@gaia/plant-analysis/react";
import type { ObservationRecord } from "@gaia/plant-analysis";

// Observation history, newest first (PRD §10.13). A compact per-observation
// summary of the measurements and symptoms that were recorded.

export function ObservationTimeline({ plantId }: { plantId: string }) {
  const observations = useObservationsByPlant(plantId);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-base-content/10 bg-base-100 p-6">
      <h2 className="text-base font-semibold text-neutral">Observation history</h2>
      {observations === undefined ? (
        <p className="text-sm text-base-content/50">Loading…</p>
      ) : observations.length === 0 ? (
        <p className="text-sm text-base-content/60">No observations recorded yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {observations.map((o) => (
            <li
              key={o.id}
              className="flex flex-col gap-1.5 border-l-2 border-base-content/10 pl-4"
            >
              <span className="text-xs text-base-content/50">
                {new Date(o.recordedAt).toLocaleString()}
              </span>
              <Summary observation={o} />
              {o.notes ? <span className="text-xs text-base-content/60">{o.notes}</span> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Summary({ observation: o }: { observation: ObservationRecord }) {
  const parts: string[] = [];
  if (o.heightCm != null) parts.push(`${o.heightCm} cm`);
  if (o.soilMoisturePercent != null) parts.push(`moisture ${o.soilMoisturePercent}%`);
  if (o.temperatureC != null) parts.push(`${o.temperatureC} °C`);
  if (o.humidityPercent != null) parts.push(`humidity ${o.humidityPercent}%`);
  if (o.leafColor) parts.push(`leaf ${o.leafColor}`);

  const symptoms: string[] = [];
  if (o.wilting) symptoms.push("wilting");
  if (o.leafSpots) symptoms.push("leaf spots");
  if (o.holesInLeaves) symptoms.push("leaf holes");
  if (o.curledLeaves) symptoms.push("curled");
  if (o.browning) symptoms.push("browning");
  if (o.pestObserved) symptoms.push("pest");

  if (parts.length === 0 && symptoms.length === 0) {
    return <span className="text-sm text-base-content/50">No measurements.</span>;
  }
  return (
    <div className="flex flex-col gap-0.5 text-sm text-neutral">
      {parts.length > 0 ? <span>{parts.join(" · ")}</span> : null}
      {symptoms.length > 0 ? (
        <span className="text-base-content/70">Symptoms: {symptoms.join(", ")}</span>
      ) : null}
    </div>
  );
}
