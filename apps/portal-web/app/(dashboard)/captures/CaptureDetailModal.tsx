"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CameraIcon, StatusPill } from "@gaia/ui";
import type { CaptureSummary } from "../../../lib/api";
import { dateFormat, mediaLabel, statusDisplay } from "./captureDisplay";

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

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
// devices/AddDeviceDialog (Escape + backdrop click close for free). The image
// can be expanded into a full-viewport viewer with wheel/button/double-click
// zoom and drag-to-pan.
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

  // Fullscreen zoom/pan state. scale/offset also live in refs so the wheel and
  // drag handlers (attached once) can read the latest values without stale
  // closures or re-binding on every change.
  const [fullscreen, setFullscreen] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const open = index != null;
  const capture = open ? captures[index] : null;
  const hasPrev = open && index > 0;
  const hasNext = open && index < captures.length - 1;

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const resetZoom = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Reset zoom whenever the shown capture changes or the viewer toggles, so a
  // new image always starts fit-to-screen.
  useEffect(() => {
    resetZoom();
  }, [index, fullscreen, resetZoom]);

  // Leaving the modal entirely also leaves the fullscreen viewer.
  useEffect(() => {
    if (!open) setFullscreen(false);
  }, [open]);

  // Zoom toward a point (cx, cy given relative to the stage centre) so the pixel
  // under the cursor stays put. cx/cy default to 0,0 = zoom about the centre.
  const zoomTo = useCallback((nextScale: number, cx = 0, cy = 0) => {
    const clamped = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    if (clamped === MIN_SCALE) {
      resetZoom();
      return;
    }
    const prev = scaleRef.current;
    const o = offsetRef.current;
    const ratio = clamped / prev;
    setOffset({ x: cx - ratio * (cx - o.x), y: cy - ratio * (cy - o.y) });
    setScale(clamped);
  }, [resetZoom]);

  // Arrow keys navigate while open (in either view). Escape is intercepted in
  // onCancel below so it backs out of fullscreen before closing the modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && hasPrev) onNavigate(index - 1);
      if (event.key === "ArrowRight" && hasNext) onNavigate(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, hasPrev, hasNext, onNavigate]);

  // Wheel zoom, anchored to the cursor. Registered as a non-passive listener so
  // we can preventDefault and stop the page/dialog from scrolling.
  useEffect(() => {
    if (!fullscreen) return;
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = event.clientX - rect.left - rect.width / 2;
      const cy = event.clientY - rect.top - rect.height / 2;
      const factor = event.deltaY < 0 ? 1.2 : 1 / 1.2;
      zoomTo(scaleRef.current * factor, cx, cy);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fullscreen, zoomTo]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (scaleRef.current <= MIN_SCALE) return;
    // Don't start a pan (or capture the pointer) when pressing the overlaid
    // nav/zoom buttons — that would swallow their click.
    if ((event.target as Element).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      ox: offsetRef.current.x,
      oy: offsetRef.current.y
    };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setOffset({ x: d.ox + (event.clientX - d.x), y: d.oy + (event.clientY - d.y) });
  };
  const endPan = () => {
    dragRef.current = null;
  };

  const onDoubleClick = (event: React.MouseEvent) => {
    if (scaleRef.current > MIN_SCALE) {
      resetZoom();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const cx = event.clientX - rect.left - rect.width / 2;
    const cy = event.clientY - rect.top - rect.height / 2;
    zoomTo(2.5, cx, cy);
  };

  const display = capture ? statusDisplay(capture.status, capture.plantType) : null;
  const size = capture ? formatSize(capture.sizeBytes) : null;
  // 1-based position for the "N of M" caption (only read while open).
  const position = open ? index + 1 : 0;
  const zoomed = scale > MIN_SCALE;

  return (
    <dialog
      ref={ref}
      onClose={() => {
        setFullscreen(false);
        onClose();
      }}
      onCancel={(event) => {
        // Escape exits the fullscreen viewer first; only a second Escape (or the
        // close button) dismisses the whole modal.
        if (fullscreen) {
          event.preventDefault();
          setFullscreen(false);
        }
      }}
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

            {/* Expand to the fullscreen zoom viewer. */}
            {capture.imageUrl ? (
              <button
                type="button"
                onClick={() => setFullscreen(true)}
                aria-label="View fullscreen"
                className="absolute right-3 top-3 rounded-full bg-base-100/90 p-2 text-neutral shadow-md transition hover:bg-base-100"
              >
                <ExpandIcon />
              </button>
            ) : null}

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

      {/* Fullscreen zoom/pan viewer — covers the whole viewport above the
          detail panel. Only mounts while toggled and the capture has an image. */}
      {fullscreen && capture?.imageUrl ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-neutral">
          {/* Top control bar */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-base-100">
            <span className="text-sm text-base-100/70">
              {Math.round(scale * 100)}%
            </span>
            <div className="flex items-center gap-1">
              <ZoomButton
                label="Zoom out"
                onClick={() => zoomTo(scaleRef.current / 1.4)}
                disabled={!zoomed}
              >
                <MinusIcon />
              </ZoomButton>
              <ZoomButton
                label="Reset zoom"
                onClick={resetZoom}
                disabled={!zoomed}
              >
                <span className="px-1 text-xs font-semibold">Fit</span>
              </ZoomButton>
              <ZoomButton label="Zoom in" onClick={() => zoomTo(scaleRef.current * 1.4)}>
                <PlusIcon />
              </ZoomButton>
              <ZoomButton label="Exit fullscreen" onClick={() => setFullscreen(false)}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </ZoomButton>
            </div>
          </div>

          {/* Image stage */}
          <div
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onDoubleClick={onDoubleClick}
            className={`relative flex flex-1 select-none items-center justify-center overflow-hidden ${
              zoomed ? (dragRef.current ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not a static asset */}
            <img
              alt={capture.plantType ?? "Capture"}
              src={capture.imageUrl}
              draggable={false}
              className="max-h-full max-w-full object-contain"
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                willChange: "transform"
              }}
            />

            {/* Prev / next still available in fullscreen. */}
            <button
              type="button"
              onClick={() => hasPrev && onNavigate(index - 1)}
              disabled={!hasPrev}
              aria-label="Previous capture"
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-base-100/85 p-2.5 text-neutral shadow-md transition hover:bg-base-100 disabled:pointer-events-none disabled:opacity-0"
            >
              <ArrowRight size={20} className="rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => hasNext && onNavigate(index + 1)}
              disabled={!hasNext}
              aria-label="Next capture"
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-base-100/85 p-2.5 text-neutral shadow-md transition hover:bg-base-100 disabled:pointer-events-none disabled:opacity-0"
            >
              <ArrowRight size={20} />
            </button>
          </div>

          <div className="px-4 py-3 text-center text-xs text-base-100/45">
            Scroll or double-click to zoom · drag to pan · {position} of {captures.length}
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

function ZoomButton({
  label,
  onClick,
  disabled,
  children
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex h-9 min-w-9 items-center justify-center rounded-md text-base-100/80 transition-colors hover:bg-base-100/10 hover:text-base-100 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function ExpandIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M5 12h14" />
    </svg>
  );
}
