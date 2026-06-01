"use client";

import { useEffect, useState } from "react";
import { GridIcon, RowsIcon } from "@gaia/ui";
import type { CaptureSummary } from "../../../lib/api";
import { CaptureRow } from "./CaptureRow";
import { CaptureCard } from "./CaptureCard";

type ViewMode = "table" | "grid";
const STORAGE_KEY = "captures.viewMode";

// Owns the table/grid toggle and remembers the choice in localStorage. The
// captures themselves are fetched on the server and passed in, so switching
// views never re-hits the API.
export function CapturesView({ captures }: { captures: CaptureSummary[] }) {
  // Start on table for a stable first paint, then hydrate from localStorage so
  // SSR and the first client render agree (avoids a hydration mismatch).
  const [view, setView] = useState<ViewMode>("table");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "grid" || saved === "table") setView(saved);
  }, []);

  const choose = (next: ViewMode) => {
    setView(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <div
          className="inline-flex items-center gap-1 rounded-lg border border-base-content/10 bg-base-100 p-0.5"
          role="group"
          aria-label="Captures view"
        >
          <ToggleButton
            active={view === "table"}
            onClick={() => choose("table")}
            label="Table view"
          >
            <RowsIcon size={15} />
            Table
          </ToggleButton>
          <ToggleButton
            active={view === "grid"}
            onClick={() => choose("grid")}
            label="Grid view"
          >
            <GridIcon size={15} />
            Grid
          </ToggleButton>
        </div>
      </div>

      {view === "table" ? (
        <div className="overflow-x-auto rounded-xl border border-base-content/10 bg-base-100">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-base-content/[0.03] text-xs uppercase tracking-wide text-base-content/55">
              <tr>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  <span className="sr-only">Preview</span>
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Date Captured
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Plant Type
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Status
                </th>
                <th scope="col" className="px-3 py-2.5 font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {captures.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center">
                    <EmptyMessage />
                  </td>
                </tr>
              ) : (
                captures.map((capture) => (
                  <CaptureRow capture={capture} key={capture.id} />
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : captures.length === 0 ? (
        <div className="rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-12">
          <EmptyMessage />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {captures.map((capture) => (
            <CaptureCard capture={capture} key={capture.id} />
          ))}
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
