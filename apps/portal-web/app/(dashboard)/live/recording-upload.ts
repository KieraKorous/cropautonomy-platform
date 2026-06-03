"use client";

import { reserveRecordingAction, finalizeRecordingAction } from "./actions";

// Upload a watcher-recorded live-session clip as a video capture. Mirrors the
// field PWA's reserve → PUT → finalize flow (apps/field-web/src/lib/upload.ts),
// but the reserve + finalize legs run as server actions (server-side Clerk auth)
// while the binary PUT to the signed Storage URL happens here in the browser.
export async function uploadRecording(input: {
  sessionId: string;
  blob: Blob;
  durationMs: number;
  capturedAt: string;
}): Promise<void> {
  const mimeType = input.blob.type || "video/webm";

  const reservation = await reserveRecordingAction({
    sessionId: input.sessionId,
    mimeType,
    sizeBytes: input.blob.size,
    capturedAt: input.capturedAt,
    videoDurationMs: input.durationMs
  });

  const response = await fetch(reservation.uploadUrl, {
    method: "PUT",
    headers: {
      ...reservation.uploadHeaders,
      authorization: `Bearer ${reservation.uploadToken}`
    },
    body: input.blob
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Storage PUT failed: ${response.status} ${detail}`);
  }

  await finalizeRecordingAction(reservation.captureId, input.blob.size);
}
