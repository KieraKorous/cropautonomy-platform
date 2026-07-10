import { StatusPill, type Tone } from "@gaia/ui";

import type { CaptureSummary, TeamSummary } from "../../../lib/api";
import { DownloadButton } from "../_components/DownloadButton";
import { dateFormat, formatDuration, formatSize } from "../captures/captureDisplay";
import { RecordingDiscardButton } from "./RecordingDiscardButton";
import { RecordingTeams } from "./RecordingTeams";

// Title-case an enum value ("growth_stage" → "Growth stage") for display.
function titleCase(value: string): string {
  const s = value.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const severityTone: Record<string, Tone> = {
  high: "accent",
  medium: "secondary",
  low: "muted"
};

// Grid card for a saved recording. Plays the clip inline; the download button is
// kept front-and-center. AI brief + team filing mirror what the field team sees.
export function RecordingCard({
  recording,
  teams,
  canAssignTeams,
  selected,
  onToggleSelect
}: {
  recording: CaptureSummary;
  teams: TeamSummary[];
  canAssignTeams: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const duration = formatDuration(recording.videoDurationMs);
  const size = formatSize(recording.sizeBytes);
  const ready = recording.imageUrl != null;

  // No overflow-hidden on the card itself — the team dropdown needs to spill
  // past the bottom edge. The video rounds its own top corners instead.
  return (
    <article
      className={`flex flex-col rounded-xl border bg-base-100 ${
        selected ? "border-accent ring-1 ring-accent" : "border-base-content/10"
      }`}
    >
      <div className="relative aspect-video overflow-hidden rounded-t-xl bg-neutral">
        <label className="absolute left-2 top-2 z-10 flex cursor-pointer items-center rounded bg-base-100/85 p-1 shadow-sm">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            aria-label="Select recording"
            className="h-4 w-4 cursor-pointer accent-accent"
          />
        </label>
        {ready ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- field recording, no caption track
          <video
            controls
            preload="metadata"
            src={recording.imageUrl ?? undefined}
            className="h-full w-full bg-neutral object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-medium text-base-100/60">
            Processing…
          </div>
        )}
        {duration ? (
          <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-neutral/80 px-1.5 py-0.5 text-[11px] font-semibold text-base-100">
            {duration}
          </span>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-1.5 px-2.5 py-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-xs font-medium text-neutral">
            {dateFormat.format(new Date(recording.capturedAt))}
          </span>
          <span className="truncate text-[11px] text-base-content/55">
            {recording.fieldName ?? (recording.fieldId ? "Field session" : "Live session")}
            {size ? ` · ${size}` : ""}
          </span>
          {recording.capturedByName ? (
            <span className="truncate text-[11px] text-base-content/45">
              by {recording.capturedByName}
            </span>
          ) : null}
        </div>
        <div className="flex flex-shrink-0 items-center">
          {ready ? <DownloadButton captureId={recording.id} /> : null}
          <RecordingDiscardButton recordingId={recording.id} />
        </div>
      </div>

      {/* AI brief — a few sentences on what the clip showed, plus any flagged
          plant issue. Populated by the video_summary pipeline; absent until the
          recording is analyzed. */}
      {recording.summary || recording.observationType ? (
        <div className="flex flex-col gap-1.5 border-t border-base-content/8 px-2.5 py-2">
          {recording.observationType ? (
            <StatusPill
              label={
                titleCase(recording.observationType) +
                (recording.severity ? ` · ${titleCase(recording.severity)}` : "")
              }
              tone={recording.severity ? severityTone[recording.severity] ?? "muted" : "muted"}
            />
          ) : null}
          {recording.summary ? (
            <p className="line-clamp-3 text-[11px] leading-relaxed text-base-content/70">
              <span className="mr-1 rounded-full bg-accent/20 px-1 py-0.5 text-[9px] font-semibold uppercase text-accent-content">
                AI
              </span>
              {recording.summary}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Which crews this recording is filed under. Managers+ only. */}
      {canAssignTeams ? (
        <RecordingTeams
          recordingId={recording.id}
          teamIds={recording.teamIds}
          teams={teams}
        />
      ) : null}
    </article>
  );
}
