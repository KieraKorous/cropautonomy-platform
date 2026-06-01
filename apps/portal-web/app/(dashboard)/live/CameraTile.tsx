"use client";

import { StatusPill, type Tone } from "@gaia/ui";
import { useEffect, useRef, useState } from "react";

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
//
// A watcher can disconnect a single camera: `connected` drives the viewer hook's
// `enabled` flag, which tears down this tile's peer (and tells the publisher to
// drop us) without touching the operator's session or any other tile. Flipping
// it back re-announces our join and the publisher offers a fresh peer.
export function CameraTile({
  session,
  orgId,
  viewerUserId,
  focused,
  compact,
  onToggleFocus
}: CameraTileProps) {
  const [connected, setConnected] = useState(true);

  const { stream, connectionState } = useLiveViewer({
    orgId,
    sessionId: session.sessionId,
    viewerUserId,
    enabled: connected
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (el && el.srcObject !== stream) {
      el.srcObject = stream;
    }
  }, [stream]);

  const badge = statusBadge(connected, session, connectionState, stream != null);

  return (
    <div className="group relative block w-full overflow-hidden rounded-xl border border-base-content/10 bg-neutral text-left transition-shadow hover:shadow-lg">
      <div className="relative aspect-video w-full">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full bg-neutral object-cover"
        />

        {/* Connecting state (only while connected and waiting for media). */}
        {connected && !stream ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium text-base-100/70">
            {connectionLabel(connectionState)}
          </div>
        ) : null}

        {/* Status pill, top-right. */}
        <div className="absolute right-2 top-2 z-20">
          <StatusPill tone={badge.tone} label={badge.label} />
        </div>

        {/* Focus toggle — a transparent layer over the video so the disconnect
            control can be a sibling rather than an (invalid) nested button. */}
        <button
          type="button"
          onClick={onToggleFocus}
          aria-pressed={focused}
          aria-label={focused ? "Shrink camera" : "Widen camera"}
          title={focused ? "Shrink camera" : "Widen camera"}
          className="absolute inset-0 z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        />

        {/* Disconnect, top-left — mirrors the status pill. */}
        {connected ? (
          <button
            type="button"
            onClick={() => setConnected(false)}
            aria-label="Disconnect camera"
            title="Disconnect camera"
            className="absolute left-2 top-2 z-20 inline-flex items-center justify-center rounded-md bg-neutral/45 p-1.5 text-base-100/80 backdrop-blur-sm transition-colors hover:bg-error/80 hover:text-error-content"
          >
            <PowerIcon />
          </button>
        ) : null}

        {/* Disconnected overlay with a Reconnect affordance. */}
        {!connected ? (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2.5 bg-neutral/70">
            <p className="text-xs font-medium text-base-100/70">Camera disconnected</p>
            <button
              type="button"
              onClick={() => setConnected(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-content transition-colors hover:bg-primary/90"
            >
              <PlayIcon />
              Reconnect
            </button>
          </div>
        ) : null}

        {/* Operator label — non-interactive, clicks fall through to focus. */}
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
      </div>
    </div>
  );
}

function statusBadge(
  connected: boolean,
  session: LiveSessionSummary,
  connectionState: RTCPeerConnectionState | "idle",
  hasStream: boolean
): { tone: Tone; label: string } {
  if (!connected) return { tone: "muted", label: "Disconnected" };
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

// Local glyphs — packages/ui has no power/play icon, and these are tile-specific.
function PowerIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2v10" />
      <path d="M5.6 6.6a9 9 0 1 0 12.8 0" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
