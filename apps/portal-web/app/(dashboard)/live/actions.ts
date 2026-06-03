"use server";

import {
  acceptLiveRequest,
  finalizeCapture,
  listLiveSessions,
  rejectLiveRequest,
  reserveCapture,
  setSessionConnection,
  type LiveSessionSummary,
  type ReserveCaptureResult
} from "../../../lib/api";

// Current live roster — polled by the wall to drop cameras that stopped
// streaming (their session goes stale server-side) and to self-heal any missed
// realtime add/remove events.
export async function listLiveSessionsAction(): Promise<LiveSessionSummary[]> {
  const res = await listLiveSessions();
  return res.sessions;
}

// Accept a phone's go-live request: spawns a live session (the wall lights up via
// the capture.session.started fanout) and grants the phone permission to publish.
// The request panel drops the row off the live.request.accepted realtime event,
// so no path revalidation is needed.
export async function acceptLiveRequestAction(
  requestId: string
): Promise<{ requestId: string; sessionId: string }> {
  return acceptLiveRequest(requestId);
}

export async function rejectLiveRequestAction(
  requestId: string
): Promise<{ requestId: string; status: string }> {
  return rejectLiveRequest(requestId);
}

// Authoritative disconnect/reconnect of a live camera. Every watcher's tile
// flips off the capture.session.disconnected/reconnected realtime event.
export async function setSessionConnectionAction(
  sessionId: string,
  connected: boolean
): Promise<void> {
  await setSessionConnection(sessionId, connected);
}

// --- Portal-side session recording ----------------------------------------
// A watcher records the live WebRTC stream in-browser. The blob upload itself
// (PUT to the signed Storage URL) happens client-side; these two actions bracket
// it with the server-authenticated reserve + finalize. The recording lands as a
// kind='session_recording', source='portal_recording' video capture; finalize
// skips analysis for video.

export async function reserveRecordingAction(input: {
  sessionId: string;
  mimeType: string;
  sizeBytes: number;
  capturedAt: string;
  videoDurationMs: number;
}): Promise<ReserveCaptureResult> {
  return reserveCapture({
    sessionId: input.sessionId,
    source: "portal_recording",
    mediaType: "video",
    kind: "session_recording",
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    capturedAt: input.capturedAt,
    videoDurationMs: input.videoDurationMs
  });
}

export async function finalizeRecordingAction(
  captureId: string,
  actualSizeBytes: number
): Promise<void> {
  await finalizeCapture(captureId, { actualSizeBytes });
}
