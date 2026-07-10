"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TrashIcon } from "@gaia/ui";

import type { CaptureSummary, TeamSummary } from "../../../lib/api";
import { getCaptureDownload } from "./download-action";
import { bulkAssignTeamAction, bulkDiscardAction, bulkReanalyzeAction } from "./bulk-actions";

// Bulk-action bar shown when one or more rows/cards are selected. Shared by the
// captures + recordings lists. Actions run against the capture endpoints (a
// recording is a capture), so this component is view-agnostic; the caller only
// varies `subjectLabel`, whether re-analyze is offered, and the team controls.
export function SelectionToolbar({
  selectedIds,
  items,
  teams,
  canAssignTeams,
  allowReanalyze,
  subjectLabel,
  onClear
}: {
  selectedIds: string[];
  // The currently-visible list, so we can compute which selected items are
  // failed (re-analyzable) or downloadable (have a signed URL) without a fetch.
  items: CaptureSummary[];
  teams: TeamSummary[];
  canAssignTeams: boolean;
  allowReanalyze: boolean;
  subjectLabel: string;
  onClear: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = selectedIds.length;
  if (count === 0) return null;

  const selectedSet = new Set(selectedIds);
  const selectedItems = items.filter((i) => selectedSet.has(i.id));
  const failedIds = selectedItems.filter((i) => i.status === "failed").map((i) => i.id);
  const downloadableIds = selectedItems.filter((i) => i.imageUrl != null).map((i) => i.id);
  const busy = pending || downloading;

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
        onClear();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Bulk action failed.");
      }
    });
  }

  async function onDownload() {
    if (downloadableIds.length === 0) return;
    setError(null);
    setDownloading(true);
    try {
      // Sequential so the browser doesn't drop rapid-fire saves.
      for (const id of downloadableIds) {
        const res = await getCaptureDownload(id);
        if ("error" in res) continue;
        await saveUrl(res.url, res.filename);
      }
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral/25 bg-neutral/[0.04] px-3 py-2">
      <span className="text-sm font-semibold text-neutral">
        {count} selected
      </span>

      <div className="mx-1 h-4 w-px bg-base-content/15" aria-hidden />

      {canAssignTeams && teams.length > 0 ? (
        <label className="inline-flex items-center">
          <span className="sr-only">Assign selected to team</span>
          <select
            value=""
            disabled={busy}
            onChange={(event) => {
              const teamId = event.target.value;
              if (teamId) run(() => bulkAssignTeamAction(selectedIds, teamId));
            }}
            aria-label="Assign selected to team"
            className="rounded-lg border border-base-content/15 bg-base-100 px-3 py-1.5 text-xs font-medium text-base-content/80 transition-colors hover:text-neutral disabled:opacity-50"
          >
            <option value="">Assign to team…</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {downloadableIds.length > 0 ? (
        <ToolbarButton disabled={busy} onClick={onDownload}>
          {downloading ? "Downloading…" : `Download${downloadableIds.length < count ? ` (${downloadableIds.length})` : ""}`}
        </ToolbarButton>
      ) : null}

      {allowReanalyze && failedIds.length > 0 ? (
        <ToolbarButton disabled={busy} onClick={() => run(() => bulkReanalyzeAction(failedIds))}>
          Re-analyze ({failedIds.length})
        </ToolbarButton>
      ) : null}

      <ToolbarButton disabled={busy} tone="danger" onClick={() => run(() => bulkDiscardAction(selectedIds))}>
        <TrashIcon size={14} />
        {pending ? "Discarding…" : "Discard"}
      </ToolbarButton>

      <button
        type="button"
        onClick={onClear}
        disabled={busy}
        className="ml-auto text-xs font-medium text-base-content/55 underline-offset-2 hover:text-neutral hover:underline disabled:opacity-50"
      >
        Clear selection
      </button>

      {error ? <span className="w-full text-xs text-error">{error}</span> : null}
      <span className="sr-only" aria-live="polite">
        {count} {subjectLabel}
        {count === 1 ? "" : "s"} selected
      </span>
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  tone = "default"
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
        tone === "danger"
          ? "border-error/25 text-error hover:bg-error/10"
          : "border-base-content/15 text-base-content/80 hover:bg-base-content/[0.04] hover:text-neutral"
      }`}
    >
      {children}
    </button>
  );
}

// Force-save a remote file (blob download, keeping the filename). Falls back to a
// tab navigation with Supabase's download disposition if a cross-origin fetch is
// blocked. Mirrors DownloadButton's saver.
async function saveUrl(url: string, filename: string) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(String(resp.status));
    const blob = await resp.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerAnchor(objectUrl, filename);
    URL.revokeObjectURL(objectUrl);
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    triggerAnchor(`${url}${sep}download=${encodeURIComponent(filename)}`, filename, true);
  }
}

function triggerAnchor(href: string, filename: string, newTab = false) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  if (newTab) a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
