import type { Tone } from "@gaia/ui";
import type { CaptureStatus, CaptureSummary, Severity } from "../../../lib/api";

// Shared display vocabulary for a capture, used by the table row, the grid card,
// and the detail lightbox so the status->label mapping lives in one place. Plant
// type only carries a real species name once analysis has succeeded; until then
// we surface the in-flight pipeline state instead.
export function statusDisplay(
  status: CaptureStatus,
  plantType: string | null
): { label: string; pill: { label: string; tone: Tone } | null; muted: boolean } {
  switch (status) {
    case "analyzed":
      return {
        label: plantType ?? "Unidentified",
        pill: { label: "Identified", tone: "success" },
        muted: plantType == null
      };
    case "analysis_queued":
    case "analysis_running":
      return { label: "Analyzing…", pill: { label: "Analyzing", tone: "accent" }, muted: true };
    case "uploaded":
      return { label: "Queued for analysis", pill: { label: "Queued", tone: "muted" }, muted: true };
    case "pending_upload":
    case "uploading":
      return { label: "Uploading…", pill: { label: "Uploading", tone: "muted" }, muted: true };
    case "failed":
      return { label: "Analysis failed", pill: null, muted: true };
    default:
      return { label: status, pill: null, muted: true };
  }
}

// Status vocabulary for recordings (kind='session_recording'). Same pipeline as
// captures, but a recording's terminal state is "Ready" (a playable clip), not a
// plant identification — so it gets its own labels while sharing the tones.
export function recordingStatusDisplay(status: CaptureStatus): {
  pill: { label: string; tone: Tone } | null;
} {
  switch (status) {
    case "analyzed":
      return { pill: { label: "Ready", tone: "success" } };
    case "analysis_queued":
    case "analysis_running":
      return { pill: { label: "Analyzing", tone: "accent" } };
    case "uploaded":
      return { pill: { label: "Queued", tone: "muted" } };
    case "pending_upload":
    case "uploading":
      return { pill: { label: "Uploading", tone: "muted" } };
    case "failed":
      return { pill: null };
    default:
      return { pill: null };
  }
}

export const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "2-digit",
  day: "2-digit",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

// How "concerning" a capture is, high → low. Drives the severity sort and the
// "Concerns only" filter. Absent severity (not yet analyzed, or nothing flagged)
// ranks below everything so it sorts to the bottom.
export const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

export function severityRank(severity: Severity | null): number {
  return severity ? SEVERITY_RANK[severity] : 0;
}

// A capture is a "concern" once the pipeline judges it medium or high severity —
// the threshold that also fires the manager/admin notification in the worker.
export function isConcern(severity: Severity | null): boolean {
  return severity === "medium" || severity === "high";
}

// Label + Tailwind classes for a severity badge/dot. Tone has no error/warning,
// so severity uses explicit DaisyUI semantic colors (matching the card's dot).
export function severityDisplay(severity: Severity): {
  label: string;
  badgeClass: string;
  dotClass: string;
} {
  switch (severity) {
    case "high":
      return { label: "High", badgeClass: "bg-error/15 text-error", dotClass: "bg-error" };
    case "medium":
      return { label: "Medium", badgeClass: "bg-warning/15 text-warning", dotClass: "bg-warning" };
    case "low":
      return { label: "Low", badgeClass: "bg-success/15 text-success", dotClass: "bg-success" };
  }
}

// Compact byte count (KB/MB). Captures + short recordings never exceed MB.
export function formatSize(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// "m:ss" clip duration, or null when unknown/zero (still-processing recordings).
export function formatDuration(ms: number | null): string | null {
  if (ms == null || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function mediaLabel(mediaType: CaptureSummary["mediaType"]): string {
  switch (mediaType) {
    case "burst_frame":
      return "Burst";
    case "video":
      return "Video";
    default:
      return "Photo";
  }
}
