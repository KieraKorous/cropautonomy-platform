"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraIcon } from "@gaia/ui";
import type { Finding, Severity } from "../../../../lib/api";

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

// Severity → box border color (gaia-field DaisyUI tokens). Matches the marker
// colors in CaptureFindings so a box and its list row read as one thing.
function boxBorder(severity: Severity | null): string {
  switch (severity) {
    case "high":
      return "border-error";
    case "medium":
      return "border-warning";
    case "low":
      return "border-info";
    default:
      return "border-base-100";
  }
}
function markerBg(severity: Severity | null): string {
  switch (severity) {
    case "high":
      return "bg-error text-error-content";
    case "medium":
      return "bg-warning text-warning-content";
    case "low":
      return "bg-info text-info-content";
    default:
      return "bg-neutral text-base-100";
  }
}

// The detail page's main image, with an expand-to-fullscreen viewer that mirrors
// the captures lightbox: wheel / button / double-click zoom and drag-to-pan.
// Self-contained (no prev/next) since the detail page shows a single capture.
// `findings` (issue findings, in the same order as the CaptureFindings list) are
// drawn as numbered boxes over the inline image; those without a bbox are skipped.
export function CaptureImage({
  imageUrl,
  alt,
  findings = []
}: {
  imageUrl: string | null;
  alt: string;
  findings?: Finding[];
}) {
  // Number matches the list row (1-based index into the full issue list); only
  // findings with a bbox get a box.
  const boxes = findings
    .map((finding, i) => ({ finding, n: i + 1 }))
    .filter((b) => b.finding.boundingBox != null);
  const [fullscreen, setFullscreen] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  // Whether the viewer is in true OS-level fullscreen (Fullscreen API), distinct
  // from the in-page `fullscreen` overlay which only fills the browser viewport.
  const [nativeFs, setNativeFs] = useState(false);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);
  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  const resetZoom = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  // Each time the viewer opens, start fit-to-screen.
  useEffect(() => {
    if (fullscreen) resetZoom();
  }, [fullscreen, resetZoom]);

  // Zoom toward a point (cx, cy relative to the stage centre) so the pixel under
  // the cursor stays put. Defaults to zooming about the centre.
  const zoomTo = useCallback(
    (nextScale: number, cx = 0, cy = 0) => {
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
    },
    [resetZoom]
  );

  // Close the viewer, first dropping OS fullscreen if we're in it.
  const closeViewer = useCallback(() => {
    if (typeof document !== "undefined" && document.fullscreenElement) {
      void document.exitFullscreen();
    }
    setFullscreen(false);
  }, []);

  // Toggle true OS-level fullscreen on the viewer root (fills the whole display,
  // hiding browser/OS chrome). Falls back silently where unsupported.
  const toggleNativeFs = useCallback(() => {
    const el = overlayRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen?.();
    }
  }, []);

  // Keep nativeFs in sync however fullscreen is entered/exited (button, Esc, F11).
  useEffect(() => {
    const onChange = () => setNativeFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Escape exits the viewer. When in OS fullscreen, the first Esc lets the
  // browser drop fullscreen (keeping the overlay open); a second Esc closes it.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.fullscreenElement) return;
      setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  // Wheel zoom anchored to the cursor; non-passive so we can preventDefault.
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

  const zoomed = scale > MIN_SCALE;

  return (
    <>
      <div className="relative w-full overflow-hidden rounded-xl border border-base-content/10 bg-neutral/95 lg:w-3/5 lg:self-start lg:sticky lg:top-6">
        {imageUrl ? (
          // Image fills the frame width by default; the wrapper hugs the rendered
          // image box so the overlay's inset-0 maps normalized 0..1 bbox coords
          // straight onto it. Tall portraits are height-capped and letterboxed.
          <div className="relative w-full">
            {/* Click anywhere on the image to open the fullscreen zoom/pan viewer.
                eslint-disable-next-line @next/next/no-img-element -- signed Storage URL, not a static asset */}
            <img
              alt={alt}
              onClick={() => setFullscreen(true)}
              className="block max-h-[82vh] w-full cursor-zoom-in object-contain"
              src={imageUrl}
            />
            {boxes.length > 0 ? (
              <div className="pointer-events-none absolute inset-0">
                {boxes.map(({ finding, n }) => {
                  const box = finding.boundingBox!;
                  return (
                    <div
                      key={finding.id}
                      className={`absolute rounded-sm border-2 ${boxBorder(finding.severity)}`}
                      style={{
                        left: `${box.x * 100}%`,
                        top: `${box.y * 100}%`,
                        width: `${box.w * 100}%`,
                        height: `${box.h * 100}%`
                      }}
                    >
                      <span
                        className={`absolute -left-2 -top-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold shadow ${markerBg(finding.severity)}`}
                      >
                        {n}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex min-h-[50vh] w-full items-center justify-center text-base-100/30">
            <CameraIcon size={56} />
          </div>
        )}

        {imageUrl ? (
          <>
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              aria-label="View fullscreen"
              className="absolute right-3 top-3 rounded-full bg-base-100/90 p-2 text-neutral shadow-md transition hover:bg-base-100"
            >
              <ExpandIcon />
            </button>
            <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-neutral/70 px-2.5 py-1 text-[11px] font-medium text-base-100/90">
              Click to zoom
            </span>
          </>
        ) : null}
      </div>

      {fullscreen && imageUrl ? (
        <div ref={overlayRef} className="fixed inset-0 z-50 flex flex-col bg-neutral">
          {/* Top control bar */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-base-100">
            <span className="text-sm text-base-100/70">{Math.round(scale * 100)}%</span>
            <div className="flex items-center gap-1">
              <ZoomButton label="Zoom out" onClick={() => zoomTo(scaleRef.current / 1.4)} disabled={!zoomed}>
                <MinusIcon />
              </ZoomButton>
              <ZoomButton label="Reset zoom" onClick={resetZoom} disabled={!zoomed}>
                <span className="px-1 text-xs font-semibold">Fit</span>
              </ZoomButton>
              <ZoomButton label="Zoom in" onClick={() => zoomTo(scaleRef.current * 1.4)}>
                <PlusIcon />
              </ZoomButton>
              <ZoomButton
                label={nativeFs ? "Exit full screen" : "Full screen"}
                onClick={toggleNativeFs}
              >
                {nativeFs ? <FullscreenExitIcon /> : <ExpandIcon />}
              </ZoomButton>
              <ZoomButton label="Close" onClick={closeViewer}>
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
              alt={alt}
              src={imageUrl}
              draggable={false}
              className="max-h-full max-w-full object-contain"
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                willChange: "transform"
              }}
            />
          </div>

          <div className="px-4 py-3 text-center text-xs text-base-100/45">
            Scroll or double-click to zoom · drag to pan · full screen fills your display
          </div>
        </div>
      ) : null}
    </>
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

function FullscreenExitIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
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
