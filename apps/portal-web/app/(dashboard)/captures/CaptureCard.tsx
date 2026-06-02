import { CameraIcon, StatusPill } from "@gaia/ui";
import type { CaptureSummary } from "../../../lib/api";
import { DiscardButton } from "./DiscardButton";
import { RetryButton } from "./RetryButton";
import { dateFormat, statusDisplay } from "./captureDisplay";

// Grid/gallery card for a capture. What shows under the image, and the pill,
// depend on where the capture is in the pipeline. Clicking the card (anywhere
// but the discard button) opens the detail lightbox.
export function CaptureCard({
  capture,
  onOpen
}: {
  capture: CaptureSummary;
  onOpen: () => void;
}) {
  const display = statusDisplay(capture.status, capture.plantType);
  const when = capture.uploadedAt ?? capture.capturedAt;

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer overflow-hidden rounded-xl border border-base-content/10 bg-base-100 transition-colors hover:border-base-content/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="relative aspect-square bg-base-content/[0.04]">
        {capture.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not a static asset
          <img
            alt={capture.plantType ?? "Capture"}
            className="h-full w-full object-cover"
            src={capture.imageUrl}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-base-content/30">
            <CameraIcon size={28} />
          </div>
        )}
        {display.pill ? (
          <div className="absolute left-2 top-2">
            <StatusPill label={display.pill.label} tone={display.pill.tone} />
          </div>
        ) : capture.status === "failed" ? (
          <div className="absolute left-2 top-2">
            <span className="inline-flex h-fit items-center gap-1.5 rounded-full bg-error/15 px-2.5 py-1 text-xs font-semibold text-error">
              <span className="h-1.5 w-1.5 rounded-full bg-error" />
              Failed
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-2 px-3.5 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span
            className={`truncate text-sm font-medium ${
              display.muted ? "text-base-content/55" : "text-neutral"
            }`}
            title={display.label}
          >
            {display.label}
          </span>
          <span className="text-xs text-base-content/55">{dateFormat.format(new Date(when))}</span>
        </div>
        {/* Stop propagation so these actions don't also open the lightbox. */}
        <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
          {capture.status === "failed" ? <RetryButton captureId={capture.id} /> : null}
          <DiscardButton captureId={capture.id} />
        </div>
      </div>
    </article>
  );
}
