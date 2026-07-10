"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { channels } from "@gaia/realtime/channels";
import { useRealtimeChannel } from "@gaia/realtime/client";
import { GridIcon, RowsIcon } from "@gaia/ui";
import type { CaptureStatus, CaptureSummary, TeamSummary } from "../../../lib/api";
import { CaptureRow } from "./CaptureRow";
import { CaptureCard } from "./CaptureCard";
import { CaptureDetailModal } from "./CaptureDetailModal";
import { isConcern, severityRank } from "./captureDisplay";

type ViewMode = "table" | "grid";
const STORAGE_KEY = "captures.viewMode";

type SortKey = "date" | "plant" | "status" | "severity" | "capturedBy" | "farm" | "field";
type SortDir = "asc" | "desc";

// Non-terminal statuses: a capture here is still moving through the pipeline, so
// its row should keep updating. Used to decide whether to keep the fallback poll
// running (below) when a realtime status event is missed.
const IN_FLIGHT_STATUSES: ReadonlySet<CaptureStatus> = new Set<CaptureStatus>([
  "pending_upload",
  "uploading",
  "uploaded",
  "analysis_queued",
  "analysis_running"
]);

// Pipeline order so sorting by status groups captures by where they are in the
// flow, rather than alphabetically. Mirrors the CaptureStatus union in lib/api.
const STATUS_ORDER: Record<CaptureStatus, number> = {
  pending_upload: 0,
  uploading: 1,
  uploaded: 2,
  analysis_queued: 3,
  analysis_running: 4,
  analyzed: 5,
  failed: 6
};

// First-click direction per column: dates + severity default high/newest-first,
// the name columns A→Z.
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  date: "desc",
  plant: "asc",
  status: "asc",
  severity: "desc",
  capturedBy: "asc",
  farm: "asc",
  field: "asc"
};

const capturedTime = (c: CaptureSummary) => new Date(c.uploadedAt ?? c.capturedAt).getTime();

// Shared null-sinks-to-bottom compare for the name columns: a missing value
// always sorts last regardless of direction (the outer factor doesn't flip it,
// because the caller only multiplies non-null comparisons — see `sorted`).
function compareNullableText(a: string | null, b: string | null): number {
  if (a == null || b == null) {
    if (a == null && b == null) return 0;
    return a == null ? 1 : -1;
  }
  return a.localeCompare(b);
}

function compareCaptures(a: CaptureSummary, b: CaptureSummary, key: SortKey): number {
  switch (key) {
    case "date":
      return capturedTime(a) - capturedTime(b);
    case "plant":
      return compareNullableText(a.plantType, b.plantType);
    case "status":
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    case "severity":
      return severityRank(a.severity) - severityRank(b.severity);
    case "capturedBy":
      return compareNullableText(a.capturedByName, b.capturedByName);
    case "farm":
      return compareNullableText(a.farmName, b.farmName);
    case "field":
      return compareNullableText(a.fieldName, b.fieldName);
  }
}

// Owns the table/grid toggle and remembers the choice in localStorage. The
// captures themselves are fetched on the server and passed in, so switching
// views never re-hits the API. Subscribes to the org-wide capture feed and
// re-runs the server fetch (router.refresh) when captures appear or change
// status, so the list stays live without a manual refresh.
export function CapturesView({
  captures,
  orgId,
  teams,
  canAssignTeams
}: {
  captures: CaptureSummary[];
  orgId: string;
  teams: TeamSummary[];
  canAssignTeams: boolean;
}) {
  const router = useRouter();

  // Live capture feed: a new photo finalizing, or a capture finishing analysis,
  // publishes capture.changed on this channel. We debounce so a burst (a session
  // uploading many photos at once) coalesces into a single refresh.
  const { latest } = useRealtimeChannel(channels.orgCaptures(orgId), {
    historyLimit: 1,
    enabled: Boolean(orgId)
  });
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!latest || latest.type !== "capture.changed") return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 400);
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [latest, router]);

  // Fallback poll so status stays live even if a worker realtime event is missed
  // (transport hiccup, or the worker publishing while no browser is subscribed).
  // Only runs while something is still in-flight, and stops once every capture
  // has reached a terminal status — so an idle, fully-analyzed list never polls.
  const hasInFlight = useMemo(
    () => captures.some((c) => IN_FLIGHT_STATUSES.has(c.status)),
    [captures]
  );
  useEffect(() => {
    if (!hasInFlight) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [hasInFlight, router]);

  // Start on table for a stable first paint, then hydrate from localStorage so
  // SSR and the first client render agree (avoids a hydration mismatch).
  const [view, setView] = useState<ViewMode>("table");

  // Default newest-first, matching how the API already returns captures.
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "date", dir: "desc" });

  // Client-side filters over the loaded set (the server already team-scopes the
  // fetch). "Concerns only" is the concern tab: medium/high severity captures.
  const [concernsOnly, setConcernsOnly] = useState(false);
  const [farmFilter, setFarmFilter] = useState<string>("");
  const [fieldFilter, setFieldFilter] = useState<string>("");
  const [capturedByFilter, setCapturedByFilter] = useState<string>("");

  // Dropdown options derived from what's actually in the loaded set, sorted A→Z.
  const farmOptions = useMemo(() => uniqueSorted(captures.map((c) => c.farmName)), [captures]);
  const fieldOptions = useMemo(() => uniqueSorted(captures.map((c) => c.fieldName)), [captures]);
  const capturedByOptions = useMemo(
    () => uniqueSorted(captures.map((c) => c.capturedByName)),
    [captures]
  );
  const concernCount = useMemo(() => captures.filter((c) => isConcern(c.severity)).length, [captures]);

  const filtered = useMemo(
    () =>
      captures.filter((c) => {
        if (concernsOnly && !isConcern(c.severity)) return false;
        if (farmFilter && c.farmName !== farmFilter) return false;
        if (fieldFilter && c.fieldName !== fieldFilter) return false;
        if (capturedByFilter && c.capturedByName !== capturedByFilter) return false;
        return true;
      }),
    [captures, concernsOnly, farmFilter, fieldFilter, capturedByFilter]
  );

  // Index into `sorted` of the capture open in the detail lightbox; null = closed.
  // Index-based (not id-based) so prev/next is a plain ±1 walk. Re-sorting while
  // open keeps the position in-bounds but may land on a different capture — fine
  // for v1.
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "grid" || saved === "table") setView(saved);
  }, []);

  const choose = (next: ViewMode) => {
    setView(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  // Clicking the active column flips direction; a new column starts at its
  // natural default. Two-state toggle — no third "unsorted" state.
  const onSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: DEFAULT_DIR[key] }
    );

  // Sorted copy feeds both views, so grid order follows the table's sort too.
  const sorted = useMemo(() => {
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => factor * compareCaptures(a, b, sort.key));
  }, [filtered, sort]);

  const toggle = (
    <div
      className="inline-flex items-center gap-1 rounded-lg border border-base-content/10 bg-base-100 p-0.5"
      role="group"
      aria-label="Captures view"
    >
      <ToggleButton active={view === "table"} onClick={() => choose("table")} label="Table view">
        <RowsIcon size={15} />
        Table
      </ToggleButton>
      <ToggleButton active={view === "grid"} onClick={() => choose("grid")} label="Grid view">
        <GridIcon size={15} />
        Grid
      </ToggleButton>
    </div>
  );

  const hasActiveFilter =
    concernsOnly || Boolean(farmFilter) || Boolean(fieldFilter) || Boolean(capturedByFilter);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setConcernsOnly((v) => !v)}
          aria-pressed={concernsOnly}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
            concernsOnly
              ? "border-error/30 bg-error/15 text-error"
              : "border-base-content/10 bg-base-100 text-base-content/70 hover:text-neutral"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${concernsOnly ? "bg-error" : "bg-error/60"}`} />
          Concerns only
          {concernCount > 0 ? (
            <span className="rounded-full bg-error/20 px-1.5 text-[0.65rem] leading-4">
              {concernCount}
            </span>
          ) : null}
        </button>

        <FilterSelect
          label="Farm"
          value={farmFilter}
          options={farmOptions}
          onChange={setFarmFilter}
        />
        <FilterSelect
          label="Field"
          value={fieldFilter}
          options={fieldOptions}
          onChange={setFieldFilter}
        />
        <FilterSelect
          label="Captured by"
          value={capturedByFilter}
          options={capturedByOptions}
          onChange={setCapturedByFilter}
        />

        {hasActiveFilter ? (
          <button
            type="button"
            onClick={() => {
              setConcernsOnly(false);
              setFarmFilter("");
              setFieldFilter("");
              setCapturedByFilter("");
            }}
            className="text-xs font-medium text-base-content/55 underline-offset-2 hover:text-neutral hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {view === "table" ? (
        <div className="overflow-x-auto rounded-xl border border-base-content/10 bg-base-100">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-base-content/[0.03] text-xs uppercase tracking-wide text-base-content/55">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  <span className="sr-only">Preview</span>
                </th>
                <SortHeader label="Date Captured" sortKey="date" sort={sort} onSort={onSort} />
                <SortHeader label="Plant Type" sortKey="plant" sort={sort} onSort={onSort} />
                <SortHeader label="Status" sortKey="status" sort={sort} onSort={onSort} />
                <SortHeader label="Severity" sortKey="severity" sort={sort} onSort={onSort} />
                <SortHeader label="Captured By" sortKey="capturedBy" sort={sort} onSort={onSort} />
                <SortHeader label="Farm" sortKey="farm" sort={sort} onSort={onSort} />
                <SortHeader label="Field" sortKey="field" sort={sort} onSort={onSort} />
                <th scope="col" className="px-3 py-1.5 font-medium">
                  <div className="flex justify-end">{toggle}</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center">
                    <EmptyMessage filtered={hasActiveFilter} />
                  </td>
                </tr>
              ) : (
                sorted.map((capture, i) => (
                  <CaptureRow capture={capture} key={capture.id} onOpen={() => setSelectedIndex(i)} />
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-base-content/10 bg-base-100">
          <div className="flex items-center justify-end bg-base-content/[0.03] px-3 py-1.5">
            {toggle}
          </div>
          {sorted.length === 0 ? (
            <div className="px-6 py-12">
              <EmptyMessage filtered={hasActiveFilter} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {sorted.map((capture, i) => (
                <CaptureCard capture={capture} key={capture.id} onOpen={() => setSelectedIndex(i)} />
              ))}
            </div>
          )}
        </div>
      )}

      <CaptureDetailModal
        captures={sorted}
        index={selectedIndex}
        teams={teams}
        canAssignTeams={canAssignTeams}
        onClose={() => setSelectedIndex(null)}
        onNavigate={setSelectedIndex}
      />
    </div>
  );
}

// Shown in the table body / grid area when there are no captures to show, so the
// table structure and view toggle stay on screen. Distinguishes an empty org
// (nothing captured yet) from a filter that excludes everything.
function EmptyMessage({ filtered = false }: { filtered?: boolean }) {
  if (filtered) {
    return (
      <div className="flex flex-col items-center gap-2">
        <span className="rounded-full bg-base-content/10 px-2.5 py-1 text-xs font-semibold text-base-content/70">
          No matching captures
        </span>
        <p className="max-w-md text-sm text-base-content/65">
          No captures match the current filters. Try clearing them to see everything.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
        Nothing captured yet
      </span>
      <p className="max-w-md text-sm text-base-content/65">
        Start a capture session in the field app and photos will appear here as they upload and get
        analyzed.
      </p>
    </div>
  );
}

// Unique non-null values from a column, sorted A→Z — feeds the filter dropdowns.
function uniqueSorted(values: Array<string | null>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) =>
    a.localeCompare(b)
  );
}

// Labeled dropdown for a single-value filter. Empty value ("") = no filter.
function FilterSelect({
  label,
  value,
  options,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const active = Boolean(value);
  return (
    <label className="inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={`Filter by ${label.toLowerCase()}`}
        className={`rounded-lg border bg-base-100 px-3 py-1.5 text-xs font-medium transition-colors ${
          active
            ? "border-accent/40 text-neutral"
            : "border-base-content/10 text-base-content/70 hover:text-neutral"
        }`}
      >
        <option value="">{label}: All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  );
}


// Clickable column header. The caret only renders on the active column and
// points up for ascending / down for descending.
function SortHeader({
  label,
  sortKey,
  sort,
  onSort
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      scope="col"
      className="px-3 py-2.5 font-medium"
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}`}
        className={`-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-neutral ${
          active ? "text-neutral" : ""
        }`}
      >
        {label}
        <span
          aria-hidden
          className={`transition-opacity ${active ? "opacity-100" : "opacity-0"}`}
        >
          <svg
            width={12}
            height={12}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={active && sort.dir === "desc" ? "rotate-180" : ""}
          >
            <path d="m18 15-6-6-6 6" />
          </svg>
        </span>
      </button>
    </th>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
  children
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-base-content/[0.08] text-neutral"
          : "text-base-content/55 hover:text-neutral"
      }`}
    >
      {children}
    </button>
  );
}
