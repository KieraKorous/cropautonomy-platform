import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ChromeLayout } from "../components/ChromeLayout.js";
import { api, type ObservationType, type Severity } from "../lib/api.js";
import {
  deleteCapture,
  listQueued,
  patchCapture,
  type QueuedCaptureRecord
} from "../lib/db.js";
import { kickUploadWorker } from "../lib/upload.js";

const OBSERVATION_TYPES: { value: ObservationType; label: string }[] = [
  { value: "pest", label: "Pest" },
  { value: "disease", label: "Disease" },
  { value: "weed", label: "Weed" },
  { value: "nutrient", label: "Nutrient" },
  { value: "irrigation", label: "Irrigation" },
  { value: "damage", label: "Damage" },
  { value: "growth_stage", label: "Growth" },
  { value: "other", label: "Other" }
];

const SEVERITIES: { value: Severity; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" }
];

// The queue page is what gives the offline mode credibility — the operator
// can see exactly what hasn't shipped yet, retry, or drop something they
// don't want to upload.

export function QueuePage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<QueuedCaptureRecord[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function refresh() {
      const all = await listQueued();
      if (alive) setRecords(all);
    }
    void refresh();
    const interval = setInterval(refresh, 1000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  const pending = records.filter((r) => r.status !== "synced");
  const totalBytes = pending.reduce((acc, r) => acc + r.sizeBytes, 0);
  const hasFailed = records.some((r) => r.status === "failed");

  async function retryFailed() {
    for (const record of records) {
      if (record.status === "failed") {
        await patchCapture(record.id, { status: "queued", lastError: undefined });
      }
    }
    kickUploadWorker();
  }

  // Persist annotation locally so it rides along on reserve; if the capture is
  // already reserved on the server, also PATCH it (the reserve already shipped
  // without these fields). Optimistically reflect the change in local state so
  // the controls don't wait a refresh tick.
  async function saveAnnotation(
    record: QueuedCaptureRecord,
    patch: Partial<
      Pick<QueuedCaptureRecord, "description" | "observationType" | "severity">
    >
  ) {
    setRecords((prev) =>
      prev.map((r) => (r.id === record.id ? { ...r, ...patch } : r))
    );
    await patchCapture(record.id, patch);
    if (record.remoteCaptureId) {
      try {
        await api.updateCapture(record.remoteCaptureId, {
          description: patch.description,
          observationType: patch.observationType,
          severity: patch.severity
        });
      } catch {
        // Non-fatal: the local record keeps the annotation; the operator can
        // re-edit from the portal once synced.
      }
    }
  }

  return (
    <ChromeLayout
      eyebrow="Upload queue"
      title={`${pending.length} pending · ${formatBytes(totalBytes)}`}
      headerAction={
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="hidden h-11 items-center rounded-md bg-neutral px-4 text-sm font-semibold text-neutral-content sm:flex"
        >
          Done
        </button>
      }
    >
      <div className="flex h-full flex-col gap-4 px-5 pb-6 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => kickUploadWorker()}
            className="flex h-12 items-center rounded-md border border-base-content/15 px-4 text-sm font-semibold text-neutral hover:bg-base-content/[0.04]"
          >
            Retry uploads
          </button>
          {hasFailed && (
            <button
              type="button"
              onClick={retryFailed}
              className="flex h-12 items-center rounded-md border border-warning/40 bg-warning/10 px-4 text-sm font-semibold text-warning"
            >
              Retry all failed
            </button>
          )}
        </div>

        <ul className="flex flex-col gap-2 overflow-y-auto">
          {records.length === 0 && (
            <li className="rounded-md border border-dashed border-base-content/15 px-4 py-10 text-center text-sm text-base-content/55">
              No captures in the queue.
            </li>
          )}
          {records.map((record) => {
            const expanded = expandedId === record.id;
            const annotated =
              !!record.description ||
              !!record.observationType ||
              !!record.severity;
            return (
              <li
                key={record.id}
                className="flex flex-col rounded-md border border-base-content/10 bg-base-100"
              >
                <div className="flex items-center gap-3 px-3 py-3">
                  {record.thumbnailDataUrl ? (
                    <img
                      src={record.thumbnailDataUrl}
                      alt=""
                      className="h-14 w-14 flex-shrink-0 rounded object-cover"
                    />
                  ) : (
                    <div className="grid h-14 w-14 flex-shrink-0 place-items-center rounded bg-base-content/[0.06] text-base-content/55">
                      <CameraIcon />
                    </div>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium text-neutral">
                      {labelForMedia(record.mediaType, record.burstIndex, record.kind)}
                    </span>
                    <span className="text-xs text-base-content/55">
                      {formatBytes(record.sizeBytes)} ·{" "}
                      {new Date(record.capturedAt).toLocaleTimeString()}
                    </span>
                    {record.lastError && (
                      <span className="mt-1 text-xs text-error">
                        {record.lastError}
                      </span>
                    )}
                  </div>
                  <StatusBadge status={record.status} />
                  {record.status === "failed" && (
                    <button
                      type="button"
                      onClick={() => deleteCapture(record.id)}
                      className="flex h-11 items-center px-3 text-xs font-semibold text-base-content/55 hover:text-error"
                      aria-label="Discard capture"
                    >
                      Drop
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : record.id)}
                  className="flex items-center justify-between border-t border-base-content/[0.07] px-3 py-2 text-xs font-semibold text-base-content/60 hover:text-neutral"
                >
                  <span>
                    {annotated ? "Edit details" : "Add details"}
                    {annotated && (
                      <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-success align-middle" />
                    )}
                  </span>
                  <Chevron open={expanded} />
                </button>
                {expanded && (
                  <AnnotatePanel
                    record={record}
                    onSave={(patch) => saveAnnotation(record, patch)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </ChromeLayout>
  );
}

function labelForMedia(
  mediaType: string,
  burstIndex?: number,
  kind?: string
): string {
  if (kind === "session_recording") return "Session recording";
  if (mediaType === "burst_frame") return `Burst frame ${(burstIndex ?? 0) + 1}`;
  if (mediaType === "video") return "Video";
  return "Photo";
}

function AnnotatePanel({
  record,
  onSave
}: {
  record: QueuedCaptureRecord;
  onSave: (
    patch: Partial<
      Pick<QueuedCaptureRecord, "description" | "observationType" | "severity">
    >
  ) => void;
}) {
  const [note, setNote] = useState(record.description ?? "");

  return (
    <div className="flex flex-col gap-3 border-t border-base-content/[0.07] px-3 pb-4 pt-3">
      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-base-content/45">
          Observation
        </span>
        <div className="flex flex-wrap gap-1.5">
          {OBSERVATION_TYPES.map((opt) => {
            const active = record.observationType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  onSave({ observationType: active ? undefined : opt.value })
                }
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  active
                    ? "bg-neutral text-neutral-content"
                    : "bg-base-content/[0.06] text-base-content/65"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-base-content/45">
          Severity
        </span>
        <div className="flex gap-1.5">
          {SEVERITIES.map((opt) => {
            const active = record.severity === opt.value;
            const tone =
              opt.value === "high"
                ? "bg-error text-error-content"
                : opt.value === "medium"
                  ? "bg-warning text-warning-content"
                  : "bg-success text-success-content";
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onSave({ severity: active ? undefined : opt.value })}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold ${
                  active ? tone : "bg-base-content/[0.06] text-base-content/65"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-base-content/45">
          Note
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if ((record.description ?? "") !== note) onSave({ description: note });
          }}
          rows={2}
          maxLength={4000}
          placeholder="Symptoms, location, follow-up…"
          className="w-full rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm text-neutral placeholder:text-base-content/40 focus:border-neutral focus:outline-none"
        />
      </div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={open ? "rotate-180 transition-transform" : "transition-transform"}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function StatusBadge({ status }: { status: QueuedCaptureRecord["status"] }) {
  const map: Record<QueuedCaptureRecord["status"], { label: string; tone: string }> = {
    queued: { label: "Queued", tone: "bg-base-content/[0.06] text-base-content/65" },
    reserving: { label: "Reserving", tone: "bg-info/15 text-info" },
    uploading: { label: "Uploading", tone: "bg-info/15 text-info" },
    finalizing: { label: "Finalizing", tone: "bg-info/15 text-info" },
    synced: { label: "Synced", tone: "bg-success/15 text-success" },
    failed: { label: "Failed", tone: "bg-error/15 text-error" }
  };
  const item = map[status];
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.tone}`}>
      {item.label}
    </span>
  );
}

function CameraIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
