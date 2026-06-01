import { CameraIcon, StatusPill, type Tone } from "@gaia/ui";
import type { CaptureStatus, CaptureSummary } from "../../../lib/api";
import { DiscardButton } from "./DiscardButton";

// One row in the captures table. Plant column only carries a real species name
// once analysis has succeeded; everything else surfaces the in-flight state.
function statusDisplay(
  status: CaptureStatus,
  plantType: string | null
): { plantLabel: string; pill: { label: string; tone: Tone } | null; muted: boolean } {
  switch (status) {
    case "analyzed":
      return {
        plantLabel: plantType ?? "Unidentified",
        pill: { label: "Identified", tone: "success" },
        muted: plantType == null
      };
    case "analysis_queued":
    case "analysis_running":
      return { plantLabel: "Analyzing…", pill: { label: "Analyzing", tone: "accent" }, muted: true };
    case "uploaded":
      return { plantLabel: "Queued for analysis", pill: { label: "Queued", tone: "muted" }, muted: true };
    case "pending_upload":
    case "uploading":
      return { plantLabel: "Uploading…", pill: { label: "Uploading", tone: "muted" }, muted: true };
    case "failed":
      return { plantLabel: "Analysis failed", pill: null, muted: true };
    default:
      return { plantLabel: status, pill: null, muted: true };
  }
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

export function CaptureRow({ capture }: { capture: CaptureSummary }) {
  const display = statusDisplay(capture.status, capture.plantType);
  const when = capture.uploadedAt ?? capture.capturedAt;
  const mediaLabel =
    capture.mediaType === "burst_frame"
      ? "Burst"
      : capture.mediaType === "video"
        ? "Video"
        : "Photo";

  return (
    <tr className="border-t border-base-content/10 align-middle">
      <td className="px-3 py-2.5">
        <div className="relative h-14 w-14 overflow-hidden rounded-md bg-base-content/[0.04]">
          {capture.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not a static asset
            <img
              alt={capture.plantType ?? "Capture"}
              className="h-full w-full object-cover"
              src={capture.imageUrl}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-base-content/30">
              <CameraIcon size={20} />
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-neutral">
            {dateFormat.format(new Date(when))}
          </span>
          <span className="text-xs text-base-content/55">{mediaLabel}</span>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span
          className={`text-sm ${
            display.muted ? "text-base-content/55" : "italic text-neutral"
          }`}
          title={display.plantLabel}
        >
          {display.plantLabel}
        </span>
      </td>
      <td className="px-3 py-2.5">
        {display.pill ? (
          <StatusPill label={display.pill.label} tone={display.pill.tone} />
        ) : capture.status === "failed" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-error/15 px-2.5 py-1 text-xs font-semibold text-error">
            <span className="h-1.5 w-1.5 rounded-full bg-error" />
            Failed
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2.5 text-right">
        <DiscardButton captureId={capture.id} />
      </td>
    </tr>
  );
}
