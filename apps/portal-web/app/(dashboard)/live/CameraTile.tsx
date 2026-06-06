"use client";

import { capture } from "@gaia/analytics";
import { channels } from "@gaia/realtime/channels";
import { useRealtimeChannel } from "@gaia/realtime/client";
import { StatusPill, type Tone } from "@gaia/ui";
import { useEffect, useRef, useState } from "react";

import type { LiveSessionSummary } from "../../../lib/api";
import { setSessionConnectionAction } from "./actions";
import { uploadRecording } from "./recording-upload";
import { useLiveViewer } from "../../../lib/useLiveViewer";

export interface CameraTileProps {
  session: LiveSessionSummary;
  orgId: string;
  viewerUserId: string;
  focused: boolean;
  compact: boolean;
  onToggleFocus: () => void;
  // Drop this camera off the wall. Called when the camera is disconnected —
  // either by this watcher clicking Disconnect or off the realtime event when
  // another watcher (or the operator) disconnects it. Disconnected cameras leave
  // no placeholder; the operator is told in the field app and can rejoin.
  onRemove: () => void;
}

// One camera = one viewer-side peer connection to a live session's publisher.
// Tiles stay mounted across focus changes (LiveWall only restyles them), so the
// stream survives when you widen or shrink a camera.
//
// Disconnect is authoritative: it calls the API, which signals the publishing
// phone to stop sending media and persists `live_disconnected_at` on the session.
// `connected` drives the viewer hook's `enabled` flag (tearing down this tile's
// peer) AND mirrors the persisted server state, so every watcher's tile flips
// together over the capture.session.disconnected/reconnected events and the
// state survives reload. Reconnect clears it and the phone resumes publishing.
export function CameraTile({
  session,
  orgId,
  viewerUserId,
  focused,
  compact,
  onToggleFocus,
  onRemove
}: CameraTileProps) {
  // Operator-paused state, kept live off the session-state channel. When paused
  // the peer stays connected (so this tile keeps its Disconnect control) but the
  // phone stops sending video — we cover the frozen frame with a paused notice.
  const [paused, setPaused] = useState(session.status === "paused");

  const { stream, connectionState } = useLiveViewer({
    orgId,
    sessionId: session.sessionId,
    viewerUserId,
    enabled: true
  });

  // Watcher-side recording of the received WebRTC stream. Independent of the
  // phone's own session recording. On stop, the blob uploads as a video capture.
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Stop recording if the stream goes away (disconnect / session end), so we
  // don't leak a recorder bound to a dead stream.
  useEffect(() => {
    if (!stream && recorderRef.current) {
      recorderRef.current.stop();
    }
  }, [stream]);

  // live_stream_opened the first time media actually arrives for this tile, and
  // live_stream_closed when the tile unmounts (disconnect / session end / leaving
  // the page) — but only if it had opened. openedRef gates both so we never emit
  // a close without a matching open.
  const openedRef = useRef(false);
  useEffect(() => {
    if (stream && !openedRef.current) {
      openedRef.current = true;
      capture("live_stream_opened", { sessionId: session.sessionId });
    }
  }, [stream, session.sessionId]);
  useEffect(() => {
    return () => {
      if (openedRef.current) {
        capture("live_stream_closed", { sessionId: session.sessionId });
      }
    };
  }, [session.sessionId]);

  const toggleRecord = () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    if (!stream) return;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: pickVideoMime() });
    } catch {
      return;
    }
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    recorder.onstop = () => {
      const mimeType = recorder.mimeType || "video/webm";
      const blob = new Blob(chunksRef.current, { type: mimeType });
      chunksRef.current = [];
      setRecording(false);
      if (blob.size === 0) return;
      setUploading(true);
      void uploadRecording({
        sessionId: session.sessionId,
        blob,
        durationMs: Date.now() - startedMs,
        capturedAt: startedAt
      })
        .catch(() => {
          /* surfaced via the Recordings section absence; non-fatal here */
        })
        .finally(() => setUploading(false));
    };
    recorderRef.current = recorder;
    recorder.start(1000);
    setRecording(true);
  };

  // Drop this camera off every watcher's wall the moment it's disconnected;
  // track pause/resume so the tile shows the right state while it stays up.
  useRealtimeChannel(channels.captureSessionState(orgId, session.sessionId), {
    historyLimit: 1,
    onEvent: (event) => {
      if (event.type === "capture.session.disconnected") onRemove();
      else if (event.type === "capture.session.paused") setPaused(true);
      else if (event.type === "capture.session.resumed") setPaused(false);
    }
  });

  const disconnect = () => {
    // Fire the server disconnect FIRST so the request runs independent of this
    // tile's lifecycle, THEN drop the tile. Removing the tile unmounts this
    // component; if the network call were tied to a startTransition it could be
    // dropped mid-flight, leaving live_disconnected_at unset and the field app
    // never told. The realtime event removes the tile for the other watchers.
    void setSessionConnectionAction(session.sessionId, false).catch(() => {
      // Best-effort: if the call didn't take, the wall's reconcile poll re-adds
      // the still-connected camera within ~10s.
    });
    onRemove();
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (el && el.srcObject !== stream) {
      el.srcObject = stream;
    }
  }, [stream]);

  const badge = statusBadge(paused, connectionState, stream != null);

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

        {/* Connecting state (while waiting for media, unless paused). */}
        {!stream && !paused ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs font-medium text-base-100/70">
            {connectionLabel(connectionState)}
          </div>
        ) : null}

        {/* Operator-paused overlay. pointer-events-none so the Disconnect /
            Record controls (z-20) and the focus toggle (z-10) stay usable. */}
        {paused ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-neutral/60">
            <span className="rounded-full bg-warning/90 px-3 py-1 text-xs font-semibold text-warning-content shadow-lg">
              Operator paused the live feed
            </span>
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

        {/* Disconnect + Record, top-left — mirror the status pill. */}
        <div className="absolute left-2 top-2 z-20 flex items-center gap-1.5">
            <button
              type="button"
              onClick={disconnect}
              aria-label="Disconnect camera"
              title="Disconnect camera"
              className="inline-flex items-center justify-center rounded-md bg-neutral/45 p-1.5 text-base-100/80 backdrop-blur-sm transition-colors hover:bg-error/80 hover:text-error-content disabled:opacity-50"
            >
              <PowerIcon />
            </button>
            {stream ? (
              <button
                type="button"
                onClick={toggleRecord}
                disabled={uploading}
                aria-label={recording ? "Stop recording" : "Record stream"}
                title={
                  uploading
                    ? "Saving recording…"
                    : recording
                      ? "Stop recording"
                      : "Record stream"
                }
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold backdrop-blur-sm transition-colors disabled:opacity-50 ${
                  recording
                    ? "bg-error/85 text-error-content"
                    : "bg-neutral/45 text-base-100/80 hover:bg-neutral/70"
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 ${
                    recording
                      ? "animate-pulse rounded-sm bg-error-content"
                      : "rounded-full bg-error"
                  }`}
                />
                {uploading ? "Saving…" : recording ? "Stop" : "Rec"}
              </button>
            ) : null}
        </div>

        {/* Device label — non-interactive, clicks fall through to focus. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-neutral/90 via-neutral/40 to-transparent px-3 pb-2 pt-8">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-base-100">
              {session.deviceName}
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
  paused: boolean,
  connectionState: RTCPeerConnectionState | "idle",
  hasStream: boolean
): { tone: Tone; label: string } {
  if (paused) return { tone: "muted", label: "Paused" };
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

function pickVideoMime(): string {
  const candidates = [
    "video/mp4;codecs=h264",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm"
  ];
  for (const candidate of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(candidate)
    ) {
      return candidate;
    }
  }
  return "video/webm";
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

