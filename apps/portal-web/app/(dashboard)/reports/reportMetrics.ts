// Pure roll-up helpers for the Reports page. No React, no I/O — they take the
// captures the server already fetched and window + aggregate them for the
// selected range. The captures API has no date filter, so all windowing is done
// here over the in-memory batch (see reports/page.tsx CAPTURE_FETCH_LIMIT).
//
// Reports are built on the capture columns that are actually populated today:
// the upload time, status, and the analysis-inferred plant species (plantType /
// commonName). fieldId, observationType, and severity are null across the
// current data, so per-field and findings breakdowns aren't surfaced here yet.

import type { CaptureSummary } from "../../../lib/api";

// The axis the report windows on: when the capture landed in the system. This
// is robust to old source-file dates — file/gallery uploads stamp capturedAt
// from the photo's lastModified (which can be weeks old), but uploadedAt is
// always "when we received it". Falls back to capturedAt for an upload still in
// flight (uploadedAt null). Returns NaN if neither parses.
export function captureTime(c: CaptureSummary): number {
  const t = new Date(c.uploadedAt ?? c.capturedAt).getTime();
  return t;
}

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

// The current window is [start, now).
export interface Window {
  now: number;
  start: number;
}

export function windowFor(range: Range, now: number = Date.now()): Window {
  return { now, start: now - rangeDays(range) * DAY_MS };
}

// Captures whose upload time falls in the current window.
export function inWindow(captures: CaptureSummary[], w: Window): CaptureSummary[] {
  return captures.filter((c) => {
    const t = captureTime(c);
    return !Number.isNaN(t) && t >= w.start && t < w.now;
  });
}

export interface ChartBucket {
  label: string;
  count: number;
}

// Captures over time within the current window. 1D buckets by hour (24 bars);
// longer ranges bucket by day. The view decides which labels to render.
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
      const idx = Math.floor((captureTime(c) - startMs) / (60 * 60 * 1000));
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
    const idx = Math.floor((captureTime(c) - startMs) / DAY_MS);
    if (idx >= 0 && idx < days) buckets[idx].count += 1;
  }
  return buckets;
}

// Distinct plant species identified by the analysis (non-null plantType).
export function distinctSpecies(captures: CaptureSummary[]): number {
  const set = new Set<string>();
  for (const c of captures) if (c.plantType) set.add(c.plantType);
  return set.size;
}

export function analyzedCount(captures: CaptureSummary[]): number {
  return captures.reduce((n, c) => n + (c.status === "analyzed" ? 1 : 0), 0);
}

export interface SpeciesRow {
  // The scientific name (plantType); null = the analysis didn't identify it.
  species: string | null;
  commonName: string | null;
  count: number;
}

// What the analysis identified across the period, grouped by species. Captures
// with no species fold into a single "Unidentified" row that always sorts last.
export function rollupSpecies(captures: CaptureSummary[]): SpeciesRow[] {
  const byKey = new Map<string, SpeciesRow>();
  for (const c of captures) {
    const key = c.plantType ?? "__none__";
    let row = byKey.get(key);
    if (!row) {
      row = { species: c.plantType, commonName: c.commonName, count: 0 };
      byKey.set(key, row);
    }
    row.count += 1;
    if (!row.commonName && c.commonName) row.commonName = c.commonName;
  }
  return Array.from(byKey.values()).sort((a, b) => {
    if (a.species === null) return 1;
    if (b.species === null) return -1;
    return b.count - a.count;
  });
}
