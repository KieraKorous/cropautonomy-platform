import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { ChromeLayout } from "../components/ChromeLayout.js";
import {
  deleteCapture,
  listQueued,
  patchCapture,
  type QueuedCaptureRecord
} from "../lib/db.js";
import { kickUploadWorker } from "../lib/upload.js";

// The queue page is what gives the offline mode credibility — the operator
// can see exactly what hasn't shipped yet, retry, or drop something they
// don't want to upload.

export function QueuePage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<QueuedCaptureRecord[]>([]);

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
          {records.map((record) => (
            <li
              key={record.id}
              className="flex items-center gap-3 rounded-md border border-base-content/10 bg-base-100 px-3 py-3"
            >
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
                  {labelForMedia(record.mediaType, record.burstIndex)}
                </span>
                <span className="text-xs text-base-content/55">
                  {formatBytes(record.sizeBytes)} ·{" "}
                  {new Date(record.capturedAt).toLocaleTimeString()}
                </span>
                {record.lastError && (
                  <span className="mt-1 text-xs text-error">{record.lastError}</span>
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
            </li>
          ))}
        </ul>
      </div>
    </ChromeLayout>
  );
}

function labelForMedia(mediaType: string, burstIndex?: number): string {
  if (mediaType === "burst_frame") return `Burst frame ${(burstIndex ?? 0) + 1}`;
  if (mediaType === "video") return "Video";
  return "Photo";
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
