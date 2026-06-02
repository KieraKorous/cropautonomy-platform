"use server";

import {
  acceptLiveRequest,
  rejectLiveRequest,
  setSessionConnection
} from "../../../lib/api";

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
