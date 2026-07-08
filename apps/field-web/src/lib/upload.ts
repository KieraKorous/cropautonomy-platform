import * as tus from "tus-js-client";
import { channels } from "@gaia/realtime/channels";
import { publishFromClient } from "@gaia/realtime/client";

import { api } from "./api.js";
import {
  deleteCapture,
  getPairedDevice,
  listPendingForUpload,
  patchCapture,
  reapStuckInFlight,
  type QueuedCaptureRecord
} from "./db.js";
import { env } from "../env.js";

// Drains the IndexedDB queue. Reserve -> upload -> finalize per capture.
// Runs on demand: call kickUploadWorker() after enqueue, when connectivity
// returns, or from the queue page's "retry" button. Re-entrant: only one
// drain loop runs at a time per tab.

let draining = false;
let pendingRequest = false;

export function kickUploadWorker() {
  if (draining) {
    pendingRequest = true;
    return;
  }
  void drain();
}

async function drain() {
  draining = true;
  pendingRequest = false;
  try {
    if (!navigator.onLine) return;
    await reapStuckInFlight();
    let pending = await listPendingForUpload();
    while (pending.length > 0) {
      if (!navigator.onLine) return;
      const next = pending[0];
      try {
        await processOne(next);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await patchCapture(next.id, {
          status: "failed",
          attempts: next.attempts + 1,
          lastError: message
        });
        // Don't keep retrying the same broken item this drain pass.
        // The queue page surfaces a manual retry.
      }
      pending = (await listPendingForUpload()).filter(
        (record) => record.status !== "failed"
      );
    }
  } finally {
    draining = false;
    if (pendingRequest) kickUploadWorker();
  }
}

async function processOne(record: QueuedCaptureRecord) {
  // 1) reserve (if not yet reserved)
  if (!record.remoteCaptureId) {
    await patchCapture(record.id, { status: "reserving" });
    // Attribute the capture to this phone's paired device so the portal can show
    // it as in-use — including capture-only sessions, which have no
    // started_by_device_id of their own.
    const pairedDevice = await getPairedDevice();
    const reservation = await api.reserveCapture({
      farmId: record.farmId ?? null,
      fieldId: record.fieldId ?? null,
      cropTypeId: record.cropTypeId ?? null,
      sessionId: record.sessionId ?? null,
      teamId: record.teamId ?? null,
      scoutTaskId: record.scoutTaskId ?? null,
      deviceId: pairedDevice?.deviceId ?? null,
      source: record.source,
      mediaType: record.mediaType,
      kind: record.kind ?? "observation",
      burstIndex: record.burstIndex ?? null,
      videoDurationMs: record.videoDurationMs ?? null,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      capturedAt: record.capturedAt,
      location: record.location ?? null,
      headingDegrees: record.headingDegrees ?? null
    });
    record = (await patchCapture(record.id, {
      remoteCaptureId: reservation.captureId,
      storagePath: reservation.storagePath,
      uploadUrl: reservation.uploadUrl,
      uploadToken: reservation.uploadToken,
      uploadHeaders: reservation.uploadHeaders,
      status: "uploading"
    }))!;

    // Publish capture.recorded as soon as the captureId exists so the portal
    // Live page can show the new capture even while the binary is still
    // uploading. capture.recorded only goes out if we know the session id.
    if (record.sessionId && record.orgId) {
      await safePublishCaptureRecorded(record);
    }
  }

  // 2) upload the binary
  await uploadBinary(record);

  // 3) finalize
  await patchCapture(record.id, { status: "finalizing" });
  await api.finalizeCapture(record.remoteCaptureId!, {
    actualSizeBytes: record.sizeBytes,
    thumbnailDataUrl: record.thumbnailDataUrl
  });

  // 4) cleanup local state — keep nothing once the durable record is the truth
  await patchCapture(record.id, { status: "synced", bytesUploaded: record.sizeBytes });
  await deleteCapture(record.id);
}

async function uploadBinary(record: QueuedCaptureRecord) {
  if (!record.uploadUrl || !record.storagePath || !record.uploadToken) {
    throw new Error("Upload reservation missing url/token/path.");
  }

  // v0: PUT direct to the signed upload URL. Resumable TUS lands once the
  // Supabase Storage policy is updated to accept the Clerk-bridged JWT.
  // For now PUT works because createSignedUploadUrl issues a one-shot token
  // good for a single PUT.
  const response = await fetch(record.uploadUrl, {
    method: "PUT",
    headers: {
      ...record.uploadHeaders,
      authorization: `Bearer ${record.uploadToken}`
    },
    body: record.blob
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Storage PUT failed: ${response.status} ${detail}`);
  }
  await patchCapture(record.id, { bytesUploaded: record.sizeBytes });
}

// Kept here even though v0 uses PUT — when the JWT bridge lands and we move to
// TUS-resumable, swap uploadBinary() to call this. Imports stay valid.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function uploadBinaryTus(record: QueuedCaptureRecord): Promise<void> {
  return await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(record.blob, {
      endpoint: `${env.supabase.url}/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 6000, 12000, 30000],
      headers: {
        authorization: `Bearer ${record.uploadToken}`,
        "x-upsert": "false"
      },
      metadata: {
        bucketName: "scan-originals",
        objectName: record.storagePath!,
        contentType: record.mimeType
      },
      chunkSize: 6 * 1024 * 1024,
      onError: (error) => reject(error),
      onProgress: (bytesUploaded) => {
        void patchCapture(record.id, { bytesUploaded });
      },
      onSuccess: () => resolve()
    });
    upload.start();
  });
}

async function safePublishCaptureRecorded(record: QueuedCaptureRecord) {
  if (!record.sessionId || !record.orgId || !record.remoteCaptureId) return;
  try {
    await publishFromClient(
      channels.captureSessionState(record.orgId, record.sessionId),
      {
        type: "capture.recorded",
        version: 1,
        payload: {
          sessionId: record.sessionId,
          captureId: record.remoteCaptureId,
          mediaType: record.mediaType,
          capturedAt: record.capturedAt,
          location: record.location,
          thumbnailDataUrl: record.thumbnailDataUrl
        }
      }
    );
  } catch (error) {
    // Realtime publish failure is non-fatal — the durable record arrives via
    // finalize. Portal viewers will see the capture once analysis enqueues.
    // eslint-disable-next-line no-console
    console.warn("[upload] capture.recorded publish failed", error);
  }
}

// Re-trigger drain on connectivity change.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => kickUploadWorker());
}
