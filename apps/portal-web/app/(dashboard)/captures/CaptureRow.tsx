import { CameraIcon, StatusPill } from "@gaia/ui";
import type { CaptureSummary } from "../../../lib/api";
import { DiscardButton } from "./DiscardButton";
import { RetryButton } from "./RetryButton";
import { dateFormat, mediaLabel, statusDisplay } from "./captureDisplay";

// One row in the captures table. Clicking the row (anywhere but the discard
// button) opens the detail lightbox. Plant column only carries a real species
// name once analysis has succeeded; everything else surfaces in-flight state.
export function CaptureRow({
  capture,
  onOpen
}: {
  capture: CaptureSummary;
  onOpen: () => void;
}) {
  const display = statusDisplay(capture.status, capture.plantType);
  const when = capture.uploadedAt ?? capture.capturedAt;

  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-t border-base-content/10 align-middle transition-colors hover:bg-base-content/[0.03]"
    >
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
          <span className="text-xs text-base-content/55">{mediaLabel(capture.mediaType)}</span>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span
          className={`text-sm ${
            display.muted ? "text-base-content/55" : "italic text-neutral"
          }`}
          title={display.label}
        >
          {display.label}
        </span>
      </td>
      <td className="px-3 py-2.5">
        {display.pill ? (
          <StatusPill label={display.pill.label} tone={display.pill.tone} />
        ) : capture.status === "failed" ? (
          <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-error/15 px-2.5 py-1 text-xs font-semibold text-error">
              <span className="h-1.5 w-1.5 rounded-full bg-error" />
              Failed
            </span>
            <RetryButton captureId={capture.id} />
          </div>
        ) : null}
      </td>
      {/* Stop propagation so discarding doesn't also open the lightbox. */}
      <td className="px-3 py-2.5 text-right" onClick={(event) => event.stopPropagation()}>
        <DiscardButton captureId={capture.id} />
      </td>
    </tr>
  );
}
