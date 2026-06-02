import { openDB, type DBSchema, type IDBPDatabase } from "idb";

// IndexedDB schema for the offline capture queue. The blob is held alongside
// the metadata so a reload after offline capture survives without rebuilding
// state from anywhere else.

export type QueuedCaptureStatus =
  | "queued"
  | "reserving"
  | "uploading"
  | "finalizing"
  | "synced"
  | "failed";

export interface QueuedCaptureRecord {
  id: string; // local uuid, used as primary key
  remoteCaptureId?: string; // server captures.id after reserve
  sessionId?: string;
  orgId?: string;
  farmId?: string;
  fieldId?: string;
  cropTypeId?: string;
  source: "field_capture_pwa";
  mediaType: "photo" | "burst_frame" | "video";
  burstIndex?: number;
  videoDurationMs?: number;
  mimeType: string;
  sizeBytes: number;
  capturedAt: string;
  location?: { lat: number; lng: number; accuracyMeters?: number };
  headingDegrees?: number;
  thumbnailDataUrl?: string;
  status: QueuedCaptureStatus;
  attempts: number;
  lastError?: string;
  uploadUrl?: string;
  uploadToken?: string;
  uploadHeaders?: Record<string, string>;
  storagePath?: string;
  bytesUploaded?: number;
  blob: Blob;
  createdAt: number; // epoch ms
  updatedAt: number;
}

interface FieldDB extends DBSchema {
  captures: {
    key: string;
    value: QueuedCaptureRecord;
    indexes: {
      "by-status": QueuedCaptureStatus;
      "by-created": number;
    };
  };
  sessionState: {
    key: string;
    value: { id: string; value: unknown; updatedAt: number };
  };
}

const DB_NAME = "gaia-field";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<FieldDB>> | null = null;

function getDb(): Promise<IDBPDatabase<FieldDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FieldDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const captures = db.createObjectStore("captures", { keyPath: "id" });
        captures.createIndex("by-status", "status");
        captures.createIndex("by-created", "createdAt");
        db.createObjectStore("sessionState", { keyPath: "id" });
      }
    });
  }
  return dbPromise;
}

export async function enqueueCapture(
  record: Omit<QueuedCaptureRecord, "status" | "attempts" | "createdAt" | "updatedAt">
): Promise<QueuedCaptureRecord> {
  const now = Date.now();
  // iOS Safari's IndexedDB stores Blobs as opaque references into a SQLite-backed
  // BlobStore; camera/MediaRecorder/File handles can be revoked by the OS, which
  // surfaces later as "error preparing Blob/File data to be stored in object store"
  // on put() or "Load failed" on fetch(). Materialize to a self-contained Blob
  // backed by an in-memory ArrayBuffer before persisting.
  const detachedBlob = await detachBlob(record.blob);
  const full: QueuedCaptureRecord = {
    ...record,
    blob: detachedBlob,
    status: "queued",
    attempts: 0,
    createdAt: now,
    updatedAt: now
  };
  const db = await getDb();
  await db.put("captures", full);
  return full;
}

async function detachBlob(blob: Blob): Promise<Blob> {
  const buffer = await blob.arrayBuffer();
  return new Blob([buffer], { type: blob.type });
}

export async function patchCapture(
  id: string,
  patch: Partial<Omit<QueuedCaptureRecord, "id" | "blob">>
): Promise<QueuedCaptureRecord | null> {
  const db = await getDb();
  const current = await db.get("captures", id);
  if (!current) return null;
  const next: QueuedCaptureRecord = {
    ...current,
    ...patch,
    updatedAt: Date.now()
  };
  await db.put("captures", next);
  return next;
}

export async function deleteCapture(id: string): Promise<void> {
  const db = await getDb();
  await db.delete("captures", id);
}

export async function listQueued(): Promise<QueuedCaptureRecord[]> {
  const db = await getDb();
  return (await db.getAllFromIndex("captures", "by-created")).reverse();
}

export async function listPendingForUpload(): Promise<QueuedCaptureRecord[]> {
  const db = await getDb();
  // Anything not synced and not currently being acted on.
  const all = await db.getAll("captures");
  return all
    .filter((c) => c.status !== "synced")
    .sort((a, b) => a.createdAt - b.createdAt);
}

// Records left in an in-flight status from a previous run (tab close, crash,
// navigation mid-reserve) would otherwise sit forever — drain() only re-enters
// processOne() for records still considered pending. Sweep them at startup:
// pre-reserve work can safely restart from queued; post-reserve work might
// have partial server state, so mark failed and let the user decide.
export async function reapStuckInFlight(staleAfterMs = 30_000): Promise<number> {
  const db = await getDb();
  const all = await db.getAll("captures");
  const now = Date.now();
  let reaped = 0;
  for (const record of all) {
    const inFlight =
      record.status === "reserving" ||
      record.status === "uploading" ||
      record.status === "finalizing";
    if (!inFlight) continue;
    if (now - record.updatedAt < staleAfterMs) continue;
    if (record.status === "reserving" && !record.remoteCaptureId) {
      await db.put("captures", { ...record, status: "queued", updatedAt: now });
    } else {
      await db.put("captures", {
        ...record,
        status: "failed",
        lastError: `Recovered stuck '${record.status}' from previous session.`,
        updatedAt: now
      });
    }
    reaped += 1;
  }
  return reaped;
}

export async function setSessionState<T>(key: string, value: T): Promise<void> {
  const db = await getDb();
  await db.put("sessionState", { id: key, value, updatedAt: Date.now() });
}

export async function getSessionState<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const row = await db.get("sessionState", key);
  return (row?.value as T | undefined) ?? null;
}

// ── Phone-as-camera pairing ────────────────────────────────────────────────
// Stored in the existing sessionState store (no schema bump). The serial is a
// stable client-generated UUID (browsers can't read hardware ids), so the
// devices unique index treats a re-pair of the same phone as idempotent.

export interface PairedDevice {
  deviceId: string;
  orgId: string;
  deviceName: string;
}

const PAIRED_DEVICE_KEY = "paired_device";
const PHONE_SERIAL_KEY = "phone_serial";

export async function getPairedDevice(): Promise<PairedDevice | null> {
  return getSessionState<PairedDevice>(PAIRED_DEVICE_KEY);
}

export async function setPairedDevice(device: PairedDevice | null): Promise<void> {
  await setSessionState(PAIRED_DEVICE_KEY, device);
}

export async function getOrCreatePhoneSerial(): Promise<string> {
  const existing = await getSessionState<string>(PHONE_SERIAL_KEY);
  if (existing) return existing;
  const serial = crypto.randomUUID();
  await setSessionState(PHONE_SERIAL_KEY, serial);
  return serial;
}
