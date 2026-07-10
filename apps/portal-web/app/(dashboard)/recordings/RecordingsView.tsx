"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { channels } from "@gaia/realtime/channels";
import { useRealtimeChannel } from "@gaia/realtime/client";
import { GridIcon, RowsIcon } from "@gaia/ui";
import type { CaptureStatus, CaptureSummary, TeamSummary } from "../../../lib/api";
import { isConcern, severityRank } from "../captures/captureDisplay";
import { RecordingRow } from "./RecordingRow";
import { RecordingCard } from "./RecordingCard";
import { RecordingDetailModal } from "./RecordingDetailModal";

type ViewMode = "table" | "grid";
const STORAGE_KEY = "recordings.viewMode";

type SortKey = "date" | "status" | "severity" | "capturedBy" | "farm" | "field";
type SortDir = "asc" | "desc";

// Non-terminal statuses: a recording here is still uploading/analyzing, so the
// fallback poll keeps refreshing until everything reaches a terminal status.
const IN_FLIGHT_STATUSES: ReadonlySet<CaptureStatus> = new Set<CaptureStatus>([
  "pending_upload",
  "uploading",
  "uploaded",
  "analysis_queued",
  "analysis_running"
]);

// Pipeline order so status-sort groups recordings by where they are in the flow.
const STATUS_ORDER: Record<CaptureStatus, number> = {
  pending_upload: 0,
  uploading: 1,
  uploaded: 2,
  analysis_queued: 3,
  analysis_running: 4,
  analyzed: 5,
  failed: 6
};

// First-click direction per column: date + severity newest/highest-first, names A→Z.
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  date: "desc",
  status: "asc",
  severity: "desc",
  capturedBy: "asc",
  farm: "asc",
  field: "asc"
};

function compareNullableText(a: string | null, b: string | null): number {
  if (a == null || b == null) {
    if (a == null && b == null) return 0;
    return a == null ? 1 : -1;
  }
  return a.localeCompare(b);
}

function compareRecordings(a: CaptureSummary, b: CaptureSummary, key: SortKey): number {
  switch (key) {
    case "date":
      return new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime();
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

// Owns the table/grid toggle, sorting, filtering, and the player lightbox for the
// recordings list. Mirrors captures/CapturesView: server-fetched rows passed in,
// live via the org capture feed + a bounded fallback poll.
export function RecordingsView({
  recordings,
  orgId,
  teams,
  canAssignTeams
}: {
  recordings: CaptureSummary[];
  orgId: string;
  teams: TeamSummary[];
  canAssignTeams: boolean;
}) {
  const router = useRouter();

  // Live feed: recordings are captures, so capture.changed fires for them too.
  // Debounced refresh coalesces a burst into one server refetch.
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

  // Fallback poll while anything is still in-flight, so status stays live even if
  // a realtime event is missed. Stops once every recording is terminal.
  const hasInFlight = useMemo(
    () => recordings.some((r) => IN_FLIGHT_STATUSES.has(r.status)),
    [recordings]
  );
  useEffect(() => {
    if (!hasInFlight) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [hasInFlight, router]);

  const [view, setView] = useState<ViewMode>("table");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "date", dir: "desc" });
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const [concernsOnly, setConcernsOnly] = useState(false);
  const [farmFilter, setFarmFilter] = useState<string>("");
  const [fieldFilter, setFieldFilter] = useState<string>("");
  const [capturedByFilter, setCapturedByFilter] = useState<string>("");

  const farmOptions = useMemo(() => uniqueSorted(recordings.map((r) => r.farmName)), [recordings]);
  const fieldOptions = useMemo(() => uniqueSorted(recordings.map((r) => r.fieldName)), [recordings]);
  const capturedByOptions = useMemo(
    () => uniqueSorted(recordings.map((r) => r.capturedByName)),
    [recordings]
  );
  const concernCount = useMemo(
    () => recordings.filter((r) => isConcern(r.severity)).length,
    [recordings]
  );

  const filtered = useMemo(
    () =>
      recordings.filter((r) => {
        if (concernsOnly && !isConcern(r.severity)) return false;
        if (farmFilter && r.farmName !== farmFilter) return false;
        if (fieldFilter && r.fieldName !== fieldFilter) return false;
        if (capturedByFilter && r.capturedByName !== capturedByFilter) return false;
        return true;
      }),
    [recordings, concernsOnly, farmFilter, fieldFilter, capturedByFilter]
  );

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "grid" || saved === "table") setView(saved);
  }, []);

  const choose = (next: ViewMode) => {
    setView(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  const onSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: DEFAULT_DIR[key] }
    );

  const sorted = useMemo(() => {
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => factor * compareRecordings(a, b, sort.key));
  }, [filtered, sort]);

  const hasActiveFilter =
    concernsOnly || Boolean(farmFilter) || Boolean(fieldFilter) || Boolean(capturedByFilter);

  const toggle = (
    <div
      className="inline-flex items-center gap-1 rounded-lg border border-base-content/10 bg-base-100 p-0.5"
      role="group"
      aria-label="Recordings view"
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

        <FilterSelect label="Farm" value={farmFilter} options={farmOptions} onChange={setFarmFilter} />
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
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-base-content/[0.03] text-xs uppercase tracking-wide text-base-content/55">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  <span className="sr-only">Preview</span>
                </th>
                <SortHeader label="Date Recorded" sortKey="date" sort={sort} onSort={onSort} />
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
                  <td colSpan={8} className="px-3 py-10 text-center">
                    <EmptyMessage filtered={hasActiveFilter} />
                  </td>
                </tr>
              ) : (
                sorted.map((rec, i) => (
                  <RecordingRow recording={rec} key={rec.id} onOpen={() => setSelectedIndex(i)} />
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
              {sorted.map((rec) => (
                <RecordingCard
                  key={rec.id}
                  recording={rec}
                  teams={teams}
                  canAssignTeams={canAssignTeams}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <RecordingDetailModal
        recordings={sorted}
        index={selectedIndex}
        teams={teams}
        canAssignTeams={canAssignTeams}
        onClose={() => setSelectedIndex(null)}
        onNavigate={setSelectedIndex}
      />
    </div>
  );
}

function EmptyMessage({ filtered = false }: { filtered?: boolean }) {
  if (filtered) {
    return (
      <div className="flex flex-col items-center gap-2">
        <span className="rounded-full bg-base-content/10 px-2.5 py-1 text-xs font-semibold text-base-content/70">
          No matching recordings
        </span>
        <p className="max-w-md text-sm text-base-content/65">
          No recordings match the current filters. Try clearing them to see everything.
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
        No recordings yet
      </span>
      <p className="max-w-md text-sm text-base-content/65">
        Start a live session and tap Record on the phone, or hit Rec on a camera tile on the Live
        wall. Saved recordings appear here.
      </p>
    </div>
  );
}

function uniqueSorted(values: Array<string | null>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))].sort((a, b) =>
    a.localeCompare(b)
  );
}

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
        <span aria-hidden className={`transition-opacity ${active ? "opacity-100" : "opacity-0"}`}>
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
        active ? "bg-base-content/[0.08] text-neutral" : "text-base-content/55 hover:text-neutral"
      }`}
    >
      {children}
    </button>
  );
}
