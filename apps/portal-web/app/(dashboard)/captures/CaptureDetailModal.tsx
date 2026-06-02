"use client";

import { useEffect, useRef } from "react";
import { ArrowRight, CameraIcon, StatusPill } from "@gaia/ui";
import type { CaptureSummary } from "../../../lib/api";
import { dateFormat, mediaLabel, statusDisplay } from "./captureDisplay";

// Format a byte count into a compact KB/MB string. Captures are photos/short
// videos, so we never need beyond MB.
function formatSize(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Full-image detail lightbox. Driven by an index into the (already sorted)
// captures list so prev/next is just walking the array — no API round-trips.
// `index === null` means closed. Follows the native <dialog> pattern from
// devices/AddDeviceDialog (Escape + backdrop click close for free).
export function CaptureDetailModal({
  captures,
  index,
  onClose,
  onNavigate
}: {
  captures: CaptureSummary[];
  index: number | null;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  const open = index != null;
  const capture = open ? captures[index] : null;
  const hasPrev = open && index > 0;
  const hasNext = open && index < captures.length - 1;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Arrow keys navigate while open. Escape is handled natively by <dialog>.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && hasPrev) onNavigate(index - 1);
      if (event.key === "ArrowRight" && hasNext) onNavigate(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, hasPrev, hasNext, onNavigate]);

  const display = capture ? statusDisplay(capture.status, capture.plantType) : null;
  const size = capture ? formatSize(capture.sizeBytes) : null;
  // 1-based position for the "N of M" caption (only read while open).
  const position = open ? index + 1 : 0;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        // Backdrop click: the <dialog> itself is the backdrop, so a click that
        // lands directly on it (not the inner panel) should close.
        if (event.target === ref.current) onClose();
      }}
      className="m-auto w-full max-w-4xl rounded-xl border border-base-content/10 bg-base-100 p-0 text-base-content shadow-lg backdrop:bg-neutral/60"
    >
      {capture && display ? (
        <div className="flex flex-col md:flex-row">
          {/* Image side */}
          <div className="relative flex aspect-square w-full items-center justify-center bg-neutral/95 md:aspect-auto md:w-2/3">
            {capture.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not a static asset
              <img
                alt={capture.plantType ?? "Capture"}
                className="max-h-[70vh] w-full object-contain"
                src={capture.imageUrl}
              />
            ) : (
              <div className="flex h-full min-h-[40vh] w-full items-center justify-center text-base-100/30">
                <CameraIcon size={48} />
              </div>
            )}

            {/* Prev / next arrows overlaid on the image edges. */}
            <button
              type="button"
              onClick={() => hasPrev && onNavigate(index - 1)}
              disabled={!hasPrev}
              aria-label="Previous capture"
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-base-100/90 p-2 text-neutral shadow-md transition hover:bg-base-100 disabled:pointer-events-none disabled:opacity-0"
            >
              <ArrowRight size={18} className="rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => hasNext && onNavigate(index + 1)}
              disabled={!hasNext}
              aria-label="Next capture"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-base-100/90 p-2 text-neutral shadow-md transition hover:bg-base-100 disabled:pointer-events-none disabled:opacity-0"
            >
              <ArrowRight size={18} />
            </button>
          </div>

          {/* Metadata side */}
          <div className="flex w-full flex-col gap-5 p-6 md:w-1/3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-2">
                {display.pill ? (
                  <StatusPill label={display.pill.label} tone={display.pill.tone} />
                ) : capture.status === "failed" ? (
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-error/15 px-2.5 py-1 text-xs font-semibold text-error">
                    <span className="h-1.5 w-1.5 rounded-full bg-error" />
                    Failed
                  </span>
                ) : null}
                <h2
                  className={`text-lg font-semibold ${
                    display.muted ? "text-base-content/70" : "text-neutral"
                  }`}
                >
                  {display.label}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 -mt-1 rounded-md p-1 text-base-content/55 transition-colors hover:bg-base-content/[0.06] hover:text-neutral"
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {capture.statusMessage ? (
              <p className="text-sm leading-relaxed text-base-content/65">{capture.statusMessage}</p>
            ) : null}

            <dl className="flex flex-col gap-3 text-sm">
              <DetailRow label="Plant type" value={capture.plantType ?? "—"} />
              <DetailRow
                label="Captured"
                value={dateFormat.format(new Date(capture.capturedAt))}
              />
              {capture.uploadedAt ? (
                <DetailRow
                  label="Uploaded"
                  value={dateFormat.format(new Date(capture.uploadedAt))}
                />
              ) : null}
              <DetailRow label="Media" value={mediaLabel(capture.mediaType)} />
              {size ? <DetailRow label="Size" value={size} /> : null}
              {capture.fieldId ? <DetailRow label="Field" value={capture.fieldId} /> : null}
            </dl>

            <div className="mt-auto text-xs text-base-content/45">
              {position} of {captures.length}
            </div>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="flex-shrink-0 text-base-content/55">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-neutral" title={value}>
        {value}
      </dd>
    </div>
  );
}
