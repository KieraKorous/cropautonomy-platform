// Pure roll-up helpers for the Reports page. No React, no I/O — they take the
// data the server already fetched (captures/fields/farms) and window + aggregate
// it for the selected range. Kept separate from ReportsView so the math is easy
// to read and to test. The captures API has no date filter, so all windowing is
// done here over the in-memory batch (see reports/page.tsx CAPTURE_FETCH_LIMIT).

import type {
  CaptureSummary,
  FarmSummary,
  FieldSummary,
  ObservationType,
  Severity
} from "../../../lib/api";
import type { Tone } from "@gaia/ui";

export type Range = "1d" | "7d" | "30d" | "90d";

export const RANGES: { key: Range; label: string; days: number }[] = [
  { key: "1d", label: "1D", days: 1 },
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "90d", label: "90D", days: 90 }
];

const DAY_MS = 24 * 60 * 60 * 1000;

export function rangeDays(range: Range): number {
  return RANGES.find((r) => r.key === range)?.days ?? 7;
}

// The current window is [start, now); the prior window of equal length is
// [prevStart, start) — used for period-over-period deltas and field trends.
export interface Window {
  now: number;
  start: number;
  prevStart: number;
}

export function windowFor(range: Range, now: number = Date.now()): Window {
  const span = rangeDays(range) * DAY_MS;
  return { now, start: now - span, prevStart: now - 2 * span };
}

export interface SplitCaptures {
  current: CaptureSummary[];
  previous: CaptureSummary[];
}

export function splitByWindow(captures: CaptureSummary[], w: Window): SplitCaptures {
  const current: CaptureSummary[] = [];
  const previous: CaptureSummary[] = [];
  for (const c of captures) {
    const t = new Date(c.capturedAt).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= w.start && t < w.now) current.push(c);
    else if (t >= w.prevStart && t < w.start) previous.push(c);
  }
  return { current, previous };
}

// A StatCard.delta describing the change vs. the prior period. More captures /
// findings is good news here, so "up" reads success and a drop reads muted —
// we never paint a quieter week red.
export interface Delta {
  value: string;
  tone: "success" | "warning" | "muted";
}

export function delta(curr: number, prev: number): Delta | undefined {
  const diff = curr - prev;
  if (diff === 0) return { value: "—", tone: "muted" };
  const sign = diff > 0 ? "+" : "−";
  return { value: `${sign}${Math.abs(diff)}`, tone: diff > 0 ? "success" : "muted" };
}

export type Trend = "up" | "down" | "flat";

export interface FieldActivityRow {
  fieldId: string | null;
  fieldName: string;
  farm: string;
  count: number;
  prevCount: number;
  trend: Trend;
}

// Captures this period vs. the prior period, per field. Mirrors the weekly
// report's by-field roll-up, with an Unassigned bucket for capture-less fields.
export function rollupByField(
  split: SplitCaptures,
  fields: FieldSummary[],
  farms: FarmSummary[]
): FieldActivityRow[] {
  const fieldById = new Map(fields.map((f) => [f.id, f]));
  const farmName = new Map(farms.map((f) => [f.id, f.name]));

  const counts = new Map<string, { count: number; prevCount: number }>();
  const bump = (key: string, slot: "count" | "prevCount") => {
    const entry = counts.get(key) ?? { count: 0, prevCount: 0 };
    entry[slot] += 1;
    counts.set(key, entry);
  };
  for (const c of split.current) bump(c.fieldId ?? "__unassigned__", "count");
  for (const c of split.previous) bump(c.fieldId ?? "__unassigned__", "prevCount");

  const rows: FieldActivityRow[] = [];
  for (const [key, { count, prevCount }] of counts) {
    const unassigned = key === "__unassigned__";
    const field = unassigned ? undefined : fieldById.get(key);
    rows.push({
      fieldId: unassigned ? null : key,
      fieldName: unassigned ? "Unassigned" : field?.name ?? "Unknown field",
      farm: field ? farmName.get(field.farmId) ?? "—" : "—",
      count,
      prevCount,
      trend: count > prevCount ? "up" : count < prevCount ? "down" : "flat"
    });
  }
  // Unassigned always sorts last; otherwise most active first.
  return rows.sort((a, b) => {
    if (a.fieldId === null) return 1;
    if (b.fieldId === null) return -1;
    return b.count - a.count;
  });
}

export interface SeverityCounts {
  high: number;
  medium: number;
  low: number;
  unrated: number;
}

export interface FindingRow {
  type: ObservationType;
  label: string;
  total: number;
  severity: SeverityCounts;
}

const OBSERVATION_LABELS: Record<ObservationType, string> = {
  pest: "Pest",
  disease: "Disease",
  weed: "Weed",
  nutrient: "Nutrient",
  irrigation: "Irrigation",
  damage: "Damage",
  growth_stage: "Growth stage",
  other: "Other"
};

export function observationTypeLabel(type: ObservationType): string {
  return OBSERVATION_LABELS[type] ?? type;
}

// Findings = captures the analysis flagged with an observationType. Grouped by
// type, each with its severity mix. Captures with no observationType (a plain
// plant ID, or analysis not yet run) are not findings and are skipped.
export function rollupFindings(captures: CaptureSummary[]): FindingRow[] {
  const byType = new Map<ObservationType, FindingRow>();
  for (const c of captures) {
    if (!c.observationType) continue;
    let row = byType.get(c.observationType);
    if (!row) {
      row = {
        type: c.observationType,
        label: observationTypeLabel(c.observationType),
        total: 0,
        severity: { high: 0, medium: 0, low: 0, unrated: 0 }
      };
      byType.set(c.observationType, row);
    }
    row.total += 1;
    if (c.severity === "high") row.severity.high += 1;
    else if (c.severity === "medium") row.severity.medium += 1;
    else if (c.severity === "low") row.severity.low += 1;
    else row.severity.unrated += 1;
  }
  return Array.from(byType.values()).sort((a, b) => b.total - a.total);
}

export function severityTone(severity: Severity): Tone {
  if (severity === "high") return "accent";
  if (severity === "medium") return "secondary";
  return "muted";
}

export interface ChartBucket {
  label: string;
  count: number;
}

// Captures over time within the current window. 1D buckets by hour (24 bars);
// longer ranges bucket by day. Labels are sparse-friendly — the view decides
// which to render.
export function capturesPerBucket(
  current: CaptureSummary[],
  range: Range,
  now: number = Date.now()
): ChartBucket[] {
  if (range === "1d") {
    const buckets: ChartBucket[] = [];
    const startHour = new Date(now);
    startHour.setMinutes(0, 0, 0);
    const startMs = startHour.getTime() - 23 * 60 * 60 * 1000;
    for (let i = 0; i < 24; i++) {
      const d = new Date(startMs + i * 60 * 60 * 1000);
      buckets.push({ label: `${d.getHours()}:00`, count: 0 });
    }
    for (const c of current) {
      const t = new Date(c.capturedAt).getTime();
      const idx = Math.floor((t - startMs) / (60 * 60 * 1000));
      if (idx >= 0 && idx < 24) buckets[idx].count += 1;
    }
    return buckets;
  }

  const days = rangeDays(range);
  const startDay = new Date(now);
  startDay.setHours(0, 0, 0, 0);
  const startMs = startDay.getTime() - (days - 1) * DAY_MS;
  const buckets: ChartBucket[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startMs + i * DAY_MS);
    buckets.push({
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: 0
    });
  }
  for (const c of current) {
    const t = new Date(c.capturedAt).getTime();
    const idx = Math.floor((t - startMs) / DAY_MS);
    if (idx >= 0 && idx < days) buckets[idx].count += 1;
  }
  return buckets;
}

export function distinctFields(captures: CaptureSummary[]): number {
  const ids = new Set<string>();
  for (const c of captures) if (c.fieldId) ids.add(c.fieldId);
  return ids.size;
}

export function findingsCount(captures: CaptureSummary[]): number {
  return captures.reduce((n, c) => n + (c.observationType ? 1 : 0), 0);
}
