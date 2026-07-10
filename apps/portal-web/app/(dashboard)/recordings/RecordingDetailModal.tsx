"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { CaptureSummary, TeamSummary } from "../../../lib/api";
import { DownloadButton } from "../_components/DownloadButton";
import { TeamMultiSelect } from "../_components/TeamMultiSelect";
import { setCaptureTeamAction } from "../captures/actions";
import {
  dateFormat,
  formatDuration,
  formatSize,
  recordingStatusDisplay
} from "../captures/captureDisplay";

function titleCase(value: string): string {
  const s = value.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Player lightbox for a recording. Driven by an index into the (already sorted)
// list so prev/next is just walking the array. Mirrors captures/CaptureDetailModal
// but for video — plays the clip inline, no image zoom. `index === null` = closed.
export function RecordingDetailModal({
  recordings,
  index,
  teams,
  canAssignTeams,
  onClose,
  onNavigate
}: {
  recordings: CaptureSummary[];
  index: number | null;
  teams: TeamSummary[];
  canAssignTeams: boolean;
  onClose: () => void;
  onNavigate: (nextIndex: number) => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);

  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [teamBusy, setTeamBusy] = useState<string | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);

  const open = index != null;
  const recording = open ? recordings[index] : null;
  const hasPrev = open && index > 0;
  const hasNext = open && index < recordings.length - 1;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Re-seed the team selector whenever a different recording is shown.
  const recordingId = recording?.id;
  useEffect(() => {
    setTeamIds(recording?.teamIds ?? []);
    setTeamBusy(null);
    setTeamError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingId]);

  // Arrow keys navigate while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && hasPrev) onNavigate(index - 1);
      if (event.key === "ArrowRight" && hasNext) onNavigate(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, hasPrev, hasNext, onNavigate]);

  async function onToggleTeam(teamId: string, assigned: boolean) {
    if (!recording) return;
    const prev = teamIds;
    setTeamBusy(teamId);
    setTeamError(null);
    setTeamIds(assigned ? [...prev, teamId] : prev.filter((t) => t !== teamId));
    try {
      await setCaptureTeamAction(recording.id, teamId, assigned);
      router.refresh();
    } catch (err) {
      setTeamIds(prev);
      setTeamError(err instanceof Error ? err.message : "Couldn't update the recording's teams.");
    } finally {
      setTeamBusy(null);
    }
  }

  const status = recording ? recordingStatusDisplay(recording.status) : null;
  const duration = recording ? formatDuration(recording.videoDurationMs) : null;
  const size = recording ? formatSize(recording.sizeBytes) : null;
  const position = open ? index + 1 : 0;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="m-auto w-[min(92vw,860px)] rounded-2xl border border-base-content/10 bg-base-100 p-0 text-neutral backdrop:bg-neutral/60"
    >
      {recording ? (
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <NavButton dir="prev" disabled={!hasPrev} onClick={() => hasPrev && onNavigate(index - 1)} />
              <NavButton dir="next" disabled={!hasNext} onClick={() => hasNext && onNavigate(index + 1)} />
              <span className="ml-1 text-xs text-base-content/45">
                {position} of {recordings.length}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1.5 text-base-content/55 transition-colors hover:bg-base-content/[0.06] hover:text-neutral"
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="overflow-hidden rounded-xl bg-neutral">
            {recording.imageUrl ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption -- field recording, no caption track
              <video
                controls
                autoPlay
                preload="metadata"
                src={recording.imageUrl}
                className="max-h-[55vh] w-full bg-neutral object-contain"
              />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center text-sm font-medium text-base-100/60">
                Processing…
              </div>
            )}
          </div>

          {recording.summary ? (
            <p className="rounded-lg border border-accent/25 bg-accent/[0.06] px-3 py-2.5 text-sm leading-relaxed text-neutral">
              <span className="mr-1.5 rounded-full bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent-content">
                AI
              </span>
              {recording.summary}
            </p>
          ) : null}

          <dl className="flex flex-col gap-3 text-sm">
            {status?.pill ? <DetailRow label="Status" value={status.pill.label} /> : null}
            {recording.observationType ? (
              <DetailRow label="Observation" value={titleCase(recording.observationType)} />
            ) : null}
            {recording.severity ? (
              <DetailRow label="Severity" value={titleCase(recording.severity)} />
            ) : null}
            <DetailRow label="Recorded" value={dateFormat.format(new Date(recording.capturedAt))} />
            {duration ? <DetailRow label="Duration" value={duration} /> : null}
            {size ? <DetailRow label="Size" value={size} /> : null}
            {recording.capturedByName ? (
              <DetailRow label="Captured by" value={recording.capturedByName} />
            ) : null}
            {recording.farmName ? <DetailRow label="Farm" value={recording.farmName} /> : null}
            {recording.fieldName ? <DetailRow label="Field" value={recording.fieldName} /> : null}
            {!canAssignTeams && teamIds.length > 0 ? (
              <DetailRow
                label={teamIds.length > 1 ? "Teams" : "Team"}
                value={
                  teamIds
                    .map((tid) => teams.find((t) => t.id === tid)?.name)
                    .filter((n): n is string => !!n)
                    .join(", ") || "—"
                }
              />
            ) : null}
          </dl>

          {canAssignTeams ? (
            <TeamMultiSelect
              teams={teams}
              selectedIds={teamIds}
              busyId={teamBusy}
              subjectLabel="recording"
              onToggle={onToggleTeam}
            />
          ) : null}
          {teamError ? <p className="text-sm text-error">{teamError}</p> : null}

          {recording.imageUrl ? (
            <div className="mt-1 flex items-center">
              <DownloadButton captureId={recording.id} variant="button" label="Download recording" />
            </div>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}

function NavButton({
  dir,
  disabled,
  onClick
}: {
  dir: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Previous recording" : "Next recording"}
      className="rounded-md p-1.5 text-base-content/55 transition-colors hover:bg-base-content/[0.06] hover:text-neutral disabled:opacity-30"
    >
      <svg
        width={18}
        height={18}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={dir === "next" ? "rotate-180" : ""}
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
    </button>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="flex-shrink-0 text-base-content/55">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-neutral">{value}</dd>
    </div>
  );
}
