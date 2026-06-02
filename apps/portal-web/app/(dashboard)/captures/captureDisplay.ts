import type { Tone } from "@gaia/ui";
import type { CaptureStatus, CaptureSummary } from "../../../lib/api";

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

export const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "2-digit",
  day: "2-digit",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

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
