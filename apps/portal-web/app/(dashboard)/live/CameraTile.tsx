"use client";

import { StatusPill, type Tone } from "@gaia/ui";
import { useEffect, useRef } from "react";

import type { LiveSessionSummary } from "../../../lib/api";
import { useLiveViewer } from "../../../lib/useLiveViewer";

export interface CameraTileProps {
  session: LiveSessionSummary;
  orgId: string;
  viewerUserId: string;
  focused: boolean;
  compact: boolean;
  onToggleFocus: () => void;
}

// One camera = one viewer-side peer connection to a live session's publisher.
// Tiles stay mounted across focus changes (LiveWall only restyles them), so the
// stream survives when you widen or shrink a camera.
export function CameraTile({
  session,
  orgId,
  viewerUserId,
  focused,
  compact,
  onToggleFocus
}: CameraTileProps) {
  const { stream, connectionState } = useLiveViewer({
    orgId,
    sessionId: session.sessionId,
    viewerUserId,
    enabled: true
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (el && el.srcObject !== stream) {
      el.srcObject = stream;
    }
  }, [stream]);

  const badge = statusBadge(session, connectionState, stream != null);

  return (
    <button
      type="button"
      onClick={onToggleFocus}
      aria-pressed={focused}
      title={focused ? "Shrink camera" : "Widen camera"}
      className="group relative block w-full overflow-hidden rounded-xl border border-base-content/10 bg-neutral text-left transition-shadow hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <div className="relative aspect-video w-full">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full bg-neutral object-cover"
        />
        {!stream ? (
          <div className="absolute inset-0 flex items-center justify-center text-xs font-medium text-base-100/70">
            {connectionLabel(connectionState)}
          </div>
        ) : null}
        <div className="absolute right-2 top-2">
          <StatusPill tone={badge.tone} label={badge.label} />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-neutral/90 via-neutral/40 to-transparent px-3 pb-2 pt-8">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-base-100">
            {session.operatorName}
          </p>
          {!compact ? (
            <p className="truncate text-xs text-base-100/70">
              {session.fieldName ?? session.farmName ?? "Field session"}
            </p>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function statusBadge(
  session: LiveSessionSummary,
  connectionState: RTCPeerConnectionState | "idle",
  hasStream: boolean
): { tone: Tone; label: string } {
  if (session.status === "paused") return { tone: "muted", label: "Paused" };
  if (hasStream && connectionState === "connected") {
    return { tone: "success", label: "Live" };
  }
  // Widen to string: the exact members of RTCPeerConnectionState ("closed" /
  // "new") vary by lib.dom version, and we don't want a build to depend on it.
  const cs = connectionState as string;
  if (cs === "failed" || cs === "disconnected" || cs === "closed") {
    return { tone: "muted", label: "Reconnecting" };
  }
  return { tone: "accent", label: "Connecting" };
}

function connectionLabel(connectionState: RTCPeerConnectionState | "idle"): string {
  switch (connectionState as string) {
    case "failed":
    case "disconnected":
    case "closed":
      return "No signal";
    case "connected":
      return "Waiting for video…";
    default:
      return "Connecting…";
  }
}
