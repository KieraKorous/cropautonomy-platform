"use client";

import { useEffect, useMemo, useState } from "react";
import { GridIcon, RowsIcon } from "@gaia/ui";
import type { CaptureStatus, CaptureSummary } from "../../../lib/api";
import { CaptureRow } from "./CaptureRow";
import { CaptureCard } from "./CaptureCard";

type ViewMode = "table" | "grid";
const STORAGE_KEY = "captures.viewMode";

type SortKey = "date" | "plant" | "status";
type SortDir = "asc" | "desc";

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

// First-click direction per column: dates default newest-first, the rest A→Z.
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  date: "desc",
  plant: "asc",
  status: "asc"
};

const capturedTime = (c: CaptureSummary) => new Date(c.uploadedAt ?? c.capturedAt).getTime();

function compareCaptures(a: CaptureSummary, b: CaptureSummary, key: SortKey): number {
  switch (key) {
    case "date":
      return capturedTime(a) - capturedTime(b);
    case "plant":
      // Null plant types always sink to the bottom, regardless of direction.
      if (a.plantType == null || b.plantType == null) {
        if (a.plantType == null && b.plantType == null) return 0;
        return a.plantType == null ? 1 : -1;
      }
      return a.plantType.localeCompare(b.plantType);
    case "status":
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  }
}

// Owns the table/grid toggle and remembers the choice in localStorage. The
// captures themselves are fetched on the server and passed in, so switching
// views never re-hits the API.
export function CapturesView({ captures }: { captures: CaptureSummary[] }) {
  // Start on table for a stable first paint, then hydrate from localStorage so
  // SSR and the first client render agree (avoids a hydration mismatch).
  const [view, setView] = useState<ViewMode>("table");

  // Default newest-first, matching how the API already returns captures.
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "date", dir: "desc" });

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
    return [...captures].sort((a, b) => factor * compareCaptures(a, b, sort.key));
  }, [captures, sort]);

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

  return (
    <div className="flex flex-col gap-4">
      {view === "table" ? (
        <div className="overflow-x-auto rounded-xl border border-base-content/10 bg-base-100">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-base-content/[0.03] text-xs uppercase tracking-wide text-base-content/55">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  <span className="sr-only">Preview</span>
                </th>
                <SortHeader label="Date Captured" sortKey="date" sort={sort} onSort={onSort} />
                <SortHeader label="Plant Type" sortKey="plant" sort={sort} onSort={onSort} />
                <SortHeader label="Status" sortKey="status" sort={sort} onSort={onSort} />
                <th scope="col" className="px-3 py-1.5 font-medium">
                  <div className="flex justify-end">{toggle}</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center">
                    <EmptyMessage />
                  </td>
                </tr>
              ) : (
                sorted.map((capture) => (
                  <CaptureRow capture={capture} key={capture.id} />
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
              <EmptyMessage />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {sorted.map((capture) => (
                <CaptureCard capture={capture} key={capture.id} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Shown in the table body / grid area when there are no captures yet, so the
// table structure and view toggle stay on screen.
function EmptyMessage() {
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
