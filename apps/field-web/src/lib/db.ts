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
  const full: QueuedCaptureRecord = {
    ...record,
    status: "queued",
    attempts: 0,
    createdAt: now,
    updatedAt: now
  };
  const db = await getDb();
  await db.put("captures", full);
  return full;
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

export async function setSessionState<T>(key: string, value: T): Promise<void> {
  const db = await getDb();
  await db.put("sessionState", { id: key, value, updatedAt: Date.now() });
}

export async function getSessionState<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const row = await db.get("sessionState", key);
  return (row?.value as T | undefined) ?? null;
}
