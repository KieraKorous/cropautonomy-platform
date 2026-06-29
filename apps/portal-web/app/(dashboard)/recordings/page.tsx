import { StatusPill, type Tone } from "@gaia/ui";

import { ApiError, listRecordings, type CaptureSummary } from "../../../lib/api";
import { DownloadButton } from "../_components/DownloadButton";
import { dateFormat } from "../captures/captureDisplay";
import { RecordingDiscardButton } from "./RecordingDiscardButton";

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

// Saved live-feed recordings — kind='session_recording' video captures, from
// either the field phone (during a live session) or a portal watcher recording
// the stream. Kept apart from the Captures grid (those are still observations).
export const dynamic = "force-dynamic";

function formatDuration(ms: number | null): string | null {
  if (ms == null || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSize(bytes: number | null): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function RecordingsPage() {
  let recordings: CaptureSummary[] = [];
  let loadError: string | null = null;

  try {
    const result = await listRecordings({ limit: 50 });
    recordings = result.captures;
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? err.message
        : "Could not reach the captures service.";
  }

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-base-content/10 pb-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral">Recordings</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
            Saved live-session recordings — captured on the operator&apos;s phone or
            recorded from the live wall.
          </p>
        </div>
        {!loadError && recordings.length > 0 ? (
          <span className="text-sm text-base-content/55">
            {recordings.length} {recordings.length === 1 ? "recording" : "recordings"}
          </span>
        ) : null}
      </header>

      {loadError ? (
        <ErrorState message={loadError} />
      ) : recordings.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {recordings.map((rec) => (
            <RecordingCard key={rec.id} recording={rec} />
          ))}
        </div>
      )}
    </div>
  );
}

function RecordingCard({ recording }: { recording: CaptureSummary }) {
  const duration = formatDuration(recording.videoDurationMs);
  const size = formatSize(recording.sizeBytes);
  const ready = recording.imageUrl != null;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-base-content/10 bg-base-100">
      <div className="relative aspect-video bg-neutral">
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
            {recording.fieldId ? "Field session" : "Live session"}
            {size ? ` · ${size}` : ""}
          </span>
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
              tone={
                recording.severity ? severityTone[recording.severity] ?? "muted" : "muted"
              }
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
    </article>
  );
}

function EmptyState() {
  return (
    <section className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-12 text-center">
      <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
        No recordings yet
      </span>
      <p className="max-w-md text-sm text-base-content/65">
        Start a live session and tap Record on the phone, or hit Rec on a camera
        tile on the Live wall. Saved recordings appear here.
      </p>
    </section>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-8">
      <span className="rounded-full bg-error/15 px-2.5 py-1 text-xs font-semibold text-error">
        Off the grid
      </span>
      <h2 className="text-base font-semibold text-neutral">
        We&apos;ve lost the line to the field.
      </h2>
      <p className="max-w-xl text-sm text-base-content/65">
        Recordings aren&apos;t loading right now. Refresh in a moment — if it keeps happening,
        make sure you have an active organization or try again shortly.
      </p>
      <p className="text-xs text-base-content/40">{message}</p>
    </section>
  );
}
