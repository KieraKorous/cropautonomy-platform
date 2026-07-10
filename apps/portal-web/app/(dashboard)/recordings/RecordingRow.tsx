import { StatusPill } from "@gaia/ui";

import type { CaptureSummary } from "../../../lib/api";
import { DownloadButton } from "../_components/DownloadButton";
import {
  dateFormat,
  formatDuration,
  formatSize,
  recordingStatusDisplay,
  severityDisplay
} from "../captures/captureDisplay";
import { RecordingDiscardButton } from "./RecordingDiscardButton";

// One row in the recordings table. Clicking the row (anywhere but the action
// buttons) opens the player lightbox. Mirrors captures/CaptureRow, adapted for
// video: a play affordance instead of an image, plus duration/size subtext.
export function RecordingRow({
  recording,
  onOpen,
  selected,
  onToggleSelect
}: {
  recording: CaptureSummary;
  onOpen: () => void;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const status = recordingStatusDisplay(recording.status);
  const duration = formatDuration(recording.videoDurationMs);
  const size = formatSize(recording.sizeBytes);
  const ready = recording.imageUrl != null;

  return (
    <tr
      onClick={onOpen}
      className={`cursor-pointer border-t border-base-content/10 align-middle transition-colors hover:bg-base-content/[0.03] ${
        selected ? "bg-accent/[0.06]" : ""
      }`}
    >
      {/* Stop propagation so ticking the box doesn't open the lightbox. */}
      <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label="Select recording"
          className="h-4 w-4 cursor-pointer accent-accent"
        />
      </td>
      <td className="px-3 py-2.5">
        <div className="relative flex h-14 w-20 items-center justify-center overflow-hidden rounded-md bg-neutral text-base-100/70">
          <PlayGlyph />
          {duration ? (
            <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-neutral/80 px-1 text-[10px] font-semibold text-base-100">
              {duration}
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-neutral">
            {dateFormat.format(new Date(recording.capturedAt))}
          </span>
          <span className="text-xs text-base-content/55">
            Recording{size ? ` · ${size}` : ""}
          </span>
        </div>
      </td>
      <td className="px-3 py-2.5">
        {status.pill ? (
          <StatusPill label={status.pill.label} tone={status.pill.tone} />
        ) : recording.status === "failed" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-error/15 px-2.5 py-1 text-xs font-semibold text-error">
            <span className="h-1.5 w-1.5 rounded-full bg-error" />
            Failed
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2.5">
        {recording.severity ? (
          (() => {
            const sev = severityDisplay(recording.severity);
            return (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${sev.badgeClass}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${sev.dotClass}`} />
                {sev.label}
              </span>
            );
          })()
        ) : (
          <span className="text-xs text-base-content/40">—</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className="text-sm text-base-content/80">
          {recording.capturedByName ?? <span className="text-base-content/40">—</span>}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span className="text-sm text-base-content/80">
          {recording.farmName ?? <span className="text-base-content/40">—</span>}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <span className="text-sm text-base-content/80">
          {recording.fieldName ?? <span className="text-base-content/40">—</span>}
        </span>
      </td>
      {/* Stop propagation so download/discard don't also open the lightbox. */}
      <td className="px-3 py-2.5 text-right" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-end">
          {ready ? <DownloadButton captureId={recording.id} /> : null}
          <RecordingDiscardButton recordingId={recording.id} />
        </div>
      </td>
    </tr>
  );
}

function PlayGlyph() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
