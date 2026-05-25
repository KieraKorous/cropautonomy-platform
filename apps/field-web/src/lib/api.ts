import { env } from "../env.js";
import { getApiToken } from "./auth.js";

export interface ReserveCaptureRequest {
  farmId?: string | null;
  fieldId?: string | null;
  zoneId?: string | null;
  cropTypeId?: string | null;
  sessionId?: string | null;
  source: "field_capture_pwa";
  mediaType: "photo" | "burst_frame" | "video";
  burstIndex?: number | null;
  videoDurationMs?: number | null;
  mimeType: string;
  sizeBytes: number;
  checksumSha256?: string | null;
  capturedAt: string;
  location?: { lat: number; lng: number; accuracyMeters?: number } | null;
  headingDegrees?: number | null;
  metadata?: Record<string, unknown>;
}

export interface ReserveCaptureResponse {
  captureId: string;
  storagePath: string;
  uploadUrl: string;
  uploadToken: string;
  uploadMethod: "put" | "tus";
  uploadHeaders: Record<string, string>;
  expiresAt: string;
}

export interface FinalizeCaptureRequest {
  actualSizeBytes: number;
  actualChecksumSha256?: string;
  thumbnailDataUrl?: string;
}

export interface SessionStartRequest {
  farmId?: string | null;
  fieldId?: string | null;
  cropTypeId?: string | null;
  initialLocation?: { lat: number; lng: number; accuracyMeters?: number } | null;
  plannedDurationMinutes?: number;
}

export interface SessionStartResponse {
  sessionId: string;
  orgId: string;
  startedAt: string;
}

export interface FieldRecord {
  id: string;
  farmId: string;
  name: string;
  areaAcres: number | null;
  // GeoJSON Polygon { type: "Polygon", coordinates: [[[lng, lat], …]] }
  boundary: { type: "Polygon"; coordinates: number[][][] } | null;
  // GeoJSON Point { type: "Point", coordinates: [lng, lat] }
  centroid: { type: "Point"; coordinates: [number, number] } | null;
}

export interface ListFieldsResponse {
  fields: FieldRecord[];
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${env.apiBase}${path}`;
  const token = await getApiToken();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...((init.headers as Record<string, string> | undefined) ?? {})
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(url, { ...init, headers });

  if (!response.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await response.json());
    } catch {
      detail = await response.text().catch(() => "");
    }
    throw new Error(`API ${response.status} ${path}: ${detail || response.statusText}`);
  }
  return (await response.json()) as T;
}

export const api = {
  reserveCapture: (body: ReserveCaptureRequest) =>
    call<ReserveCaptureResponse>("/v1/captures", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  finalizeCapture: (id: string, body: FinalizeCaptureRequest) =>
    call<{ captureId: string; analysisJobId: string; status: string }>(
      `/v1/captures/${id}/finalize`,
      { method: "POST", body: JSON.stringify(body) }
    ),
  startSession: (body: SessionStartRequest) =>
    call<SessionStartResponse>("/v1/capture-sessions", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  patchSession: (
    id: string,
    action:
      | { action: "pause"; reason?: string }
      | { action: "resume" }
      | { action: "end"; reason?: string }
  ) =>
    call<{ sessionId: string; action: string }>(`/v1/capture-sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(action)
    }),
  listFields: () => call<ListFieldsResponse>("/v1/fields", { method: "GET" })
};
