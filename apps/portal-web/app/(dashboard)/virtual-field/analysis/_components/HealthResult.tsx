"use client";

import { useMemo } from "react";
import { useFindings, useLatestResult, useSources } from "@gaia/plant-analysis/react";
import type { AnalysisResultRecord, FindingRecord } from "@gaia/plant-analysis";
import { SEVERITY_DISPLAY, STATUS_DISPLAY } from "./display";

// Phase 8 — explainable results. Shows the latest analysis: status, score, and
// every finding with its evidence, recommended next check, and source. Critical
// findings sort first (the findings repo already orders them). Language stays
// responsible (PRD §10.9) — the copy comes from the rules, which never assert a
// definitive diagnosis.

export function HealthResult({ plantId, cropId }: { plantId: string; cropId: string }) {
  const result = useLatestResult(plantId);
  const findings = useFindings(result?.id);
  const sources = useSources(cropId);

  const sourceTitles = useMemo(
    () => new Map((sources ?? []).map((s) => [s.id, s.title] as const)),
    [sources]
  );

  if (result === undefined) {
    return <p className="text-sm text-base-content/50">Loading…</p>;
  }
  if (!result) {
    return (
      <section className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-6">
        <h2 className="text-base font-semibold text-neutral">Health analysis</h2>
        <p className="max-w-xl text-sm text-base-content/60">
          No analysis yet. Record an observation to generate an explainable, rule-based result.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-base-content/10 bg-base-100 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-neutral">Health analysis</h2>
          <span className="text-xs text-base-content/50">
            Analyzed {new Date(result.analyzedAt).toLocaleString()}
          </span>
        </div>
        <ResultHeader result={result} />
      </div>

      {findings === undefined ? null : findings.length === 0 ? (
        <p className="text-sm text-base-content/60">
          {result.status === "insufficient-data"
            ? "Not enough measurements to evaluate. Record more of the observation fields."
            : "No conditions were triggered — nothing needs attention from this observation."}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {findings.map((f) => (
            <li key={f.id}>
              <FindingCard finding={f} sourceTitle={f.sourceId ? sourceTitles.get(f.sourceId) : undefined} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ResultHeader({ result }: { result: AnalysisResultRecord }) {
  const status = STATUS_DISPLAY[result.status];
  return (
    <div className="flex items-center gap-5">
      <span className="inline-flex items-center gap-2 text-sm font-medium text-neutral">
        <span className={`h-2 w-2 rounded-full ${status.dot}`} aria-hidden />
        {status.label}
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-neutral">
          <span className="text-lg font-semibold">{result.healthScore}</span>
          <span className="text-base-content/50"> / 100</span>
        </span>
        <div className="h-1 w-24 overflow-hidden rounded-full bg-base-content/10">
          <div className="h-full rounded-full bg-primary" style={{ width: `${result.healthScore}%` }} />
        </div>
      </div>
    </div>
  );
}

function FindingCard({ finding, sourceTitle }: { finding: FindingRecord; sourceTitle?: string }) {
  const sev = SEVERITY_DISPLAY[finding.severity];
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-base-content/10 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${sev.dot}`} aria-hidden />
        <span className="text-sm font-semibold text-neutral">{finding.condition}</span>
        <span className="text-xs text-base-content/45">· {sev.label}</span>
        {finding.provisional ? (
          <span className="rounded-full bg-base-content/5 px-2 py-0.5 text-[11px] text-base-content/55">
            Provisional
          </span>
        ) : null}
      </div>

      <p className="text-sm text-base-content/75">{finding.message}</p>

      {finding.observedValue || finding.expectedValue ? (
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
          {finding.observedValue ? (
            <div className="flex gap-1.5">
              <dt className="text-base-content/50">Observed</dt>
              <dd className="font-medium text-neutral">{finding.observedValue}</dd>
            </div>
          ) : null}
          {finding.expectedValue ? (
            <div className="flex gap-1.5">
              <dt className="text-base-content/50">Expected</dt>
              <dd className="font-medium text-neutral">{finding.expectedValue}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {finding.recommendation ? (
        <p className="text-xs text-base-content/60">
          <span className="text-base-content/45">Recommended next check: </span>
          {finding.recommendation}
        </p>
      ) : null}

      {sourceTitle ? (
        <p className="text-[11px] text-base-content/40">Source: {sourceTitle}</p>
      ) : null}
    </div>
  );
}
