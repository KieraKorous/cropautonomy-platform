import type { ObservationRecord } from "../types";

// Pure trend calculations over a plant's history (PRD §10.14). No database
// dependency — the caller passes the records (from the live-query hooks) and
// these functions sort/derive. Order-agnostic inputs: everything sorts by
// timestamp internally.

export interface SeriesPoint {
  /** epoch ms */
  t: number;
  v: number;
}

/** Chronological (ascending) points for one numeric observation field, skipping absent values. */
export function measurementSeries(
  observations: ObservationRecord[],
  field: keyof ObservationRecord
): SeriesPoint[] {
  return observations
    .map((o) => ({ t: Date.parse(o.recordedAt), v: o[field] }))
    .filter((p): p is SeriesPoint => typeof p.v === "number" && Number.isFinite(p.v) && !Number.isNaN(p.t))
    .sort((a, b) => a.t - b.t);
}

/** Overall growth rate in cm/day from the first to the last height reading. */
export function growthRatePerDay(observations: ObservationRecord[]): number | null {
  const pts = measurementSeries(observations, "heightCm");
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const days = (last.t - first.t) / 86_400_000;
  if (days <= 0) return null;
  return (last.v - first.v) / days;
}

export function growthRatePerWeek(observations: ObservationRecord[]): number | null {
  const perDay = growthRatePerDay(observations);
  return perDay == null ? null : perDay * 7;
}

export interface Delta {
  from: number;
  to: number;
  delta: number;
}

/** Change in a measurement between the two most recent observations that carry it. */
export function latestDelta(
  observations: ObservationRecord[],
  field: keyof ObservationRecord
): Delta | null {
  const pts = measurementSeries(observations, field);
  if (pts.length < 2) return null;
  const to = pts[pts.length - 1].v;
  const from = pts[pts.length - 2].v;
  return { from, to, delta: to - from };
}

/** Change in health score between the two most recent results. `results` in any order. */
export function healthScoreDelta(
  results: { analyzedAt: string; healthScore: number }[]
): Delta | null {
  const sorted = [...results].sort((a, b) => Date.parse(a.analyzedAt) - Date.parse(b.analyzedAt));
  if (sorted.length < 2) return null;
  const to = sorted[sorted.length - 1].healthScore;
  const from = sorted[sorted.length - 2].healthScore;
  return { from, to, delta: to - from };
}

/** Whole days since the most recent observation (floored), or null if none. */
export function daysSinceLastObservation(
  observations: ObservationRecord[],
  nowMs: number
): number | null {
  if (observations.length === 0) return null;
  const latest = Math.max(...observations.map((o) => Date.parse(o.recordedAt)).filter((n) => !Number.isNaN(n)));
  if (!Number.isFinite(latest)) return null;
  return Math.max(0, Math.floor((nowMs - latest) / 86_400_000));
}

export interface RepeatedCondition {
  ruleId: string;
  condition: string;
  severity: string;
  count: number;
}

/**
 * Conditions that recur across recent analyses (PRD §10.14 — repeated-warning
 * detection). Input is one finding list per result (already windowed to the
 * recent N by the caller). A condition present in `minCount`+ of them is flagged,
 * sorted most-frequent first.
 */
export function detectRepeatedConditions(
  findingSets: { ruleId: string; condition: string; severity: string }[][],
  minCount = 2
): RepeatedCondition[] {
  const counts = new Map<string, RepeatedCondition>();
  for (const set of findingSets) {
    // Count a ruleId at most once per result.
    const seen = new Set<string>();
    for (const f of set) {
      if (seen.has(f.ruleId)) continue;
      seen.add(f.ruleId);
      const existing = counts.get(f.ruleId);
      if (existing) existing.count += 1;
      else counts.set(f.ruleId, { ruleId: f.ruleId, condition: f.condition, severity: f.severity, count: 1 });
    }
  }
  return [...counts.values()]
    .filter((c) => c.count >= minCount)
    .sort((a, b) => b.count - a.count);
}
