"use client";

import { channels } from "@gaia/realtime/channels";
import { useRealtimeChannel } from "@gaia/realtime/client";
import { BrainIcon, CameraIcon, StatusPill } from "@gaia/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";

import type { CaptureStatus, CaptureSummary } from "../../../lib/api";

export interface RecentScansLiveProps {
  orgId: string;
  initialCaptures: CaptureSummary[];
  // captureId field is a uuid; this resolves field uuids to display names.
  fieldNames: Record<string, string>;
}

// Recent captures, seeded from the server and kept fresh over the org-wide
// active-sessions channel. There is no org-wide per-capture fanout yet, so when
// a session ends having recorded captures we re-run the server fetch rather than
// reconstruct a full CaptureSummary from the thin event. See the plan's Stage 3.
export function RecentScansLive({ orgId, initialCaptures, fieldNames }: RecentScansLiveProps) {
  const router = useRouter();
  const { latest } = useRealtimeChannel(channels.orgActiveSessions(orgId), {
    historyLimit: 1,
    enabled: Boolean(orgId)
  });
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!latest) return;
    if (latest.type === "capture.session.ended" && latest.payload.totalCaptures > 0) {
      const id = latest.payload.sessionId;
      if (seen.current.has(id)) return;
      seen.current.add(id);
      router.refresh();
    }
  }, [latest, router]);

  return (
    <section className="overflow-hidden rounded-xl border border-base-content/10 bg-base-100">
      <header className="flex items-center justify-between border-b border-base-content/10 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-neutral">Recent scans</h2>
          <p className="text-xs text-base-content/60">
            Latest captures across drones, rovers, and mobile.
          </p>
        </div>
        <a className="text-sm font-medium text-primary" href="/captures">
          All captures →
        </a>
      </header>

      {initialCaptures.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-base-content/55">
          No captures yet. They appear here the moment a device or phone records one.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_180px_160px_140px] gap-3 border-b border-base-content/8 bg-base-content/[0.03] px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-base-content/55">
            <span>Scan</span>
            <span>Field</span>
            <span>Observation</span>
            <span>Status</span>
          </div>
          <ul>
            {initialCaptures.map((capture, idx) => {
              const status = statusPresentation(capture.status);
              return (
                <li
                  className={`grid grid-cols-[1fr_180px_160px_140px] items-center gap-3 px-5 py-3.5 ${
                    idx === initialCaptures.length - 1 ? "" : "border-b border-base-content/6"
                  }`}
                  key={capture.id}
                >
                  <ScanLead
                    icon={capture.kind === "session_recording" ? <BrainIcon size={16} /> : <CameraIcon size={16} />}
                    subtitle={relativeTime(capture.capturedAt)}
                    title={capture.summary ?? capture.plantType ?? "Capture"}
                  />
                  <Stack
                    subtitle={capture.plantType ?? capture.mediaType}
                    title={(capture.fieldId && fieldNames[capture.fieldId]) || "—"}
                  />
                  <span className="truncate text-sm text-base-content/70">
                    {observationLabel(capture)}
                  </span>
                  <div>
                    <StatusPill label={status.label} tone={status.tone} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function ScanLead({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-base-content/[0.06] text-base-content/70">
        {icon}
      </span>
      <Stack subtitle={subtitle} title={title} />
    </div>
  );
}

function Stack({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate text-sm font-medium text-neutral">{title}</span>
      <span className="truncate text-xs text-base-content/55">{subtitle}</span>
    </div>
  );
}

function observationLabel(capture: CaptureSummary): string {
  if (!capture.observationType) return "—";
  const type = capture.observationType.replace(/_/g, " ");
  return capture.severity ? `${type} · ${capture.severity}` : type;
}

function statusPresentation(
  status: CaptureStatus
): { label: string; tone: "primary" | "accent" | "secondary" | "success" | "muted" } {
  switch (status) {
    case "analyzed":
      return { label: "Analyzed", tone: "success" };
    case "analysis_running":
      return { label: "Analyzing", tone: "primary" };
    case "uploaded":
    case "analysis_queued":
      return { label: "Queued", tone: "secondary" };
    case "failed":
      return { label: "Failed", tone: "accent" };
    default:
      return { label: "Uploading", tone: "muted" };
  }
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
