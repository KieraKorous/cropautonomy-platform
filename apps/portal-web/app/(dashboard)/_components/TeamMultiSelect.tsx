"use client";

import type { TeamSummary } from "../../../lib/api";

// A dropdown multi-select for filing an entity onto teams. A device/capture may
// sit on several teams at once. The parent owns the selected state + persistence
// (each toggle persists immediately); this only renders the control and reports
// toggles. Used by the device + capture detail modals.
export function TeamMultiSelect({
  teams,
  selectedIds,
  busyId,
  subjectLabel,
  onToggle
}: {
  teams: TeamSummary[];
  selectedIds: string[];
  // Team id currently round-tripping (its checkbox disables), or null.
  busyId: string | null;
  // Singular noun for the copy, e.g. "device" or "capture".
  subjectLabel: string;
  onToggle: (teamId: string, assigned: boolean) => void;
}) {
  const summaryText =
    selectedIds.length === 0
      ? "No team — visible org-wide"
      : selectedIds.length === 1
        ? teams.find((t) => t.id === selectedIds[0])?.name ?? "1 team"
        : `${selectedIds.length} teams`;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-base-content/65">Teams</span>
      {teams.length === 0 ? (
        <p className="text-xs text-base-content/45">
          No teams yet. Create one on the Team page to group this {subjectLabel}.
        </p>
      ) : (
        <details className="group relative">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm text-neutral transition-colors hover:border-primary/40 [&::-webkit-details-marker]:hidden">
            <span className="truncate">{summaryText}</span>
            <svg
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-shrink-0 text-base-content/45 transition-transform group-open:rotate-180"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-base-content/15 bg-base-100 p-1 shadow-lg">
            {teams.map((t) => {
              const checked = selectedIds.includes(t.id);
              return (
                <label
                  key={t.id}
                  className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm text-neutral transition-colors hover:bg-base-content/[0.04]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={busyId === t.id}
                    onChange={() => onToggle(t.id, !checked)}
                    className="checkbox checkbox-sm"
                  />
                  <span
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full border border-base-content/20"
                    style={t.color ? { backgroundColor: t.color } : undefined}
                  />
                  <span className="truncate">{t.name}</span>
                </label>
              );
            })}
          </div>
        </details>
      )}
      <span className="text-xs leading-relaxed text-base-content/45">
        Only members of the selected teams — plus admins and owners — can see this {subjectLabel}.
      </span>
    </div>
  );
}
